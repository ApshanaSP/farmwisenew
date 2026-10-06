/**
 * Drill-down and "Needs attention": what makes the Studio dashboard something to act on rather than look at.
 *
 * drill()      one mark of a chart (a zone bar, a donut slice, a week on the trend, a map area, a headline card)
 *              opened: the rows behind it, how it compares (share of the chart, against the average mark, rank), how it
 *              breaks down by time, place and type, and the district's incidents in its zones
 * attention()  the few things in the data that need the Collector: hotspot zones, items waiting too long, zones
 *              rising fastest, values far out of line, zones that are hotspots in the incidents too. Each opens its drill.
 *
 * Every number comes from engine.ts over the rows.
 */
import type { DRow } from "@/lib/studio/clean";
import { plan as mk, quantity } from "@/lib/studio/dashboard";
import { describeFilter, filterRows, formatOf, keyFilters, runPlan, unitFor, type Names } from "@/lib/studio/engine";
import { incidentsFor } from "@/lib/studio/link";
import { fmtNum, type AttentionItem, type DatasetMeta, type DrillResult, type Filter, type PanelData, type Plan } from "@/lib/studio/types";
import { addDays, median } from "@/lib/studio/values";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The label a chart gives a key (zone name, "Ward 12", a date). */
function labelOf(plan: Plan, key: string | number | null, names: Names): string {
  if (key == null) return plan.title;
  if (plan.by === "zone") return names.zone(Number(key));
  if (plan.by === "ward") return `Ward ${key}`;
  if (plan.by === "taluk") return names.taluk(String(key));
  if (plan.by === "time") return (plan.unit ?? "week") === "week" ? `Week to ${key}` : String(key);
  return String(key);
}

