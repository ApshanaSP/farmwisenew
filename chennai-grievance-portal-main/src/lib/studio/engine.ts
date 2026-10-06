/**
 * The query engine: runs a Plan over a dataset's rows. Every number the Studio shows comes from here (a count, sum,
 * average, maximum or distinct count of real rows, grouped and filtered as the plan says); a model never computes one.
 * Pure over its inputs (rows, spec, names), so it is unit-tested directly.
 */
import type { DRow } from "@/lib/studio/clean";
import { fmtNum, openPhrase, type Filter, type Format, type PanelData, type Plan, type Spec, type Tone } from "@/lib/studio/types";
import { addDays, daysBetween, fmtDay, normKey, sameValue } from "@/lib/studio/values";

export interface Names {
  zone: (z: number) => string;
  taluk: (t: string) => string;
  /** zone number from a name or number written in a filter ("Adyar", "13", "Zone 13") */
  zoneOf: (v: string) => number | null;
}

const DERIVED: Record<string, string> = { _z: "Zone", _w: "Ward", _t: "Taluk", _p: "Place", _d: "Date" };

export function colLabel(spec: Spec, key: string | null): string {
  if (!key) return "";
  return DERIVED[key] ?? spec.columns.find((c) => c.key === key)?.label ?? key;
}

/** The measure's format, from its column's unit. */
export function formatOf(spec: Spec, plan: Plan): { format: Format; unit: string | null } {
  if (plan.agg === "count" || plan.agg === "distinct" || !plan.col) return { format: "int", unit: null };
  const c = spec.columns.find((x) => x.key === plan.col);
  const u = c?.unit ?? null;
  if (u === "Rs") return { format: "money", unit: null };
  if (u === "Rs lakh" || u === "Rs crore") return { format: "dec", unit: u };
  if (u === "%") return { format: "pct", unit: null };
  return { format: plan.agg === "avg" ? "dec" : "int", unit: u };
}

