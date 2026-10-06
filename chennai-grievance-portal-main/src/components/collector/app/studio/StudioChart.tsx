"use client";

/**
 * Charts for the Data Studio, drawn with ECharts from a computed panel (every value is a count or sum of real rows).
 * Colours come from the console's tokens, so light and dark both read well; bars grow in one after another, lines draw
 * themselves, donuts open from the centre; every mark has a tooltip and a click that the page can use to filter.
 */
import { memo, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, TreemapChart } from "echarts/charts";
import { GraphicComponent, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent, AriaComponent } from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { fmtNum, type PanelData } from "@/lib/studio/types";
import { useInk, type Ink } from "./client";

echarts.use([BarChart, LineChart, PieChart, TreemapChart, GraphicComponent, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent, AriaComponent,
  LabelLayout, UniversalTransition, CanvasRenderer]);

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const grad = (a: string, b: string, horizontal = false) =>
  new echarts.graphic.LinearGradient(0, horizontal ? 0 : 1, horizontal ? 1 : 0, 0, [{ offset: 0, color: a }, { offset: 1, color: b }]);
const alpha = (hex: string, a: number) => {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

interface Props { panel: PanelData; height: number | string; compact?: boolean; onPick?: (key: string | number, label: string) => void; highlight?: string | number | null }

function StudioChart({ panel, height, compact = false, onPick, highlight = null }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const ink = useInk(box);
  const option = useMemo(() => (ink ? build(panel, ink, compact, highlight) : null), [panel, ink, compact, highlight]);
  // the latest panel and handler, for the canvas click registered once per chart
  const cur = useRef({ panel, onPick });
  cur.current = { panel, onPick };
  const pickAt = (i: number) => {
    const { panel: pn, onPick: fn } = cur.current;
    const k = pn.keys[i];
    if (fn && k != null && k !== "Others") fn(k, pn.labels[i]);
  };
  const isLine = panel.chart === "line" || panel.chart === "area";
  return (
    <div ref={box} className={`ds-chart${onPick ? " pickable" : ""}`} style={{ height }}>
      {option && (
        <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }}
          // a line is picked anywhere along it: the click's x position gives the point (the dots alone are too small)
          onChartReady={(chart: echarts.ECharts) => {
            if (!isLine) return;
            chart.getZr().on("click", (e: { offsetX: number; offsetY: number }) => {
              if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return;
              const x = chart.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]) as unknown as number[];
              const i = Math.round(x[0]);
              if (i >= 0 && i < cur.current.panel.keys.length) pickAt(i);
            });
          }}
          onEvents={{ click: (p: { dataIndex?: number; name?: string; componentType?: string }) => {
            if (isLine) return;
            // by name first (a treemap counts its root), else by position
            const byName = p.name != null ? cur.current.panel.labels.indexOf(p.name) : -1;
            const i = byName >= 0 ? byName : p.dataIndex ?? -1;
            if (i >= 0) pickAt(i);
          } }} />
      )}
    </div>
  );
}
export default memo(StudioChart);

