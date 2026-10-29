"use client";
/**
 * The Stage's charts, on the console's own ECharts setup (the same core, colour reading and fonts as Data Studio's
 * StudioChart): a ranking's bars, a trend with its usual range shaded and the unusual points marked, a comparison's
 * grouped bars and lines, and plain bars or a donut. One value axis per chart, values labelled on the marks, a tooltip on
 * every mark, the item being spoken highlighted. Colours come from the Stage's tokens (validated with the dataviz
 * skill's checker: categorical slots 1-4 pass CVD and normal-vision separation in both themes).
 */
import { memo, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { currentFont } from "@/components/ui/chartTheme";
import { useInk, type Ink } from "../studio/client";

echarts.use([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkPointComponent, TooltipComponent, CanvasRenderer]);

export type StageChartSpec =
  | { type: "bars"; labels: string[]; values: number[]; keys: string[]; unit: string | null; horizontal: boolean; highlight: string | null }
  | { type: "donut"; labels: string[]; values: number[]; unit: string | null }
  | { type: "trend"; labels: string[]; values: number[]; unit: string; marks: { i: number; why: string }[]; normal: { lo: number; hi: number } | null }
  | { type: "group"; categories: string[]; series: { name: string; values: number[] }[]; unit: string | null }
  | { type: "lines"; labels: string[]; series: { name: string; values: number[] }[]; unit: string | null };

const fmt = (v: number) => (Math.abs(v) >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1));

