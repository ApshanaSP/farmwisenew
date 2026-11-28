/**
 * The officer's search on a past day (28 Nov 2026): grievanceList's `range` (the dates a search names) lists the department's grievances
 * first reported then, resolved ones too and older than the 90-day queue, and never another department's. On an isolated in-memory store
 * through the AWS store's MySQL -> SQLite translation, as deptlock.sqlite.test.ts.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    return [h.db.prepare(s).all(...(p as never[]))];
  }
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async () => 0, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-11-28 10:00:00" }));

const { grievanceList, search } = await import("@/lib/officer/data");

const SWD = { code: "GCC-SWD", name: "Storm Water Drains", org: "GCC", head: "EE", route: "AE → EE", short: "SWD", remarkHint: "" };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT, actor_user_id INTEGER, at TEXT);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT, sent_by TEXT, sent_at TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT, decided_role TEXT, decided_at TEXT);
    CREATE TABLE events (event_id TEXT, incident_id TEXT, source TEXT, source_record_id TEXT, text TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, created_at TEXT);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, incident_id TEXT, summary TEXT);
    INSERT INTO incidents (incident_id, title, lead_dept, category_label, place_text, zone_name, severity_level, status_std, first_reported_at, last_update_at, is_open) VALUES
      ('SWD-OCT7', 'Drain collapse – Kolathur', 'GCC-SWD', 'Drainage', 'Kolathur', 'Thiru. Vi. Ka. Nagar', 'Medium', 'Resolved', '2026-10-07 10:00:00', '2026-10-09 10:00:00', 0),
      ('SWD-OCT7B', 'Drain overflow – Perambur', 'GCC-SWD', 'Drainage', 'Perambur', 'Thiru. Vi. Ka. Nagar', 'Medium', 'Open', '2026-10-07 18:00:00', '2026-10-07 18:00:00', 1),
      ('SWD-NOV', 'Drain overflow – Kolathur', 'GCC-SWD', 'Drainage', 'Kolathur', 'Thiru. Vi. Ka. Nagar', 'Medium', 'Open', '2026-11-25 09:00:00', '2026-11-25 09:00:00', 1),
      ('SWD-JUN', 'Drain choke – Kolathur', 'GCC-SWD', 'Drainage', 'Kolathur', 'Thiru. Vi. Ka. Nagar', 'Medium', 'Resolved', '2026-06-10 09:00:00', '2026-06-12 09:00:00', 0),
      ('POL-OCT7', 'Chain snatching – Kolathur', 'POL-GCP', 'Crime', 'Kolathur', 'Thiru. Vi. Ka. Nagar', 'Medium', 'Open', '2026-10-07 12:00:00', '2026-10-07 12:00:00', 1);`);
  return db;
}
const list = (q: string | null, from: string, to: string) =>
  grievanceList(SWD, { tab: "all", period: "quarterly", zone: null, taluk: null, page: 0, per: 8, cat: null, q, range: { from, to } });

describe("grievanceList with the dates a search names", () => {
  beforeEach(() => { h.db = fresh(); });

  it("7 Oct: the department's grievances of that day with the words, the resolved one too; never the police case", async () => {
    const r = await list("kolathur", "2026-10-07 00:00:00", "2026-10-08 00:00:00");
    expect(r.rows.map((x) => x.id)).toEqual(["SWD-OCT7"]);
    expect(r.rows[0].stage).toBe("verified");
    const day = await list(null, "2026-10-07 00:00:00", "2026-10-08 00:00:00");
    expect(day.rows.map((x) => x.id)).toEqual(["SWD-OCT7B", "SWD-OCT7"]);
    expect(day.total).toBe(2);
  });

  it("older than the 90-day queue: June is found by its dates", async () => {
    const r = await list("kolathur", "2026-06-01 00:00:00", "2026-07-01 00:00:00");
    expect(r.rows.map((x) => x.id)).toEqual(["SWD-JUN"]);
    // with no dates, the search is of the last 90 days, as before (June is not in it)
    expect((await search(SWD, "kolathur")).map((x) => x.id)).not.toContain("SWD-JUN");
  });
});
