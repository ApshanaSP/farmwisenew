/**
 * 27 Nov: the chatbot's own queries on mandi_market_prices leave out the "Anna Nagar" and "K.K. Nagar" rows (Madurai's and
 * Tiruchirappalli's markets, which the AGMARKNET collector filed as Chennai's), as the console's price reads do (tnprices.marketRows).
 */
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const plan = (p: Partial<PlanQuery> = {}): PlanQuery => ({ id: "q1", purpose: "x", table: "mandi_market_prices", measures: [{ fn: "avg", field: "modal_price", alias: "p" }],
  dimensions: [{ field: "market", alias: "d0", grain: null }], filters: [], timeRange: null, compare: null, sort: [], limit: 10, derive: [], ...p }) as PlanQuery;

describe("the chatbot's market price queries", () => {
  it("never count the Madurai and Tiruchirappalli markets, with or without the department lock", () => {
    for (const lock of [null, "GCC-SWM"]) {
      const sql = compileQuery(plan(), cat, "2026-11-27 12:00:00", null, lock).sql;
      expect(sql).toMatch(/b\.`market` NOT IN \('Anna Nagar', 'K\.K\. Nagar'\)/);
      expect(sql).toMatch(/b\.`date` <= DATE\(\?\)/);
    }
  });
});
