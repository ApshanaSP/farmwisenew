/**
 * Reviewer probes, QA pass 7 (askiq-writer-lock), mechanism 2: a department officer's planned query is held to the department on every
 * table it reads. Each `it` asserts the promised behaviour, so a failing `it` is a break. Pure: compileQuery on the pinned snapshot, the
 * statements runCompiled builds from the compiled parts (count, span, top-N, previous period, re-grain) rebuilt here as it builds them,
 * and mysql2's format to bind every value where its "?" is.
 */
import { format } from "mysql2";
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/assistant/schema.snapshot.json";
import { buildCatalog, type SchemaSnapshot } from "@/lib/assistant/catalog";
import { CompileError, compileQuery, type Compiled, type PlanQuery } from "@/lib/assistant/compile";

const cat = buildCatalog(snapshot as unknown as SchemaSnapshot);
const AS_OF = "2026-11-06 12:00:00";
const DEPT = "GCC-SWM";
const SCOPE = { period: "monthly", zone: null, dept: DEPT, cat: null, taluk: null } as never;
const plan = (table: string, p: Partial<PlanQuery>): PlanQuery => ({ id: "q1", purpose: "probe", table, measures: [], dimensions: [], filters: [], timeRange: null,
  compare: null, sort: [], limit: 50, derive: [], ...p });
const dims = (...fields: string[]) => fields.map((f, i) => ({ field: f, alias: `d${i}`, grain: null }));
const locked = (p: PlanQuery) => compileQuery(p, cat, AS_OF, SCOPE, DEPT);
const SHARED = new Set(["ref_zones", "ref_wards", "ref_taluks", "ref_departments", "ref_facilities", "world_calendar", "mandi_market_prices", "mandi_prices", "mandi_weekly"]); // market prices since reviewer4-05
const DEPT_COLS = ["lead_dept", "dept_code", "department"];
const refusedOrThrows = (p: PlanQuery) => { try { locked(p); return "compiled"; } catch (e) { return e instanceof CompileError ? "refused" : `threw ${(e as Error).message}`; } };

function topLevel(s: string, word: string, from: number): number {
  let depth = 0;
  for (let k = from; k < s.length; k++) {
    if (s[k] === "(") depth++; else if (s[k] === ")") depth--; else if (depth === 0 && s.startsWith(word, k)) return k;
  }
  return -1;
}
const outermost = (s: string) => { const m = s.match(/FROM \(SELECT 1 FROM ([\s\S]*)\) x$/); return m ? `SELECT 1 FROM ${m[1]}` : s; };
function tablesOf(sql: string) {
  const s = outermost(sql);
  const out: { alias: string; table: string; on: string | null }[] = [];
  const base = s.match(/FROM `[^`]+`\.`([a-z_]+)` b\b/);
  if (base) out.push({ alias: "b", table: base[1], on: null });
  for (const m of s.matchAll(/LEFT JOIN `[^`]+`\.`([a-z_]+)` (j\d+) ON /g)) {
    const start = m.index! + m[0].length;
    const ends = [topLevel(s, " LEFT JOIN ", start), topLevel(s, " WHERE ", start)].filter((x) => x >= 0);
    out.push({ alias: m[2], table: m[1], on: s.slice(start, Math.min(...ends)) });
  }
  return out;
}
function heldBy(text: string, alias: string, table: string, on: string | null): boolean {
  const s = outermost(text);
  const w = topLevel(s, " WHERE ", 0);
  const where = on ?? (w >= 0 ? s.slice(w) : "");
  const t = cat.tables.get(table)!;
  const col = DEPT_COLS.find((c) => t.columns.has(c));
  if (col) return where.includes(`${alias}.\`${col}\` = '${DEPT}'`);
  return t.columns.has("incident_id") && where.includes(`${alias}.\`incident_id\` IN (SELECT li.\`incident_id\` FROM `) && where.includes(`li.\`lead_dept\` = '${DEPT}')`);
}
/** every statement runCompiled can run for this compiled query, with its parameters (as runCompiled builds them) */
function statements(c: Compiled): [string, string, unknown[]][] {
  const out: [string, string, unknown[]][] = [["query", c.sql, c.params], ["count", c.countSql, c.countParams], ["parts", `SELECT 1 FROM ${c.parts.from} WHERE ${c.parts.where}`, c.parts.whereParams]];
  if (c.previous) out.push(["previous", c.previous.sql, c.previous.params]);
  const timeDim = c.dims.find((d) => d.time), catDim = c.dims.find((d) => !d.time);
  if (!c.records && timeDim && timeDim.grain === "day") {
    out.push(["span", `SELECT COUNT(DISTINCT DATE(b.\`${timeDim.col.name}\`)) AS n FROM ${c.parts.from} WHERE ${c.parts.where}`, c.parts.whereParams]);
    const e = `b.\`${timeDim.col.name}\``;
    out.push(["regrain", c.sql.split(`DATE_FORMAT(${e}, '%Y-%m-%d')`).join(`DATE_FORMAT(${e}, '%Y-%m')`), c.params]);
  }
  if (!c.records && catDim && timeDim) {
    out.push(["top", `SELECT b.\`${catDim.col.name}\` AS k FROM ${c.parts.from} WHERE ${c.parts.where} GROUP BY k ORDER BY COUNT(*) DESC LIMIT ?`, [...c.parts.whereParams, 11]]);
    out.push(["rows", c.sql.replace(/ LIMIT \?$/, ""), c.params.slice(0, -1)]);
  }
  return out;
}
/** problems: a "?" count that differs from the parameters, a table read without its hold */
function problems(c: Compiled): string[] {
  const bad: string[] = [];
  for (const [name, sql, params] of statements(c)) {
    const marks = (sql.match(/\?/g) ?? []).length;
    if (marks > 0 && marks !== params.length) bad.push(`${name}: ${marks} placeholders, ${params.length} params`);
    const text = format(sql, params as never[]);
    for (const t of tablesOf(text)) if (!SHARED.has(t.table) && !heldBy(text, t.alias, t.table, t.on)) bad.push(`${name}: ${t.table} ${t.alias} not held`);
    // runCompiled's top-N reads b.<the category dimension's column name>, whatever table the dimension came from
    const m = sql.match(/^SELECT b\.`([a-z_0-9]+)` AS k FROM/);
    if (m && c.table.columns.get(m[1])?.test && SHARED.has(c.table.name)) bad.push(`${name}: reads ${c.table.name}.${m[1]} (counts every department)`);
  }
  return bad;
}

