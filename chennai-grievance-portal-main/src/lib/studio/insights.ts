/**
 * The Insight Analyst: mines a dataset for what a Collector can act on, not what the file looks like.
 *
 * Every angle the columns allow is computed from the rows (each with its numbers, a picture of the evidence and the
 * chart mark that opens its rows):
 *
 *   Backlog        how much is still open, and how many of the high-priority / high-severity items are among them
 *   Delay          how long the open items have waited, and which zone or type waits longest
 *   Turnaround     how long closed items took (first date to a closing / updated date), slowest and fastest
 *   Service gap    the zone or type whose open share is far above the rest; Bright spot: far below
 *   Hotspot        the zone with far more than the average zone
 *   Rising/Falling the last weeks against the weeks before, overall and the biggest mover in any zone or type
 *   Local pattern  a zone with far more of one type than its size suggests (zone x type, against the district mix)
 *   Concentration  a few types making most of the volume
 *   Magnitude      the main measure: where most of it is, which type runs highest on average
 *   Growth         a period table (district x year): the latest period against the one before, fastest movers
 *   Linked         the zone-by-zone / week-by-week link with the district's incidents (link.ts)
 *   Pattern        the day of the week most of it arrives on
 *   Anomaly / Data gap   values out of line, rows the map could not place
 *
 * Each gets a score (how much it should matter to the Collector); the brief (brief.ts, ai.ts) picks among them. No model
 * computes a number: the AI only chooses, orders and explains these.
 */
import type { DRow } from "@/lib/studio/clean";
import { plan as mk, quantity, yearly } from "@/lib/studio/dashboard";
import { formatOf, type Names } from "@/lib/studio/engine";
import { fmtNum, openPhrase, type Detective, type Filter, type Insight, type InsightLabel, type LinkResult, type Plan, type Spec, type Tone } from "@/lib/studio/types";
import { addDays, daysBetween, fmtDay, median } from "@/lib/studio/values";

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A way to split the rows: by zone, or by one of the file's own type columns. */
interface Dim { id: string; label: string; by: Plan["by"]; byCol: string | null; zone: boolean; of: (r: DRow) => string | number | null; name: (k: string | number) => string }

/** Type columns worth splitting by: mostly filled, a handful to a few dozen values, not one value everywhere. */
function dimensions(rows: DRow[], spec: Spec, names: Names): Dim[] {
  const out: Dim[] = [];
  const total = rows.length || 1;
  const placed = rows.filter((r) => typeof r._z === "number").length;
  const zones = new Set(rows.map((r) => r._z).filter((z) => z != null)).size;
  if (placed >= total * 0.3 && zones >= 4)
    out.push({ id: "zone", label: "zone", by: "zone", byCol: null, zone: true, of: (r) => (typeof r._z === "number" ? r._z : null), name: (k) => names.zone(Number(k)) });
  const BOOST = /type|categor|kind|depart|dept|work|item|disease|topic|subject|scheme|service|source|issue|nature|class|division|priority|commodity|section/i;
  const cands = spec.columns.filter((c) => c.role === "category" && c.key !== spec.panelBy).map((c) => {
    const counts = new Map<string, number>();
    let filled = 0;
    for (const r of rows) { const v = r[c.key]; if (v == null) continue; filled++; counts.set(String(v), (counts.get(String(v)) ?? 0) + 1); }
    const d = counts.size, top = Math.max(0, ...counts.values());
    const ok = filled >= total * 0.6 && d >= 2 && d <= 60 && top < filled * 0.95;
    const score = (BOOST.test(c.header) || BOOST.test(c.label) ? 3 : 0) + (d >= 4 && d <= 25 ? 2 : d === 2 ? -2 : 0) + filled / total;
    return { c, ok, score };
  }).filter((x) => x.ok).sort((a, b) => b.score - a.score).slice(0, 3);
  for (const { c } of cands)
    out.push({ id: c.key, label: c.label.toLowerCase(), by: "col", byCol: c.key, zone: false, of: (r) => (r[c.key] == null ? null : String(r[c.key])), name: (k) => String(k) });
  return out;
}

interface Group { k: string | number; w: number; c: number; o: number; ages: number[]; turn: number[]; m: number[] }

