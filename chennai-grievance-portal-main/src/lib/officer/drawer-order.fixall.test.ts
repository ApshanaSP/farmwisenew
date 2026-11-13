/**
 * reviewerD-01, reviewerD-02 (on officer-day-24, 7251e564 / 6a4be084). The fix gave one order to a step and a Collector decision in the
 * same second (steps by step_id, decisions by decision_id, the department's close at its resolve decision's id, a step before a
 * decision in the same second) for the stage, the returned flag and the citizen's tracker, but the officer's own drawer (grievanceDetail)
 * still merged by time with steps first: a send-back and the close in the same second ended "Returned by Collector" under a Verified stage,
 * and the close's own report was marked returned (D-01). closedByDept was "the last step was a close", so a case sent back after the
 * department's close still drew "Closed by your department" (done) beside the Returned banner (D-02). Reviewer D's probe, plus the
 * reverse same-second order.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  return /^\s*(SELECT|WITH)/i.test(s)
    ? [st.all(...(p as never[]))]
    : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }]; })();
};
const pool = {
  query: async (sql: string, params: unknown[] = []) => run(sql, params),
  getConnection: async () => ({
    query: async (sql: string, params: unknown[] = []) => run(sql, params),
    beginTransaction: async () => void h.db.exec("BEGIN"),
    commit: async () => void h.db.exec("COMMIT"),
    rollback: async () => void h.db.exec("ROLLBACK"),
    release: () => undefined
  })
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));

const { grievanceDetail } = await import("./data");

const SWM = { code: "GCC-SWM", name: "Solid Waste Management", org: "GCC", head: "SE", route: "AE → EE", short: "SWM", remarkHint: "" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, action TEXT, table_name TEXT, record_id TEXT,
      before_value TEXT, after_value TEXT);
    CREATE TABLE incident_timeline (incident_id TEXT, at TEXT, step TEXT, note TEXT, actor TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);
    CREATE TABLE documents (doc_id TEXT, publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, owner TEXT, body_hash TEXT, approved_at TEXT,
      to_contact_ids TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT, status TEXT);`);
  return db;
}

function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const step = (id: string, s: string, at: string, reportId: number | null = null) =>
  h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, note, report_id, actor, at) VALUES (?, 'GCC-SWM', ?, 'Cleared', ?, 'swm@x', ?)`).run(id, s, reportId, at);
const decide = (id: string, d: string, at: string, note: string | null = null, role = "collector") =>
  h.db.prepare(`INSERT INTO collector_decisions (incident_id, decision, note, decided_by, decided_role, decided_at) VALUES (?, ?, ?, 'c@x', ?, ?)`).run(id, d, note, role, at);
/** The department's own close as recordStep writes it, report included: the report, the close step, then a resolve by its officer. */
function closeByDept(id: string, at: string) {
  const r = h.db.prepare(`INSERT INTO officer_reports (incident_id, dept_code, remarks, photo_dir, photos, sent_by, sent_at) VALUES (?, 'GCC-SWM', 'Cleared', ?, '[]', 'swm@x', ?)`)
    .run(id, `dir-${id}-${at}`, at);
  step(id, "close", at, Number(r.lastInsertRowid));
  decide(id, "resolve", at, "Closed by the department: Cleared", "department_officer");
}

describe("officer-day-24 (reviewerD): the officer's drawer reads the same order as the stage", () => {
  beforeEach(() => { h.db = fresh(); });
  const T = "2026-10-14 11:00:00";

  it("a send-back, then the department's close, in the same second: the close's report is not 'Returned' and the timeline ends with the close", async () => {
    incident("INC-C");
    step("INC-C", "approve", "2026-10-14 10:00:00");
    decide("INC-C", "reopen", T, "Not done");
    closeByDept("INC-C", T);
    const d = (await grievanceDetail(SWM, "INC-C"))!;
    expect(d.grievance.stage).toBe("verified"); // passes: the stage uses the one order
    expect(d.closedByDept).toBe(true);
    // fails today: the close's own completion report carries the Collector's earlier send-back
    expect(d.reports[0].returned).toBeFalsy();
    // fails today: steps sort before decisions on a same-second tie, so the drawer's history ends "Returned by Collector"
    expect(d.timeline[d.timeline.length - 1].label).toBe("Closed by department");
  });

  it("the department's close, then a later send-back: the step bar is not drawn as closed by the department", async () => {
    incident("INC-R");
    step("INC-R", "approve", "2026-10-14 10:00:00");
    closeByDept("INC-R", "2026-10-14 10:30:00");
    decide("INC-R", "reopen", T, "Not done");
    const d = (await grievanceDetail(SWM, "INC-R"))!;
    expect([d.grievance.stage, d.grievance.returned]).toEqual(["action", true]); // passes
    // fails today: the last officer step is still the close, so Steps() draws "Closed by your department" (done) beside the Returned banner
    expect(d.closedByDept).toBe(false);
  });

  it("the department's close, then a send-back, in the same second: returned everywhere, the drawer included", async () => {
    incident("INC-S");
    step("INC-S", "approve", "2026-10-14 10:00:00");
    closeByDept("INC-S", T);
    decide("INC-S", "reopen", T, "Not done");
    const d = (await grievanceDetail(SWM, "INC-S"))!;
    expect([d.grievance.stage, d.grievance.returned]).toEqual(["action", true]);
    expect(d.reports[0].returned).toMatchObject({ note: "Not done" });
    expect(d.timeline[d.timeline.length - 1].label).toBe("Returned by Collector");
    expect(d.closedByDept).toBe(false);
  });
});
