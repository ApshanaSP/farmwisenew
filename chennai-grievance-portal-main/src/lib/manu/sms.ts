/**
 * SMS to the person who wrote a Manu: one when it is approved, one when the work on it ends. It works like EMAIL_MODE: in test mode (the
 * default) the message goes to the team inbox and no phone receives anything; SMS_MODE=live sends real SMS through MSG91, whose templates
 * hold the wording approved on DLT. Each message goes once. A failed send never stops an approval or a closing; the job sweep tries it
 * again. Test copies of the site never send.
 */
import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import { addHours, istNow } from "./clean";
import { manuDeptLabel, manuDeptTa, type SmsNote } from "./constants";
import { RESOLVED_STATUSES } from "@/lib/constants";

type Row = RowDataPacket & Record<string, any>;
export type SmsKind = "received" | "closed";
export type SmsResult = "done" | "rejected";
export type SmsMode = "live" | "test" | "off";
type Lang = "en" | "ta";

/** The exact wording to register on DLT and in MSG91. Each {#var#} is filled in order: var1, then var2. */
export const SMS_WORDING: Record<SmsKind, Record<Lang, string>> = {
  received: {
    en: "Your petition to the Chennai Collector's Office is registered. Number {#var#}. Sent to {#var#}.",
    ta: "சென்னை மாவட்ட ஆட்சியர் அலுவலகத்தில் உங்கள் மனு பதிவு செய்யப்பட்டது. எண் {#var#}. அனுப்பப்பட்ட துறை {#var#}."
  },
  closed: {
    en: "Your petition number {#var#} at the Chennai Collector's Office: {#var#}.",
    ta: "சென்னை மாவட்ட ஆட்சியர் அலுவலகத்தில் உங்கள் மனு எண் {#var#}: {#var#}."
  }
};

/** What fills the second {#var#} of the closing message. DLT allows 30 characters a variable. */
export const SMS_RESULT: Record<SmsResult, Record<Lang, string>> = {
  done: { en: "the work is completed", ta: "பணி முடிக்கப்பட்டது" },
  rejected: { en: "it could not be taken up", ta: "ஏற்றுக்கொள்ள இயலவில்லை" }
};

const MOBILE = /^[6-9]\d{9}$/;
const MAX_TRIES = 4;
const RETRY_AFTER_HOURS = 0.25;

/**
 * How long an approval or a closing waits for its message before it answers (the send goes on behind it), and how long one send may take
 * before it is given up. An approval used to wait on the mail with no limit at all (QA pass 6, P5-023).
 */
export const SMS_LIMITS = { inlineWaitMs: 5_000, sendMs: 20_000 };

/**
 * The provider may already have taken the message: the request went out and no answer came in time, the connection broke while it
 * answered, or it said 200 in a form we cannot read. Such a message is not sent again by the sweep, since the writer would get it twice
 * (QA pass 6, P5-022); the desk shows it as not confirmed.
 */
class MaybeSent extends Error {}
const AFTER_SENDING = new Set(["ECONNRESET", "UND_ERR_SOCKET", "EPIPE"]);
/**
 * Node's fetch (undici) gives up a connection it could not open after 10 s with UND_ERR_CONNECT_TIMEOUT (DNS, TCP and TLS included): such a
 * send never reached the provider and is tried again. The whole send is given up only after that, so a timeout of our own means the request
 * was connected and may have been taken. The old 8 s limit fired first, so a provider that was down, dropped SYNs or slow DNS looked like a
 * send that went out, 'unsure', and was never tried again (reviewer1-06).
 */
const FETCH_CONNECT_MS = 10_000;
export const MSG91_ABORT_MS = FETCH_CONNECT_MS + 5_000;

/**
 * The work, or MaybeSent when it has not answered in `ms`: the work goes on behind the race and may still finish. A plain Error here made a
 * team-inbox mail that the server took after the limit 'failed', and the sweep mailed it again (reviewer1-03).
 */
