/**
 * Insight engine 2.0: the insight types the leading analytics tools compute (Tableau Pulse, Power BI quick
 * insights), each computed by code from the rows with a minimum count, said without a cause:
 *
 *   Drivers          the categories behind a change between two equal periods, and those pulling the other way
 *   Unusual change   the latest period outside the range of the 8+ before it (mean ± 2 sd)
 *   Change point     the level of a series moved and stayed (two segments, 3+ periods each)
 *   Steady share     a category's share stays the same period after period
 *   Seasonality      the same months high in each of 2+ years
 *   Correlation      two measures that move together (n ≥ 10, Spearman), an association, never a cause
 *   Target gap       target against achieved: the laggards, and the days to the deadline
 *   Outlier peer     units outside funnel limits (Spiegelhalter): fair comparison of units of different sizes;
 *                    a unit with fewer than 10 is "not enough data", never ranked
 *   Freshness        the data is stale, or a unit stopped reporting
 *
 * Every number in the text is computed here; the AI only orders and explains.
 */
import type { DRow } from "@/lib/studio/clean";
import { plan as mk, quantity } from "@/lib/studio/dashboard";
import type { Names } from "@/lib/studio/engine";
import type { Insight, Spec } from "@/lib/studio/types";
import { addDays, daysBetween, fmtDay, parseDate, spearman, todayIST, weekStart } from "@/lib/studio/values";

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A unit against the funnel limits of a proportion: inside, above, below, or too few to say. */
export interface FunnelPoint { key: string; n: number; x: number; p: number; flag: "above" | "below" | "inside" | "few" }
/**
 * Funnel limits (Spiegelhalter 2005): with the overall rate p, a unit of size n is unusual only outside
 * p ± z·√(p(1−p)/n), z = 3.09 (99.8%). Small units sit at the extremes by chance: under 10 they are "too few to say".
 */