export async function drill(meta: DatasetMeta, rows: DRow[], plan: Plan, key: string | number | null, extra: Filter[], names: Names): Promise<DrillResult> {
  const spec = meta.spec;
  const q = quantity(spec);
  const base: Plan = { ...plan, filters: [...extra, ...plan.filters] };
  const filters = [...extra, ...keyFilters(plan, key)];
  // the subset's own measure (the chart's measure, for these rows)
  const one = runPlan(rows, spec, { ...plan, id: "d-one", by: "none", byCol: null, chart: "kpi", filters }, names);
  const value = one.kpi?.value ?? one.total;
  const { format, unit } = formatOf(spec, plan);
  // how the mark compares with the other marks of its chart
  let share: number | null = null, vsAvg: number | null = null, rank: DrillResult["rank"] = null;
  if (key != null && plan.by !== "none") {
    const all = runPlan(rows, spec, { ...base, id: "d-all", limit: 300, chart: plan.chart === "map" ? "hbar" : plan.chart }, names);
    const vals = all.values;
    if (vals.length > 1) {
      const sum = vals.reduce((a, b) => a + b, 0), mean = sum / vals.length;
      if (plan.agg === "count" || plan.agg === "sum") share = pct(value, all.total || sum);
      vsAvg = mean ? Math.round((value / mean) * 10) / 10 : null;
      const sorted = [...vals].sort((a, b) => b - a);
      const pos = sorted.indexOf(value) + 1;
      if (pos > 0 && plan.by !== "time") rank = { pos, of: vals.length };
    }
  }
  const sel = filterRows(rows, { ...plan, filters }, names);
  // how it breaks down: over time, by zone, by type / status (whatever the chart itself is not already showing)
  const breakdowns: PanelData[] = [];
  const measure = plan.agg === "count" ? { agg: q.agg, col: q.col } : { agg: plan.agg, col: plan.col };
  const dated = sel.filter((r) => typeof r._d === "string").map((r) => String(r._d)).sort();
  if (plan.by !== "time" && dated.length >= 5 && new Set(dated).size >= 3)
    breakdowns.push(runPlan(rows, spec, mk({ id: "b-time", title: "Over time", chart: "area", by: "time", ...measure, unit: unitFor(dated[0], dated[dated.length - 1]), filters, sort: "key", limit: 60 }), names));
  if (plan.by !== "zone" && new Set(sel.map((r) => r._z).filter((z) => z != null)).size >= 2)
    breakdowns.push(runPlan(rows, spec, mk({ id: "b-zone", title: "By zone", chart: "hbar", by: "zone", ...measure, filters, limit: 8 }), names));
  for (const c of spec.columns.filter((x) => (x.role === "category" || x.role === "status") && x.key !== plan.byCol && x.key !== spec.panelBy)) {
    if (breakdowns.length >= 3) break;
    const d = new Set(sel.map((r) => r[c.key]).filter((v) => v != null)).size;
    if (d >= 2 && d <= 40) breakdowns.push(runPlan(rows, spec, mk({ id: `b-${c.key}`, title: `By ${c.label.toLowerCase()}`, chart: d <= 6 ? "donut" : "hbar", by: "col", byCol: c.key, ...measure, filters, limit: 8 }), names));
  }
  const table = runPlan(rows, spec, mk({ id: "d-rows", title: "Rows", chart: "table", filters, sort: plan.sort === "asc" ? "asc" : "desc", limit: 150 }), names).table;
  // the district's incidents where these rows are
  const zc = new Map<number, number>();
  for (const r of sel) if (typeof r._z === "number") zc.set(r._z, (zc.get(r._z) ?? 0) + 1);
  const zones = [...zc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([z]) => z);
  const codes = meta.link?.category.codes ?? spec.linkCategories;
  const incidents = zones.length && zones.length <= 3 ? await incidentsFor(zones, codes, 8) : [];

  const label = labelOf(plan, key, names);
  const f = (v: number) => fmtNum(v, format, unit);
  const what = plan.agg === "count" ? q.word : plan.title.toLowerCase();
  const facts = [
    `${label}: ${f(value)} ${plan.agg === "count" ? what : ""}`.trim() + ` (${sel.length.toLocaleString("en-IN")} ${sel.length === 1 ? spec.entity : spec.entityPlural}).`,
    share != null ? `That is ${share}% of the chart's total.` : "",
    vsAvg != null ? `It is ${vsAvg} times the average of the ${rank?.of ?? "other"} ${plan.by === "zone" ? "zones" : "groups"} shown.` : "",
    rank ? `It ranks ${rank.pos} of ${rank.of}.` : "",
    ...breakdowns.slice(0, 3).filter((b) => b.labels.length && b.plan.by !== "time").map((b) => `${b.title}: ${b.labels.slice(0, 3).map((l, i) => `${l} ${fmtNum(b.values[i], b.format, b.unit)}`).join(", ")}.`),
    incidents.length ? `${incidents.filter((i) => i.open).length} of ${incidents.length} related district incidents shown are still open.` : ""
  ].filter(Boolean);
  return {
    label, title: plan.title, filters,
    chips: filters.map((x) => describeFilter(spec, x, names)).filter(Boolean),
    rows: sel.length, value, format, unit, measure: plan.agg === "count" ? q.word : plan.title,
    share, vsAvg, rank, breakdowns, table, incidents, facts
  };
}

