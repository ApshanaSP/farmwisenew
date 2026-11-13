// p7-askiq-writer-lock-03: a table held by its own department column (events, actions, documents, dept_assignments, gaps) also names the
// incident each record was merged into (incident_id; documents.linked_incident_id), and that incident can be another department's: an
// officer's record merged into a Health incident gave the Health incident's id to a Solid Waste officer. The row stays the officer's (it is
// held by its department column, so the officer's own records are still counted); the incident it names is read through the officer's
// department's incidents, so another department's incident id is never returned, whatever table names it and however the plan uses it.
// Compiled on the pinned snapshot (as the other lock tests are), and run on SQLite through the AWS store's dialect.
import { DatabaseSync } from "node:sqlite";
import { format } from "mysql2";
import { beforeAll, describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type Compiled, type PlanQuery } from "@/lib/assistant/compile";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const AS_OF = "2026-11-06 12:00:00";
const DEPT = "GCC-SWM";
const plan = (table: string, p: Partial<PlanQuery>): PlanQuery => ({ id: "q1", purpose: "probe", table, measures: [], dimensions: [], filters: [], timeRange: null,
  compare: null, sort: [], limit: 50, derive: [], ...p });
const dims = (...fields: string[]) => fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null }));
const count = [{ fn: "count" as const, field: null, alias: "n" }];
const locked = (p: PlanQuery) => compileQuery(p, cat, AS_OF, null, DEPT);

/** each table held by its department column, and its column naming an incident */
const NAMING: [string, string, string][] = [["events", "incident_id", "lead_dept"], ["actions", "incident_id", "dept_code"], ["gaps", "incident_id", "lead_dept"],
  ["dept_assignments", "incident_id", "dept_code"], ["documents", "linked_incident_id", "department"]];

// one store: a Solid Waste record of each table merged into a Health incident (INC-HLT), one in a Solid Waste incident (INC-SWM), one with none
let db: DatabaseSync;
beforeAll(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  db = new DatabaseSync(":memory:");
  registerFunctions(db);
  for (const name of ["incidents", ...NAMING.map(([t]) => t)]) {
    const t = cat.tables.get(name)!;
    db.exec(`CREATE TABLE ${name} (${[...t.columns.keys()].map((c) => `"${c}"`).join(", ")})`);
  }
  db.exec(`INSERT INTO incidents (incident_id, lead_dept, title) VALUES ('INC-HLT', 'GCC-HLT', 'Dengue cluster'), ('INC-SWM', 'GCC-SWM', 'Garbage pile')`);
  for (const [t, col, dept] of NAMING) {
    // within the as-of cap on the table's time column
    const time = cat.tables.get(t)!.time;
    const at = (v: string) => (time ? `, '2026-11-01 10:00:00'` : "") + v;
    db.exec(`INSERT INTO ${t} ("${col}", "${dept}"${time ? `, "${time}"` : ""}) VALUES ('INC-HLT', 'GCC-SWM'${at(")")}, ('INC-SWM', 'GCC-SWM'${at(")")},
      (NULL, 'GCC-SWM'${at(")")}, ('INC-HLT', 'GCC-HLT'${at(")")}`);
  }
});
const run = (c: Compiled): Record<string, unknown>[] => {
  const [s, p] = expand(translate(c.sql), c.params);
  return db.prepare(s).all(...(p as never[])) as Record<string, unknown>[];
};
const ids = (rows: Record<string, unknown>[]) => rows.flatMap((r) => Object.values(r)).filter((v) => typeof v === "string" && v.startsWith("INC-"));

describe("p7-askiq-writer-lock-03: another department's incident id is never returned to an officer", () => {
  for (const [table, col, dept] of NAMING) {
    it(`${table}.${col}: grouped by, its own records still counted; the Health incident's id is not given`, () => {
      const rows = run(locked(plan(table, { measures: count, dimensions: dims(col) })));
      expect(ids(rows), table).not.toContain("INC-HLT");
      // the officer's three records are all counted: the one in the Health incident with its incident unnamed
      expect(rows.reduce((a, r) => a + Number(r.n), 0), table).toBe(3);
      expect(ids(rows), table).toContain("INC-SWM");
    });
    it(`${table}.${col}: listed, filtered on, and counted distinct`, () => {
      const listed = run(locked(plan(table, { dimensions: dims(col, dept) })));
      expect(listed.length, "records: the officer's three, none hidden").toBe(3);
      expect(ids(listed), "records").not.toContain("INC-HLT");
      const eq = run(locked(plan(table, { measures: count, filters: [{ field: col, op: "eq", value: "INC-HLT", values: null }] })));
      expect(Number(eq[0]?.n ?? 0), "a filter on the other department's id finds nothing").toBe(0);
      const inn = run(locked(plan(table, { measures: count, dimensions: dims(col), filters: [{ field: col, op: "in", value: null, values: ["INC-HLT", "INC-SWM"] }] })));
      expect(ids(inn), "in").toEqual(["INC-SWM"]);
      const distinct = run(locked(plan(table, { measures: [{ fn: "count_distinct", field: col, alias: "n" }] })));
      expect(Number(distinct[0].n), "count distinct").toBe(1);
    });
  }
  it("the Collector (no lock) still sees every incident each record names", () => {
    for (const [table, col] of NAMING) {
      const rows = run(compileQuery(plan(table, { measures: count, dimensions: dims(col) }), cat, AS_OF, null, null));
      expect(ids(rows), table).toEqual(expect.arrayContaining(["INC-HLT", "INC-SWM"]));
    }
  });
  it("pass 7's probe, on the compiled SQL: events grouped by incident_id reads the id only through the department's incidents", () => {
    const c = locked(plan("events", { measures: count, dimensions: dims("incident_id") }));
    const text = format(c.sql, c.params as never[]);
    // the id selected is not the record's own column, and it comes from the incidents of GCC-SWM
    expect(text).not.toMatch(/SELECT \/\*\+[^*]*\*\/ b\.`incident_id` AS/);
    expect(text).toMatch(/\(SELECT DISTINCT li\.`incident_id` FROM `[a-z_]+`\.`incidents` li WHERE li\.`lead_dept` = 'GCC-SWM'\)/);
    // the records stay held by their own department column
    expect(text).toContain("b.`lead_dept` = 'GCC-SWM'");
    // every "?" of every statement has its parameter
    for (const [sql, params] of [[c.sql, c.params], [c.countSql, c.countParams], [`SELECT 1 FROM ${c.parts.from} WHERE ${c.parts.where}`, c.parts.whereParams]] as const) {
      expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
    }
  });
  it("a table joined from a shared one (ref_wards -> events) names no other department's incident either", () => {
    if (![...cat.tables.get("events")!.columns.values()].some((c) => c.join?.startsWith("ref_wards."))) return;
    const c = locked(plan("ref_wards", { dimensions: dims("ward_no", "events.incident_id") }));
    const text = format(c.sql, c.params as never[]);
    expect(text).not.toMatch(/j1\.`incident_id` AS/);
  });
  it("incidents itself and the tables held through incident_id are unchanged (already the department's incidents)", () => {
    const inc = format(locked(plan("incidents", { measures: count, dimensions: dims("incident_id") })).sql, []);
    expect(inc).not.toContain("SELECT DISTINCT li.");
    const q = format(locked(plan("v_collector_queue", { measures: count, dimensions: dims("incident_id") })).sql, []);
    expect(q).not.toContain("SELECT DISTINCT li.");
  });
});