function withLimit<T>(work: Promise<T>, ms: number, why: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new MaybeSent(why)), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
const env = (name: string) => (process.env[name] ?? "").trim();
const templateOf = (kind: SmsKind, lang: Lang) => env(`MSG91_TEMPLATE_${kind.toUpperCase()}_${lang.toUpperCase()}`);

const msg91Ready = () => !!env("MSG91_AUTH_KEY") && !!env("MSG91_SENDER") && (["received", "closed"] as const).every((k) => (["en", "ta"] as const).every((l) => !!templateOf(k, l)));

/** How a message goes out now: a real SMS, a copy to the team inbox, or not at all. */
export function smsMode(): SmsMode {
  if (process.env.AWS_STORE_DRY_RUN === "1") return "off";
  // "Test copies of the site never send" means every copy that does not save to the AWS store (lib/aws/store.ts: only AWS_STORE_SAVE=1
  // saves), not only a dry run: a teammate's copy would text people about complaint numbers that are never saved (QA pass 5, P5-012)
  if (process.env.DATA_BACKEND === "aws" && process.env.AWS_STORE_SAVE !== "1") return "off";
  if (env("SMS_MODE") === "off") return "off";
  if (env("SMS_MODE") === "live") return msg91Ready() ? "live" : "off";
  return isSmtpConfigured() && env("EMAIL_SANDBOX_TO") ? "test" : "off";
}

const htmlSafe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Test mode: the exact message, to the team inbox. */
async function viaTeamInbox(mobile: string, text: string): Promise<void> {
  const html = `<p><b>Test SMS. Nothing was sent to this phone.</b> In live mode this goes to ${mobile}.</p><p style="font-size:16px;padding:12px;background:#f2f4f3;border-radius:8px">${htmlSafe(text)}</p>`;
  const r = await withLimit(sendMail(env("EMAIL_SANDBOX_TO"), `[Test SMS] to ${mobile}`, html), SMS_LIMITS.sendMs, "The team inbox did not answer in time; the mail may still arrive.");
  if (!r.ok) throw new Error(r.reason === "send_failed" ? r.detail : "Email is not set up.");
}

async function viaMsg91(mobile: string, template: string, vars: [string, string]): Promise<void> {
  let r: Response;
  try {
    r = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: env("MSG91_AUTH_KEY"), "Content-Type": "application/json" },
      // MSG91's current pages call this template_id and its older API page flow_id, so both are sent
      body: JSON.stringify({ template_id: template, flow_id: template, sender: env("MSG91_SENDER"), short_url: "0", recipients: [{ mobiles: `91${mobile}`, var1: vars[0], var2: vars[1] }] }),
      signal: AbortSignal.timeout(Math.min(MSG91_ABORT_MS, SMS_LIMITS.sendMs))
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: unknown } };
    // no answer in time, or the line broke after the request went out: the provider may have it. A refused or unknown host never got it.
    if (err.name === "TimeoutError" || err.name === "AbortError" || AFTER_SENDING.has(String(err.cause?.code ?? ""))) throw new MaybeSent(`No answer from the SMS service: ${err.message}`);
    throw err;
  }
  const j = (await r.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (r.ok && j?.type === "success") return;
  // a 2xx we cannot read is not a refusal: only the provider's own error answer, or an error status, says it was not taken
  if (r.ok && j?.type !== "error") throw new MaybeSent(`HTTP ${r.status}, an answer the SMS service does not normally give`);
  throw new Error(String(j?.message ?? `HTTP ${r.status}`));
}

