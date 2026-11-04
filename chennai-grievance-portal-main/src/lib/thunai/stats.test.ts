import { describe, expect, it } from "vitest";
import { cChart, modifiedZ, trendOf } from "./stats";

describe("what stands out", () => {
  it("modified z flags the one unlike the rest, with its method and a caveat in both languages", () => {
    const r = modifiedZ([10, 12, 11, 13, 9, 12, 11, 60, 10, 12].map((value, i) => ({ key: `z${i}`, value })));
    expect(r.value.map((x) => x.key)).toEqual(["z7"]);
    expect(r.value[0].z).toBeGreaterThan(3.5);
    expect(r.n).toBe(10);
    expect(r.method).toMatch(/Modified z-score/);
    expect(r.caveat.ta).toMatch(/[஀-௿]/);
  });
  it("nothing stands out in an even list; MAD of zero falls back to the mean deviation; too few says so", () => {
    expect(modifiedZ([5, 5, 5, 6, 5, 4, 5, 6].map((value, i) => ({ key: `k${i}`, value }))).value).toEqual([]);
    expect(modifiedZ([5, 5, 5, 5, 5, 5, 50, 5].map((value, i) => ({ key: `k${i}`, value }))).value[0].key).toBe("k6");
    expect(modifiedZ([1, 2, 100].map((value, i) => ({ key: `k${i}`, value }))).value).toEqual([]);
    expect(modifiedZ([1, 2, 3, 4, 100].map((value, i) => ({ key: `k${i}`, value }))).caveat.en).toMatch(/Only 5/);
  });
  it("the mean deviation stand-in does not flag one severe case among zones with none, and names itself", () => {
    const list = (top: number) => Array.from({ length: 15 }, (_, i) => ({ key: `z${i}`, value: i === 0 ? top : 0 }));
    const one = modifiedZ(list(1));
    expect(one.value).toEqual([]);
    expect(one.method).toMatch(/mean deviation 0\.07/);
    expect(one.method).not.toMatch(/MAD 0/);
    expect(modifiedZ(list(2)).value).toEqual([]);
    expect(modifiedZ(list(9)).value.map((x) => x.key)).toEqual(["z0"]);
    expect(modifiedZ([100, 100, 100, 100, 100, 100, 104, 100].map((value, i) => ({ key: `k${i}`, value }))).value).toEqual([]);
  });
  it("a very small p reads as p < 0.01, never p 0", () => {
    const m = trendOf(Array.from({ length: 30 }, (_, i) => i)).method;
    expect(m).toMatch(/p < 0\.01/);
    expect(m).not.toMatch(/p 0\)/);
  });
  it("c-chart: the latest count outside the limits is a signal; the limits do not include it", () => {
    const r = cChart([10, 12, 9, 11, 10, 13, 8, 11, 10, 40]);
    expect(r.value.latestOut).toBe(true);
    expect(r.value.center).toBeCloseTo(10.44, 1);
    expect(r.value.signals).toEqual([9]);
    expect(cChart([10, 12, 9, 11, 10, 13, 8, 11, 10, 11]).value.latestOut).toBe(false);
    expect(r.method).toMatch(/c-chart/);
  });
  it("Theil-Sen and Mann-Kendall: rising, falling, flat, and too short", () => {
    const up = trendOf([1, 2, 2, 4, 5, 5, 7, 8, 9, 11]);
    expect(up.value).toMatchObject({ direction: "rising", significant: true });
    expect(up.value.slope).toBeCloseTo(1.08, 0);
    expect(trendOf([11, 9, 8, 7, 5, 5, 4, 2, 2, 1]).value.direction).toBe("falling");
    expect(trendOf([5, 7, 4, 6, 5, 7, 4, 6, 5, 6]).value.direction).toBe("flat");
    const short = trendOf([1, 2, 3, 4]);
    expect(short.value.direction).toBe("flat");
    expect(short.caveat.en).toMatch(/too few/);
    expect(trendOf([5, 5, 5, 5, 5, 5, 5, 5]).value).toMatchObject({ direction: "flat", s: 0 });
  });
});
