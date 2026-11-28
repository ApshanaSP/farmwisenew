/**
 * News that needs action (the news desk's verdict "act", deskbook.ts), sent to the department that answers for it (28 Nov 2026, the owner:
 * "news that needs action should have an action button to send to the respective department officer; if it is very severe the Collector
 * can also take action, just like incidents").
 *
 * - A story linked to a case is sent ON that case (outbound_emails.incident_id = the case): the officer console flags the case and its
 *   drawer shows the instruction and the report due, as Take action does, for any severity. A severe case also keeps the Collector's own
 *   Take action (the incident pop-up).
 * - A story with no case goes under its own key (followupdept.ts newsKey): the officer console lists it as "News from the Collector",
 *   where the officer writes what was done (lib/officer/newsacts.ts), and the Collector sees that answer on the story.
 *
 * The story is read again on the server, never taken from the browser; the email follows the same delivery rule as every other one
 * (sandbox by default), with a follow-up (24 h for a severe case, else 48 h) and an audit row.
 */
import { z } from "zod";
import intelPool, { ops } from "@/lib/collector/db";
import { incident } from "@/lib/collector/intel";
import { orEmpty } from "@/lib/fallback";
import { sendMail } from "@/lib/mailer";
import { bodyHash, emailRef, stampHtml } from "@/lib/security/stamp";
import type { Factor } from "@/lib/security/factors";
import { newsFollowupSummary, newsKey } from "@/lib/collector/followupdept";
import { delivery, istNow, mailHtml, recipients, tidyEmail, type Delivery, type Recipient } from "@/lib/collector/actionmail";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await intelPool.query(sql, params);
  return rows as Row[];
}

export interface NewsSent { id: number; at: string; status: string; due: string | null; done: boolean; reply: string | null; deptName: string | null }
export interface NewsDraft {
  storyId: string; key: string; incidentId: string | null; sev: string | null; severe: boolean;
  dept: string; deptName: string; title: string; subject: string; body: string; to: Recipient | null; delivery: Delivery;
  /** what was sent before on this story, newest first, with the department's answer */
  sent: NewsSent[];
}

const NewsSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{4,80}$/),
  subject: z.string().trim().min(5).max(160),
  body: z.string().trim().min(40).max(5000)
});

async function newsFacts(storyId: string): Promise<Row | null> {
  const { newsStories, asOf } = await import("@/lib/collector/intel");
  const list = (await newsStories("monthly", await asOf())) as Row[];
  return list.find((s) => s.id === storyId || ((s.docIds as string[] | undefined) ?? []).includes(storyId)) ?? null;
}

