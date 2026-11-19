/**
 * Where a change in a count sits, and whether a count is outside what chance allows. Pure; written from the ideas, no code copied.
 *
 *   Explanatory power (Adtributor, Bhagwan et al., NSDI 2014): a segment's share of the total change, (now_i - before_i) / (now - before).
 *   The shares of all segments of one split (zone, department, kind) add up to 1; a segment that moved against the total has a negative share.
 *   Surprise (the same paper): how far the segment's share of the total moved, measured as its term of the Jensen-Shannon divergence
 *   between the before shares p and the now shares q, in bits: 0.5 (p log2(2p / (p + q)) + q log2(2q / (p + q))). A segment that
 *   grew in step with everything else has no surprise, however large it is.
 *   The explanatory set of a split: its segments in order of surprise, each kept only if it explains enough of the change on its own,
 *   until together they explain most of it. Splits are ranked by the surprise of their sets: the split whose few segments moved most
 *   against the rest is the one to say.
 *
 *   Unusual counts: the exact test that two Poisson counts over equal windows have the same rate. Given the sum n = now + before, now
 *   is Binomial(n, 1/2) under that hypothesis (the conditional test), so the two-sided p-value needs no estimate of the rate. The band is
 *   every count now that the test would not flag, given the count before; a minimum count keeps 0 -> 4 from being called unusual.
 */

export type Dim = "zone" | "dept" | "cat";

export interface Segment {
  dim: Dim;
  key: string;
  now: number;
  before: number;
  /** the rest of the total that no listed segment holds (no zone on record, the other kinds): scored, never named as a driver */
  other?: boolean;
}

export interface Scored extends Segment {
  delta: number;
  /** share of the total change (explanatory power); null when the total did not change */
  ep: number | null;
  /** Jensen-Shannon term of this segment's share before and now, in bits */
  surprise: number;
  /** share of the total before and now */
  shareBefore: number;
  shareNow: number;
}

const log2 = (x: number) => Math.log(x) / Math.LN2;

/** One segment's term of the Jensen-Shannon divergence between the before shares (p) and the now shares (q), in bits; 0 log 0 = 0. */
export function jsTerm(p: number, q: number): number {
  const m = (p + q) / 2;
  if (m <= 0) return 0;
  const part = (x: number) => (x > 0 ? x * log2(x / m) : 0);
  return Math.max(0, 0.5 * (part(p) + part(q)));
}

/** Each segment of one split with its share of the change and its surprise, against the split's totals. */
export function scoreSplit(segs: Segment[], totalNow: number, totalBefore: number): Scored[] {
  const change = totalNow - totalBefore;
  return segs.map((s) => {
    const shareBefore = totalBefore > 0 ? s.before / totalBefore : 0;
    const shareNow = totalNow > 0 ? s.now / totalNow : 0;
    const delta = s.now - s.before;
    return { ...s, delta, ep: change !== 0 ? delta / change : null, surprise: jsTerm(shareBefore, shareNow), shareBefore, shareNow };
  });
}

export interface ExplanatorySet { dim: Dim; items: Scored[]; ep: number; surprise: number; covers: boolean }
export interface SetRule {
  /** the least share of the change one segment must explain to be kept */
  minEach: number;
  /** the share of the change the kept segments should explain together */
  cover: number;
  /** at most this many segments: a short answer is a better one */
  max: number;
}
export const SET_RULE: SetRule = { minEach: 0.1, cover: 0.67, max: 3 };

/** The explanatory set of one split, or null when the total did not move or no named segment explains enough of it. */
export function explanatorySet(scored: Scored[], rule: SetRule = SET_RULE): ExplanatorySet | null {
  const named = scored.filter((s) => !s.other && s.ep != null && s.ep >= rule.minEach);
  if (!named.length) return null;
  const items: Scored[] = [];
  let ep = 0, surprise = 0;
  for (const s of [...named].sort((a, b) => b.surprise - a.surprise || (b.ep as number) - (a.ep as number))) {
    items.push(s);
    ep += s.ep as number;
    surprise += s.surprise;
    if (ep >= rule.cover || items.length >= rule.max) break;
  }
  return { dim: items[0].dim, items, ep, surprise, covers: ep >= rule.cover };
}

/** The splits' sets, the most telling first: sets that explain most of the change before those that do not, then by surprise. */
export function rankSets(sets: (ExplanatorySet | null)[]): ExplanatorySet[] {
  return sets.filter((s): s is ExplanatorySet => !!s).sort((a, b) => Number(b.covers) - Number(a.covers) || b.surprise - a.surprise || b.ep - a.ep);
}

// ------------------------------------------------------------------ unusual counts --

const LOG_FACT: number[] = [0];
function logFact(n: number): number {
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[n];
}
/** P(X >= k) for X ~ Binomial(n, 1/2), summed exactly */
function upperTail(n: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const base = logFact(n) - n * Math.LN2;
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(base - logFact(i) - logFact(n - i));
  return Math.min(1, s);
}
/** the standard normal upper tail (Abramowitz and Stegun 26.2.17), for very large counts only */
function normalUpper(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? q : 1 - q;
}

/** Two-sided p-value that two Poisson counts over equal windows have the same rate (the exact conditional test). */
export function twoCountP(now: number, before: number): number {
  const a = Math.max(0, Math.round(now)), b = Math.max(0, Math.round(before));
  const n = a + b;
  if (n === 0 || a === b) return 1;
  if (n > 20_000) return Math.min(1, 2 * normalUpper((Math.abs(a - b) - 1) / Math.sqrt(n)));
  return Math.min(1, 2 * upperTail(n, Math.max(a, b)));
}

export interface Band { lo: number; hi: number }
/** Every count now that the test would not call different from `before`, at level `alpha`. */
export function bandFor(before: number, alpha = 0.01): Band {
  const b = Math.max(0, Math.round(before));
  let lo = b;
  while (lo > 0 && twoCountP(lo - 1, b) >= alpha) lo--;
  let hi = b;
  while (twoCountP(hi + 1, b) >= alpha && hi < b * 4 + 100) hi++;
  return { lo, hi };
}

export interface UnusualRule { alpha: number; min: number }
/** 1 % two-sided, and at least 5 in the larger window: a count that small says little either way */
export const UNUSUAL: UnusualRule = { alpha: 0.01, min: 5 };

/** "high" when now is above the band of the count before, "low" below it, null within it or when the counts are too small to say. */
export function unusual(now: number, before: number, rule: UnusualRule = UNUSUAL): { flag: "high" | "low" | null; p: number; band: Band } {
  const p = twoCountP(now, before);
  const band = bandFor(before, rule.alpha);
  const flag = p >= rule.alpha ? null : now > before ? (now >= rule.min ? "high" : null) : before >= rule.min ? "low" : null;
  return { flag, p, band };
}
