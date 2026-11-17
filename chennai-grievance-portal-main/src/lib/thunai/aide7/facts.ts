/**
 * v7: the fact sheet the answer writer reads and the checker holds it to. Built by code from the screen the recipe made (every figure on it
 * is code's, from the console's tools) plus what the record holds that the screen does not show (a case's assignment, its deadline, the
 * news report on it; a news item's article text): one short plain-English line a fact, numbered F1, F2, ..., each with its source, the
 * time said as a person says it in English and Tamil (computed here in IST), the Tamil names of its zones, departments and outlets, and
 * every derived value worked out in advance (differences, ratios, rank, direction). The model never computes and never sees a raw date.
 * (Research: docs/jarvis/v7-research/10-grounding.md rec 1; 20-structured-qa.md recs 3, 6.) Pure, server and tests.
 */
import { deadlineWords, pointWords, sinceWords, timeOf, type BriefFacts } from "../brief6";
import type { BlockT, StageDocT } from "../stage";
import type { Lang } from "../types";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import { redactText } from "../privacy";
import { relativeTime } from "../web/brief";
import { namesIn, tamilFormsOf, type Gazetteer } from "./gazetteer";
import { dirOfText, nowBefore, type Fact7, type Sheet7 } from "./ground";
import { extrasOf, type AideExtras } from "./extras";

export { addExtras, extrasOf, keepExtras, type AideExtras } from "./extras";

// ------------------------------------------------------------------ the sheet --

const MAX_FACTS = 24;
const MAX_CHARS = 220;
const clip = (s: unknown, n = MAX_CHARS) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const pctOf = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
const dirOf = (d: number | null | undefined): "up" | "down" | null => (d == null || d === 0 ? null : d > 0 ? "up" : "down");

/** a record's time said both ways ("this morning", "இன்று காலை"), or null */
function when(t: unknown, now: number): { en: string; ta: string } | null {
  const ms = timeOf(t);
  if (ms == null) return null;
  const en = pointWords(ms, now);
  const ta = relativeTime(new Date(ms).toISOString(), now, "ta");
  return en ? { en, ta: ta ?? "" } : null;
}

interface Builder { facts: Fact7[]; add: (f: Omit<Fact7, "id">) => void }
function builder(gaz: Gazetteer): Builder {
  const facts: Fact7[] = [];
  const seen = new Set<string>();
  return {
    facts,
    add: (f) => {
      // a phone number, an e-mail, an Aadhaar number in any record's words is masked before a model can read it (privacy.ts redactText)
      // "2.7×" is said "2.7 times" (a sign is not speech: the checker refuses it)
      const text = clip(redactText(f.text).replace(/\s*×\s*/g, " times "));
      if (!text || seen.has(text) || facts.length >= MAX_FACTS) return;
      seen.add(text);
      facts.push({ ...f, text, id: `F${facts.length + 1}`, names: [...new Set([...(f.names ?? []), ...tamilFormsOf(text, gaz)])] });
    }
  };
}

function caseFacts(b: Extract<BlockT, { kind: "CaseDetail" }>, x: AideExtras["brief"] | undefined, now: number, add: Builder["add"]) {
  const i = b.incident;
  const where = [i.place, i.zoneName ? `${i.zoneName} zone` : null].filter(Boolean).join(", ");
  add({ src: "dashboard", text: `The incident: ${i.title}${x?.what ? ` (${x.what.en})` : i.cat ? ` (${i.cat})` : ""}${where ? `, at ${where}` : ""}` });
  add({ src: "dashboard", text: `Rated ${String(i.sev ?? "unrated").toLowerCase()}; status ${String(i.status ?? "unknown").toLowerCase()}${i.overdue ? "; past its deadline" : ""}` });
  const since = x?.since != null ? sinceWords(x.since, now) : sinceWords(timeOf(i.t), now);
  if (since) add({ src: "dashboard", text: `Open ${since.en}`, times: [since.en, since.ta] });
  const due = deadlineWords(x?.due ?? timeOf(i.deadline), now);
  if (due) add({ src: "dashboard", text: `Its deadline ${due.en}`, times: [due.en, due.ta] });
  const holder = i.deptName ? `Held by ${i.deptName}` : "No department holds it yet";
  add({ src: "dashboard", text: `${holder}${x ? (x.role ? `, with ${x.role} on it` : x.officials ? "" : "; no officer is named on it") : ""}` });
  add({ src: "dashboard", text: i.complaints > 0 ? `${i.complaints} citizen complaint${i.complaints === 1 ? "" : "s"} linked to it` : "No citizen complaint is linked to it yet" });
  if (x?.news) { const w = pointWords(x.news.at, now); add({ src: x.news.outlet, text: `${x.news.outlet} reported it${w ? ` ${w}` : ""}`, times: w ? [w] : [] }); }
  if (x?.lastAt != null && now - x.lastAt > 2 * 86_400_000) { const s = sinceWords(x.lastAt, now); if (s) add({ src: "dashboard", text: `Nothing new has come in on it ${s.en}`, times: [s.en, s.ta] }); }
  for (const w of i.what.slice(0, 2)) add({ src: "dashboard", text: `From the record: ${w}` });
  if (i.why) add({ src: "dashboard", text: `Why it is rated so (the record's words): ${i.why}`, cause: true });
  const next = x?.next?.en ?? i.next;
  if (next) add({ src: "dashboard", text: `The suggested next step (code's): ${next}` });
  // the timeline's news reports only: a citizen's complaint is never handed to a model (its words, a name, a house), whatever channel it came by
  for (const r of b.timeline.filter((x) => isNewsMedia(x.source)).slice(0, 3)) { const w = when(r.t, now); add({ src: r.source, text: `${r.source}${w ? ` (${w.en})` : ""}: ${r.text}`, times: w ? [w.en, w.ta] : [] }); }
}

