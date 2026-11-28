/**
 * 28 Nov: a comparison dashboard's breakdowns (chartspec.ts compareGroups) are drawn on one scale for every side: the kinds, the departments and
 * who reported them, as grouped bars lying down (StageChart "group", horizontal) so long names stay readable at 375 px.
 */
import { describe, expect, it } from "vitest";
import type { BlockT } from "@/lib/thunai/stage";
import { compareGroups } from "./chartspec";
import { option } from "./StageChart";

const ink = { text: "#111", text2: "#333", text3: "#666", grid: "#eee", axis: "#ccc", surface: "#fff", elev: "#fff", line: "#ddd", accent: "#2a78d6", signal: "#2a78d6",
  sev: "#c00", high: "#e80", low: "#08c", violet: "#80c", teal: "#0aa", dark: false, viz: ["#2a78d6", "#e8743b", "#19a979", "#945ecf"] };
const side = (label: string, cats: [string, number][], depts: [string, number][], from: [string, number][]) => ({ key: label, label, zone: null, values: { n: cats.reduce((a, [, n]) => a + n, 0) }, series: [],
  cats: cats.map(([code, n]) => ({ code, label: code.toLowerCase(), n })), depts: depts.map(([code, n]) => ({ code, label: code, n })), from: from.map(([key, n]) => ({ key, label: key, n })) });
const cmp = (chart: string[] | undefined): Extract<BlockT, { kind: "Compare" }> => ({ kind: "Compare", id: "cmp", title: "t", metrics: [{ key: "n", label: "Reported" }], seriesLabels: [], diffs: [], ...(chart ? { chart } : {}),
  sides: [side("Anna Nagar", [["THEFT", 4], ["FLOOD", 2]], [["POL", 12], ["PWD", 2]], [["police", 12], ["citizens", 5]]), side("Adyar", [["FLOOD", 2], ["ROAD", 2]], [["POL", 7], ["SWD", 1]], [["police", 8], ["citizens", 7]])] });

describe("a comparison's breakdowns, on one scale", () => {
  it("every side's count of every item the sides hold most of, 0 where a side has none", () => {
    const g = compareGroups(cmp(["n"]), false);
    expect(g.map((x) => x.key)).toEqual(["cats", "depts", "from"]);
    const cats = g[0];
    expect(cats.categories).toEqual(["theft", "flood", "road"]);
    expect(cats.series).toEqual([{ name: "Anna Nagar", values: [4, 2, 0] }, { name: "Adyar", values: [0, 2, 2] }]);
    expect(g[1].series.map((s) => s.values)).toEqual([[12, 2, 0], [7, 0, 1]]);
    expect(compareGroups(cmp(["n"]), true)[0].title).toBe("வகை வாரியாக");
  });
  it("the older comparisons keep their lists", () => {
    expect(compareGroups(cmp(undefined), false).map((x) => x.key)).toEqual(["depts", "from"]);
  });
  it("grouped bars lying down: the names down the side, one series a side, one value axis", () => {
    const g = compareGroups(cmp(["n"]), false)[0];
    const o = option({ type: "group", categories: g.categories, series: g.series, unit: "incidents", horizontal: true }, ink as never, "By kind", true) as unknown as { yAxis: { type: string; data: string[] }; xAxis: { type: string }; series: { type: string; data: number[] }[] };
    expect(o.yAxis).toMatchObject({ type: "category", data: ["theft", "flood", "road"] });
    expect(o.xAxis.type).toBe("value");
    expect(o.series.map((s) => s.data)).toEqual([[4, 2, 0], [0, 2, 2]]);
  });
});
