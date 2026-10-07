/**
 * "Take action" on a severe incident: an agent that reads the incident, finds the department officer responsible,
 * drafts the Collector's instruction email, and sends it once the Collector has read and approved it.
 *
 *   1. read     the incident and every report it was merged from (intel.incident), the department's own completion
 *               reports, and any instruction already sent about it
 *   2. find     the department's officer account (users: department_officer, dept_code) and the department head in
 *               the GCC directory (shown for reference; only the officer is written to)
 *   3. draft    the AI writes a short, specific instruction from those facts (lib/ai/gateway, JSON schema); without
 *               a configured model, or when it is busy, a plain template says the same
 *   4. send     after the Collector approves (and may edit) it. Delivery is always safe:
 *                 EMAIL_MODE=sandbox (the default) sends only to EMAIL_SANDBOX_TO, with the real recipient named in
 *                 the message; EMAIL_MODE=live sends only to addresses in EMAIL_LIVE_ALLOWLIST. Without SMTP nothing is
 *                 emailed. Whatever the email does, the instruction reaches the officer's console on that grievance.
 *               Every send is kept in outbound_emails (and a follow-up due in 24 hours in followups) and the audit log.
 *
 * Only severe incidents: everything else is the department's to handle (see intel.FOR_COLLECTOR).
 */
import { createHash } from "crypto";
import { z } from "zod";
import intelPool, { ops } from "@/lib/collector/db";
import pool from "@/lib/db";
import { incident, type Plain } from "@/lib/collector/intel";
import { generateJson } from "@/lib/ai/gateway";
import { isSmtpConfigured, sendMail } from "@/lib/mailer";

type Row = Record<string, any>;

async function q<T = Row>(sql: string, params: unknown[] = [], db = intelPool): Promise<T[]> {
  const [rows] = await db.query(sql, params);
  return rows as T[];
}

export interface Recipient { kind: "officer" | "contact"; id: number; name: string; role: string; email: string | null }
export interface AgentStep { key: "read" | "find" | "draft"; label: string; detail: string; ok: boolean }
export interface ActionDraft {
  incidentId: string;
  subject: string;
  body: string;
  to: Recipient | null;
  /** the department head in the GCC directory, for reference (not written to) */
  head: Recipient | null;
  steps: AgentStep[];
  ai: { provider: string; model: string } | null;
  delivery: Delivery;
  /** instructions already sent about this incident, newest first */
  sent: Row[];
}

/** Where an email would really go, before anything is sent. */
export interface Delivery { mode: "sandbox" | "live"; smtp: boolean; to: string | null; note: string }