function blockFacts(b: BlockT, doc: StageDocT, now: number, add: Builder["add"], x: AideExtras | null) {
  switch (b.kind) {
    case "Kpis":
      for (const k of b.items) {
        const prev = k.prev != null ? `, against ${fmt(k.prev)} before` : "";
        const ch = k.pct != null ? ` (${k.pct >= 0 ? "up" : "down"} ${Math.abs(k.pct)}%)` : k.delta != null && k.delta !== 0 ? ` (${k.delta > 0 ? "up" : "down"} ${fmt(Math.abs(k.delta))})` : "";
        add({ src: "dashboard", text: `${b.title}: ${k.label}: ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}${prev}${ch}`, dir: dirOf(k.delta ?? (k.prev != null ? k.value - k.prev : null)),
          ratios: k.prev ? [k.value / k.prev] : [] });
      }
      return;
    case "Findings":
      for (const f of b.items) add({ src: "dashboard", text: `${f.title}${f.caveat ? ` (${f.caveat.replace(/\.$/, "")})` : ""}`, dir: dirOfText(f.title),
        rank: /\bmost\b|\bbiggest\b|\bhighest\b/i.test(f.title), ratios: pairRatios(f.title) });
      return;
    case "CaseDetail": caseFacts(b, x?.brief, now, add); return;
    case "CaseList": {
      add({ src: "dashboard", text: `${b.title}: ${b.total} in all`, rank: /rank|highest|top|worst/i.test(b.title) });
      for (const [i, r] of b.rows.slice(0, 3).entries()) {
        const w = r.t ? sinceWords(timeOf(r.t), now) : null;
        add({ src: "dashboard", text: `Listed ${i + 1}: ${r.title}${r.place ? `, at ${r.place}` : ""}${r.zoneName ? `, ${r.zoneName} zone` : ""}; ${String(r.sev ?? "unrated").toLowerCase()}${r.deptName ? `; held by ${r.deptName}` : ""}${r.complaints ? `; ${r.complaints} complaints` : ""}${r.overdue ? "; past its deadline" : ""}${w ? `; open ${w.en}` : ""}`,
          times: w ? [w.en, w.ta] : [], rank: i === 0 && /rank|highest|top|priority/i.test(b.title) });
      }
      return;
    }
    case "NewsReader": {
      // the stories only: a news list's count is no point to say (and its total is the district's even on a place's list: "95 reports from Adyar"
      // was said in the dev run, 17 Nov)
      for (const it of b.items.slice(0, 5)) {
        const w = when(it.t, now);
        add({ src: it.source ?? "the news", text: `${it.source ?? "A report"}${w ? ` (${w.en})` : ""}: ${it.title}${it.place ? ` (place: ${it.place})` : ""}${it.incidentId ? "; linked to an incident on the console" : ""}`, times: w ? [w.en, w.ta] : [] });
      }
      return;
    }
    case "Ranking": {
      const n = b.items.length;
      const head = `${b.title}${b.unit ? ` (${b.unit})` : ""}, ${b.order === "top" ? "highest first" : "lowest first"}`;
      for (const it of b.items.slice(0, 3)) add({ src: "dashboard", text: `${head}: rank ${it.rank} of ${n}: ${it.label}, ${fmt(it.value)}${it.sub && !it.sub.includes(fmt(it.value)) ? ` (${it.sub})` : ""}`, rank: true });
      if (n > 3) { const last = b.items[n - 1]; add({ src: "dashboard", text: `${head}: the last of ${n}: ${last.label}, ${fmt(last.value)}`, rank: true }); }
      if (n >= 2) add({ src: "dashboard", text: `${b.items[0].label} against ${b.items[1].label}: ${fmt(b.items[0].value)} against ${fmt(b.items[1].value)}`, ratios: b.items[1].value ? [b.items[0].value / b.items[1].value] : [] });
      return;
    }
    case "Compare": {
      for (const m of b.metrics) {
        const vals = b.sides.map((s) => ({ l: s.label, v: s.values[m.key] })).filter((s) => typeof s.v === "number");
        if (vals.length < 2) continue;
        const r = vals[1].v ? vals[0].v / vals[1].v : null;
        add({ src: "dashboard", text: `${m.label}: ${vals.map((s) => `${s.l} ${fmt(s.v)}`).join(", ")}`, ratios: r ? [r] : [] });
      }
      for (const d of b.diffs.slice(0, 2)) add({ src: "dashboard", text: `The biggest gap is in ${d.label.toLowerCase()}: ${d.hi} is ${fmt(d.gap)} higher than ${d.lo}${d.ratio ? ` (${fmt(d.ratio)} times)` : ""}`, rank: true, ratios: d.ratio ? [d.ratio] : [] });
      for (const s of b.sides) if (s.cats.length) add({ src: "dashboard", text: `${s.label}'s commonest kinds: ${s.cats.slice(0, 2).map((c) => `${c.label} ${fmt(c.n)}`).join(", ")}`, rank: true });
      return;
    }
    case "Trend": {
      if (!b.values.length) return;
      const first = b.values[0], last = b.values[b.values.length - 1];
      const peak = Math.max(...b.values), at = b.values.indexOf(peak);
      add({ src: "dashboard", text: `${b.title}: ${fmt(first)} ${b.unit} at ${b.labels[0] ?? "the start"}, ${fmt(last)} at ${b.labels[b.labels.length - 1] ?? "the end"}`, dir: dirOf(last - first), ratios: first ? [last / first] : [] });
      add({ src: "dashboard", text: `${b.title}: the highest was ${fmt(peak)} at ${b.labels[at] ?? "one point"}${b.normal ? `; the usual range is ${fmt(b.normal.lo)} to ${fmt(b.normal.hi)}` : ""}`, rank: true });
      for (const mk of b.marks.slice(0, 2)) add({ src: "dashboard", text: `Marked on the trend at ${b.labels[mk.i] ?? "one point"}: ${mk.why}` });
      return;
    }
    case "Chart": {
      const pairs = b.labels.map((l, i) => ({ l, v: b.values[i] })).filter((p) => typeof p.v === "number");
      const sorted = [...pairs].sort((a, c) => c.v - a.v);
      if (sorted.length) add({ src: "dashboard", text: `${b.title}: highest ${sorted.slice(0, 2).map((p) => `${p.l} ${fmt(p.v)}`).join(", ")}`, rank: true });
      if (sorted.length > 2) add({ src: "dashboard", text: `${b.title}: lowest ${sorted.slice(-2).reverse().map((p) => `${p.l} ${fmt(p.v)}`).join(", ")}`, rank: true });
      return;
    }
    case "Readings": {
      const s = [...b.items].sort((a, c) => c.value - a.value);
      for (const r of s.slice(0, 2)) add({ src: "dashboard", text: `${b.title}: ${r.name} ${fmt(r.value)} ${b.unit}${r.mean28 != null ? ` (28-day mean ${fmt(r.mean28)})` : ""}${r.anomaly ? "; unusual" : ""}`, rank: true });
      return;
    }
    case "Brief":
      for (const p of b.points.slice(0, 8)) add({ src: "dashboard", text: `Brief point: ${p.text}`, names: p.ta ? [] : [], dir: dirOfText(p.text), ratios: pairRatios(p.text) });
      return;
    case "Answer":
      add({ src: "dashboard", text: `${b.title}: ${b.text}`, cause: false, dir: dirOfText(b.text) });
      for (const f of b.facts.slice(0, 6)) add({ src: "dashboard", text: `${f.label}: ${fmt(f.value)}${f.unit ? ` ${f.unit}` : ""}` });
      return;
    case "Filled": add({ src: "dashboard", text: `${b.title}: ${b.filled} cells filled, ${b.left} left` }); return;
    case "Heat": {
      // each measure's highest and lowest row: the comparison across everything, worked out by code
      for (const [j, col] of b.cols.slice(0, 6).entries()) {
        const vals = b.rows.map((r, i) => ({ r, v: b.cells[i]?.[j] })).filter((x): x is { r: string; v: number } => typeof x.v === "number");
        if (vals.length < 2) continue;
        const hi = vals.reduce((a, x) => (x.v > a.v ? x : a)), lo = vals.reduce((a, x) => (x.v < a.v ? x : a));
        if (hi.v === lo.v) continue;
        add({ src: "dashboard", text: `${col}: highest ${hi.r} ${fmt(hi.v)}, lowest ${lo.r} ${fmt(lo.v)}, of the ${vals.length} compared`, rank: true, ratios: lo.v ? [hi.v / lo.v] : [] });
      }
      return;
    }
    case "Note": add({ src: "dashboard", text: `Note: ${b.text}` }); return;
    default: return;
  }
}

