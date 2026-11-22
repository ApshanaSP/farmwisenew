/**
 * The simple dashboard a dataset becomes when the Collector presses "Add to dashboard": one headline, up to four
 * headline numbers, and a handful of charts (never more than six), each with what it shows in one sentence and what it
 * is good for. The charts are the brief's strongest findings drawn as charts, then the dataset's own evidence charts
 * (the map, the trend) that the findings do not already cover. Every value is computed from the rows (pipeline.view);
 * nothing here asks a model. A dataset with no finding and no chart says so ("No insights available").
 */
import { view } from "@/lib/studio/pipeline";
import { getDashboards, getMeta } from "@/lib/studio/store";
import { tookOf, type Took } from "@/lib/studio/took";
import { HELPS, describePanel, helpsOf } from "@/lib/studio/helps";
import type { BriefItem, PanelData, Plan, Priority, Tone } from "@/lib/studio/types";
import { addDays, fmtDay } from "@/lib/studio/values";

export interface DashCard {
  id: string;
  title: string;
  /** the kind of finding ("Hotspot", "Trend", "Where") */
  label: string;
  tone: Tone;
  priority: Priority | null;
  /** the chart; null for a finding with nothing to draw (its number is shown large instead) */
  panel: PanelData | null;
  metric: { value: string; caption: string } | null;
  /** what the chart shows, in one sentence with its numbers */
  insight: string;
  /** what the chart is good for */
  helps: string;
}

export interface SimpleDash {
  id: string;
  name: string;
  headline: string;
  summary: string[];
  department: string | null;
  sample: boolean;
  addedAt: string | null;
  updatedAt: string;
  took: Took;
  kpis: PanelData[];
  cards: DashCard[];
  /** "ai" when the headline and findings were written by the AI over the computed numbers */
  by: "ai" | "rules";
}

const MAX_CARDS = 6;
const MAX_FINDINGS = 3;

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
function findingPanel(x: BriefItem, panels: PanelData[], to: string | null): PanelData | null {
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

const CHART_LABEL = (p: PanelData) => p.chart === "map" ? "Where" : p.plan.by === "time" ? "Over time" : p.chart === "donut" || p.chart === "treemap" ? "Split" : "Ranking";

/** The simple dashboard of one dataset, or null when the dataset is gone. */
export async function simpleDash(id: string, addedAt: string | null = null): Promise<SimpleDash | null> {
  const v = await view(id, []);
  if (!v) return null;
  const m = v.meta;
  const kpis = v.panels.filter((p) => p.chart === "kpi" && p.kpi).slice(0, 4);
  const charts = v.panels.filter((p) => p.chart !== "kpi" && (p.values.length > 0 || (p.table?.rows.length ?? 0) > 0));
  const cards: DashCard[] = [];
  const usedPanels = new Set<string>();
  // the strongest findings first: those to act on, then to watch; a finding with nothing to draw keeps its number
  const order: Record<Priority, number> = { act: 0, watch: 1, note: 2 };
  const items = [...v.brief.items].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, MAX_FINDINGS);
  for (const x of items) {
    const panel = findingPanel(x, charts, m.window.to);
    if (panel && charts.includes(panel)) usedPanels.add(panel.id);
    cards.push({ id: `f_${x.id}`, title: x.headline, label: x.label, tone: x.tone, priority: x.priority, panel, metric: x.metric,
      insight: x.text, helps: HELPS[x.label] ?? "Shows what needs attention" });
  }
  // then the dataset's own charts the findings did not cover: the map and the trend first, a bare table last
  const rank = (p: PanelData) => (p.chart === "map" ? 0 : p.plan.by === "time" ? 1 : p.chart === "table" ? 9 : 2);
  const rest = charts.filter((p) => !usedPanels.has(p.id)).sort((a, b) => rank(a) - rank(b));
  for (const p of rest) {
    if (cards.length >= MAX_CARDS) break;
    if (p.chart === "table" && cards.some((c) => c.panel)) continue;
    cards.push({ id: `p_${p.id}`, title: p.title, label: CHART_LABEL(p), tone: "info", priority: null, panel: p, metric: null, insight: describePanel(p), helps: helpsOf(p) });
  }
  return {
    id: m.id, name: m.name, headline: v.brief.items.length || charts.length ? v.brief.verdict : "No insights available", summary: v.brief.summary.slice(0, 3),
    department: m.spec.deptName, sample: m.sample, addedAt, updatedAt: m.updatedAt, took: tookOf(m), kpis, cards, by: v.brief.by
  };
}

/** Every dashboard the Collector added, newest first (a dataset deleted since is left out). */
export async function allDashboards(): Promise<SimpleDash[]> {
  const out: SimpleDash[] = [];
  for (const e of getDashboards()) {
    if (!getMeta(e.datasetId)) continue;
    try {
      const d = await simpleDash(e.datasetId, e.at);
      if (d) out.push(d);
    } catch (err) {
      console.warn("[studio] dashboard could not be built", e.datasetId, (err as Error).message);
    }
  }
  return out;
}