/** The safety rule for outgoing mail (see the file comment). */
export function delivery(intended: string | null): Delivery {
  const mode = process.env.EMAIL_MODE === "live" ? "live" : "sandbox";
  const smtp = isSmtpConfigured();
  if (mode === "sandbox") {
    const box = (process.env.EMAIL_SANDBOX_TO || "").trim() || null;
    return {
      mode, smtp, to: smtp && box ? box : null,
      note: !smtp ? "Email is not set up on this server (SMTP), so it goes to the officer's console only."
        : !box ? "Sandbox mode has no team inbox (EMAIL_SANDBOX_TO), so it goes to the officer's console only."
          : `Sandbox mode: the email goes to the team inbox ${box}, not to the officer. It also reaches the officer's console.`
    };
  }
  const allow = new Set((process.env.EMAIL_LIVE_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const ok = !!intended && allow.has(intended.toLowerCase());
  return {
    mode, smtp, to: smtp && ok ? intended : null,
    note: !smtp ? "Email is not set up on this server (SMTP), so it goes to the officer's console only."
      : ok ? `Emailed to ${intended} and shown on the officer's console.`
        : `${intended ?? "The officer"} has not agreed to receive these emails (EMAIL_LIVE_ALLOWLIST), so it goes to the officer's console only.`
  };
}

/** The department's officer account, and the department head from the GCC directory. */
async function recipients(dept: string | null, contacts: Row[]): Promise<{ to: Recipient | null; head: Recipient | null }> {
  let to: Recipient | null = null;
  if (dept) {
    const [u] = await q(
      `SELECT u.id, u.email, p.first_name, p.last_name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.role = 'department_officer' AND u.dept_code = ? AND u.is_active = 1 ORDER BY u.id LIMIT 1`, [dept], pool as typeof intelPool
    ).catch(() => [] as Row[]);
    if (u) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      to = { kind: "officer", id: Number(u.id), name: name || "Department officer", role: `Department officer, ${dept}`, email: String(u.email) };
    }
  }
  const h = contacts.find((c) => c.dept_code === dept);
  const head: Recipient | null = h ? { kind: "contact", id: Number(h.contact_id), name: String(h.name), role: String(h.designation ?? ""),
    email: h.email ? String(h.email).split(/[,\s/]+/)[0] : null } : null;
  return { to, head };
}


const DraftSchema = z.object({
  subject: z.string().describe("Email subject, under 90 characters, starting with 'Urgent:'"),
  body: z.string().describe("Plain-text email body, 90 to 170 words, no markdown")
});

const SYSTEM = `You write instruction emails from the District Collector of Chennai to a department officer about one severe incident.
Write in plain, formal Indian English. Be specific and brief: what happened and where (one or two sentences), what the officer must do now,
and that a completion report with site photos is expected through the District IQ officer console within 24 hours.
Use only the facts given; never invent names, numbers, dates or places. Do not list "key facts" or statistics unless they change what the
officer must do. No markdown, no bullet symbols except simple numbered steps (at most three). Start with "Dear <officer>," and end with
"District Collector, Chennai". Layout: the greeting on its own line, a blank line between paragraphs, each numbered step on its own line,
the closing on its own line.`;

/** Line breaks where a model ran the email into one paragraph: greeting, steps, closing. */
export function tidyEmail(body: string, officer = ""): string {
  let b = body.replace(/\r/g, "").trim();
  if (/\n/.test(b)) return b;
  // the greeting: "Dear <officer>," (the officer's name can itself hold a comma)
  const greet = officer && b.startsWith(`Dear ${officer},`) ? `Dear ${officer},`.length : (b.match(/^Dear [^,\n]{2,80},/)?.[0].length ?? 0);
  if (greet) b = `${b.slice(0, greet)}\n\n${b.slice(greet).trim()}`;
  b = b
    .replace(/\s+(?=\d\.\s)/g, "\n")
    .replace(/(\n\d\.[^\n]*?\.)\s+(?=[A-Z][^\n]*$)/, "$1\n\n")
    .replace(/\s*(District Collector, Chennai\.?)\s*$/, "\n\n$1");
  return b.replace(/([^\n])\n1\./, "$1\n\n1.");
}

/** The facts the email is written from: what the Collector's console shows, nothing more. */
function facts(i: Row, why: Plain, extra: { reports: number; outlets: string[]; group: number; deptReport: Row | null; officer: string; playbook: string[] }) {
  const lines = [
    `Incident: ${i.title}`,
    `Category: ${i.type}; severity: ${i.sev}; status: ${i.status}`,
    `Place: ${[i.loc, i.zone_name, i.ward ? `ward ${i.ward}` : null].filter(Boolean).join(", ") || "Chennai"}`,
    `Department: ${i.dept_name ?? i.dept}`,
    `First reported: ${i.t}${i.sla_due ? `; deadline ${i.sla_due}${i.open && i.breached ? " (missed)" : ""}` : ""}`,
    `What happened: ${why.summary}`,
    why.attention.length ? `Why it needs attention: ${why.attention.join("; ")}` : "",
    why.next ? `Suggested next step: ${why.next}` : "",
    `Reports: ${extra.reports} (${Number(i.complaints) || 0} citizen complaints${extra.outlets.length ? `; in the news: ${extra.outlets.slice(0, 4).join(", ")}` : ""})`,
    extra.group > 1 ? `The same problem was reported ${extra.group} times in this area.` : "",
    extra.deptReport ? `The department last reported: "${String(extra.deptReport.remarks).slice(0, 200)}" on ${extra.deptReport.t}` : "No completion report from the department yet.",
    extra.playbook.length ? `Standard steps for this kind of incident: ${extra.playbook.join("; ")}` : "",
    `Officer: ${extra.officer}`
  ];
  return lines.filter(Boolean).join("\n");
}

/** The same email without AI: the category's standard steps (playbook), else general ones. */
function template(i: Row, why: Plain, officer: string, deptReport: Row | null, playbook: string[]) {
  const place = [i.loc, i.zone_name].filter(Boolean).join(", ") || "Chennai";
  const work = playbook.filter((x) => !/report|close/i.test(x)).slice(0, 2).map((x) => `${x.replace(/\.$/, "")} at ${place}.`);
  const steps = [
    ...(work.length ? work : [why.next ?? `Send a team to ${place} and make the site safe.`,
      deptReport ? "Confirm that the work you reported has fixed the problem on site." : "Start the work and keep the affected residents informed."]),
    "Send a completion report with site photos through the District IQ officer console."
  ];
  return {
    subject: `Urgent: ${i.type} at ${place} (${i.id})`.slice(0, 120),
    body: `Dear ${officer},\n\n${why.summary} This is a severe incident and needs your immediate attention.\n\n` +
      `Please:\n${steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}\n\nI expect the completion report within 24 hours.\n\nDistrict Collector, Chennai`
  };
}

/** Steps 1 to 3: everything the Collector reviews before sending. */
export async function draftAction(id: string, user: string): Promise<ActionDraft | { error: string; status: number }> {
  const d = await incident(id);
  if (!d) return { error: "Incident not found.", status: 404 };
  const i = d.incident as Row;
  if (i.sev !== "Severe") return { error: "Take action is for severe incidents only; the department handles the rest.", status: 409 };
  const why = i.why as Plain;
  const outlets: string[] = i.src?.outlets ?? [];
  const deptReport = (d.deptReports as Row[])[0] ?? null;
  const steps: AgentStep[] = [{
    key: "read", label: "Read the incident", ok: true,
    detail: `${d.reports.length} report${d.reports.length === 1 ? "" : "s"}${d.group.length ? ` across ${d.group.length + 1} merged incidents` : ""}` +
      `${deptReport ? "; the department's last report" : "; no report from the department yet"}`
  }];

  const { to, head } = await recipients(i.dept ?? null, d.contacts as Row[]);
  steps.push({
    key: "find", label: "Find the officer", ok: !!to,
    detail: to ? `${to.role} (${to.email})` : `No officer account for ${i.dept_name ?? i.dept}; the email can still be copied`
  });

  const officer = to?.name && to.name !== "Department officer" ? to.name : `Officer, ${i.dept_name ?? i.dept}`;
  // the category's standard steps (ref_categories.playbook), so the instruction asks for what the department normally does
  const [cat] = await q(`SELECT playbook FROM ref_categories WHERE category_code = ?`, [i.cat_code]).catch(() => [] as Row[]);
  const playbook = String(cat?.playbook ?? "").split("|").map((x) => x.trim()).filter(Boolean);
  let draft = template(i, why, officer, deptReport, playbook);
  let ai: ActionDraft["ai"] = null;
  try {
    const r = await generateJson({
      role: "fast", name: "action-email", schema: DraftSchema, system: SYSTEM, temperature: 0.2, maxOutputTokens: 600, user,
      prompt: facts(i, why, { reports: d.reports.length, outlets, group: d.group.length + 1, deptReport, officer, playbook })
    });
    if (r.object.subject.trim() && r.object.body.trim().length > 60) {
      draft = { subject: r.object.subject.trim().slice(0, 140), body: tidyEmail(r.object.body, officer) };
      ai = { provider: r.info.provider, model: r.info.model };
    }
  } catch (e) {
    console.warn(`[take-action] AI draft unavailable for ${id}: ${(e as Error).message}`);
  }
  steps.push({ key: "draft", label: "Draft the email", ok: true, detail: ai ? `Written by AI (${ai.model}); read it before sending` : "Written from a template (AI not available)" });

  return { incidentId: id, ...draft, to, head, steps, ai, delivery: delivery(to?.email ?? null), sent: (d.emails as Row[]) ?? [] };
}

const SendSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  body: z.string().trim().min(40).max(5000)
});