/** The things to act on first, most serious first. Each item opens its drill. */
export function attention(meta: DatasetMeta, rows: DRow[], extra: Filter[], names: Names): AttentionItem[] {
  const spec = meta.spec;
  const items: AttentionItem[] = [];
  const q = quantity(spec);
  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  const ow = spec.openWord || "still open";
  const openF: Filter[] = hasOpen ? [{ col: "_o", op: "open", values: [] }] : [];
  const latest: Filter[] = spec.panelBy ? [{ col: "_d", op: "latest", values: [] }] : [];
  const word = hasOpen ? `${q.word} ${ow}` : q.word;
  const measure = { agg: q.agg, col: q.col };
  const placed = rows.filter((r) => r._z != null).length;

  // 1. hotspot zones: well above the average zone (only on the district view: focused on one zone, there is nothing to compare)
  const zoneFocused = extra.some((f) => f.col === "_z" || f.col === "_w");
  if (placed >= Math.max(10, rows.length * 0.2) && !zoneFocused) {
    const zp = mk({ id: "a-zone", title: `${cap(word)} by zone`, chart: "hbar", by: "zone", ...measure, filters: [...extra, ...openF, ...latest], limit: 15 });
    const r = runPlan(rows, spec, zp, names);
    const mean = r.values.length ? r.values.reduce((a, b) => a + b, 0) / 15 : 0;
    r.labels.slice(0, 3).forEach((l, i) => {
      const v = r.values[i];
      if (mean && v >= mean * 1.5 && v >= 5)
        items.push({ id: `hot-${r.keys[i]}`, kind: "hotspot", tone: i === 0 ? "sev" : "high", title: `${l}: ${fmtNum(v, r.format, r.unit)} ${word}`,
          detail: `${Math.round((v / mean) * 10) / 10}× the average zone · ${pct(v, r.total)}% of the district`, plan: { ...zp, filters: [...openF, ...latest] }, key: r.keys[i] });
    });
  }
  // 2. waiting too long: open items whose date is more than 30 days back
  const end = rows.reduce<string | null>((m, x) => (typeof x._d === "string" && (!m || x._d > m) ? x._d : m), null);
  if (hasOpen && end) {
    const cut = addDays(end, -30);
    const old = filterRows(rows, mk({ id: "x", title: "", chart: "kpi", filters: [...extra, ...openF, { col: "_d", op: "lte", values: [cut] }] }), names);
    if (old.length >= 3) {
      const oldest = old.reduce((m, x) => (String(x._d) < m ? String(x._d) : m), String(old[0]._d));
      const days = Math.round((Date.parse(end) - Date.parse(oldest)) / 86400_000);
      items.push({ id: "waiting", kind: "waiting", tone: old.length >= rows.filter((x) => x._o === 1).length * 0.25 ? "sev" : "high",
        title: `${old.length.toLocaleString("en-IN")} ${spec.entityPlural} ${ow} for over 30 days`, detail: `the oldest dates from ${days} days before the latest entry · oldest first`,
        plan: mk({ id: "a-old", title: `${cap(spec.entityPlural)} ${ow} for over 30 days`, chart: "table", filters: [...openF, { col: "_d", op: "lte", values: [cut] }], sort: "asc" }), key: null });
    }
  }
  // 3. rising: the zone (or type) whose last 4 weeks most exceed the 4 before
  if (end && rows.filter((r) => r._d).length >= 30 && !spec.panelBy) {
    const a0 = addDays(end, -27), b0 = addDays(end, -55);
    const dim = placed >= rows.length * 0.3 ? { by: "zone" as const, byCol: null } : (() => { const c = spec.columns.find((x) => x.role === "category"); return c ? { by: "col" as const, byCol: c.key } : null; })();
    if (dim) {
      const recent = runPlan(rows, spec, mk({ id: "r1", title: "", chart: "hbar", ...dim, ...measure, filters: [...extra, { col: "_d", op: "gte", values: [a0] }], limit: 50 }), names);
      const before = runPlan(rows, spec, mk({ id: "r0", title: "", chart: "hbar", ...dim, ...measure, filters: [...extra, { col: "_d", op: "gte", values: [b0] }, { col: "_d", op: "lte", values: [addDays(a0, -1)] }], limit: 50 }), names);
      const prev = new Map(before.keys.map((k, i) => [k, before.values[i]]));
      const rises = recent.keys.map((k, i) => ({ k, l: recent.labels[i], a: recent.values[i], b: prev.get(k) ?? 0 })).filter((x) => x.a >= 5 && x.b >= 3 && x.a >= x.b * 1.3)
        .sort((x, y) => (y.a - y.b) / y.b - (x.a - x.b) / x.b);
      const top = rises[0];
      if (top) items.push({ id: `rise-${top.k}`, kind: "rising", tone: "high", title: `${top.l}: up ${Math.round(((top.a - top.b) / top.b) * 100)}% in the last 4 weeks`,
        detail: `${fmtNum(top.a, recent.format, recent.unit)} against ${fmtNum(top.b, recent.format, recent.unit)} in the 4 weeks before`,
        plan: mk({ id: "a-rise", title: `${cap(q.word)} in the last 4 weeks`, chart: "hbar", ...dim, ...measure, filters: [{ col: "_d", op: "gte", values: [a0] }], limit: 15 }), key: top.k });
    }
  }
  // 4. values far out of line (likely errors, or the costliest items)
  const prim = spec.columns.find((c) => c.key === spec.primary && c.role === "measure");
  if (prim) {
    const xs = rows.map((r) => r[prim.key]).filter((v): v is number => typeof v === "number" && v > 0);
    const med = median(xs), mad = med == null ? null : median(xs.map((x) => Math.abs(x - med)));
    if (med != null && mad && xs.length >= 12) {
      const cut = med + 8 * 1.4826 * mad;
      const n = xs.filter((x) => x > cut).length;
      const { format, unit } = formatOf(spec, mk({ id: "f", title: "", chart: "kpi", agg: "sum", col: prim.key }));
      if (n && n <= Math.max(3, xs.length * 0.02))
        items.push({ id: "outlier", kind: "outlier", tone: "info", title: `${n} ${prim.label.toLowerCase()} ${n === 1 ? "value" : "values"} far above the rest`,
          detail: `above ${fmtNum(cut, format, unit)} where the typical is ${fmtNum(med, format, unit)} · check before using totals`,
          plan: mk({ id: "a-out", title: `Unusually high ${prim.label.toLowerCase()}`, chart: "table", filters: [{ col: prim.key, op: "gte", values: [String(Math.ceil(cut))] }] }), key: null });
    }
  }
  // 5. hotspots in both this data and the district's incidents
  const l = meta.link;
  if (l && l.mode === "place" && l.strength !== "none" && l.overlap.length && !zoneFocused) {
    const o = l.overlap[0];
    items.push({ id: `link-${o.key}`, kind: "linked", tone: l.strength === "strong" ? "sev" : "high", title: `${o.name}: hotspot in both sources`,
      detail: `${o.ds.toLocaleString("en-IN")} ${l.dsLabel} and ${o.inc.toLocaleString("en-IN")} ${l.incLabel.toLowerCase()}`,
      plan: mk({ id: "a-link", title: `${cap(word)} by zone`, chart: "hbar", by: "zone", ...measure, filters: [...openF], limit: 15 }), key: o.key });
  }
  // 6. a type that dominates (news topics, complaint kinds)
  const cat = spec.columns.find((c) => c.role === "category" && c.key !== spec.panelBy);
  if (cat && items.length < 5) {
    const r = runPlan(rows, spec, mk({ id: "a-cat", title: `By ${cat.label.toLowerCase()}`, chart: "hbar", by: "col", byCol: cat.key, ...measure, filters: [...extra, ...openF, ...latest], limit: 10 }), names);
    if (r.values.length >= 3 && r.total && r.values[0] / r.total >= 0.3)
      items.push({ id: `cat-${r.keys[0]}`, kind: "share", tone: "info", title: `${r.labels[0]}: ${pct(r.values[0], r.total)}% of ${word}`,
        detail: `${fmtNum(r.values[0], r.format, r.unit)} of ${fmtNum(r.total, r.format, r.unit)} · the largest ${cat.label.toLowerCase()}`, plan: { ...r.plan, filters: [...openF, ...latest] }, key: r.keys[0] });
  }
  const order = { sev: 0, high: 1, info: 2, low: 3, violet: 4, teal: 5 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
}
