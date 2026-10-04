"use client";

/**
 * Draws a checked chart spec with ECharts (only the parts used are bundled, and this
 * component loads only when an answer has a chart). The key mark is in the console's accent
 * and the rest muted on the same blue ramp; "compared to what" marks (previous period, the
 * usual range, a threshold) are drawn quietly; values are labelled at bar tips and at the
 * highlighted point only; every mark has a tooltip; clicking a mark drills into the console.
 * Switching the chart type morphs the marks (universal transition). ARIA is on.
 */
import { memo, useMemo } from "react";
import * as echarts from "echarts/core";
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, ScatterChart, TreemapChart } from "echarts/charts";
import { AriaComponent, DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TitleComponent, TooltipComponent,
  VisualMapComponent } from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { chartView, fmtValue, type ChartView } from "@/lib/assistant/chartspec";
import type { ChartSpec, Dataset } from "@/lib/assistant/answer";
import type { Lang } from "@/lib/assistant/lang";

echarts.use([BarChart, LineChart, PieChart, HeatmapChart, ScatterChart, GaugeChart, TreemapChart, DataZoomComponent, GraphicComponent, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent,
  MarkPointComponent, TitleComponent, VisualMapComponent, AriaComponent, CanvasRenderer, UniversalTransition, LabelLayout]);

/** District IQ chart theme (mirror of tokens.css): blue leads, cyan / violet / amber follow; neutral comparison. */
const SERIES = ["#4C8DFF", "#2BC7D9", "#A28EFA", "#E8B84A"];
const INK = { primary: "#E6ECF7", secondary: "#A8B5CD", muted: "#7383A2", grid: "rgba(138,164,214,.09)", axis: "rgba(138,164,214,.22)" };
const HIGHLIGHT = "#4C8DFF";
/** the rest when one mark is the point: a quiet slate, so the highlighted one reads first ("highlight one, grey the rest") */
const MUTED = "#5A6E95";
const PREV = "#27324A";
/** direction of a change: rose (orange) and fell (aqua), never the reserved severity reds */
const ROSE = "#F0894E";
const FELL = "#2BC7A0";
const TRACK = "rgba(138,164,214,.06)";
const SURFACE = "#0B1426";
const SEVERITY: Record<string, string> = { Severe: "#F2555A", High: "#F7893B", Medium: "#E8B84A", Low: "#4DB3E8" };
const FONT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export interface ChartProps {
  spec: ChartSpec;
  ds: Dataset;
  lang: Lang;
  height: number;
  onDrill?: (key: string | number | null) => void;
  onReady?: (chart: echarts.ECharts) => void;
}

// earlier answers in the thread do not redraw when a new one arrives
export default memo(ChartRenderer);

function ChartRenderer({ spec, ds, lang, height, onDrill, onReady }: ChartProps) {
  const view = useMemo(() => chartView(spec, ds, lang), [spec, ds, lang]);
  const option = useMemo(() => buildOption(view), [view]);
  return (
    <ReactEChartsCore echarts={echarts} option={option} replaceMerge={["series", "xAxis", "yAxis", "visualMap", "legend"]} lazyUpdate
      style={{ height, width: "100%" }} opts={{ renderer: "canvas" }} onChartReady={onReady}
      onEvents={{ click: (p: { dataIndex?: number; name?: string }) => onDrill?.(p.dataIndex != null ? view.keys[p.dataIndex] ?? p.name ?? null : p.name ?? null) }} />
  );
}

const fmt = (s: ChartView["series"][number] | undefined) => (v: number | null) => fmtValue(v, s?.format ?? "integer", s?.unit ?? null);

