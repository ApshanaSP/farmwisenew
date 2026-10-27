/**
 * The Chart Doctor's linter: every panel the Studio draws (a dashboard panel, an Analyst answer, a pinned chart, a
 * drill breakdown) passes here before it is shown. Hard rules are fixed or the panel falls back to a table; soft rules
 * polish. Each panel leaves with a one-line "why this chart", an alt text, and the list of what was fixed.
 *
 * Hard rules (Cleveland-McGill, Draco's hard constraints, design.canada.ca's chart guidance):
 *   H1  a chart has data to draw (else a table that says so)
 *   H2  bars and areas start at 0
 *   H3  a donut has at most 5 parts, no negative part, and parts that make a whole (a count or a sum)
 *   H4  no line over categories that have no order
 *   H5  time runs left to right
 *   H6  no dual axis, no 3D (only the Studio's own chart kinds)
 *   H7  no chart of a constant, or of a single category
 *   H8  a percentage says its base; a % change needs a base of 20 or more
 *   H9  the title names the measure; the subtitle says the window and scope
 *   H10 no label cut mid-word
 *   H11 at most 12 bars (else the top 10 and "Others"), so labels stay readable at 390 px and in Tamil
 *   H12 a map has 5+ places and 20%+ of rows placed (else bars by place)
 *   H13 a trend has 3+ periods (two periods: a before-and-after pair)
 * Soft rules: bars sorted (an ordered category keeps its order), direct labels when there are few values.
 */
import type { DRow } from "@/lib/studio/clean";
import { runPlan, type Names } from "@/lib/studio/engine";
import { GUARD } from "@/lib/studio/readiness";
import type { ChartKind, PanelData, Plan, Spec } from "@/lib/studio/types";
import { fmtNum } from "@/lib/studio/types";
import { fmtDay } from "@/lib/studio/values";

export interface LintIssue { rule: string; hard: boolean; fixed: string }
export interface LintCtx { placedShare?: number; window?: { from: string | null; to: string | null } | null }

const KINDS: ChartKind[] = ["kpi", "bar", "hbar", "line", "area", "donut", "treemap", "map", "table"];
const ORDINAL = /^(very low|low|medium|moderate|high|very high|critical|minor|major|severe|poor|fair|good|excellent|none|mild|q[1-4]|[0-9]+\s*[-–]\s*[0-9]+|<|>|under|over|below|above)\b/i;

/** A label shortened at a word, never in the middle of one. */
export function wordCut(s: string, max = 40): string {
  if (s.length <= max) return s;
  // the last word is kept when it ends at the limit, dropped when the limit falls inside it
  const cut = /\s/.test(s[max]) ? s.slice(0, max) : s.slice(0, max).replace(/\s+\S*$/, "");
  return `${(cut.length >= max * 0.5 ? cut : s.slice(0, max)).replace(/[\s,;:·-]+$/, "")}…`;
}

/** A panel as a two-column table of its own labels and values (the fallback that never misleads). */
function asTable(p: PanelData, why: string): PanelData {
  const label = p.plan.by === "time" ? "Period" : p.plan.by === "zone" ? "Zone" : p.plan.by === "ward" ? "Ward" : "Item";
  return { ...p, chart: "table", table: p.table ?? { cols: [{ key: "l", label }, { key: "v", label: "Value" }], rows: p.labels.map((l, i) => ({ l, v: p.values[i] })) }, why };
}

const isTimeOrdered = (keys: (string | number)[]) => keys.every((k, i) => i === 0 || String(keys[i - 1]) <= String(k));