export function computeInsights(rows: DRow[], spec: Spec, det: Detective, link: LinkResult | null, window: { from: string | null; to: string | null }, names: Names): Insight[] {
  const out: Insight[] = [];
  if (rows.length < 3) return out;
  let seq = 0;
  const add = (x: Omit<Insight, "id" | "series" | "bars" | "plan" | "key" | "owner"> & Partial<Pick<Insight, "series" | "bars" | "plan" | "key" | "owner">>) =>
    out.push({ series: [], bars: [], plan: null, key: null, owner: spec.deptName ?? null, ...x, id: `i${++seq}` });

  const q = quantity(spec);
  const qf = formatOf(spec, mk({ id: "q", title: "", chart: "kpi", agg: q.agg, col: q.col }));
  const fq = (v: number) => fmtNum(Math.round(v), qf.format, qf.unit);
  const fv = (v: number) => fmtNum(Math.round(v), qf.format, null, true);
  const wOf = (r: DRow) => (q.col ? (typeof r[q.col] === "number" ? (r[q.col] as number) : 0) : 1);
  const measure = { agg: q.agg, col: q.col };
  const plural = spec.entityPlural;
  const dept = spec.deptName ?? null;
  const end = window.to;
  const panel = spec.panelBy ? spec.columns.find((c) => c.key === spec.panelBy) ?? null : null;
  const latestF: Filter[] = panel && end ? [{ col: "_d", op: "latest", values: [] }] : [];
  const now = panel && end ? rows.filter((r) => r._d === end) : rows;
  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  const { adj: ow, are } = openPhrase(spec);
  const openF: Filter[] = hasOpen ? [{ col: "_o", op: "open", values: [] }] : [];
  const word = hasOpen ? `${q.word} ${ow}` : q.word;
  const dims = dimensions(now, spec, names);
  const date = spec.columns.find((c) => c.role === "date") ?? null;
  const ageOf = (r: DRow) => (end && typeof r._d === "string" ? daysBetween(r._d.slice(0, 10), end) : null);
  // a second date that closes the record (updated, closed, completed): its gap from the first is the turnaround
  const closeCol = spec.columns.find((c) => c.role === "date" && c.key !== date?.key && /clos|resol|complet|dispos|finish|attend|updat|action|end/i.test(c.header));
  const turnOf = (r: DRow) => {
    if (!closeCol || typeof r._d !== "string" || typeof r[closeCol.key] !== "string") return null;
    const t = daysBetween(r._d.slice(0, 10), String(r[closeCol.key]).slice(0, 10));
    return t >= 0 && t < 3650 ? t : null;
  };
  const prim = spec.columns.find((c) => c.key === spec.primary && c.role === "measure") ?? null;
  const scoreLike = !!prim && (prim.agg === "avg" || /score|severity|rating|index|priority|risk|percent|rate/i.test(prim.header));

  // per dimension, per value: volume, rows, open rows, ages of the open ones, turnarounds of the closed ones, measure values
  const stats = new Map<string, Group[]>();
  for (const d of dims) {
    const g = new Map<string | number, Group>();
    for (const r of now) {
      const k = d.of(r);
      if (k == null) continue;
      const x = g.get(k) ?? g.set(k, { k, w: 0, c: 0, o: 0, ages: [], turn: [], m: [] }).get(k)!;
      x.w += wOf(r); x.c++;
      if (r._o === 1) { x.o++; const a = ageOf(r); if (a != null && a >= 0) x.ages.push(a); }
      else { const t = turnOf(r); if (t != null) x.turn.push(t); }
      if (prim && typeof r[prim.key] === "number") x.m.push(r[prim.key] as number);
    }
    stats.set(d.id, [...g.values()]);
  }
  const ownerOf = (d: Dim) => (d.zone ? "Zonal officers" : dept);
  const planOf = (d: Dim, id: string, title: string, filters: Filter[], extra: Partial<Plan> = {}) =>
    mk({ id, title, chart: "hbar", by: d.by, byCol: d.byCol, ...measure, filters: [...filters, ...latestF], limit: 15, ...extra });

  const total = now.length;
  const volume = now.reduce((s, r) => s + wOf(r), 0);

  // ------------------------------------------------------------ backlog
  const open = rows.filter((r) => r._o === 1);
  const rate = pct(open.length, rows.length);
  if (hasOpen) {
    const status = spec.columns.find((c) => c.role === "status");
    const bars = status ? topCounts(open, (r) => (r[status.key] == null ? null : String(r[status.key])), 4).map((b, i) => ({ ...b, hi: i === 0, fmt: n(b.value) })) : [];
    add({ label: "Backlog", tone: rate >= 30 ? "sev" : rate >= 12 ? "high" : "info", score: 52 + Math.min(28, rate),
      title: `${n(open.length)} ${plural} ${ow}`, metric: { value: n(open.length), caption: `${rate}% of ${n(rows.length)} ${ow}` },
      text: `${n(open.length)} of ${n(rows.length)} ${plural} (${rate}%) ${are}${status && bars[0] ? `; the largest group is "${bars[0].label}" with ${n(bars[0].value)}` : ""}.`,
      bars, plan: status ? mk({ id: "ins-open", title: `${cap(plural)} ${ow}, by status`, chart: "hbar", by: "col", byCol: status.key, filters: openF, limit: 10 }) : null });

    // the urgent ones among them: a priority / severity value that says "high", or the top fifth of a score
    for (const d of dims.filter((x) => !x.zone)) {
      const g = stats.get(d.id)!;
      const urgent = g.filter((x) => /\b(high|critical|urgent|emergency|severe|very high|p1|red)\b/i.test(String(x.k)));
      const c = urgent.reduce((s, x) => s + x.c, 0), o = urgent.reduce((s, x) => s + x.o, 0);
      if (urgent.length && c >= 10 && o >= 3) {
        const vals = urgent.map((x) => String(x.k));
        add({ label: "Backlog", tone: pct(o, c) >= rate ? "sev" : "high", score: 60 + Math.min(20, pct(o, c) / 2),
          title: `${n(o)} ${vals.join(" / ")} ${d.label} ${plural} ${ow}`, metric: { value: n(o), caption: `${vals.join(" / ")} ${d.label} ${ow}` },
          text: `${n(o)} of the ${n(c)} ${plural} marked ${vals.join(" or ")} ${d.label} (${pct(o, c)}%) ${are}, against ${rate}% across all ${plural}.`,
          bars: [{ label: `${vals[0]} ${d.label}`, value: pct(o, c), hi: true, fmt: `${pct(o, c)}%` }, { label: "All", value: rate, fmt: `${rate}%` }],
          plan: mk({ id: "ins-urgent", title: `${cap(plural)} ${ow}, ${vals.join(" / ")} ${d.label}`, chart: "table", filters: [...openF, { col: d.byCol!, op: "in", values: vals }], sort: "asc" }) });
        break;
      }
    }
    if (prim && scoreLike) {
      const xs = rows.map((r) => r[prim.key]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      const t = xs.length >= 30 ? xs[Math.floor(xs.length * 0.8)] : null;
      if (t != null && t > xs[0]) {
        const hi = rows.filter((r) => typeof r[prim.key] === "number" && (r[prim.key] as number) >= t);
        const ho = hi.filter((r) => r._o === 1).length;
        if (ho >= 5) add({ label: "Backlog", tone: pct(ho, hi.length) > rate ? "sev" : "high", score: 58 + Math.min(18, pct(ho, hi.length) / 2),
          title: `${n(ho)} high-${prim.label.toLowerCase()} ${plural} ${ow}`, metric: { value: n(ho), caption: `${prim.label.toLowerCase()} ${fmtNum(t, "dec")}+ and ${ow}` },
          text: `${n(ho)} of the ${n(hi.length)} ${plural} with ${prim.label.toLowerCase()} of ${fmtNum(t, "dec")} or more (the top fifth) ${are} (${pct(ho, hi.length)}%, against ${rate}% overall).`,
          bars: [{ label: "Top fifth", value: pct(ho, hi.length), hi: true, fmt: `${pct(ho, hi.length)}%` }, { label: "All", value: rate, fmt: `${rate}%` }],
          plan: mk({ id: "ins-hi", title: `High ${prim.label.toLowerCase()}, ${ow}`, chart: "table", filters: [...openF, { col: prim.key, op: "gte", values: [String(t)] }], sort: "asc" }) });
      }
    }
  }

  // ------------------------------------------------------------ delay (ageing of the open items)
  const ages = open.map(ageOf).filter((a): a is number => a != null && a >= 0);
  if (hasOpen && end && ages.length >= 5) {
    const med = Math.round(median(ages) ?? 0);
    const o30 = ages.filter((a) => a > 30).length, o90 = ages.filter((a) => a > 90).length, oldest = Math.max(...ages);
    const buckets = [["0–7 days", 0, 7], ["8–30 days", 8, 30], ["31–90 days", 31, 90], ["90+ days", 91, 1e9]] as const;
    if (o30 >= 3) add({ label: "Delay", tone: o30 >= ages.length * 0.25 ? "sev" : "high", score: 50 + Math.min(30, pct(o30, ages.length) / 1.5),
      title: `${n(o30)} ${plural} waiting over 30 days`, metric: { value: n(o30), caption: `waiting more than 30 days` },
      text: `${n(o30)} of the ${n(ages.length)} ${plural} ${ow} have waited more than 30 days${o90 ? ` and ${n(o90)} more than 90` : ""}; the median wait is ${med} days and the oldest ${oldest} days (as of ${fmtDay(end)}).`,
      bars: buckets.map(([l, a, b]) => { const v = ages.filter((x) => x >= a && x <= b).length; return { label: l, value: v, hi: a > 30, fmt: n(v) }; }),
      plan: mk({ id: "ins-old", title: `${cap(plural)} ${ow} for over 30 days`, chart: "table", filters: [...openF, { col: "_d", op: "lte", values: [addDays(end, -31)] }], sort: "asc" }) });
    // who waits longest
    for (const d of dims) {
      const g = stats.get(d.id)!.filter((x) => x.ages.length >= Math.max(8, ages.length * 0.03)).map((x) => ({ ...x, med: median(x.ages) ?? 0 })).sort((a, b) => b.med - a.med);
      const w = g[0];
      if (g.length >= 3 && w && w.med >= Math.max(med * 1.5, med + 7)) {
        add({ label: "Delay", tone: "high", score: 56, owner: ownerOf(d),
          title: `${d.name(w.k)}: the longest waits`, metric: { value: `${Math.round(w.med)} days`, caption: `median wait in ${d.name(w.k)}` },
          text: `${plural.charAt(0).toUpperCase() + plural.slice(1)} ${ow} in ${d.name(w.k)} (${d.label}) have waited a median ${Math.round(w.med)} days, against ${med} days across all ${n(ages.length)}.`,
          bars: g.slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: Math.round(x.med), hi: i === 0, fmt: `${Math.round(x.med)} d` })),
          plan: planOf(d, `ins-wait-${d.id}`, `${cap(plural)} ${ow}, by ${d.label}`, openF), key: w.k });
        break;
      }
    }
  }

  // ------------------------------------------------------------ turnaround (closed items)
  if (closeCol) {
    const turns = rows.filter((r) => r._o !== 1).map(turnOf).filter((t): t is number => t != null);
    if (turns.length >= 20) {
      const med = Math.round(median(turns) ?? 0);
      let done = false;
      for (const d of dims) {
        const g = stats.get(d.id)!.filter((x) => x.turn.length >= Math.max(10, turns.length * 0.03)).map((x) => ({ ...x, med: median(x.turn) ?? 0 })).sort((a, b) => b.med - a.med);
        if (g.length < 3) continue;
        const s = g[0], f = g[g.length - 1];
        if (s.med >= Math.max(f.med * 1.6, f.med + 3)) {
          add({ label: "Turnaround", tone: s.med >= med * 1.5 ? "high" : "info", score: 54, owner: ownerOf(d),
            title: `${d.name(s.k)} takes longest to close`, metric: { value: `${Math.round(s.med)} days`, caption: `median to close, ${d.name(s.k)}` },
            text: `Closed ${plural} took a median ${med} days from ${date?.label.toLowerCase() ?? "the first date"} to ${closeCol.label.toLowerCase()}; ${d.name(s.k)} took ${Math.round(s.med)} days and ${d.name(f.k)} ${Math.round(f.med)} days.`,
            bars: g.slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: Math.round(x.med), hi: i === 0, fmt: `${Math.round(x.med)} d` })),
            plan: planOf(d, `ins-turn-${d.id}`, `Closed ${plural}, by ${d.label}`, [{ col: "_o", op: "closed", values: [] }]), key: s.k });
          done = true;
          break;
        }
      }
      if (!done) add({ label: "Turnaround", tone: "info", score: 36, title: `Closed in a median ${med} days`, metric: { value: `${med} days`, caption: "median time to close" },
        text: `Closed ${plural} took a median ${med} days from ${date?.label.toLowerCase() ?? "the first date"} to ${closeCol.label.toLowerCase()} (${n(turns.length)} closed).` });
    }
  }

  // ------------------------------------------------------------ service gaps and bright spots (open share by zone / type)
  if (hasOpen) {
    let gaps = 0;
    for (const d of dims.filter((x) => !URGENT_COL.test(x.label))) {
      const g = stats.get(d.id)!.filter((x) => x.c >= Math.max(20, rows.length * 0.02)).map((x) => ({ ...x, r: pct(x.o, x.c) })).sort((a, b) => b.r - a.r);
      if (g.length < 3) continue;
      const w = g[0], b = g[g.length - 1];
      if (gaps < 2 && w.r >= rate * 1.4 && w.r - rate >= 8) {
        gaps++;
        add({ label: "Service gap", tone: w.r >= 2 * rate ? "sev" : "high", score: 60 + Math.min(20, (w.r - rate) / 2), owner: ownerOf(d),
          title: `${d.name(w.k)} lags behind`, metric: { value: `${w.r}%`, caption: `${ow} in ${d.name(w.k)}` },
          text: `${w.r}% of ${d.name(w.k)} ${plural} (${d.label}) ${are}, against ${rate}% overall: ${n(w.o)} of ${n(w.c)}.`,
          bars: g.slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: x.r, hi: i === 0, fmt: `${x.r}%` })),
          plan: planOf(d, `ins-gap-${d.id}`, `${cap(plural)} ${ow}, by ${d.label}`, openF), key: w.k });
      }
      if (b.r <= rate * 0.5 && rate - b.r >= 8 && b.c >= 30 && !out.some((x) => x.label === "Bright spot"))
        add({ label: "Bright spot", tone: "low", score: 34, owner: ownerOf(d),
          title: `${d.name(b.k)} keeps up`, metric: { value: `${b.r}%`, caption: `${ow} in ${d.name(b.k)}` },
          text: `Only ${b.r}% of ${d.name(b.k)} ${plural} (${d.label}) ${are}, against ${rate}% overall (${n(b.o)} of ${n(b.c)}).`,
          bars: [...g].reverse().slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: x.r, hi: i === 0, fmt: `${x.r}%` })),
          plan: planOf(d, `ins-good-${d.id}`, `${cap(plural)} ${ow}, by ${d.label}`, openF, { sort: "asc" }), key: b.k });
    }
  }

  // ------------------------------------------------------------ hotspot zone
  const zd = dims.find((d) => d.zone);
  if (zd) {
    const g = stats.get(zd.id)!.map((x) => ({ k: x.k, v: hasOpen ? x.o : x.w })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const sum = g.reduce((s, x) => s + x.v, 0), mean = sum / Math.max(1, g.length);
    if (g.length >= 4 && g[0].v >= 5) {
      const ratio = r1(g[0].v / mean), top3 = pct(g.slice(0, 3).reduce((s, x) => s + x.v, 0), sum);
      add({ label: "Hotspot", tone: ratio >= 2 ? "sev" : ratio >= 1.4 ? "high" : "info", score: 44 + Math.min(26, (ratio - 1) * 18), owner: "Zonal officers",
        title: `${zd.name(g[0].k)} carries the heaviest load`, metric: { value: hasOpen ? n(g[0].v) : fv(g[0].v), caption: `${word} in ${zd.name(g[0].k)}` },
        text: `${zd.name(g[0].k)} has the most ${word}: ${hasOpen ? n(g[0].v) : fq(g[0].v)}, ${ratio}× the average zone; the top 3 zones (${g.slice(0, 3).map((x) => zd.name(x.k)).join(", ")}) hold ${top3}%.`,
        bars: g.slice(0, 5).map((x, i) => ({ label: zd.name(x.k), value: x.v, hi: i === 0, fmt: hasOpen ? n(x.v) : fq(x.v) })),
        plan: planOf(zd, "ins-zone", `${cap(word)} by zone`, openF, hasOpen ? { agg: "count", col: null } : {}), key: g[0].k });
    }
  }

  // ------------------------------------------------------------ trend and movers
  const dated = rows.filter((r) => typeof r._d === "string");
  const span = window.from && end ? daysBetween(window.from, end) : 0;
  const win = !panel && dated.length >= 20 && !(steadyReports(dated) && !q.col) ? (span >= 56 ? 28 : span >= 14 ? 7 : 0) : 0;
  if (win && end) {
    const a0 = addDays(end, -(win - 1)), b0 = addDays(end, -(2 * win - 1));
    const inA = (r: DRow) => String(r._d).slice(0, 10) >= a0, inB = (r: DRow) => { const d = String(r._d).slice(0, 10); return d >= b0 && d < a0; };
    const A = dated.filter(inA).reduce((s, r) => s + wOf(r), 0), B = dated.filter(inB).reduce((s, r) => s + wOf(r), 0);
    const per = win === 28 ? "4 weeks" : "7 days";
    const weeks: number[] = [];
    for (let i = 11; i >= 0; i--) { const hi = addDays(end, -7 * i), lo = addDays(hi, -6); weeks.push(dated.filter((r) => { const d = String(r._d).slice(0, 10); return d >= lo && d <= hi; }).reduce((s, r) => s + wOf(r), 0)); }
    const series = weeks.slice(weeks.findIndex((v) => v > 0));
    const trendPlan = mk({ id: "ins-trend", title: `${cap(q.word)} over time`, chart: "area", by: "time", ...measure, unit: span <= 45 ? "day" : "week", sort: "key", limit: 60 });
    if (B >= 5) {
      const ch = Math.round(((A - B) / B) * 100);
      const what = q.col ? q.word : `new ${plural}`;
      if (Math.abs(ch) >= 15) add({ label: ch > 0 ? "Rising" : "Falling", tone: ch > 0 ? (ch >= 40 ? "sev" : "high") : "low", score: ch > 0 ? 48 + Math.min(30, ch / 3) : 34,
        title: `${cap(what)} ${ch > 0 ? "up" : "down"} ${Math.abs(ch)}%`, metric: { value: `${ch > 0 ? "+" : "−"}${Math.abs(ch)}%`, caption: `last ${per} vs the ${per} before` },
        text: `${cap(what)} ${ch > 0 ? "rose" : "fell"} ${Math.abs(ch)}% in the last ${per} (${fq(A)} against ${fq(B)} in the ${per} before, to ${fmtDay(end)}).`,
        series, plan: trendPlan });
      else add({ label: "Pattern", tone: "info", score: 24, title: `${cap(what)} holding steady`, metric: { value: fv(A), caption: `${q.word}, last ${per}` },
        text: `${cap(what)} held steady: ${fq(A)} in the last ${per} against ${fq(B)} in the ${per} before.`, series, plan: trendPlan });
    }
    // the biggest movers inside any zone or type
    const movers: { d: Dim; k: string | number; a: number; b: number; ch: number }[] = [];
    for (const d of dims) {
      const ga = new Map<string | number, number>(), gb = new Map<string | number, number>();
      for (const r of dated) {
        const k = d.of(r);
        if (k == null) continue;
        if (inA(r)) ga.set(k, (ga.get(k) ?? 0) + wOf(r)); else if (inB(r)) gb.set(k, (gb.get(k) ?? 0) + wOf(r));
      }
      for (const [k, a] of ga) {
        const b = gb.get(k) ?? 0;
        if (a >= Math.max(10, (A + B) * 0.004) && b >= 5 && a - b >= 6 && a >= b * 1.4) movers.push({ d, k, a, b, ch: Math.round(((a - b) / b) * 100) });
      }
    }
    movers.sort((x, y) => (y.a - y.b) * Math.min(3, y.ch / 40) - (x.a - x.b) * Math.min(3, x.ch / 40));
    for (const m of movers.slice(0, 2)) {
      add({ label: "Rising", tone: m.ch >= 80 ? "sev" : "high", score: 55 + Math.min(22, m.ch / 6), owner: ownerOf(m.d),
        title: `${m.d.name(m.k)} climbing fast`, metric: { value: `+${m.ch}%`, caption: `${m.d.name(m.k)}, last ${per}` },
        text: `${m.d.name(m.k)} (${m.d.label}): ${fq(m.a)} ${q.word} in the last ${per}, up ${m.ch}% from ${fq(m.b)} in the ${per} before.`,
        bars: [{ label: `Previous ${per}`, value: m.b, fmt: fq(m.b) }, { label: `Last ${per}`, value: m.a, hi: true, fmt: fq(m.a) }],
        plan: planOf(m.d, `ins-rise-${m.d.id}`, `${cap(q.word)} in the last ${per}, by ${m.d.label}`, [{ col: "_d", op: "gte", values: [a0] }]), key: m.k });
    }
  }

  // ------------------------------------------------------------ local pattern: zone x type
  const td = dims.find((d) => !d.zone);
  if (zd && td) {
    const cell = new Map<string, number>(), zt = new Map<number, number>(), tt = new Map<string, number>();
    let all = 0;
    for (const r of now) {
      const z = zd.of(r), t = td.of(r);
      if (z == null || t == null) continue;
      const w = wOf(r);
      cell.set(`${z}\u0000${t}`, (cell.get(`${z}\u0000${t}`) ?? 0) + w);
      zt.set(z as number, (zt.get(z as number) ?? 0) + w); tt.set(String(t), (tt.get(String(t)) ?? 0) + w); all += w;
    }
    const cells = [...cell.entries()].map(([k, v]) => {
      const [z, t] = k.split("\u0000");
      const exp = ((zt.get(Number(z)) ?? 0) * (tt.get(t) ?? 0)) / (all || 1);
      return { z: Number(z), t, v, exp, lift: exp ? v / exp : 0 };
    }).filter((x) => x.v >= 20 && x.v - x.exp >= 10 && x.lift >= 1.8 && x.v >= (zt.get(x.z) ?? 0) * 0.05 && (tt.get(x.t) ?? 0) < all * 0.6).sort((a, b) => (b.v - b.exp) - (a.v - a.exp));
    for (const x of cells.slice(0, 2)) {
      const zs = pct(x.v, zt.get(x.z) ?? 0), ds = pct(tt.get(x.t) ?? 0, all);
      add({ label: "Local pattern", tone: x.lift >= 3 ? "high" : "info", score: 50 + Math.min(18, (x.lift - 1.8) * 8), owner: "Zonal officers",
        title: `${x.t} clusters in ${zd.name(x.z)}`, metric: { value: `${r1(x.lift)}×`, caption: `the district rate of ${x.t}` },
        text: `In ${zd.name(x.z)}, ${x.t} (${td.label}) makes up ${zs}% of ${q.word} against ${ds}% across the district: ${fq(x.v)} where its size suggests ${fq(x.exp)} (${r1(x.lift)}×).`,
        bars: [{ label: zd.name(x.z), value: zs, hi: true, fmt: `${zs}%` }, { label: "District", value: ds, fmt: `${ds}%` }],
        plan: mk({ id: `ins-loc-${x.z}`, title: `${x.t} by zone`, chart: "hbar", by: "zone", ...measure, filters: [{ col: td.byCol!, op: "in", values: [x.t] }, ...latestF], limit: 15 }), key: x.z });
    }
  }

  // ------------------------------------------------------------ concentration of types
  if (td) {
    const g = stats.get(td.id)!.map((x) => ({ k: x.k, v: x.w })).sort((a, b) => b.v - a.v);
    const sum = g.reduce((s, x) => s + x.v, 0);
    let acc = 0, k = 0;
    while (k < g.length && acc < sum * 0.8) acc += g[k++].v;
    const lead = pct(g[0]?.v ?? 0, sum);
    if (g.length >= 5 && k <= Math.max(2, Math.ceil(g.length * 0.35)))
      add({ label: "Concentration", tone: "info", score: 40 + Math.min(12, g.length - k), owner: dept,
        title: `${k} ${td.label}s make ${pct(acc, sum)}% of the volume`, metric: { value: `${k} of ${g.length}`, caption: `${td.label}s = ${pct(acc, sum)}% of ${q.word}` },
        text: `${k} of ${g.length} ${td.label}s account for ${pct(acc, sum)}% of ${q.word}; ${g[0].k} alone is ${lead}% (${fq(g[0].v)}).`,
        bars: g.slice(0, 5).map((x, i) => ({ label: String(x.k), value: x.v, hi: i === 0, fmt: fq(x.v) })),
        plan: planOf(td, "ins-mix", `${cap(q.word)} by ${td.label}`, []), key: g[0].k });
  }

  // ------------------------------------------------------------ the main measure
  if (prim && prim.key !== q.col) {
    const { format, unit } = formatOf(spec, mk({ id: "m", title: "", chart: "kpi", agg: "sum", col: prim.key }));
    const f = (v: number) => fmtNum(v, scoreLike ? "dec" : format, scoreLike ? null : unit);
    const xs = now.map((r) => r[prim.key]).filter((v): v is number => typeof v === "number");
    const overall = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    for (const d of dims.slice(0, 3)) {
      const g = stats.get(d.id)!.filter((x) => x.m.length >= Math.max(15, xs.length * 0.02));
      if (g.length < 3) continue;
      if (scoreLike) {
        const s = g.map((x) => ({ k: x.k, v: x.m.reduce((a, b) => a + b, 0) / x.m.length })).sort((a, b) => b.v - a.v);
        if (s[0].v >= overall * 1.15) {
          add({ label: "Magnitude", tone: "high", score: 46, owner: ownerOf(d), title: `${d.name(s[0].k)} runs highest on ${prim.label.toLowerCase()}`,
            metric: { value: f(s[0].v), caption: `average ${prim.label.toLowerCase()}` },
            text: `${d.name(s[0].k)} (${d.label}) has the highest average ${prim.label.toLowerCase()}: ${f(s[0].v)} against ${f(overall)} overall.`,
            bars: s.slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: r1(x.v), hi: i === 0, fmt: f(x.v) })),
            plan: planOf(d, `ins-avg-${d.id}`, `Average ${prim.label.toLowerCase()} by ${d.label}`, [], { agg: "avg", col: prim.key }), key: s[0].k });
          break;
        }
      } else {
        const s = g.map((x) => ({ k: x.k, v: x.m.reduce((a, b) => a + b, 0) })).sort((a, b) => b.v - a.v);
        const sum = s.reduce((a, x) => a + x.v, 0);
        if (sum > 0) {
          add({ label: "Magnitude", tone: "info", score: 42 + Math.min(10, pct(s[0].v, sum) / 5), owner: ownerOf(d), title: `${d.name(s[0].k)} holds ${pct(s[0].v, sum)}% of ${prim.label.toLowerCase()}`,
            metric: { value: fmtNum(s[0].v, format, unit, true), caption: `${prim.label.toLowerCase()}, ${d.name(s[0].k)}` },
            text: `Total ${prim.label.toLowerCase()}: ${fmtNum(sum, format, unit)}; ${d.name(s[0].k)} (${d.label}) accounts for ${fmtNum(s[0].v, format, unit)} (${pct(s[0].v, sum)}%).`,
            bars: s.slice(0, 5).map((x, i) => ({ label: d.name(x.k), value: x.v, hi: i === 0, fmt: fmtNum(x.v, format, unit, true) })),
            plan: planOf(d, `ins-sum-${d.id}`, `Total ${prim.label.toLowerCase()} by ${d.label}`, [], { agg: "sum", col: prim.key }), key: s[0].k });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ a period table: growth
  if (panel && end) {
    const periods = [...new Set(rows.map((r) => r._d).filter((d): d is string => typeof d === "string"))].sort();
    const yrs = yearly(rows);
    const gap = periods.length >= 2 ? daysBetween(periods[periods.length - 2], end) : 0;
    const pn = (d: string) => (yrs ? d.slice(0, 4) : gap >= 6 && gap <= 8 ? `the week to ${fmtDay(d)}` : gap >= 28 && gap <= 31 ? fmtDay(d.slice(0, 7)) : fmtDay(d));
    if (periods.length >= 2) {
      const prev = periods[periods.length - 2], first = periods[0];
      const tot = (d: string) => rows.filter((r) => r._d === d).reduce((s, r) => s + wOf(r), 0);
      const a = tot(end), b = tot(prev), f0 = tot(first);
      if (b > 0) {
        const ch = r1(((a - b) / b) * 100), long = f0 > 0 ? Math.round(((a - f0) / f0) * 100) : null;
        add({ label: "Growth", tone: "info", score: 46, title: `${cap(q.word)} ${ch >= 0 ? "up" : "down"} ${Math.abs(ch)}% in ${pn(end)}`,
          metric: { value: `${ch >= 0 ? "+" : "−"}${Math.abs(ch)}%`, caption: `${pn(prev)} → ${pn(end)}` },
          text: `${cap(q.word)}: ${fq(a)} in ${pn(end)}, ${ch >= 0 ? "up" : "down"} ${Math.abs(ch)}% from ${fq(b)} in ${pn(prev)}${long != null ? `; ${long >= 0 ? "up" : "down"} ${Math.abs(long)}% since ${pn(first)}` : ""}.`,
          plan: mk({ id: "ins-growth", title: `${cap(q.word)} over time`, chart: "bar", by: "time", ...measure, unit: yrs ? "year" : "month", sort: "key", limit: 60 }) });
      }
      // fastest movers among the larger items
      const cur = new Map<string, number>(), old = new Map<string, number>();
      for (const r of rows) {
        const k = r[panel.key];
        if (k == null) continue;
        if (r._d === end) cur.set(String(k), (cur.get(String(k)) ?? 0) + wOf(r)); else if (r._d === prev) old.set(String(k), (old.get(String(k)) ?? 0) + wOf(r));
      }
      const sizes = [...cur.values()].sort((x, y) => x - y), cut = sizes[Math.floor(sizes.length / 2)] ?? 0;
      const mv = [...cur.entries()].filter(([k, v]) => v >= cut && (old.get(k) ?? 0) > 0).map(([k, v]) => ({ k, v, b: old.get(k)!, ch: r1(((v - old.get(k)!) / old.get(k)!) * 100) })).sort((x, y) => y.ch - x.ch);
      if (mv.length >= 4) {
        const up = mv[0], dn = mv[mv.length - 1];
        add({ label: "Growth", tone: "high", score: 50, title: `${up.k} grew fastest`, metric: { value: `+${up.ch}%`, caption: `${up.k}, ${pn(prev)} → ${pn(end)}` },
          text: `Among the larger ${panel.label.toLowerCase()}s, ${up.k} grew fastest from ${pn(prev)} to ${pn(end)}: up ${up.ch}% (${fq(up.b)} to ${fq(up.v)}); ${dn.k} moved least: ${dn.ch >= 0 ? "up" : "down"} ${Math.abs(dn.ch)}%.`,
          bars: mv.slice(0, 5).map((x, i) => ({ label: x.k, value: x.ch, hi: i === 0, fmt: `${x.ch >= 0 ? "+" : ""}${x.ch}%` })),
          plan: mk({ id: "ins-pmove", title: `${cap(panel.label)}s in ${pn(end)}`, chart: "hbar", by: "col", byCol: panel.key, ...measure, filters: latestF, limit: 15 }), key: up.k });
      }
      const lead = [...cur.entries()].sort((x, y) => y[1] - x[1]);
      const sumC = lead.reduce((s, [, v]) => s + v, 0);
      if (lead.length >= 5)
        add({ label: "Concentration", tone: "info", score: 44, title: `${lead[0][0]} leads in ${pn(end)}`, metric: { value: fv(lead[0][1]), caption: `${lead[0][0]}, ${pn(end)}` },
          text: `In ${pn(end)}, ${lead[0][0]} leads with ${fq(lead[0][1])} (${pct(lead[0][1], sumC)}%); the top 5 ${panel.label.toLowerCase()}s hold ${pct(lead.slice(0, 5).reduce((s, [, v]) => s + v, 0), sumC)}%.`,
          bars: lead.slice(0, 5).map(([k, v], i) => ({ label: k, value: v, hi: i === 0, fmt: fq(v) })),
          plan: mk({ id: "ins-plead", title: `Top ${panel.label.toLowerCase()}s, ${pn(end)}`, chart: "hbar", by: "col", byCol: panel.key, ...measure, filters: latestF, limit: 15 }), key: lead[0][0] });
    }
  }

  // ------------------------------------------------------------ the district's incidents
  if (link && link.mode === "place" && link.strength !== "none") {
    const o = link.overlap;
    add({ label: "Linked", tone: link.strength === "strong" ? "sev" : "high", score: link.strength === "strong" ? 64 : link.strength === "moderate" ? 52 : 38, owner: dept,
      title: `Lines up with ${link.incLabel.toLowerCase()}`, metric: { value: link.rho.toFixed(2), caption: `rank correlation, ${link.n} zones` },
      text: `Zones with more ${link.dsLabel.replace(/\bneeds\b/, "needing")} also have more ${link.incLabel.toLowerCase()} (${link.strength} link, rank correlation ${link.rho.toFixed(2)} over ${link.n} zones)${o.length ? `; hotspots in both: ${o.slice(0, 3).map((x) => x.name).join(", ")}` : ""}${link.open ? `; ${n(link.open)} of those ${n(link.incidents)} incidents are still open` : ""}.`,
      bars: o.slice(0, 4).map((x, i) => ({ label: x.name, value: x.ds, hi: i === 0, fmt: `${n(x.ds)} · ${n(x.inc)}` })) });
  } else if (link?.time && link.time.rho >= 0.4) {
    add({ label: "Linked", tone: "high", score: 46, title: `Moves with ${link.time.label.toLowerCase()} incidents`, metric: { value: link.time.rho.toFixed(2), caption: `weekly rank correlation` },
      text: `Week by week, ${link.dsLabel} moved with ${link.time.label.toLowerCase()} incidents${link.time.lag ? ` ${link.time.lag} ${link.time.lag === 1 ? "week" : "weeks"} earlier` : ""} (rank correlation ${link.time.rho.toFixed(2)} over ${link.time.weeks} weeks).`,
      series: link.time.series.map((s) => s.ds) });
  }

  // ------------------------------------------------------------ day-of-week rhythm
  const days = dated.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r._d)));
  if (!panel && days.length >= 300 && span >= 28 && !yearly(rows)) {
    const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const c = new Array(7).fill(0);
    for (const r of days) { const s = String(r._d); c[new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay()] += wOf(r); }
    const sum = c.reduce((a, b) => a + b, 0), hi = c.indexOf(Math.max(...c)), lo = c.indexOf(Math.min(...c));
    if (c[lo] > 0 && c[hi] / c[lo] >= 1.5)
      add({ label: "Pattern", tone: "info", score: 28, title: `${DOW[hi]}s are the busiest`, metric: { value: `${pct(c[hi], sum)}%`, caption: `of ${q.word} on ${DOW[hi]}s` },
        text: `${DOW[hi]}s bring ${pct(c[hi], sum)}% of ${q.word}; ${DOW[lo]}s only ${pct(c[lo], sum)}%.`,
        bars: [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: DOW[i].slice(0, 3), value: c[i], hi: i === hi, fmt: fq(c[i]) })) });
  }

  // ------------------------------------------------------------ values to check, and blind spots
  const outl = det.issues.find((i) => i.kind === "outlier");
  if (outl) add({ label: "Anomaly", tone: "info", score: 30, title: `${outl.count} ${outl.count === 1 ? "value" : "values"} far out of line`, metric: { value: n(outl.count), caption: "values to verify" },
    text: `${n(outl.count)} ${outl.count === 1 ? "value is" : "values are"} far above the rest in ${outl.label.split(":")[0]} (largest ${outl.examples[0] ?? ""}); worth checking before relying on totals.` });
  const hasPlace = spec.columns.some((c) => ["place", "ward", "zone", "taluk", "lat"].includes(c.role));
  const placed = rows.filter((r) => r._z != null).length;
  if (hasPlace && placed < rows.length * 0.8 && rows.length - placed >= 10)
    add({ label: "Data gap", tone: "low", score: 26, title: `${pct(rows.length - placed, rows.length)}% of ${plural} not on the map`, metric: { value: n(rows.length - placed), caption: "rows without a usable place" },
      text: `${n(rows.length - placed)} of ${n(rows.length)} ${plural} (${pct(rows.length - placed, rows.length)}%) have no place the map could match${det.unplaced[0] ? `, such as "${det.unplaced[0].v}"` : ""}; zone figures leave them out.` });
  const missingDates = date ? rows.filter((r) => r._d == null).length : 0;
  if (missingDates >= Math.max(10, rows.length * 0.1))
    add({ label: "Data gap", tone: "low", score: 22, title: `${pct(missingDates, rows.length)}% without a date`, metric: { value: n(missingDates), caption: "rows without a readable date" },
      text: `${n(missingDates)} of ${n(rows.length)} ${plural} have no readable ${date!.label.toLowerCase()}; trends and waiting times leave them out.` });

  // a file too plain for any of the above still says what it holds
  if (!out.length || out.every((x) => x.score < 30))
    add({ label: "Concentration", tone: "info", score: 20, title: `${n(total)} ${plural}`, metric: { value: fv(volume), caption: q.word },
      text: `${fq(volume)} ${q.word}${q.col ? ` in ${n(total)} rows` : ""}${window.from && end ? ` from ${fmtDay(window.from)} to ${fmtDay(end)}` : ""}.` });
  return out.sort((a, b) => b.score - a.score);
}