function buildOption(view: ChartView): echarts.EChartsCoreOption {
  // "Reported" and "Reported, the period before" drawn as two series would give the old period a palette colour of its
  // own; it is the same measure earlier, so it becomes the grey comparison mark beside its series
  const folded = view.series.filter((s) => !s.key.endsWith("_prev"))
    .map((s) => ({ ...s, prev: s.prev ?? view.series.find((p) => p.key === `${s.key}_prev`)?.values ?? null }));
  const v: ChartView = folded.length && folded.length < view.series.length ? { ...view, series: folded } : view;
  const common = {
    // quick: the answer should feel instant, and a long list must not trickle in bar by bar
    animationDuration: 420, animationDurationUpdate: 320, animationEasing: "cubicOut" as const, animationEasingUpdate: "cubicInOut" as const,
    animationDelay: (i: number) => Math.min(i * 12, 120),
    textStyle: { fontFamily: FONT, color: INK.secondary },
    aria: { enabled: true, label: { description: describe(v) } },
    tooltip: { trigger: "item", confine: true, backgroundColor: "#0F192E", borderColor: "rgba(138,164,214,.28)", borderWidth: 1, padding: [9, 12],
      textStyle: { color: "#E6ECF7", fontSize: 12.5, fontFamily: FONT },
      extraCssText: "border-radius:8px;box-shadow:0 18px 40px -14px rgba(0,0,0,.8);line-height:1.5;font-variant-numeric:tabular-nums" }
  };
  const s0 = v.series[0];
  const sev = (name: string) => SEVERITY[name];

  if (v.type === "heatmap" && v.heat) {
    const h = v.heat;
    return {
      ...common,
      grid: { left: 8, right: 16, top: 8, bottom: 44, containLabel: true },
      xAxis: { type: "category", data: h.xs, axisLabel: { color: INK.muted, fontSize: 11 }, axisLine: { lineStyle: { color: INK.axis } }, axisTick: { show: false } },
      yAxis: { type: "category", data: h.ys, inverse: true, axisLabel: { color: INK.secondary, fontSize: 11.5, width: 150, overflow: "truncate" }, axisLine: { show: false },
        axisTick: { show: false } },
      visualMap: { min: 0, max: Math.max(1, h.max), calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 120, itemWidth: 10,
        inRange: { color: ["#0F1D36", "#1E3D73", "#2F6FE6", "#8DB6FF"] }, textStyle: { color: INK.muted, fontSize: 11 } },
      series: [{ id: "s0", type: "heatmap", data: h.cells, label: { show: h.cells.length <= 120, color: INK.primary, fontSize: 10.5 },
        itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: INK.primary, borderWidth: 1 } },
        universalTransition: { enabled: true } }],
      tooltip: { ...common.tooltip, formatter: (p: { value: [number, number, number] }) => `${h.ys[p.value[1]]}<br>${h.xs[p.value[0]]}: <b>${fmtValue(p.value[2])}</b>` }
    };
  }

  if (v.type === "rose") return rose(v, common);
  if (v.type === "treemap") return treemap(v, common);
  if (v.type === "gauge") return gauge(v, common);

  if (v.type === "donut") {
    const total = s0.values.reduce<number>((a, x) => a + (x ?? 0), 0);
    return {
      ...common,
      legend: { bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { color: INK.secondary, fontSize: 12 } },
      graphic: [{ type: "group", left: "center", top: "37%", children: [
        { type: "text", style: { text: fmt(s0)(total), fontSize: 22, fontWeight: 700, fill: INK.primary, fontFamily: FONT, textAlign: "center" }, left: "center" },
        { type: "text", top: 28, style: { text: "total", fontSize: 11.5, fill: INK.muted, fontFamily: FONT, textAlign: "center" }, left: "center" }] }],
      series: [{
        id: "s0", type: "pie", radius: ["50%", "74%"], center: ["50%", "45%"], padAngle: 1.2, animationType: "scale", animationEasing: "elasticOut",
        emphasis: { scale: true, scaleSize: 8, itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,0,0,.5)" } }, itemStyle: { borderRadius: 4, borderColor: SURFACE, borderWidth: 2 },
        label: { color: INK.secondary, fontSize: 12, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}\n{b|${fmt(s0)(p.value)}} · ${p.percent.toFixed(0)}%`,
          rich: { b: { fontWeight: 700, color: INK.primary } } },
        labelLine: { length: 8, length2: 8, lineStyle: { color: INK.axis } },
        data: v.categories.map((name, i) => ({
          name, value: s0.values[i] ?? 0,
          itemStyle: { color: sev(name) ?? (v.highlight.includes(i) ? HIGHLIGHT : [MUTED, "#2BC7D9", "#A28EFA", "#E8B84A", "#35C28C", "#6F86B0"][i % 6]) },
          selected: v.highlight.includes(i)
        })),
        selectedOffset: 6, universalTransition: { enabled: true }
      }],
      tooltip: { ...common.tooltip, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br><b>${fmt(s0)(p.value)}</b> · ${p.percent.toFixed(1)}% of ${fmt(s0)(total)}` }
    };
  }

  if (v.type === "small_multiples") return smallMultiples(v, common);
  if (v.type === "dumbbell") return dumbbell(v, common);

  const horizontal = v.type === "horizontal_bar";
  const isLine = v.type === "line" || v.type === "area";
  const multi = v.series.length > 1;
  const catAxis = {
    type: "category" as const, data: v.categories, inverse: horizontal, boundaryGap: !isLine,
    axisLine: { lineStyle: { color: INK.axis } }, axisTick: { show: false },
    axisLabel: { color: INK.secondary, fontSize: 11.5, width: horizontal ? 150 : undefined, overflow: horizontal ? "truncate" : undefined, hideOverlap: true,
      formatter: (x: string) => x }
  };
  const valAxis = {
    type: "value" as const, splitLine: { lineStyle: { color: INK.grid, width: 1 } }, axisLabel: { color: INK.muted, fontSize: 11, formatter: (x: number) => fmt(s0)(x) },
    axisLine: { show: false }, axisTick: { show: false }
  };

  const series: Record<string, unknown>[] = [];
  v.series.forEach((s, k) => {
    const color = multi ? SERIES[k % SERIES.length] : HIGHLIGHT;
    const base = { id: `s${k}`, name: s.name, universalTransition: { enabled: true } };
    if (isLine) {
      const hi = v.highlight[0];
      series.push({
        ...base, type: "line", data: s.values, smooth: 0.2, showSymbol: v.categories.length <= 31, symbol: "circle", symbolSize: 7,
        lineStyle: { width: 2, color }, itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
        // a flat wash under one line (no gradient); the line draws itself in on arrival
        areaStyle: v.type === "area" || (!multi && !v.band) ? { color, opacity: 0.1 } : undefined,
        animationDuration: 900, animationEasing: "cubicOut",
        emphasis: { focus: "series", scale: 1.6 },
        // the last value said at the end of the line, so the reader needs no axis lookup
        endLabel: { show: true, formatter: multi ? "{a}" : (p: { value: number | null }) => fmt(s)(p.value), color: multi ? INK.secondary : INK.primary,
          fontSize: 11.5, fontWeight: multi ? 400 : 600, distance: 6 },
        markArea: k === 0 && v.band ? { silent: true, itemStyle: { color: "rgba(18,146,95,.08)" },
          label: { show: true, position: "insideTopLeft", color: "#35C28C", fontSize: 10.5, formatter: "Usual range" },
          data: [[{ yAxis: v.band.lo }, { yAxis: v.band.hi }]] } : undefined,
        markLine: k === 0 && v.threshold ? thresholdLine(v, false) : undefined,
        markPoint: k === 0 && hi != null && s.values[hi] != null ? { symbol: "circle", symbolSize: 10, itemStyle: { color: "#8DB6FF", borderColor: SURFACE, borderWidth: 2 },
          label: { show: v.callouts.length > 0, position: "top", distance: 8, color: INK.primary, fontWeight: 700, fontSize: 12, formatter: () => fmt(s)(s.values[hi]) },
          data: [{ coord: [hi, s.values[hi]] }] } : undefined
      });
      return;
    }
    const stacked = v.type === "stacked_bar";
    series.push({
      ...base, type: "bar", stack: stacked ? "all" : undefined, barMaxWidth: 24, barGap: "20%",
      // flat fills; when one bar is the point it takes the accent and the rest go quiet, its label in strong ink
      data: s.values.map((val, i) => {
        const on = v.highlight.length === 0 || v.highlight.includes(i);
        return {
          value: val,
          itemStyle: { color: multi ? color : sev(v.categories[i]) ?? (on ? HIGHLIGHT : MUTED), borderRadius: stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
          label: v.highlight.includes(i) ? { color: INK.primary, fontWeight: 700 } : undefined
        };
      }),
      itemStyle: stacked ? { borderColor: SURFACE, borderWidth: 2 } : undefined,
      label: { show: !stacked && v.categories.length <= 16, position: horizontal ? "right" : "top", distance: 6, color: INK.muted, fontSize: 11.5,
        formatter: (p: { value: number | null; dataIndex: number }) => (p.value == null ? "" : fmt(s)(p.value)),
        rich: {} },
      // bars grow in one after another, quickly
      animationDuration: 650, animationDelay: (i: number) => Math.min(i * 45, 400), animationEasing: "cubicOut",
      emphasis: { focus: "series", itemStyle: { color: multi ? color : "#6FA3FF" } },
      cursor: "pointer",
      showBackground: !stacked && !multi, backgroundStyle: { color: TRACK, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      markLine: k === 0 && v.threshold ? thresholdLine(v, horizontal) : undefined
    });
    if (s.prev) {
      series.push({ id: `p${k}`, name: `${s.name} (previous)`, type: "bar", barMaxWidth: 24, z: 1, data: s.prev,
        itemStyle: { color: PREV, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }, label: { show: false }, universalTransition: { enabled: true } });
    }
  });

  const hasLegend = multi || v.series.some((s) => s.prev);
  return {
    ...common,
    grid: { left: 8, right: horizontal ? 56 : 18, top: hasLegend ? 34 : 14, bottom: 8, containLabel: true },
    legend: hasLegend ? { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: INK.secondary, fontSize: 12 } } : undefined,
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
    // long series: scroll the mouse wheel over the chart or drag the slider to zoom
    dataZoom: isLine && v.categories.length > 31 ? [{ type: "inside", start: 0, end: 100 }, { type: "slider", height: 16, bottom: 0, borderColor: "transparent",
      backgroundColor: "#101B31", fillerColor: "rgba(76,141,255,.18)", handleStyle: { color: HIGHLIGHT }, textStyle: { color: INK.muted, fontSize: 10 } }] : undefined,
    tooltip: { ...common.tooltip, trigger: isLine ? "axis" : "item", axisPointer: isLine ? { type: "line", lineStyle: { color: INK.muted, width: 1 } } : undefined,
      valueFormatter: (x: number | null) => fmt(s0)(x) }
  };
}

function thresholdLine(v: ChartView, horizontal: boolean) {
  const t = v.threshold!;
  return {
    silent: true, symbol: "none", lineStyle: { color: "#F7893B", width: 1.5, type: [5, 4] },
    label: { color: "#F7893B", fontSize: 11, fontWeight: 600, formatter: t.label, position: horizontal ? "end" : "insideEndTop" },
    data: [horizontal ? { xAxis: t.value } : { yAxis: t.value }]
  };
}

/** A sentence for screen readers: what the chart shows and where it peaks. */
function describe(v: ChartView): string {
  const s = v.series[0];
  if (!s) return v.title;
  const i = v.highlight[0];
  const peak = i != null && s.values[i] != null ? ` Highlighted: ${v.categories[i]}, ${fmtValue(s.values[i], s.format, s.unit)}.` : "";
  return `${v.title}. ${v.categories.length} ${v.categories.length === 1 ? "value" : "values"} of ${s.name}.${peak}`;
}

type Common = Record<string, unknown> & { tooltip: Record<string, unknown> };

/** One small line chart per group on a shared scale, instead of a tangle of lines. */
function smallMultiples(v: ChartView, common: Common): echarts.EChartsCoreOption {
  const n = v.series.length;
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const max = Math.max(1, ...v.series.flatMap((s) => s.values.map((x) => x ?? 0)));
  const w = 100 / cols, h = 100 / rows;
  const grid = v.series.map((_, i) => ({ left: `${(i % cols) * w + 3}%`, top: `${Math.floor(i / cols) * h + 9}%`, width: `${w - 6}%`, height: `${h - 20}%`, containLabel: false }));
  return {
    ...common,
    title: v.series.map((s, i) => ({ text: s.name, left: `${(i % cols) * w + 3}%`, top: `${Math.floor(i / cols) * h + 1}%`,
      textStyle: { fontSize: 12, fontWeight: 600, color: INK.primary, fontFamily: FONT } })),
    grid,
    xAxis: v.series.map((_, i) => ({ gridIndex: i, type: "category", data: v.categories, boundaryGap: false, axisTick: { show: false },
      axisLine: { lineStyle: { color: INK.axis } }, axisLabel: { show: Math.floor(i / cols) === rows - 1, color: INK.muted, fontSize: 10, hideOverlap: true } })),
    yAxis: v.series.map((_, i) => ({ gridIndex: i, type: "value", max, splitNumber: 2, splitLine: { lineStyle: { color: INK.grid } },
      axisLabel: { show: i % cols === 0, color: INK.muted, fontSize: 10, formatter: (x: number) => fmtValue(x) } })),
    series: v.series.map((s, i) => ({
      id: `s${i}`, name: s.name, type: "line", xAxisIndex: i, yAxisIndex: i, data: s.values, showSymbol: false, smooth: 0.2,
      lineStyle: { width: 2, color: HIGHLIGHT }, areaStyle: { color: HIGHLIGHT, opacity: 0.08 }, universalTransition: { enabled: true },
      markPoint: { symbol: "circle", symbolSize: 7, itemStyle: { color: "#8DB6FF", borderColor: SURFACE, borderWidth: 2 },
        label: { show: true, position: "top", fontSize: 10.5, color: INK.primary, formatter: (p: { value: number }) => fmtValue(p.value, s.format, s.unit) },
        data: [{ type: "max" }] }
    })),
    tooltip: { ...common.tooltip, trigger: "axis", valueFormatter: (x: number | null) => fmtValue(x, v.series[0]?.format ?? "integer", v.series[0]?.unit ?? null) }
  };
}

/**
 * What changed: the period before (grey dot) to this period (coloured dot) per category, joined by a bar in the direction's
 * colour (orange rose, aqua fell, grey unchanged), with the value and the change said beside it ("88 · +36").
 */
function dumbbell(v: ChartView, common: Common): echarts.EChartsCoreOption {
  const s = v.series[0];
  const prev = s.prev ?? s.values.map(() => null);
  const lo = s.values.map((x, i) => Math.min(x ?? 0, prev[i] ?? x ?? 0));
  const span = s.values.map((x, i) => Math.abs((x ?? 0) - (prev[i] ?? x ?? 0)));
  const dir = s.values.map((x, i) => ((x ?? 0) > (prev[i] ?? x ?? 0) ? 1 : (x ?? 0) < (prev[i] ?? x ?? 0) ? -1 : 0));
  const tone = (i: number) => (dir[i] > 0 ? ROSE : dir[i] < 0 ? FELL : "#7383A2");
  const f = fmt(s);
  const delta = (i: number) => { const a = s.values[i], b = prev[i]; return a == null || b == null ? "" : `${a >= b ? "+" : "−"}${f(Math.abs(a - b))}`; };
  return {
    ...common,
    grid: { left: 8, right: 86, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, icon: "circle", itemWidth: 9, itemHeight: 9, data: ["Period before", "Rose", "Fell"], textStyle: { color: INK.secondary, fontSize: 12 } },
    xAxis: { type: "value", splitLine: { lineStyle: { color: INK.grid } }, axisLabel: { color: INK.muted, fontSize: 11, formatter: (x: number) => f(x) } },
    yAxis: { type: "category", data: v.categories, inverse: true, axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: INK.secondary, fontSize: 11.5, width: 150, overflow: "truncate" } },
    series: [
      { id: "base", type: "bar", stack: "d", data: lo, itemStyle: { color: "transparent" }, silent: true, barWidth: 4, tooltip: { show: false } },
      { id: "span", type: "bar", stack: "d", silent: true, barWidth: 4, tooltip: { show: false }, animationDuration: 700, animationDelay: (i: number) => i * 60,
        data: span.map((x, i) => ({ value: x, itemStyle: { color: tone(i), opacity: 0.55, borderRadius: 2 } })) },
      { id: "prev", name: "Period before", type: "scatter", symbolSize: 10, data: prev.map((x, i) => [x, i]), itemStyle: { color: "#56688C", borderColor: SURFACE, borderWidth: 2 } },
      { id: "s0", name: s.name, type: "scatter", symbolSize: 14, universalTransition: { enabled: true }, cursor: "pointer",
        // a fall ends left of where it started: its label goes on the left, clear of the line back to the grey dot
        data: s.values.map((x, i) => ({ value: [x, i], itemStyle: { color: tone(i), borderColor: SURFACE, borderWidth: 2 },
          label: dir[i] < 0 ? { position: "left" as const } : undefined })),
        label: { show: v.categories.length <= 12, position: "right", distance: 9, fontSize: 11.5,
          formatter: (p: { value: [number | null, number] }) => (p.value[0] == null ? "" : `{v|${f(p.value[0])}}  {${dir[p.value[1]] > 0 ? "up" : dir[p.value[1]] < 0 ? "dn" : "eq"}|${delta(p.value[1])}}`),
          rich: { v: { color: INK.primary, fontWeight: 700, fontSize: 12 }, up: { color: ROSE, fontWeight: 600 }, dn: { color: FELL, fontWeight: 600 }, eq: { color: INK.muted } } } },
      // legend keys for the two directions (no data)
      { name: "Rose", type: "scatter", data: [], itemStyle: { color: ROSE } },
      { name: "Fell", type: "scatter", data: [], itemStyle: { color: FELL } }
    ],
    tooltip: { ...common.tooltip, trigger: "item", formatter: (p: { seriesName: string; value: [number | null, number] }) => {
      const i = p.value[1];
      return `${v.categories[i]}<br>Now: <b>${f(s.values[i])}</b> · before: ${f(prev[i])}${delta(i) ? ` · <b>${delta(i)}</b>` : ""}`;
    } }
  };
}