/** The panel, checked and fixed by the rules above. */
export function lint(panel: PanelData, ctx: LintCtx = {}): PanelData {
  let p: PanelData = { ...panel, labels: [...panel.labels], values: [...panel.values], keys: [...panel.keys] };
  const issues: LintIssue[] = [];
  const fix = (rule: string, fixed: string, hard = true) => issues.push({ rule, hard, fixed });
  const measure = p.subtitle.split(" · ")[0] || "values";
  const n = p.values.length;
  let why = "";

  // H6: only the Studio's own kinds (no dual axes, no 3D)
  if (!KINDS.includes(p.chart)) { p = asTable(p, ""); fix("H6", "an unknown chart kind became a table"); }

  // H8: a % change on a small base is not shown
  if (p.kpi && p.kpi.delta != null) {
    const prev = p.kpi.spark.length >= 2 ? p.kpi.spark[p.kpi.spark.length - 2] : 0;
    if (prev < GUARD.minPctBase) { p = { ...p, kpi: { ...p.kpi, delta: null } }; fix("H8", `the % change was dropped: its base (${fmtNum(prev)}) is under ${GUARD.minPctBase}`); }
  }
  if (p.chart === "kpi" || p.chart === "table") {
    why = p.chart === "kpi" ? "A single number: a headline card." : "Rows to read: a table.";
  } else {
    // H1: something to draw
    if (!n || p.values.every((v) => !v)) { p = asTable(p, "Nothing to draw: shown as a table."); fix("H1", "no values: a table instead of an empty chart"); }
    // H12: a map needs places
    else if (p.chart === "map" && (n < GUARD.minMapPlaces || (ctx.placedShare != null && ctx.placedShare < GUARD.minMapPlacedShare))) {
      p = { ...p, chart: "hbar" };
      fix("H12", `${n} places${ctx.placedShare != null ? `, ${Math.round(ctx.placedShare * 100)}% of rows placed` : ""}: bars by place instead of a map`);
    }
    // H13: a trend needs 3 periods
    if (p.plan.by === "time" && p.chart !== "table") {
      if (!isTimeOrdered(p.keys)) {
        // H5: time left to right
        const order = p.keys.map((k, i) => i).sort((a, b) => String(p.keys[a]).localeCompare(String(p.keys[b])));
        p = { ...p, labels: order.map((i) => p.labels[i]), values: order.map((i) => p.values[i]), keys: order.map((i) => p.keys[i]) };
        fix("H5", "periods put in time order, left to right");
      }
      if (p.values.length < 2) { p = asTable(p, "One period only: no trend to draw."); fix("H13", "one period: a table, not a trend"); }
      else if (p.values.length < GUARD.minTrendPeriods) {
        p = { ...p, chart: "bar", note: p.note ?? `${p.labels[0]} → ${p.labels[1]}: ${p.values[1] - p.values[0] >= 0 ? "+" : ""}${fmtNum(p.values[1] - p.values[0], p.format)}` };
        fix("H13", "two periods: a before-and-after pair, not a trend line");
      }
    }
    // H4: a line needs ordered categories
    if ((p.chart === "line" || p.chart === "area") && p.plan.by !== "time") { p = { ...p, chart: "hbar" }; fix("H4", "a line over unordered categories became bars"); }
    // H3: donuts
    if (p.chart === "donut" || p.chart === "treemap") {
      const whole = p.plan.agg === "count" || p.plan.agg === "sum";
      if (p.values.some((v) => v < 0) || !whole || p.values.length > GUARD.maxDonutParts) {
        p = { ...p, chart: "hbar" };
        fix("H3", !whole ? "an average does not make a whole: bars instead of a donut" : p.values.some((v) => v < 0) ? "negative parts: bars instead of a donut" : `${n} parts: bars instead of a donut (at most ${GUARD.maxDonutParts})`);
      }
    }
    // H7: a constant or a single category
    if (p.chart !== "table" && p.chart !== "map") {
      const distinct = new Set(p.values).size;
      if (p.values.length === 1 || (p.values.length > 1 && distinct === 1 && p.plan.by !== "time")) {
        p = asTable(p, p.values.length === 1 ? "A single category: shown as a table." : "Every value is the same: shown as a table.");
        fix("H7", "a chart of one value or a constant became a table");
      }
    }
    // H11: at most 12 bars (top 10 and Others for a count or a sum)
    if ((p.chart === "hbar" || p.chart === "bar") && p.plan.by !== "time" && p.values.length > GUARD.maxBars) {
      const idx = p.values.map((v, i) => i).sort((a, b) => p.values[b] - p.values[a]);
      const top = idx.slice(0, 10), rest = idx.slice(10);
      const add = p.plan.agg === "count" || p.plan.agg === "sum";
      p = { ...p, labels: [...top.map((i) => p.labels[i]), ...(add ? [`Others (${rest.length})`] : [])], values: [...top.map((i) => p.values[i]), ...(add ? [rest.reduce((s, i) => s + p.values[i], 0)] : [])],
        keys: [...top.map((i) => p.keys[i]), ...(add ? ["Others"] : [])] };
      fix("H11", `${idx.length} bars: the top 10${add ? " and Others" : ""}`);
    }
    // soft: bars sorted, unless the categories have an order of their own
    if ((p.chart === "hbar" || p.chart === "bar") && p.plan.by !== "time" && p.plan.sort !== "key") {
      const ordinal = p.labels.filter((l) => ORDINAL.test(l)).length >= Math.max(2, p.labels.length * 0.6);
      const others = p.keys[p.keys.length - 1] === "Others";
      const body = others ? p.values.length - 1 : p.values.length;
      const sorted = p.values.slice(0, body).every((v, i, a) => i === 0 || a[i - 1] >= v);
      if (!ordinal && !sorted) {
        const idx = p.values.slice(0, body).map((v, i) => i).sort((a, b) => p.values[b] - p.values[a]);
        const tail = others ? [body] : [];
        p = { ...p, labels: [...idx, ...tail].map((i) => p.labels[i]), values: [...idx, ...tail].map((i) => p.values[i]), keys: [...idx, ...tail].map((i) => p.keys[i]) };
        fix("S1", "bars sorted largest first", false);
      }
    }
    // H10: labels cut at a word
    const cut = p.labels.map((l) => wordCut(l));
    if (cut.some((l, i) => l !== p.labels[i])) { p = { ...p, labels: cut }; fix("H10", "long labels shortened at a word"); }
    // H2: bars and areas from zero
    if (p.chart === "bar" || p.chart === "hbar" || p.chart === "area") p = { ...p, zero: true };
    why = why || whyChart(p);
  }
  // H8: a percentage says its base
  if (p.format === "pct" && !/\bof\b|base/i.test(p.subtitle)) { p = { ...p, subtitle: `${p.subtitle} · of ${fmtNum(p.rows)} ${p.rows === 1 ? "row" : "rows"}` }; fix("H8", "the percentage's base added"); }
  // H9: the window in the subtitle
  const w = ctx.window;
  if (w?.from && w.to && p.plan.by !== "time" && !/\b(19|20)\d{2}\b|days?\b|week|month/i.test(`${p.title} ${p.subtitle}`)) {
    p = { ...p, subtitle: `${p.subtitle} · ${w.from === w.to ? fmtDay(w.to) : `${fmtDay(w.from, false)} – ${fmtDay(w.to)}`}` };
  }
  if (!p.title.trim()) { p = { ...p, title: measure.charAt(0).toUpperCase() + measure.slice(1) }; fix("H9", "a title naming the measure"); }
  return { ...p, why: p.why ?? why, alt: altText(p), lint: issues.map((i) => `${i.rule}: ${i.fixed}`) };
}

