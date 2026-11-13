/**
 * What has happened to a citizen's complaint since it was filed. The complaint itself lives in the portal's tables
 * (complaints, complaint_status_history); the work on it happens on the incident it became in the district
 * intelligence store: the pipeline files each complaint as a grievance event (events.source_record_id = the complaint
 * number) inside an incident, and the department officer and the Collector act on that incident (officer_steps,
 * officer_reports, collector_decisions in the ops store). Until now nothing carried that work back, so a resident's
 * tracker kept showing the status the complaint was filed with.
 *
 * `progressOf` reads the incident's steps and decisions as the resident's journey (pure, tested). `progressFor` loads
 * them for some complaints; the citizen pages show the result. `syncComplaints` writes it into the complaint and its
 * history when an officer or the Collector acts, so counts and filters by status follow too. Running it again changes
 * nothing (a status is written only when it differs).
 */
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import intelPool, { ops } from "@/lib/collector/db";
import { photoUrl } from "@/lib/officer/photos";
import { RESOLVED_STATUSES } from "@/lib/constants";
import { sendPetitionSms } from "@/lib/manu/sms";
import { appendStatusChangeToDataset } from "@/lib/dataset/append";
import type { ComplaintStatus } from "@/types";
import { CLOSED_BY_DEPARTMENT, scrubCitizenDetails } from "@/lib/collector/scrub";

/** `id`: the row's step_id / decision_id, its place among the case's steps / decisions (without it, the order given) */
export interface WorkStep { step: string; at: string; note: string | null; reportId: number | null; id?: number }
export interface WorkDecision { decision: string; at: string; note: string | null; role: string | null; id?: number }
export interface WorkReport { reportId: number; photoDir: string | null; photos: string[] }
export interface JourneyRow { status: ComplaintStatus; stage: string; remarks: string | null; created_at: string }

export interface Progress {
  incidentId: string;
  status: ComplaintStatus;
  rejectedStage: "Department Officer" | "Collector" | null;
  /** a rejection's reason, for the complaint's remarks */
  remarks: string | null;
  /** who checked the finished work, once it is closed */
  checkedBy: "department" | "collector" | null;
  journey: JourneyRow[];
  /** completion photos of the department's reports that still stand (none from a report the Collector sent back), as URLs the resident may open */
  photos: string[];
}

const DECISIONS = ["verify", "resolve", "reopen", "reject"];

/**
 * The resident's journey from the incident's officer steps and Collector decisions after the complaint was filed,
 * oldest first. Null when nobody has acted yet (the complaint's own status stands). The department's own close is
 * stored as a step and a 'resolve' decision by the officer: the step is read, the decision skipped.
 */