const RAMP = ["#8DB6FF", "#4C8DFF", "#3A76DC", "#2F63BC", "#28549E", "#21477F", "#1B3A66", "#162F52"];

/** A rose (Nightingale) chart: petals sized by value, for a handful of categories. */
function rose(v: ChartView, common: Common): echarts.EChartsCoreOption {
  const s = v.series[0];
  const order = s.values.map((x, i) => ({ x: x ?? 0, i })).sort((a, b) => b.x - a.x).map((o) => o.i);
  return {
    ...common,
    legend: { bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { color: INK.secondary, fontSize: 12 } },
    series: [{ id: "s0", type: "pie", roseType: "area", radius: ["14%", "72%"], center: ["50%", "46%"], animationType: "scale", animationEasing: "elasticOut",
      itemStyle: { borderRadius: 6, borderColor: SURFACE, borderWidth: 2 },
      label: { color: INK.secondary, fontSize: 11.5, formatter: (p: { name: string; value: number }) => `${p.name}
{b|${fmt(s)(p.value)}}`,
        rich: { b: { fontWeight: 700, color: INK.primary } } },
      emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 14, shadowColor: "rgba(0,0,0,.5)" } },
      data: v.categories.map((name, i) => ({ name, value: s.values[i] ?? 0, itemStyle: { color: SEVERITY[name] ?? RAMP[Math.min(RAMP.length - 1, order.indexOf(i))] } })),
      universalTransition: { enabled: true } }],
    tooltip: { ...common.tooltip, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br><b>${fmt(s)(p.value)}</b> · ${p.percent.toFixed(1)}%` }
  };
}

/** A treemap: each category a tile sized by its share; the largest darkest. */
function treemap(v: ChartView, common: Common): echarts.EChartsCoreOption {
  const s = v.series[0];
  const total = s.values.reduce<number>((a, x) => a + (x ?? 0), 0) || 1;
  const order = s.values.map((x, i) => ({ x: x ?? 0, i })).sort((a, b) => b.x - a.x).map((o) => o.i);
  return {
    ...common,
    series: [{ id: "s0", type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0,
      itemStyle: { borderColor: SURFACE, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
      label: { show: true, color: "#fff", fontSize: 12, fontFamily: FONT, overflow: "truncate",
        formatter: (p: { name: string; value: number }) => `{n|${p.name}}
{v|${fmt(s)(p.value)}} {p|${Math.round((p.value / total) * 100)}%}`,
        rich: { n: { fontSize: 12, color: "#fff", lineHeight: 16 }, v: { fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 20 }, p: { fontSize: 11, color: "rgba(255,255,255,.8)" } } },
      emphasis: { itemStyle: { shadowBlur: 14, shadowColor: "rgba(10,26,60,.3)" } },
      data: v.categories.map((name, i) => ({ name, value: s.values[i] ?? 0, itemStyle: { color: RAMP[Math.min(5, Math.floor((order.indexOf(i) / Math.max(1, order.length)) * 6))] } })),
      universalTransition: { enabled: true } }],
    tooltip: { ...common.tooltip, formatter: (p: { name: string; value: number }) => `${p.name}<br><b>${fmt(s)(p.value)}</b> · ${((p.value / total) * 100).toFixed(1)}% of ${fmt(s)(total)}` }
  };
}

/** One reading on a 0–100 scale: green, amber from 75, red from 90. */
function gauge(v: ChartView, common: Common): echarts.EChartsCoreOption {
  const s = v.series[0];
  const val = s.values[0] ?? 0;
  const color = val >= 90 ? "#F2555A" : val >= 75 ? "#F7893B" : "#35C28C";
  return {
    ...common,
    series: [{ id: "s0", type: "gauge", min: 0, max: 100, startAngle: 210, endAngle: -30, radius: "92%", center: ["50%", "58%"],
      progress: { show: true, width: 16, roundCap: true, itemStyle: { color } },
      axisLine: { lineStyle: { width: 16, color: [[1, "rgba(138,164,214,.12)"]] }, roundCap: true },
      pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { distance: -38, color: INK.muted, fontSize: 10.5, formatter: (x: number) => ([0, 50, 100].includes(x) ? `${x}%` : "") },
      anchor: { show: false }, title: { offsetCenter: [0, "38%"], color: INK.secondary, fontSize: 12.5 },
      detail: { valueAnimation: true, offsetCenter: [0, "2%"], fontSize: 30, fontWeight: 700, color: INK.primary, fontFamily: FONT, formatter: (x: number) => fmt(s)(x) },
      data: [{ value: val, name: v.categories[0] ?? s.name }] }],
    tooltip: { show: false }
  };
}
