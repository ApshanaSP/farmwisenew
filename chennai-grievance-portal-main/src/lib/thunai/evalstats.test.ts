import { describe, expect, it } from "vitest";
import { binom, majority3, mcnemar, pairs, passK, wilson } from "./evalstats";

const r1 = (x: number) => Math.round(x * 10) / 10;

describe("wilson: the 95 % Wilson score interval (z = 1.96), in percent", () => {
  it("meets the build prompt's vectors", () => {
    expect([r1(wilson(39, 60).lo), r1(wilson(39, 60).hi)]).toEqual([52.4, 75.8]);
    expect([r1(wilson(44, 60).lo), r1(wilson(44, 60).hi)]).toEqual([61.0, 82.9]);
    expect([r1(wilson(2, 40).lo), r1(wilson(2, 40).hi)]).toEqual([1.4, 16.5]);
    expect(r1(wilson(4, 200).hi)).toBe(5.0);
  });
  it("is honest at the edges", () => {
    expect(wilson(0, 0)).toEqual({ k: 0, n: 0, p: 0, lo: 0, hi: 0 });
    expect(wilson(0, 10).lo).toBe(0);
    expect(r1(wilson(0, 10).hi)).toBe(27.8);
    expect(r1(wilson(10, 10).lo)).toBe(72.2);
    expect(wilson(10, 10).hi).toBe(100);
    expect(wilson(3, 4).p).toBe(75);
  });
});

describe("mcnemar: the exact two-sided sign test on the discordant pairs, with its mid-p", () => {
  it("meets the build prompt's vectors", () => {
    expect(mcnemar(6, 0).p).toBeCloseTo(0.03125, 6);
    expect(mcnemar(5, 1).p).toBeCloseTo(0.21875, 6);
    expect(mcnemar(6, 1).p).toBe(0.125);
  });
  it("is symmetric, capped at 1, and gives the mid-p beside it", () => {
    expect([mcnemar(1, 6).p, mcnemar(1, 6).midP]).toEqual([mcnemar(6, 1).p, mcnemar(6, 1).midP]);
    expect(mcnemar(3, 3).p).toBe(1);
    expect(mcnemar(0, 0)).toEqual({ b: 0, c: 0, n: 0, p: 1, midP: 1 });
    // mid-p = 2 * (P(X <= k) - P(X = k) / 2): for 6 and 0, 2 * (1/64 - 1/128) = 1/64
    expect(mcnemar(6, 0).midP).toBeCloseTo(1 / 64, 8);
    // 6 and 1: 2 * (8/128 - 7/256) = 9/128
    expect(mcnemar(6, 1).midP).toBeCloseTo(9 / 128, 8);
  });
  it("the binomial point and tail it rests on", () => {
    expect(binom(6, 0)).toBeCloseTo(1 / 64, 10);
    expect(binom(7, 1)).toBeCloseTo(7 / 128, 10);
  });
});

describe("pairs: b and c from two runs on the same sentences", () => {
  it("counts right-only-in-X and right-only-in-Y, matched by id, and refuses different sentences", () => {
    const x = [{ id: "a", ok: true }, { id: "b", ok: true }, { id: "c", ok: false }, { id: "d", ok: false }];
    const y = [{ id: "d", ok: true }, { id: "c", ok: false }, { id: "b", ok: false }, { id: "a", ok: true }];
    expect(pairs(x, y)).toEqual({ n: 4, both: 1, neither: 1, b: 1, c: 1 });
    expect(() => pairs(x, y.slice(1))).toThrow(/same sentences/);
  });
});

describe("passK: the mean over sentences of C(c, k) / C(n, k)", () => {
  it("hand-computed cases", () => {
    // three runs each; right 3, 2, 0 times
    expect(passK([3, 2, 0], 3, 1)).toBeCloseTo((1 + 2 / 3 + 0) / 3, 10);
    expect(passK([3, 2, 0], 3, 3)).toBeCloseTo((1 + 0 + 0) / 3, 10);
    expect(passK([3, 2, 0], 3, 2)).toBeCloseTo((1 + 1 / 3 + 0) / 3, 10);
    expect(passK([], 3, 1)).toBe(0);
  });
  it("refuses a count above n or a k above n", () => {
    expect(() => passK([4], 3, 1)).toThrow();
    expect(() => passK([1], 3, 4)).toThrow();
  });
});

describe("majority3: right when right in at least 2 of 3 runs", () => {
  it("hand-computed cases", () => {
    const runs = [
      [true, true, false, false],
      [true, false, true, false],
      [false, false, true, false]
    ];
    expect(majority3(runs)).toEqual({ n: 4, right: 2, perSentence: [true, false, true, false] });
  });
  it("needs exactly three runs of the same length", () => {
    expect(() => majority3([[true], [true]])).toThrow();
    expect(() => majority3([[true], [true], [true, false]])).toThrow();
  });
});
