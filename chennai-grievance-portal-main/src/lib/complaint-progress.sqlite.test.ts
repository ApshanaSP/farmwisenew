/**
 * BUG-4 end to end on an isolated in-memory copy (no team data touched): a citizen's complaint, the grievance event
 * the pipeline filed it as, and the officer's and the Collector's work on that incident, through the same
 * MySQL -> SQLite translation the AWS store uses. The work reaches the complaint's status and history once.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = h.db.prepare(s);
    return /^\s*SELECT/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t }));
const { citizenMayViewReport, progressFor, syncComplaints } = await import("./complaint-progress");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, user_id INTEGER, status TEXT, rejected_stage TEXT, remarks TEXT, created_at TEXT);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INTEGER, status TEXT, stage TEXT, remarks TEXT, changed_by INTEGER, created_at TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, at TEXT);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, photo_dir TEXT, photos TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    INSERT INTO complaints VALUES (1, '2026-111AAA', 50, 'Pending Approval', NULL, NULL, '2026-10-10 09:00:00'),
                                  (2, '2026-222BBB', 51, 'Pending Approval', NULL, NULL, '2026-10-10 10:00:00'),
                                  (3, '2026-333CCC', 50, 'Pending Approval', NULL, NULL, '2026-10-10 10:00:00');
    INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at)
      VALUES (1, 'Complaint Filed', 'Citizen', 'Complaint registered by citizen.', 50, '2026-10-10 09:00:00');
    -- two residents reported the same drain: one incident; a third complaint is elsewhere
    INSERT INTO events VALUES ('GRV-2026-111AAA', 'grievance', '2026-111AAA', 'INC-1'), ('GRV-2026-222BBB', 'grievance', '2026-222BBB', 'INC-1'),
                              ('GRV-2026-333CCC', 'grievance', '2026-333CCC', 'INC-2');`);
  return db;
}
const status = (id: number) => (h.db.prepare(`SELECT status FROM complaints WHERE id = ?`).get(id) as { status: string }).status;
const history = (id: number) => (h.db.prepare(`SELECT status FROM complaint_status_history WHERE complaint_id = ? ORDER BY created_at, id`).all(id) as { status: string }[]).map((r) => r.status);

describe("officer and Collector work reaches the residents' complaints", () => {
  beforeEach(() => { h.db = fresh(); });

  it("an approval reaches both complaints in the incident, once, and not the other incident's", async () => {
    h.db.exec(`INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES ('INC-1', 'GCC-SWD', 'approve', '2026-10-10 11:00:00')`);
    expect(await syncComplaints(["INC-1"], 9)).toBe(2);
    expect([status(1), status(2), status(3)]).toEqual(["Approved by Department Officer", "Approved by Department Officer", "Pending Approval"]);
    expect(history(1)).toEqual(["Complaint Filed", "Approved by Department Officer"]);
    expect(await syncComplaints(["INC-1"], 9)).toBe(0); // again: nothing changes, no second history row
    expect(history(1)).toEqual(["Complaint Filed", "Approved by Department Officer"]);
  });

  it("completion report, return for rework, then the Collector's check", async () => {
    h.db.exec(`INSERT INTO officer_reports VALUES (7, 'INC-1', '20261011-0123456789abcdef', '["1.jpg"]');
      INSERT INTO officer_steps (incident_id, dept_code, step, note, report_id, at) VALUES ('INC-1', 'GCC-SWD', 'send', 'Desilted', 7, '2026-10-11 16:00:00');`);
    await syncComplaints(["INC-1"], 9);
    expect(status(1)).toBe("Completed - Pending Collector Verification");
    h.db.exec(`INSERT INTO collector_decisions (incident_id, decision, decided_role, decided_at) VALUES ('INC-1', 'reopen', 'collector', '2026-10-12 09:00:00')`);
    await syncComplaints(["INC-1"], 1);
    expect(status(1)).toBe("In Progress");
    h.db.exec(`INSERT INTO officer_steps (incident_id, dept_code, step, note, report_id, at) VALUES ('INC-1', 'GCC-SWD', 'send', 'Desilted again', 7, '2026-10-13 10:00:00');
      INSERT INTO collector_decisions (incident_id, decision, decided_role, decided_at) VALUES ('INC-1', 'verify', 'collector', '2026-10-13 12:00:00');`);
    await syncComplaints(["INC-1"], 1);
    expect(status(1)).toBe("Verified by Collector");
    expect(history(1)).toEqual(["Complaint Filed", "Completed - Pending Collector Verification", "In Progress",
      "Completed - Pending Collector Verification", "Verified by Collector"]);
    const p = (await progressFor([{ code: "2026-111AAA", createdAt: "2026-10-10 09:00:00" }])).get("2026-111AAA")!;
    expect(p.photos).toEqual(["/api/officer/photos/20261011-0123456789abcdef/1.jpg"]);
  });

  it("a completion photo is shown to the residents of that incident only", async () => {
    h.db.exec(`INSERT INTO officer_reports VALUES (7, 'INC-1', '20261011-0123456789abcdef', '["1.jpg"]')`);
    expect(await citizenMayViewReport(50, "20261011-0123456789abcdef")).toBe(true);
    expect(await citizenMayViewReport(51, "20261011-0123456789abcdef")).toBe(true);
    expect(await citizenMayViewReport(52, "20261011-0123456789abcdef")).toBe(false);
    expect(await citizenMayViewReport(50, "20261011-ffffffffffffffff")).toBe(false);
  });
});
