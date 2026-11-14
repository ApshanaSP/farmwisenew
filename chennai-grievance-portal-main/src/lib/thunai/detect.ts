/**
 * A count-aware detector for Jarvis's watch, with few false alarms. Pure.
 *
 * The idea is the improved Farrington method of Noufaily et al. (Statistics in Medicine, 2013), written from the paper's idea and
 * kept simple, not ported from any R code:
 *   1. the baseline is the same kind of period in the past (here: the same weekday in each of the last `weeks` weeks, plus the
 *      `window` days either side of it), never the days just before, so a rise that has started does not hide itself;
 *   2. counts are over-dispersed Poisson (quasi-Poisson): mean mu and dispersion phi >= 1 fitted from the baseline;
 *   3. past outbreaks are down-weighted: a baseline day whose Anscombe residual is above 2.58 gets weight s^-2 (Noufaily's
 *      threshold; Farrington's original used 1), the weights rescaled to sum to n, and mu and phi fitted again;
 *   4. the upper threshold is a quantile of the negative binomial with that mean and variance phi * mu (Poisson when phi is 1),
 *      instead of Farrington's 2/3-power approximation.
 * Left out on purpose (simplicity): the trend term and the seasonal factor levels of the paper. The 99.5 % quantile is this
 * build's choice for few false alarms; the paper's own default level is not restated here (unverified).
 *
 * The alarm rule on top: a count above the threshold on two periods running (persistence), at least `minCount`, and no new alarm
 * for the same series within `cooldown` periods of the last one unless it is clearly worse (`worse` times the last alarm's count).
 */

export interface DetectOpts {
  /** past weeks the baseline is taken from (daily series: the same weekday in each) */
  weeks: number;
  /** days either side of that weekday also counted as comparable */
  window: number;
  /** the period length the baseline steps back by (7 for a daily series with a weekly pattern) */
  season: number;
  /** the upper quantile the threshold sits at */
  q: number;
  /** a count below this never alarms, however unusual */
  minCount: number;
  /** periods running above the threshold before an alarm */
  persist: number;
  /** periods after an alarm before the same series may alarm again */
  cooldown: number;
  /** inside the cooldown, a count this many times the last alarm's count alarms again */
  worse: number;
  /** fewest baseline values a threshold needs */
  minBaseline: number;
}

export const DEFAULTS: DetectOpts = { weeks: 4, window: 1, season: 7, q: 0.995, minCount: 5, persist: 2, cooldown: 7, worse: 1.5, minBaseline: 6 };

export interface Threshold { mu: number; phi: number; upper: number; n: number; downweighted: number }

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The comparable past periods for the count at index t: same weekday `season` steps back, each with `window` neighbours. */
export function baselineOf(series: number[], t: number, o: Pick<DetectOpts, "weeks" | "window" | "season"> = DEFAULTS): number[] {
  const out: number[] = [];
  for (let k = 1; k <= o.weeks; k++) {
    const c = t - k * o.season;
    for (let d = -o.window; d <= o.window; d++) {
      const i = c + d;
      // the nearest day used is season - window back (t-6 for a daily series): a rise that began a few days ago never raises its own bar
      if (i >= 0 && i < series.length && Number.isFinite(series[i])) out.push(Math.max(0, series[i]));
    }
  }
  return out;
}

function fit(y: number[], w: number[]): { mu: number; phi: number } {
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = sw > 0 ? y.reduce((a, v, i) => a + w[i] * v, 0) / sw : 0;
  if (mu <= 0 || y.length < 2) return { mu: Math.max(0, mu), phi: 1 };
  const pearson = y.reduce((a, v, i) => a + (w[i] * (v - mu) ** 2) / mu, 0);
  return { mu, phi: Math.max(1, pearson / Math.max(1, sw - 1)) };
}

/** Anscombe residual of a quasi-Poisson count: 3/2 (y^2/3 - mu^2/3) / (sqrt(phi) mu^1/6). */
export function anscombe(y: number, mu: number, phi: number): number {
  if (mu <= 0) return y > 0 ? Infinity : 0;
  return (1.5 * (Math.cbrt(y * y) - Math.cbrt(mu * mu))) / (Math.sqrt(phi) * Math.pow(mu, 1 / 6));
}

/** The smallest y with P(Y <= y) >= q for a negative binomial of mean mu and variance phi * mu (Poisson at phi = 1). */
export function nbQuantile(q: number, mu: number, phi: number): number {
  if (!(mu > 0)) return 0;
  const poisson = phi <= 1 + 1e-9;
  // P(0) and the step P(y+1) / P(y): Poisson mu/(y+1); NB with size k = mu/(phi-1), p = k/(k+mu): (y+k)/(y+1) * (1-p)
  const k = poisson ? 0 : mu / (phi - 1);
  let p = poisson ? Math.exp(-mu) : Math.exp(k * Math.log(k / (k + mu)));
  let cdf = p, y = 0;
  // far tails in log space would be slower; counts here stay small enough for the plain recurrence
  const cap = Math.ceil(mu + 60 * Math.sqrt(mu * Math.max(1, phi)) + 60);
  while (cdf < q && y < cap) {
    p = poisson ? (p * mu) / (y + 1) : (p * (y + k)) / (y + 1) * (mu / (k + mu));
    y += 1;
    cdf += p;
  }
  return y;
}

