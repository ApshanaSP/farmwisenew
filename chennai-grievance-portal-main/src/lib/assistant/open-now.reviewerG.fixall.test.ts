// reviewerG-01 (reviewer G's probe on reviewerE-02, f5416530: "OPEN_NOW now used by every open figure"): three open readers still used
// EFF.open (routed news complaints counted as open), so they disagreed with the Ongoing tile:
//   - Ask District IQ's planner lane: compile.ts column() mapped incidents.is_open ("still open") to effectiveSql().open, with no routed half;
//   - intel.ts snapCommon(): the snapshot's "open, seen only in the news" figure (and report()'s news list) read EFF.open = 1;
//   - assistant/warnings.ts prepNow(): "Most open flood problems: <zone> <n>" read effectiveSql().open.
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";

// the pool is made in vi.hoisted: the static imports above (catalog, compile) load the mocked db before this file's own top-level code runs
const h = vi.hoisted(() => {
  const h = { db: null as unknown as DatabaseSync, run: null as unknown as (sql: string, params: unknown[]) => Promise<unknown> };
  return Object.assign(h, { pool: { query: async (sql: string, params: unknown[] = []) => h.run(sql, params) } });
});
h.run = async (sql: string, params: unknown[]) => {
  const [s, p] = expand(translate(sql), params);
  let st;
  for (let tries = 0; !st; tries++) {
    try {
      st = h.db.prepare(s);
    } catch (e) {
      const msg = String((e as Error).message);
      if (/no such table/i.test(msg)) return [[]];
      const col = /no such column: (?:i\.|b\.)?(\w+)$/.exec(msg)?.[1]; // an incidents column (i, or b in the planner lane's SQL)
      if (col && tries < 60) { h.db.exec(`ALTER TABLE incidents ADD COLUMN ${col}`); continue; }
      throw e;
    }
  }
  return /^\s*(SELECT|WITH)/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
};
vi.mock("@/lib/collector/db", () => ({
  default: h.pool, ops: (t: string) => t, OPS_DB: "district_intel_ops", INTEL_DB: "district_intel", TITLE: "i.title",
  CLUSTER: "COALESCE(i.cluster_id, i.incident_id)"
}));
vi.mock("@/lib/db", () => ({ default: h.pool, connectionSettings: () => ({}) }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));

const intel = await import("@/lib/collector/intel");
const warnings = await import("@/lib/assistant/warnings");

