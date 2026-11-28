/**
 * What the Collector can do with a closed case, and what the department answers (the owner's request of 28 Nov):
 *
 *   Reopen            a closed case (resolved or rejected) goes back to the same department's officer as "Reopened", at the top of
 *                     their In action list, with the Collector's remark (what is still wrong, what to check). It is the 'reopen'
 *                     decision every reader already knows (effective.ts: open again; officer stage In action, returned; the citizen's
 *                     tracker In Progress), so every count follows at once. Confirmed with the password, like every decision.
 *   Ask the department  a question about a resolved case; the case stays closed. The officer answers from the case's drawer, and the
 *                     answer shows on the Collector's case page. Kept as notes (lib/cases/rules.ts INQUIRY_TAG): no status changes.
 *
 * Every write is audited (audit_log) with the case's state at that moment, as the decisions route does.
 */
import { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import intelPool, { ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { syncComplaints } from "@/lib/complaint-progress";
import { INQUIRY_TAG, answerTag, answerRefusal, answeredInquiry, collectorRemarkRefusal, wasReopened } from "./rules";

type Row = Record<string, any>;
const fmt = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

export class CaseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** The case as every console reads it now: its department, severity, the pipeline's flag and the effective open flag and status. */
export async function caseNow(id: string): Promise<Row | null> {
  const EFF = effectiveSql(ops("collector_decisions"));
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT i.incident_id AS id, i.lead_dept AS dept, dp.name AS dept_name, i.severity_level AS sev, i.status_std, i.is_open AS pipeline_open,
            i.verified, ${EFF.open} AS open, ${EFF.status} AS status, ${EFF.latest} AS latest
     FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept WHERE i.incident_id = ?`, [id]);
  return rows[0] ?? null;
}

interface Actor { email: string; role: string; userId: number | null }

async function audit(conn: PoolConnection, actor: string, action: string, id: string, before: unknown, after: unknown) {
  await conn.query(`INSERT INTO ${ops("audit_log")} (actor, action, table_name, record_id, before_value, after_value) VALUES (?, ?, 'collector_decisions', ?, ?, ?)`,
    [actor, action, id, JSON.stringify(before), JSON.stringify(after)]);
}

/** The officer workflow's per-case lock (lib/officer/data.ts recordStep takes the same name): a reopen and an officer's step never interleave. */
async function lockCase(conn: PoolConnection, id: string): Promise<() => Promise<void>> {
  const name = `officer:${id}`;
  const [[l]] = await conn.query<RowDataPacket[]>(`SELECT GET_LOCK(?, 5) AS ok`, [name]);
  if (Number(l?.ok) !== 1) throw new CaseError(409, "Someone else is updating this case. Try again in a moment.");
  return async () => { await conn.query(`SELECT RELEASE_LOCK(?)`, [name]).catch(() => undefined); };
}

/**
 * Reopens a closed case and sends it back to its department as Reopened, with the Collector's remark. Refused when the case is open
 * (nothing to reopen) or the remark is missing. Returns the decision's id.
 */
export async function reopenCase(id: string, remark: string, who: Actor): Promise<{ decisionId: number; dept: string }> {
  const bad = collectorRemarkRefusal("reopen", remark);
  if (bad) throw new CaseError(400, bad);
  const conn = await intelPool.getConnection();
  let unlock: (() => Promise<void>) | null = null;
  try {
    unlock = await lockCase(conn, id);
    const c = await caseNow(id);
    if (!c) throw new CaseError(404, "Incident not found.");
    if (Number(c.open) === 1) throw new CaseError(409, "This case is still open, so there is nothing to reopen. Use Send back on a completion report waiting for you.");
    await conn.beginTransaction();
    const note = remark.trim();
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role) VALUES (?, 'reopen', NULL, ?, ?, ?)`,
      [id, note, who.email, who.role]);
    await audit(conn, who.email, "decision:reopen", id, { status: c.status, open: Number(c.open), status_std: c.status_std, severity_level: c.sev },
      { decision_id: res.insertId, decision: "reopen", note, reopened: true, to_dept: c.dept });
    await conn.commit();
    bumpDataEpoch();
    // the residents whose complaints are in it see it reopened on their tracker (complaint-progress.ts progressOf)
    await syncComplaints([id], who.userId);
    return { decisionId: res.insertId, dept: String(c.dept) };
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    if (unlock) await unlock();
    conn.release();
  }
}

