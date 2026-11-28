/**
 * A mail from the Collector to any department officer or staff member about anything, not tied to an incident (28 Nov 2026, the owner:
 * "I should be able to draft a mail to any department officer and staff regarding anything; Jarvis and the chatbot too"). Opened from the
 * Menu, the search palette, Jarvis or the chatbot (components/collector/app/MailComposer.tsx).
 *
 * The recipients are read here, never taken from the browser: a department's officer account (users.dept_code) and its staff from the
 * Collector's directory (official_contacts). The draft is written by AI from the Collector's words (a template when no model answers);
 * nothing is sent until the Collector approves it, under the same delivery rule as every other email (sandbox by default), with a
 * follow-up and an audit row. It goes under its own key (followupdept.ts newsKey): the officer console lists it under "From the Collector",
 * where the officer reports what was done.
 */
import { z } from "zod";
import intelPool, { ops } from "@/lib/collector/db";
import { contactsFor } from "@/lib/collector/intel";
import { generateJson } from "@/lib/ai/gateway";
import { orEmpty } from "@/lib/fallback";
import { sendMail } from "@/lib/mailer";
import { bodyHash, emailRef, stampHtml } from "@/lib/security/stamp";
import type { Factor } from "@/lib/security/factors";
import { newsFollowupSummary, newsKey } from "@/lib/collector/followupdept";
import { delivery, istNow, mailHtml, recipients, tidyEmail, type Recipient } from "@/lib/collector/actionmail";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await intelPool.query(sql, params);
  return rows as Row[];
}

export interface MailDept { code: string; name: string }
export interface MailPerson { id: string; kind: "officer" | "contact"; name: string; role: string; email: string | null }

/** every department, by name */
export async function mailDepts(): Promise<MailDept[]> {
  const rows = await q(`SELECT code, name FROM ref_departments ORDER BY name`).catch(orEmpty("composemail:depts"));
  return rows.map((r) => ({ code: String(r.code), name: String(r.name ?? r.code) }));
}

/** who in a department can receive it: its officer account first, then its staff with an email address */
export async function mailPeople(dept: string): Promise<MailPerson[]> {
  const [{ to }, staff] = await Promise.all([recipients(dept, []), contactsFor(dept, null)]);
  const out: MailPerson[] = [];
  if (to) out.push({ id: "officer", kind: "officer", name: to.name, role: to.role, email: to.email });
  for (const c of staff.filter((x) => x.dept_code === dept && x.email)) {
    out.push({ id: `c${c.contact_id}`, kind: "contact", name: String(c.name), role: String(c.designation ?? "Staff"), email: String(c.email).split(/[,\s/]+/)[0] || null });
  }
  return out.slice(0, 30);
}

async function pick(dept: string, id: string): Promise<{ who: MailPerson | null; rcpt: Recipient | null }> {
  const people = await mailPeople(dept);
  const who = people.find((p) => p.id === id) ?? people[0] ?? null;
  const rcpt: Recipient | null = who ? { kind: who.kind, id: who.kind === "officer" ? 0 : Number(who.id.slice(1)), name: who.name, role: who.role, email: who.email } : null;
  return { who, rcpt };
}

const DraftSchema = z.object({
  subject: z.string().describe("Email subject, under 90 characters"),
  body: z.string().describe("Plain-text email body, 70 to 180 words, no markdown")
});
const SYSTEM = `You write emails from the District Collector of Chennai to a department officer or staff member.
Write in plain, formal Indian English: a greeting with the person's name, what the Collector wants in clear sentences, what to do and by when if the
Collector said so, a request to reply with a short report through the District IQ officer console, and the sign-off "District Collector, Chennai".
Use only what the Collector said: never invent figures, places, names, dates or facts. No markdown.`;