/** One line on why this chart. */
function whyChart(p: PanelData): string {
  switch (p.chart) {
    case "map": return "Places: a map, so where it is shows at a glance.";
    case "line": case "area": return `${p.values.length} periods in order: a line, read left to right.`;
    case "donut": case "treemap": return `${p.values.length} parts of one whole: a donut.`;
    case "bar": return p.plan.by === "time" ? "Two periods: before and after, side by side." : "A comparison of a few categories: bars from zero.";
    default: return "A comparison of categories: sorted bars from zero, the longest first.";
  }
}

/** Alt text: what it shows, the top value, the trend. */
export function altText(p: PanelData): string {
  const f = (v: number) => fmtNum(v, p.format, p.unit);
  if (p.kpi) return `${p.title}: ${f(p.kpi.value)}.`;
  if (p.chart === "table") return `${p.title}: a table of ${p.table?.rows.length ?? p.labels.length} rows.`;
  if (!p.values.length) return `${p.title}: no values.`;
  if (p.plan.by === "time") {
    const a = p.values[0], b = p.values[p.values.length - 1];
    return `${p.title}: ${p.values.length} periods from ${p.labels[0]} to ${p.labels[p.labels.length - 1]}; ${f(a)} then ${f(b)}, ${b > a ? "up" : b < a ? "down" : "level"}.`;
  }
  const i = p.values.indexOf(Math.max(...p.values));
  return `${p.title}: ${p.values.length} ${p.chart === "map" ? "places" : "bars"}; the highest is ${p.labels[i]} with ${f(p.values[i])}.`;
}