function build(p: PanelData, ink: Ink, compact: boolean, highlight: string | number | null): echarts.EChartsCoreOption {
  // tooltips say the full value; labels on the marks use the short form (₹5.16 Cr), so they never collide
  const f = (v: number | null) => fmtNum(v, p.format, p.unit);
  const fl = (v: number | null) => fmtNum(v, p.format, p.unit, true);
  const fs = compact ? 10.5 : 11.5;
  const common = {
    animationDuration: 700, animationDurationUpdate: 420, animationEasing: "cubicOut" as const,
    textStyle: { fontFamily: FONT, color: ink.text2 },
    aria: { enabled: true, label: { description: `${p.title}: ${p.labels.slice(0, 5).map((l, i) => `${l} ${f(p.values[i])}`).join(", ")}` } },
    tooltip: {
      confine: true, backgroundColor: ink.elev, borderColor: ink.line, borderWidth: 1, padding: [8, 11],
      textStyle: { color: ink.text, fontSize: 12.5, fontFamily: FONT },
      extraCssText: "border-radius:10px;box-shadow:0 18px 40px -14px rgba(0,0,0,.55);font-variant-numeric:tabular-nums"
    }
  };
  const A = ink.viz[0], B = ink.viz[1];

  if (p.chart === "donut" || p.chart === "treemap") {
    const total = p.values.reduce((a, b) => a + b, 0);
    const colors = [A, B, ink.viz[2], ink.viz[3], ink.viz[4], ink.viz[5], ink.text3, ink.axis];
    if (p.chart === "treemap") {
      return {
        ...common,
        series: [{ type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, top: 0, left: 0, right: 0, bottom: 0,
          itemStyle: { borderColor: ink.surface, borderWidth: 2, gapWidth: 2, borderRadius: 7 },
          label: { show: true, fontFamily: FONT, color: "#fff", fontSize: fs, overflow: "truncate",
            formatter: (x: { name: string; value: number }) => `{n|${x.name}}\n{v|${fl(x.value)}}`, rich: { n: { fontSize: fs, color: "rgba(255,255,255,.9)" }, v: { fontSize: fs + 3, fontWeight: 700, color: "#fff", lineHeight: 20 } } },
          data: p.labels.map((name, i) => ({ name, value: p.values[i], itemStyle: { color: grad(alpha(colors[i % 6], 0.95), alpha(colors[i % 6], 0.7)) } })) }],
        tooltip: { ...common.tooltip, formatter: (x: { name: string; value: number }) => `${x.name}<br><b>${f(x.value)}</b> · ${total ? Math.round((x.value / total) * 100) : 0}%` }
      };
    }
    return {
      ...common,
      legend: compact ? undefined : { orient: "vertical", right: 4, top: "middle", icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 9,
        textStyle: { color: ink.text2, fontSize: fs }, formatter: (name: string) => { const i = p.labels.indexOf(name); return `${name.length > 18 ? name.slice(0, 17) + "…" : name}  ${total ? Math.round((p.values[i] / total) * 100) : 0}%`; } },
      graphic: [{ type: "group", left: compact ? "center" : "27%", top: "middle", bounding: "raw", children: [
        { type: "text", style: { text: fl(total), x: 0, y: -10, fontSize: compact ? 16 : 20, fontWeight: 700, fill: ink.text, fontFamily: FONT, textAlign: "center", textVerticalAlign: "middle" } },
        { type: "text", style: { text: "total", x: 0, y: 12, fontSize: 11, fill: ink.text3, fontFamily: FONT, textAlign: "center", textVerticalAlign: "middle" } }] }],
      series: [{
        type: "pie", radius: compact ? ["52%", "78%"] : ["56%", "82%"], center: [compact ? "50%" : "28%", "50%"], padAngle: 1.5, avoidLabelOverlap: true,
        itemStyle: { borderRadius: 5, borderColor: ink.surface, borderWidth: 2 }, label: { show: false }, labelLine: { show: false },
        animationType: "expansion", animationEasing: "cubicOut", animationDuration: 900,
        emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 18, shadowColor: "rgba(0,0,0,.35)" } },
        data: p.labels.map((name, i) => ({ name, value: p.values[i], itemStyle: { color: name === "Others" ? ink.axis : colors[i % 6] }, selected: highlight != null && p.keys[i] === highlight })),
        selectedOffset: 6
      }],
      tooltip: { ...common.tooltip, trigger: "item", formatter: (x: { name: string; value: number; percent: number }) => `${x.name}<br><b>${f(x.value)}</b> · ${x.percent.toFixed(0)}%` }
    };
  }

  const isLine = p.chart === "line" || p.chart === "area";
  const horizontal = p.chart === "hbar";
  const max = Math.max(1, ...p.values);
  // a ranking names every bar (never hidden to avoid overlap: a bar without its name misleads); dense lists use smaller type
  const dense = horizontal && p.values.length > 7;
  const cat = {
    type: "category" as const, data: p.labels, inverse: horizontal, boundaryGap: !isLine, axisTick: { show: false },
    axisLine: { show: !horizontal, lineStyle: { color: ink.axis } },
    axisLabel: { color: ink.text2, fontSize: dense ? fs - 1.5 : fs, hideOverlap: !horizontal, interval: horizontal ? 0 : "auto",
      width: horizontal ? (compact ? 86 : 120) : undefined, overflow: horizontal ? "truncate" : undefined }
  };
  const val = {
    type: "value" as const, splitLine: { lineStyle: { color: ink.grid } }, axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { show: !horizontal, color: ink.text3, fontSize: fs - 0.5, formatter: (x: number) => short(x, p) }
  };
  if (isLine) {
    const peak = p.values.indexOf(max);
    return {
      ...common,
      grid: { left: 6, right: 16, top: 18, bottom: 4, containLabel: true },
      xAxis: { ...cat, axisLabel: { ...cat.axisLabel, interval: "auto" } }, yAxis: val,
      series: [{
        type: "line", data: p.values, smooth: 0.35, symbol: "circle", symbolSize: 6, showSymbol: p.values.length <= 20,
        lineStyle: { width: 2.4, color: grad(B, A, true), shadowColor: alpha(A, 0.45), shadowBlur: 12, shadowOffsetY: 6 },
        itemStyle: { color: A, borderColor: ink.surface, borderWidth: 2 },
        areaStyle: p.chart === "area" ? { color: grad(alpha(A, 0), alpha(A, ink.dark ? 0.38 : 0.24)) } : undefined,
        animationDuration: 1400, animationEasing: "cubicInOut",
        markPoint: p.values.length > 2 ? { symbol: "circle", symbolSize: 9, itemStyle: { color: ink.text, borderColor: A, borderWidth: 3 },
          label: { show: true, position: "top", distance: 6, color: ink.text, fontWeight: 700, fontSize: fs, formatter: () => fl(max) }, data: [{ coord: [peak, max] }] } : undefined
      }],
      tooltip: { ...common.tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: ink.text3, type: "dashed" } }, valueFormatter: (x: number) => f(x) }
    };
  }
  return {
    ...common,
    grid: { left: 4, right: horizontal ? (compact ? 44 : 64) : 10, top: horizontal ? 2 : 22, bottom: 2, containLabel: true },
    xAxis: horizontal ? val : cat, yAxis: horizontal ? cat : val,
    series: [{
      type: "bar", barMaxWidth: compact ? 14 : 18, barMinHeight: 2,
      data: p.values.map((v, i) => {
        const hot = highlight == null ? i === 0 : p.keys[i] === highlight;
        return { value: v, itemStyle: {
          color: hot ? grad(B, A, horizontal) : grad(alpha(A, ink.dark ? 0.55 : 0.6), alpha(A, ink.dark ? 0.32 : 0.35), horizontal),
          borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0], shadowColor: hot ? alpha(A, 0.5) : "transparent", shadowBlur: hot ? 12 : 0 } };
      }),
      showBackground: true, backgroundStyle: { color: alpha(ink.text3, ink.dark ? 0.06 : 0.08), borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] },
      label: { show: horizontal ? p.values.length <= 14 : p.values.length <= (compact ? 6 : 10), position: horizontal ? "right" : "top", distance: 6, color: ink.text, fontSize: dense ? fs - 1.5 : fs, fontWeight: 600,
        formatter: (x: { value: number }) => fl(x.value) },
      animationDuration: 800, animationDelay: (i: number) => i * 55, animationEasing: "cubicOut", cursor: "pointer",
      emphasis: { itemStyle: { color: grad(B, A, horizontal) } }
    }],
    tooltip: { ...common.tooltip, trigger: "item", formatter: (x: { name: string; value: number }) => `${x.name}<br><b>${f(x.value)}</b>${p.total && (p.plan.agg === "count" || p.plan.agg === "sum") ? ` · ${Math.round((x.value / p.total) * 100)}% of all` : ""}` }
  };
}

