// reviewerG-02: the Collector's status SQL (effective.ts EFF.status, EFF.laterStep) was built once, when each module loaded (intel.ts ROW,
// assistant/incidents.ts COLS, the INC columns of briefbook, insights and aibrief, and every `const EFF = effectiveSql(...)`), so whatever
// officerStepsOn() said at that moment stood for the life of the process, whatever a later check found. Now `status` and `laterStep` are
// read when a query is built, and those column lists are built when read.
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/lib/collector/db", () => ({
  default: { query: async (sql: string) => { h.sql.push(sql); return [[]]; } },
  ops: (t: string) => `\`district_intel_ops\`.\`${t}\``, OPS_DB: "district_intel_ops", INTEL_DB: "district_intel", TITLE: "i.title", CLUSTER: "i.incident_id"
}));
vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] }, connectionSettings: () => ({}) }));
vi.mock("@/lib/collector/lakes", () => ({ cmwssbLakes: async () => null }));

const g = globalThis as { __diqOfficerSteps?: boolean; __diqOfficerStepsRecheck?: () => void };
// the modules load with the step table off (MySQL not checked yet, or not up)
g.__diqOfficerSteps = false;
const intel = await import("@/lib/collector/intel");
const asked = await import("@/lib/assistant/incidents");
const { effectiveSql } = await import("@/lib/collector/effective");
const EFF = effectiveSql("`district_intel_ops`.`collector_decisions`");

beforeEach(() => { h.sql = []; g.__diqOfficerSteps = false; delete g.__diqOfficerStepsRecheck; });
afterEach(() => { delete g.__diqOfficerSteps; });

describe("reviewerG-02: the status SQL follows the step table's check, not the moment a module loaded", () => {
  it("an EFF built before the check reads officer steps once the check finds the table, and stops when it is gone", () => {
    expect(EFF.status).not.toMatch(/officer_steps/);
    g.__diqOfficerSteps = true;
    expect(EFF.status).toMatch(/`district_intel_ops`\.`officer_steps`/);
    expect(EFF.laterStep).toMatch(/officer_steps/);
    g.__diqOfficerSteps = false;
    expect([EFF.status, EFF.laterStep].join(" ")).not.toMatch(/officer_steps/);
    // an explicit steps table is kept as given
    expect(effectiveSql("d", "i", null).status).not.toMatch(/officer_steps/);
    g.__diqOfficerSteps = false;
    expect(effectiveSql("d", "i", "s_tbl").status).toMatch(/s_tbl/);
  });

  it("the console's case page (intel.ts ROW) and Ask's incidents (COLS), loaded with it off, read steps once it is on", async () => {
    await intel.incident("INC-1");
    await asked.incidentsByIds(["INC-1"]);
    expect(h.sql.filter((s) => /officer_steps/.test(s))).toEqual([]);
    g.__diqOfficerSteps = true;
    h.sql = [];
    await intel.incident("INC-1");
    await asked.incidentsByIds(["INC-1"]);
    expect(h.sql.filter((s) => /^\s*SELECT i\.incident_id AS id/.test(s) && /officer_steps/.test(s)).length).toBe(2);
  });

  it("no module builds a status-bearing column list at load", () => {
    const files = ["collector/intel.ts", "assistant/incidents.ts", "collector/briefbook.ts", "collector/insights.ts", "collector/aibrief.ts"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", f), "utf8");
      // a top-level `const X = \`...${EFF.status}...\`` (a template string, not a function) is built once, at load
      const decls = src.split(/\r?\n(?=\S)/).filter((d) => /^(export )?const \w+ = `/.test(d));
      expect(decls.filter((d) => /\$\{EFF\.(status|laterStep)\}/.test(d)).map((d) => `${f}: ${d.slice(0, 40)}`)).toEqual([]);
    }
  });
});
