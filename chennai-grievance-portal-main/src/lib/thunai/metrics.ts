/**
 * Jarvis's metric registry: a small semantic layer (ULTIMATE_JARVIS.md Pillar 3). One entry per figure Jarvis may speak about: what it
 * counts, which of the console's filters narrow it, its grain, its window, what it is compared with, its unit and its names in English
 * and Tamil, and the read tool it comes from (src/lib/assistant/tools.ts, through the screens' `Hands`).
 *
 * The planner names a metric id and slots; code computes the value, the change, the ranks. An id that is not here, a tool that fails or
 * a field the tool did not return is an error object, never a guessed number (the semantic-layer rule: a missing metric is an error,
 * not a wrong figure). The ids that the ranking screen already knows (screens.ts MEASURES) keep their names, so one word means one thing.
 */
import type { ToolResult } from "@/lib/assistant/types";
import { MIN_PCT_BASE } from "@/lib/reference/metrics";
import type { Hands } from "./screens";
import type { ScopeT } from "./stage";

type Row = Record<string, unknown>;
type Filter = "period" | "zone" | "dept" | "cat" | "taluk";

export type Grain = "district" | "zone" | "dept" | "taluk" | "station" | "reservoir" | "hotspot" | "category";
/** how the figure for the whole scope is made from the rows of a grain; "none": averages of averages are not taken */
export type Agg = "sum" | "max" | "mean" | "none";

/** Where the figure is read: one read tool and the fields of its result. */
export type Source =
  /** change_drivers `data.totals[field]` (and `[prev]`, the period before) */
  | { tool: "change_drivers"; read: "totals"; field: string; prev?: string }
  /** a figure at the top of the result's data (change_drivers rainDays / rainDaysPrev) */
  | { tool: "change_drivers"; read: "data"; field: string; prev?: string }
  /** overview_kpis `data.cur[field]` against `data.prev[field]` */
  | { tool: "overview_kpis"; read: "kpi"; field: string }
  /** environment's IMD warning in force, `data.warning.level` */
  | { tool: "environment"; read: "warning"; args: Record<string, unknown> }
  /** one row per zone, department, taluk, station or category: `rows` under `list` (default `rows`) */
  | { tool: string; read: "rows"; list?: string; key: string; label: string; field: string; prev?: string; prevScale?: number; args?: Record<string, unknown> };

export interface MetricDef {
  id: string;
  measure: "count" | "average" | "reading" | "score" | "level";
  /** what one unit counts, in plain words */
  of: string;
  /** the console filters the source tool honours (the others are ignored by it, so they are not offered) */
  filters: readonly Filter[];
  grain: Grain;
  /** "period": the console's window (24 hours, 7, 30, 90 days); "any": every open one, whatever the date; "latest": the latest reading */
  window: "period" | "any" | "latest" | "30d" | "21d";
  /** what the figure is set against: the window before, a place's own 28-day mean, its peers, or nothing */
  comparison: "period_before" | "mean28" | "peers" | "none";
  unit: { en: string; ta: string };
  label: { en: string; ta: string };
  source: Source;
  agg: Agg;
  /** which way is worse, for a tile's tone */
  worse: "up" | "down" | null;
}

const ALL: readonly Filter[] = ["period", "zone", "dept", "cat", "taluk"];
const U = {
  incidents: { en: "incidents", ta: "சம்பவங்கள்" }, complaints: { en: "complaints", ta: "புகார்கள்" }, days: { en: "days", ta: "நாட்கள்" },
  people: { en: "people", ta: "பேர்" }, points: { en: "points", ta: "புள்ளிகள்" }, mm: { en: "mm", ta: "மி.மீ" }, aqi: { en: "AQI", ta: "AQI" },
  full: { en: "% full", ta: "% நிரம்பியது" }, c: { en: "°C", ta: "°C" }, pct: { en: "%", ta: "%" }, level: { en: "level", ta: "நிலை" }
} as const;

const env = (metric: string) => ({ tool: "environment", read: "rows" as const, key: "place_id", label: "place", field: "value", prev: "mean28", args: { metric } });

