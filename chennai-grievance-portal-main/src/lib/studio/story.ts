/**
 * The story of a dataset: facts computed from the rows and the link (each a sentence with its numbers and the chart
 * that shows it), a rules-written story from those facts, and the check that lets an AI-written story through only
 * when every number in it appears in the facts it cites.
 */
import type { DRow } from "@/lib/studio/clean";
import { formatOf, runPlan, type Names } from "@/lib/studio/engine";
import { plan, quantity, yearly } from "@/lib/studio/dashboard";
import { fmtNum, type Detective, type Fact, type Finding, type LinkResult, type Spec, type Story, type Tone } from "@/lib/studio/types";
import { addDays, fmtDay } from "@/lib/studio/values";

const n = (x: number) => x.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function buildFacts(rows: DRow[], spec: Spec, det: Detective, link: LinkResult | null, window: { from: string | null; to: string | null }, names: Names): Fact[] {
  const facts: Fact[] = [];
  const add = (kind: Fact["kind"], text: string, tone: Tone, p: Fact["plan"] = null) => facts.push({ id: `f${facts.length + 1}`, kind, text, tone, plan: p });
  const total = rows.length;
  if (!total) return facts;
  // what is counted: rows, or a periodic return's cases (spec.weight)
  const q = quantity(spec);
  const wOf = (r: DRow) => (q.col ? (typeof r[q.col] === "number" ? (r[q.col] as number) : 0) : 1);
  const sumOf = (rs: DRow[]) => Math.round(rs.reduce((s, r) => s + wOf(r), 0));
  const measure = { agg: q.agg, col: q.col };
  // a period table (district x year) is read in its latest period
  const panel = spec.panelBy ? spec.columns.find((c) => c.key === spec.panelBy) ?? null : null;
  const years = yearly(rows);
  const lastD = window.to;
  const now = panel && lastD ? rows.filter((r) => r._d === lastD) : rows;
  const latestF = panel && lastD ? [{ col: "_d", op: "latest" as const, values: [] }] : [];
  const when = panel && lastD ? ` in ${years ? lastD.slice(0, 4) : fmtDay(lastD)}` : "";
  const periodName = (d: string) => (years ? d.slice(0, 4) : fmtDay(d));
  const zones = new Set(rows.map((r) => r._z).filter((z) => z != null)).size;
  // "across 3 of 15 zones" only when most rows are placed; otherwise say how many name a Chennai place at all
  const placedN = rows.filter((r) => r._z != null).length;
  const where = zones ? (placedN >= total * 0.8 ? ` across ${zones} of 15 zones` : `; ${n(placedN)} of them name a place in Chennai (${zones} ${zones === 1 ? "zone" : "zones"})`) : "";
  const span = window.from && window.to ? ` from ${fmtDay(window.from)} to ${fmtDay(window.to)}` : "";
  if (panel && lastD && window.from) {
    const periods = new Set(rows.map((r) => r._d).filter(Boolean)).size;
    const items = new Set(rows.map((r) => r[panel.key]).filter((v) => v != null)).size;
    add("size", `${n(items)} ${panel.label.toLowerCase()}s over ${periods} ${years ? "years" : "periods"}, ${periodName(window.from)} to ${periodName(lastD)}; ${q.word}${when}: ${n(sumOf(now))}.`, "info");
  } else add("size", q.col
    ? `${n(sumOf(rows))} ${q.word} in ${n(total)} reports${span}${where}.`
    : `${n(total)} ${total === 1 ? spec.entity : spec.entityPlural}${span}${where}.`, "info");

  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  const ow = spec.openWord || "still open";
  const open = rows.filter((r) => r._o === 1);
  const openF = hasOpen ? [{ col: "_o", op: "open" as const, values: [] }] : [];
  if (hasOpen) {
    add("open", `${n(open.length)} of ${n(total)} ${spec.entityPlural} (${pct(open.length, total)}%) are ${ow}.`, pct(open.length, total) >= 40 ? "high" : "info",
      plan({ id: "f-open", title: "Status", chart: "donut", by: "col", byCol: spec.columns.find((c) => c.role === "status")?.key ?? null, limit: 6 }));
    const date = spec.columns.find((c) => c.role === "date");
    const asOf = window.to;
    if (date && asOf) {
      const ages = open.map((r) => (typeof r._d === "string" ? Math.round((Date.parse(asOf) - Date.parse(String(r._d))) / 86400_000) : null)).filter((a): a is number => a != null && a >= 0);
      if (ages.length >= 5) {
        const over30 = ages.filter((a) => a > 30).length;
        const oldest = Math.max(...ages);
        if (over30) add("age", `${n(over30)} of the ${spec.entityPlural} ${ow} date from more than 30 days ago (${date.label.toLowerCase()}); the oldest from ${n(oldest)} days ago.`, over30 >= open.length * 0.25 ? "sev" : "high",
          plan({ id: "f-age", title: `Open ${spec.entityPlural} over time`, chart: "area", by: "time", unit: "week", filters: openF, sort: "key", limit: 60 }));
      }
    }
  }

  // where: the zone with the most (open) rows, and how concentrated
  const zoneRows = (hasOpen ? open : now).filter((r) => typeof r._z === "number");
  if (zoneRows.length >= 5) {
    const by = new Map<number, number>();
    for (const r of zoneRows) by.set(r._z as number, (by.get(r._z as number) ?? 0) + wOf(r));
    const ranked = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)] as [number, number]);
    const placedSum = sumOf(zoneRows);
    const [z, c] = ranked[0];
    const word = hasOpen ? `${q.word} ${ow}` : q.word;
    const zp = plan({ id: "f-zone", title: `${word.charAt(0).toUpperCase()}${word.slice(1)} by zone`, chart: "hbar", by: "zone", ...measure, filters: [...openF, ...latestF], limit: 10 });
    add("top", `${names.zone(z)} has the most ${word}${when}: ${n(c)} (${pct(c, placedSum)}% of those placed).`, "high", zp);
    if (ranked.length >= 6) {
      const top3 = ranked.slice(0, 3).reduce((s, [, v]) => s + v, 0);
      const share = pct(top3, placedSum);
      if (share >= 35) add("concentration", `Three zones (${ranked.slice(0, 3).map(([k]) => names.zone(k)).join(", ")}) hold ${share}% of them.`, "info", zp);
    }
  }

  // when: the latest period against the one before (a period table, a yearly series) ...
  const dated = rows.filter((r) => typeof r._d === "string");
  const periodsSorted = [...new Set(dated.map((r) => String(r._d)))].sort();
  if ((panel || years) && lastD && periodsSorted.length >= 2) {
    const prevD = periodsSorted[periodsSorted.length - 2];
    const a = sumOf(dated.filter((r) => r._d === lastD)), b = sumOf(dated.filter((r) => r._d === prevD));
    if (b > 0) {
      const ch = Math.round(((a - b) / b) * 100);
      const tp = plan({ id: "f-trend", title: `${q.word.charAt(0).toUpperCase()}${q.word.slice(1)} over time`, chart: "bar", by: "time", ...measure, unit: years ? "year" : "month", sort: "key", limit: 60 });
      add("trend", `${q.word.charAt(0).toUpperCase()}${q.word.slice(1)} in ${periodName(lastD)}: ${n(a)}, ${ch === 0 ? "the same as" : `${ch > 0 ? "up" : "down"} ${Math.abs(ch)}% from`} ${n(b)} in ${periodName(prevD)}.`, ch > 10 ? "high" : ch < -10 ? "low" : "info", tp);
    }
  // ... or the last four weeks against the four before
  } else if (window.to && dated.length >= 20) {
    const a0 = addDays(window.to, -27), b0 = addDays(window.to, -55);
    const recent = sumOf(dated.filter((r) => String(r._d) >= a0)), before = sumOf(dated.filter((r) => String(r._d) >= b0 && String(r._d) < a0));
    if (before >= 5) {
      const ch = Math.round(((recent - before) / before) * 100);
      const tp = plan({ id: "f-trend", title: `${q.word.charAt(0).toUpperCase()}${q.word.slice(1)} over time`, chart: "area", by: "time", ...measure, unit: "week", sort: "key", limit: 60 });
      const what = q.col ? q.word : `New ${spec.entityPlural}`;
      if (Math.abs(ch) >= 15) add("trend", `${what.charAt(0).toUpperCase()}${what.slice(1)} ${ch > 0 ? "rose" : "fell"} ${Math.abs(ch)}% in the last 4 weeks (${n(recent)} against ${n(before)} in the 4 weeks before).`, ch > 0 ? "high" : "low", tp);
      else add("trend", `${what.charAt(0).toUpperCase()}${what.slice(1)} held steady: ${n(recent)} in the last 4 weeks against ${n(before)} before.`, "info", tp);
    }
  }

  // what: the most common type
  const cat = spec.columns.find((c) => c.role === "category");
  if (cat) {
    const by = new Map<string, number>();
    for (const r of now) if (r[cat.key] != null) by.set(String(r[cat.key]), (by.get(String(r[cat.key])) ?? 0) + wOf(r));
    const ranked = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)] as [string, number]);
    const all = q.col ? sumOf(now) : now.length;
    const text = q.col
      ? `Most ${q.word}${when} came from ${cat.label.toLowerCase()} ${ranked[0]?.[0]}: ${n(ranked[0]?.[1] ?? 0)} (${pct(ranked[0]?.[1] ?? 0, all)}%).`
      : `The most common ${cat.label.toLowerCase()} is ${ranked[0]?.[0]}: ${n(ranked[0]?.[1] ?? 0)} (${pct(ranked[0]?.[1] ?? 0, all)}%).`;
    if (ranked.length >= 2) add("category", text, "info",
      plan({ id: "f-cat", title: `By ${cat.label.toLowerCase()}`, chart: ranked.length <= 6 ? "donut" : "hbar", by: "col", byCol: cat.key, ...measure, filters: latestF, limit: 8 }));
  }

  // how much: the main measure, and where most of it is (for a periodic return the zone fact above already says it)
  const prim = spec.columns.find((c) => c.key === spec.primary);
  if (prim && prim.agg !== "avg" && prim.key !== q.col) {
    const p0 = plan({ id: "f-measure", title: `Total ${prim.label.toLowerCase()} by zone`, chart: "hbar", agg: "sum", col: prim.key, by: "zone", filters: latestF, limit: 10 });
    const { format, unit } = formatOf(spec, p0);
    const sum = now.reduce((s, r) => s + (typeof r[prim.key] === "number" ? (r[prim.key] as number) : 0), 0);
    if (sum > 0) {
      const res = runPlan(rows, spec, p0, names);
      const lead = res.values[0] ? ` ${res.labels[0]} accounts for ${fmtNum(res.values[0], format, unit)} (${pct(res.values[0], sum)}%).` : "";
      add("measure", `Total ${prim.label.toLowerCase()}${when}: ${fmtNum(sum, format, unit)}.${lead}`, "info", p0);
    }
  }

  // check this: outliers the Detective flagged
  const out = det.issues.find((i) => i.kind === "outlier");
  if (out) add("outlier", `${n(out.count)} ${out.count === 1 ? "value is" : "values are"} far above the rest in ${out.label.split(":")[0]} (largest ${out.examples[0] ?? ""}); worth checking before relying on totals.`, "high");

  // linked: the district's incidents
  if (link && link.mode === "place" && link.strength !== "none") {
    const top = link.overlap[0];
    add("link", `Zones with more ${link.dsLabel} also have more ${link.incLabel.toLowerCase()} (${link.strength} link, ${link.rho.toFixed(2)} rank correlation over ${link.n} zones, ${fmtDay(link.window.from)} to ${fmtDay(link.window.to)}).`,
      link.strength === "strong" ? "sev" : "high", null);
    if (link.overlap.length >= 2 && top)
      add("overlap", `${link.overlap.length} of the 5 zones with the most ${link.dsLabel} are also among the 5 with the most ${link.incLabel.toLowerCase()}: ${link.overlap.map((o) => `${o.name} (${n(o.ds)} and ${n(o.inc)})`).join(", ")}.`, "sev", null);
    if (link.open) add("link", `${n(link.open)} of those ${n(link.incidents)} incidents are still open${link.overdue ? `, ${n(link.overdue)} past their deadline` : ""}${link.news ? `; ${n(link.news)} were in the news` : ""}.`, link.overdue ? "sev" : "high", null);
  } else if (link && link.mode === "place") {
    add("link", `No clear zone-by-zone link with ${link.incLabel.toLowerCase()} (rank correlation ${link.rho.toFixed(2)} over ${link.n} zones).`, "info", null);
  }
  if (link?.time) add("time_link", `Week by week, ${link.dsLabel} moved with ${link.time.label.toLowerCase()} incidents${link.time.lag ? ` ${link.time.lag} ${link.time.lag === 1 ? "week" : "weeks"} earlier` : ""} (${link.time.rho.toFixed(2)} rank correlation over ${link.time.weeks} weeks).`,
    link.time.rho >= 0.6 ? "sev" : "high", null);
  if (link?.lowlying) add("lowlying", `They sit more often in low-lying wards (${link.lowlying.rho.toFixed(2)} rank correlation with the wards' low-lying index).`, "high", null);

  // quality
  // what cleaning changed that matters for the numbers: rows taken out, and spellings merged (not re-cased cells)
  const removed = det.issues.filter((i) => i.action === "removed").reduce((s, i) => s + i.count, 0);
  const merged = det.issues.filter((i) => i.kind === "variants" && i.examples.some((e) => e.includes("→"))).reduce((s, i) => s + i.count, 0);
  const parts = [removed ? `removed ${n(removed)} duplicate, total or empty ${removed === 1 ? "row" : "rows"}` : "", merged ? `merged ${n(merged)} misspelt ${merged === 1 ? "value" : "values"}` : ""].filter(Boolean);
  if (parts.length) add("quality", `Before counting, the Data Detective ${parts.join(" and ")} (data health ${det.before} → ${det.after}).`, "low", null);
  return facts;
}