function option(s: StageChartSpec, ink: Ink, title: string, reduce: boolean): echarts.EChartsCoreOption {
  const font = currentFont();
  const series = ink.viz;
  const tip = { confine: true, backgroundColor: ink.elev, borderColor: ink.line, borderWidth: 1, textStyle: { color: ink.text, fontFamily: font, fontSize: 12.5 },
    extraCssText: "border-radius:10px;box-shadow:0 18px 40px -14px rgba(0,0,0,.55);font-variant-numeric:tabular-nums" };
  const base = { animation: !reduce, animationDuration: 700, animationEasing: "cubicOut" as const, textStyle: { fontFamily: font, color: ink.text2 },
    aria: { enabled: true, label: { description: title } }, tooltip: tip };
  const axisLabel = { color: ink.text2, fontSize: 11.5 };
  const valAxis = { type: "value" as const, min: 0, splitLine: { lineStyle: { color: ink.grid } }, axisLabel: { color: ink.text3, fontSize: 11, formatter: fmt } };
  if (s.type === "donut") {
    return { ...base, tooltip: { ...tip, trigger: "item" },
      legend: { orient: "vertical", right: 0, top: "middle", icon: "circle", textStyle: { color: ink.text2, fontSize: 11.5 } },
      series: [{ type: "pie", radius: ["55%", "80%"], center: ["32%", "50%"], padAngle: 2, itemStyle: { borderRadius: 4, borderColor: ink.surface, borderWidth: 2 }, label: { show: false },
        data: s.labels.map((n, i) => ({ name: n, value: s.values[i], itemStyle: { color: series[i % series.length] } })) }] };
  }
  if (s.type === "bars") {
    const cat = { type: "category" as const, data: s.labels, inverse: s.horizontal, axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } },
      axisLabel: { ...axisLabel, width: s.horizontal ? 130 : undefined, overflow: s.horizontal ? "truncate" as const : undefined, interval: 0, hideOverlap: !s.horizontal } };
    const neg = s.values.some((v) => v < 0);
    return { ...base, tooltip: { ...tip, trigger: "item", valueFormatter: (v: number) => `${fmt(v)}${s.unit ? ` ${s.unit}` : ""}` },
      grid: { left: 4, right: s.horizontal ? 54 : 8, top: s.horizontal ? 4 : 24, bottom: 4, containLabel: true },
      xAxis: s.horizontal ? { ...valAxis, min: neg ? undefined : 0, axisLabel: { show: false } } : cat, yAxis: s.horizontal ? cat : { ...valAxis, min: neg ? undefined : 0 },
      series: [{ type: "bar", barMaxWidth: 18, barMinHeight: 2,
        data: s.values.map((v, i) => {
          const hot = s.highlight != null ? s.keys[i] === s.highlight : i === 0;
          const color = v < 0 ? ink.low : hot ? series[0] : ink.dark ? "rgba(57,135,229,.42)" : "rgba(42,120,214,.38)";
          return { value: v, itemStyle: { color, borderRadius: s.horizontal ? (v < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0]) : [4, 4, 0, 0] } };
        }),
        label: { show: s.values.length <= 16, position: s.horizontal ? "right" : "top", color: ink.text, fontWeight: 600, fontSize: 11.5, formatter: (x: { value: number }) => fmt(x.value) },
        animationDelay: (i: number) => (reduce ? 0 : i * 45) }] };
  }
  if (s.type === "trend") {
    const peak = s.values.reduce((m, v, i) => (v > s.values[m] ? i : m), 0);
    return { ...base, tooltip: { ...tip, trigger: "axis", valueFormatter: (v: number) => `${fmt(v)} ${s.unit}` },
      grid: { left: 4, right: 14, top: 26, bottom: 4, containLabel: true },
      xAxis: { type: "category", data: s.labels, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } }, axisLabel: { ...axisLabel, hideOverlap: true } },
      yAxis: valAxis,
      series: [{ type: "line", data: s.values, smooth: 0.3, symbol: "circle", symbolSize: 6, lineStyle: { width: 2, color: series[0] }, itemStyle: { color: series[0], borderColor: ink.surface, borderWidth: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: ink.dark ? "rgba(57,135,229,.30)" : "rgba(42,120,214,.20)" }, { offset: 1, color: "rgba(57,135,229,0)" }]) },
        markArea: s.normal ? { silent: true, itemStyle: { color: ink.dark ? "rgba(148,163,184,.10)" : "rgba(100,116,139,.10)" }, label: { show: true, position: "insideTopLeft", color: ink.text3, fontSize: 10.5, formatter: "usual range" },
          data: [[{ yAxis: s.normal.lo }, { yAxis: s.normal.hi }]] } : undefined,
        markPoint: { symbol: "circle", symbolSize: 11, itemStyle: { color: ink.sev, borderColor: ink.surface, borderWidth: 2 }, label: { show: false },
          data: [...s.marks.map((m) => ({ coord: [m.i, s.values[m.i]], name: m.why })), ...(s.marks.some((m) => m.i === peak) ? [] : [{ coord: [peak, s.values[peak]], itemStyle: { color: ink.text } }])] } }] };
  }
  if (s.type === "group") {
    return { ...base, tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: ink.text2, fontSize: 11.5 } },
      grid: { left: 4, right: 8, top: 30, bottom: 4, containLabel: true },
      xAxis: { type: "category", data: s.categories, axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } }, axisLabel: { ...axisLabel, interval: 0, width: 80, overflow: "break" } },
      yAxis: valAxis,
      series: s.series.map((x, i) => ({ type: "bar", name: x.name, data: x.values, barMaxWidth: 16, barGap: "12%", itemStyle: { color: series[i % series.length], borderRadius: [4, 4, 0, 0] },
        label: { show: s.categories.length * s.series.length <= 16, position: "top", color: ink.text, fontSize: 11, fontWeight: 600, formatter: (p: { value: number }) => fmt(p.value) } })) };
  }
  return { ...base, tooltip: { ...tip, trigger: "axis" },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: ink.text2, fontSize: 11.5 } },
    grid: { left: 4, right: 12, top: 30, bottom: 4, containLabel: true },
    xAxis: { type: "category", data: s.labels, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } }, axisLabel: { ...axisLabel, hideOverlap: true } },
    yAxis: valAxis,
    series: s.series.map((x, i) => ({ type: "line", name: x.name, data: x.values, smooth: 0.3, symbol: "circle", symbolSize: 5, lineStyle: { width: 2, color: series[i % series.length] },
      itemStyle: { color: series[i % series.length], borderColor: ink.surface, borderWidth: 1.5 }, endLabel: { show: true, color: ink.text2, fontSize: 11, formatter: "{a}" } })) };
}

function StageChart({ spec, height, title, onPick }: { spec: StageChartSpec; height: number; title: string; onPick?: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ink = useInk(box);
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const opt = useMemo(() => (ink ? option(spec, ink, title, reduce) : null), [spec, ink, title, reduce]);
  return (
    <div ref={box} className="st-chart" style={{ height }} role="img" aria-label={title}>
      {opt && <ReactEChartsCore echarts={echarts} option={opt} notMerge lazyUpdate style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }}
        onEvents={onPick ? { click: (p: { dataIndex?: number }) => { if (p.dataIndex != null) onPick(p.dataIndex); } } : undefined} />}
    </div>
  );
}
export default memo(StageChart);
