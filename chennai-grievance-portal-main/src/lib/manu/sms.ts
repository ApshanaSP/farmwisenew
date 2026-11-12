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
import { manuDeptLabel, type SmsNote } from "./constants";
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
  const r = await sendMail(env("EMAIL_SANDBOX_TO"), `[Test SMS] to ${mobile}`, html);
  if (!r.ok) throw new Error(r.reason === "send_failed" ? r.detail : "Email is not set up.");
}

async function viaMsg91(mobile: string, template: string, vars: [string, string]): Promise<void> {
  const r = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { authkey: env("MSG91_AUTH_KEY"), "Content-Type": "application/json" },
    // MSG91's current pages call this template_id and its older API page flow_id, so both are sent
    body: JSON.stringify({ template_id: template, flow_id: template, sender: env("MSG91_SENDER"), short_url: "0", recipients: [{ mobiles: `91${mobile}`, var1: vars[0], var2: vars[1] }] }),
    signal: AbortSignal.timeout(8_000)
  });
  const j = (await r.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!r.ok || j?.type !== "success") throw new Error(String(j?.message ?? `HTTP ${r.status}`));
}

async function deliver(code: string, kind: SmsKind, p: Row, result: SmsResult | null): Promise<void> {
  const lang: Lang = p.language === "en" ? "en" : "ta";
  const second = kind === "received" ? manuDeptLabel(p.dept_code) : SMS_RESULT[result ?? "done"][lang];
  const now = istNow();
  const live = smsMode() === "live";
  try {
    if (live) await viaMsg91(env("SMS_TEST_NUMBER") || String(p.mobile), templateOf(kind, lang), [code, second]);
    else await viaTeamInbox(String(p.mobile), SMS_WORDING[kind][lang].replace("{#var#}", () => code).replace("{#var#}", () => second));
    await pool.query(`UPDATE petition_sms SET status = ?, detail = NULL, attempts = attempts + 1, tried_at = ?, sent_at = ? WHERE complaint_code = ? AND kind = ?`, [live ? "sent" : "test", now, now, code, kind]);
  } catch (e) {
    await pool.query(`UPDATE petition_sms SET status = 'failed', detail = ?, attempts = attempts + 1, tried_at = ? WHERE complaint_code = ? AND kind = ?`, [(e as Error).message.slice(0, 200), now, code, kind]);
  }
}

/** What happened to a petition's first message, for the desk. */
export async function smsNote(code: string): Promise<SmsNote> {
  try {
    const [rows] = await pool.query<Row[]>(`SELECT p.mobile, s.status FROM petitions p LEFT JOIN petition_sms s ON s.complaint_code = p.complaint_code AND s.kind = 'received' WHERE p.complaint_code = ? LIMIT 1`, [code]);
    const mobile = String(rows[0]?.mobile ?? "");
    if (!MOBILE.test(mobile)) return { state: "none", last4: null };
    const status = rows[0].status;
    return { state: status === "sent" ? "sent" : status === "test" ? "test" : status === "failed" || status === "waiting" || status === "sending" ? "failed" : "off", last4: mobile.slice(-4) };
  } catch {
    return { state: "off", last4: null };
  }
}

/** Sends one of a petition's two messages, once. Never throws. Does nothing for a complaint that did not come from a Manu. */
export async function sendPetitionSms(code: string, kind: SmsKind, result: SmsResult | null = null): Promise<void> {
  try {
    const [rows] = await pool.query<Row[]>(`SELECT mobile, language, dept_code FROM petitions WHERE complaint_code = ? LIMIT 1`, [code]);
    const p = rows[0];
    if (!p || !MOBILE.test(String(p.mobile ?? ""))) return;
    const now = istNow();
    const ready = smsMode() !== "off";
    const [ins] = await pool.query<ResultSetHeader>(`INSERT IGNORE INTO petition_sms (complaint_code, kind, status, result, detail, tried_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, kind, ready ? "waiting" : "off", result, ready ? null : "The SMS service is not set up.", now, now]);
    if (ready && ins.affectedRows) await deliver(code, kind, p, result);
  } catch (e) {
    console.warn(`[manu] SMS for ${code} not sent: ${(e as Error).message}`);
  }
}

let retrying = false;

/** Job sweep: a message that failed gets another try every 15 minutes, up to four tries in all. */
export async function retryFailedSms(): Promise<void> {
  if (retrying || smsMode() === "off") return;
  retrying = true;
  try {
    const due = addHours(istNow(), -RETRY_AFTER_HOURS);
    // a send cut off half way (the process stopped) is left 'sending'; after an hour it is due again, since a send gives up after 8 s
    const stuck = addHours(istNow(), -1);
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
