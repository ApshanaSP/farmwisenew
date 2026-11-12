/**
 * QA pass 7, reviewer4-01 (P0): an officer's planned query is held to the officer's department on EVERY table it reads, not only its base.
 * Pass 6 put the lock on the base table alone (`b.lead_dept = ?`), so a table joined back along any declared key brought in every row that
 * matched the key, whatever its own department: ref_categories joined to incidents listed another department's incidents and their titles
 * (313 of them for GCC-SWM on the pinned snapshot). The same shape: ref_offices to actions / pwd_works, documents to incidents, actions to
 * incidents. The compiled SQL is the proof here (mysql2's own format puts each bound value where its "?" is, so a lock bound to the wrong
 * placeholder fails too); tests/qa/pass4/p7-askiq-join-lock.guard.test.ts runs the same shapes on the pinned snapshot.
 */
import { format } from "mysql2";
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { CompileError, compileQuery, type Compiled, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const AS_OF = "2026-11-06 12:00:00";
const DEPT = "GCC-SWM";
const SCOPE = { period: "monthly", zone: null, dept: DEPT, cat: null, taluk: null } as never; // as pipeline.ts passes it for an officer
const plan = (table: string, p: Partial<PlanQuery>): PlanQuery => ({ id: "q1", purpose: "probe", table, measures: [], dimensions: [], filters: [], timeRange: null,
  compare: null, sort: [], limit: 50, derive: [], ...p });
const dims = (...fields: string[]) => fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null }));
const DEPT_COLS = ["lead_dept", "dept_code", "department"];

/** Where `word` next occurs in `s` from `from` outside any parentheses (a subquery's own WHERE is inside them), or -1. */
function topLevel(s: string, word: string, from: number): number {
  let depth = 0;
  for (let k = from; k < s.length; k++) {
    if (s[k] === "(") depth++;
    else if (s[k] === ")") depth--;
    else if (depth === 0 && s.startsWith(word, k)) return k;
  }
  return -1;
}
/** The outermost statement of a bound SQL text (a count wraps the query in "SELECT COUNT(*) FROM (...) x"). */
const outermost = (s: string) => { const m = s.match(/FROM \(SELECT 1 FROM (.*)\) x$/); return m ? `SELECT 1 FROM ${m[1]}` : s; };
/** Every table the query reads, by its alias: the base (b) and each joined table (j1, j2...), with its ON condition. */
function tablesOf(sql: string): { alias: string; table: string; on: string | null }[] {
  const s = outermost(sql);
  const out: { alias: string; table: string; on: string | null }[] = [];
  const base = s.match(/FROM `[a-z_]+`\.`([a-z_]+)` b\b/);
  if (base) out.push({ alias: "b", table: base[1], on: null });
  for (const m of s.matchAll(/LEFT JOIN `[a-z_]+`\.`([a-z_]+)` (j\d+) ON /g)) {
    const start = m.index! + m[0].length;
    const ends = [topLevel(s, " LEFT JOIN ", start), topLevel(s, " WHERE ", start)].filter((x) => x >= 0);
    out.push({ alias: m[2], table: m[1], on: s.slice(start, Math.min(...ends)) });
  }
  return out;
}
/** The bound SQL with every value in place (the lock value must sit in the lock's own placeholder). */
const bound = (sql: string, params: unknown[]) => format(sql, params as never[]);

/** How a table instance is held to DEPT in a bound statement: by its department column, through its incident_id, or not at all. */
function heldBy(text: string, alias: string, table: string, on: string | null): "dept" | "incident" | null {
  const s = outermost(text);
  const w = topLevel(s, " WHERE ", 0);
  const where = on ?? (w >= 0 ? s.slice(w) : "");
  const t = cat.tables.get(table)!;
  const col = DEPT_COLS.find((c) => t.columns.has(c));
  if (col && where.includes(`${alias}.\`${col}\` = '${DEPT}'`)) return "dept";
  if (t.columns.has("incident_id") && new RegExp(`${alias}\\.\`incident_id\` IN \\(SELECT li\\.\`incident_id\` FROM \`[a-z_]+\`\\.\`incidents\` li WHERE li\\.\`lead_dept\` = '${DEPT}'\\)`).test(where)) return "incident";
  return null;
}
/** Tables an officer may read whole: they hold no department's data. */
const SHARED = new Set(["ref_zones", "ref_wards", "ref_taluks", "ref_departments", "ref_facilities", "world_calendar"]);