/** The Collector's question about a resolved case (it stays closed). A second identical question within 2 minutes is the same one. */
export async function askDepartment(id: string, question: string, who: Actor): Promise<{ decisionId: number; dept: string; again: boolean }> {
  const bad = collectorRemarkRefusal("ask", question);
  if (bad) throw new CaseError(400, bad);
  const c = await caseNow(id);
  if (!c) throw new CaseError(404, "Incident not found.");
  if (Number(c.open) === 1) throw new CaseError(409, "This case is still open: the department is working on it. Ask about a case once it is closed.");
  if (String(c.status) !== "Resolved") {
    const st = String(c.status ?? "closed").toLowerCase();
    throw new CaseError(409, /reject/.test(st) ? "This case was rejected, not resolved: reopen it to send it back to the department."
      : `This case is ${st}, not resolved: reopen it to send it back to the department.`);
  }
  const text = question.trim();
  const [same] = await intelPool.query<RowDataPacket[]>(
    `SELECT decision_id FROM ${ops("collector_decisions")} WHERE incident_id = ? AND decision = 'note' AND escalate_to = ? AND note = ? AND decided_by = ?
       AND decided_at >= NOW() - INTERVAL 2 MINUTE ORDER BY decision_id DESC LIMIT 1`, [id, INQUIRY_TAG, text, who.email]);
  if (same[0]) return { decisionId: Number(same[0].decision_id), dept: String(c.dept), again: true };
  const conn = await intelPool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role) VALUES (?, 'note', ?, ?, ?, ?)`,
      [id, INQUIRY_TAG, text, who.email, who.role]);
    await audit(conn, who.email, "decision:inquiry", id, { status: c.status, open: Number(c.open) }, { decision_id: res.insertId, question: text, to_dept: c.dept });
    await conn.commit();
    bumpDataEpoch();
    return { decisionId: res.insertId, dept: String(c.dept), again: false };
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
}

/** The department officer's answer to one of the Collector's questions on a case of their department. One answer per question. */
export async function answerInquiry(dept: string, id: string, inquiryId: number, text: string, who: Actor): Promise<{ decisionId: number }> {
  const bad = answerRefusal(text);
  if (bad) throw new CaseError(400, bad);
  const conn = await intelPool.getConnection();
  let unlock: (() => Promise<void>) | null = null;
  try {
    unlock = await lockCase(conn, id);
    const [[qn]] = await conn.query<RowDataPacket[]>(
      `SELECT d.decision_id, d.incident_id, i.lead_dept FROM ${ops("collector_decisions")} d JOIN incidents i ON i.incident_id = d.incident_id
       WHERE d.decision_id = ? AND d.incident_id = ? AND d.decision = 'note' AND d.escalate_to = ?`, [inquiryId, id, INQUIRY_TAG]);
    if (!qn || String(qn.lead_dept) !== dept) throw new CaseError(404, "That question was not found on a case of your department.");
    const [done] = await conn.query<RowDataPacket[]>(
      `SELECT decision_id FROM ${ops("collector_decisions")} WHERE incident_id = ? AND decision = 'note' AND escalate_to = ? LIMIT 1`, [id, answerTag(inquiryId)]);
    if (done[0]) throw new CaseError(409, "This question is already answered.");
    await conn.beginTransaction();
    const answer = text.trim();
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role) VALUES (?, 'note', ?, ?, ?, 'department_officer')`,
      [id, answerTag(inquiryId), answer, who.email]);
    await audit(conn, who.email, "officer:answer", id, { inquiry_id: inquiryId }, { decision_id: res.insertId, answer, dept });
    await conn.commit();
    bumpDataEpoch();
    return { decisionId: res.insertId };
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    if (unlock) await unlock();
    conn.release();
  }
}