/** "8 against 26", "2 now, 8 before": the ratio of the first to the second, for "a third", "twice" */
function pairRatios(text: string): number[] {
  const pair = nowBefore(text);
  if (pair) return pair.before ? [pair.now / pair.before] : [];
  // a window's length ("in the last 7 days", "the 7 days before") is no side of a ratio
  const s = text.replace(/\b(?:in )?(?:the )?(?:last|past) \d+ (?:days?|hours?|weeks?|months?)\b|\bthe \d+ (?:days?|hours?|weeks?|months?) before\b|\b\d+-day\b/gi, " ");
  const m = s.match(/(\d+(?:\.\d+)?)\D{1,20}?(?:against|vs|versus|before|,)\D{0,12}?(\d+(?:\.\d+)?)/i);
  if (!m) return [];
  const a = Number(m[1]), b = Number(m[2]);
  return b ? [a / b] : [];
}

/** the console's windows as said (screens.ts PERIOD_EN), and the screens that count over one */
const WINDOW: Record<string, string[]> = { daily: ["the last 24 hours", "today"], weekly: ["this week", "the last 7 days"], monthly: ["this month", "the last 30 days"], quarterly: ["this quarter"] };
const COUNTS = new Set(["situation", "why", "changed", "compare", "ranking", "performance", "cases", "news", "brief", "trend", "dashboard", "readings", "insight", "advise"]);
/** The screen's scope: the district names in its title and its scope's zone, and the window it counts over (a case has none of its own) */
export function scopeOf(doc: Pick<StageDocT, "title" | "recipe" | "scope">, gaz: Gazetteer): { names: string[]; times: string[] } {
  const names = new Set<string>(namesIn(doc.title ?? "", gaz).filter((h) => h.kind !== "outlet").map((h) => h.form));
  const z = doc.scope?.zone != null ? gaz.entries.find((e) => e.key === `zone:${doc.scope.zone}`) : null;
  if (z?.en[0]) names.add(z.en[0]);
  return { names: [...names].slice(0, 3), times: COUNTS.has(doc.recipe) ? WINDOW[doc.scope?.period ?? ""] ?? [] : [] };
}