function short(x: number, p: PanelData): string {
  if (p.format === "money") return x >= 1e7 ? `${+(x / 1e7).toFixed(1)}cr` : x >= 1e5 ? `${+(x / 1e5).toFixed(1)}L` : x >= 1e3 ? `${+(x / 1e3).toFixed(0)}k` : String(x);
  return x >= 1e5 ? `${+(x / 1e5).toFixed(1)}L` : x >= 1e3 ? `${+(x / 1e3).toFixed(1)}k` : String(Math.round(x * 10) / 10);
}

/** Zone by zone: the dataset against the linked incidents, side by side. */
export const PairChart = memo(function PairChart({ pairs, dsLabel, incLabel, height }: { pairs: { name: string; ds: number; inc: number }[]; dsLabel: string; incLabel: string; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const ink = useInk(box);
  const option = useMemo(() => {
    if (!ink) return null;
    const top = [...pairs].sort((a, b) => b.ds - a.ds).slice(0, 8);
    const A = ink.viz[0], C = ink.high;
    return {
      animationDuration: 800, animationDelay: (i: number) => i * 40, textStyle: { fontFamily: FONT, color: ink.text2 },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 6, textStyle: { color: ink.text2, fontSize: 10.5 }, data: [cap(dsLabel), cap(incLabel)] },
      grid: { left: 2, right: 6, top: 24, bottom: 2, containLabel: true },
      xAxis: { type: "category", data: top.map((p) => p.name), axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } },
        axisLabel: { color: ink.text3, fontSize: 9.5, interval: 0, rotate: 30, width: 70, overflow: "truncate" } },
      yAxis: [{ type: "value", splitLine: { lineStyle: { color: ink.grid } }, axisLabel: { show: false } }, { type: "value", splitLine: { show: false }, axisLabel: { show: false } }],
      series: [
        { name: cap(dsLabel), type: "bar", barWidth: 7, data: top.map((p) => p.ds), itemStyle: { color: grad(alpha(A, 0.6), A), borderRadius: [4, 4, 0, 0] } },
        { name: cap(incLabel), type: "bar", yAxisIndex: 1, barWidth: 7, data: top.map((p) => p.inc), itemStyle: { color: grad(alpha(C, 0.55), C), borderRadius: [4, 4, 0, 0] } }
      ],
      tooltip: { trigger: "axis", confine: true, backgroundColor: ink.elev, borderColor: ink.line, textStyle: { color: ink.text, fontSize: 12, fontFamily: FONT } }
    } as echarts.EChartsCoreOption;
  }, [pairs, dsLabel, incLabel, ink]);
  return <div ref={box} style={{ height }}>{option && <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: "100%", width: "100%" }} />}</div>;
});