/** Each statement the compiled query runs (the query, its count, the previous period) holds every table it reads. */
function expectHeld(c: Compiled) {
  const statements = [bound(c.sql, c.params), bound(c.countSql, c.countParams), ...(c.previous ? [bound(c.previous.sql, c.previous.params)] : []),
    bound(`SELECT 1 FROM ${c.parts.from} WHERE ${c.parts.where}`, c.parts.whereParams)];
  for (const text of statements) {
    expect(text, "every placeholder is bound").not.toContain("?");
    for (const { alias, table, on } of tablesOf(text)) {
      if (SHARED.has(table)) continue;
      expect(heldBy(text, alias, table, on), `${table} ${alias} in: ${text.slice(0, 600)}`).not.toBeNull();
    }
  }
}
const compileLocked = (p: PlanQuery) => compileQuery(p, cat, AS_OF, SCOPE, DEPT);
/** Either refused with a department reason, or held on every table. */
function heldOrRefused(p: PlanQuery): "held" | "refused" {
  let c: Compiled;
  try { c = compileLocked(p); } catch (e) {
    expect(e).toBeInstanceOf(CompileError);
    expect((e as Error).message).toMatch(/department/i);
    return "refused";
  }
  expectHeld(c);
  return "held";
}

describe("QA pass 7, reviewer4-01: every table a locked query reads is held to the officer's department", () => {
  // the row's shapes, then every other join the catalog declares from a held base
  const shapes: [string, PlanQuery, "held" | "refused"][] = [
    ["ref_categories -> incidents (the row's repro)", plan("ref_categories", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["ref_categories -> incidents, counted", plan("ref_categories", { measures: [{ fn: "count_distinct", field: "incidents.incident_id", alias: "n" }], dimensions: dims("label") }), "held"],
    ["ref_categories -> events", plan("ref_categories", { dimensions: dims("events.event_id", "events.source") }), "held"],
    ["ref_categories -> documents", plan("ref_categories", { dimensions: dims("documents.title") }), "held"],
    ["ref_categories -> gaps", plan("ref_categories", { dimensions: dims("gaps.incident_id", "gaps.title") }), "held"],
    ["ref_categories -> hotspots (every department's clusters)", plan("ref_categories", { dimensions: dims("hotspots.hotspot_id", "hotspots.top_place") }), "refused"],
    ["ref_categories -> daily_counts", plan("ref_categories", { measures: [{ fn: "sum", field: "daily_counts.count", alias: "n" }], dimensions: dims("label") }), "refused"],
    ["ref_categories -> alerts", plan("ref_categories", { dimensions: dims("alerts.title") }), "refused"],
    ["ref_offices -> actions", plan("ref_offices", { dimensions: dims("actions.action_id", "actions.text") }), "held"],
    ["ref_offices -> pwd_works", plan("ref_offices", { dimensions: dims("pwd_works.work_title") }), "refused"],
    ["documents -> incidents", plan("documents", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["actions -> incidents", plan("actions", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["events -> incidents", plan("events", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["gaps -> incidents", plan("gaps", { dimensions: dims("incidents.title") }), "held"],
    ["dept_assignments -> incidents", plan("dept_assignments", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["v_media_gaps -> incidents", plan("v_media_gaps", { dimensions: dims("incidents.title") }), "held"],
    ["v_collector_queue -> incidents", plan("v_collector_queue", { dimensions: dims("incidents.title") }), "held"],
    ["incidents -> events", plan("incidents", { dimensions: dims("events.event_id", "events.lead_dept") }), "held"],
    ["incidents -> actions", plan("incidents", { dimensions: dims("actions.text") }), "held"],
    ["incidents -> documents", plan("incidents", { dimensions: dims("documents.title") }), "held"],
    ["incidents -> v_collector_queue", plan("incidents", { dimensions: dims("v_collector_queue.title") }), "held"],
    ["incidents -> dept_assignments", plan("incidents", { dimensions: dims("dept_assignments.reason") }), "held"],
    ["incidents -> ref_categories", plan("incidents", { dimensions: dims("ref_categories.label") }), "held"],
    ["incidents -> hotspots (every department's counts)", plan("incidents", { dimensions: dims("hotspots.incidents", "hotspots.open") }), "refused"],
    ["incidents -> ref_wards' open incidents (every department's)", plan("incidents", { dimensions: dims("ref_wards.open_incidents") }), "refused"],
    ["incidents -> ref_wards' zone name (shared)", plan("incidents", { measures: [{ fn: "count", field: null, alias: "n" }], dimensions: dims("ref_wards.zone_name") }), "held"],
    ["ref_departments -> incidents", plan("ref_departments", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["ref_departments -> actions", plan("ref_departments", { dimensions: dims("actions.text") }), "held"],
    ["ref_zones -> incidents", plan("ref_zones", { dimensions: dims("incidents.incident_id", "incidents.title") }), "held"],
    ["ref_zones -> official_contacts", plan("ref_zones", { dimensions: dims("official_contacts.name") }), "held"],
    ["ref_zones -> v_zone_summary (every department's counts)", plan("ref_zones", { dimensions: dims("v_zone_summary.open_incidents") }), "refused"],
    ["ref_wards -> incidents", plan("ref_wards", { dimensions: dims("incidents.title") }), "held"],
    ["ref_wards -> v_collector_queue", plan("ref_wards", { dimensions: dims("v_collector_queue.title") }), "held"],
    ["ref_taluks -> events", plan("ref_taluks", { dimensions: dims("events.event_id") }), "held"],
    ["ref_taluks -> v_taluk_unresolved", plan("ref_taluks", { dimensions: dims("v_taluk_unresolved.unresolved") }), "refused"],
    ["hotspots -> incidents (base with no department)", plan("hotspots", { dimensions: dims("incidents.title") }), "refused"]
  ];
  for (const [name, p, want] of shapes) it(name, () => expect(heldOrRefused(p)).toBe(want));

  it("a joined table's own filter, time range and previous period keep its lock in the right placeholder", () => {
    const c = compileLocked(plan("ref_categories", {
      measures: [{ fn: "count_distinct", field: "incidents.incident_id", alias: "n" }], dimensions: dims("label"),
      filters: [{ field: "incidents.severity_level", op: "eq", value: "Severe", values: null }],
      timeRange: { field: "incidents.first_reported_at", mode: "relative", last: 30, unit: "day", from: null, to: null }, compare: "previous_period"
    }));
    expectHeld(c);
    expect(c.previous).not.toBeNull();
  });

  it("every declared join from every table: held on each table, or refused", () => {
    let held = 0;
    for (const [bn, b] of cat.tables) for (const [on, o] of cat.tables) {
      if (on === bn) continue;
      const link = [...b.columns.values()].some((c) => c.join?.startsWith(`${on}.`)) || [...o.columns.values()].some((c) => c.join?.startsWith(`${bn}.`));
      if (!link) continue;
      const col = [...o.columns.values()].find((c) => !["geo"].includes(c.role))!;
      if (heldOrRefused(plan(bn, { dimensions: dims(`${on}.${col.name}`) })) === "held") held++;
    }
    expect(held).toBeGreaterThan(20);
  });

  it("the Collector (no lock) gets the same joins with no department condition", () => {
    const c = compileQuery(plan("ref_categories", { dimensions: dims("incidents.incident_id", "incidents.title") }), cat, AS_OF, null, null);
    expect(bound(c.sql, c.params)).not.toContain(DEPT);
    expect(c.sql).toContain("LEFT JOIN `district_intel`.`incidents` j1 ON j1.`category_code` = b.`category_code` WHERE");
  });

  it("shared reference tables stay readable for an officer, without columns that count every department's incidents", () => {
    expect(heldOrRefused(plan("ref_zones", { dimensions: dims("zone_no", "zone_name") }))).toBe("held");
    expect(heldOrRefused(plan("ref_wards", { dimensions: dims("ward_no", "zone_name") }))).toBe("held");
    expect(heldOrRefused(plan("ref_wards", { dimensions: dims("ward_no", "open_incidents") }))).toBe("refused");
    expect(heldOrRefused(plan("ref_wards", { measures: [{ fn: "sum", field: "incidents_30d", alias: "n" }] }))).toBe("refused");
  });
});