const ist = (hoursAgo: number) => new Date(Date.now() + 330 * 60_000 - hoursAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, cluster_id TEXT, category_label TEXT, category_code TEXT, family TEXT,
      lead_dept TEXT, zone_no INTEGER, zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL,
      severity_level TEXT, status_std TEXT, is_open INTEGER, verified INTEGER, citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT,
      source_count INTEGER, channels TEXT, first_reported_at TEXT, summary TEXT, priority_score REAL, sla_breached INTEGER, sla_due_at TEXT,
      closed_at TEXT, hours_open REAL, severity_reasons TEXT, priority_reasons TEXT, attention_reason TEXT, officer TEXT, media_only INTEGER,
      awaiting_collector INTEGER, police_reports INTEGER, last_update_at TEXT, ai_summary TEXT, ai_attention TEXT, ai_next_step TEXT,
      loc_precision_m REAL, persons_affected INTEGER, member_count INTEGER, confidence REAL, hotspot_id TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INTEGER);
    CREATE TABLE ref_wards (ward_no INTEGER, zone_no INTEGER, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
    CREATE TABLE ref_taluks (taluk_code TEXT, name TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT,
      decided_by TEXT, decided_at TEXT);
    CREATE TABLE dept_assignments (incident_id TEXT, dept_code TEXT, officer_name TEXT, officer_designation TEXT, officer_phone TEXT,
      status TEXT, assigned_at TEXT);
    CREATE TABLE incident_members (incident_id TEXT, source TEXT);
    CREATE TABLE metrics (metric TEXT, value TEXT);
    INSERT INTO ref_departments VALUES ('GCC-SWD', 'Storm Water Drains', 'GCC', 'Superintending Engineer', '', 1);
    INSERT INTO ref_wards VALUES (100, 9, 'Teynampet', 'TLK-MYL', 13.04, 80.25);
    INSERT INTO ref_taluks VALUES ('TLK-MYL', 'Mylapore');`);
  return db;
}

function add(id: string, mediaOnly: 0 | 1) {
  h.db.prepare(`INSERT INTO incidents (incident_id, title, cluster_id, category_label, category_code, lead_dept, zone_no, zone_name, taluk_code,
      severity_level, status_std, is_open, verified, citizen_complaints, outlet_count, first_reported_at, sla_breached, media_only,
      awaiting_collector, last_update_at, priority_score, attention_reason, lat, lon, place_text)
    VALUES (?, ?, NULL, 'Drainage', 'DRAINAGE_SEWAGE', 'GCC-SWD', 9, 'Teynampet', 'TLK-MYL', 'High', 'Open', 1, 0, 0, 1, ?, 0, ?, 0, ?, 1, NULL,
      13.05, 80.25, 'Main Road')`).run(id, `Drain ${id}`, ist(3), mediaOnly, ist(2));
}

beforeEach(() => {
  h.db = fresh();
  add("INC-A", 0);  // an ordinary open incident
  add("INC-M", 1);  // open, seen only in the news, not routed
  add("INC-N", 1);  // a news complaint the routing job handed to the department: not open on the console (OPEN_NOW)
  h.db.exec(`INSERT INTO dept_assignments (incident_id, dept_code, status) VALUES ('INC-N', 'GCC-SWD', 'Assigned')`);
});

describe("reviewerG-01: open readers reviewerE-02 left on EFF.open", () => {
  it("Ask's planner lane: a 'still open' filter leaves routed news complaints out, as the Ongoing tile does", async () => {
    const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
    const plan = { id: "q1", purpose: "open now", table: "incidents", measures: [{ fn: "count", field: null, alias: "n" }], dimensions: [],
      filters: [{ field: "is_open", op: "eq", value: true, values: null }], timeRange: null, compare: null, sort: [], limit: 10, derive: [] } as PlanQuery;
    const c = compileQuery(plan, cat, ist(0), null); // as of now: the store's incidents were reported hours ago
    // was: is_open compiled to effectiveSql().open (collector_decisions only); no routed half (dept_assignments)
    expect(c.sql).toMatch(/dept_assignments/);
    const [rows] = (await h.pool.query(c.sql, c.params)) as [{ n: number }[]];
    expect(Number(rows[0].n)).toBe(2); // INC-A and INC-M, as the Ongoing tile
  });

  it("the snapshot's 'open, seen only in the news' figure is a part of the Ongoing tile, not more than it", async () => {
    const ov = await intel.overview("daily", null);
    const snap = await intel.snapCommon({ period: "daily", zone: null, dept: null, cat: null, taluk: null }, ov.now);
    expect(ov.kpi.cur.ongoing).toBe(2); // INC-A and INC-M (passes)
    // was 2 (INC-M and the routed INC-N, which the tile, the zone table and Ask leave out)
    expect(snap.newsOnly).toBe(1);
  });

  it("Ask's flood preparation ('Most open flood problems'): a routed flood complaint is not counted open", async () => {
    h.db.exec(`UPDATE incidents SET category_code = 'FLOOD_WATERLOGGING', category_label = 'Flooding'`);
    const prep = await warnings.prepNow();
    // was Teynampet 3 and three items (the routed INC-N with them)
    expect(prep.zones).toEqual([{ name: "Teynampet", n: 2 }]);
    expect(prep.items.map((x) => x.title).sort()).toEqual(["Drain INC-A", "Drain INC-M"]);
  });
});


