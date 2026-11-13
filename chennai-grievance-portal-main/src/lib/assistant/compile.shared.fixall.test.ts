import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { CompileError, compileQuery, type PlanQuery } from "@/lib/assistant/compile";

// reviewer4-05 (on P6-014): the officer lock refused every table with no department column and no incident_id, so an officer's planned
// question on public reference data that is no department's (AGMARKNET market prices) failed where it worked before. Pass 7 let the
// geography and calendar tables through, column by column; the market price tables hold nothing but public prices.
const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const plan = (table: string, p: Partial<PlanQuery> = {}): PlanQuery => ({ id: "q1", purpose: "x", table, measures: [{ fn: "count", field: null, alias: "n" }], dimensions: [], filters: [],
  timeRange: null, compare: null, sort: [], limit: 10, derive: [], ...p }) as PlanQuery;
const locked = (p: PlanQuery) => { try { return compileQuery(p, cat, "2026-11-12 12:00:00", null, "GCC-SWM").sql; } catch (e) { if (e instanceof CompileError) return "refused"; throw e; } };

describe("reviewer4-05: an officer may ask about public market prices", () => {
  it.each(["mandi_market_prices", "mandi_prices", "mandi_weekly"])("%s compiles under the lock, with no department filter to add", (t) => {
    const sql = locked(plan(t, { dimensions: [{ field: "commodity", alias: "d0", grain: null }] }));
    expect(sql).not.toBe("refused");
    expect(sql).not.toMatch(/lead_dept|incident_id/);
  });
  it("tables built from every department's records stay refused", () => {
    for (const t of ["hotspots", "alerts", "daily_counts", "anomalies", "v_zone_summary", "v_taluk_unresolved", "review_queue"]) expect(locked(plan(t)), t).toBe("refused");
  });
});
