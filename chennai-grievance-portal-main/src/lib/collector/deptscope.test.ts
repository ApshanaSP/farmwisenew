import { beforeEach, describe, expect, it, vi } from "vitest";

// pass-2 hunter D (docs/qa/hunt/hunterD.md): D1 the bell, D2 emerging patterns, D4 decisions ignored in the briefing.
// The pool is replaced: every query is recorded with its parameters and answered with no rows.
const seen: { sql: string; params: unknown[] }[] = [];
vi.mock("@/lib/collector/db", async (orig) => {
  const real = await orig<typeof import("@/lib/collector/db")>();
  const fake = { query: async (sql: string, params: unknown[] = []) => { seen.push({ sql, params }); return [[], []]; }, execute: async (sql: string, params: unknown[] = []) => { seen.push({ sql, params }); return [[], []]; }, getConnection: async () => fake };
  return { ...real, default: fake };
});

describe("a department's view keeps to that department", () => {
  beforeEach(() => { seen.length = 0; });
  it("the overview's bell carries only the department's incidents (BUG-026)", async () => {
    const { overview } = await import("./intel");
    await overview("daily", null, "GCC-SWD").catch(() => null);
    const bell = seen.find((x) => /severity_level IN \('Severe', 'High'\)/.test(x.sql) && /LIMIT 6/.test(x.sql));
    expect(bell).toBeTruthy();
    expect(bell!.sql).toMatch(/i\.lead_dept = \?/);
    expect(bell!.params).toContain("GCC-SWD");
  });
  it("emerging patterns and their example headlines keep to the department (BUG-027)", async () => {
    const { insights } = await import("./insights");
    await insights("daily", null, "GCC-SWD").catch(() => null);
    const anomalies = seen.find((x) => /FROM anomalies a/.test(x.sql));
    expect(anomalies).toBeTruthy();
    expect(anomalies!.sql).toMatch(/lead_dept = \?/);
    expect(anomalies!.params).toContain("GCC-SWD");
  });
  it("the briefing counts open incidents with the Collector's decisions on top (BUG-028)", async () => {
    const { insights } = await import("./insights");
    await insights("daily", null, null).catch(() => null);
    const kpi = seen.find((x) => /AS overdue, SUM\(i\.citizen_complaints\) AS complaints/.test(x.sql) || /SUM\(i\.severity_level = 'Severe'\) AS severe, SUM\(/.test(x.sql));
    expect(kpi).toBeTruthy();
    expect(kpi!.sql).toMatch(/collector_decisions/);
    expect(seen.filter((x) => /incidents i/.test(x.sql)).some((x) => /\bi\.is_open\b/.test(x.sql) && !/collector_decisions/.test(x.sql))).toBe(false);
  });
});
