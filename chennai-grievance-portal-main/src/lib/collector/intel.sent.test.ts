// 27 Nov 2026: an officer may send a case of any severity for the Collector's approval, so My Tasks (sentByOfficer) takes every sent case.
// The "Severe, not yet checked" tile and the list it opens (notYetChecked) still count severe cases only: a Low case sent for approval is
// in My Tasks, not among the severe cases (the tile, its list and the Briefing's "N severe cases ... not yet checked" read this rule).
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => {
  (globalThis as { __diqOfficerSteps?: boolean }).__diqOfficerSteps = true;
  return { db: null as unknown as import("node:sqlite").DatabaseSync };
});
const run = (sql: string, params: unknown[] = []) => {
  // the officer tables are there (officerOpsReady)
  if (/information_schema\.tables/i.test(sql)) return [[{ n: 2 }]];
  const [s, p] = expand(translate(sql), params);
  let st;
  for (let tries = 0; !st; tries++) {
    try {
      st = h.db.prepare(s);
    } catch (e) {
      const msg = String((e as Error).message);
      if (/no such table/i.test(msg)) return [[]];
      const col = /no such column: (?:i|w)\.(\w+)/.exec(msg)?.[1];
      if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
      throw e;
    }
  }
  return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes) }]; })();
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/collector/db", () => ({
  default: pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", TITLE: "i.title", CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => "2026-11-27 12:00:00" }));

const intel = await import("@/lib/collector/intel");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT,
      family TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER, verified INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT, priority_score REAL, awaiting_collector INTEGER);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, status TEXT, assigned_by TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Solid Waste Management', 'GCC', 'SE', '', 1);`);
  return db;
}
function incident(id: string, sev: string) {
  h.db.prepare(`INSERT INTO incidents (incident_id, title, lead_dept, category_label, category_code, zone_no, zone_name, severity_level, status_std,
    citizen_complaints, outlet_count, verified, first_reported_at, sla_due_at, sla_breached, is_open, last_update_at, media_only, priority_score, awaiting_collector)
    VALUES (?, 'Garbage not cleared', 'GCC-SWM', 'Garbage', 'SOLID_WASTE', 9, 'Teynampet', ?, 'Under review', 1, 0, 1, '2026-11-26 09:00:00', '2026-11-28 09:00:00',
    0, 1, '2026-11-26 09:00:00', 0, 1, 0)`).run(id, sev);
}
const send = (id: string) => h.db.prepare(`INSERT INTO officer_steps (incident_id, dept_code, step, actor, at) VALUES (?, 'GCC-SWM', 'send', 'swm@x', '2026-11-27 10:00:00')`).run(id);
const ids = async (status: string) => ((await intel.list({ period: "quarterly", zone: null, dept: null, sev: null, status, q: null, sort: "t", dir: -1, page: 0, scope: "all" }))
  .rows as unknown as { id: string }[]).map((r) => r.id).sort();

describe("a case of any severity sent for approval", () => {
  beforeEach(() => { h.db = fresh(); });
  afterAll(() => { delete (globalThis as { __diqOfficerSteps?: boolean }).__diqOfficerSteps; });

  it("is in My Tasks whatever its severity", async () => {
    incident("INC-LOW", "Low"); send("INC-LOW");
    incident("INC-SEV", "Severe"); send("INC-SEV");
    expect(await ids("awaiting")).toEqual(["INC-LOW", "INC-SEV"]);
  });
  it("is counted as 'Severe, not yet checked' only when it is severe", async () => {
    incident("INC-LOW", "Low"); send("INC-LOW");
    incident("INC-SEV", "Severe"); send("INC-SEV");
    expect(await ids("critical")).toEqual(["INC-SEV"]);
  });
});