describe("shared reference tables: columns computed from every department's records, not flagged `test`", () => {
  it("ref_wards.low_lying_index is the percentile rank of FLOOD-family events (all sources, all departments) per km² (district_intel/dintel/analytics.py ward_stats)", () => {
    expect.soft(refusedOrThrows(plan("ref_wards", { dimensions: dims("ward_no", "low_lying_index") })), "dimension").toBe("refused");
    expect.soft(refusedOrThrows(plan("ref_wards", { measures: [{ fn: "max", field: "low_lying_index", alias: "x" }], dimensions: dims("zone_name") })), "measure").toBe("refused");
    expect.soft(refusedOrThrows(plan("ref_wards", { dimensions: dims("ward_no"), filters: [{ field: "low_lying_index", op: "gt", value: 0.9, values: null }] })), "filter").toBe("refused");
    expect.soft(refusedOrThrows(plan("incidents", { measures: [{ fn: "count", field: null, alias: "n" }], dimensions: dims("ref_wards.low_lying_index") })), "joined").toBe("refused");
  });
  it("world_calendar.rain_intensity is the day's excess of grievance, police and PWD flood records over their medians (district_intel/dintel/world.py build_calendar)", () => {
    expect.soft(refusedOrThrows(plan("world_calendar", { dimensions: dims("date", "rain_intensity") }))).toBe("refused");
  });
});

describe("a table held by its own department column also names incidents", () => {
  // row p7-askiq-writer-lock-03 (fixall): holding these tables also through incident_id would hide the officer's own records that were merged
  // into another department's incident, so the row stays held by its department column and the id it names is read through the department's
  // incidents (compile.ts incidentOf): another department's incident id reads as NULL. Was it.skip asserting a row filter on b.incident_id
  it("events (held by events.lead_dept) of an SWM record merged into another department's incident give that incident's id: the id is held", () => {
    // incidents.py: an incident's lead_dept is its lead member's; needs_coordination marks incidents with records from several departments
    const c = locked(plan("events", { measures: [{ fn: "count", field: null, alias: "n" }], dimensions: dims("incident_id") }));
    const text = format(c.sql, c.params as never[]);
    expect(text, "b.incident_id held through the department's incidents")
      .toMatch(/LEFT JOIN \(SELECT DISTINCT li\.`incident_id` FROM [^)]*li\.`lead_dept` = 'GCC-SWM'\) (k\d+) ON \1\.`incident_id` = b\.`incident_id`/);
    expect(text, "the id selected is the department's incident's").toMatch(/^SELECT \/\*\+[^*]*\*\/ k\d+\.`incident_id` AS `d0`/);
  });
});

