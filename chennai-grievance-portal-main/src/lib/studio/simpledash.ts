/**
 * How a dataset's findings and charts become dashboard tiles: a finding drawn as a chart (its evidence bars, its weekly
 * series, or the chart it is about), which of the dataset's charts are worth a tile, and the order findings are taken
 * in. Used by the named dashboards (dashboards.ts); every value is computed from the rows, nothing here asks a model.
 */
import type { BriefItem, PanelData, Plan, Priority } from "@/lib/studio/types";
import { addDays, fmtDay } from "@/lib/studio/values";

/** The format the bars were written in, read from their own words ("73%", "₹5 Cr", "60 d"). */
function barFormat(bars: BriefItem["bars"]): { format: PanelData["format"]; unit: string | null } {
  if (bars.every((b) => /%$/.test(b.fmt.trim()))) return { format: "pct", unit: null };
  if (bars.some((b) => /₹|\bRs\b/.test(b.fmt))) return { format: "money", unit: null };
  const unit = bars.map((b) => b.fmt.trim().match(/^[+−-]?[\d,.]+\s+([A-Za-z]{1,8})$/)?.[1] ?? null);
  const u = unit[0] && unit.every((x) => x === unit[0]) ? unit[0] : null;
  return { format: bars.every((b) => Number.isInteger(b.value)) ? "int" : "dec", unit: u };
}

const stubPlan = (id: string, title: string, chart: Plan["chart"]): Plan =>
  ({ id, title, chart, agg: "count", col: null, by: "col", byCol: null, unit: null, filters: [], sort: "desc", limit: 10 });

function bareP(id: string, title: string, chart: PanelData["chart"], labels: string[], values: number[], format: PanelData["format"], unit: string | null, plan: Plan | null): PanelData {
  return {
    id, plan: plan ?? stubPlan(id, title, chart), title, subtitle: "", chart, labels, values, keys: labels, geo: null, points: [], total: values.reduce((a, b) => a + b, 0),
    rows: values.length, format, unit, kpi: null, table: null, note: null, zero: true
  };
}

/** A finding drawn as a chart: its evidence bars, or its weekly series, or the panel its plan computes. */
export function findingPanel(x: BriefItem, panels: PanelData[], to: string | null): PanelData | null {
  if (x.bars.length >= 2) {
    const { format, unit } = barFormat(x.bars);
    const p = bareP(`f_${x.id}`, x.headline, "hbar", x.bars.map((b) => b.label), x.bars.map((b) => b.value), format, unit, x.plan);
    return { ...p, fmts: x.bars.map((b) => b.fmt), hi: x.bars.findIndex((b) => b.hi) };
  }
  if (x.series.length > 2) {
    const n = x.series.length;
    const labels = x.series.map((_, i) => (to ? fmtDay(addDays(to, -7 * (n - 1 - i)), false) : `Week ${i + 1}`));
    return bareP(`f_${x.id}`, x.headline, "area", labels, x.series, "int", null, x.plan);
  }
  // a finding about a whole chart (a ranking by zone): that chart, when the dashboard already computes it
  if (x.plan) {
    const same = panels.find((p) => p.plan.by === x.plan!.by && p.plan.byCol === x.plan!.byCol && p.chart !== "kpi" && p.chart !== "table" && p.values.length > 1);
    if (same) return same;
  }
  return null;
}

/** The dataset's charts with something in them (headline numbers are not charts). */
export const drawable = (panels: PanelData[]): PanelData[] =>
  panels.filter((p) => p.chart !== "kpi" && (p.values.length > 0 || (p.table?.rows.length ?? 0) > 0));

/** The strongest findings first: those to act on, then to watch, then the rest (the brief's own order within each). */
export function strongest(items: BriefItem[], max: number): BriefItem[] {
  const order: Record<Priority, number> = { act: 0, watch: 1, note: 2 };
  return [...items].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, max);
}

/** Which of the dataset's own charts come first on a dashboard: the map, then the trend, a bare table last. */
export const chartRank = (p: PanelData): number => (p.chart === "map" ? 0 : p.plan.by === "time" ? 1 : p.chart === "table" ? 9 : 2);