/**
 * A plan computed and checked: what every drawn panel goes through (pipeline view, Analyst answers, the board, drill
 * breakdowns). runPlan alone is for numbers that are not drawn.
 */
export function renderPanel(rows: DRow[], spec: Spec, plan: Plan, names: Names, window?: { from: string | null; to: string | null } | null): PanelData {
  const n = rows.length || 1;
  const placedShare = plan.chart === "map" ? rows.filter((r) => r._z != null || typeof r._la === "number").length / n : undefined;
  return lint(runPlan(rows, spec, plan, names), { placedShare, window: window ?? null });
}

/** The hard rules a drawn panel breaks (no fixing): what the tests hold every panel of every dataset to. */
export function violations(p: PanelData, ctx: LintCtx = {}): string[] {
  const v: string[] = [];
  if (!KINDS.includes(p.chart)) v.push("H6");
  if (p.chart === "kpi" || p.chart === "table") {
    if (p.kpi?.delta != null && (p.kpi.spark[p.kpi.spark.length - 2] ?? 0) < GUARD.minPctBase) v.push("H8");
    return v;
  }
  if (!p.values.length || p.values.every((x) => !x)) v.push("H1");
  if ((p.chart === "bar" || p.chart === "hbar" || p.chart === "area") && !p.zero) v.push("H2");
  if ((p.chart === "donut" || p.chart === "treemap") && (p.values.length > GUARD.maxDonutParts || p.values.some((x) => x < 0) || !(p.plan.agg === "count" || p.plan.agg === "sum"))) v.push("H3");
  if ((p.chart === "line" || p.chart === "area") && p.plan.by !== "time") v.push("H4");
  if (p.plan.by === "time" && !isTimeOrdered(p.keys)) v.push("H5");
  if (p.chart !== "map" && (p.values.length === 1 || (p.values.length > 1 && new Set(p.values).size === 1 && p.plan.by !== "time"))) v.push("H7");
  if (p.format === "pct" && !/\bof\b|base/i.test(p.subtitle)) v.push("H8");
  if (!p.title.trim()) v.push("H9");
  if (p.labels.some((l) => l.length > 41)) v.push("H10");
  if ((p.chart === "hbar" || p.chart === "bar") && p.plan.by !== "time" && p.values.length > GUARD.maxBars) v.push("H11");
  if (p.chart === "map" && (p.values.length < GUARD.minMapPlaces || (ctx.placedShare != null && ctx.placedShare < GUARD.minMapPlacedShare))) v.push("H12");
  if (p.plan.by === "time" && (p.chart === "line" || p.chart === "area") && p.values.length < GUARD.minTrendPeriods) v.push("H13");
  return v;
}
