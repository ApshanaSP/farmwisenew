// reviewer4 (QA pass 6): the P6-014 lock under compare=previous_period, filters with IN, joined time fields, on every lockable table.
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const D = "GCC-ELE";
const SCOPE = { period: "monthly", zone: 5, dept: D, cat: null, taluk: null } as never;
const qmarks = (s: string) => (s.match(/\?/g) ?? []).length;
// the value bound to the lock's own "?" (the last "= ?" or "lead_dept` = ?)" before LIMIT)
const lockValue = (sql: string, params: unknown[]) => {
  const at = Math.max(sql.lastIndexOf("lead_dept` = ?)"), ...["lead_dept", "dept_code", "department"].map((c) => sql.lastIndexOf(`b.\`${c}\` = ?`)));
  if (at < 0) return "NO-LOCK";
  const idx = qmarks(sql.slice(0, at)) + (sql.slice(at).indexOf("?") >= 0 ? 0 : 0);
  return params[idx];
};

describe("reviewer4 P6-014: lock with previous_period on every lockable table", () => {
  for (const [name, t] of cat.tables) {
    if (!t.time) continue;
    it(name, () => {
      const firstText = [...t.columns.values()].find((c) => /char|text/.test(c.type) && c.role !== "geo" && !["lead_dept", "dept_code", "department"].includes(c.name));
      const pq: PlanQuery = { id: "q1", purpose: "x", table: name, measures: [{ fn: "count", field: null, alias: "n" }], dimensions: firstText ? [{ field: firstText.name, alias: "d0", grain: null }] : [],
        filters: firstText ? [{ field: firstText.name, op: "not_in", value: null, values: ["zzz", "yyy"] }] : [], timeRange: { field: null, mode: "relative", last: 7, unit: "day", from: null, to: null },
        compare: "previous_period", sort: [], limit: 10, derive: [] };
      let c;
      try { c = compileQuery(pq, cat, "2026-11-12 12:00:00", SCOPE, D); } catch (e) { console.log(`[r4-prev] ${name}: refused ${(e as Error).message.slice(0, 80)}`); return; }
      const cur = { q: qmarks(c.sql), p: c.params.length, lock: lockValue(c.sql, c.params) };
      const prev = c.previous ? { q: qmarks(c.previous.sql), p: c.previous.params.length, lock: lockValue(c.previous.sql, c.previous.params) } : null;
      const count = { q: qmarks(c.countSql), p: c.countParams.length, lock: lockValue(c.countSql, c.countParams) };
      console.log(`[r4-prev] ${name}: cur=${JSON.stringify(cur)} prev=${JSON.stringify(prev)} count=${JSON.stringify(count)}`);
      expect(cur.q).toBe(cur.p); expect(prev?.q).toBe(prev?.p); expect(count.q).toBe(count.p);
      expect([cur.lock, prev?.lock, count.lock]).toEqual([D, D, D]);
    });
  }
});