export function progressOf(incidentId: string, filedAt: string, steps: WorkStep[], decisions: WorkDecision[], reports: WorkReport[]): Progress | null {
  // The one order of a case's events that the officer's stage uses too (lib/officer/data.ts DECIDED_AFTER): steps by step_id, decisions
  // by decision_id; a step and a Collector decision in different seconds by time, in the same second the step first. The department's
  // close is also a decision (its officer's resolve), so the close step takes that decision's place among the Collector's: a close and a
  // send-back in the same second were read here as close-then-reopen whatever their ids, while the officer and the Collector read the
  // later decision by id, and the consoles disagreed for good (officer-day-24).
  const inOrder = <T extends { id?: number }>(xs: T[]) => xs.map((x, k) => ({ x, k })).sort((a, b) => (a.x.id ?? a.k) - (b.x.id ?? b.k)).map((e) => e.x);
  const S = inOrder(steps), D = inOrder(decisions);
  const deptCloses = D.filter((d) => d.role === "department_officer" && d.decision === "resolve");
  const closes = S.filter((s) => s.step === "close");
  // each close and its resolve are written together; paired from the latest back, so a close from before the resolve was written keeps its own time
  const anchor = new Map(closes.map((c, j) => [c, deptCloses[deptCloses.length - closes.length + j]] as const).filter(([, d]) => d));
  type Ev = { at: string; rank: number; seq: number; s?: WorkStep; d?: WorkDecision };
  const evs: Ev[] = [
    ...S.filter((s) => s.at >= filedAt).map((s, k): Ev => {
      const d = anchor.get(s);
      return d ? { at: d.at, rank: 1, seq: D.indexOf(d), s } : { at: s.at, rank: 0, seq: k, s };
    }),
    ...D.map((d, k) => ({ d, k })).filter(({ d }) => d.at >= filedAt && DECISIONS.includes(d.decision) && d.role !== "department_officer")
      .map(({ d, k }): Ev => ({ at: d.at, rank: 1, seq: k, d }))
  ].sort((a, b) => a.at.localeCompare(b.at) || a.rank - b.rank || a.seq - b.seq);
  if (!evs.length) return null;

  const journey: JourneyRow[] = [];
  const reportIds = new Set<number>();
  let rejectedStage: Progress["rejectedStage"] = null, remarks: string | null = null, checkedBy: Progress["checkedBy"] = null;
  const add = (status: ComplaintStatus, stage: string, text: string | null, at: string) => journey.push({ status, stage, remarks: text, created_at: at });
  for (const e of evs) {
    if (e.s) {
      const note = e.s.note?.trim() || null;
      if (e.s.reportId != null) reportIds.add(e.s.reportId);
      if (e.s.step === "approve") add("Approved by Department Officer", "Department Officer", "Accepted by the department; work will be scheduled.", e.at);
      else if (e.s.step === "action") add("In Progress", "Department Officer", "Work has started.", e.at);
      else if (e.s.step === "send") add("Completed - Pending Collector Verification", "Department Officer", note ? `Work done: ${note}` : "Work done; sent to the Collector's office to check.", e.at);
      else if (e.s.step === "close") {
        add("Resolved by Department", "Department Officer", note ? `Work done and checked by the department: ${note}` : "Work done and checked by the department.", e.at);
        checkedBy = "department";
      }
      continue;
    }
    const d = e.d!;
    if (d.decision === "verify" || d.decision === "resolve") {
      add("Verified by Collector", "Collector", "The Collector's office checked the work and closed the complaint.", e.at);
      checkedBy = "collector";
    } else if (d.decision === "reopen") {
      add("In Progress", "Collector", "The Collector's office returned it to the department for more work.", e.at);
      checkedBy = null;
      // the report it sent back no longer stands: its photos are not "the work done" (officer-day-28); the next report's are
      reportIds.clear();
    } else if (d.decision === "reject") {
      add("Rejected", "Collector", d.note?.trim() || "Rejected by the Collector's office.", e.at);
      rejectedStage = "Collector";
      remarks = d.note?.trim() || null;
    }
  }
  if (!journey.length) return null;
  const last = journey[journey.length - 1];
  if (last.status !== "Rejected") rejectedStage = null, remarks = null;
  if (!["Resolved by Department", "Verified by Collector"].includes(last.status)) checkedBy = null;
  const photos = reports.filter((r) => reportIds.has(r.reportId) && r.photoDir).flatMap((r) => r.photos.map((p) => photoUrl(r.photoDir!, p)));
  return { incidentId, status: last.status, rejectedStage, remarks, checkedBy, journey, photos };
}

type Row = Record<string, any>;
const fmt = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;
const str = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v ?? ""));

/** The incident each complaint was filed into (the pipeline's grievance event). */
export async function incidentsOf(codes: string[]): Promise<Map<string, string>> {
  if (!codes.length) return new Map();
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT source_record_id AS code, incident_id AS inc FROM events WHERE source = 'grievance' AND source_record_id IN (?) AND incident_id IS NOT NULL`, [codes]);
  return new Map(rows.map((r) => [String(r.code), String(r.inc)]));
}

/**
 * Who will check the finished work of the case a complaint was filed into: the Collector for a severe case, else the department itself
 * (only a severe case may be sent to the Collector: officer/data.ts). Null when the case is not in this build. The citizen's tracker was
 * not told, and promised every complaint the Collector's verification (officer-day-06).
 */
export async function checkerOf(code: string): Promise<"collector" | "department" | null> {
  return (await caseFacts(code))?.checker ?? null;
}

/**
 * The case a complaint was filed into, as the consoles hold it: who checks the work (above) and when it is due (the build's own deadline
 * for its kind and severity, officer-day-02). Null when the case is not in this build.
 */
export async function caseFacts(code: string): Promise<{ checker: "collector" | "department"; dueAt: string | null } | null> {
  const id = (await incidentsOf([code])).get(code);
  if (!id) return null;
  const [rows] = await intelPool.query<RowDataPacket[]>(`SELECT severity_level, sla_due_at FROM incidents WHERE incident_id = ? LIMIT 1`, [id]);
  if (!rows[0]) return null;
  return { checker: String(rows[0].severity_level) === "Severe" ? "collector" : "department", dueAt: rows[0].sla_due_at ? str(rows[0].sla_due_at) || null : null };
}

/** The complaint numbers filed into these incidents. */
async function codesOf(incidentIds: string[]): Promise<string[]> {
  if (!incidentIds.length) return [];
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT DISTINCT source_record_id AS code FROM events WHERE source = 'grievance' AND incident_id IN (?)`, [incidentIds]);
  return rows.map((r) => String(r.code));
}

