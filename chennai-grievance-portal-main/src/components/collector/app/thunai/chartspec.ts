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
