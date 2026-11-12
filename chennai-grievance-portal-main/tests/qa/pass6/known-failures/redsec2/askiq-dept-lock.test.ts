// QA pass 6, redsec2: an officer's Ask District IQ question is locked to the officer's department only by the console-scope
// filter in compileQuery (SCOPE_COLUMNS: lead_dept | dept_code | department). pipeline.ts planAndRun applies
// compileQuery(lockQuery(q), cat, now, { ...scope, dept: lockDept }) to ANY catalog table the planner names, and several
// tables have no department column at all, so the lock silently adds nothing (no model call here: the compiled SQL is the proof).
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { compileQuery, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const LOCK = { period: "monthly", zone: null, dept: "GCC-ELE", cat: null, taluk: null } as never; // officerB's lock, as pipeline.ts:2359 passes it

const listQuery = (table: string, fields: string[]): PlanQuery => ({
  id: "q1", purpose: "list", table, measures: [], dimensions: fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null })),
  filters: [], timeRange: null, compare: null, sort: [], limit: 50, derive: []
});

describe("redsec2: Ask District IQ department lock", () => {
  it("control: incidents gets the officer's department filter", () => {
    const c = compileQuery(listQuery("incidents", ["incident_id", "title"]), cat, "2026-11-12 12:00:00", LOCK);
    console.log("[incidents] has dept filter:", /lead_dept` = \?/.test(c.sql), "params:", JSON.stringify(c.params));
    expect(c.params).toContain("GCC-ELE");
  });

  for (const [table, fields] of [["v_collector_queue", ["title", "attention_reason"]], ["alerts", ["title", "incident_ids"]], ["v_media_gaps", ["incident_id", "title"]], ["hotspots", ["hotspot_id", "top_place"]]] as [string, string[]][]) {
    it(`${table}: no department filter is added for a locked officer`, () => {
      let c;
      try { c = compileQuery(listQuery(table, fields), cat, "2026-11-12 12:00:00", LOCK); } catch (e) { console.log(`[${table}] compile refused: ${(e as Error).message.slice(0, 160)}`); return; }
      console.log(`[${table}] params=${JSON.stringify(c.params)} notes=${JSON.stringify(c.notes)} sql=${c.sql.replace(/\s+/g, " ").slice(0, 260)}`);
      expect(c.params).not.toContain("GCC-ELE");
    });
  }
});
