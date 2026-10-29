/**
 * "Explain this chart": the largest and smallest values of a chart's first series, read from the chart's own data.
 * Pure, so it is tested without a browser; the console reads labels and values from the ECharts instance on screen.
 */
export interface ChartFacts { title: string; hiLabel: string; hi: number; loLabel: string; lo: number; n: number }

export function chartFacts(title: string, labels: unknown[], values: unknown[]): ChartFacts | null {
  const pts = values.map((v, i) => {
    const raw = Array.isArray(v) ? v[v.length - 1] : v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v;
    const num = Array.isArray(raw) ? Number(raw[raw.length - 1]) : Number(raw);
    return { label: String(labels[i] ?? (v && typeof v === "object" && "name" in (v as object) ? (v as { name: unknown }).name : i + 1)), num };
  }).filter((p) => Number.isFinite(p.num));
  if (pts.length < 2) return null;
  const hi = pts.reduce((a, b) => (b.num > a.num ? b : a));
  const lo = pts.reduce((a, b) => (b.num < a.num ? b : a));
  const round = (x: number) => Math.round(x * 10) / 10;
  return { title: title || "This chart", hiLabel: hi.label, hi: round(hi.num), loLabel: lo.label, lo: round(lo.num), n: pts.length };
}
