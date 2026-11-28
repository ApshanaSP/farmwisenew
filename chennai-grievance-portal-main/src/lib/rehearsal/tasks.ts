/**
 * Rehearsal tasks, kept without a new table: each approved job is a `followups` row whose summary starts with a small
 * header, `[RR] {"r":rehearsal,"d":dept,"k":job key,"la","lo","w"} `, then the job in words. The department's officer
 * reads its own rows and marks them done (with an optional photo; the place where it was taken is compared with the
 * job's place). One email per department, sent under the console's email safety rule (sandbox by default:
 * actionmail.delivery), and audited. Nothing is sent before the Collector approves.
 *
 * Fixes after a rain (the action tracker, tracker.ts) are the same rows with a "fix:<tab>:<place>" key and the rain that led to
 * them as `r`: the Collector assigns them from the Rain view (no email: the department sees them on its officer console), the
 * officer posts updates and marks them done with what was changed (remarks, a site photo), and the Collector verifies them or
 * sends them back. Each step is an audit_log row ("rehearsal:assign", "rehearsal:progress", "rehearsal:done",
 * "rehearsal:verify", "rehearsal:reopen"); the row's own status stays within the table's values (pending, done).
 */
import { createHash } from "crypto";
import { bodyHash, emailRef, stampHtml } from "@/lib/security/stamp";
import type { Factor } from "@/lib/security/factors";
import intelPool, { ops } from "@/lib/collector/db";
import pool from "@/lib/db";
import { delivery, tidyEmail, type Delivery, type Recipient } from "@/lib/collector/actionmail";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { isSmtpConfigured, sendMail } from "@/lib/mailer";
import type { Job } from "./playbook";
import { fixKey, isLate, nextStage, parseFixKey, stageOf, STEP_ROLE, type FixLens, type Stage, type Step, type TrailEvent } from "./tracker";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = [], db: { query: (s: string, p?: unknown[]) => Promise<unknown> } = intelPool): Promise<Row[]> {
  const [rows] = (await db.query(sql, params)) as [Row[]];
  return rows;
}