/** Every metric Jarvis may speak about. Add one here before any screen or prompt may name it. */
export const METRIC_DEFS: readonly MetricDef[] = [
  // the district (or the scope's zone, department, kind or taluk) as one figure
  { id: "incidents_reported", measure: "count", of: "incidents first reported in the window", filters: ALL, grain: "district", window: "period", comparison: "period_before",
    unit: U.incidents, label: { en: "Incidents reported", ta: "பதிவான சம்பவங்கள்" }, source: { tool: "change_drivers", read: "totals", field: "n", prev: "prev" }, agg: "sum", worse: "up" },
  { id: "severe_reported", measure: "count", of: "incidents rated Severe, first reported in the window", filters: ALL, grain: "district", window: "period", comparison: "period_before",
    unit: U.incidents, label: { en: "Severe incidents", ta: "கடுமையான சம்பவங்கள்" }, source: { tool: "change_drivers", read: "totals", field: "severe", prev: "severePrev" }, agg: "sum", worse: "up" },
  { id: "open_now", measure: "count", of: "incidents reported in the window that are still open", filters: ALL, grain: "district", window: "period", comparison: "none",
    unit: U.incidents, label: { en: "Still open", ta: "இன்னும் நிலுவையில்" }, source: { tool: "change_drivers", read: "totals", field: "open" }, agg: "sum", worse: "up" },
  { id: "overdue_open", measure: "count", of: "open incidents past their deadline, reported in the window", filters: ALL, grain: "district", window: "period", comparison: "none",
    unit: U.incidents, label: { en: "Past their deadline", ta: "காலக்கெடு தாண்டியவை" }, source: { tool: "change_drivers", read: "totals", field: "overdue" }, agg: "sum", worse: "up" },
  { id: "deaths", measure: "count", of: "people who died, once per incident", filters: ALL, grain: "district", window: "period", comparison: "none",
    unit: U.people, label: { en: "Deaths recorded", ta: "பதிவான மரணங்கள்" }, source: { tool: "change_drivers", read: "totals", field: "dead" }, agg: "sum", worse: "up" },
  { id: "rain_linked", measure: "count", of: "incidents reported during or after a rain event", filters: ALL, grain: "district", window: "period", comparison: "none",
    unit: U.incidents, label: { en: "Reported during or after rain", ta: "மழையின் போது அல்லது பிறகு பதிவானவை" }, source: { tool: "change_drivers", read: "totals", field: "rainLinked" }, agg: "sum", worse: null },
  { id: "rain_days", measure: "count", of: "days with a rain event", filters: ["period"], grain: "district", window: "period", comparison: "period_before",
    unit: U.days, label: { en: "Rain days", ta: "மழை நாட்கள்" }, source: { tool: "change_drivers", read: "data", field: "rainDays", prev: "rainDaysPrev" }, agg: "sum", worse: null },
  { id: "complaints_open", measure: "count", of: "open citizen complaints", filters: ALL, grain: "district", window: "period", comparison: "period_before",
    unit: U.complaints, label: { en: "Open citizen complaints", ta: "நிலுவைப் புகார்கள்" }, source: { tool: "overview_kpis", read: "kpi", field: "complaints" }, agg: "sum", worse: "up" },
  { id: "imd_warning", measure: "level", of: "the IMD warning level in force (0 green to 3 red)", filters: [], grain: "district", window: "latest", comparison: "none",
    unit: U.level, label: { en: "IMD warning level", ta: "வானிலை எச்சரிக்கை நிலை" }, source: { tool: "environment", read: "warning", args: { metric: "imd_warning_level" } }, agg: "none", worse: "up" },
  // by zone (the zone filter is ignored by the zone table: every zone is shown)
  { id: "zone_incidents", measure: "count", of: "incidents reported, by zone", filters: ["period", "dept", "cat", "taluk"], grain: "zone", window: "period", comparison: "period_before",
    unit: U.incidents, label: { en: "Incidents reported by zone", ta: "மண்டலவாரியாகப் பதிவான சம்பவங்கள்" }, source: { tool: "zones", read: "rows", key: "zone", label: "name", field: "n", prev: "n_prev" }, agg: "sum", worse: "up" },
  { id: "zone_open", measure: "count", of: "open incidents, by zone", filters: ["period", "dept", "cat", "taluk"], grain: "zone", window: "period", comparison: "peers",
    unit: U.incidents, label: { en: "Open incidents by zone", ta: "மண்டலவாரியாக நிலுவைச் சம்பவங்கள்" }, source: { tool: "zones", read: "rows", key: "zone", label: "name", field: "open" }, agg: "sum", worse: "up" },
  { id: "zone_severe", measure: "count", of: "severe incidents, by zone", filters: ["period", "dept", "cat", "taluk"], grain: "zone", window: "period", comparison: "peers",
    unit: U.incidents, label: { en: "Severe incidents by zone", ta: "மண்டலவாரியாகக் கடுமையான சம்பவங்கள்" }, source: { tool: "zones", read: "rows", key: "zone", label: "name", field: "severe" }, agg: "sum", worse: "up" },
  { id: "zone_complaints", measure: "count", of: "open citizen complaints, by zone", filters: ["period", "dept", "cat", "taluk"], grain: "zone", window: "period", comparison: "peers",
    unit: U.complaints, label: { en: "Open complaints by zone", ta: "மண்டலவாரியாக நிலுவைப் புகார்கள்" }, source: { tool: "zones", read: "rows", key: "zone", label: "name", field: "complaints" }, agg: "sum", worse: "up" },
  { id: "zone_attention", measure: "score", of: "attention score (3 x severe + high), by zone; for ordering only", filters: ["period", "dept", "cat", "taluk"], grain: "zone", window: "period", comparison: "peers",
    unit: U.points, label: { en: "Attention score by zone", ta: "மண்டலவாரியாகக் கவனப் புள்ளிகள்" }, source: { tool: "zones", read: "rows", key: "zone", label: "name", field: "score" }, agg: "none", worse: "up" },
  // by department
  { id: "dept_open", measure: "count", of: "open incidents, by department", filters: ["period", "zone", "cat", "taluk"], grain: "dept", window: "period", comparison: "peers",
    unit: U.incidents, label: { en: "Open incidents by department", ta: "துறைவாரியாக நிலுவைச் சம்பவங்கள்" }, source: { tool: "departments", read: "rows", key: "code", label: "name", field: "open" }, agg: "sum", worse: "up" },
  { id: "dept_overdue", measure: "count", of: "open incidents past their deadline, by department", filters: ALL, grain: "dept", window: "period", comparison: "peers",
    unit: U.incidents, label: { en: "Past their deadline by department", ta: "துறைவாரியாகக் காலக்கெடு தாண்டியவை" }, source: { tool: "dept_followups", read: "rows", key: "code", label: "name", field: "overdue" }, agg: "sum", worse: "up" },
  { id: "dept_backlog", measure: "average", of: "average age of open incidents, departments with 5 or more open", filters: ["zone"], grain: "dept", window: "any", comparison: "peers",
    unit: U.days, label: { en: "Average age of open incidents", ta: "நிலுவைச் சம்பவங்களின் சராசரி வயது" }, source: { tool: "dept_backlog", read: "rows", key: "code", label: "name", field: "days" }, agg: "none", worse: "up" },
  { id: "dept_resolution", measure: "average", of: "average days from first report to closing, incidents closed in the window", filters: ALL, grain: "dept", window: "period", comparison: "period_before",
    unit: U.days, label: { en: "Average days to close", ta: "முடிக்க ஆன சராசரி நாட்கள்" }, source: { tool: "resolution_times", read: "rows", key: "code", label: "name", field: "days", prev: "prevHours", prevScale: 1 / 24 }, agg: "none", worse: "up" },
  // by revenue taluk, hotspot and kind
  { id: "taluk_open", measure: "count", of: "open incidents by revenue taluk, last 30 days", filters: ["zone", "dept", "cat"], grain: "taluk", window: "30d", comparison: "peers",
    unit: U.incidents, label: { en: "Open incidents by taluk", ta: "வட்டவாரியாக நிலுவைச் சம்பவங்கள்" }, source: { tool: "taluks", read: "rows", key: "code", label: "name", field: "open" }, agg: "sum", worse: "up" },
  { id: "hotspots", measure: "count", of: "incidents in the last 30 days per hotspot (DBSCAN, 250 m, 3 or more)", filters: ["zone", "dept", "cat"], grain: "hotspot", window: "30d", comparison: "peers",
    unit: U.incidents, label: { en: "Incidents per hotspot", ta: "ஒவ்வொரு நெருக்கடி இடத்திலும் சம்பவங்கள்" }, source: { tool: "hotspots", read: "rows", key: "id", label: "top_place", field: "incidents_30d" }, agg: "none", worse: "up" },
  { id: "cat_incidents", measure: "count", of: "incidents reported, by kind (the kinds that moved most)", filters: ALL, grain: "category", window: "period", comparison: "period_before",
    unit: U.incidents, label: { en: "Incidents by kind", ta: "வகைவாரியாகச் சம்பவங்கள்" }, source: { tool: "change_drivers", read: "rows", list: "categories", key: "code", label: "label", field: "n", prev: "prev" }, agg: "none", worse: "up" },
  // readings at stations and reservoirs, against each place's own 28-day mean
  { id: "rain", measure: "reading", of: "rainfall in the last 24 hours at each gauge", filters: [], grain: "station", window: "latest", comparison: "mean28",
    unit: U.mm, label: { en: "Rainfall, last 24 hours", ta: "கடந்த 24 மணி நேர மழை" }, source: env("rainfall_24h_mm"), agg: "max", worse: null },
  { id: "aqi", measure: "reading", of: "air quality index at each station", filters: [], grain: "station", window: "latest", comparison: "mean28",
    unit: U.aqi, label: { en: "Air quality (AQI)", ta: "காற்றின் தரம்" }, source: env("aqi"), agg: "max", worse: "up" },
  { id: "lakes", measure: "reading", of: "storage at each reservoir, percent full", filters: [], grain: "reservoir", window: "latest", comparison: "mean28",
    unit: U.full, label: { en: "Reservoir storage", ta: "நீர்த்தேக்க இருப்பு" }, source: env("lake_pct_full"), agg: "mean", worse: null },
  { id: "temp", measure: "reading", of: "maximum temperature at each station", filters: [], grain: "station", window: "latest", comparison: "mean28",
    unit: U.c, label: { en: "Maximum temperature", ta: "அதிகபட்ச வெப்பநிலை" }, source: env("temp_max_c"), agg: "max", worse: "up" },
  { id: "humidity", measure: "reading", of: "relative humidity at each station", filters: [], grain: "station", window: "latest", comparison: "mean28",
    unit: U.pct, label: { en: "Relative humidity", ta: "ஈரப்பதம்" }, source: env("humidity_pct"), agg: "mean", worse: null }
];

