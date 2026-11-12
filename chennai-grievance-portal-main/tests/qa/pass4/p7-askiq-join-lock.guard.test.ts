// QA pass 7, reviewer4-01 (P0): an officer's planned Ask District IQ query never reads another department's rows through a join.
// Pass 6 held only the base table to the department, so ref_categories joined back to incidents listed 313 incidents of GCC-HLT/GCC-ENG for a
// GCC-SWM officer (count_distinct 3604 against 3291 own). Real catalog and real compileQuery + runCompiled on the pinned snapshot, a frozen
// clock, no model. The filters below ask for the OTHER departments' rows outright (what pipeline.ts's lockQuery would strip; compileQuery
// itself must hold), so any row back is a leak.
//   QA_PIN_PORT=3195 timeout 600 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p7-askiq-join-lock.guard.test.ts < /dev/null
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pool from "@/lib/collector/db";
import { asOf } from "@/lib/collector/intel";
import { loadCatalog, type Catalog } from "@/lib/assistant/catalog";
import { compileQuery, runCompiled, type PlanQuery } from "@/lib/assistant/compile";

const DEPT = "GCC-SWM";
const SCOPE = { period: "monthly", zone: null, dept: DEPT, cat: null, taluk: null } as never;
const plan = (table: string, p: Partial<PlanQuery>): PlanQuery => ({ id: "q1", purpose: "probe", table, measures: [], dimensions: [], filters: [], timeRange: null,
  compare: null, sort: [], limit: 100, derive: [], ...p });
const dims = (...fields: string[]) => fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null }));
const not = (field: string) => ({ field, op: "ne" as const, value: DEPT, values: null });

let cat: Catalog;
let now = "";
let own = 0;
const leadDept = new Map<string, string>();
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") });
  now = await asOf();
  cat = await loadCatalog();
  const [rows] = await pool.query(`SELECT incident_id, lead_dept FROM incidents`) as unknown as [{ incident_id: string; lead_dept: string }[]];
  for (const r of rows) leadDept.set(r.incident_id, r.lead_dept);
  own = rows.filter((r) => r.lead_dept === DEPT).length;
}, 300_000);
afterAll(() => { vi.useRealTimers(); });

const run = async (p: PlanQuery) => (await runCompiled(compileQuery(p, cat, now, SCOPE, DEPT), now)).rows;
/** incident ids in the rows that another department handles */
const others = (rows: Record<string, unknown>[], key = "d0") => rows.map((r) => r[key]).filter((v): v is string => typeof v === "string" && !!v && leadDept.get(v) !== DEPT);

describe("QA pass 7, reviewer4-01: a GCC-SWM officer's planned query reads no other department's rows through a join", () => {
  it("the snapshot has other departments' incidents under GCC-SWM categories (the bridge exists)", async () => {
    const [r] = await pool.query(`SELECT COUNT(*) AS n FROM incidents i JOIN ref_categories c ON c.category_code = i.category_code WHERE c.lead_dept = ? AND i.lead_dept <> ?`, [DEPT, DEPT]) as unknown as [{ n: number }[]];
    console.log(`[bridge] incidents of other departments under ${DEPT}-led categories: ${r[0].n}; own incidents ${own}`);
    expect(Number(r[0].n)).toBeGreaterThan(0);
  });

  it("ref_categories -> incidents (the row's repro): no other department's incident, and no more incidents than its own", async () => {
    const rows = await run(plan("ref_categories", { dimensions: dims("incidents.incident_id", "incidents.title"), filters: [not("incidents.lead_dept")] }));
    expect(others(rows), JSON.stringify(rows.slice(0, 3))).toEqual([]);
    const [n] = await run(plan("ref_categories", { measures: [{ fn: "count_distinct", field: "incidents.incident_id", alias: "n" }] }));
    console.log(`[ref_categories -> incidents] distinct incidents reached ${n.n}, own ${own}`);
    expect(Number(n.n)).toBeLessThanOrEqual(own);
  });

  for (const [base, field, filter] of [["documents", "incidents.incident_id", "incidents.lead_dept"], ["actions", "incidents.incident_id", "incidents.lead_dept"],
    ["events", "incidents.incident_id", "incidents.lead_dept"], ["gaps", "incidents.incident_id", "incidents.lead_dept"], ["dept_assignments", "incidents.incident_id", "incidents.lead_dept"],
    ["ref_departments", "incidents.incident_id", "incidents.lead_dept"], ["ref_zones", "incidents.incident_id", "incidents.lead_dept"],
    ["ref_wards", "incidents.incident_id", "incidents.lead_dept"], ["v_collector_queue", "incidents.incident_id", "incidents.lead_dept"]] as const) {
    it(`${base} -> incidents: no other department's incident`, async () => {
      const rows = await run(plan(base, { dimensions: dims(field), filters: [not(filter)] }));
      expect(others(rows), JSON.stringify(rows.slice(0, 3))).toEqual([]);
    });
  }

  it("ref_categories -> events and ref_offices / ref_departments -> actions: no other department's record", async () => {
    const ev = await run(plan("ref_categories", { dimensions: dims("events.event_id", "events.lead_dept"), filters: [not("events.lead_dept")] }));
    const ac = await run(plan("ref_offices", { dimensions: dims("actions.action_id", "actions.dept_code"), filters: [not("actions.dept_code")] }));
    const ad = await run(plan("ref_departments", { dimensions: dims("actions.action_id", "actions.dept_code"), filters: [not("actions.dept_code")] }));
    expect([...ev, ...ac, ...ad].filter((r) => r.d0 != null)).toEqual([]);
  });

  it("incidents -> events / actions / documents: the joined rows are the department's own", async () => {
    const ev = await run(plan("incidents", { dimensions: dims("events.event_id", "events.lead_dept"), filters: [not("events.lead_dept")] }));
    const ac = await run(plan("incidents", { dimensions: dims("actions.action_id", "actions.dept_code"), filters: [not("actions.dept_code")] }));
    const dc = await run(plan("incidents", { dimensions: dims("documents.doc_id", "documents.department"), filters: [not("documents.department")] }));
    expect([...ev, ...ac, ...dc].filter((r) => r.d0 != null)).toEqual([]);
  });

  it("a shared table still answers for the officer, joined to its own incidents (ward names, counts)", async () => {
    const rows = await run(plan("incidents", { measures: [{ fn: "count", field: null, alias: "n" }], dimensions: dims("ref_wards.zone_name"), limit: 20 }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((a, r) => a + Number(r.n), 0)).toBeLessThanOrEqual(own);
  });
});
