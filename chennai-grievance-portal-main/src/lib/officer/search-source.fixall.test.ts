/**
 * reviewerD-03 (on pass4-open-07, 353848f6): the officer's search matched every event's source_record_id of a case, to find a complaint
 * number filed into it, with no `e.source = 'grievance'` as every other complaint-number lookup has. A news article's doc id
 * ("20260924-0e1229b7e303424e") matched any 2-character hex run, pulling in cases the officer did not mean. Reviewer D's probe.
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

const { search } = await import("./data");

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
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT);`);
  return db;
}
function incident(id: string, o: Record<string, unknown> = {}) {
  const r = { incident_id: id, title: "Garbage not cleared", lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9,
    zone_name: "Teynampet", place_text: "Test Street", severity_level: "Medium", status_std: "Open", citizen_complaints: 1, outlet_count: 0,
    first_reported_at: "2026-10-14 09:00:00", sla_due_at: "2026-10-15 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-10-14 09:00:00", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
}
const event = (id: string, source: string, rec: string, inc: string) =>
  h.db.prepare(`INSERT INTO events (event_id, source, source_record_id, incident_id, text) VALUES (?, ?, ?, ?, 'x')`).run(id, source, rec, inc);

describe("pass4-open-07 (reviewerD): the search finds complaint numbers, not every event's machine id", () => {
  beforeEach(() => { h.db = fresh(); });

  it("a complaint number still finds its case; a news article's internal doc id does not", async () => {
    incident("INC-20261014-AB12CD", { title: "Garbage heap on Test Street" });
    event("GRV-2026-777AAA", "grievance", "2026-777AAA", "INC-20261014-AB12CD");
    incident("INC-20261013-QQQQQQ", { title: "Overflowing bins", first_reported_at: "2026-10-13 09:00:00" });
    event("NEWS-20260924-0e1229b7e303424e", "news", "20260924-0e1229b7e303424e", "INC-20261013-QQQQQQ");
    const ids = async (q: string) => (await search(SWM, q)).map((r) => r.id);
    expect(await ids("777AAA")).toEqual(["INC-20261014-AB12CD"]); // passes: the fix
    // fails today: neither the title, place, id, category nor zone holds "e3"; only the hidden news doc id ("...e303424e") does
    expect(await ids("e3")).toEqual([]);
    expect(await ids("0e1229")).toEqual([]);
  });
});
