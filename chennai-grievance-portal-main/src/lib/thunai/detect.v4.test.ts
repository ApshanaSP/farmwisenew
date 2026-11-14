import { describe, expect, it } from "vitest";
import { anscombe, baselineOf, detect, latestAlarm, methodOf, nbQuantile, plainRule, stockGrowth, threshold } from "./detect";

/** a seeded generator (mulberry32) and a Poisson draw (Knuth), so every run sees the same noise */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda: number, r: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k += 1; p *= r(); } while (p > L);
  return k - 1;
}
const series = (len: number, lambda: (t: number) => number, seed: number) => { const r = rng(seed); return Array.from({ length: len }, (_, t) => poisson(lambda(t), r)); };

describe("the negative-binomial threshold", () => {
  it("quantiles: Poisson at phi 1, wider for over-dispersed counts", () => {
    // Poisson(5): P(Y <= 11) = 0.9945, P(Y <= 12) = 0.9980
    expect(nbQuantile(0.995, 5, 1)).toBe(12);
    expect(nbQuantile(0.995, 5, 3)).toBeGreaterThan(12);
    expect(nbQuantile(0.995, 0, 1)).toBe(0);
  });
  it("down-weights a past spike in the baseline, so the spike does not hide the next one", () => {
    const base = [4, 5, 6, 5, 4, 5, 6, 5, 4, 40, 5, 6];
    const t = threshold(base)!;
    expect(t.downweighted).toBeGreaterThanOrEqual(1);
    expect(t.mu).toBeLessThan(8); // the plain mean would be 7.9
    expect(anscombe(40, 5, 1)).toBeGreaterThan(2.58);
  });
  it("takes its baseline from the same weekday in past weeks, never the days just before", () => {
    const s = Array.from({ length: 40 }, (_, i) => i);
    const b = baselineOf(s, 39);
    expect(b).toEqual([31, 32, 33, 24, 25, 26, 17, 18, 19, 10, 11, 12]);
    expect(Math.max(...b)).toBeLessThanOrEqual(33);
  });
  it("too little history: no threshold, no alarm", () => {
    expect(threshold([3, 4, 5])).toBeNull();
    expect(detect([50, 60, 70, 80]).alarms).toEqual([]);
  });
});

describe("few false alarms on flat noise, an alarm on a real step", () => {
  it("flat Poisson noise across many seeds: the false-alarm rate stays tiny", () => {
    let alarms = 0, days = 0;
    for (const lambda of [0.5, 2, 5, 12, 30]) {
      for (let seed = 1; seed <= 200; seed++) {
        const s = series(120, () => lambda, seed * 7919 + Math.round(lambda * 10));
        const d = detect(s);
        alarms += d.alarms.length;
        days += s.length - 35; // the first 35 days have no full baseline
      }
    }
    const rate = alarms / days;
    // 1,000 series of 85 judged days each (measured 15 Nov: 3 alarms in 85,000 series-days): under 1 in 5,000
    expect(rate).toBeLessThan(0.0002);
  });
  const stepRun = (high: number, within: number) => {
    let caught = 0, early = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const d = detect(series(110, (t) => (t >= 90 ? high : 5), seed));
      if (d.alarms.some((a) => a.t >= 90 && a.t < 90 + within)) caught += 1;
      if (d.alarms.some((a) => a.t < 90)) early += 1;
    }
    return { caught, early };
  };
  it("a step from 5 to 20 a day is caught within four days in nearly every seed (measured 200 of 200)", () => {
    const r = stepRun(20, 4);
    expect(r.caught).toBeGreaterThanOrEqual(195);
    expect(r.early).toBeLessThanOrEqual(2);
  });
  it("a step from 5 to 15 a day is caught within a week in most seeds (measured 189 of 200)", () => {
    expect(stepRun(15, 7).caught).toBeGreaterThanOrEqual(170);
  });
  it("a single-day spike does not alarm (two days running are needed)", () => {
    const s = Array.from({ length: 60 }, () => 5);
    s[59] = 40;
    expect(latestAlarm(s)).toBeNull();
    s[58] = 40;
    expect(latestAlarm(s)?.value).toBe(40);
  });
  it("a count under the minimum never alarms, however unusual", () => {
    const s = Array.from({ length: 60 }, () => 0);
    s[58] = 4; s[59] = 4;
    expect(latestAlarm(s)).toBeNull();
  });
  it("cooldown: a rise that stays up alarms once, and again only when clearly worse", () => {
    const s = Array.from({ length: 70 }, (_, t) => (t >= 50 ? 20 : 5));
    const d = detect(s);
    const inWeek = d.alarms.filter((a) => a.t >= 50 && a.t <= 58);
    expect(inWeek.length).toBe(1);
    const w = [...s.slice(0, 55), 40, 40];
    expect(detect(w).alarms.some((a) => a.worse)).toBe(true);
  });
  it("names its method and the plain rule the replay judges it by", () => {
    expect(methodOf()).toMatch(/Noufaily/);
    expect(plainRule(12, 5)).toEqual({ real: true, rule: "count >= 2x baseline and >= 5" });
    expect(plainRule(8, 5).real).toBe(false);
  });
});

describe("a stock that grows (past the deadline)", () => {
  it("grows by enough, two days running", () => {
    const s = [40, 40, 41, 40, 42, 41, 40, 40, 52, 60];
    expect(stockGrowth(s)).toEqual({ value: 60, before: 41, growth: 19, persisted: true });
    expect(stockGrowth([40, 40, 41, 40, 42, 41, 40, 40, 41, 43])).toBeNull();
    expect(stockGrowth([1, 2])).toBeNull();
  });
});