/** Step 4: the Collector approved the draft (edited or not). Recipients are found again here, never taken from the browser. */
export async function sendAction(id: string, input: unknown, user: string): Promise<{ status: number; body: Row }> {
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Write a subject and a message before sending." } };
  const d = await incident(id);
  if (!d) return { status: 404, body: { error: "Incident not found." } };
  const i = d.incident as Row;
  if (i.sev !== "Severe") return { status: 409, body: { error: "Take action is for severe incidents only." } };
  const { to } = await recipients(i.dept ?? null, d.contacts as Row[]);
  const { subject, body } = parsed.data;
  const dv = delivery(to?.email ?? null);

  let status = "console_only", error: string | null = null, deliveredTo: string | null = null;
  if (dv.to) {
    const sandbox = dv.mode === "sandbox";
    const html = mailHtml(subject, body, sandbox ? `Sandbox copy. In live mode this goes to ${to?.name ?? "the department officer"} <${to?.email ?? "no address"}>.` : null);
    const r = await sendMail(dv.to, sandbox ? `[Sandbox] ${subject}` : subject, html);
    if (r.ok) { status = "sent"; deliveredTo = dv.to; }
    else { status = "failed"; error = r.reason === "send_failed" ? r.detail : "not configured"; }
  }

  const rcpt = JSON.stringify(to ? [to] : []);
  const [res] = await intelPool.query(
    `INSERT INTO ${ops("outbound_emails")} (owner, to_contact_ids, cc_contact_ids, incident_id, subject, body, language, mode, status,
       approved_at, sent_at, delivered_to, body_hash, error)
     VALUES (?, ?, NULL, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)`,
    [user, rcpt, id, subject, body, dv.mode, status, istNow(), status === "sent" ? istNow() : null, deliveredTo,
      createHash("sha256").update(body).digest("hex"), error]
  ) as unknown as [{ insertId: number }];
  const emailId = Number(res?.insertId ?? 0);
  await Promise.all([
    intelPool.query(
      `INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [emailId, to?.id ?? 0, id, `Completion report with photos from ${i.dept_name ?? i.dept}`, istNow(24)]
    ),
    intelPool.query(
      `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'take_action:email', 'outbound_emails', ?, ?, ?)`,
      [user, id, JSON.stringify({ severity_level: i.sev, status_std: i.status }),
        JSON.stringify({ email_id: emailId, to: to?.email ?? null, mode: dv.mode, status, delivered_to: deliveredTo })]
    )
  ]);
  return {
    status: 201,
    body: { id: emailId, status, deliveredTo, mode: dv.mode, to, note: status === "sent" ? (dv.mode === "sandbox" ? `Sent to the sandbox inbox ${deliveredTo}.` : `Emailed to ${deliveredTo}.`)
      : status === "failed" ? `The email could not be sent (${error}); the officer still sees it on the console.` : dv.note }
  };
}

const istNow = (plusHours = 0) => new Date(Date.now() + (330 + plusHours * 60) * 60_000).toISOString().slice(0, 19).replace("T", " ");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function mailHtml(subject: string, body: string, banner: string | null) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:8px;color:#111">
  ${banner ? `<p style="background:#FFF4E5;border:1px solid #F5C77E;border-radius:6px;padding:8px 10px;font-size:12px;color:#7A4B00">${esc(banner)}</p>` : ""}
  <h2 style="color:#0A3D62;margin:0 0 2px">District Collectorate &ndash; Chennai</h2>
  <p style="color:#666;font-size:12px;margin:0 0 14px">District IQ &middot; instruction on a severe incident</p>
  <h3 style="margin:0 0 10px">${esc(subject)}</h3>
  ${body.split(/\n{2,}/).map((p) => `<p style="line-height:1.5;margin:0 0 10px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:18px 0" />
  <p style="color:#666;font-size:12px">Reply through the District IQ officer console with a completion report and site photos.</p>
</div>`;
}