/** Progress for complaints (number → filed at); a complaint nobody has acted on is left out. */
export async function progressFor(complaints: { code: string; createdAt: unknown }[]): Promise<Map<string, Progress>> {
  const out = new Map<string, Progress>();
  if (!complaints.length) return out;
  const inc = await incidentsOf(complaints.map((c) => c.code));
  const ids = [...new Set(inc.values())];
  if (!ids.length) return out;
  const [steps] = await intelPool.query<RowDataPacket[]>(
    `SELECT step_id, incident_id, step, note, report_id, ${fmt("at")} AS at FROM ${ops("officer_steps")} WHERE incident_id IN (?)`, [ids]);
  const [decisions] = await intelPool.query<RowDataPacket[]>(
    `SELECT decision_id, incident_id, decision, note, decided_role, ${fmt("decided_at")} AS at FROM ${ops("collector_decisions")} WHERE incident_id IN (?)`, [ids]);
  const [reports] = await intelPool.query<RowDataPacket[]>(
    `SELECT report_id, incident_id, photo_dir, photos FROM ${ops("officer_reports")} WHERE incident_id IN (?)`, [ids]);
  const by = <T>(rows: Row[], map: (r: Row) => T) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(String(r.incident_id)) ?? m.set(String(r.incident_id), []).get(String(r.incident_id))!).push(map(r));
    return m;
  };
  const S = by(steps, (r): WorkStep => ({ id: Number(r.step_id), step: String(r.step), at: str(r.at), note: r.note == null ? null : scrubCitizenDetails(String(r.note)), reportId: r.report_id == null ? null : Number(r.report_id) }));
  const D = by(decisions, (r): WorkDecision => ({ id: Number(r.decision_id), decision: String(r.decision), at: str(r.at), note: r.note == null ? null : r.decided_role === "department_officer" || String(r.note).startsWith(CLOSED_BY_DEPARTMENT) ? scrubCitizenDetails(String(r.note)) : r.note, role: r.decided_role ?? null }));
  const R = by(reports, (r): WorkReport => {
    let photos: string[] = [];
    try { photos = Array.isArray(r.photos) ? r.photos : JSON.parse(String(r.photos ?? "[]")); } catch { /* none */ }
    return { reportId: Number(r.report_id), photoDir: r.photo_dir ?? null, photos: photos.map(String) };
  });
  for (const c of complaints) {
    const id = inc.get(c.code);
    if (!id) continue;
    const p = progressOf(id, str(c.createdAt), S.get(id) ?? [], D.get(id) ?? [], R.get(id) ?? []);
    if (p) out.set(c.code, p);
  }
  return out;
}

/**
 * Writes the progress of the complaints filed into these incidents: status, rejection stage and reason, and one
 * history row for each step not yet recorded. Called after an officer step or a Collector decision is saved; a failure
 * is logged and the citizen pages still read the progress directly.
 */
