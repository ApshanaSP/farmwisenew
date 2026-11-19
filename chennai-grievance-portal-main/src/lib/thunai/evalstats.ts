/**
 * Statistics for the evaluation reports (v5 build, section 6.1). In code, no package. Pure.
 *
 *   wilson(k, n)     95 % Wilson score interval (z = 1.96), in percent. Not a normal-approximation interval, not a bootstrap: at
 *                    small n those are wrong (https://arxiv.org/html/2503.01747v3)
 *   mcnemar(b, c)    exact two-sided sign test on the discordant pairs (b = right only in run X, c = right only in run Y), with
 *                    its mid-p beside it
 *   pairs(x, y)      b and c from two runs over the same sentences, matched by id (refuses different sentence sets)
 *   passK(c, n, k)   mean over sentences of C(c, k) / C(n, k): pass^k with n runs a sentence (https://arxiv.org/html/2406.12045)
 *   majority3(runs)  a sentence is right when right in at least 2 of 3 runs
 */

export interface Interval { k: number; n: number; p: number; lo: number; hi: number }

/** 95 % Wilson score interval for k of n, in percent (unrounded; round when printing). */
export function wilson(k: number, n: number): Interval {
  if (!n) return { k: 0, n: 0, p: 0, lo: 0, hi: 0 };
  const z = 1.96, p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const clamp = (x: number) => Math.min(100, Math.max(0, x * 100));
  return { k, n, p: (k / n) * 100, lo: k === 0 ? 0 : clamp((c - s) / d), hi: k === n ? 100 : clamp((c + s) / d) };
}

/** "39/60 (65.0 %, 52.4-75.8)": a score with its interval, as every report prints it. */
export function scoreLine(k: number, n: number): string {
  const w = wilson(k, n), f = (x: number) => x.toFixed(1);
  return n ? `${k}/${n} (${f(w.p)} %, ${f(w.lo)}-${f(w.hi)})` : `${k}/${n}`;
}

/** C(n, k), exactly enough for the small n here. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return r;
}

/** P(X = k) for X ~ Binomial(n, 1/2). */
export function binom(n: number, k: number): number {
  return choose(n, k) / 2 ** n;
}

export interface McNemar { b: number; c: number; n: number; p: number; midP: number }

/** Exact two-sided McNemar (a sign test on the b + c discordant pairs), and the mid-p. */
export function mcnemar(b: number, c: number): McNemar {
  const n = b + c;
  if (!n) return { b, c, n: 0, p: 1, midP: 1 };
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binom(n, i);
  const p = Math.min(1, 2 * tail);
  const midP = Math.min(1, 2 * (tail - binom(n, k) / 2));
  return { b, c, n, p, midP };
}

export interface Pairing { n: number; both: number; neither: number; b: number; c: number }

/** b and c from two runs on the same sentences (rows matched by id). Throws when the sentence sets differ. */
export function pairs(x: { id: string; ok: boolean }[], y: { id: string; ok: boolean }[]): Pairing {
  const ym = new Map(y.map((r) => [r.id, r.ok]));
  if (x.length !== y.length || x.some((r) => !ym.has(r.id)) || new Set(x.map((r) => r.id)).size !== x.length)
    throw new Error("pairs: the two runs are not on the same sentences");
  const out: Pairing = { n: x.length, both: 0, neither: 0, b: 0, c: 0 };
  for (const r of x) {
    const o = ym.get(r.id) as boolean;
    if (r.ok && o) out.both++;
    else if (!r.ok && !o) out.neither++;
    else if (r.ok) out.b++;
    else out.c++;
  }
  return out;
}

/** pass^k: the mean over sentences of C(c, k) / C(n, k), c = the times a sentence was right in n runs. */
export function passK(correct: number[], n: number, k: number): number {
  if (k > n || k < 1) throw new Error("passK: k must be 1..n");
  if (correct.some((c) => c < 0 || c > n || !Number.isInteger(c))) throw new Error("passK: a count is outside 0..n");
  if (!correct.length) return 0;
  return correct.reduce((a, c) => a + choose(c, k) / choose(n, k), 0) / correct.length;
}

/** Majority of three runs: runs[r][i] is sentence i in run r. */
export function majority3(runs: boolean[][]): { n: number; right: number; perSentence: boolean[] } {
  if (runs.length !== 3 || runs.some((r) => r.length !== runs[0].length)) throw new Error("majority3: three runs of the same sentences");
  const perSentence = runs[0].map((_, i) => runs.filter((r) => r[i]).length >= 2);
  return { n: perSentence.length, right: perSentence.filter(Boolean).length, perSentence };
}