/** A row's numeric value for the column, or null (cleaning already turned readable numbers into numbers). */
function num(r: DRow, key: string | null): number | null {
  if (!key) return null;
  const v = r[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function matches(r: DRow, f: Filter, names: Names, maxDate: string | null): boolean {
  const vals = f.values.map(String);
  if (f.op === "open") return r._o === 1;
  if (f.op === "closed") return r._o === 0;
  if (f.op === "latest") return !!maxDate && r._d === maxDate;
  if (f.op === "recent_days") {
    const n = Number(vals[0]);
    if (!maxDate || !Number.isFinite(n) || typeof r._d !== "string") return false;
    return r._d > addDays(maxDate, -Math.max(1, n));
  }
  const v = r[f.col];
  if (f.col === "_z") {
    const zs = vals.map((x) => names.zoneOf(x)).filter((x): x is number => x != null);
    const hit = typeof v === "number" && zs.includes(v);
    return f.op === "neq" ? !hit : hit;
  }
  if (v == null) return f.op === "neq";
  if (f.op === "gte" || f.op === "lte") {
    const x = vals[0];
    if (typeof v === "number") { const t = Number(x); return Number.isFinite(t) && (f.op === "gte" ? v >= t : v <= t); }
    return f.op === "gte" ? String(v) >= x : String(v) <= x;
  }
  const s = String(v);
  if (f.op === "contains") return vals.some((x) => s.toLowerCase().includes(x.toLowerCase()));
  const hit = vals.some((x) => (typeof v === "number" ? Number(x) === v : sameValue(x, s) || normKey(x) === normKey(s)));
  return f.op === "neq" ? !hit : hit;
}

export function filterRows(rows: DRow[], plan: Plan, names: Names): DRow[] {
  if (!plan.filters.length) return rows;
  const maxDate = rows.reduce<string | null>((m, r) => (typeof r._d === "string" && (!m || r._d > m) ? r._d : m), null);
  return rows.filter((r) => plan.filters.every((f) => matches(r, f, names, maxDate)));
}

function aggregate(rows: DRow[], plan: Plan): number {
  if (plan.agg === "count") return rows.length;
  if (plan.agg === "distinct") return new Set(rows.map((r) => r[plan.col ?? ""]).filter((v) => v != null)).size;
  const xs = rows.map((r) => num(r, plan.col)).filter((x): x is number => x != null);
  if (!xs.length) return 0;
  if (plan.agg === "sum") return xs.reduce((a, b) => a + b, 0);
  if (plan.agg === "avg") return xs.reduce((a, b) => a + b, 0) / xs.length;
  if (plan.agg === "max") return Math.max(...xs);
  return Math.min(...xs);
}

/**
 * The time bucket for a date key. Weeks are counted back from the data's last day (`end`), so every week is a whole
 * seven days: a calendar week cut short by the end of the file would look like a sudden fall. The key is the week's
 * last day.
 */
function bucket(d: string, unit: Plan["unit"], end: string): string {
  if (unit === "year") return d.slice(0, 4);
  if (unit === "month") return d.slice(0, 7);
  if (unit === "week") return addDays(end, -7 * Math.floor(daysBetween(d.slice(0, 10), end) / 7));
  return d.slice(0, 10);
}
function nextBucket(k: string, unit: Plan["unit"]): string {
  if (unit === "year") return String(Number(k) + 1);
  if (unit === "month") {
    const y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return addDays(k, unit === "week" ? 7 : 1);
}
const lastDate = (rows: DRow[]) => rows.reduce<string | null>((m, r) => (typeof r._d === "string" && (!m || r._d > m) ? r._d : m), null);
/** A time unit that gives a readable number of points for the data's span. */
export function unitFor(from: string | null, to: string | null, yearly = false): "day" | "week" | "month" | "year" {
  if (!from || !to) return "week";
  if (yearly) return "year";
  const span = daysBetween(from, to);
  return span <= 45 ? "day" : span <= 400 ? "week" : span <= 1500 ? "month" : "year";
}

export function runPlan(rows: DRow[], spec: Spec, plan: Plan, names: Names): PanelData {
  const sel = filterRows(rows, plan, names);
  const { format, unit } = formatOf(spec, plan);
  const base: PanelData = {
    id: plan.id, plan, title: plan.title, subtitle: "", chart: plan.chart, labels: [], values: [], keys: [], geo: null, points: [],
    total: aggregate(sel, plan), rows: sel.length, format, unit, kpi: null, table: null, note: null
  };
  const measureWord = plan.agg === "count" ? spec.entityPlural : `${plan.agg === "sum" ? "total" : plan.agg === "avg" ? "average" : plan.agg === "max" ? "highest" : plan.agg === "min" ? "lowest" : "distinct"} ${colLabel(spec, plan.col).toLowerCase()}`;
  const filterWords = plan.filters.map((f) => describeFilter(spec, f, names)).filter(Boolean).join(", ");
  base.subtitle = [measureWord, filterWords].filter(Boolean).join(" · ");

  if (plan.chart === "table") {
    // a running serial number says nothing about a row: left out, so the useful columns fit
    const cols = spec.columns.filter((c) => c.role !== "person" && c.role !== "ignore" && !(c.role === "id" && /^(s\.?\s?no\.?|sl\.?\s?no\.?|sr\.?\s?no\.?|serial( no\.?)?|#|no\.?|row( no\.?)?)$/i.test(c.header.trim())))
      .slice(0, 8).map((c) => ({ key: c.key, label: c.label }));
    const withPlace = cols.some((c) => spec.columns.find((x) => x.key === c.key)?.role === "zone") ? cols : [...cols, { key: "_z", label: "Zone" }];
    // newest first; "asc" lists the oldest first (what has waited longest)
    const sorted = [...sel].sort((a, b) => (plan.sort === "asc" ? -1 : 1) * String(b._d ?? "").localeCompare(String(a._d ?? "")));
    base.table = {
      cols: withPlace,
      rows: sorted.slice(0, Math.min(200, plan.limit || 200)).map((r) => Object.fromEntries(withPlace.map((c) => [c.key, c.key === "_z" ? (typeof r._z === "number" ? names.zone(r._z) : null) : r[c.key] ?? null])))
    };
    return base;
  }

  if (plan.by === "none" || plan.chart === "kpi") {
    const v = base.total;
    // the same measure over the last twelve whole weeks (counted back from the data's last day), for the tile's
    // sparkline, and the last seven days against the seven before
    let spark: number[] = [], delta: number | null = null;
    const dated = sel.filter((r) => typeof r._d === "string");
    const end = lastDate(rows);
    if (dated.length >= 8 && end) {
      const weeks = new Map<string, DRow[]>();
      for (const r of dated) { const k = bucket(String(r._d), "week", end); (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(r); }
      const keys: string[] = [];
      for (let i = 11; i >= 0; i--) keys.push(addDays(end, -7 * i));
      const first = [...weeks.keys()].sort()[0];
      spark = keys.filter((k) => k >= first).map((k) => aggregate(weeks.get(k) ?? [], plan));
      if ((plan.agg === "count" || plan.agg === "sum") && spark.length >= 2) {
        const a = spark[spark.length - 1], b = spark[spark.length - 2];
        delta = b ? Math.round(((a - b) / b) * 100) : null;
      }
    }
    const tone: Tone = plan.filters.some((f) => f.op === "open") ? "high" : plan.agg === "sum" ? "teal" : "info";
    base.kpi = { value: v, label: plan.title, sub: kpiSub(sel.length, rows.length, plan, spec), spark, delta, tone };
    base.chart = "kpi";
    return base;
  }

  const groups = new Map<string | number, DRow[]>();
  const end = lastDate(rows) ?? "";
  const keyOf = (r: DRow): string | number | null => {
    switch (plan.by) {
      case "zone": return typeof r._z === "number" ? r._z : null;
      case "ward": return typeof r._w === "number" ? r._w : null;
      case "taluk": return typeof r._t === "string" ? r._t : null;
      case "place": return typeof r._p === "string" ? r._p : null;
      case "time": return typeof r._d === "string" ? bucket(r._d, plan.unit ?? "week", end) : null;
      default: { const v = r[plan.byCol ?? ""]; return v == null ? "(blank)" : typeof v === "number" ? v : String(v); }
    }
  };
  let unkeyed = 0;
  for (const r of sel) {
    const k = keyOf(r);
    if (k == null) { unkeyed++; continue; }
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  let entries = [...groups.entries()].map(([k, rs]) => ({ k, v: aggregate(rs, plan), rs }));

  if (plan.by === "time") {
    entries.sort((a, b) => String(a.k).localeCompare(String(b.k)));
    // the first week, when the data starts part-way into it, would read as a low week: it is left off the axis
    const first = rows.reduce<string | null>((m, r) => (typeof r._d === "string" && (!m || r._d < m) ? r._d : m), null);
    if ((plan.unit ?? "week") === "week" && first && entries.length > 3 && addDays(String(entries[0].k), -6) < first) {
      entries = entries.slice(1);
      base.note = "The first, partial week is not drawn.";
    }
    // empty weeks / days are zeros on the time axis, not gaps
    if (entries.length > 1 && (plan.agg === "count" || plan.agg === "sum")) {
      const have = new Map(entries.map((e) => [String(e.k), e]));
      const out: typeof entries = [];
      for (let k = String(entries[0].k), guard = 0; k <= String(entries[entries.length - 1].k) && guard < 800; k = nextBucket(k, plan.unit ?? "week"), guard++)
        out.push(have.get(k) ?? { k, v: 0, rs: [] });
      entries = out;
    }
    const last = entries.slice(-Math.max(plan.limit, 12) * 4);
    base.keys = last.map((e) => e.k);
    base.labels = last.map((e) => (plan.unit === "year" ? String(e.k) : plan.unit === "month" ? fmtDay(String(e.k)) : fmtDay(String(e.k), false)));
    base.values = last.map((e) => e.v);
  } else {
    entries.sort((a, b) => (plan.sort === "asc" ? a.v - b.v : plan.sort === "key" ? String(a.k).localeCompare(String(b.k), undefined, { numeric: true }) : b.v - a.v));
    const limit = Math.max(1, Math.min(plan.limit || 10, plan.chart === "map" ? 300 : 50));
    let shown = entries.slice(0, limit);
    // a share of a whole keeps the rest as "Others", so the parts still add up to the total
    if ((plan.chart === "donut" || plan.chart === "treemap") && entries.length > limit && plan.agg !== "avg" && plan.agg !== "max" && plan.agg !== "min") {
      shown = entries.slice(0, limit - 1);
      const rest = entries.slice(limit - 1);
      shown.push({ k: "Others", v: rest.reduce((s, e) => s + e.v, 0), rs: rest.flatMap((e) => e.rs) });
    } else if (entries.length > limit) base.note = `Top ${limit} of ${entries.length}.`;
    base.keys = shown.map((e) => e.k);
    base.labels = shown.map((e) => labelOf(e.k, plan, names));
    base.values = shown.map((e) => e.v);
    if (["zone", "ward", "taluk", "place"].includes(plan.by)) base.geo = plan.by as PanelData["geo"];
    if (plan.by === "place" || plan.chart === "map") {
      base.points = shown.flatMap((e) => {
        const pts = e.rs.filter((r) => typeof r._la === "number" && typeof r._lo === "number");
        if (!pts.length) return [];
        const la = pts.reduce((s, r) => s + (r._la as number), 0) / pts.length, lo = pts.reduce((s, r) => s + (r._lo as number), 0) / pts.length;
        return [{ name: labelOf(e.k, plan, names), lat: Math.round(la * 1e5) / 1e5, lon: Math.round(lo * 1e5) / 1e5, v: e.v }];
      });
    }
  }
  if (unkeyed && plan.by !== "col") {
    const what = plan.by === "time" ? "no readable date" : "no place on the map";
    base.note = [base.note, `${unkeyed.toLocaleString("en-IN")} of ${sel.length.toLocaleString("en-IN")} rows have ${what} and are left out.`].filter(Boolean).join(" ");
  }
  return base;
}

function labelOf(k: string | number, plan: Plan, names: Names): string {
  if (plan.by === "zone" && typeof k === "number") return names.zone(k);
  if (plan.by === "ward") return `Ward ${k}`;
  if (plan.by === "taluk") return names.taluk(String(k));
  return String(k);
}

function kpiSub(n: number, all: number, plan: Plan, spec: Spec): string {
  if (plan.filters.some((f) => f.op === "open") && all) return `${Math.round((n / all) * 100)}% of ${all.toLocaleString("en-IN")} ${spec.entityPlural}`;
  if (plan.agg === "count") return plan.filters.length ? `of ${all.toLocaleString("en-IN")} in all` : "rows after cleaning";
  if (plan.agg === "sum") return `across ${n.toLocaleString("en-IN")} ${n === 1 ? spec.entity : spec.entityPlural}`;
  if (plan.agg === "avg") return `average of ${n.toLocaleString("en-IN")} values`;
  if (plan.agg === "distinct" && plan.col === "_w") return "of Chennai's 200 wards";
  if (plan.agg === "distinct" && plan.col === "_z") return "of the 15 zones";
  if (plan.agg === "distinct") return `different values in ${n.toLocaleString("en-IN")} rows`;
  return `${n.toLocaleString("en-IN")} rows`;
}

export function describeFilter(spec: Spec, f: Filter, names: Names): string {
  if (f.op === "open") return openPhrase(spec).adj;
  if (f.op === "closed") return "closed";
  if (f.op === "recent_days") return `last ${f.values[0]} days of the data`;
  if (f.op === "latest") return "latest period";
  const label = colLabel(spec, f.col);
  const raw = f.col === "_z" ? f.values.map((v) => { const z = names.zoneOf(v); return z ? names.zone(z) : v; }) : f.values;
  // one spelling per value ("in progress", "In-Progress" -> one)
  const vals = [...new Map(raw.map((v) => [normKey(v), v])).values()];
  const list = vals.slice(0, 3).join(", ") + (vals.length > 3 ? ` +${vals.length - 3}` : "");
  switch (f.op) {
    case "neq": return `${label} not ${list}`;
    case "contains": return `${label} has "${list}"`;
    case "gte": return `${label} ≥ ${list}`;
    case "lte": return `${label} ≤ ${list}`;
    default: return f.col === "_z" ? list : `${label}: ${list}`;
  }
}

/** One plain sentence that answers a plan from its result: the numbers come from the result, never from a model. */
export function answerText(p: PanelData, spec: Spec): string {
  const f = (v: number) => fmtNum(v, p.format, p.unit);
  if (!p.rows) return `No ${spec.entityPlural} match${p.subtitle ? ` (${p.subtitle})` : ""}.`;
  if (p.kpi) return `${p.kpi.label}: ${f(p.kpi.value)}${p.kpi.sub ? ` (${p.kpi.sub})` : ""}.`;
  if (p.table) return `${p.rows.toLocaleString("en-IN")} ${p.rows === 1 ? spec.entity : spec.entityPlural} match; the latest are listed.`;
  if (!p.values.length) return `None of the matching ${spec.entityPlural} could be grouped this way.`;
  if (p.plan.by === "time") {
    const n = p.values.length;
    const peak = p.values.indexOf(Math.max(...p.values));
    const last = p.values[n - 1], prev = p.values[n - 2];
    const move = prev != null && prev > 0 ? ` The latest ${p.plan.unit ?? "period"} (${p.labels[n - 1]}) had ${f(last)}, ${last >= prev ? "up" : "down"} from ${f(prev)}.` : "";
    return `Peak: ${p.labels[peak]} with ${f(p.values[peak])}.${move}`;
  }
  const total = p.values.reduce((a, b) => a + b, 0);
  const top = p.labels.slice(0, 3).map((l, i) => `${l} (${f(p.values[i])})`);
  const share = (p.plan.agg === "count" || p.plan.agg === "sum") && p.total > 0 ? ` — ${Math.round((p.values[0] / p.total) * 100)}% of the total` : "";
  if (p.plan.sort === "asc") return `Lowest: ${top.join(", ")}.`;
  return `${p.labels[0]} leads with ${f(p.values[0])}${share}${top.length > 1 ? `; then ${top.slice(1).join(", ")}` : ""}.${total && p.note ? ` ${p.note}` : ""}`;
}

/** The rows behind one mark of a chart: the plan's own filters plus the mark's value (a zone, a type, a week). */
export function keyFilters(plan: Plan, key: string | number | null): Filter[] {
  const f = [...plan.filters];
  if (key == null || key === "Others") return f;
  const v = String(key);
  switch (plan.by) {
    case "zone": f.push({ col: "_z", op: "in", values: [v] }); break;
    case "ward": f.push({ col: "_w", op: "in", values: [v] }); break;
    case "taluk": f.push({ col: "_t", op: "in", values: [v] }); break;
    case "place": f.push({ col: "_p", op: "in", values: [v] }); break;
    case "col": if (plan.byCol && v !== "(blank)") f.push({ col: plan.byCol, op: "in", values: [v] }); break;
    case "time": {
      const unit = plan.unit ?? "week";
      const [from, to] = unit === "year" ? [`${v}-01-01`, `${v}-12-31`] : unit === "month" ? [`${v}-01`, `${v}-31`] : unit === "week" ? [addDays(v, -6), v] : [v, v];
      f.push({ col: "_d", op: "gte", values: [from] }, { col: "_d", op: "lte", values: [to] });
      break;
    }
  }
  return f;
}