describe("no break found: every statement of every shape holds every table, with the lock in its own placeholder", () => {
  it("every base x every joinable table's columns, as dimension, measure, filter, time range (with previous period)", () => {
    const bad: string[] = [];
    let compiled = 0;
    for (const [bn, b] of cat.tables) {
      const fields: { f: string; col: { role: string; type: string; name: string } }[] = [...b.columns.values()].map((c) => ({ f: c.name, col: c }));
      for (const [on, o] of cat.tables) {
        if (on === bn) continue;
        const link = [...b.columns.values()].some((c) => c.join?.startsWith(`${on}.`)) || [...o.columns.values()].some((c) => c.join?.startsWith(`${bn}.`));
        if (link) for (const c of o.columns.values()) fields.push({ f: `${on}.${c.name}`, col: c });
      }
      const timeF = fields.find((x) => /^(datetime|timestamp|date)\b/.test(x.col.type))?.f ?? null;
      for (const { f, col } of fields) {
        const isTime = /^(datetime|timestamp|date)\b/.test(col.type);
        const tr = timeF ? { field: timeF, mode: "relative" as const, last: 30, unit: "day" as const, from: null, to: null } : null;
        const shapes: PlanQuery[] = [
          plan(bn, { dimensions: col.role === "geo" ? [] : [{ field: f, alias: "d0", grain: isTime ? "day" : null }], measures: [{ fn: "count_distinct", field: f, alias: "n" }] }),
          plan(bn, { measures: [{ fn: "count", field: null, alias: "n" }], filters: [{ field: f, op: "is_null", value: null, values: null }], timeRange: tr, compare: tr ? "previous_period" : null }),
          plan(bn, { measures: [{ fn: "count", field: null, alias: "n" }], dimensions: [...(timeF ? [{ field: timeF, alias: "t", grain: "day" as const }] : []), ...(col.role === "geo" || isTime ? [] : [{ field: f, alias: "d0", grain: null }])],
            filters: [{ field: f, op: "not_null", value: null, values: null }], timeRange: tr, compare: tr ? "previous_period" : null }),
          ...(isTime ? [plan(bn, { measures: [{ fn: "count", field: null, alias: "n" }], timeRange: { field: f, mode: "relative", last: 7, unit: "day", from: null, to: null }, compare: "previous_period" })] : [])
        ];
        for (const p of shapes) {
          let c: Compiled;
          try { c = locked(p); } catch (e) { if (!(e instanceof CompileError)) bad.push(`${bn}/${f}: threw ${(e as Error).message}`); continue; }
          compiled++;
          for (const x of problems(c)) bad.push(`${bn}/${f}: ${x}`);
        }
      }
    }
    expect(compiled).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });

  it("odd field names (aliases, case, backticks, spaces, db prefix, three parts, the same table twice) are refused or held", () => {
    const odd = ["b.title", "j1.title", "INCIDENTS.title", "incidents.TITLE", "`incidents`.title", "incidents .title", " incidents.title", "district_intel.incidents.title",
      "incidents.title.x", "ref_categories.lead_dept", "ref_categories.label", "incidents.lead_dept", "events.incident_id", "hotspots.open", "v_zone_summary.open_incidents",
      "ref_wards.open_incidents", "ref_categories.incidents.title", "incidents.incident_id"];
    const bad: string[] = [];
    for (const base of ["ref_categories", "ref_departments", "ref_wards", "documents", "events", "actions"]) for (const f of odd) {
      for (const p of [plan(base, { dimensions: dims(f) }), plan(base, { measures: [{ fn: "count_distinct", field: f, alias: "n" }], filters: [{ field: f, op: "not_in", value: null, values: ["x"] }] })]) {
        try { const c = locked(p); bad.push(...problems(c).map((x) => `${base}/${f}: ${x}`)); }
        catch (e) { if (!(e instanceof CompileError)) bad.push(`${base}/${f}: threw ${(e as Error).message}`); }
      }
    }
    expect(bad).toEqual([]);
  });
});