/** A one-line note of what the screen shows, for the writer (it points at the screen, never reads it). */
export function screenNote(doc: StageDocT): string {
  const kinds: Record<string, string> = { Kpis: "key-number tiles", CaseList: "a list of incidents", CaseDetail: "the incident's card and timeline", NewsReader: "a list of news reports with links",
    Readings: "readings by station", Ranking: "a ranked list", MapView: "a map", Compare: "a side-by-side comparison", Trend: "a trend chart", Chart: "a chart", Heat: "a heat table",
    Brief: "the brief's points", Answer: "an answer card", Findings: "findings with their methods", Filled: "a filled table", Note: "a note", Drafts: "drafts" };
  const parts = [...new Set(doc.blocks.map((b) => kinds[b.kind] ?? b.kind))];
  return `The screen shows "${clip(doc.title, 120)}": ${parts.join(", ")}.`;
}

/**
 * The sheet for one answer. `now`: the moment the answer is given (relative times are said from it).
 */
export function buildSheet(doc: StageDocT, lang: Lang, gaz: Gazetteer, now: number, x: AideExtras | null = extrasOf(doc)): Sheet7 & { note: string } {
  const b = builder(gaz);
  // the screen's scope first: its place (its title's and its scope's names) and, on a screen that counts over a window, that window
  const scope = scopeOf(doc, gaz);
  if (scope.names.length || scope.times.length) b.add({ src: "dashboard", text: `This screen covers ${[...scope.names, ...scope.times.slice(0, 1)].join(", ")}`, times: scope.times });
  if (doc.takeaway?.en && doc.recipe !== "news") b.add({ src: "dashboard", text: `The takeaway code drew: ${doc.takeaway.en}`, dir: dirOfText(doc.takeaway.en) });
  if (x?.article) {
    const a = x.article, w = a.publishedAt ? when(a.publishedAt.replace("T", " ").slice(0, 19), now) ?? (() => { const t = Date.parse(a.publishedAt as string); return Number.isFinite(t) ? { en: pointWords(t, now) ?? "", ta: relativeTime(a.publishedAt, now, "ta") ?? "" } : null; })() : null;
    const outlet = a.outlet ?? "The report";
    b.add({ src: a.outlet ?? "the news", text: `${outlet} reported${w?.en ? ` ${w.en}` : ""}: ${a.title}`, times: w ? [w.en, w.ta] : [], names: a.outletTa ? [a.outletTa] : [] });
    // the article's own sentences, a few, each a fact of that outlet's (code reads none of them as true: they are what the outlet said)
    for (const s of sentencesOf(a.text).slice(0, 6)) b.add({ src: a.outlet ?? "the news", text: `${outlet} wrote: ${s}`, cause: /\b(?:because|due to|caused|after)\b/i.test(s), names: a.outletTa ? [a.outletTa] : [] });
    if (a.incident) b.add({ src: "dashboard", text: "This report is linked to an incident on the console" });
    for (const r of x.related ?? []) { const rw = r.publishedAt ? when(r.publishedAt.replace("T", " ").slice(0, 19), now) : null; b.add({ src: r.outlet, text: `${r.outlet} also covered it${rw ? ` (${rw.en})` : ""}: ${r.title}`, times: rw ? [rw.en, rw.ta] : [] }); }
  }
  // the facts that carry a point first (what stands out, the comparison, the ranking, the case), the tiles' totals after them: a model leads
  // with the first facts it is given, and the totals made it read the screen's numbers out (the dev run, 17 Nov)
  const ORDER: Record<string, number> = { Findings: 0, Compare: 1, Ranking: 2, Heat: 3, CaseDetail: 4, Brief: 5, Answer: 6, CaseList: 7, NewsReader: 8, Readings: 9, Chart: 10, Trend: 11, Kpis: 12, Filled: 13, Note: 14 };
  for (const blk of [...doc.blocks].sort((p, q) => (ORDER[p.kind] ?? 20) - (ORDER[q.kind] ?? 20))) blockFacts(blk, doc, now, b.add, x);
  for (const l of x?.lines ?? []) b.add({ src: l.src ?? "dashboard", text: l.text, dir: l.dir ?? null, rank: l.rank, ratios: l.ratios, cause: l.cause });
  for (const n of doc.notes ?? []) b.add({ src: "dashboard", text: `Caution: ${n}` });
  const shown = [doc.title, ...doc.blocks.flatMap((blk) => blk.kind === "CaseList" ? blk.rows.map((r) => r.title) : blk.kind === "NewsReader" ? blk.items.map((i) => i.title) : blk.kind === "CaseDetail" ? [blk.incident.title, ...blk.timeline.map((t) => t.text)]
    : blk.kind === "Brief" ? blk.points.map((p) => p.text) : blk.kind === "Answer" ? [blk.text] : blk.kind === "Findings" ? blk.items.map((f) => f.title) : [])];
  return { facts: b.facts, lang, gaz, shown, note: screenNote(doc), scope };
}

/** An article's text as sentences worth a fact: not a byline, not a date line, 6 to 40 words. */
export function sentencesOf(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"“‘(஀-௿])/u).map((s) => s.trim())
    .filter((s) => { const n = s.split(" ").length; return n >= 6 && n <= 40 && !/^(?:by|published|updated|posted|also read|read more|subscribe|click|follow us)\b/i.test(s); });
}