async function deliver(code: string, kind: SmsKind, p: Row, result: SmsResult | null): Promise<void> {
  const lang: Lang = p.language === "en" ? "en" : "ta";
  // a Tamil message names the department in Tamil (P5-025)
  const second = kind === "received" ? (lang === "ta" ? manuDeptTa(p.dept_code) : manuDeptLabel(p.dept_code)) : SMS_RESULT[result ?? "done"][lang];
  const now = istNow();
  const live = smsMode() === "live";
  // the number a live send really went to is recorded with it, so the desk never names the petitioner's phone for a test number (P5-024)
  const testNumber = live ? env("SMS_TEST_NUMBER") : "";
  try {
    if (live) await viaMsg91(testNumber || String(p.mobile), templateOf(kind, lang), [code, second]);
    else await viaTeamInbox(String(p.mobile), SMS_WORDING[kind][lang].replace("{#var#}", () => code).replace("{#var#}", () => second));
    const status = !live ? "test" : testNumber ? "testnumber" : "sent";
    await pool.query(`UPDATE petition_sms SET status = ?, detail = ?, attempts = attempts + 1, tried_at = ?, sent_at = ? WHERE complaint_code = ? AND kind = ?`,
      [status, testNumber ? `Sent to the test number ending ${testNumber.slice(-4)}` : null, now, now, code, kind]);
  } catch (e) {
    await pool.query(`UPDATE petition_sms SET status = ?, detail = ?, attempts = attempts + 1, tried_at = ? WHERE complaint_code = ? AND kind = ?`,
      [e instanceof MaybeSent ? "unsure" : "failed", (e as Error).message.slice(0, 200), now, code, kind]);
  }
}

/** What happened to a petition's first message, for the desk. */
export async function smsNote(code: string): Promise<SmsNote> {
  try {
    const [rows] = await pool.query<Row[]>(`SELECT p.mobile, s.status, s.detail FROM petitions p LEFT JOIN petition_sms s ON s.complaint_code = p.complaint_code AND s.kind = 'received' WHERE p.complaint_code = ? LIMIT 1`, [code]);
    const mobile = String(rows[0]?.mobile ?? "");
    if (!MOBILE.test(mobile)) return { state: "none", last4: null };
    const status = String(rows[0].status ?? "");
    if (status === "testnumber") return { state: "testnumber", last4: String(rows[0].detail ?? "").match(/(\d{4})\s*$/)?.[1] ?? null };
    // a message on its way is "sending", not "failed": the approval no longer waits for it (P5-023)
    // no row at all, with SMS on: the approval stopped before it queued the message; the sweep queues it (reviewer1-09). It was "not set up".
    if (!status) return { state: smsMode() === "off" ? "off" : "sending", last4: mobile.slice(-4) };
    const state = ({ sent: "sent", test: "test", unsure: "unsure", failed: "failed", waiting: "sending", sending: "sending" } as const)[status as "sent"] ?? "off";
    return { state, last4: mobile.slice(-4) };
  } catch {
    return { state: "off", last4: null };
  }
}

/**
 * Sends one of a petition's two messages, once. Never throws. Does nothing for a complaint that did not come from a Manu. Waits at most
 * SMS_LIMITS.inlineWaitMs for the send; a slower send goes on behind the caller and records its own outcome.
 */