// ------------------------------------------------------------------ rules story --

export function rulesStory(facts: Fact[], spec: Spec, link: LinkResult | null): Story {
  const byKind = (k: Fact["kind"]) => facts.filter((f) => f.kind === k);
  const linkF = byKind("link")[0], overlap = byKind("overlap")[0], top = byKind("top")[0], open = byKind("open")[0], trend = byKind("trend")[0];
  const strong = link && link.mode === "place" && (link.strength === "strong" || link.strength === "moderate");
  const headline = strong ? `${cap(link!.dsLabel)} line up with ${link!.incLabel.toLowerCase()}` : top ? top.text.split(":")[0] : `${cap(spec.entityPlural)} at a glance`;
  const lede = [strong ? linkF?.text : null, top?.text ?? open?.text].filter(Boolean).join(" ") || facts[0]?.text || "";
  const order: Fact["kind"][] = ["overlap", "link", "time_link", "top", "open", "age", "trend", "concentration", "measure", "category", "lowlying", "outlier", "quality", "size"];
  const picked = order.flatMap((k) => byKind(k)).filter((f, i, a) => a.indexOf(f) === i && !(strong && f === linkF)).slice(0, 5);
  const findings: Finding[] = picked.map((f, i) => ({
    id: `r${i + 1}`, title: titleOf(f, spec), body: f.text, next: nextOf(f, spec), tone: f.tone, facts: [f.id], plan: f.plan, by: "rules"
  }));
  return { headline, lede, findings, facts, by: "rules", model: null, verified: true, dropped: 0 };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function titleOf(f: Fact, spec: Spec): string {
  switch (f.kind) {
    case "overlap": return "The same zones, in two sources";
    case "link": return "Linked to district incidents";
    case "time_link": return "They rise and fall together";
    case "top": return "Where most of them are";
    case "open": return "How many need attention";
    case "age": return "Some have waited too long";
    case "trend": return f.text.includes("rose") ? "Rising" : f.text.includes("fell") ? "Falling" : "Steady";
    case "concentration": return "Concentrated in a few zones";
    case "measure": return "How much";
    case "category": return `Most common ${spec.columns.find((c) => c.role === "category")?.label.toLowerCase() ?? "type"}`;
    case "lowlying": return "Low-lying wards";
    case "outlier": return "Values worth checking";
    case "quality": return "Cleaned before counting";
    case "size": return "What the data covers";
    default: return "Finding";
  }
}

function nextOf(f: Fact, spec: Spec): string | null {
  const dept = spec.deptName ?? "the department";
  switch (f.kind) {
    case "overlap": case "link": return `Ask ${dept} to act first on the ${spec.entityPlural} ${spec.openWord || "still open"} in these zones.`;
    case "age": return `Ask ${dept} for a dated plan for the oldest ${spec.entityPlural} ${spec.openWord || "still open"}.`;
    case "top": return `Review the ${spec.entityPlural} ${spec.openWord || "still open"} in this zone with the zonal officer.`;
    case "outlier": return "Check these rows with the department before using the totals.";
    case "trend": return f.text.includes("rose") ? `Ask ${dept} what is driving the rise.` : null;
    default: return null;
  }
}

// ---------------------------------------------------------------- verification --

/** Numbers written in a text (commas removed): 1,234 -> 1234; 37.5% -> 37.5. Day numbers of written dates count too. */
export function numbersIn(s: string): number[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter((x) => Number.isFinite(x));
}

/** Every number in `text` appears in `allowed` (or rounds to one of them). */
export function grounded(text: string, allowed: number[]): boolean {
  const ok = new Set<number>();
  for (const a of allowed) { ok.add(a); ok.add(Math.round(a)); ok.add(Math.round(a * 10) / 10); }
  return numbersIn(text).every((x) => ok.has(x) || allowed.some((a) => a !== 0 && Math.abs(x - a) / Math.abs(a) < 0.006));
}
