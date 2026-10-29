/**
 * Rehearsal tasks, kept without a new table: each approved job is a `followups` row whose summary starts with a small
 * header, `[RR] {"r":rehearsal,"d":dept,"k":job key,"la","lo","w"} `, then the job in words. The department's officer
 * reads its own rows and marks them done (with an optional photo; the place where it was taken is compared with the
 * job's place). One email per department, sent under the console's email safety rule (sandbox by default:
 * actionmail.delivery), and audited. Nothing is sent before the Collector approves.
 */
import { createHash } from "crypto";
import intelPool, { ops } from "@/lib/collector/db";
import pool from "@/lib/db";
import { delivery, tidyEmail, type Delivery, type Recipient } from "@/lib/collector/actionmail";
import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import type { Job } from "./playbook";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = [], db: { query: (s: string, p?: unknown[]) => Promise<unknown> } = intelPool): Promise<Row[]> {
  const [rows] = (await db.query(sql, params)) as [Row[]];
  return rows;
}

const ist = (addH = 0) => new Date(Date.now() + 330 * 60_000 + addH * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
export const TAG = "[RR] ";
/** a photo taken this close to the job's place counts as "checked at the place" */
export const PHOTO_OK_M = 300;

export interface TaskHead { r: string; d: string; k: string; la: number; lo: number; w: number | null; u?: string | null }
export interface Task {
  id: number;
  rehearsal: string;
  dept: string;
  key: string;
  lat: number;
  lon: number;
  ward: number | null;
  text: string;
  incident: string | null;
  due: string | null;
  status: "todo" | "done" | "late";
  doneAt: string | null;
  doneBy: string | null;
  photo: string | null;
  /** metres between the photo and the job's place, null = no location */
  photoM: number | null;
  createdAt: string;
}

export function encodeSummary(rid: string, j: Job): string {
  const head: TaskHead = { r: rid, d: j.dept, k: j.key, la: Math.round(j.lat * 1e5) / 1e5, lo: Math.round(j.lon * 1e5) / 1e5, w: j.ward, u: j.due };
  return (TAG + JSON.stringify(head) + " " + j.en).slice(0, 500);
}
export function decodeSummary(s: string): { head: TaskHead; text: string } | null {
  if (!s.startsWith(TAG)) return null;
  const end = s.indexOf("} ", TAG.length);
  if (end < 0) return null;
  try { return { head: JSON.parse(s.slice(TAG.length, end + 1)), text: s.slice(end + 2) }; } catch { return null; }
}

/** Every rehearsal task (optionally one rehearsal's, or one department's), with its done state from the audit log. */
export async function readTasks(opts: { rehearsal?: string; dept?: string } = {}): Promise<Task[]> {
  const rows = await q(`SELECT followup_id, incident_id, summary, DATE_FORMAT(due_date, '%Y-%m-%d') AS due, status, DATE_FORMAT(last_checked_at, '%Y-%m-%d %H:%i:%s') AS checked,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created FROM ${ops("followups")} WHERE summary LIKE ? ORDER BY followup_id`, [`${TAG}%`]).catch(() => [] as Row[]);
  const done = await q(`SELECT record_id, actor, after_value FROM ${ops("audit_log")} WHERE action = 'rehearsal:done' ORDER BY log_id`).catch(() => [] as Row[]);
  const doneBy = new Map<string, Row>();
  for (const d of done) doneBy.set(String(d.record_id), d);
  const now = ist();
  const out: Task[] = [];
  for (const r of rows) {
    const dec = decodeSummary(String(r.summary));
    if (!dec) continue;
    if (opts.rehearsal && dec.head.r !== opts.rehearsal) continue;
    if (opts.dept && dec.head.d !== opts.dept) continue;
    const a = doneBy.get(String(r.followup_id));
    let info: Row = {};
    try { info = a ? JSON.parse(String(a.after_value)) : {}; } catch { /* old row */ }
    const isDone = String(r.status) === "done";
    // the exact deadline is in the header (the table keeps only the day)
    const due = dec.head.u ?? (r.due ? `${r.due} 23:59:59` : null);
    out.push({
      id: Number(r.followup_id), rehearsal: dec.head.r, dept: dec.head.d, key: dec.head.k, lat: dec.head.la, lon: dec.head.lo, ward: dec.head.w, text: dec.text,
      incident: r.incident_id ?? null, due, status: isDone ? "done" : due && due < now ? "late" : "todo", doneAt: isDone ? r.checked ?? null : null,
      doneBy: a ? String(a.actor) : null, photo: info.photo ?? null, photoM: info.photo_m ?? null, createdAt: String(r.created ?? "")
    });
  }
  return out;
}

/** The department's officer account (the one an instruction is written to). */
async function officerOf(dept: string): Promise<Recipient | null> {
  const [u] = await q(`SELECT u.id, u.email, p.first_name, p.last_name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.role = 'department_officer' AND u.dept_code = ? AND u.is_active = 1 ORDER BY u.id LIMIT 1`, [dept], pool as never).catch(() => [] as Row[]);
  if (!u) return null;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return { kind: "officer", id: Number(u.id), name: name || "Department officer", role: `Department officer, ${dept}`, email: String(u.email) };
}

export interface DeptDraft { dept: string; deptName: string; keys: string[]; subject: string; body: string; to: Recipient | null; delivery: Delivery; jobs: { key: string; en: string; due: string | null }[] }

const fmtDue = (d: string | null) => (d ? new Date(d.replace(" ", "T") + "Z").toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "as soon as possible");

/** One department's draft: its jobs, worst first, with deadlines. A plain template (the jobs are the facts); the Collector may edit it. */
export async function draftDept(jobs: Job[], dept: string, deptName: string, headline: string): Promise<DeptDraft> {
  const mine = jobs.filter((j) => j.dept === dept);
  const to = await officerOf(dept);
  const officer = to?.name ?? "Officer";
  const lines = mine.slice(0, 25).map((j, k) => `${k + 1}. ${j.en}${j.en.includes(j.place) ? "" : ` (${j.place})`}; by ${fmtDue(j.due)}`);
  const body = `Dear ${officer},\n\n${headline} The Collector's rain rehearsal asks ${deptName} to finish these jobs before the rain:\n\n${lines.join("\n")}` +
    `${mine.length > 25 ? `\n\nand ${mine.length - 25} more, listed in the District IQ officer console.` : ""}` +
    `\n\nMark each job done in the District IQ officer console, with a site photo where you can.\n\nDistrict Collector, Chennai`;
  return {
    dept, deptName, keys: mine.map((j) => j.key), subject: `Before the rain: ${mine.length} ${mine.length === 1 ? "job" : "jobs"} for ${deptName}`.slice(0, 160),
    body: tidyEmail(body, officer), to, delivery: delivery(to?.email ?? null), jobs: mine.map((j) => ({ key: j.key, en: j.en, due: j.due }))
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function html(subject: string, body: string, banner: string | null) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:8px;color:#111">
  ${banner ? `<p style="background:#FFF4E5;border:1px solid #F5C77E;border-radius:6px;padding:8px 10px;font-size:12px;color:#7A4B00">${esc(banner)}</p>` : ""}
  <h2 style="color:#14532D;margin:0 0 2px">District Collectorate &ndash; Chennai</h2>
  <p style="color:#666;font-size:12px;margin:0 0 14px">District IQ &middot; rain rehearsal</p>
  <h3 style="margin:0 0 10px">${esc(subject)}</h3>
  ${body.split(/\n{2,}/).map((p) => `<p style="line-height:1.5;margin:0 0 10px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
</div>`;
}

/**
 * The Collector approved one department's draft: send it (safety rule), create one task per job that is not already a
 * task of this rehearsal, audit it. `jobs` are the server's own plan for this rehearsal, never the browser's.
 */
export async function sendDept(rid: string, jobs: Job[], dept: string, keys: string[], subject: string, body: string, user: string, context: unknown): Promise<{ status: number; body: Row }> {
  const want = new Set(keys);
  const existing = new Set((await readTasks({ rehearsal: rid, dept })).map((t) => t.key));
  const mine = jobs.filter((j) => j.dept === dept && want.has(j.key) && !existing.has(j.key));
  if (!mine.length) return { status: 409, body: { error: existing.size ? "These jobs were already sent for this rehearsal." : "None of these jobs is in the plan any more." } };
  const to = await officerOf(dept);
  const dv = delivery(to?.email ?? null);
  let status = "console_only", error: string | null = null, deliveredTo: string | null = null;
  if (dv.to && isSmtpConfigured()) {
    const sandbox = dv.mode === "sandbox";
    const r = await sendMail(dv.to, sandbox ? `[Sandbox] ${subject}` : subject, html(subject, body, sandbox ? `Sandbox copy. In live mode this goes to ${to?.name ?? "the department officer"} <${to?.email ?? "no address"}>.` : null));
    if (r.ok) { status = "sent"; deliveredTo = dv.to; } else { status = "failed"; error = r.reason === "send_failed" ? r.detail : "not configured"; }
  }
  const [res] = (await intelPool.query(
    `INSERT INTO ${ops("outbound_emails")} (owner, to_contact_ids, cc_contact_ids, incident_id, subject, body, language, mode, status, approved_at, sent_at, delivered_to, body_hash, error)
     VALUES (?, ?, NULL, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)`,
    [user, JSON.stringify(to ? [to] : []), mine.find((j) => j.incident)?.incident ?? null, subject, body, dv.mode, status, ist(), status === "sent" ? ist() : null, deliveredTo,
      createHash("sha256").update(body).digest("hex"), error]
  )) as unknown as [{ insertId: number }];
  const emailId = Number(res?.insertId ?? 0);
  for (const j of mine)
    await intelPool.query(`INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [emailId, to?.id ?? 0, j.incident, encodeSummary(rid, j), (j.due ?? ist(24)).slice(0, 10)]);
  await intelPool.query(
    `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'rehearsal:send', 'outbound_emails', ?, ?, ?)`,
    [user, String(emailId), JSON.stringify(context ?? null), JSON.stringify({ rehearsal: rid, dept, jobs: mine.map((j) => j.key), to: to?.email ?? null, mode: dv.mode, status, delivered_to: deliveredTo })]
  );
  return {
    status: 201,
    body: { id: emailId, status, mode: dv.mode, deliveredTo, tasks: mine.length, to,
      note: status === "sent" ? (dv.mode === "sandbox" ? `Sent to the sandbox inbox ${deliveredTo}.` : `Emailed to ${deliveredTo}.`)
        : status === "failed" ? `The email could not be sent (${error}); the officer still sees the jobs on the console.` : dv.note }
  };
}

const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;

/** An officer marks one of their department's tasks done (photo and its place optional). */
export async function markDone(taskId: number, dept: string, user: string, photo: string | null, at: { lat: number; lon: number } | null): Promise<{ status: number; body: Row }> {
  const [r] = await q(`SELECT followup_id, summary, status FROM ${ops("followups")} WHERE followup_id = ?`, [taskId]);
  const dec = r ? decodeSummary(String(r.summary)) : null;
  if (!r || !dec) return { status: 404, body: { error: "No such task." } };
  if (dec.head.d !== dept) return { status: 403, body: { error: "This task belongs to another department." } };
  if (String(r.status) === "done") return { status: 409, body: { error: "This task is already done." } };
  const photoM = at ? Math.round(Math.hypot((at.lon - dec.head.lo) * KX, (at.lat - dec.head.la) * KY)) : null;
  await intelPool.query(`UPDATE ${ops("followups")} SET status = 'done', last_checked_at = ? WHERE followup_id = ?`, [ist(), taskId]);
  await intelPool.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'rehearsal:done', 'followups', ?, ?, ?)`,
    [user, String(taskId), JSON.stringify({ status: r.status }), JSON.stringify({ status: "done", photo, photo_m: photoM, at })]);
  return { status: 200, body: { ok: true, photoM, near: photoM == null ? null : photoM <= PHOTO_OK_M } };
}
