// reviewerG-04 (reviewer G's probe on hunt2-ops-09, kept as a lasting guard): what Ask District IQ's planner lane reads, the SELECT-only
// account may read.
//
// The planner lane runs its compiled SELECTs as the SELECT-only account (compile.ts readOnly(): roPool() when ASSISTANT_RO_DB_USER is set).
// scripts/create-assistant-ro-user.sql grants that account, in district_intel_ops, only listed columns of listed tables. hunt2-ops-09 made
// effective.ts's status read district_intel_ops.officer_steps too (on MySQL once setup:officer has run), and compile.ts reads
// incidents.status_std through effectiveSql().status. With no grant on officer_steps every planned question that groups, filters or lists
// by status failed with MySQL error 1142 (SELECT command denied ... for table 'officer_steps'). The console's own reads use the full-rights
// pool, so nothing else sees it: this test checks every ops table and column the compiled SQL names against the script's grants.
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";
import { OPS_DB } from "@/lib/collector/db";

const g = globalThis as { __diqOfficerSteps?: boolean };
// a MySQL server where `npm run setup:officer` has run: the server's check (instrumentation-node.ts) sets this
beforeAll(() => { g.__diqOfficerSteps = true; });
afterAll(() => { delete g.__diqOfficerSteps; });

/** district_intel_ops tables (and their granted columns) in the SELECT-only account's script */
function grants(): Map<string, Set<string> | "all"> {
  const sql = fs.readFileSync(path.join(process.cwd(), "scripts", "create-assistant-ro-user.sql"), "utf8").replace(/^--.*$/gm, "");
  const out = new Map<string, Set<string> | "all">();
  for (const m of sql.matchAll(/GRANT SELECT\s*(\(([^)]*)\))?\s*ON\s+`district_intel_ops`\.`(\w+)`/g)) {
    out.set(m[3], m[2] ? new Set(m[2].split(",").map((c) => c.trim().replace(/`/g, ""))) : "all");
  }
  return out;
}

/** the ops tables the SQL names, and the columns read through each alias they are given */
function reads(sql: string): { tables: string[]; columns: { table: string[]; column: string }[] } {
  const named = [...sql.matchAll(new RegExp("`" + OPS_DB + "`\\.`(\\w+)`(?:\\s+(?:AS\\s+)?(\\w+))?", "gi"))];
  const byAlias = new Map<string, Set<string>>();
  for (const m of named) if (m[2] && !/^(WHERE|ON|JOIN|LEFT|INNER|GROUP|ORDER|LIMIT|AND|OR)$/i.test(m[2])) {
    (byAlias.get(m[2]) ?? byAlias.set(m[2], new Set()).get(m[2])!).add(m[1]);
  }
  const columns: { table: string[]; column: string }[] = [];
  for (const [alias, tables] of byAlias) {
    for (const m of sql.matchAll(new RegExp(`(?<![\\w.\`])${alias}\\.\`?(\\w+)\`?`, "g"))) columns.push({ table: [...tables], column: m[1] });
  }
  return { tables: [...new Set(named.map((m) => m[1]))], columns };
}

const plan = (p: Partial<PlanQuery>): PlanQuery => ({ id: "q1", purpose: "status", table: "incidents", measures: [{ fn: "count", field: null, alias: "n" }],
  dimensions: [], filters: [], timeRange: null, compare: null, sort: [], limit: 10, derive: [], ...p }) as PlanQuery;

describe("reviewerG-04: what the planner lane reads, the SELECT-only account may read", () => {
  it.each([
    ["incidents by status", plan({ dimensions: [{ field: "status_std", alias: "status", grain: null }] })],
    ["incidents under review", plan({ filters: [{ field: "status_std", op: "eq", value: "Under review", values: null }] })],
    ["still-open incidents", plan({ filters: [{ field: "is_open", op: "eq", value: true, values: null }] })],
    ["resolved incidents by closing day", plan({ dimensions: [{ field: "closed_at", alias: "day", grain: "day" }],
      filters: [{ field: "verified", op: "eq", value: true, values: null }] })]
  ])("%s: every ops table and column the SQL names is granted", (_name, p) => {
    const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
    const c = compileQuery(p, cat, "2026-11-12 12:00:00", null);
    const r = reads(`${c.countSql}\n${c.sql}`);
    expect(r.tables).toContain("collector_decisions"); // the status reads the Collector's decisions
    const have = grants();
    expect(r.tables.filter((t) => !have.has(t))).toEqual([]);
    const missing = r.columns.filter((x) => !x.table.some((t) => { const gt = have.get(t); return gt === "all" || !!gt?.has(x.column); }));
    expect(missing).toEqual([]);
  });

  it("the status reads officer_steps when the table is there, so the script grants it (only the columns the rule reads)", () => {
    const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
    const c = compileQuery(plan({ dimensions: [{ field: "status_std", alias: "status", grain: null }] }), cat, "2026-11-12 12:00:00", null);
    const r = reads(c.sql);
    expect(r.tables).toContain("officer_steps");
    // the column check above sees the step table's columns (it is not passing on an empty list)
    expect(new Set(r.columns.filter((x) => x.table.includes("officer_steps")).map((x) => x.column))).toEqual(new Set(["step_id", "incident_id", "dept_code", "step", "at"]));
    expect(grants().get("officer_steps")).toEqual(new Set(["step_id", "incident_id", "dept_code", "step", "at"]));
  });
});
