/**
 * What stands out, by method and not by opinion. Each function returns { value, n, method, caveat }, with the caveat in both
 * languages, so a figure is never spoken without what it rests on. Pure.
 *   modified z-score (median and MAD): which of these is unlike the rest
 *   c-chart (counts per interval, limits at c-bar +/- 3 sqrt(c-bar)): is the latest count outside what chance allows
 *   Theil-Sen slope with a Mann-Kendall test: which way a series is going, and whether that is more than noise
 * insight.ts and explain.ts on the console read a single series for its peak and its change; these add the tests.
 */
export interface Caveat { en: string; ta: string }
export interface Stat<T> { value: T; n: number; method: string; caveat: Caveat }

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface Outlier { key: string; value: number; z: number; median: number }
/**
 * Modified z-score: 0.6745 (x - median) / MAD, |z| >= 3.5 flagged (Iglewicz and Hoaglin). When over half the values are equal
 * MAD is 0, and the mean absolute deviation stands in, scaled by 1.2533. That scale is tiny when nearly all are equal (one severe
 * case against fourteen zones with none gives z = 12), so it flags only a gap beyond what chance gives a count: 3 sqrt(median), at least 3.
 */
export function modifiedZ(items: { key: string; value: number }[], threshold = 3.5): Stat<Outlier[]> {
  const xs = items.map((x) => x.value), n = xs.length;
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  const meanAd = xs.reduce((a, x) => a + Math.abs(x - med), 0) / Math.max(1, n);
  const minGap = mad ? 0 : Math.max(3, 3 * Math.sqrt(Math.abs(med)));
  const flagged = n < 4 || (!mad && !meanAd) ? [] : items
    .map((it) => ({ key: it.key, value: it.value, median: med, z: r2(mad ? (0.6745 * (it.value - med)) / mad : (it.value - med) / (1.2533 * meanAd)) }))
    .filter((o) => Math.abs(o.z) >= threshold && Math.abs(o.value - med) >= minGap).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { value: flagged, n, method: `Modified z-score (median ${r2(med)}, ${mad ? `MAD ${r2(mad)}` : `MAD is 0, so mean deviation ${r2(meanAd)}`}), flagged at ${threshold}`,
    caveat: n < 8 ? { en: `Only ${n} values: read this as a hint.`, ta: `${n} மதிப்புகள் மட்டுமே: இதை ஒரு குறிப்பாக மட்டும் கொள்ளுங்கள்.` }
      : { en: "It says which differ from the rest, not why.", ta: "எவை மற்றவற்றிலிருந்து வேறுபடுகின்றன என்று மட்டுமே சொல்கிறது, ஏன் என்று அல்ல." } };
}

export interface CChart { center: number; ucl: number; lcl: number; signals: number[]; latest: number; latestOut: boolean }
/** c-chart over counts per interval, the limits from every interval but the last, so the latest does not widen its own limits. */
export function cChart(counts: number[]): Stat<CChart> {
  const base = counts.length > 4 ? counts.slice(0, -1) : counts;
  const c = base.reduce((a, b) => a + b, 0) / Math.max(1, base.length);
  const ucl = c + 3 * Math.sqrt(c), lcl = Math.max(0, c - 3 * Math.sqrt(c));
  const signals = counts.map((v, i) => (v > ucl || v < lcl ? i : -1)).filter((i) => i >= 0);
  const latest = counts[counts.length - 1] ?? 0;
  return { value: { center: r2(c), ucl: r2(ucl), lcl: r2(lcl), signals, latest, latestOut: latest > ucl || latest < lcl }, n: counts.length,
    method: `c-chart: mean ${r2(c)} a period, limits ${r2(lcl)} to ${r2(ucl)}`,
    caveat: counts.length < 8 ? { en: `Only ${counts.length} periods, so the limits are rough.`, ta: `${counts.length} காலங்கள் மட்டுமே, எனவே வரம்புகள் தோராயமானவை.` }
      : { en: "A point outside the limits is unusual for this series; it does not say the cause.", ta: "வரம்புக்கு வெளியே உள்ள புள்ளி இந்தத் தொடருக்கு அசாதாரணம்; காரணத்தைச் சொல்லாது." } };
}

export interface TrendStat { slope: number; direction: "rising" | "falling" | "flat"; s: number; z: number; p: number; significant: boolean }
/** Theil-Sen slope (median of pairwise slopes) and a Mann-Kendall test with the tie correction and a normal approximation. */
export function trendOf(series: number[]): Stat<TrendStat> {
  const n = series.length;
  const slopes: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { slopes.push((series[j] - series[i]) / (j - i)); s += Math.sign(series[j] - series[i]); }
  const ties = new Map<number, number>();
  for (const v of series) ties.set(v, (ties.get(v) ?? 0) + 1);
  let tieSum = 0;
  for (const t of ties.values()) tieSum += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieSum) / 18;
  const z = variance > 0 ? (s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0) : 0;
  const p = 2 * (1 - phi(Math.abs(z)));
  const slope = median(slopes);
  const significant = n >= 8 && p < 0.05;
  return { value: { slope: r2(slope), direction: !significant ? "flat" : slope > 0 ? "rising" : slope < 0 ? "falling" : "flat", s, z: r2(z), p: r2(p), significant }, n,
    method: `Theil-Sen slope with a Mann-Kendall test (p ${p < 0.01 ? "< 0.01" : r2(p)})`,
    caveat: n < 8 ? { en: `Only ${n} points: too few to call a trend.`, ta: `${n} புள்ளிகள் மட்டுமே: போக்கு என்று சொல்ல இவை போதாது.` }
      : significant ? { en: "The direction is more than noise; the slope is approximate.", ta: "இந்தத் திசை சத்தத்தை விட அதிகம்; சரிவு தோராயமானது." }
        : { en: "No clear direction: the changes are within noise.", ta: "தெளிவான திசை இல்லை: மாற்றங்கள் சத்தத்துக்குள் உள்ளன." } };
}

/** the standard normal CDF (Abramowitz and Stegun 26.2.17) */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - q : q;
}
