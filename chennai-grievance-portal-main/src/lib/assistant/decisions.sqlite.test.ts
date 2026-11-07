/**
 * A decision closes an incident everywhere at once (docs/qa/BUGS.md BUG-035): Ask District IQ's figures, on an isolated in-memory
 * store through the same MySQL -> SQLite translation the AWS store uses. The console's own tiles are covered in lib/collector.
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  return [h.db.prepare(s).all(...(p as never[]))];
};
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/db")>()), default: { query: async (sql: string, params: unknown[] = []) => run(sql, params) }, ops: (t: string) => t, TITLE: "i.title" }));

const { deptBacklog, zoneAttention } = await import("./queries");

const NOW = "2026-11-05 12:00:00";
const scope = { period: "daily", zone: null, dept: null, cat: null, taluk: null } as never;

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, lead_dept TEXT, zone_no INTEGER, zone_name TEXT, severity_level TEXT, is_open INTEGER, citizen_complaints INTEGER,
      first_reported_at TEXT, hours_open REAL, sla_breached INTEGER, sla_due_at TEXT, category_code TEXT, taluk_code TEXT, status_std TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT);
    CREATE TABLE ref_wards (ward_no INTEGER, zone_no INTEGER, zone_name TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT);
    INSERT INTO ref_wards VALUES (178, 13, 'Adyar');
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drain');
  `);
  const ins = db.prepare(`INSERT INTO incidents VALUES (?, 't', 'GCC-SWD', 13, 'Adyar', 'High', ?, 2, ?, 5, 0, NULL, 'FLOOD_WATERLOGGING', NULL, 'Open')`);
  for (let k = 1; k <= 6; k++) ins.run(`INC-${k}`, 1, "2026-11-05 09:00:00");
  ins.run("INC-7", 0, "2026-11-05 09:00:00"); // closed by the pipeline
  return db;
}

describe("Ask District IQ's figures follow the Collector's decisions (BUG-035)", () => {
  beforeEach(() => { h.db = fresh(); });
  const decide = (id: string, decision: string) => h.db.prepare("INSERT INTO collector_decisions (incident_id, decision) VALUES (?, ?)").run(id, decision);

  it("a resolved incident leaves the zone's open count and its complaints", async () => {
    expect(await zoneAttention(scope, NOW)).toMatchObject([{ zone: 13, open: 6, complaints: 12 }]);
    decide("INC-1", "resolve");
    expect(await zoneAttention(scope, NOW)).toMatchObject([{ zone: 13, open: 5, complaints: 10 }]);
  });
  it("a rejected incident leaves it, and a reopened one comes back", async () => {
    decide("INC-1", "reject");
    decide("INC-7", "reopen");
    expect(await zoneAttention(scope, NOW)).toMatchObject([{ zone: 13, open: 6 }]);
  });
  it("the latest decision wins, and a note changes nothing", async () => {
    decide("INC-1", "resolve");
    decide("INC-1", "reopen");
    decide("INC-2", "note");
    expect(await zoneAttention(scope, NOW)).toMatchObject([{ zone: 13, open: 6 }]);
  });
  it("the backlog counts only what is still open", async () => {
    expect(await deptBacklog(null)).toMatchObject([{ code: "GCC-SWD", n: 6 }]);
    decide("INC-1", "resolve");
    expect(await deptBacklog(null)).toMatchObject([{ code: "GCC-SWD", n: 5 }]);
  });
});

describe("no other figure reads the pipeline's flag alone", () => {
  // these files add up what is open for the Collector or an officer; intel.ts lays decisions on in code, and rehearsal and the search index are not live figures
  it.each(["lib/assistant/queries.ts", "lib/assistant/warnings.ts", "lib/assistant/news.ts", "lib/officer/insights.ts", "lib/collector/aibrief.ts", "lib/collector/briefbook.ts", "lib/collector/insights.ts", "lib/collector/threads.ts", "lib/collector/actionmail.ts"])("%s", (f) => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", f), "utf8");
    expect(src.match(/\bi\.is_open\b/g) ?? []).toEqual([]);
  });
});