export async function draftComposed(input: { dept: string; to: string; topic: string }, user: string) {
  const depts = await mailDepts();
  const d = depts.find((x) => x.code === input.dept);
  if (!d) return { error: "Choose a department.", status: 400 };
  const { who } = await pick(d.code, input.to);
  const name = who?.name && who.name !== "Department officer" ? who.name : `Officer, ${d.name}`;
  const topic = input.topic.trim().slice(0, 1200);
  let subject = `From the District Collector: ${topic.split(/[.\n]/)[0].slice(0, 80)}`;
  let body = tidyEmail(`Dear ${name},\n\n${topic}\n\nPlease look into this and send a short report through the District IQ officer console.\n\nDistrict Collector, Chennai`, name);
  let ai: { model: string } | null = null;
  try {
    const r = await generateJson({ role: "fast", name: "compose-email", schema: DraftSchema, system: SYSTEM, temperature: 0.3, maxOutputTokens: 600, user, claudeMs: 15_000, first: ["openai/gpt-oss-120b"],
      prompt: `To: ${name}, ${who?.role ?? "Department officer"}, ${d.name}.\nWhat the Collector wants to say (their own words):\n${topic}` });
    if (r.object.subject.trim() && r.object.body.trim().length > 60) { subject = r.object.subject.trim().slice(0, 140); body = tidyEmail(r.object.body, name); ai = { model: r.info.model }; }
  } catch (e) {
    console.warn(`[compose-mail] AI draft unavailable: ${(e as Error).message}`);
  }
  return { dept: d, who, subject, body, ai, delivery: delivery(who?.email ?? null) };
}

const SendSchema = z.object({
  dept: z.string().regex(/^[A-Z0-9-]{2,20}$/),
  to: z.string().regex(/^(officer|c\d{1,9})$/),
  subject: z.string().trim().min(5).max(160),
  body: z.string().trim().min(40).max(6000)
});

export async function sendComposed(input: unknown, user: string, factor: Factor | null = null): Promise<{ status: number; body: Row }> {
  const p = SendSchema.safeParse(input);
  if (!p.success) return { status: 400, body: { error: "Choose who it goes to, and write a subject and a message." } };
  const { dept, to, subject, body } = p.data;
  const d = (await mailDepts()).find((x) => x.code === dept);
  if (!d) return { status: 400, body: { error: "Choose a department." } };
  const { who, rcpt } = await pick(dept, to);
  const dv = delivery(who?.email ?? null);
  const at = istNow(), st = { owner: user, subject, bodyHash: bodyHash(body), at };
  let status = "console_only", error: string | null = null, deliveredTo: string | null = null;
  if (dv.to) {
    const sandbox = dv.mode === "sandbox";
    const html = mailHtml(subject, body, sandbox ? `Sandbox copy. In live mode this goes to ${who?.name ?? "the officer"} <${who?.email ?? "no address"}>.` : null, stampHtml(st, factor));
    const r = await sendMail(dv.to, sandbox ? `[Sandbox] ${subject}` : subject, html);
    if (r.ok) { status = "sent"; deliveredTo = dv.to; } else { status = "failed"; error = r.reason === "send_failed" ? r.detail : "not configured"; }
  }
  const key = newsKey(`mail-${Date.now().toString(36)}`);
  const [res] = await intelPool.query(
    `INSERT INTO ${ops("outbound_emails")} (owner, to_contact_ids, cc_contact_ids, incident_id, subject, body, language, mode, status,
       approved_at, sent_at, delivered_to, body_hash, error)
     VALUES (?, ?, NULL, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)`,
    [user, JSON.stringify(rcpt ? [rcpt] : []), key, subject, body, dv.mode, status, at, status === "sent" ? istNow() : null, deliveredTo, st.bodyHash, error]
  ) as unknown as [{ insertId: number }];
  const emailId = Number(res?.insertId ?? 0);
  await intelPool.query(`INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [emailId, rcpt?.id ?? 0, key, newsFollowupSummary(dept), istNow(48)]);
  await intelPool.query(
    `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'mail:send', 'outbound_emails', ?, NULL, ?)`,
    [user, String(emailId), JSON.stringify({ email_id: emailId, key, dept, to: who?.email ?? null, mode: dv.mode, status, delivered_to: deliveredTo, ref: emailRef(st), confirmed_with: factor })]
  );
  return {
    status: 201,
    body: { id: emailId, status, deptName: d.name, to: who, ref: emailRef(st),
      note: status === "sent" ? (dv.mode === "sandbox" ? `Sent to the sandbox inbox ${deliveredTo}.` : `Emailed to ${deliveredTo}.`)
        : status === "failed" ? `The email could not be sent (${error}); the officer still sees it on the console.` : dv.note }
  };
}