export async function syncComplaints(incidentIds: string[], actorUserId: number | null): Promise<number> {
  try {
    const codes = await codesOf(incidentIds);
    if (!codes.length) return 0;
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT id, complaint_code, status, remarks, created_at FROM complaints WHERE complaint_code IN (?)`, [codes]);
    const prog = await progressFor(rows.map((r) => ({ code: String(r.complaint_code), createdAt: r.created_at })));
    let changed = 0;
    const closing: Promise<void>[] = [];
    const grew: string[] = [];
    for (const r of rows) {
      const p = prog.get(String(r.complaint_code));
      if (!p) continue;
      const [had] = await pool.query<RowDataPacket[]>(`SELECT status, ${fmt("created_at")} AS at FROM complaint_status_history WHERE complaint_id = ?`, [r.id]);
      const seen = new Set(had.map((h) => `${h.status}|${str(h.at)}`));
      const added = p.journey.filter((x) => !seen.has(`${x.status}|${x.created_at}`));
      for (const j of added)
        await pool.query(`INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [r.id, j.status, j.stage, j.remarks, actorUserId, j.created_at]);
      if (added.length) grew.push(String(r.complaint_code));
      if (r.status !== p.status) {
        await pool.query(`UPDATE complaints SET status = ?, rejected_stage = ?, remarks = COALESCE(?, remarks) WHERE id = ?`,
          [p.status, p.rejectedStage, p.remarks, r.id]);
        changed++;
        // a Manu's writer is told when the work on it ends; for any other complaint this does nothing. Side by side, not one after another:
        // each waits up to its inline limit, so a decision over several petitions waited that limit once per petition (QA pass 6, P6-010)
        if (p.status === "Rejected") closing.push(sendPetitionSms(String(r.complaint_code), "closed", "rejected"));
        else if ((RESOLVED_STATUSES as readonly string[]).includes(p.status)) closing.push(sendPetitionSms(String(r.complaint_code), "closed", "done"));
      }
    }
    await Promise.all(closing);
    // the grievance dataset gets the new history rows too, as a filing gets its line (PB-218, pass4-open-01). Fire-and-forget, like the
    // filing's: a dataset problem must never fail or slow down an officer's step or a Collector's decision. Started once this is done,
    // on the next turn of the event loop: the first read of the dataset file is parsed in one go and must not hold up the decision.
    if (grew.length)
      setImmediate(() => { for (const code of grew) appendStatusChangeToDataset(code).catch((err) => console.error(`[dataset] could not append ${code}:`, err)); });
    return changed;
  } catch (e) {
    console.warn(`[complaints] progress not written for ${incidentIds.join(", ")}: ${(e as Error).message}`);
    return 0;
  }
}

/** May this citizen see a completion photo? Only when the report is on an incident one of their complaints is in. */
export async function citizenMayViewReport(userId: number, photoDir: string): Promise<boolean> {
  const [r] = await intelPool.query<RowDataPacket[]>(`SELECT incident_id FROM ${ops("officer_reports")} WHERE photo_dir = ?`, [photoDir]);
  if (!r.length) return false;
  const codes = await codesOf(r.map((x) => String(x.incident_id)));
  if (!codes.length) return false;
  const [own] = await pool.query<RowDataPacket[]>(`SELECT 1 FROM complaints WHERE user_id = ? AND complaint_code IN (?) LIMIT 1`, [userId, codes]);
  return own.length > 0;
}

/**
 * The remarks to show with the progress laid over a complaint. A rejection's reason belongs to the rejection: once the
 * complaint has moved on (the Collector sent it back) the reason is dropped, whether it was copied into the stored
 * remarks or not. Other remarks (the complaint's own) stay (RC-26, PB-180).
 */
export function remarksFor(stored: unknown, p: Progress | null | undefined): string | null {
  const own = stored == null || stored === "" ? null : String(stored);
  if (!p) return own;
  if (p.status === "Rejected") return p.remarks ?? own;
  const reasons = new Set(p.journey.filter((j) => j.status === "Rejected").map((j) => j.remarks));
  return own != null && reasons.has(own) ? null : own;
}

/** The complaint's own history with the progress laid over it (oldest first); the progress decides the status. */
export function withProgress<T extends { status: string; created_at: unknown }>(history: T[], p: Progress | null | undefined): (T | JourneyRow)[] {
  if (!p) return history;
  const key = (h: { status: string; created_at: unknown }) => `${h.status}|${str(h.created_at).slice(0, 16)}`;
  const have = new Set(history.map(key));
  return [...history, ...p.journey.filter((j) => !have.has(key(j)))].sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)));
}

/**
 * RC-47 (PB-315): complaints filed with this department that are not in its queue yet. The officer queue is built from the
 * pipeline's incidents, so a new complaint shows there only after the next refresh. This counts the ones still waiting (filed in the
 * last `days` days, not yet worked, with no grievance event), so the officer can be told they are on the way.
 */
export async function awaitingQueue(portalName: string | undefined, days = 7, now: Date = new Date()): Promise<number> {
  if (!portalName) return 0;
  const since = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.complaint_code AS code FROM complaints c JOIN departments d ON d.id = c.department_id
      WHERE d.name = ? AND c.status IN ('Complaint Filed', 'Pending Approval') AND c.created_at >= ? LIMIT 500`, [portalName, since]);
  const codes = rows.map((r) => String(r.code));
  if (!codes.length) return 0;
  const seen = await incidentsOf(codes);
  return codes.filter((c) => !seen.has(c)).length;
}
