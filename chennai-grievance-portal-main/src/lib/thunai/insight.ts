/**
 * The insights on Thunai's screens, computed by code with explicit rules (never by the model): rank, gap against the
 * median, change against the previous period, the largest relative gaps between areas, unusual points in a series,
 * share of a total. Each result says its method, so the screen can label it.
 */

export interface Ranked<T> { item: T; value: number; rank: number }

/** Top (or bottom) n by value; ties keep the input order. Items without a finite value are left out. */
export function rank<T>(items: T[], value: (x: T) => number | null | undefined, n: number, order: "top" | "bottom" = "top"): Ranked<T>[] {
  const rows = items.map((item, i) => ({ item, value: value(item), i })).filter((r): r is { item: T; value: number; i: number } => typeof r.value === "number" && Number.isFinite(r.value));
  rows.sort((a, b) => (order === "top" ? b.value - a.value : a.value - b.value) || a.i - b.i);
  return rows.slice(0, Math.max(0, n)).map((r, k) => ({ item: r.item, value: r.value, rank: k + 1 }));
}

export function median(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** A value against the median of its peers: the ratio (2 = twice the median) or null when the median is 0. */
export function vsMedian(value: number, peers: number[]): { median: number | null; ratio: number | null } {
  const m = median(peers);
  return { median: m, ratio: m && m > 0 ? round(value / m, 1) : null };
}

/** Change against the previous period: the difference and the percentage (null when there was nothing before). */
export function change(cur: number, prev: number | null | undefined): { delta: number | null; pct: number | null } {
  if (prev == null || !Number.isFinite(prev)) return { delta: null, pct: null };
  return { delta: cur - prev, pct: prev > 0 ? round(((cur - prev) / prev) * 100, 0) : null };
}

export interface Gap { metric: string; hi: string; lo: string; hiValue: number; loValue: number; ratio: number | null; gap: number }

/**
 * Where two or more areas differ most: per metric, the highest against the lowest side, ranked by the relative gap
 * (ratio, a lowest of 0 counted as the gap itself), then by the absolute gap. Metrics where all sides agree are dropped.
 */
export function largestGaps(sides: { label: string; values: Record<string, number> }[], metrics: string[]): Gap[] {
  const out: Gap[] = [];
  for (const m of metrics) {
    const vs = sides.map((s) => ({ label: s.label, v: s.values[m] })).filter((x) => Number.isFinite(x.v));
    if (vs.length < 2) continue;
    const hi = vs.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = vs.reduce((a, b) => (b.v < a.v ? b : a));
    const gap = hi.v - lo.v;
    if (gap <= 0) continue;
    out.push({ metric: m, hi: hi.label, lo: lo.label, hiValue: hi.v, loValue: lo.v, ratio: lo.v > 0 ? round(hi.v / lo.v, 1) : null, gap });
  }
  const strength = (g: Gap) => (g.ratio ?? (g.hiValue >= 3 ? 10 : 1));
  return out.sort((a, b) => strength(b) - strength(a) || b.gap - a.gap);
}

/**
 * Unusual points of a series: above the normal band when one is given (the console's "usual range"), else more than
 * two standard deviations above the series' own mean (needs 6 points or more).
 */
export function unusualPoints(values: number[], normal: { lo: number; hi: number } | null = null): number[] {
  if (normal) return values.map((v, i) => (v > normal.hi ? i : -1)).filter((i) => i >= 0);
  if (values.length < 6) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (!sd) return [];
  return values.map((v, i) => ((v - mean) / sd > 2 ? i : -1)).filter((i) => i >= 0);
}

export function share(part: number, total: number): number | null {
  return total > 0 ? round((part / total) * 100, 0) : null;
}

/** The peak of a series: its index and value (first one on a tie). */
export function peak(values: number[]): { i: number; value: number } | null {
  if (!values.length) return null;
  let i = 0;
  values.forEach((v, k) => { if (v > values[i]) i = k; });
  return { i, value: values[i] };
}

/** Group station or point readings by an area key with max or mean: the method is part of the answer. */
export function aggregate<T>(rows: T[], key: (x: T) => string | number | null, value: (x: T) => number, how: "max" | "mean"): { key: string | number; value: number; n: number }[] {
  const by = new Map<string | number, number[]>();
  for (const r of rows) {
    const k = key(r);
    const v = value(r);
    if (k == null || !Number.isFinite(v)) continue;
    by.set(k, [...(by.get(k) ?? []), v]);
  }
  return [...by.entries()].map(([k, vs]) => ({ key: k, n: vs.length, value: how === "max" ? Math.max(...vs) : round(vs.reduce((a, b) => a + b, 0) / vs.length, 1) }));
}

export function round(v: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** A figure as a sentence says it: whole numbers stay whole, others keep one decimal. */
export function spoken(v: number): string {
  return Number.isInteger(v) ? String(v) : String(round(v, 1));
}