/** Week by week: the dataset and the linked incidents as two lines. */
export const TimeChart = memo(function TimeChart({ series, dsLabel, incLabel, height }: { series: { week: string; ds: number; inc: number }[]; dsLabel: string; incLabel: string; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const ink = useInk(box);
  const option = useMemo(() => {
    if (!ink) return null;
    const A = ink.viz[0], C = ink.high;
    const lbl = (w: string) => `${Number(w.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(w.slice(5, 7)) - 1]}`;
    return {
      animationDuration: 1200, textStyle: { fontFamily: FONT, color: ink.text2 },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 4, textStyle: { color: ink.text2, fontSize: 10.5 }, data: [cap(dsLabel), cap(incLabel)] },
      grid: { left: 2, right: 6, top: 22, bottom: 2, containLabel: true },
      xAxis: { type: "category", data: series.map((s) => lbl(s.week)), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: ink.axis } }, axisLabel: { color: ink.text3, fontSize: 9.5 } },
      yAxis: [{ type: "value", splitLine: { lineStyle: { color: ink.grid } }, axisLabel: { show: false } }, { type: "value", splitLine: { show: false }, axisLabel: { show: false } }],
      series: [
        { name: cap(dsLabel), type: "line", smooth: 0.35, showSymbol: false, data: series.map((s) => s.ds), lineStyle: { width: 2.2, color: A }, areaStyle: { color: grad(alpha(A, 0), alpha(A, 0.28)) } },
        { name: cap(incLabel), type: "line", yAxisIndex: 1, smooth: 0.35, showSymbol: false, data: series.map((s) => s.inc), lineStyle: { width: 2, color: C, type: "dashed" } }
      ],
      tooltip: { trigger: "axis", confine: true, backgroundColor: ink.elev, borderColor: ink.line, textStyle: { color: ink.text, fontSize: 12, fontFamily: FONT } }
    } as echarts.EChartsCoreOption;
  }, [series, dsLabel, incLabel, ink]);
  return <div ref={box} style={{ height }}>{option && <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: "100%", width: "100%" }} />}</div>;
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
