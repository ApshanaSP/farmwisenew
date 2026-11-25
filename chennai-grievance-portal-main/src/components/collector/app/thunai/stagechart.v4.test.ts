/**
 * v4 brief, defect 9: a Chart block of kind "line" was drawn as upright bars (Stage.tsx mapped it to { type: "bars", horizontal: false }).
 * It is a line now: one line series over a category axis of its labels, a value axis, Tamil labels kept as they are, and no animation when the
 * reader asked for reduced motion. The other kinds draw as before.
 */
import { describe, expect, it } from "vitest";
import { chartHeight, chartSpecOf, type ChartBlock } from "./chartspec";
import { option, pickIndex, type StageChartSpec } from "./StageChart";

const ink = { text: "#111", text2: "#333", text3: "#666", grid: "#eee", axis: "#ccc", surface: "#fff", elev: "#fff", line: "#ddd", accent: "#2a78d6", signal: "#2a78d6",
  sev: "#c00", high: "#e80", low: "#08c", violet: "#80c", teal: "#0aa", dark: false, viz: ["#2a78d6", "#e8743b", "#19a979", "#945ecf"] };
const chart = (kind: ChartBlock["chart"], labels = ["1 நவ.", "2 நவ.", "3 நவ.", "4 நவ."], values = [4, 9, 6, 12]): ChartBlock =>
  ({ kind: "Chart", id: "c", title: "காலவாரியாக", chart: kind, unit: "incidents", labels, values });
type Opt = { animation?: boolean; series: { type: string; data: unknown[] }[]; xAxis: { type: string; data?: string[] }; yAxis: { type: string } };
const opt = (s: StageChartSpec, reduce = false) => option(s, ink as never, "t", reduce) as unknown as Opt;

describe("defect 9: a line chart is drawn as a line", () => {
  it("the spec of a line chart is a line, with its labels, values and unit", () => {
    const s = chartSpecOf(chart("line"));
    expect(s.type).toBe("line");
    expect(s).toMatchObject({ labels: ["1 நவ.", "2 நவ.", "3 நவ.", "4 நவ."], values: [4, 9, 6, 12], unit: "incidents" });
  });
  it("the drawing is one line series over a category axis of the labels, against a value axis", () => {
    const o = opt(chartSpecOf(chart("line")));
    expect(o.series).toHaveLength(1);
    expect(o.series[0].type).toBe("line");
    expect(o.series[0].data).toEqual([4, 9, 6, 12]);
    expect(o.xAxis.type).toBe("category");
    expect(o.xAxis.data).toEqual(["1 நவ.", "2 நவ.", "3 நவ.", "4 நவ."]);
    expect(o.yAxis.type).toBe("value");
  });
  it("reduced motion: nothing animates", () => {
    expect(opt(chartSpecOf(chart("line")), true).animation).toBe(false);
    expect(opt(chartSpecOf(chart("line")), false).animation).toBe(true);
  });
  it("a line below zero keeps its axis free", () => {
    const o = opt(chartSpecOf(chart("line", ["a", "b"], [-3, 5]))) as unknown as { yAxis: { min?: number } };
    expect(o.yAxis.min).toBeUndefined();
  });
  it("the other kinds draw as before: upright bars, bars lying down, a ring", () => {
    expect(chartSpecOf(chart("bar"))).toMatchObject({ type: "bars", horizontal: false });
    expect(chartSpecOf(chart("hbar"))).toMatchObject({ type: "bars", horizontal: true });
    expect(chartSpecOf(chart("donut")).type).toBe("donut");
    expect(opt(chartSpecOf(chart("bar"))).series[0].type).toBe("bar");
    expect(chartHeight(chart("hbar", Array.from({ length: 8 }, (_, i) => `x${i}`), Array(8).fill(1)))).toBe(270);
  });
});

describe("v18 review: a click opens the point it landed on", () => {
  // a trend whose peak (index 3) and one unusual point (index 1) are marked: the marks sit on top of the series dots
  const trend: StageChartSpec = { type: "trend", labels: ["20 Nov", "21 Nov", "22 Nov", "23 Nov"], values: [4, 9, 6, 12], unit: "incidents", marks: [{ i: 1, why: "Unusually high" }], normal: null };
  const marks = (opt(trend) as unknown as { series: { markPoint: { data: { coord: [number, number] }[] } }[] }).series[0].markPoint.data;
  it("a series dot reports its own index", () => {
    expect(pickIndex({ componentType: "series", dataIndex: 2 })).toBe(2);
  });
  it("a marked point reports the series point under it, never its place in the mark list (the peak was 0, the first day)", () => {
    expect(marks.map((m) => m.coord[0])).toEqual([1, 3]);
    // ECharts hands a markPoint click its own index in the mark list and its data item, coord included
    expect(pickIndex({ componentType: "markPoint", dataIndex: 1, data: marks[1] })).toBe(3);
    expect(pickIndex({ componentType: "markPoint", dataIndex: 0, data: marks[0] })).toBe(1);
    // (a coord given as the category's name is looked up in the labels)
    expect(pickIndex({ componentType: "markPoint", dataIndex: 0, data: { coord: ["22 Nov", 6] } }, trend.labels)).toBe(2);
  });
  it("anything else picks nothing: a shaded range, an axis, a series click with no point", () => {
    expect(pickIndex({ componentType: "markArea", dataIndex: 0 })).toBeNull();
    expect(pickIndex({ componentType: "xAxis", dataIndex: 0 })).toBeNull();
    expect(pickIndex({ componentType: "series" })).toBeNull();
    expect(pickIndex({ componentType: "markPoint", dataIndex: 0, data: null })).toBeNull();
  });
});