export async function sendPetitionSms(code: string, kind: SmsKind, result: SmsResult | null = null): Promise<void> {
  try {
    const [rows] = await pool.query<Row[]>(`SELECT mobile, language, dept_code FROM petitions WHERE complaint_code = ? LIMIT 1`, [code]);
    const p = rows[0];
    if (!p || !MOBILE.test(String(p.mobile ?? ""))) return;
    const now = istNow();
    const ready = smsMode() !== "off";
    // 'sending' from the start: a fresh send in flight is never picked up by another process's sweep (that waits an hour for 'sending')
    const [ins] = await pool.query<ResultSetHeader>(`INSERT IGNORE INTO petition_sms (complaint_code, kind, status, result, detail, tried_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, kind, ready ? "sending" : "off", result, ready ? null : "The SMS service is not set up.", now, now]);
    if (!ready || !ins.affectedRows) return;
    const sending = deliver(code, kind, p, result).catch((e) => console.warn(`[manu] SMS for ${code} not recorded: ${(e as Error).message}`));
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([sending, new Promise<void>((done) => { timer = setTimeout(done, SMS_LIMITS.inlineWaitMs); })]).finally(() => clearTimeout(timer));
  } catch (e) {
    console.warn(`[manu] SMS for ${code} not sent: ${(e as Error).message}`);
  }
}

let retrying = false;

/** Job sweep: a message that failed gets another try every 15 minutes, up to four tries in all. */
export async function retryFailedSms(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    const due = addHours(istNow(), -RETRY_AFTER_HOURS);
    // a send cut off half way (the process stopped) is left 'sending'. An hour on (a send gives up after SMS_LIMITS.sendMs) it is
    // 'unsure', not sent again: the request may have reached the provider before the stop, and the writer would get it twice (P6-010).
    // Done even while SMS is off, or the desk says "sending" for good (P6-026); this sends nothing.
    const stuck = addHours(istNow(), -1);
    await pool.query(`UPDATE petition_sms SET status = 'unsure', detail = 'The server stopped while this SMS was being sent; it may have gone. It is not sent again.'
      WHERE status = 'sending' AND tried_at <= ?`, [stuck]);
    if (smsMode() === "off") return;
    // a petition filed in the last day whose 'registered' SMS was never queued (the server stopped between the approval's commit and the
    // send) gets it now: the row was only made at the end of the approval, so such a petitioner was never texted (reviewer1-09). Only the
    // last day: switching SMS on must not text every old petitioner.
    const [orphans] = await pool.query<Row[]>(`SELECT p.complaint_code, p.mobile FROM petitions p LEFT JOIN petition_sms s ON s.complaint_code = p.complaint_code AND s.kind = 'received'
      WHERE p.status = 'filed' AND p.complaint_code IS NOT NULL AND s.id IS NULL AND p.filed_at >= ? AND p.filed_at <= ? ORDER BY p.filed_at LIMIT 20`, [addHours(istNow(), -24), due]);
    for (const o of orphans)
      if (MOBILE.test(String(o.mobile ?? "")))
        await pool.query(`INSERT IGNORE INTO petition_sms (complaint_code, kind, status, tried_at, created_at) VALUES (?, 'received', 'waiting', ?, ?)`, [o.complaint_code, due, istNow()]);
    const CLOSED = ["Rejected", ...RESOLVED_STATUSES];
    // a closing message for a complaint that is open again is not picked at all, so twenty of them cannot hold up every newer message (the reviewer)
    const [rows] = await pool.query<Row[]>(
      `SELECT s.complaint_code, s.kind, s.result, p.mobile, p.language, p.dept_code, c.status AS complaint_status FROM petition_sms s JOIN petitions p ON p.complaint_code = s.complaint_code
        LEFT JOIN complaints c ON c.complaint_code = s.complaint_code
        WHERE (s.status IN ('failed', 'waiting') AND s.tried_at <= ? OR s.status = 'sending' AND s.tried_at <= ?) AND s.attempts < ?
          AND (s.kind <> 'closed' OR c.status IN (?, ?, ?)) ORDER BY s.id LIMIT 20`, [due, stuck, MAX_TRIES, ...CLOSED]);
    for (const r of rows) {
      const kind = r.kind as SmsKind;
      // a closing message says what the complaint is NOW: a failed "could not be taken up" retried after the case was reopened and done
      // said the wrong thing; while it is open again, it waits (QA pass 5, P5-012)
      let result = (r.result ?? null) as SmsResult | null;
      if (kind === "closed") {
        const st = String(r.complaint_status ?? "");
        result = st === "Rejected" ? "rejected" : (RESOLVED_STATUSES as readonly string[]).includes(st) ? "done" : null;
        if (!result) continue;
      }
      // claim the row first: two server processes (or two copies on one store) each ran this sweep and both sent the same message, since
      // the in-memory flag only holds inside one process (QA pass 5, P5-012)
      const [claim] = await pool.query<ResultSetHeader>(
        `UPDATE petition_sms SET status = 'sending', result = ?, tried_at = ? WHERE complaint_code = ? AND kind = ? AND attempts < ?
           AND (status IN ('failed', 'waiting') AND tried_at <= ? OR status = 'sending' AND tried_at <= ?)`,
        [kind === "closed" ? result : r.result ?? null, istNow(), r.complaint_code, kind, MAX_TRIES, due, stuck]);
      if (!claim.affectedRows) continue;
      await deliver(String(r.complaint_code), kind, r, result);
    }
  } catch (e) {
    console.warn(`[manu] SMS retry skipped: ${(e as Error).message}`);
  } finally {
    retrying = false;
  }
}