/** what was sent before under these keys (a case id or a story's NEWS- key), and whether the department answered */
export async function newsSent(keys: string[]): Promise<Map<string, NewsSent[]>> {
  const out = new Map<string, NewsSent[]>();
  if (!keys.length) return out;
  const [emails, fups, done] = await Promise.all([
    q(`SELECT email_id AS id, incident_id AS k, status, created_at AS at FROM ${ops("outbound_emails")} WHERE incident_id IN (?)`, [keys]).catch(orEmpty("newsaction:emails")),
    q(`SELECT email_id AS id, due_date AS due, status, summary FROM ${ops("followups")} WHERE incident_id IN (?)`, [keys]).catch(orEmpty("newsaction:followups")),
    q(`SELECT record_id AS id, after_value AS v FROM ${ops("audit_log")} WHERE action = 'news:done' AND record_id IN (?)`, [keys]).catch(orEmpty("newsaction:done"))
  ]);
  const fOf = new Map(fups.filter((f) => /\(news send to /.test(String(f.summary ?? ""))).map((f) => [Number(f.id), f]));
  const replyOf = new Map<number, Row>();
  for (const d of done) { try { const v = JSON.parse(String(d.v)); if (v?.email) replyOf.set(Number(v.email), v); } catch { /* not ours */ } }
  for (const e of emails) {
    const f = fOf.get(Number(e.id));
    if (!f) continue; // a Take action or a map send on the same case: not a news send
    const k = String(e.k), r = replyOf.get(Number(e.id));
    (out.get(k) ?? out.set(k, []).get(k)!).push({
      id: Number(e.id), at: String(e.at).replace("T", " ").slice(0, 19), status: String(e.status), due: f.due ? String(f.due).replace("T", " ").slice(0, 19) : null,
      done: f.status === "done", reply: r?.note ? String(r.note) : null, deptName: r?.deptName ? String(r.deptName) : null
    });
  }
  for (const v of out.values()) v.sort((a, b) => b.id - a.id);
  return out;
}

export async function draftNewsAction(storyId: string): Promise<NewsDraft | { error: string; status: number }> {
  const s = await newsFacts(storyId);
  if (!s) return { error: "That story is no longer in the last 30 days of news.", status: 404 };
  const desk = (s.desk as Row | null) ?? null;
  if (desk?.v !== "act") return { error: "Only news that needs action is sent to a department.", status: 409 };
  let dept: string | null = null, deptName = "", sev: string | null = null;
  const incidentId = s.incident ? String(s.incident) : null;
  if (incidentId) {
    const d = await incident(incidentId);
    const i = d?.incident as Row | undefined;
    if (i) { dept = i.dept ? String(i.dept) : null; deptName = String(i.dept_name ?? i.dept ?? ""); sev = i.sev ? String(i.sev) : null; }
  }
  if (!dept && desk?.cat) {
    const [r] = await q(`SELECT c.lead_dept AS code, dp.name FROM ref_categories c LEFT JOIN ref_departments dp ON dp.code = c.lead_dept WHERE c.category_code = ?`, [desk.cat])
      .catch(orEmpty("newsaction:dept"));
    if (r?.code) { dept = String(r.code); deptName = String(r.name ?? r.code); }
  }
  if (!dept) return { error: "The news desk could not tell which department this belongs to.", status: 409 };
  const { to } = await recipients(dept, []);
  const officer = to?.name && to.name !== "Department officer" ? to.name : `Officer, ${deptName}`;
  const severe = sev === "Severe";
  const title = String(desk?.head || s.title).slice(0, 200);
  const outlets = ((s.outletNames as string[] | undefined) ?? []).slice(0, 3);
  const where = s.loc ? ` from ${s.loc}` : "";
  const subject = `${severe ? "Urgent: " : "Action needed: "}${title}`.slice(0, 150);
  const lines = [
    `Dear ${officer},`,
    `${outlets.length ? outlets.join(", ") : "The news"} reported${where}: ${String(desk?.gist || s.title).trim()}`,
    desk?.why ? `Why it needs your department: ${String(desk.why).trim()}` : "",
    incidentId ? `It is on record as case ${incidentId}${sev ? ` (${sev})` : ""}.` : "",
    severe ? "This is a severe matter. Please act on it today: send a team to the place, take the steps your department normally takes, and keep the public informed."
      : "Please look into it, act on it as your department normally does, and report what was done.",
    s.url ? `The report: ${s.url}` : "",
    `Send a short report${severe ? " with site photos" : ""} through the District IQ officer console within ${severe ? "24" : "48"} hours.`,
    "District Collector, Chennai"
  ].filter(Boolean);
  const key = incidentId ?? newsKey(String(s.id));
  const sent = (await newsSent([key])).get(key) ?? [];
  return { storyId: String(s.id), key, incidentId, sev, severe, dept, deptName, title, subject, body: tidyEmail(lines.join("\n\n"), officer), to, delivery: delivery(to?.email ?? null), sent };
}

export async function sendNewsAction(input: unknown, user: string, factor: Factor | null = null): Promise<{ status: number; body: Row }> {
  const parsed = NewsSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Write a subject and a message before sending." } };
  const { id, subject, body } = parsed.data;
  const d = await draftNewsAction(id);
  if ("error" in d) return { status: d.status, body: { error: d.error } };
  const dv = d.delivery;
  const at = istNow(), st = { owner: user, subject, bodyHash: bodyHash(body), at };
  let status = "console_only", error: string | null = null, deliveredTo: string | null = null;
  if (dv.to) {
    const sandbox = dv.mode === "sandbox";
    const html = mailHtml(subject, body, sandbox ? `Sandbox copy. In live mode this goes to ${d.to?.name ?? "the department officer"} <${d.to?.email ?? "no address"}>.` : null, stampHtml(st, factor));
    const r = await sendMail(dv.to, sandbox ? `[Sandbox] ${subject}` : subject, html);
    if (r.ok) { status = "sent"; deliveredTo = dv.to; } else { status = "failed"; error = r.reason === "send_failed" ? r.detail : "not configured"; }
  }
  const [res] = await intelPool.query(
    `INSERT INTO ${ops("outbound_emails")} (owner, to_contact_ids, cc_contact_ids, incident_id, subject, body, language, mode, status,
       approved_at, sent_at, delivered_to, body_hash, error)
     VALUES (?, ?, NULL, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)`,
    [user, JSON.stringify(d.to ? [d.to] : []), d.key, subject, body, dv.mode, status, at, status === "sent" ? istNow() : null, deliveredTo, st.bodyHash, error]
  ) as unknown as [{ insertId: number }];
  const emailId = Number(res?.insertId ?? 0);
  const due = istNow(d.severe ? 24 : 48);
  await intelPool.query(`INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [emailId, d.to?.id ?? 0, d.key, newsFollowupSummary(d.dept), due]);
  await intelPool.query(
    `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'news:send', 'outbound_emails', ?, ?, ?)`,
    [user, String(emailId), JSON.stringify({ story: d.storyId, incident: d.incidentId }),
      JSON.stringify({ email_id: emailId, key: d.key, dept: d.dept, title: d.title, to: d.to?.email ?? null, mode: dv.mode, status, delivered_to: deliveredTo, ref: emailRef(st), confirmed_with: factor })]
  );
  return {
    status: 201,
    body: { id: emailId, status, deliveredTo, mode: dv.mode, to: d.to, deptName: d.deptName, due, ref: emailRef(st),
      note: status === "sent" ? (dv.mode === "sandbox" ? `Sent to the sandbox inbox ${deliveredTo}.` : `Emailed to ${deliveredTo}.`)
        : status === "failed" ? `The email could not be sent (${error}); the officer still sees it on the console.` : dv.note }
  };
}

/** The officer's answer on a news story with no case (lib/officer/newsacts.ts): the follow-up closes and the note is kept for the Collector. */
export async function newsDone(key: string, emailId: number, dept: string, deptName: string, note: string, user: string): Promise<boolean> {
  const [f] = await q(`SELECT followup_id AS id, summary FROM ${ops("followups")} WHERE email_id = ? AND incident_id = ?`, [emailId, key]);
  if (!f || !String(f.summary ?? "").endsWith(`(news send to ${dept})`)) return false;
  await intelPool.query(`UPDATE ${ops("followups")} SET status = 'done' WHERE followup_id = ?`, [f.id]);
  await intelPool.query(
    `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'news:done', 'followups', ?, NULL, ?)`,
    [user, key, JSON.stringify({ email: emailId, dept, deptName, note, at: istNow() })]
  );
  return true;
}

/** The department's news from the Collector that has no case: the officer console's list (newest first, open ones first). */
export async function newsForDept(dept: string): Promise<{ key: string; emailId: number; subject: string; body: string; at: string; due: string | null; done: boolean; reply: string | null }[]> {
  const fups = await q(`SELECT email_id AS id, incident_id AS k, due_date AS due, status FROM ${ops("followups")} WHERE incident_id LIKE 'NEWS-%' AND summary = ?`, [newsFollowupSummary(dept)])
    .catch(orEmpty("newsaction:dept-list"));
  if (!fups.length) return [];
  const ids = fups.map((f) => Number(f.id));
  const [emails, done] = await Promise.all([
    q(`SELECT email_id AS id, subject, body, created_at AS at FROM ${ops("outbound_emails")} WHERE email_id IN (?)`, [ids]).catch(orEmpty("newsaction:dept-emails")),
    q(`SELECT after_value AS v FROM ${ops("audit_log")} WHERE action = 'news:done' AND record_id IN (?)`, [fups.map((f) => String(f.k))]).catch(orEmpty("newsaction:dept-done"))
  ]);
  const eOf = new Map(emails.map((e) => [Number(e.id), e]));
  const rOf = new Map<number, string>();
  for (const d of done) { try { const v = JSON.parse(String(d.v)); if (v?.email && v.dept === dept) rOf.set(Number(v.email), String(v.note ?? "")); } catch { /* not ours */ } }
  return fups.map((f) => {
    const e = eOf.get(Number(f.id));
    return { key: String(f.k), emailId: Number(f.id), subject: String(e?.subject ?? "News from the Collector"), body: String(e?.body ?? ""),
      at: String(e?.at ?? "").replace("T", " ").slice(0, 19), due: f.due ? String(f.due).replace("T", " ").slice(0, 19) : null, done: f.status === "done", reply: rOf.get(Number(f.id)) ?? null };
  }).sort((a, b) => Number(a.done) - Number(b.done) || b.emailId - a.emailId).slice(0, 30);
}
