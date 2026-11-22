/**
 * The Designer: a dashboard for a dataset from what its columns are. Headline cards first (how many, how many still
 * open, the main total, how widely spread), then a map when rows have places, the trend when they have dates, where
 * the open ones are, and the split by type and status. Each panel is a Plan; engine.ts computes it from the rows.
 *
 * "How many" is the rows (one work, one complaint) or, for a periodic return (one row per hospital per week), the sum
 * of the column that says how many (fever cases): counting the rows of a weekly return only counts the reports.
 */
import type { DRow } from "@/lib/studio/clean";
import { unitFor } from "@/lib/studio/engine";
import { openPhrase, type Plan, type Spec } from "@/lib/studio/types";
import { GUARD, type Tier } from "@/lib/studio/readiness";
import { addDays, daysBetween, fmtDay, niceCase } from "@/lib/studio/values";

export function plan(p: Partial<Plan> & Pick<Plan, "id" | "title" | "chart">): Plan {
  return { agg: "count", col: null, by: "none", byCol: null, unit: null, filters: [], sort: "desc", limit: 10, ...p };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Is the file a periodic return? Rows arrive at a steady rate (about the same number on every report date: one per
 * hospital per week), so counting rows only counts reports. Then the main measure is what to count.
 */
export function periodicWeight(rows: DRow[], spec: Spec): string | null {
  const prim = spec.columns.find((c) => c.key === spec.primary && c.role === "measure");
  if (!prim || prim.agg === "avg" || spec.openValues.length) return null;
  const perDay = new Map<string, number>();
  for (const r of rows) if (typeof r._d === "string") { const k = r._d.slice(0, 10); perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const counts = [...perDay.values()];
  if (counts.length < 4 || rows.length < 40) return null;
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
  return mean >= 3 && sd / mean < 0.2 ? prim.key : null;
}

/** The main quantity: a count of rows, or the sum of the weight column for a periodic return. */
export function quantity(spec: Spec): { agg: Plan["agg"]; col: string | null; word: string } {
  const w = spec.weight ? spec.columns.find((c) => c.key === spec.weight) : null;
  return w ? { agg: "sum", col: w.key, word: w.label.toLowerCase() } : { agg: "count", col: null, word: spec.entityPlural };
}

/** Dates that are all the 1st of January: a year column. */
export function yearly(rows: DRow[]): boolean {
  const ds = rows.map((r) => r._d).filter((d): d is string => typeof d === "string");
  return ds.length > 0 && ds.filter((d) => d.endsWith("-01-01")).length >= ds.length * 0.95;
}

/**
 * A table of one row per place (or item) per period: district x year, country x year, shop x month. Found when one
 * text column and the date together name each row once, and its values come back period after period. Totals are then
 * read for the latest period: adding a population up across years means nothing.
 */
export function panelColumn(rows: DRow[], spec: Spec): string | null {
  const dated = rows.filter((r) => typeof r._d === "string");
  const periods = new Set(dated.map((r) => r._d)).size;
  if (dated.length < 30 || periods < 3) return null;
  const cands = spec.columns.filter((c) => ["category", "place", "id", "zone", "ward", "taluk"].includes(c.role));
  for (const c of cands) {
    const seen = new Set<string>();
    let dup = false;
    const vals = new Set<string>();
    for (const r of dated) {
      const v = r[c.key];
      if (v == null) continue;
      const k = `${v}\u0000${r._d}`;
      if (seen.has(k)) { dup = true; break; }
      seen.add(k);
      vals.add(String(v));
    }
    if (!dup && vals.size >= 5 && seen.size >= dated.length * 0.9 && seen.size / vals.size >= 3) return c.key;
  }
  return null;
}

/** The type column that tells most (a work type, a complaint type, a disease): mostly filled, a handful of values. */
export function typeColumn(rows: DRow[], spec: Spec) {
  const BOOST = /type|categor|kind|depart|dept|work|item|disease|topic|subject|scheme|service|issue|nature|class|commodity/i;
  const n = rows.length || 1;
  return spec.columns.filter((c) => c.role === "category" && c.key !== spec.panelBy).map((c) => {
    const counts = new Map<string, number>();
    let filled = 0;
    for (const r of rows) { const v = r[c.key]; if (v == null) continue; filled++; counts.set(String(v), (counts.get(String(v)) ?? 0) + 1); }
    const d = counts.size, top = Math.max(0, ...counts.values());
    const ok = filled >= n * 0.6 && d >= 3 && d <= 40 && top < filled * 0.9;
    return { c, ok, s: (BOOST.test(c.header) ? 3 : 0) + (d <= 20 ? 1 : 0) + filled / n };
  }).filter((x) => x.ok).sort((a, b) => b.s - a.s)[0]?.c ?? null;
}

/**
 * How much the cleaned rows can honestly show (readiness.ts): a fact card (1-5 rows), a small table (6-20), or the
 * dashboard. A file with no measure, date, place or type to group by stays a table however long it is.
 */
export function tierOfRows(rows: DRow[], spec: Spec): Tier {
  const n = rows.length;
  if (!n) return "empty";
  if (n <= GUARD.factRows) return "fact";
  if (n <= GUARD.smallRows) return "small";
  const structured = spec.columns.some((c) => ["measure", "date", "zone", "ward", "place", "taluk", "category", "status", "lat"].includes(c.role));
  return structured ? "full" : "small";
}

/** A snapshot's item column (one row per lake, hospital, shop): its values are nearly all different. */
function snapshotItem(rows: DRow[], spec: Spec) {
  return spec.columns.find((c) => (c.role === "category" || c.role === "place") && c.key !== spec.panelBy && (() => {
    const vals = rows.map((r) => r[c.key]).filter((v) => v != null).map(String);
    return vals.length >= 3 && vals.length <= 300 && new Set(vals).size >= vals.length * 0.8;
  })());
}

/** The measures that move (storage, cases, stock), not fixed reference values (full tank level, capacity) or last year's. */
function movingMeasures(spec: Spec) {
  return spec.columns.filter((c) => c.role === "measure" && !/last\s*year|previous|same\s*day/i.test(c.header) && !/capacity|full\b|\bmax\b|maximum|target|sanction/i.test(c.header));
}

/**
 * Readings: each row is a value measured (a station's daily PM2.5, a day's riders, a reservoir's level), not an event to
 * count. That is a dated file with a measure, no status to count, no weight column, and not a snapshot of items. Its
 * charts and findings are about the value: a count of its rows only says how often someone wrote one down. Returns the
 * column read (the primary measure), or null for events.
 */
export function readingsColumn(rows: DRow[], spec: Spec): Spec["columns"][number] | null {
  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  if (hasOpen || quantity(spec).col || !spec.columns.some((c) => c.role === "date")) return null;
  const measures = movingMeasures(spec);
  if (snapshotItem(rows, spec) && measures.length) return null;
  const prim = spec.columns.find((c) => c.key === spec.primary) ?? null;
  return prim?.role === "measure" ? prim : measures[0] ?? null;
}

export function designDashboard(rows: DRow[], spec: Spec, window: { from: string | null; to: string | null }): Plan[] {
  const full = designFull(rows, spec, window);
  const tier = tierOfRows(rows, spec);
  if (tier === "full" || tier === "empty") return full;
  const kpis = full.filter((p) => p.chart === "kpi").slice(0, 3);
  const prim = spec.columns.find((c) => c.key === spec.primary && c.role === "measure") ?? spec.columns.find((c) => c.role === "measure") ?? null;
  // the rows themselves, the largest first, with bars in the measure's cells
  const table = plan({ id: "rows", title: tier === "fact" ? "The figures" : prim ? `${spec.entityPlural.charAt(0).toUpperCase() + spec.entityPlural.slice(1)} by ${prim.label.toLowerCase()}` : "The rows",
    chart: "table", col: prim?.key ?? null, sort: "desc", limit: GUARD.smallRows });
  if (tier === "fact") return [...kpis, table];
  // a small table: at most one sorted bar, and only for a clear ranking (a category or place, and a measure)
  const ranking = full.find((p) => (p.chart === "hbar" || p.chart === "bar") && p.by !== "time" && p.by !== "none");
  return [...kpis, table, ...(ranking ? [{ ...ranking, chart: "hbar" as const }] : [])];
}

function designFull(rows: DRow[], spec: Spec, window: { from: string | null; to: string | null }): Plan[] {
  const out: Plan[] = [];
  const n = rows.length || 1;
  const placed = rows.filter((r) => r._z != null).length;
  const wardLevel = rows.filter((r) => r._w != null).length;
  const pointed = rows.filter((r) => typeof r._la === "number").length;
  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  const openF = hasOpen ? [{ col: "_o", op: "open" as const, values: [] }] : [];
  const prim = spec.columns.find((c) => c.key === spec.primary) ?? null;
  const date = spec.columns.find((c) => c.role === "date");
  const q = quantity(spec);
  const { adj: ow, are } = openPhrase(spec);
  const what = hasOpen ? `${q.word} ${ow}` : q.word;
  const measure = { agg: q.agg, col: q.col };
  const years = yearly(rows);
  const unit = unitFor(window.from, window.to, years);
  // a period table reads its totals in the latest period
  const panel = spec.panelBy ? spec.columns.find((c) => c.key === spec.panelBy) ?? null : null;
  const latest = panel && window.to ? [{ col: "_d", op: "latest" as const, values: [] }] : [];
  const when = panel && window.to ? ` (${years ? window.to.slice(0, 4) : fmtDay(window.to)})` : "";

  const itemCol = snapshotItem(rows, spec);
  const measures = movingMeasures(spec);
  const snapshot = !!(itemCol && !q.col && measures.length);
  // Readings: each row is a value measured, not an event to count (readingsColumn): the charts show that value
  const readCol = readingsColumn(rows, spec);
  // the readings come from several places (rain gauges, air stations): a total over them grows with how many report, so
  // they are averaged; one series (a day's riders) keeps the column's own way of adding up
  const placeCol = spec.columns.find((c) => c.role === "place");
  const placesN = new Set(rows.map((r) => r._p).filter(Boolean)).size;
  const cat = typeColumn(rows, spec);
  const several = placesN >= 2 || (!!cat && new Set(rows.map((r) => r[cat.key]).filter((v) => v != null)).size >= 2);
  const rm = readCol ? { agg: (readCol.agg === "avg" || readCol.unit === "%" || several ? "avg" : readCol.agg === "max" ? "max" : "sum") as Plan["agg"], col: readCol.key } : null;
  // a name with capitals or figures (PM2.5, NO2) keeps them
  const lc = (s: string) => (/[A-Z]{2,}|\d/.test(s) ? s : s.toLowerCase());
  const rWord = readCol ? `${rm!.agg === "avg" ? "Average " : rm!.agg === "max" ? "Highest " : ""}${rm!.agg === "sum" ? cap(readCol.label) : lc(readCol.label)}` : "";

  // ---- headline cards: only numbers a Collector acts on (no "columns", "types" or "wards covered" counts)
  const span = window.from && window.to ? daysBetween(window.from, window.to) : 0;
  out.push(plan({ id: "k1", title: cap(q.col ? q.word : spec.entityPlural), chart: "kpi", ...(q.col ? measure : {}), filters: latest }));
  if (hasOpen) out.push(plan({ id: "k2", title: cap(ow), chart: "kpi", filters: openF }));
  else if (panel) out.push(plan({ id: "k2", title: `${cap(panel.label)}s`, chart: "kpi", agg: "distinct", col: panel.key }));
  else if (date && window.to && !years && span >= 21) out.push(plan({ id: "k2", title: "Last 7 days", chart: "kpi", ...measure, filters: [{ col: "_d", op: "recent_days", values: ["7"] }] }));
  if (hasOpen && date && window.to && span >= 30) out.push(plan({ id: "k4", title: "Waiting 30+ days", chart: "kpi", filters: [...openF, { col: "_d", op: "lte", values: [addDays(window.to, -31)] }] }));
  if (readCol && rm!.agg !== "sum") {
    out.push(plan({ id: "k3", title: `Average ${lc(readCol.label)}`, chart: "kpi", agg: "avg", col: readCol.key }));
    out.push(plan({ id: "k7", title: `Highest ${lc(readCol.label)}`, chart: "kpi", agg: "max", col: readCol.key }));
  } else if (prim && prim.agg !== "avg" && prim.key !== q.col) out.push(plan({ id: "k3", title: `Total ${prim.label.toLowerCase()}${when}`, chart: "kpi", agg: "sum", col: prim.key, filters: latest }));
  else if (!hasOpen && date && window.to && !years && span >= 56) out.push(plan({ id: "k3", title: "Last 28 days", chart: "kpi", ...measure, filters: [{ col: "_d", op: "recent_days", values: ["28"] }] }));

  // ---- evidence: the map (or zones), the trend, the main type, the status; at most four
  // a map needs 5 places and a fifth of the rows placed (readiness.ts GUARD)
  const zonesSeen = new Set(rows.map((r) => r._z).filter((z) => z != null)).size;
  // readings from a handful of named stations read better as a ranking by name than as a map of wards
  const fewStations = !!readCol && !!placeCol && placesN >= 2 && placesN <= 8;
  const mapped = !fewStations && ((placed / n >= GUARD.minMapPlacedShare && zonesSeen >= GUARD.minMapPlaces) || (pointed / n >= GUARD.minMapPlacedShare && pointed >= GUARD.minMapPlaces));
  if (mapped) {
    const places = new Set(rows.map((r) => r._p).filter(Boolean)).size;
    const by = spec.columns.some((c) => c.role === "place") && places >= 6 && pointed / n >= 0.3 ? "place" : wardLevel / n >= 0.5 ? "ward" : "zone";
    out.push(plan({ id: "map", title: (readCol ? `${rWord} by place` : hasOpen ? `Where ${q.word} ${are}` : `Where the ${q.word} are`) + when, chart: "map", by, ...(rm ?? measure), filters: [...openF, ...latest], limit: 300 }));
  }
  if (date && window.from && window.to && new Set(rows.map((r) => r._d).filter(Boolean)).size >= GUARD.minTrendPeriods) {
    // a long run of readings is read month by month, so its season shows (a year at a time hides it)
    const rUnit = readCol && !years && span > 400 && span <= 2200 ? "month" : unit;
    out.push(plan({ id: "trend", title: readCol ? `${rWord} over time` : `${cap(q.word)} over time`, chart: years ? "bar" : "area", by: "time", ...(rm ?? measure), unit: rUnit, sort: "key", limit: readCol ? 80 : 60 }));
  }
  // readings at a few named places too few for a map (four air-quality stations): the measure place by place
  if (readCol && !mapped && placeCol && placesN >= 2 && placesN <= 30)
    out.push(plan({ id: "byplace", title: `${rWord} by ${placeCol.label.toLowerCase()}`, chart: "hbar", by: "col", byCol: placeCol.key, ...rm!, limit: 15 }));
  // the leaders of a period table (top countries, top districts)
  if (panel) {
    const m = prim ? { agg: (prim.agg === "avg" ? "avg" : "sum") as Plan["agg"], col: prim.key } : measure;
    out.push(plan({ id: "top", title: `Top ${panel.label.toLowerCase()}s${prim ? ` by ${prim.label.toLowerCase()}` : ""}${when}`, chart: "hbar", by: "col", byCol: panel.key, ...m, filters: latest, limit: 10 }));
  }
  // the most telling type column (work type, complaint type, disease; found above), split by what is open when there is a status
  if (snapshot) {
    const firstSum = measures.find((c) => c.agg === "sum" && c.unit !== "%");
    if (prim?.agg === "avg" || prim?.unit === "%") out.splice(1, 0, plan({ id: "k5", title: `Average ${prim.label.toLowerCase()}`, chart: "kpi", agg: "avg", col: prim.key, filters: latest }));
    if (firstSum && firstSum.key !== prim?.key) out.splice(2, 0, plan({ id: "k6", title: `Total ${firstSum.label.toLowerCase()}`, chart: "kpi", agg: "sum", col: firstSum.key, filters: latest }));
    const shown = [prim, ...measures.filter((c) => c.key !== prim?.key)].filter((c): c is NonNullable<typeof c> => !!c).slice(0, 3);
    shown.forEach((m, i) => out.push(plan({ id: i ? `item${i}` : "cat", title: `${m.label} by ${itemCol.label.toLowerCase()}`, chart: "hbar", by: "col", byCol: itemCol.key,
      agg: m.agg === "avg" || m.unit === "%" ? "avg" : m.agg === "max" ? "max" : "sum", col: m.key, filters: latest, limit: 15 })));
  } else if (cat && readCol) {
    out.push(plan({ id: "cat", title: `${rWord} by ${cat.label.toLowerCase()}${when}`, chart: "hbar", by: "col", byCol: cat.key, ...rm!, filters: latest, limit: 10 }));
  } else if (cat) {
    const d = new Set(rows.map((r) => r[cat.key]).filter((v) => v != null)).size;
    out.push(plan({ id: "cat", title: `${hasOpen ? `${cap(q.word)} ${ow}` : cap(q.word)} by ${cat.label.toLowerCase()}${when}`, chart: d <= GUARD.maxDonutParts ? "donut" : "hbar", by: "col", byCol: cat.key, ...measure, filters: [...openF, ...latest], limit: d <= 5 ? 6 : 8 }));
  }
  if (placed / n >= 0.2 && !mapped && !out.some((p) => p.id === "byplace")) out.push(plan({ id: "zone", title: `${readCol ? rWord : cap(what)} by zone${when}`, chart: "hbar", by: "zone", ...(rm ?? measure), filters: [...openF, ...latest], limit: 8 }));
  // a wide table of readings (one column per reservoir): the next measures over time too, up to four charts in all
  if (readCol && !cat && !placeCol) {
    // the biggest of the other measures first (riders by card before riders by a rarely used ticket)
    const size = (k: string) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? Math.abs(r[k] as number) : 0), 0);
    const others = measures.filter((c) => c.key !== readCol.key && c.unit === readCol.unit).map((c) => ({ c, s: size(c.key) })).sort((a, b) => b.s - a.s).map((x) => x.c);
    for (const m of others.slice(0, 3)) {
      if (out.filter((p) => p.chart !== "kpi").length >= 4) break;
      const agg = (m.agg === "avg" || m.unit === "%" ? "avg" : "sum") as Plan["agg"];
      out.push(plan({ id: `trend_${m.key}`, title: `${agg === "avg" ? "Average " : ""}${agg === "avg" ? m.label.toLowerCase() : cap(m.label)} over time`, chart: "area", by: "time", agg, col: m.key,
        unit: !years && span > 400 && span <= 2200 ? "month" : unit, sort: "key", limit: 80 }));
    }
  }
  const status = spec.columns.find((c) => c.role === "status");
  if (status && out.filter((p) => p.chart !== "kpi").length < 4) {
    const d = new Set(rows.map((r) => r[status.key]).filter((v) => v != null)).size;
    if (d >= 2) out.push(plan({ id: "status", title: niceCase(status.label), chart: d <= GUARD.maxDonutParts ? "donut" : "hbar", by: "col", byCol: status.key, limit: 8 }));
  }
  return out;
}