/** The threshold for one period from its baseline values, with outbreak days in the baseline down-weighted. */
export function threshold(base: number[], o: Pick<DetectOpts, "q" | "minBaseline"> = DEFAULTS): Threshold | null {
  const n = base.length;
  if (n < o.minBaseline) return null;
  let w = base.map(() => 1);
  // the first residuals come from a robust start (median, and the MAD's variance), not the plain fit: with a dozen baseline days one
  // spike inflates the plain dispersion so much that its own residual stays under 2.58 and it is never down-weighted
  const sorted = [...base].sort((a, b) => a - b);
  const med = (xs: number[]) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
  const m0 = med(sorted);
  const mad = med(base.map((y) => Math.abs(y - m0)).sort((a, b) => a - b));
  let mu = m0 > 0 ? m0 : fit(base, w).mu;
  let phi = mu > 0 ? Math.max(1, (1.4826 * mad) ** 2 / mu) : 1;
  let downweighted = 0;
  for (let iter = 0; iter < 2; iter++) {
    const s = base.map((y) => anscombe(y, mu, phi));
    const raw = s.map((x) => (x > 2.58 ? 1 / (x * x) : 1));
    downweighted = raw.filter((x) => x < 1).length;
    const sum = raw.reduce((a, b) => a + b, 0);
    w = raw.map((x) => (x * n) / sum);
    ({ mu, phi } = fit(base, w));
  }
  return { mu: r2(mu), phi: r2(phi), upper: nbQuantile(o.q, mu, phi), n, downweighted };
}

export interface Alarm {
  /** the index of the alarmed period in the series */
  t: number;
  value: number;
  /** the baseline's fitted mean (what the period would usually see) */
  expected: number;
  upper: number;
  n: number;
  /** a repeat inside the cooldown because the count is clearly worse */
  worse: boolean;
}

export interface Detection { alarms: Alarm[]; above: boolean[]; thresholds: (Threshold | null)[] }

/** Walks the whole series once, period by period, as the watch would have seen it on each day. */
export function detect(series: number[], opts: Partial<DetectOpts> = {}): Detection {
  const o = { ...DEFAULTS, ...opts };
  const thresholds = series.map((_, t) => threshold(baselineOf(series, t, o), o));
  const above = series.map((y, t) => { const th = thresholds[t]; return !!th && y > th.upper && y >= o.minCount; });
  const alarms: Alarm[] = [];
  for (let t = 0; t < series.length; t++) {
    let run = true;
    for (let k = 0; k < o.persist; k++) if (t - k < 0 || !above[t - k]) { run = false; break; }
    if (!run) continue;
    const last = alarms[alarms.length - 1];
    const inCooldown = last && t - last.t <= o.cooldown;
    const worse = !!last && inCooldown && series[t] >= o.worse * last.value;
    if (inCooldown && !worse) continue;
    const th = thresholds[t] as Threshold;
    alarms.push({ t, value: series[t], expected: th.mu, upper: th.upper, n: th.n, worse });
  }
  return { alarms, above, thresholds };
}

/** The alarm on the latest period, if the series raises one there (what the live watch asks every few minutes). */
export function latestAlarm(series: number[], opts: Partial<DetectOpts> = {}): Alarm | null {
  if (!series.length) return null;
  const d = detect(series, opts);
  const a = d.alarms[d.alarms.length - 1];
  return a && a.t === series.length - 1 ? a : null;
}

/** The method in words, for the signal's evidence chip. */
export function methodOf(o: Partial<DetectOpts> = {}): string {
  const x = { ...DEFAULTS, ...o };
  return `Negative-binomial threshold (improved Farrington idea, Noufaily 2013): baseline the same weekday over the past ${x.weeks} weeks ` +
    `with ${x.window} day either side, past spikes down-weighted, upper ${Math.round(x.q * 1000) / 10} % quantile; ` +
    `alarm at ${x.minCount} or more, above the line ${x.persist} days running, ${x.cooldown}-day cooldown`;
}

/**
 * A rule a person can check by eye, used to judge the detector in the proactive replay: "count at least 2x its baseline and at
 * least 5". It is not the detector; it is the yardstick the replay reports the detector's alarms against.
 */
export function plainRule(value: number, expected: number, factor = 2, min = 5): { real: boolean; rule: string } {
  return { real: value >= min && value >= factor * expected, rule: `count >= ${factor}x baseline and >= ${min}` };
}

// ------------------------------------------------------------ stock series --

export interface Growth { value: number; before: number; growth: number; persisted: boolean }

/**
 * Growth of a stock (open past the deadline at the end of each day): not a count of events, so the detector above does not fit.
 * The rule: today against `lag` days before has grown by at least `min` and by at least `share` of the earlier value, and the day
 * before also stood above its own `lag`-days-earlier value (two days running). Null when it has not.
 */
export function stockGrowth(stock: number[], o: { lag?: number; min?: number; share?: number } = {}): Growth | null {
  const lag = o.lag ?? 7, min = o.min ?? 5, share = o.share ?? 0.2;
  const t = stock.length - 1;
  if (t - lag - 1 < 0) return null;
  const now = stock[t], before = stock[t - lag], prev = stock[t - 1], prevBefore = stock[t - 1 - lag];
  const grew = (a: number, b: number) => a - b >= min && a - b >= share * b;
  if (!grew(now, before)) return null;
  return { value: now, before, growth: now - before, persisted: grew(prev, prevBefore) };
}