const URGENT_COL = /priority|urgency|severity|risk/i;

/** Rows arriving at a steady rate (about as many on every report date): a snapshot or a return, not events. */
function steadyReports(rows: DRow[]): boolean {
  const per = new Map<string, number>();
  for (const r of rows) { const k = String(r._d).slice(0, 10); per.set(k, (per.get(k) ?? 0) + 1); }
  const c = [...per.values()];
  if (c.length < 4) return false;
  const mean = c.reduce((a, b) => a + b, 0) / c.length;
  const sd = Math.sqrt(c.reduce((a, b) => a + (b - mean) ** 2, 0) / c.length);
  return mean >= 3 && sd / mean < 0.25;
}

function topCounts(rows: DRow[], of: (r: DRow) => string | null, k: number): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const v = of(r); if (v != null) m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([label, value]) => ({ label, value }));
}

/** The insights worth a model's attention: the strongest, at most two of a kind. */
export function shortlist(xs: Insight[], max = 14): Insight[] {
  const per = new Map<InsightLabel, number>();
  const out: Insight[] = [];
  for (const x of [...xs].sort((a, b) => b.score - a.score)) {
    const c = per.get(x.label) ?? 0;
    if (c >= 2) continue;
    per.set(x.label, c + 1);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

export const toneRank: Record<Tone, number> = { sev: 0, high: 1, info: 2, low: 3, violet: 4, teal: 5 };