const ist = (addH = 0) => new Date(Date.now() + 330 * 60_000 + addH * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
export const TAG = "[RR] ";
/** a photo taken this close to the job's place counts as "checked at the place" */
export const PHOTO_OK_M = 300;

export interface TaskHead { r: string; d: string; k: string; la: number; lo: number; w: number | null; u?: string | null; /** a fix's place name */ p?: string }
/** what a fix after a rain carries beside the task (tracker.ts) */
export interface FixInfo {
  lens: FixLens;
  place: string;
  label: string;
  /** the Collector's instruction in full */
  note: string;
  stage: Stage;
  late: boolean;
  trail: TrailEvent[];
}
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
  /** a fix after a rain (key "fix:..."), with its stage and steps */
  fix?: FixInfo;
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

/** the audit actions of a task's steps (tracker.ts Step) */
const STEP_ACTION: Record<Step, string> = { assign: "rehearsal:assign", progress: "rehearsal:progress", done: "rehearsal:done", verify: "rehearsal:verify", reopen: "rehearsal:reopen",
  withdraw: "rehearsal:withdraw", reassign: "rehearsal:reassign" };
const ACTION_STEP = new Map(Object.entries(STEP_ACTION).map(([s, a]) => [a, s as Step]));
const parse = (v: unknown): Row => { try { return v == null ? {} : typeof v === "string" ? JSON.parse(v) : (v as Row); } catch { return {}; } };

/** each task's steps from the audit log, oldest first (a "done" written before the tracker takes its time from the row) */
async function trails(): Promise<Map<string, (TrailEvent & { raw: Row })[]>> {
  const rows = await q(`SELECT record_id, actor, action, after_value FROM ${ops("audit_log")} WHERE table_name = 'followups' AND action IN (?) ORDER BY log_id`,
    [Object.values(STEP_ACTION)]).catch(() => [] as Row[]);
  const out = new Map<string, (TrailEvent & { raw: Row })[]>();
  for (const r of rows) {
    const step = ACTION_STEP.get(String(r.action));
    if (!step) continue;
    const v = parse(r.after_value);
    const ev = { step, at: typeof v.t === "string" ? v.t : "", by: String(r.actor ?? ""), remarks: (v.remarks ?? v.note ?? null) as string | null,
      photo: (v.photo ?? null) as string | null, photoM: typeof v.photo_m === "number" ? v.photo_m : null, raw: v };
    const k = String(r.record_id);
    (out.get(k) ?? out.set(k, []).get(k)!).push(ev);
  }
  return out;
}

/** Every rehearsal task (optionally one rehearsal's, or one department's), with its done state from the audit log. */
export async function readTasks(opts: { rehearsal?: string; dept?: string; fixes?: boolean } = {}): Promise<Task[]> {
  const rows = await q(`SELECT followup_id, incident_id, summary, DATE_FORMAT(due_date, '%Y-%m-%d') AS due, status, DATE_FORMAT(last_checked_at, '%Y-%m-%d %H:%i:%s') AS checked,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created FROM ${ops("followups")} WHERE summary LIKE ? ORDER BY followup_id`, [`${TAG}%`]).catch(() => [] as Row[]);
  const steps = await trails();
  const now = ist();
  const out: Task[] = [];
  for (const r of rows) {
    const dec = decodeSummary(String(r.summary));
    if (!dec) continue;
    if (opts.rehearsal && dec.head.r !== opts.rehearsal) continue;
    if (opts.dept && dec.head.d !== opts.dept) continue;
    const fk = parseFixKey(dec.head.k);
    if (opts.fixes != null && opts.fixes !== !!fk) continue;
    const trail = steps.get(String(r.followup_id)) ?? [];
    const a = [...trail].reverse().find((e) => e.step === "done");
    const info: Row = a?.raw ?? {};
    // the exact deadline is in the header (the table keeps only the day)
    const due = dec.head.u ?? (r.due ? `${r.due} 23:59:59` : null);
    let fix: FixInfo | undefined;
    let isDone = String(r.status) === "done";
    if (fk) {
      for (const e of trail) if (!e.at && e.step === "done") e.at = String(r.checked ?? "");
      const stage = stageOf(trail);
      isDone = stage === "done" || stage === "verified";
      const assign = trail.find((e) => e.step === "assign");
      fix = { lens: fk.lens, place: fk.place, label: dec.head.p ?? dec.text, note: String(assign?.raw.note ?? dec.text), stage, late: isLate(stage, due, now),
        trail: trail.map(({ raw: _raw, ...e }) => e) };
    }
    out.push({
      id: Number(r.followup_id), rehearsal: dec.head.r, dept: dec.head.d, key: dec.head.k, lat: dec.head.la, lon: dec.head.lo, ward: dec.head.w, text: dec.text,
      incident: r.incident_id ?? null, due, status: isDone ? "done" : due && due < now ? "late" : "todo",
      doneAt: isDone ? (fix ? a?.at || null : null) ?? r.checked ?? null : null,
      doneBy: a ? a.by : null, photo: info.photo ?? null, photoM: info.photo_m ?? null, createdAt: String(r.created ?? ""), ...(fix ? { fix } : {})
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
function html(subject: string, body: string, banner: string | null, stamp = "") {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:8px;color:#111">
  ${banner ? `<p style="background:#FFF4E5;border:1px solid #F5C77E;border-radius:6px;padding:8px 10px;font-size:12px;color:#7A4B00">${esc(banner)}</p>` : ""}
  <h2 style="color:#14532D;margin:0 0 2px">District Collectorate &ndash; Chennai</h2>
  <p style="color:#666;font-size:12px;margin:0 0 14px">District IQ &middot; rain rehearsal</p>
  <h3 style="margin:0 0 10px">${esc(subject)}</h3>
  ${body.split(/\n{2,}/).map((p) => `<p style="line-height:1.5;margin:0 0 10px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
  ${stamp}
</div>`;
}

/**
 * The Collector approved one department's draft: send it (safety rule), create one task per job that is not already a
 * task of this rehearsal, audit it. `jobs` are the server's own plan for this rehearsal, never the browser's.
 */
export async function sendDept(rid: string, jobs: Job[], dept: string, keys: string[], subject: string, body: string, user: string, context: unknown, factor: Factor | null = null): Promise<{ status: number; body: Row }> {
  const want = new Set(keys);
  const existing = new Set((await readTasks({ rehearsal: rid, dept })).map((t) => t.key));
  const mine = jobs.filter((j) => j.dept === dept && want.has(j.key) && !existing.has(j.key));
  if (!mine.length) return { status: 409, body: { error: existing.size ? "These jobs were already sent for this rehearsal." : "None of these jobs is in the plan any more." } };
  const to = await officerOf(dept);
  const dv = delivery(to?.email ?? null);
  const at = ist(), st = { owner: user, subject, bodyHash: bodyHash(body), at };
  let status = "console_only", error: string | null = null, deliveredTo: string | null = null;
  if (dv.to && isSmtpConfigured()) {
    const sandbox = dv.mode === "sandbox";
    const r = await sendMail(dv.to, sandbox ? `[Sandbox] ${subject}` : subject, html(subject, body, sandbox ? `Sandbox copy. In live mode this goes to ${to?.name ?? "the department officer"} <${to?.email ?? "no address"}>.` : null, stampHtml(st, factor)));
    if (r.ok) { status = "sent"; deliveredTo = dv.to; } else { status = "failed"; error = r.reason === "send_failed" ? r.detail : "not configured"; }
  }
  const [res] = (await intelPool.query(
    `INSERT INTO ${ops("outbound_emails")} (owner, to_contact_ids, cc_contact_ids, incident_id, subject, body, language, mode, status, approved_at, sent_at, delivered_to, body_hash, error)
     VALUES (?, ?, NULL, ?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?)`,
    [user, JSON.stringify(to ? [to] : []), mine.find((j) => j.incident)?.incident ?? null, subject, body, dv.mode, status, at, status === "sent" ? ist() : null, deliveredTo, st.bodyHash, error]
  )) as unknown as [{ insertId: number }];
  const emailId = Number(res?.insertId ?? 0);
  for (const j of mine)
    await intelPool.query(`INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [emailId, to?.id ?? 0, j.incident, encodeSummary(rid, j), (j.due ?? ist(24)).slice(0, 10)]);
  await intelPool.query(
    `INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'rehearsal:send', 'outbound_emails', ?, ?, ?)`,
    [user, String(emailId), JSON.stringify(context ?? null), JSON.stringify({ rehearsal: rid, dept, jobs: mine.map((j) => j.key), to: to?.email ?? null, mode: dv.mode, status, delivered_to: deliveredTo, ref: emailRef(st), confirmed_with: factor })]
  );
  return {
    status: 201,
    body: { id: emailId, status, mode: dv.mode, deliveredTo, tasks: mine.length, to, ref: emailRef(st),
      note: status === "sent" ? (dv.mode === "sandbox" ? `Sent to the sandbox inbox ${deliveredTo}.` : `Emailed to ${deliveredTo}.`)
        : status === "failed" ? `The email could not be sent (${error}); the officer still sees the jobs on the console.` : dv.note }
  };
}

const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;

/** An officer marks one of their department's tasks done (photo and its place optional; remarks optional for a before-rain job). */
export async function markDone(taskId: number, dept: string, user: string, photo: string | null, at: { lat: number; lon: number } | null, remarks: string | null = null): Promise<{ status: number; body: Row }> {
  const [r] = await q(`SELECT followup_id, summary, status FROM ${ops("followups")} WHERE followup_id = ?`, [taskId]);
  const dec = r ? decodeSummary(String(r.summary)) : null;
  if (!r || !dec) return { status: 404, body: { error: "No such task." } };
  if (dec.head.d !== dept) return { status: 403, body: { error: "This task belongs to another department." } };
  if (String(r.status) === "done") return { status: 409, body: { error: "This task is already done." } };
  const photoM = at ? Math.round(Math.hypot((at.lon - dec.head.lo) * KX, (at.lat - dec.head.la) * KY)) : null;
  const t = ist();
  await intelPool.query(`UPDATE ${ops("followups")} SET status = 'done', last_checked_at = ? WHERE followup_id = ?`, [t, taskId]);
  await intelPool.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'rehearsal:done', 'followups', ?, ?, ?)`,
    [user, String(taskId), JSON.stringify({ status: r.status }), JSON.stringify({ status: "done", photo, photo_m: photoM, at, t, ...(remarks ? { remarks } : {}) })]);
  return { status: 200, body: { ok: true, photoM, near: photoM == null ? null : photoM <= PHOTO_OK_M } };
}

// ------------------------------------------------------------------ fixes after a rain (tracker.ts) --

/** one place to fix, as the server found it in the rain's own data (never the browser's), with the Collector's department and note */
export interface FixItem { place: string; label: string; lat: number; lon: number; ward: number | null; dept: string; note: string }

/** A fix's summary: the header (with the place's name) and as much of the note as fits the column (the full note is in the audit row). */
export function encodeFix(rain: string, lens: FixLens, x: FixItem, due: string): string {
  const head: TaskHead = { r: rain, d: x.dept, k: fixKey(lens, x.place), la: Math.round(x.lat * 1e5) / 1e5, lo: Math.round(x.lon * 1e5) / 1e5, w: x.ward,
    u: `${due} 23:59:59`, p: x.label.replace(/[}\\]/g, ")").slice(0, 80) };
  const h = TAG + JSON.stringify(head) + " ";
  return h + x.note.slice(0, Math.max(0, 500 - h.length));
}

/**
 * The Collector assigns fixes for one rain: one task per place, due at the end of `due` (IST), each with its assignment in the
 * audit log. No email: the department's officer sees them on the console. The caller has checked each place against the
 * rain's data and that none already has an unfinished fix (trackview.ts prepareAssign).
 */
export async function assignFixes(rain: string, lens: FixLens, due: string, user: string, items: FixItem[], confirmedWith: string | null = null): Promise<{ id: number; place: string }[]> {
  const officers = new Map<string, Recipient | null>();
  for (const x of items) if (!officers.has(x.dept)) officers.set(x.dept, await officerOf(x.dept).catch(() => null));
  const out: { id: number; place: string }[] = [];
  const t = ist();
  // one transaction for the whole assignment: on the AWS store that is one flush (/store/write) instead of two per place, so a bulk
  // "Assign the N" no longer sends hundreds of writes in a row (and trips the store's 429 backoff for every other writer)
  const conn = await intelPool.getConnection();
  try {
    await conn.beginTransaction();
    for (const x of items) {
      const to = officers.get(x.dept) ?? null;
      const [res] = (await conn.query(`INSERT INTO ${ops("followups")} (email_id, contact_id, incident_id, summary, due_date, status) VALUES (0, ?, NULL, ?, ?, 'pending')`,
        [to?.id ?? 0, encodeFix(rain, lens, x, due), due])) as unknown as [{ insertId: number }];
      const id = Number(res?.insertId ?? 0);
      await conn.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, 'rehearsal:assign', 'followups', ?, NULL, ?)`,
        [user, String(id), JSON.stringify({ t, rain, lens, place: x.place, dept: x.dept, due, note: x.note, to: to?.email ?? null, confirmed_with: confirmedWith })]);
      out.push({ id, place: x.place });
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
  if (out.length) bumpDataEpoch();
  return out;
}

/** one fix's header and stage (null: no such fix) */
export async function fixById(id: number): Promise<{ head: TaskHead; lens: FixLens; place: string; status: string; trail: TrailEvent[]; stage: Stage } | null> {
  const [r] = await q(`SELECT followup_id, summary, status FROM ${ops("followups")} WHERE followup_id = ?`, [id]);
  const dec = r ? decodeSummary(String(r.summary)) : null;
  const fk = dec ? parseFixKey(dec.head.k) : null;
  if (!r || !dec || !fk) return null;
  const trail = ((await trails()).get(String(id)) ?? []).map(({ raw: _raw, ...e }) => e);
  return { head: dec.head, lens: fk.lens, place: fk.place, status: String(r.status), trail, stage: stageOf(trail) };
}

/** why a step is refused from a stage, in plain words */
function refusal(from: Stage, step: Step): string {
  if (step === "verify") return from === "verified" ? "This fix is already verified." : "The department has not marked this fix done yet.";
  if (step === "reopen") return from === "verified" ? "This fix is verified. If the place is hit again, take a new action from that rain." : "Only a fix the department marked done can be sent back.";
  if (step === "assign") return "This place already has an action.";
  if (from === "closed") return "This fix was withdrawn.";
  if (step === "withdraw") return "A verified fix stays on the record; take a new action if the place is hit again.";
  if (step === "reassign") return "Only a fix that is not done yet can go to another department; send a done fix back first.";
  return from === "verified" ? "This fix is verified and closed." : "This fix is already done. The Collector can send it back if more is needed.";
}

/**
 * One step on a fix: the officer's update or done (their own department's fixes only), the Collector's verify or send-back.
 * The stage machine decides what is allowed (tracker.ts); the step is an audit row; the row's status follows (done / pending).
 */
export async function stepFix(id: number, step: Exclude<Step, "assign">, who: { role: "collector" | "officer"; user: string; dept?: string },
  x: { remarks?: string | null; photo?: string | null; at?: { lat: number; lon: number } | null; dept?: string | null; due?: string | null; confirmedWith?: string | null } = {}): Promise<{ status: number; body: Row }> {
  const f = await fixById(id);
  if (!f) return { status: 404, body: { error: "No such fix." } };
  if (who.role === "officer" && f.head.d !== who.dept) return { status: 403, body: { error: "This fix belongs to another department." } };
  if (STEP_ROLE[step] !== who.role) return { status: 403, body: { error: who.role === "officer" ? "Only the Collector can do this." : "Only the department's officer can do this." } };
  const to = nextStage(f.stage, step);
  if (!to) return { status: 409, body: { error: refusal(f.stage, step), stage: f.stage } };
  const t = ist();
  const at = x.at ?? null;
  const photoM = at ? Math.round(Math.hypot((at.lon - f.head.lo) * KX, (at.lat - f.head.la) * KY)) : null;
  let moved: { dept: string; due: string } | null = null;
  if (step === "done") await intelPool.query(`UPDATE ${ops("followups")} SET status = 'done', last_checked_at = ? WHERE followup_id = ?`, [t, id]);
  else if (step === "reopen") await intelPool.query(`UPDATE ${ops("followups")} SET status = 'pending', last_checked_at = ?${x.due ? ", due_date = ?" : ""} WHERE followup_id = ?`, x.due ? [t, x.due, id] : [t, id]);
  else if (step === "verify") await intelPool.query(`UPDATE ${ops("followups")} SET last_checked_at = ? WHERE followup_id = ?`, [t, id]);
  else if (step === "withdraw") await intelPool.query(`UPDATE ${ops("followups")} SET status = 'closed', last_checked_at = ? WHERE followup_id = ?`, [t, id]);
  else if (step === "reassign") {
    // another department and/or due date: the header carries both, so it is written again (the note and place stay)
    const dept = x.dept || f.head.d;
    const due = x.due || (f.head.u ? f.head.u.slice(0, 10) : null) || t.slice(0, 10);
    const [row] = await q(`SELECT summary FROM ${ops("followups")} WHERE followup_id = ?`, [id]);
    const dec = row ? decodeSummary(String(row.summary)) : null;
    if (!dec) return { status: 404, body: { error: "No such fix." } };
    const head: TaskHead = { ...dec.head, d: dept, u: `${due} 23:59:59` };
    const h = TAG + JSON.stringify(head) + " ";
    const to = dept !== f.head.d ? await officerOf(dept).catch(() => null) : null;
    await intelPool.query(`UPDATE ${ops("followups")} SET summary = ?, due_date = ?${to ? ", contact_id = ?" : ""} WHERE followup_id = ?`,
      to ? [h + dec.text.slice(0, Math.max(0, 500 - h.length)), due, to.id, id] : [h + dec.text.slice(0, Math.max(0, 500 - h.length)), due, id]);
    moved = { dept, due };
  }
  const after = { t, stage: to, remarks: x.remarks ?? null, ...(step === "done" ? { status: "done" } : {}), ...(step === "withdraw" ? { status: "closed" } : {}),
    ...(moved ? { from_dept: f.head.d, dept: moved.dept, due: moved.due } : {}), ...(step === "reopen" && x.due ? { due: x.due } : {}),
    ...(x.confirmedWith ? { confirmed_with: x.confirmedWith } : {}), ...(x.photo ? { photo: x.photo, photo_m: photoM, at } : {}) };
  await intelPool.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, ?, 'followups', ?, ?, ?)`,
    [who.user, STEP_ACTION[step], String(id), JSON.stringify({ stage: f.stage, status: f.status }), JSON.stringify(after)]);
  if (step !== "progress") bumpDataEpoch();
  return { status: 200, body: { ok: true, stage: to, photoM, near: photoM == null ? null : photoM <= PHOTO_OK_M } };
}

/** the officer's words must say what was done */
export const MIN_REMARKS = 5;

/**
 * The officer console's step on one task: a fix takes an update or done, each with what was done (and an optional photo);
 * a before-rain job is marked done (remarks optional), as before.
 */
export async function officerStep(id: number, dept: string, user: string, step: "progress" | "done", remarks: string | null, photo: string | null,
  at: { lat: number; lon: number } | null): Promise<{ status: number; body: Row }> {
  const [r] = await q(`SELECT summary FROM ${ops("followups")} WHERE followup_id = ?`, [id]);
  const dec = r ? decodeSummary(String(r.summary)) : null;
  if (!dec) return { status: 404, body: { error: "No such task." } };
  if (parseFixKey(dec.head.k)) {
    if (dec.head.d !== dept) return { status: 403, body: { error: "This fix belongs to another department." } };
    if (!remarks || remarks.trim().length < MIN_REMARKS) return { status: 400, body: { error: "Write what was done (a few words at least)." } };
    return stepFix(id, step, { role: "officer", user, dept }, { remarks: remarks.trim(), photo, at });
  }
  if (step !== "done") return { status: 400, body: { error: "A before-rain job is marked done; updates are for fixes after a rain." } };
  return markDone(id, dept, user, photo, at, remarks?.trim() || null);
}
