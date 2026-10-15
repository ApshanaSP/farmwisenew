/**
 * The officer console's department lock, on an isolated in-memory store through the same MySQL -> SQLite translation the
 * AWS store uses: an officer can read and act on their own department's grievances only, whatever id the request names.
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
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-10-14 12:00:00" }));

const { WorkflowError, grievanceDetail, recordStep } = await import("./data");

const SWD = { code: "GCC-SWD", name: "Storm Water Drains", org: "GCC", head: "EE", route: "AE → EE", short: "SWD", remarkHint: "" };
const ELEC = { ...SWD, code: "GCC-ELEC", name: "Electrical", short: "Elec" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
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
    CREATE TABLE events (event_id TEXT, text TEXT);
    CREATE TABLE documents (publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, created_at TEXT);
    INSERT INTO incidents (incident_id, title, lead_dept, severity_level, status_std, first_reported_at, last_update_at, is_open)
      VALUES ('INC-SWD', 'Drain overflow', 'GCC-SWD', 'Medium', 'Open', '2026-10-13 09:00:00', '2026-10-13 09:00:00', 1),
             ('INC-ELEC', 'Streetlight out', 'GCC-ELEC', 'Medium', 'Open', '2026-10-13 09:00:00', '2026-10-13 09:00:00', 1);`);
  return db;
}
const ME = { email: "swd@x", userId: 20 };

describe("officer department lock", () => {
  beforeEach(() => { h.db = fresh(); });

  it("reads its own department's grievance and not another department's by id", async () => {
    expect((await grievanceDetail(SWD, "INC-SWD"))?.grievance.id).toBe("INC-SWD");
    expect(await grievanceDetail(SWD, "INC-ELEC")).toBeNull();
    expect((await grievanceDetail(ELEC, "INC-ELEC"))?.grievance.id).toBe("INC-ELEC");
  });

  it("cannot approve or close another department's grievance; nothing is written", async () => {
    await expect(recordStep(SWD, "INC-ELEC", "approve", ME)).rejects.toMatchObject({ status: 404 });
    await expect(recordStep(SWD, "INC-ELEC", "close", ME, { remarks: "done", photoDir: "d", photos: ["1.jpg"] })).rejects.toBeInstanceOf(WorkflowError);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM officer_steps").get()).toEqual({ n: 0 });
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM collector_decisions").get()).toEqual({ n: 0 });
  });

  it("acts on its own grievance, with an audit row, and the lock is released", async () => {
    expect(await recordStep(SWD, "INC-SWD", "approve", ME)).toMatchObject({ stage: "approved" });
    expect(h.db.prepare("SELECT dept_code, step FROM officer_steps").all()).toEqual([{ dept_code: "GCC-SWD", step: "approve" }]);
    expect(h.db.prepare("SELECT action FROM audit_log").all()).toEqual([{ action: "officer:approve" }]);
    // approving twice is refused as a stage conflict, not a crash (the lock from the first call was released)
    await expect(recordStep(SWD, "INC-SWD", "approve", ME)).rejects.toMatchObject({ status: 409 });
  });
});