export function funnel(units: { key: string; n: number; x: number }[], z = 3.09, minN = 10): FunnelPoint[] {
  const N = units.reduce((s, u) => s + u.n, 0), X = units.reduce((s, u) => s + u.x, 0);
  const p0 = N ? X / N : 0;
  return units.map((u) => {
    const p = u.n ? u.x / u.n : 0;
    if (u.n < minN) return { ...u, p, flag: "few" as const };
    const half = z * Math.sqrt((p0 * (1 - p0)) / u.n);
    return { ...u, p, flag: p > p0 + half ? "above" as const : p < p0 - half ? "below" as const : "inside" as const };
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

/** The best split of a series into two levels: where, the two means, and how clear (a t-like statistic). */
export function changePoint(xs: number[]): { at: number; a: number; b: number; t: number } | null {
  let best: { at: number; a: number; b: number; t: number } | null = null;
  for (let k = 3; k <= xs.length - 3; k++) {
    const l = xs.slice(0, k), r = xs.slice(k);
    const s = Math.sqrt((sd(l) ** 2) / l.length + (sd(r) ** 2) / r.length) || 1e-9;
    const t = Math.abs(mean(r) - mean(l)) / s;
    if (!best || t > best.t) best = { at: k, a: mean(l), b: mean(r), t };
  }
  return best;
}

interface Ctx { rows: DRow[]; spec: Spec; window: { from: string | null; to: string | null }; names: Names; today?: string }

/** The extra insights; each with its sample size (n) and how it was found, for the ranking and the card. */
export function computeInsights2(c: Ctx): (Insight & { n: number; method: string })[] {
  const { rows, spec, names } = c;
  const out: (Insight & { n: number; method: string })[] = [];
  const q = quantity(spec);
  const val = (r: DRow) => (q.col ? (typeof r[q.col] === "number" ? (r[q.col] as number) : 0) : 1);
  const plural = spec.entityPlural;
  const dated = rows.filter((r) => typeof r._d === "string");
  const end = c.window.to;
  const add = (x: Omit<Insight, "id" | "bars" | "series" | "plan" | "key" | "owner"> & Partial<Insight> & { n: number; method: string }) =>
    out.push({ id: `i2-${out.length + 1}`, bars: [], series: [], plan: null, key: null, owner: spec.deptName, ...x });

  // ---- weekly series (the basis of change, unusual change, change point)
  const weeks = new Map<string, number>();
  for (const r of dated) { const k = weekStart(String(r._d).slice(0, 10)); weeks.set(k, (weeks.get(k) ?? 0) + val(r)); }
  const wk = [...weeks.keys()].sort();
  // a level (storage, stock, a rate) is not added up week by week: its series insights are left to the level's own views
  const level = !!q.col && /level|storage|stock|balance|capacity|occupan|%|rate|percent/i.test(spec.columns.find((x) => x.key === q.col)?.header ?? "");
  // a week with nothing reported counts as zero for events; the week the data ends in is left out when it is not whole
  const whole = end ? (w: string) => addDays(w, 6) <= end.slice(0, 10) : () => true;
  const full = level ? [] : wk.length ? Array.from({ length: Math.max(1, Math.round(daysBetween(wk[0], wk[wk.length - 1]) / 7) + 1) }, (_, i) => addDays(wk[0], i * 7)) : [];
  const series = full.filter(whole).map((w) => weeks.get(w) ?? 0);
  const dims = spec.columns.filter((col) => col.role === "category" || col.role === "zone").slice(0, 3);

  // ---- Drivers and detractors: the last 4 weeks against the 4 before, by category
  if (series.length >= 8 && end) {
    // two equal windows of 28 days, ending on the data's last day
    const cut = addDays(end.slice(0, 10), -27), prevCut = addDays(cut, -28);
    const inA = (r: DRow) => String(r._d).slice(0, 10) >= prevCut && String(r._d).slice(0, 10) < cut, inB = (r: DRow) => String(r._d).slice(0, 10) >= cut && String(r._d).slice(0, 10) <= end.slice(0, 10);
    const A = dated.filter(inA).reduce((s, r) => s + val(r), 0), B = dated.filter(inB).reduce((s, r) => s + val(r), 0);
    if (A >= 20 && Math.abs(B - A) >= Math.max(5, A * 0.1)) {
      for (const d of dims) {
        const delta = new Map<string, number>();
        for (const r of dated) { const k = d.role === "zone" && typeof r._z === "number" ? names.zone(r._z) : r[d.key] == null ? null : String(r[d.key]); if (!k) continue; delta.set(k, (delta.get(k) ?? 0) + (inB(r) ? val(r) : inA(r) ? -val(r) : 0)); }
        const sorted = [...delta.entries()].sort((a, b) => b[1] - a[1]);
        const up = sorted.filter(([, v]) => v > 0).slice(0, 2), down = sorted.filter(([, v]) => v < 0).slice(-2).reverse();
        const lead = B > A ? up : down;
        if (!lead.length || Math.abs(lead[0][1]) < Math.abs(B - A) * 0.25) continue;
        const word = B > A ? "rise" : "fall";
        add({ label: "Drivers", tone: "high", score: 52, title: Math.abs(lead[0][1]) >= Math.abs(B - A) * 0.5 ? `${cap(lead[0][0])} accounts for most of the ${word}` : `${cap(lead[0][0])} is the largest part of the ${word}`, n: Math.round(A + B), method: "Last 4 weeks against the 4 before, change by category",
          metric: { value: `${B >= A ? "+" : "−"}${n(Math.abs(B - A))}`, caption: `${q.word}, last 4 weeks vs the 4 before` },
          text: `${cap(q.word)} went from ${n(A)} to ${n(B)} in the last 4 weeks. ${lead.map(([k, v]) => `${k} ${v >= 0 ? "+" : "−"}${n(Math.abs(v))}`).join(", ")} account for most of the ${word}${(B > A ? down : up).length ? `; ${(B > A ? down : up).map(([k, v]) => `${k} ${v >= 0 ? "+" : "−"}${n(Math.abs(v))}`).join(", ")} moved the other way` : ""}.`,
          bars: [...up, ...down].map(([label, value], i) => ({ label, value, hi: i === 0, fmt: `${value >= 0 ? "+" : "−"}${n(Math.abs(value))}` })),
          plan: mk({ id: "i2-drv", title: `${cap(q.word)} by ${d.label.toLowerCase()}, last 4 weeks`, chart: "hbar", by: d.role === "zone" ? "zone" : "col", byCol: d.role === "zone" ? null : d.key, agg: q.agg, col: q.col, filters: [{ col: "_d", op: "gte", values: [cut] }] }) });
        break;
      }
    }
  }

  // ---- Unusual change: the last full week outside the range of the 8+ weeks before it
  if (series.length >= 9) {
    const last = series[series.length - 1], before = series.slice(-9, -1);
    const m = mean(before), s = sd(before);
    if (m >= 5 && s > 0 && Math.abs(last - m) > 2 * s && Math.abs(last - m) >= 5)
      add({ label: "Unusual change", tone: last > m ? "high" : "info", score: 50, n: Math.round(before.reduce((a, b) => a + b, 0) + last), method: "Last week against the 8 weeks before (mean ± 2 sd)",
        title: `${cap(q.word)} unusually ${last > m ? "high" : "low"} last week`, metric: { value: n(last), caption: `last week; usual ${n(Math.max(0, m - 2 * s))}–${n(m + 2 * s)}` },
        text: `Last week had ${n(last)} ${q.word}, outside the usual range of ${n(Math.max(0, m - 2 * s))} to ${n(m + 2 * s)} set by the 8 weeks before (average ${n(m)}).`, series: series.slice(-12) });
  }

  // ---- Change point: a level that moved and stayed
  if (series.length >= 8) {
    const cp = changePoint(series);
    if (cp && cp.t >= 4 && Math.abs(cp.b - cp.a) >= Math.max(3, Math.abs(cp.a) * 0.3)) {
      const when = addDays(wk[0], cp.at * 7);
      add({ label: "Change point", tone: "info", score: 40, n: series.length, method: `Two-level split of ${series.length} weekly values (t = ${cp.t.toFixed(1)})`,
        title: `${cap(q.word)} moved to a new level from ${fmtDay(when, false)}`, metric: { value: `${n(cp.a)} → ${n(cp.b)}`, caption: "a week, before and after" },
        text: `From the week of ${fmtDay(when)} the weekly ${q.word} stayed at about ${n(cp.b)}, against about ${n(cp.a)} before: a change of level, not a one-week spike.`, series });
    }
  }

  // ---- Steady share: a category whose share holds over 4+ months
  const months = [...new Set(dated.map((r) => String(r._d).slice(0, 7)))].sort();
  if (months.length >= 4) for (const d of dims.filter((x) => x.role === "category").slice(0, 1)) {
    const tot = new Map<string, number>(), by = new Map<string, Map<string, number>>();
    for (const r of dated) { const m = String(r._d).slice(0, 7); const k = r[d.key] == null ? null : String(r[d.key]); tot.set(m, (tot.get(m) ?? 0) + val(r)); if (!k) continue; const x = by.get(k) ?? new Map(); x.set(m, (x.get(m) ?? 0) + val(r)); by.set(k, x); }
    for (const [k, x] of by) {
      const shares = months.map((m) => (tot.get(m) ? (x.get(m) ?? 0) / tot.get(m)! : 0));
      const avg = mean(shares);
      if (avg >= 0.2 && Math.max(...shares) - Math.min(...shares) <= 0.06 && months.every((m) => (tot.get(m) ?? 0) >= 20)) {
        add({ label: "Steady share", tone: "info", score: 24, n: months.reduce((s, m) => s + (tot.get(m) ?? 0), 0), method: `Monthly share over ${months.length} months`,
          title: `${k}: a steady ${Math.round(avg * 100)}% every month`, metric: { value: `${Math.round(avg * 100)}%`, caption: `of ${q.word}, each of ${months.length} months` },
          text: `${k} has been ${Math.round(Math.min(...shares) * 100)}–${Math.round(Math.max(...shares) * 100)}% of ${q.word} in each of the last ${months.length} months: a stable part of the load.` });
        break;
      }
    }
  }

  // ---- Seasonality: the same months high in 2+ years
  if (months.length >= 24) {
    const byYm = new Map<string, number>();
    for (const r of dated) { const k = String(r._d).slice(0, 7); byYm.set(k, (byYm.get(k) ?? 0) + val(r)); }
    const years = [...new Set(months.map((m) => m.slice(0, 4)))].filter((y) => months.filter((m) => m.startsWith(y)).length === 12);
    if (years.length >= 2) {
      const prof = years.map((y) => Array.from({ length: 12 }, (_, i) => byYm.get(`${y}-${String(i + 1).padStart(2, "0")}`) ?? 0));
      const rho = spearman(prof[prof.length - 1], prof[prof.length - 2]);
      if (rho >= 0.6) {
        const avg = Array.from({ length: 12 }, (_, i) => mean(prof.map((p) => p[i])));
        const top = avg.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 2).map((x) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.i]);
        add({ label: "Seasonality", tone: "info", score: 34, n: years.length * 12, method: `Month-of-year pattern across ${years.length} years (ρ ${rho.toFixed(2)})`,
          title: `${cap(q.word)} peak in ${top.join(" and ")} each year`, metric: { value: top.join(", "), caption: `peak months, ${years.length} years alike` },
          text: `In each of ${years.length} years ${q.word} were highest in ${top.join(" and ")}; the monthly pattern repeats (ρ ${rho.toFixed(2)}).` });
      }
    }
  }

  // ---- Correlation: two measures that move together (an association)
  const nums = spec.columns.filter((col) => col.role === "measure").slice(0, 6);
  let bestC: { a: string; b: string; rho: number; n: number } | null = null;
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
    const pairs = rows.map((r) => [r[nums[i].key], r[nums[j].key]]).filter((p): p is [number, number] => typeof p[0] === "number" && typeof p[1] === "number");
    if (pairs.length < 10 || new Set(pairs.map((p) => p[0])).size < 4 || new Set(pairs.map((p) => p[1])).size < 4) continue;
    const rho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    if (Math.abs(rho) >= 0.6 && Math.abs(rho) < 0.999 && (!bestC || Math.abs(rho) > Math.abs(bestC.rho))) bestC = { a: nums[i].label, b: nums[j].label, rho, n: pairs.length };
  }
  if (bestC) add({ label: "Correlation", tone: "info", score: 30, n: bestC.n, method: `Spearman rank correlation over ${bestC.n} rows`,
    title: `${bestC.a} and ${bestC.b.toLowerCase()} ${bestC.rho > 0 ? "rise together" : "move in opposite directions"}`, metric: { value: `ρ ${bestC.rho.toFixed(2)}`, caption: `${bestC.n} rows` },
    text: `Across ${n(bestC.n)} rows, ${bestC.a.toLowerCase()} and ${bestC.b.toLowerCase()} ${bestC.rho > 0 ? "go up together" : "move in opposite directions"} (ρ ${bestC.rho.toFixed(2)}). This is an association between the two columns, not proof that one changes the other.` });

  // ---- Target against achieved: the laggards and the days left
  const target = spec.columns.find((col) => col.role === "measure" && /\b(target|sanction|planned|plan|allotted|goal|length)\b/i.test(col.header));
  const done = spec.columns.find((col) => col.role === "measure" && col !== target && /\b(achiev|complet|done|desilt|actual|spent|installed|covered|progress)\w*/i.test(col.header));
  const unit = spec.columns.find((col) => ["zone", "ward", "place", "category", "taluk"].includes(col.role));
  if (target && done) {
    const units = new Map<string, { t: number; d: number }>();
    for (const r of rows) {
      const t = r[target.key], d = r[done.key];
      if (typeof t !== "number" || typeof d !== "number" || t <= 0) continue;
      const k = unit ? (unit.role === "zone" && typeof r._z === "number" ? names.zone(r._z) : String(r[unit.key] ?? "—")) : "All";
      const u = units.get(k) ?? { t: 0, d: 0 }; u.t += t; u.d += d; units.set(k, u);
    }
    const all = [...units.entries()].map(([k, u]) => ({ k, ...u, pc: u.d / u.t }));
    const T = all.reduce((s, u) => s + u.t, 0), D = all.reduce((s, u) => s + u.d, 0);
    const dl = spec.columns.find((col) => col.role === "date" && /\b(deadline|due|target date|end date|completion date)\b/i.test(col.header));
    const deadline = dl ? rows.map((r) => parseDate(r[dl.key])).filter((x): x is string => !!x).sort().pop() ?? null : null;
    const left = deadline ? daysBetween(c.today ?? todayIST(), deadline.slice(0, 10)) : null;
    if (all.length && T > 0 && D < T) {
      const lag = [...all].sort((a, b) => a.pc - b.pc).slice(0, 3);
      add({ label: "Target gap", tone: D / T < 0.6 ? "sev" : "high", score: 70 - Math.round((D / T) * 30), n: rows.length, method: `${done.label} against ${target.label.toLowerCase()}, by ${unit?.label.toLowerCase() ?? "total"}`,
        title: `${pct(D, T)}% of the target achieved${lag[0] && all.length > 1 ? `; ${lag[0].k} furthest behind` : ""}`, metric: { value: `${pct(D, T)}%`, caption: `${n(D)} of ${n(T)} ${target.unit ?? ""}`.trim() },
        text: `${n(D)} of the ${n(T)} targeted (${pct(D, T)}%) is achieved${left != null ? `, with ${left >= 0 ? `${n(left)} days to the deadline (${fmtDay(deadline!)})` : `the deadline (${fmtDay(deadline!)}) passed ${n(-left)} days ago`}` : ""}. Furthest behind: ${lag.map((u) => `${u.k} ${pct(u.d, u.t)}%`).join(", ")}.`,
        bars: [...all].sort((a, b) => a.pc - b.pc).slice(0, 8).map((u, i) => ({ label: u.k, value: Math.round(u.pc * 100), hi: i === 0, fmt: `${Math.round(u.pc * 100)}%` })) });
    }
  }

  // ---- Peers outside the funnel limits: the open share by zone, fairly compared
  const hasOpen = spec.openValues.length > 0;
  if (hasOpen) {
    const by = new Map<string, { n: number; x: number }>();
    for (const r of rows) { if (typeof r._z !== "number") continue; const k = names.zone(r._z); const u = by.get(k) ?? { n: 0, x: 0 }; u.n++; if (r._o === 1) u.x++; by.set(k, u); }
    const pts = funnel([...by.entries()].map(([key, u]) => ({ key, ...u })));
    const out1 = pts.filter((p) => p.flag === "above").sort((a, b) => b.p - a.p);
    const few = pts.filter((p) => p.flag === "few").length;
    const N = pts.reduce((s, p) => s + p.n, 0), X = pts.reduce((s, p) => s + p.x, 0);
    if (pts.length >= 5 && out1.length)
      add({ label: "Outlier peer", tone: "sev", score: 66, n: N, method: `Funnel limits (99.8%) on the open share by zone; ${few} zone${few === 1 ? "" : "s"} with under 10 not judged`,
        title: `${out1[0].key}: open share above what chance explains`, metric: { value: `${Math.round(out1[0].p * 100)}%`, caption: `open in ${out1[0].key} (district ${pct(X, N)}%)` },
        text: `${out1.map((p) => `${p.key} (${p.x} of ${p.n} open, ${Math.round(p.p * 100)}%)`).join(", ")} ${out1.length === 1 ? "is" : "are"} above the funnel limit for ${spec.entityPlural} ${hasOpen ? "still open" : ""}: the district rate is ${pct(X, N)}%, and the gap is larger than a zone of that size shows by chance.${few ? ` ${few} zone${few === 1 ? " has" : "s have"} too few ${spec.entityPlural} to judge.` : ""}`,
        bars: pts.filter((p) => p.flag !== "few").sort((a, b) => b.p - a.p).slice(0, 8).map((p) => ({ label: p.key, value: Math.round(p.p * 100), hi: p.flag === "above", fmt: `${Math.round(p.p * 100)}%` })) });
  }

  // ---- Freshness: stale data, a unit that stopped reporting
  const today = c.today ?? todayIST();
  if (end) {
    const age = daysBetween(end.slice(0, 10), today);
    const gaps = wk.slice(1).map((w, i) => daysBetween(wk[i], w));
    const usual = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 7;
    if (age > Math.max(14, usual * 2))
      // stale data is worth knowing; a unit that stopped reporting (below) is what needs acting on
      add({ label: "Freshness", tone: "info", score: 30, n: rows.length, method: `Newest date against today (${fmtDay(today)})`,
        title: `The newest data is ${n(age)} days old`, metric: { value: `${n(age)} days`, caption: `since ${fmtDay(end.slice(0, 10))}` },
        text: `The latest ${spec.entity} is dated ${fmtDay(end.slice(0, 10))}, ${n(age)} days ago. Decisions on this data should ask the department for the newer figures first.` });
    for (const d of dims.slice(0, 1)) {
      const last = new Map<string, string>(), count = new Map<string, number>();
      for (const r of dated) { const k = d.role === "zone" && typeof r._z === "number" ? names.zone(r._z) : r[d.key] == null ? null : String(r[d.key]); if (!k) continue; const x = String(r._d).slice(0, 10); if (!last.get(k) || x > last.get(k)!) last.set(k, x); count.set(k, (count.get(k) ?? 0) + 1); }
      const stopped = [...last.entries()].filter(([k, x]) => (count.get(k) ?? 0) >= 6 && daysBetween(x, end.slice(0, 10)) >= 28);
      if (stopped.length && stopped.length < last.size * 0.5)
        add({ label: "Freshness", tone: "high", score: 48, n: rows.length, method: `Each ${d.label.toLowerCase()}'s last report against the newest date`,
          title: `${stopped[0][0]} stopped reporting`, metric: { value: `${n(daysBetween(stopped[0][1], end.slice(0, 10)))} days`, caption: `since its last report` },
          text: `${stopped.slice(0, 3).map(([k, x]) => `${k} (last ${fmtDay(x)})`).join(", ")} reported regularly and then stopped, while the rest kept reporting to ${fmtDay(end.slice(0, 10))}. Missing reports look like zero: confirm before reading the totals.` });
    }
  }
  return out;
}
