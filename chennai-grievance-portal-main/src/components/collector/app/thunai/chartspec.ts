/**
 * What a Stage Chart block is drawn as (StageChart.tsx): a "line" chart is a line over its labels, a "bar" chart upright bars, an "hbar" chart
 * bars lying down, a "donut" a ring. Before v4 a "line" chart was drawn as upright bars (Stage.tsx, defect 9). Pure, so it is tested in node.
 */
import type { BlockT } from "@/lib/thunai/stage";
import type { StageChartSpec } from "./StageChart";

export type ChartBlock = Extract<BlockT, { kind: "Chart" }>;

export function chartSpecOf(b: ChartBlock): StageChartSpec {
  if (b.chart === "donut") return { type: "donut", labels: b.labels, values: b.values, unit: b.unit };
  if (b.chart === "line") return { type: "line", labels: b.labels, values: b.values, unit: b.unit };
  return { type: "bars", labels: b.labels, values: b.values, keys: b.labels, unit: b.unit, horizontal: b.chart === "hbar", highlight: null };
}

/** the chart's height: a line or upright bars by the plot, bars lying down by how many there are */
export const chartHeight = (b: ChartBlock): number => (b.chart === "line" || b.chart === "bar" ? 240 : Math.max(180, Math.min(320, b.labels.length * 30 + 30)));

type CompareBlock = Extract<BlockT, { kind: "Compare" }>;
export interface CompareGroup { key: string; title: string; categories: string[]; series: { name: string; values: number[] }[] }
/**
 * 28 Nov: a comparison's breakdowns on one scale (Stage.tsx Compare): for each of the kinds, the departments and who reported them, the items
 * the sides hold the most of (up to eight, by their total across the sides), each side's count of each (0 when it has none). Only a comparison
 * that carries its breakdowns (recipes/board.ts sets `chart`): the older screens' top-five lists stay lists.
 */
export function compareGroups(b: CompareBlock, ta: boolean): CompareGroup[] {
  const out: CompareGroup[] = [];
  const add = (key: string, title: string, items: (s: CompareBlock["sides"][number]) => { k: string; label: string; n: number }[], max = 8) => {
    const tot = new Map<string, { label: string; n: number }>();
    for (const s of b.sides) for (const x of items(s)) { const t = tot.get(x.k) ?? { label: x.label, n: 0 }; t.n += x.n; tot.set(x.k, t); }
    const top = [...tot.entries()].filter(([, v]) => v.n > 0).sort((x, y) => y[1].n - x[1].n).slice(0, max);
    if (top.length < 2) return;
    out.push({ key, title, categories: top.map(([, v]) => v.label), series: b.sides.map((s) => { const m = new Map(items(s).map((x) => [x.k, x.n])); return { name: s.label, values: top.map(([k]) => m.get(k) ?? 0) }; }) });
  };
  if (b.chart) add("cats", ta ? "வகை வாரியாக" : "By kind", (s) => s.cats.map((c) => ({ k: c.code, label: c.label, n: c.n })));
  if (b.sides.every((s) => s.depts?.length)) add("depts", ta ? "துறை வாரியாக" : "By department", (s) => (s.depts ?? []).map((d) => ({ k: d.code, label: d.label, n: d.n })));
  if (b.sides.every((s) => s.from?.length)) add("from", ta ? "யார் பதிவு செய்தனர்" : "Who reported them", (s) => (s.from ?? []).map((f) => ({ k: f.key, label: f.label, n: f.n })), 5);
  return out;
}