const BY_ID = new Map(METRIC_DEFS.map((d) => [d.id, d]));

/** The metric of that id, or null (never a near match: the planner must name one that exists). */
export function metricById(id: string): MetricDef | null {
  return BY_ID.get(String(id ?? "").trim()) ?? null;
}

export interface MetricRow { key: string; label: string; value: number; prev: number | null; rank: number }
export type MetricError = "unknown_metric" | "tool_failed" | "no_data";
export type MetricResult =
  | { ok: true; id: string; def: MetricDef; value: number | null; prev: number | null; delta: number | null; pct: number | null; rows: MetricRow[]; n: number; method: string; asOf: string | null; source: string }
  | { ok: false; id: string; error: MetricError; message: string };

const fail = (id: string, error: MetricError, message: string): MetricResult => ({ ok: false, id: String(id ?? "").slice(0, 60), error, message: message.slice(0, 240) });
const num = (v: unknown): number | null => (v == null || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The tool arguments for a metric over a scope: only the filters its tool honours. */
export function metricArgs(def: MetricDef, s: ScopeT): Record<string, unknown> {
  const src = def.source as { args?: Record<string, unknown> };
  if (def.source.tool === "environment") return { ...(src.args ?? {}) };
  const scope = { period: s.period, zone: def.filters.includes("zone") ? s.zone : null, dept: def.filters.includes("dept") ? s.dept : null,
    cat: def.filters.includes("cat") ? s.cat : null, taluk: def.filters.includes("taluk") ? s.taluk : null };
  return { scope, ...(src.args ?? {}) };
}

/** The change against the figure before: the difference, and a percentage only on a base big enough for one (the console's MIN_PCT_BASE). */
export function deltaOf(value: number | null, prev: number | null): { delta: number | null; pct: number | null } {
  if (value == null || prev == null) return { delta: null, pct: null };
  return { delta: r1(value - prev), pct: prev >= MIN_PCT_BASE ? Math.round(((value - prev) / prev) * 100) : null };
}

/** Read a metric out of its tool's result: pure, so a test can feed it any result. A field that is missing is no_data, never 0. */
export function readMetric(def: MetricDef, r: ToolResult, s: ScopeT): MetricResult {
  const d = (r.data ?? null) as Row | null;
  if (!d || typeof d !== "object") return fail(def.id, "no_data", `${def.source.tool} returned no data.`);
  const src = def.source;
  const ok = (value: number | null, prev: number | null, rows: MetricRow[], n: number, method: string): MetricResult =>
    ({ ok: true, id: def.id, def, value, prev, ...deltaOf(value, prev), rows, n, method, asOf: r.asOf ?? null, source: src.tool });
  if (src.read === "totals" || src.read === "data") {
    const at = (src.read === "totals" ? d.totals : d) as Row | undefined;
    const value = num(at?.[src.field]);
    if (value == null) return fail(def.id, "no_data", `${src.tool} did not report ${src.field}.`);
    const prev = src.prev ? num(at?.[src.prev]) : null;
    return ok(value, prev, [], 1, `${def.of}${prev != null ? ", against the window before" : ""} (${src.tool})`);
  }
  if (src.read === "kpi") {
    const value = num((d.cur as Row | undefined)?.[src.field]);
    if (value == null) return fail(def.id, "no_data", `overview_kpis did not report ${src.field}.`);
    return ok(value, num((d.prev as Row | undefined)?.[src.field]), [], 1, `${def.of}, against the window before (overview_kpis)`);
  }
  if (src.read === "warning") {
    const level = num((d.warning as Row | null | undefined)?.level);
    if (level == null) return fail(def.id, "no_data", "No IMD warning level is in the data.");
    return ok(level, null, [], 1, "IMD warning in force (environment)");
  }
  const list = d[src.list ?? "rows"];
  if (!Array.isArray(list)) return fail(def.id, "no_data", `${src.tool} returned no rows.`);
  const rows = (list as Row[]).map((x) => {
    const p = src.prev ? num(x[src.prev]) : null;
    return { key: String(x[src.key] ?? ""), label: String(x[src.label] ?? x[src.key] ?? "").slice(0, 120), value: num(x[src.field]), prev: p == null ? null : r1(p * (src.prevScale ?? 1)) };
  }).filter((x): x is Omit<MetricRow, "rank"> & { value: number } => x.key !== "" && x.value != null)
    .sort((a, b) => b.value - a.value).map((x, i) => ({ ...x, rank: i + 1 }));
  if (!rows.length) return fail(def.id, "no_data", `${src.tool} has no ${def.label.en.toLowerCase()} for this scope.`);
  // the scope's own row when the scope names one of the grain (a zone's open incidents), else the rows' total, highest or mean
  const own = def.grain === "zone" && s.zone != null ? String(s.zone) : def.grain === "dept" && s.dept ? s.dept : def.grain === "category" && s.cat ? s.cat : null;
  if (own != null) {
    const hit = rows.find((x) => x.key === own);
    if (!hit) return fail(def.id, "no_data", `${src.tool} has no row for ${own}.`);
    return ok(hit.value, hit.prev, rows, rows.length, `${def.of}: the row for ${hit.label} (${src.tool})`);
  }
  const vs = rows.map((x) => x.value);
  const value = def.agg === "sum" ? vs.reduce((a, b) => a + b, 0) : def.agg === "max" ? Math.max(...vs) : def.agg === "mean" ? r1(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  const prevs = rows.map((x) => x.prev);
  const prev = def.agg === "sum" && prevs.every((x) => x != null) ? (prevs as number[]).reduce((a, b) => a + b, 0) : null;
  const how = def.agg === "sum" ? "summed over" : def.agg === "max" ? "the highest of" : def.agg === "mean" ? "the mean of" : "ranked across";
  return ok(value, prev, rows, rows.length, `${def.of}, ${how} ${rows.length} ${def.grain === "station" ? "stations" : def.grain === "reservoir" ? "reservoirs" : `${def.grain === "category" ? "kinds" : `${def.grain}s`}`} (${src.tool})`);
}

/**
 * A metric for a scope, computed by code: its value, the figure before when it has one, the change, and the rows of its grain ranked.
 * An unknown id, a failed tool or a missing field comes back as `{ ok: false, error }`: never a number.
 */
export async function computeMetric(id: string, scope: ScopeT, hands: Pick<Hands, "tool">): Promise<MetricResult> {
  const def = metricById(id);
  // the id came from a model and is never echoed: letters and underscores can still spell a figure ("three_hundred_deaths"; review, Numbers 5)
  if (!def) return fail(id, "unknown_metric", `No metric by that id. Known: ${METRIC_DEFS.map((x) => x.id).join(", ")}.`);
  let r: ToolResult;
  try {
    r = await hands.tool(def.source.tool, metricArgs(def, scope));
  } catch (e) {
    return fail(def.id, "tool_failed", `${def.source.tool} failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  return readMetric(def, r, scope);
}

/** The registry in one line for the planner prompt (at most 600 characters): ids only, grouped by grain. */
export function metricsPromptLine(): string {
  const by = (g: Grain[]) => METRIC_DEFS.filter((d) => g.includes(d.grain)).map((d) => d.id).join(" ");
  const line = `Metric ids (name one; code computes every value, change, rank and driver; an id not listed is an error): district ${by(["district"])}; by zone ${by(["zone"])}; by department ${by(["dept"])}; ${by(["taluk", "hotspot", "category"])}; readings ${by(["station", "reservoir"])}.`;
  return line.slice(0, 600);
}