export interface CaseEvent { kind: "reopened" | "returned" | "closed" | "approved" | "rejected" | "question" | "answer"; t: string; by: string | null; role: string | null; note: string | null }

/**
 * The case's lifecycle for the Collector's case page: whether it can be reopened or asked about now, every reopen / close / question /
 * answer in order, and the questions with their answers (newest first).
 */
export async function caseLifecycle(id: string) {
  const c = await caseNow(id);
  if (!c) return null;
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT decision_id AS did, decision, escalate_to AS tag, note, decided_by AS by_, COALESCE(decided_role, '') AS role, ${fmt("decided_at")} AS t
     FROM ${ops("collector_decisions")} WHERE incident_id = ? ORDER BY decision_id`, [id]);
  const events: CaseEvent[] = [];
  let lastEffect: string | null = null;
  for (const d of rows as Row[]) {
    const dec = String(d.decision);
    if (dec === "note") {
      if (d.tag === INQUIRY_TAG) events.push({ kind: "question", t: String(d.t), by: d.by_ ?? null, role: d.role || null, note: d.note ?? null });
      else if (answeredInquiry(d.tag) != null) events.push({ kind: "answer", t: String(d.t), by: d.by_ ?? null, role: d.role || null, note: d.note ?? null });
      continue;
    }
    if (!["verify", "resolve", "reopen", "reject"].includes(dec)) continue;
    if (dec === "reopen") events.push({ kind: wasReopened("reopen", lastEffect, c.pipeline_open) ? "reopened" : "returned", t: String(d.t), by: d.by_ ?? null, role: d.role || null, note: d.note ?? null });
    else if (dec === "reject") events.push({ kind: "rejected", t: String(d.t), by: d.by_ ?? null, role: d.role || null, note: d.note ?? null });
    else events.push({ kind: d.role === "department_officer" ? "closed" : "approved", t: String(d.t), by: d.by_ ?? null, role: d.role || null, note: null });
    lastEffect = dec;
  }
  const questions = (rows as Row[]).filter((d) => d.decision === "note" && d.tag === INQUIRY_TAG).reverse().map((qn) => {
    const a = (rows as Row[]).find((x) => x.decision === "note" && answeredInquiry(x.tag) === Number(qn.did));
    return { id: Number(qn.did), t: String(qn.t), question: String(qn.note ?? ""), answer: a ? { t: String(a.t), text: String(a.note ?? ""), by: String(a.by_ ?? "") } : null };
  });
  const open = Number(c.open) === 1;
  return {
    id, dept: String(c.dept ?? ""), deptName: c.dept_name ? String(c.dept_name) : null, open, status: String(c.status ?? ""),
    /** a closed case (resolved or rejected) can be reopened */
    canReopen: !open,
    /** a resolved case can be asked about (a rejected one is reopened instead) */
    canAsk: !open && String(c.status) === "Resolved",
    /** the latest reopen while it stays open: the remark the department is working to */
    // only the LAST reopen counts, and only when it was a reopen of a closed case (a send-back is "returned"); once the department has
    // sent its new report the case waits for the Collector, so the card no longer says it is back with the department
    reopened: (() => {
      if (!open || lastEffect !== "reopen" || /await/i.test(String(c.status ?? ""))) return null;
      const last = [...events].reverse().find((e) => e.kind === "reopened" || e.kind === "returned");
      return last && last.kind === "reopened" ? last : null;
    })(),
    events,
    questions,
    /** questions still waiting for the department's answer */
    pending: questions.filter((x) => !x.answer).length
  };
}
export type CaseLifecycle = NonNullable<Awaited<ReturnType<typeof caseLifecycle>>>;
