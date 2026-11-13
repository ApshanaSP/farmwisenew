/**
 * The officer console's data (lib/officer/data.ts) on an isolated in-memory store, through the same MySQL -> SQLite translation the AWS
 * store uses (the harness of deptlock.sqlite.test.ts). Fix-all round 2, the officer console batch.
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

const { grievanceDetail, grievanceList, search } = await import("./data");

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

/** One incident of the department (defaults: a Medium garbage case reported at 09:00 today, open, due tomorrow 09:00). */
function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const step = (id: string, s: string, at: string, note: string | null = null) =>
  h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, note, actor, at) VALUES (?, 'GCC-SWM', ?, ?, 'swm@x', ?)`).run(id, s, note, at);

describe("officer console data", () => {
  beforeEach(() => { h.db = fresh(); });

  describe("officer-day-26: the API's next step follows the case's severity", () => {
    it("a Medium case in action: the next step is the department's own close, not a send to the Collector", async () => {
      incident("INC-MED");
      step("INC-MED", "approve", "2026-10-14 10:00:00");
      const d = await grievanceDetail(SWM, "INC-MED");
      expect(d?.grievance.stage).toBe("approved");
      expect(d?.next).toBe("close");
    });
    it("a Severe case in action is sent; a new one is approved; a verified one has none", async () => {
      incident("INC-SEV", { severity_level: "Severe" });
      incident("INC-NEW");
      incident("INC-DONE", { status_std: "Resolved", is_open: 0 });
      step("INC-SEV", "approve", "2026-10-14 10:00:00");
      expect((await grievanceDetail(SWM, "INC-SEV"))?.next).toBe("send");
      expect((await grievanceDetail(SWM, "INC-NEW"))?.next).toBe("approve");
      expect((await grievanceDetail(SWM, "INC-DONE"))?.next).toBeNull();
    });
  });

  describe("officer-day-22: the search finds text with '_' and '%' in it on the AWS store", () => {
    it("'bin_50' and '50% full' find the case that says so, and '_' and '%' are not wildcards", async () => {
      incident("INC-A", { title: "Garbage bin_50% full near the school" });
      incident("INC-B", { title: "Garbage bin 50 is full" });
      const ids = async (q: string) => (await search(SWM, q)).map((r) => r.id).sort();
      expect(await ids("bin_50")).toEqual(["INC-A"]);
      expect(await ids("50% full")).toEqual(["INC-A"]);
      expect(await ids("bin_50% full")).toEqual(["INC-A"]);
      expect(await ids("full")).toEqual(["INC-A", "INC-B"]);
      const l = await grievanceList(SWM, { tab: "all", period: "daily", zone: null, taluk: null, page: 0, per: 50, cat: null, q: "bin_50" });
      expect(l.rows.map((r) => r.id)).toEqual(["INC-A"]);
    });
  });
});
