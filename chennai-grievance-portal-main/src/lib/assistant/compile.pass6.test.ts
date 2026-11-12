/**
 * QA pass 6, P6-014 (redsec2-03): an officer's Ask District IQ question is held to the officer's department only by the console-scope filter
 * in compileQuery, which adds "lead_dept/dept_code/department = ?" when the table has such a column and silently adds nothing when it has
 * none. A model-planned query on v_collector_queue, alerts, v_media_gaps or hotspots therefore read every department's rows for an officer.
 * compileQuery now takes the lock itself: a table with no department column is held through its incident_id, or refused.
 * Real catalog (the schema snapshot); the compiled SQL is the proof, no model call.
 */
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const LOCK = { period: "monthly", zone: null, dept: "GCC-ELE", cat: null, taluk: null } as never;
const list = (table: string, fields: string[]): PlanQuery => ({ id: "q1", purpose: "list", table, measures: [], dimensions: fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null })),
  filters: [], timeRange: null, compare: null, sort: [], limit: 50, derive: [] });
const has = (t: string) => cat.tables.has(t);
const colsOf = (t: string) => [...(cat.tables.get(t)?.columns.keys() ?? [])];

describe("QA pass 6, P6-014: an officer's planned query is held to the officer's department on every table", () => {
  it("incidents: the department filter, as before", () => {
    const c = compileQuery(list("incidents", ["incident_id", "title"]), cat, "2026-11-12 12:00:00", LOCK, "GCC-ELE");
    expect(c.params).toContain("GCC-ELE");
  });
  for (const t of ["v_collector_queue", "alerts", "v_media_gaps", "hotspots"]) {
    it(`${t}: held to the department, or refused; never every department's rows`, () => {
      if (!has(t)) return;
      const cols = colsOf(t);
      const fields = cols.filter((c) => !/^(lat|lon)$/.test(c)).slice(0, 2);
      let compiled: ReturnType<typeof compileQuery> | null = null;
      try { compiled = compileQuery(list(t, fields), cat, "2026-11-12 12:00:00", LOCK, "GCC-ELE"); } catch (e) { expect(String((e as Error).message)).toMatch(/department/i); return; }
      expect(compiled.params, compiled.sql).toContain("GCC-ELE");
    });
  }
  it("the Collector (no lock) is not held or refused on the same tables", () => {
    for (const t of ["v_collector_queue", "alerts", "v_media_gaps", "hotspots"].filter(has)) {
      const fields = colsOf(t).filter((c) => !/^(lat|lon)$/.test(c)).slice(0, 2);
      const c = compileQuery(list(t, fields), cat, "2026-11-12 12:00:00", { ...(LOCK as object), dept: null } as never, null);
      expect(c.params).not.toContain("GCC-ELE");
    }
  });
});
