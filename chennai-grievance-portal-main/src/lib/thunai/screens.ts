/**
 * Thunai's screen builders: a recipe and its slots (chosen by the model, checked by agent.ts) become a Stage document
 * (stage.ts). Code fetches the data with Ask District IQ's tools and the console's own views (data.ts `Hands`, injected so
 * this is unit-tested with fakes), computes the insights with explicit rules (insight.ts), and writes the takeaway and the
 * spoken line in English and Tamil from templates. No figure here comes from a model.
 */
import type { ToolResult } from "@/lib/assistant/types";
import type { CityFocusPart, CityRainOf, CityRanked } from "@/lib/city/now";
import { aggregate, change, largestGaps, median, peak, rank, round, share, spoken, unusualPoints, vsMedian } from "./insight";
/** A Tamil count and its word: one takes the singular ("1 கடுமையானது"), any other number the plural ("2 கடுமையானவை"). A line said "1 கடுமையானவை"
 * whatever the count (pass4-open-13, the PB-224 class). */
const nTa = (n: number, one: string, many: string) => `${spoken(n)} ${n === 1 ? one : many}`;
import type { BlockT, Bilingual, CaseRowT, NextStepT, PointT, Recipe, ScopeT, StageDocT } from "./stage";
import type { Lang, PeriodKey, Sev, World } from "./types";
import { detectLang } from "./normalise";
import { needsDates, type PeriodSpec, type Span, type Comparison, type Words } from "@/lib/period/read";
import { nextSteps } from "./next";
import { completeRows, type InRow, type Lookups } from "./complete";
import { cChart, modifiedZ, trendOf } from "./stats";
import { UNIT_TA, hoursBetween } from "./stagelocal";
import { CAT_ALIASES, DEPT_ALIASES, DEPT_TA, ZONES, ZONE_TA_NAME as ZONE_TA } from "./lexicon";
import { conditionsTa, reasonTa } from "./reasons";
import { stripFigures } from "./numbergate";
import { CAT_LABEL_TA, closedAs, factSheet, idam, plainWhat, plainWho, spokenPlace, type Gazetteer } from "./narrate";
import { briefIssue, latestOf, roleWords, timeOf } from "./brief6";
import { keepExtras, type AideExtras } from "./aide7/extras";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import type { Plan } from "./v19/shape";
import { askRecipe, type AskHand } from "./v19/doc";
// the analysis recipes import helpers from this file: a cycle that is safe because RECIPE calls them only when a screen is built
import { changedRecipe } from "./recipes/changed";
import { focusRecipe } from "./recipes/focus";
import { explainRecipe } from "./recipes/explain";
import { situationRecipe } from "./recipes/situation";
import type { RecipeCtx, RecipePart } from "./recipes/common";
import { thinLine } from "./persona";
import type { StudioAnswerOut, StudioPick } from "@/lib/studio/forAssistants";
// v18 (24 Nov): any window, everything about one subject, and a way into every insight
import { summaryRecipe, type SummaryPart } from "./recipes/summary";
import { spanCompare, spanNews, spanPrices, spanRanking, spanReadings, spanTraffic, spanTrend } from "./recipes/window18";
import { MAX_BLOCKS } from "./stage";
import { OutsideRecords, beforeRecords, isToday, isWindowSpec, istWall, overWords } from "./v18/when";
import { withAbout, withDrills } from "./v18/drills";
import { spanOf } from "@/lib/period/read";
import { dayWords } from "@/lib/period/day";
import type { WinHands } from "./v18/window";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const METRICS = ["rain", "aqi", "lakes", "temp", "humidity"] as const;
export type Metric = (typeof METRICS)[number];
export const MEASURES = ["rain", "aqi", "lakes", "temp", "zone_severe", "zone_open", "zone_incidents", "zone_complaints", "zone_attention", "taluk_open",
  "dept_open", "dept_backlog", "dept_resolution", "dept_overdue", "hotspots"] as const;
export type Measure = (typeof MEASURES)[number];

export interface Slots {
  period: PeriodKey | null;
  zones: number[];
  dept: string | null;
  depts: string[];
  cat: string | null;
  taluk: string | null;
  sev: Sev | null;
  status: "open" | "overdue" | "resolved" | null;
  /** words to search for (news, cases), or the map question for "nearby" */
  q: string | null;
  metric: Metric | null;
  measure: Measure | null;
  by: "dept" | "zone" | null;
  order: "top" | "bottom";
  n: number | null;
  /** an incident id (case) */
  id: string | null;
  /** a station or reservoir name (readings) */
  name: string | null;
  /** map: what to put on it; explain: "change" explains one part of a change (the one zone, department or kind named) */
  what: "severe" | "hotspots" | "cases" | "change" | null;
  sort: "priority" | "complaints" | "time" | null;
  /** changed: a metric registry id (metrics.ts); absent, incidents reported */
  metricId?: string | null;
  /** explain: one part of a change, by its dimension and key (recipes/explain.ts explainSlots) */
  change?: { dim: "zone" | "dept" | "cat"; key: string } | null;
  /** start clean: the console's own filters are not inherited (a Stage control's "All of Chennai") */
  fresh?: boolean;
  /** complete: the open Stage's incident ids; those rows are completed, not the console's list */
  ids?: string[];
  /** brief: a body above the departments (GCC, PWD), briefed across its own departments */
  org?: string | null;
  /** the time the request named, when it is not one of the console's four windows: today since midnight, last month, right now, or a window against
   * the one before (lib/period/read.ts); the screen counts that span itself (QA pass 7) */
  span?: PeriodSpec;
  /** v12 (21 Nov), city: the most congested stretch ("worst-jam") or the trouble spot that keeps coming back ("repeat") */
  focus?: "worst-jam" | "repeat" | null;
  /** v12 (21 Nov), city: a past heavy rain, "latest" or "rain-YYYY-MM-DD" (the streets that flooded in it) */
  rain?: string | null;
  /** 23 Nov, city: a ranked list of live traffic ("top three most congested roads", "areas with the least traffic") */
  rank?: { n: number; order: "most" | "least"; by: "road" | "area" } | null;
  /** v18 round 2, city: traffic over a window from the readings the website keeps every 10 minutes (lib/city/history.ts), not the live picture */
  past?: boolean;
  /** 23 Nov, cases: the count asked for ("open the top three cases"): exactly that many, by priority, with why each ranks there */
  top?: number | null;
  /** v16 (22 Nov), focus: what the reader understood was asked (attention, improving, worsening, repeat), in order */
  lens?: ("attention" | "improving" | "worsening" | "repeat")[];
  /** v16 (22 Nov), focus: about the zones, the streets and spots, or the kinds of problem */
  about?: "areas" | "places" | "kinds" | null;
  /** v16 (22 Nov), advise: only the first case, in full */
  one?: boolean;
  /** v17 (22 Nov), dataset: the Collector's Data Studio dataset (its id); `q` is the question asked of it */
  dataset?: string | null;
  /** v17, dataset: the last answer's filters, kept by a follow-up ("and only the pending ones?") */
  filters?: StudioFilter[];
  /** v18 (24 Nov), summary: a locality that is not a zone ("Velachery", "Shanthi Colony"), matched on the incidents' place */
  place?: string | null;
  /** v18 round 2: the place is a locality exactly as the summary's "By locality" ranking counts it (a ranking item clicked) */
  exact?: boolean;
  /** v18, summary: a group of kinds ("crimes": v18/topics.ts), counted together */
  family?: string | null;
  /** v18, summary: "cases" when a tile was clicked: the records behind the number, then the map */
  view?: "cases" | null;
  /** v19, ask: the analyst's plan (v19/plan.ts), so a click, Back or a refresh runs it again with no model */
  plan?: Plan;
}
export type StudioFilter = { col: string; op: "eq" | "neq" | "in" | "contains" | "gte" | "lte" | "open" | "closed" | "recent_days" | "latest"; values: string[] };

/**
 * v17 (22 Nov): Jarvis's hands on the Collector's own Data Studio datasets (data.ts studioHands over studio/forAssistants.ts). Absent for
 * anyone but the Collector, and in tests that give none: a dataset screen then says it cannot reach them.
 */
export interface StudioHands {
  /** one line per dataset for the reader, marked as file content (null: no datasets) */
  digest: () => string | null;
  /** the digest's "D2" as a dataset id */
  byTag: (tag: string) => string | null;
  /** the dataset a sentence is about (the one open in the Studio, the one the last answer came from), or null */
  pick: (text: string, o: { openId?: string | null; lastId?: string | null }) => StudioPick | null;
  /** the answer: from the brief for a summary, else the Studio's analyst within the deadline, else its rules; `keep`: a follow-up in other
   *  words, so the context's filters stay */
  ask: (q: string, o: { datasetId: string; context?: { filters?: StudioFilter[] } | null; deadlineMs?: number; keep?: boolean }) => Promise<StudioAnswerOut | null>;
}

export const emptySlots = (): Slots => ({ period: null, zones: [], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null,
  measure: null, by: null, order: "top", n: null, id: null, name: null, what: null, sort: null });

export interface Hands {
  /** a Data Studio dataset by name, as rows for "complete this data"; total counts every row, read or not */
  dataset?: (name: string) => Promise<{ name: string; rows: InRow[]; total?: number } | null>;
  /** the deterministic lookups "complete this data" fills from */
  lookups?: (w: World) => Lookups;
  tool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  severe: (s: ScopeT) => Promise<{ rows: Row[]; counts: Record<string, number>; asOf: string }>;
  /** the console's incident list with its whole count, for a status the tool cannot filter ("overdue"); see data.ts consoleList */
  list?: (s: ScopeT, f: { sev: string | null; status: string | null; q: string | null; sort: "sev" | "t" | "c"; page?: number }) => Promise<{ rows: Row[]; total: number; incidents?: number; asOf: string }>;
  news: (s: ScopeT) => Promise<{ rows: Row[]; total: number; asOf: string }>;
  map: (q: string) => Promise<Row>;
  /** a list and its counts over a span with its own dates (data.ts consoleSpan); absent, a screen says it cannot count the span */
  span?: (spec: PeriodSpec, s: ScopeT, f: { sev: string | null; status: "open" | "overdue" | null; n: number }) => Promise<{ span: Span; rows: Row[]; total: number; severe: number; open: number; late: number; dead: number; prev: { n: number; label: Words } | null; asOf: string } | null>;
  /** a window against the one before it (data.ts consoleCompare) */
  compare?: (key: PeriodKey, s: ScopeT, f: { sev: string | null; status: "open" | "overdue" | null }) => Promise<{ cmp: Comparison; n: number; prev: number; severe: number; open: number; asOf: string } | null>;
  /** v17: the Collector's own Data Studio datasets (absent: not the Collector, or a test) */
  studio?: StudioHands;
  /** v18: reads over any window with its own dates (v18/window.ts); absent (a test's hands), the summary says it cannot read them */
  win?: WinHands;
  /** v19: one data request of the analyst, run (v19/run.ts); absent (a test's hands), the analyst is off */
  ask?: AskHand;
  /** v18: the window the turn named (v18/when.ts turnWhen), set by the round once it is read; every screen of the turn counts it */
  turnSpan?: PeriodSpec | null;
}
/** v18: screens that are about one thing now or one record, never a window: a turn's window is not given to them */
// (focus too: where to concentrate is read over weeks of its own, and its period carries the window asked)
// (ask: its requests carry their own window, as the analyst read it)
const NO_TURN_SPAN = new Set<Recipe>(["nearby", "case", "explain", "dataset", "drafts", "complete", "answer", "focus", "ask"]);

export interface Built { doc: StageDocT; runs: string[] }

// ------------------------------------------------------------------ words --

// the console's daily window is the calendar day since 12 AM (lib/period/day.ts, 26 Nov): "today", and from 12 AM to 6 AM "since 12 AM yesterday",
// said at the moment the screen is made (a screen over the 24 hours that said "today" put figures of yesterday evening under the word: QA pass 7, break A4)
const PERIOD_EN: Record<PeriodKey, string> = { get daily() { return dayWords().en.inWords; }, weekly: "this week", monthly: "the last 30 days", quarterly: "the last 90 days" };
/** the period as an adverb after a noun: "cases today", "cases this week", "cases in the last 30 days" (never "cases the last 30 days", QA4 G1: AUD-NF-16, audit-understanding-20) */
const inPeriod = (p: PeriodKey): string => (p === "weekly" || p === "daily" ? PERIOD_EN[p] : `in ${PERIOD_EN[p]}`);
const PERIOD_TA: Record<PeriodKey, string> = { get daily() { return dayWords().ta.inWords; }, weekly: "இந்த வாரம்", monthly: "கடந்த 30 நாட்களில்", quarterly: "கடந்த 90 நாட்களில்" };
const SEV_TA: Record<string, string> = { Severe: "கடுமையான", High: "அதிக முக்கியத்துவ", Medium: "நடுத்தர", Low: "குறைந்த" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-28 07:41:25" (IST) as "28 Oct, 7:41 AM"; dates alone as "28 Oct". */
export function when(t: unknown): string | null {
  const m = String(t ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  if (m[4] == null) return day;
  const h = Number(m[4]);
  return `${day}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}
const bi = (en: string, ta: string): Bilingual => ({ en, ta });
const zoneName = (w: World, n: number | null | undefined) => (n ? w.zones.find((z) => z.n === n)?.name ?? `Zone ${n}` : null);
// a world without the zones' Tamil names (a test's) still names them in Tamil, from the lexicon, by number
const zoneTa = (w: World, n: number | null | undefined) => (n ? w.zones.find((z) => z.n === n)?.ta ?? ZONE_TA[n] ?? zoneName(w, n) : null);
const catLabel = (w: World, c: string | null) => (c ? w.cats.find((x) => x.code === c)?.label ?? c : null);
const deptName = (w: World, d: string | null) => (d ? w.depts.find((x) => x.code === d)?.name ?? d : null);
// the Tamil line says the department and the category in Tamil: DEPT_TA and CAT_LABEL_TA are complete tables (a test checks every code)
const deptTa = (w: World, d: string | null) => (d ? DEPT_TA[d] ?? deptName(w, d) : null);
/**
 * The Tamil of a body the briefing tool names by its ENGLISH NAME ("PWD Water Resources", "Greater Chennai Police", "Street Lighting"), not by its code: the code by the console's own name for it, or
 * by the longest alias of the body in the name. A Tamil brief point must not hold a Latin body name (SKG1-36).
 */
const deptTaNamed = (w: World, d: string | null): string | null => {
  if (!d) return null;
  if (DEPT_TA[d]) return DEPT_TA[d];
  const low = d.toLowerCase();
  const hit = w.depts.find((x) => x.name.toLowerCase() === low || x.code.toLowerCase() === low);
  if (hit && DEPT_TA[hit.code]) return DEPT_TA[hit.code];
  let best: [number, string] | null = null;
  for (const [code, al] of Object.entries(DEPT_ALIASES)) for (const a of al) if (DEPT_TA[code] && /^[a-z]/i.test(a) && a.length >= 3 && low.includes(a.toLowerCase()) && (!best || a.length > best[0])) best = [a.length, DEPT_TA[code]];
  return best?.[1] ?? deptName(w, d);
};
const catTa = (w: World, c: string | null) => (c ? CAT_LABEL_TA[c] ?? catLabel(w, c) : null);
/** A case's body in Tamil, by its code (DEPT_TA covers every code): the Tamil lines said the row's English name, "PWD Water Resources வசம் 2" (pass4-open-12). */
const rowDeptTa = (r: { dept?: string | null; deptName?: string | null }) => (r.dept ? DEPT_TA[r.dept] : undefined) ?? r.deptName ?? r.dept ?? null;
/** Each body's Tamil name, by the English name the rows are counted under. */
const deptTaByName = (rows: CaseRowT[]) => new Map(rows.filter((r) => r.deptName).map((r) => [r.deptName as string, rowDeptTa(r) as string]));
const MONTH_TA: Record<string, string> = { Jan: "ஜன.", Feb: "பிப்.", Mar: "மார்.", Apr: "ஏப்.", May: "மே", Jun: "ஜூன்", Jul: "ஜூலை", Aug: "ஆக.", Sep: "செப்.", Oct: "அக்.", Nov: "நவ.", Dec: "டிச." };
/** A chart's time label ("21 Oct", "3 pm") in Tamil, so a Tamil line never says a Latin month or AM/PM (RC-15). */
const labelTa = (l: string) => String(l).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTH_TA[m]).replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (_m, h, mi, ap) => `${/pm/i.test(ap) ? "பிற்பகல்" : "முற்பகல்"} ${h}${mi ? `:${mi}` : ""}`);
const reportsOf = (subject: string, generic: boolean, n = 2): string => (generic ? (n === 1 ? "incident" : "incidents") : `${subject.toLowerCase()} ${n === 1 ? "report" : "reports"}`);
const plural = (n: number, one: string, many: string) => `${spoken(n)} ${n === 1 ? one : many}`;
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/**
 * A request's own words (a slot the model or the rules filled: q, name, id) as a screen shows or says them: without a figure of their own
 * (Finding 51). "flood deaths 300" is shown as "flood deaths"; a real zone's label stays. The lookups keep the words as they came.
 */
const shown = (w: World, s: unknown, n: number): string => clip(stripFigures(clip(s, n), w.zones.map((z) => z.n)) ?? "", n);
/** Text fit to show and say: no phone numbers or e-mail addresses, no letter openings ("Respected sir, ..."). */
export function safeText(t: unknown, n: number): string {
  return clip(String(t ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "").replace(/(?:\+?91[\s-]?)?\b\d[\d\s-]{8,}\d\b/g, "")
    .replace(/^\s*(respected|dear)\s+(sir|madam|sir\/madam)[,.:\s-]*/i, "").replace(/^\s*(sir|madam)[,.:]\s*/i, ""), n);
}
/** How Thunai names an incident aloud: its own short summary, else its kind and place (never a citizen's words). */
export function spokenLabel(r: CaseRowT): string {
  if (r.why && r.why.length <= 90 && !/[.!?].+[.!?]/.test(r.why)) return r.why.replace(/\.$/, "");
  const place = r.place ?? r.zoneName;
  return r.cat ? `${r.cat}${place ? ` at ${place}` : ""}` : safeText(r.title, 90);
}
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** Text cut to a catalog limit at a sentence end, else at a word: a working screen is never refused for its length. */
export function fit(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end >= n / 3 ? cut.slice(0, end + 1) : cut.slice(0, Math.max(cut.lastIndexOf(" "), 1));
}
const fitBi = (b: Bilingual): Bilingual => ({ en: fit(b.en, 600), ta: fit(b.ta, 900) });

/** The scope a screen covers, in words ("Adyar · flooding · this week"). */
function scopeWords(w: World, s: ScopeT, withPeriod = true): Bilingual {
  const en = [zoneName(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.name ?? s.taluk : null, deptName(w, s.dept), catLabel(w, s.cat), s.sev, withPeriod ? PERIOD_EN[s.period] : null].filter(Boolean);
  const ta = [zoneTa(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.ta ?? s.taluk : null, deptTa(w, s.dept), catTa(w, s.cat), s.sev ? SEV_TA[s.sev] : null, withPeriod ? PERIOD_TA[s.period] : null].filter(Boolean);
  return bi(en.join(" · "), ta.join(" · "));
}

// ------------------------------------------------------------------ rows --

/** Any incident row the tools or the console return, as a Stage card (no citizen text: title, place, codes, counts). */
export function caseRow(r: Row, w: World): CaseRowT {
  const zone = num(r.zone);
  const why = r.why && typeof r.why === "object" ? clip(r.why.summary ?? r.why.why?.[0], 300) : typeof r.reasons === "string" ? clip(r.reasons, 300) : r.attention_reason ? clip(r.attention_reason, 300) : null;
  return {
    id: String(r.id), title: safeText(r.title, 240) || String(r.id), sev: r.sev ?? r.severity ?? null, status: r.status ?? null, zone,
    zoneName: r.zone_name ?? r.zoneName ?? zoneName(w, zone), place: clip(r.loc ?? r.place ?? r.place_text, 120) || null, ward: num(r.ward),
    dept: r.dept ?? null, deptName: r.dept_name ?? r.deptName ?? null, complaints: Number(r.complaints ?? 0) || 0, t: r.t ?? r.first ?? null,
    overdue: (Number(r.breached) === 1 || r.overdue === true) && !closedAs(r.status, r.open), lat: num(r.lat), lon: num(r.lon), why: why || null, cat: r.type ?? r.catLabel ?? r.cat ?? null
  };
}

function points(rows: CaseRowT[], hot = 3): PointT[] {
  return rows.map((r, i) => ({ r, i })).filter(({ r }) => r.lat != null && r.lon != null)
    .map(({ r, i }) => ({ n: i + 1, id: r.id, lat: r.lat as number, lon: r.lon as number, label: r.title, sev: r.sev, value: null, hot: i < hot }));
}

function sortRows(rows: CaseRowT[], sort: Slots["sort"]): CaseRowT[] {
  if (sort === "complaints") return [...rows].sort((a, b) => b.complaints - a.complaints);
  if (sort === "time") return [...rows].sort((a, b) => String(b.t ?? "").localeCompare(String(a.t ?? "")));
  return rows;
}

// ------------------------------------------------------------------ the builder --

/**
 * What a screen builder works with. `ta`: the turn is in Tamil (or Tanglish), so the screen's own words, its title, its blocks' titles and its notes,
 * are in Tamil script; English stays only in names (places, bodies, stations) and codes (v4 brief, defect 9). Notes are kept in both languages.
 */
interface Ctx { w: World; h: Hands; s: ScopeT; slots: Slots; heard: string; runs: string[]; sources: Set<string>; notes: Bilingual[]; asOf: string | null; ta: boolean }
/** the screen's own words in its language */
const L = (c: Pick<Ctx, "ta">, en: string, ta: string): string => (c.ta ? ta : en);
const KEY_NUMBERS = (c: Pick<Ctx, "ta">) => L(c, "Key numbers", "முக்கிய எண்கள்");
/** a kind of incident as a tool row names it ({code, label}), in the screen's language */
const kindLabel = (c: Pick<Ctx, "ta">, x: Row): string => clip(c.ta ? CAT_LABEL_TA[String(x.code ?? "")] ?? x.label : x.label, 80);
/** the same kind in Tamil, for a Tamil line whatever the screen's language */
const kindTa = (x: Row): string => clip(CAT_LABEL_TA[String(x.code ?? "")] ?? x.label, 80);
/** the period's words, in the screen's language */
const periodWords = (c: Pick<Ctx, "ta">, p: PeriodKey) => (c.ta ? PERIOD_TA[p] : PERIOD_EN[p]);
/** a request's own words (Finding 51) for this screen */
const words = (c: Pick<Ctx, "w">, s: unknown, n: number) => shown(c.w, s, n);
/**
 * A request's search words (q, often English even for a Tamil turn) as a Tamil screen shows them: a kind of incident by its Tamil name, a zone by
 * its Tamil name, a place as it is named, Tamil words as they are; any other English word is left out, so no English sentence sits on a Tamil screen.
 */
function topicTa(c: Pick<Ctx, "w">, q: string): string {
  if (!q) return "";
  const low = ` ${q.toLowerCase().replace(/[^a-z஀-௿]+/g, " ")} `;
  const out: string[] = [];
  for (const [code, al] of Object.entries(CAT_ALIASES)) {
    if (CAT_LABEL_TA[code] && al.some((a) => { const t = a.trim().toLowerCase(); return t.length >= 4 && /^[a-z ]+$/.test(t) && low.includes(` ${t} `); })) out.push(CAT_LABEL_TA[code]);
  }
  for (const z of c.w.zones) if (z.name.length >= 4 && low.includes(` ${z.name.toLowerCase()} `)) out.push(zoneTa(c.w, z.n) ?? z.name);
  for (const p of c.w.places) if (p.name.length >= 4 && low.includes(` ${p.name.toLowerCase()} `)) out.push(p.name);
  for (const m of q.match(/[஀-௿]+/g) ?? []) out.push(m);
  return clip([...new Set(out)].join(", "), 120);
}
/** the Collector's own words as a title (a request no recipe could count); on a Tamil screen only when they are in Tamil script */
const heardTitle = (c: Pick<Ctx, "heard">, fallback: Bilingual): Bilingual => {
  const h = clip(c.heard, 120);
  return bi(h || fallback.en, /[஀-௿]/.test(h) ? h : fallback.ta);
};

async function call(c: Ctx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  c.runs.push(name);
  const r = await c.h.tool(name, args);
  c.sources.add(name);
  c.asOf ??= r.asOf ?? null;
  return r;
}
const scopeArg = (s: ScopeT, extra: Partial<ScopeT> = {}) => {
  const x = { ...s, ...extra };
  return { period: x.period, zone: x.zone, dept: x.dept, cat: x.cat, taluk: x.taluk };
};

/**
 * One read of the incident list, the only place a screen asks for it. Two rules live here so no screen can break them: severity order is
 * ascending in the store (dir 1; the tool's default direction puts the LEAST serious first, which made "most serious first" lists, and
 * every count taken from their first page, wrong), and a count about the list ("past deadline") comes from the console's own filter
 * (status "overdue"), never from the rows of one page of 12.
 */
async function incidentList(c: Ctx, f: { sev?: Sev | null; status: "open" | "overdue" | "resolved" | null; q?: string | null; sort: "sev" | "t" | "c"; page?: number }, scope: ScopeT = c.s): Promise<{ rows: Row[]; total: number; incidents: number }> {
  const sev = f.sev ?? null, q = f.q ?? null, page = f.page ?? 0;
  const status = f.status === "resolved" ? "Resolved" : f.status; // the status name the list and the tool know (lane a)
  if (c.h.list) {
    c.runs.push("incidents");
    c.sources.add("incidents");
    const r = await c.h.list(scope, { sev, status, q, sort: f.sort, page });
    c.asOf ??= r.asOf;
    return { rows: r.rows, total: r.total, incidents: r.incidents ?? r.total };
  }
  const r = await call(c, "incidents", { scope: scopeArg(scope), sev, status, q, sort: f.sort, dir: f.sort === "sev" ? 1 : -1, page });
  const d = r.data as { rows?: Row[]; total?: number };
  return { rows: d.rows ?? [], total: Number(d.total ?? 0), incidents: Number(d.total ?? 0) };
}
/** How many of the list's incidents are past their deadline, counted over the whole list: null when the hands cannot count it. */
async function lateTotal(c: Ctx, sev: Sev | null, q: string | null): Promise<number | null> {
  if (!c.h.list) return null;
  return (await incidentList(c, { sev, status: "overdue", q, sort: "sev" })).incidents;
}

/** a screen as a recipe builds it: its title in both languages (a plain string is the same in both: a name, the Collector's own words) */
type Part = { title: string | Bilingual; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[]; next?: NextStepT[]; /** v7: facts for the aide beyond the screen (aide7/extras.ts) */ aide?: AideExtras;
  /** v17: the dataset screen's Studio answer (stage.ts studio) and the slots it adds (the answer's filters, for a follow-up) */
  studio?: StageDocT["studio"]; slotsOut?: Partial<Slots>;
  /** v18: the window with its own dates the screen counted */
  when?: StageDocT["when"] };

/** v18: a recipe that reads any window (recipes/summary.ts, recipes/window18.ts), with screens.ts's context */
const v18 = (run: (c: RecipeCtx) => Promise<SummaryPart>) => async (c: Ctx): Promise<Part> => {
  const rc: RecipeCtx = { w: c.w, h: c.h, s: c.s, slots: c.slots, heard: c.heard, runs: c.runs, sources: c.sources, notes: [], asOf: c.asOf, ta: c.ta };
  try {
    const p = await run(rc);
    return { title: p.title, takeaway: p.takeaway, say: p.say, blocks: p.blocks, next: p.next, when: p.when, ...(p.aide ? { aide: p.aide } : {}), ...((p as { slotsOut?: Partial<Slots> }).slotsOut ? { slotsOut: (p as { slotsOut?: Partial<Slots> }).slotsOut } : {}) };
  } catch (e) {
    // v18 round 2: the window asked lies wholly before the records: said so, never another window's figures
    if (!(e instanceof OutsideRecords)) throw e;
    const why = beforeRecords(e.w);
    return { title: bi(e.w.label.en, e.w.label.ta), takeaway: null, say: bi(why.en, why.ta), blocks: [{ kind: "Note", id: "before", text: clip(c.ta ? why.ta : why.en, 400) }], next: [],
      when: { en: clip(e.w.label.en, 160), ta: clip(e.w.label.ta, 200), from: e.w.from, to: e.w.to } };
  } finally {
    c.asOf ??= rc.asOf;
    for (const n of rc.notes) c.notes.push(bi(n, n));
  }
};
/** v18: the screens that count a window of their own dates themselves; with the window reads (h.win), any of these honours any window */
// (lambdas: the recipes import this file's helpers, so their bindings are read at call time, as `analysis` does)
const SPAN_NATIVE: Partial<Record<Recipe, (c: RecipeCtx) => Promise<SummaryPart>>> = { news: (c) => spanNews(c), readings: (c) => spanReadings(c), prices: (c) => spanPrices(c),
  ranking: (c) => spanRanking(c), trend: (c) => spanTrend(c), compare: (c) => spanCompare(c),
  // v18 round 2: traffic over a window, from the readings the website keeps every 10 minutes (lib/city/history.ts)
  city: (c) => spanTraffic(c) };
/** v18: the screens whose own reads know only the console's four windows: with a window of its own dates, the summary of that scope answers */
// (not focus: where to concentrate is read over weeks of its own, recipes/focus.ts)
const SPAN_TO_SUMMARY = new Set<Recipe>(["brief", "situation", "why", "changed", "insight", "dashboard", "advise", "performance", "map"]);

/**
 * The analysis recipes (recipes/*.ts, lane A2) take the same context with their notes as plain lines in the screen's language and the
 * language as `ta`: the runs and sources are shared, the notes and the data's time are handed back. Called lazily (the recipes import
 * this file's helpers, so the import is a cycle that only works at call time).
 */
const analysis = (run: (c: RecipeCtx) => Promise<RecipePart>) => async (c: Ctx): Promise<Part> => {
  const rc: RecipeCtx = { w: c.w, h: c.h, s: c.s, slots: c.slots, heard: c.heard, runs: c.runs, sources: c.sources, notes: [], asOf: c.asOf, ta: c.ta };
  try {
    return await run(rc);
  } finally {
    c.asOf ??= rc.asOf;
    for (const n of rc.notes) c.notes.push(bi(n, n));
  }
};

const RECIPE: Record<Recipe, (c: Ctx) => Promise<Part>> = {
  cases, case: caseDetail, news, readings, prices, ranking, compare, trend, why, performance, dashboard, map: mapScreen, nearby, brief, drafts, advise, insight, complete, city, answer: async () => {
    throw new Error("the answer screen is written from the agent's own results");
  },
  changed: analysis((c) => changedRecipe(c)), explain: analysis((c) => explainRecipe(c)), situation: analysis((c) => situationRecipe(c)),
  // v15 (22 Nov): where to concentrate, improving, getting worse, repeating (recipes/focus.ts)
  focus: analysis((c) => focusRecipe(c)),
  // v17 (22 Nov): an answer from one of the Collector's own Data Studio datasets
  dataset: datasetScreen,
  // v18 (24 Nov): everything about one area, department, kind or the district, over any window
  summary: v18((c) => summaryRecipe(c)),
  // v19 (25 Nov): exactly what was asked, from the analyst's own data request (v19/doc.ts)
  ask: v18((c) => askRecipe(c))
};

const CHART_OF: Record<string, "bar" | "hbar" | "line" | "donut"> = { bar: "bar", hbar: "hbar", line: "line", area: "line", donut: "donut", treemap: "hbar", map: "hbar" };
const TONE_OF: Record<string, "bad" | "good" | "neutral"> = { sev: "bad", high: "bad", low: "good", teal: "good" };

/**
 * v17 (22 Nov): "what does my shelters data say", "hospital beds by zone", "and only Adyar?": an answer from one of the Collector's own
 * Data Studio datasets. The Studio counts every figure from the rows (studio/forAssistants.ts studioAsk: the brief for a summary, else its
 * analyst's plan, else its rules); this screen only lays it out: the answer in words with its figures, the chart or the number, the brief's
 * points, and the Studio's own card (stage.ts studio) for its actions. Every line cites the dataset; nothing here is a model's.
 */
async function datasetScreen(c: Ctx): Promise<Part> {
  const id = c.slots.dataset ?? null;
  const st = c.h.studio;
  const cannot = (en: string, ta: string): Part => ({ title: bi("Your Data Studio data", "உங்கள் தரவுக் கோப்புகள்"), takeaway: null, say: bi(en, ta),
    blocks: [{ kind: "Note", id: "studio", text: L(c, en, ta) }] });
  if (!st || !id) return cannot("I can't reach your Data Studio datasets from here.", "உங்கள் தரவுக் கோப்புகளை இங்கிருந்து படிக்க முடியவில்லை.");
  const q = c.slots.q || c.heard;
  c.runs.push("studio_ask");
  // (the slots carry filters only for a follow-up on the last answer, round.ts datasetTurn, or when this screen is built again: kept either way)
  const keep = !!c.slots.filters?.length;
  const a = await st.ask(q, { datasetId: id, context: keep ? { filters: c.slots.filters } : null, keep });
  if (!a) return cannot("That dataset is not in your Data Studio any more.", "அந்தத் தரவு இப்போது தரவுக் கூடத்தில் இல்லை.");
  const d = a.dataset, r = a.reply, p = r.panel;
  c.sources.add(clip(`Data Studio: ${d.label}`, 80));
  if (r.how) c.notes.push(bi(clip(r.how, 300), clip(r.how, 300)));
  if (a.source === "rules" && r.kind !== "summary") c.notes.push(bi("Read by the Data Studio's rules (the AI analyst did not answer in time); the figures are counted the same way.",
    "AI பதில் தாமதமானதால் தரவுக் கூடத்தின் விதிகளால் படிக்கப்பட்டது; எண்கள் அதே முறையில் கணக்கிடப்பட்டவை."));
  const sentence = c.ta ? a.sentence.ta : a.sentence.en;
  const cite = bi(`From your ${d.label} data`, `உங்கள் ${d.label} தரவிலிருந்து`);
  // (the answer's text names the dataset, as the spoken line does: a figure in its name is then one the screen holds)
  const blocks: BlockT[] = [{ kind: "Answer", id: "studio", title: L(c, "From your Data Studio", "உங்கள் தரவுக் கூடத்திலிருந்து"), text: fit(`${cite[c.ta ? "ta" : "en"]}: ${sentence}`, 900),
    facts: a.facts.slice(0, 12).map((f) => ({ label: clip(f.label, 160), value: f.value, unit: f.unit ? clip(f.unit, 20) : null })) }];
  if (r.kind === "summary" && r.points?.length) {
    blocks.push({ kind: "Brief", id: "points", title: L(c, "In brief", "சுருக்கமாக"), points: r.points.slice(0, 8).map((x) => ({ text: clip(x, 400), incidentId: null })) });
  } else if (p?.kpi && Number.isFinite(p.kpi.value)) {
    blocks.push({ kind: "Kpis", id: "kpi", title: KEY_NUMBERS(c), items: [{ key: "studio", label: clip(p.kpi.label || p.title, 80), value: p.kpi.value, unit: p.unit ? clip(p.unit, 20) : null,
      prev: null, delta: Number.isFinite(p.kpi.delta) ? p.kpi.delta : null, tone: TONE_OF[p.kpi.tone] ?? "neutral", spark: (p.kpi.spark ?? []).filter(Number.isFinite).slice(-60) }] });
  } else if (p && p.labels.length > 1 && CHART_OF[p.chart]) {
    const n = Math.min(p.labels.length, 40);
    blocks.push({ kind: "Chart", id: "chart", title: clip(p.title, 160), chart: p.plan.by === "time" ? "line" : CHART_OF[p.chart], unit: p.unit ? clip(p.unit, 30) : null,
      labels: p.labels.slice(0, n).map((l) => clip(l, 80)), values: p.values.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0)) });
  }
  if (r.kind === "unsupported" || (r.kind === "summary" && r.note)) blocks.push({ kind: "Note", id: "note", text: clip(r.kind === "unsupported" ? sentence : L(c, r.note ?? "", "இந்தத் தரவுக்கு இன்னும் சுருக்கம் இல்லை: தரவுக் கூடத்தில் ஒருமுறை திறந்தால் உருவாகும்."), 400) });
  const title = r.kind === "summary" ? bi(`${d.label}: in brief`, `${d.label}: சுருக்கம்`) : p ? bi(`${d.label}: ${p.title}`, `${d.label}: ${p.title}`) : bi(d.label, d.label);
  return {
    title, takeaway: null,
    // said with the dataset it came from, so a figure is never taken for the console's own
    say: bi(`${cite.en}: ${a.sentence.en}`, `${cite.ta}: ${a.sentence.ta}`), blocks,
    // the dataset's own suggested questions, asked as said
    next: d.questions.slice(0, 2).map((x) => ({ label: bi(clip(x, 200), clip(x, 200)), kind: "ask" as const, recipe: null, slots: null, ids: [], text: clip(x, 200) })),
    studio: { id: d.id, name: clip(d.label, 160), q: clip(q, 300), a: r as unknown as Record<string, unknown> },
    slotsOut: { filters: (r.plan?.filters ?? []).slice(0, 8) as StudioFilter[] }
  };
}

/**
 * Build a screen. Throws only on a programming error; a tool failure becomes a Note block that says so. `lang` is the turn's language
 * (agent.ts finish); without it, the language of the words heard (normalise.ts detectLang: Tamil script or Tanglish is Tamil).
 */
export async function buildScreen(recipe: Recipe, slots: Slots, base: ScopeT, w: World, h: Hands, heard: string, id = `st-${Date.now().toString(36)}`, lang?: Lang): Promise<Built> {
  // v18 (24 Nov): the window the turn named ("last 2 days", "on 20 November", "two days ago"), for every screen the turn builds, whichever lane
  // chose it (round.ts sets it once a turn, never for a Stage click; the window reads must be there to count it). It replaces a window carried
  // in the slots of the screen being followed ("and the last 4 days?"); "open now" and "against last month" stay the lanes' own
  if (h.win && h.turnSpan && !NO_TURN_SPAN.has(recipe) && (!slots.span || isWindowSpec(slots.span))) slots = { ...slots, span: h.turnSpan };
  const s: ScopeT = {
    period: slots.period ?? base.period, zone: slots.zones.length === 1 ? slots.zones[0] : slots.zones.length ? null : base.zone,
    dept: slots.dept ?? (slots.depts.length ? null : base.dept), cat: slots.cat ?? base.cat, taluk: slots.taluk ?? base.taluk, sev: slots.sev ?? null
  };
  // news covers the whole district unless the request names its own area or topic: the console's filters (say, Flooding
  // left on by an earlier dashboard) would otherwise turn "today's news" into "today's flooding news"
  // a request that names its own place or topic starts clean (as v1's planner does); one that names nothing keeps the
  // console's filters, so "the severe cases" are the ones the console shows
  const named = slots.zones.length > 0 || !!slots.dept || !!slots.cat || !!slots.taluk || slots.depts.length > 0 || !!slots.family || !!slots.place;
  if (recipe === "news" || recipe === "brief" || recipe === "summary" || slots.fresh || named) { s.zone = slots.zones[0] ?? null; s.dept = slots.dept; s.cat = slots.cat; s.taluk = slots.taluk; }
  const lng: Lang = (lang ?? detectLang(heard)) === "ta" ? "ta" : "en";
  const c: Ctx = { w, h, s, slots, heard, runs: [], sources: new Set(), notes: [], asOf: null, ta: lng === "ta" };
  // v18 (24 Nov): a window with its own dates ("last 2 days", "20 November") is honoured by every screen: the ones that count it themselves do,
  // and the ones whose reads know only the console's four windows hand over to the summary of the same scope over that window. A group of
  // kinds ("crimes") is the summary's too: the console's list filters one kind at a time
  const span = slots.span && isWindowSpec(slots.span) ? slots.span : null;
  if (h.win) {
    // ("today" is the console's own Daily on these: "what are my tasks today" stays the tasks)
    if (span && !isToday(span) && SPAN_TO_SUMMARY.has(recipe)) { if (recipe === "advise") c.slots = { ...slots, view: "cases" }; recipe = "summary"; }
    else if (recipe === "cases" && (slots.family || slots.place) && !(slots.span && !span)) { recipe = "summary"; c.slots = { ...slots, view: "cases" }; }
    // v18 round 2: the cases of dates the console's span reader leaves undated (before the records begin): the summary's list says so
    else if (recipe === "cases" && span && !spanOf(span, istWall(Date.now()))) { recipe = "summary"; c.slots = { ...slots, view: "cases" }; }
  }
  // (a group of kinds or a locality is counted by the window reads too: the console's tools filter one kind, one zone)
  // (and the prices in one area are its own market's: the console's price tool reads the city's markets together)
  // (the city: only its traffic has a past, kept by the website; flooding, power and the metro are read live)
  const native = h.win && SPAN_NATIVE[recipe] && !(recipe === "compare" && slots.zones.length < 2) && (recipe === "city" ? slots.q === "traffic" && (!!span || slots.past === true)
    : span || (recipe !== "compare" && (!!slots.family || !!slots.place)) || (recipe === "prices" && slots.zones.length === 1));
  const run = native ? v18(SPAN_NATIVE[recipe]!) : RECIPE[recipe];
  let part: Part;
  try {
    part = await run(c);
  } catch (e) {
    part = { title: heardTitle(c, bi("Data", "தரவு")), takeaway: null, say: bi("I could not get that data just now.", "அந்தத் தரவை இப்போது பெற முடியவில்லை."),
      blocks: [{ kind: "Note", id: "err", text: L(c, `The data could not be read: ${clip((e as Error).message, 200)}`, "தரவைப் படிக்க முடியவில்லை.") }] };
  }
  if (!part.blocks.length) part.blocks.push({ kind: "Note", id: "empty", text: L(c, "Nothing in the data matches this, for this scope.", "இந்தப் பார்வைக்குத் தரவில் எதுவும் பொருந்தவில்லை.") });
  const titles = typeof part.title === "string" ? bi(part.title, part.title) : part.title;
  // a note with nothing in it is not shown as a blank line
  const notes = c.notes.map((n) => bi(clip(n.en, 300), clip(n.ta, 300))).filter((n) => n[lng]).slice(0, 4);
  // v18: the window with its own dates, shown in place of the four period buttons (a screen that counted it says it; else read from the slots)
  // (only a screen that counted the span says it: cases and the brief count it themselves, the v18 screens hand theirs back)
  const sp = span && c.asOf && (recipe === "cases" || recipe === "brief") ? spanOf(span, c.asOf) : null;
  const when = part.when !== undefined ? part.when : sp ? { en: clip(sp.label.en, 160), ta: clip(sp.label.ta, 200), from: sp.range?.from ?? null, to: sp.range?.to ?? null } : null;
  const doc0: StageDocT = { v: 1, id, recipe, title: clip(titles[lng], 200), takeaway: part.takeaway && fitBi(part.takeaway), say: fitBi(part.say), blocks: part.blocks.slice(0, MAX_BLOCKS), scope: s,
    slots: (part.slotsOut ? { ...c.slots, ...part.slotsOut } : c.slots) as unknown as Record<string, unknown>, sources: [...c.sources].slice(0, 10).map((x) => clip(x, 80)), asOf: c.asOf, notes: notes.map((n) => n[lng]),
    lang: lng, titles: bi(clip(titles.en, 200), clip(titles.ta, 200)), notesBi: notes, ...(part.studio ? { studio: part.studio } : {}), ...(when ? { when } : {}) };
  // v18: every insight leads to its records (the summary sets its own)
  const doc = withAbout(withDrills(doc0, w));
  doc.next = part.next ?? (part.blocks.some((b) => b.kind === "Note") && part.blocks.length === 1 ? [] : nextSteps(doc));
  if (part.aide) keepExtras(doc, part.aide);
  // the persona pushes back when the data is thin: a finding resting on a handful of cases says so, with code's own count (persona.ts)
  const thin = thinLine(doc);
  if (thin) doc.say = { en: fit(`${doc.say.en} ${thin.en}`.trim(), 600), ta: fit(`${doc.say.ta} ${thin.ta}`.trim(), 900) };
  return { runs: c.runs, doc };
}

/**
 * The next step for one case, from its own category code and the body that HOLDS it (its department field), never from words in its title:
 * the step is "ask <the holder> ..." so it cannot name another agency than the one with the case (RC-12, PB-113, PB-159, PB-175).
 * Null when the category has no step better than asking its own department, or the holder is not on the record.
 */
const STEP_BY_CAT: Record<string, { en: string; ta: string }> = {
  FLOOD_WATERLOGGING: { en: "to send a pump and check the drain there", ta: "பம்பு அனுப்பி வடிகாலைச் சரிபார்க்கச் சொல்லலாம்" },
  SOLID_WASTE: { en: "to clear it", ta: "அகற்றச் சொல்லலாம்" },
  SANITATION_TOILETS: { en: "to clear it", ta: "அகற்றச் சொல்லலாம்" },
  VECTOR_DISEASE: { en: "for fogging around it", ta: "அங்கே புகை மருந்து அடிக்கச் சொல்லலாம்" },
  WATER_SUPPLY: { en: "for a status by this evening", ta: "இன்று மாலைக்குள் நிலவரம் கேட்கலாம்" },
  DRAINAGE_SEWAGE: { en: "for a status by this evening", ta: "இன்று மாலைக்குள் நிலவரம் கேட்கலாம்" },
  ROAD_DAMAGE: { en: "for a repair date", ta: "சரிசெய்யும் தேதி கேட்கலாம்" }
};
export function actionForOne(catCode: unknown, dept: string | null, deptNameText: string | null): { en: string; ta: string } | null {
  const step = Object.hasOwn(STEP_BY_CAT, String(catCode ?? "")) ? STEP_BY_CAT[String(catCode)] : null;
  const who = plainWho(dept, deptNameText);
  return step && who ? { en: `ask ${who.en} ${step.en}`, ta: `${idam(who.ta)} ${step.ta}` } : null;
}

function actionFor(label: string): { en: string; ta: string } {
  const l = label.toLowerCase();
  if (/flood|waterlog|drain|inundat/.test(l)) return { en: "ask Storm Water Drains for pumps and a desilting check on the worst streets", ta: "மழைநீர் வடிகால் துறையிடம் பம்புகளும் தூர்வாரலும் கேளுங்கள்" };
  if (/garbage|waste|sanitat|debris/.test(l)) return { en: "ask Solid Waste Management for a clearance drive", ta: "திடக்கழிவு மேலாண்மையிடம் சுத்தம் செய்யக் கேளுங்கள்" };
  if (/vector|dengue|mosquito|malaria|disease|health|fever/.test(l)) return { en: "ask Health for fogging and source reduction in those wards", ta: "சுகாதாரத் துறையிடம் புகை மருந்தும் கொசு ஒழிப்பும் கேளுங்கள்" };
  if (/water supply|sewage|sewer|drinking|pipe/.test(l)) return { en: "ask Metro Water for a status by this evening", ta: "மெட்ரோ குடிநீரிடம் இன்று மாலைக்குள் நிலவரம் கேளுங்கள்" };
  if (/road|pothole|traffic/.test(l)) return { en: "ask the roads department for a repair date", ta: "சாலைத் துறையிடம் சரிசெய்யும் தேதி கேளுங்கள்" };
  if (/power|electric|tree/.test(l)) return { en: "ask the department holding most of them for a status today", ta: "அதிகம் வைத்திருக்கும் துறையிடம் இன்றே நிலவரம் கேளுங்கள்" };
  return { en: "ask the department holding most of them for a status today", ta: "அதிகம் வைத்திருக்கும் துறையிடம் இன்றே நிலவரம் கேளுங்கள்" };
}

/**
 * "What should I do first (in X)?": several steps of reasoning, all in code. It reads the open incidents in priority order
 * and what changed against the period before, then ranks what needs the Collector: a case past its deadline first, then
 * a department sitting on several overdue cases, then the kind of incident rising fastest (with a suggested ask), then the
 * busiest spot. Every figure in the points comes from those two tool results.
 */
async function advise(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const ta = c.ta;
  const where = s.zone ? bi(` in ${zoneName(w, s.zone)}`, ` ${zoneTa(w, s.zone) ?? zoneName(w, s.zone)} பகுதியில்`) : bi("", "");
  const [inc, late, drv] = await Promise.all([
    // v16 (22 Nov): a severity carried from the list just shown ("which of today's severe cases first?") is kept
    incidentList(c, { status: "open", sort: "sev", sev: c.s.sev ?? null }).catch(() => null),
    // the cases past their deadline, whole scope: the first of them is the one to ring about, not the first one on a page of open cases
    c.h.list ? incidentList(c, { status: "overdue", sort: "sev", sev: c.s.sev ?? null }).catch(() => null) : Promise.resolve(null),
    call(c, "change_drivers", { scope: scopeArg(s) }).catch(() => null)
  ]);
  const rows = (inc?.rows ?? []).map((x) => caseRow(x, w)).slice(0, 8);
  const lateRows = (late?.rows ?? []).map((x) => caseRow(x, w));
  const d = (drv?.data ?? {}) as { totals?: Row; categories?: Row[]; places?: Row[] };
  const points: { en: string; ta: string; id: string | null }[] = [];
  const holder = (r: CaseRowT) => r.deptName ?? r.dept ?? null;
  const at = (r: CaseRowT) => r.place ?? r.zoneName ?? null;
  // 1. the case past its deadline that matters most (else the most urgent open case)
  const first = lateRows[0] ?? rows.find((r) => r.overdue) ?? rows[0];
  if (first) {
    const h = holder(first), p = at(first), hTa = rowDeptTa(first);
    points.push(first.overdue
      ? { en: `First: ${clip(first.title, 120)}${p ? ` at ${p}` : ""} is past its deadline${h ? `; ${h} holds it, call them` : ""}.`,
        ta: `முதலில்: ${clip(first.title, 120)}${p ? `, ${p}` : ""} காலக்கெடு தாண்டிவிட்டது${hTa ? `; ${hTa} வசம் உள்ளது, அழையுங்கள்` : ""}.`, id: first.id }
      : { en: `First: ${clip(first.title, 120)}${p ? ` at ${p}` : ""}${first.sev ? `, ${first.sev.toLowerCase()}` : ""}${h ? `, with ${h}` : ""}.`,
        ta: `முதலில்: ${clip(first.title, 120)}${p ? `, ${p}` : ""}${hTa ? `; ${hTa} வசம் உள்ளது` : ""}.`, id: first.id });
  }
  // 2. a department sitting on several overdue cases
  // 2. a department sitting on several overdue cases: the count is the whole scope's, the department is read from the most serious of them
  const overdue = late ? lateRows : rows.filter((r) => r.overdue);
  const overdueAll = late ? late.incidents : overdue.length;
  if (overdueAll > 1) {
    const by = new Map<string, number>();
    for (const r of overdue) { const h = holder(r); if (h) by.set(h, (by.get(h) ?? 0) + 1); }
    const [dept, n] = [...by.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const of = late ? `${spoken(overdueAll)} open cases are past their deadline` : `${spoken(overdue.length)} of the ${spoken(rows.length)} most urgent open cases are past their deadline`;
    const ofTa = late ? `${spoken(overdueAll)} திறந்த சம்பவங்கள் காலக்கெடு தாண்டியவை` : `அவசரமான ${spoken(rows.length)} திறந்த சம்பவங்களில் ${spoken(overdue.length)} காலக்கெடு தாண்டியவை`;
    const part = late && overdueAll > overdue.length ? ` of the ${spoken(overdue.length)} most serious` : "";
    const partTa = late && overdueAll > overdue.length ? `மிகத் தீவிரமான ${spoken(overdue.length)}-இல்` : "";
    points.push({ en: `${of}${dept && n > 1 ? `, ${spoken(n)}${part} with ${dept}: ask for a status today` : ""}.`,
      ta: `${ofTa}${dept && n > 1 ? `; ${partTa ? `${partTa} ` : ""}${spoken(n)} ${rowDeptTa(overdue.find((r) => holder(r) === dept) ?? { deptName: dept })} வசம்: இன்றே நிலவரம் கேளுங்கள்` : ""}.`, id: null });
  }
  // 3. what is rising fastest, with the ask that fits it
  const rise = [...(d.categories ?? [])].filter((x) => Number(x.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta))[0];
  if (rise) {
    const act = actionFor(String(rise.label ?? rise.code ?? ""));
    points.push({ en: `${clip(rise.label, 60)} rose by ${spoken(Number(rise.delta))} ${inPeriod(s.period)} (${spoken(Number(rise.n))} against ${spoken(Number(rise.prev))}). Suggested: ${act.en}.`,
      ta: `${clip(kindTa(rise), 60)} ${PERIOD_TA[s.period]} ${spoken(Number(rise.delta))} கூடியது (${spoken(Number(rise.n))}, முன்பு ${spoken(Number(rise.prev))}). பரிந்துரை: ${act.ta}.`, id: null });
  }
  // 4. the busiest spot
  const place = d.places?.[0];
  if (place && points.length < 4) points.push({ en: `The busiest spot is ${clip(place.place, 60)}: ${spoken(Number(place.n))} ${clip(place.category, 50).toLowerCase()}.`,
    ta: `அதிக சம்பவங்கள்: ${clip(place.place, 60)} (${spoken(Number(place.n))}).`, id: null });
  const titles = bi(`What needs you first${where.en}`, `இப்போது என்ன செய்ய வேண்டும்${where.ta}`);
  const title = titles[ta ? "ta" : "en"];
  if (!points.length) return { title: titles, takeaway: null, say: bi(`Nothing open needs you${where.en} right now.`, `இப்போது${where.ta} உங்கள் கவனம் தேவைப்படும் திறந்த சம்பவம் இல்லை.`), blocks: [] };
  const blocks: BlockT[] = [{ kind: "Brief", id: "advise", title, points: points.map((p) => ({ text: clip(ta ? p.ta : p.en, 400), incidentId: p.id })) }];
  if (rows.length) blocks.push({ kind: "CaseList", id: "open", title: ta ? "அவசரமான திறந்த சம்பவங்கள்" : "The most urgent open cases", source: "list", sev: null, total: rows.length, rows });
  const cats = [...(d.categories ?? [])].sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 8);
  if (cats.length) blocks.push({ kind: "Chart", id: "chart", title: ta ? "முந்தைய காலத்தை விட மாற்றம்" : "Change against the period before", chart: "hbar", unit: "incidents", labels: cats.map((x) => kindLabel(c, x)), values: cats.map((x) => Number(x.delta)) });
  const n = points.length;
  const say = bi(`${n === 1 ? "One thing needs" : `${spoken(n)} things need`} you${where.en}. ${points.slice(0, 3).map((p) => p.en).join(" ")}`,
    `${where.ta ? `${where.ta.trim()} ` : ""}${spoken(n)} விஷயங்கள் உங்கள் கவனத்துக்கு. ${points.slice(0, 3).map((p) => p.ta).join(" ")}`);
  return { title: titles, takeaway: null, say, blocks };
}

// ------------------------------------------------------------------ insight --

/**
 * "What stands out?": the zones unlike the rest (modified z-score), whether the latest count is outside its limits (c-chart),
 * and which way the series is going (Theil-Sen with Mann-Kendall). Every finding carries its method, its n and a caveat. The
 * spoken line reads only those.
 */
async function insight(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const ta = c.ta;
  const [zr, ser, drv] = await Promise.all([
    call(c, "zones", { scope: scopeArg({ ...s, zone: null }) }),
    call(c, "incident_series", { scope: scopeArg(s) }),
    call(c, "change_drivers", { scope: scopeArg(s) }).catch(() => null)
  ]);
  const zrows = ((zr.data as { rows?: Row[] }).rows ?? []);
  const buckets = ((ser.data as { buckets?: Row[] }).buckets ?? []);
  const counts = buckets.map((b) => Number(b.n) || 0);
  // 2-hour buckets swing with the time of day: no limits or trend are read from them (queries.ts refuses a normal band on them too)
  const hourly = /hour|2h/.test(String((ser.data as { unit?: unknown }).unit ?? ""));
  const labels = buckets.map((b) => (hourly ? when(b.from)?.split(", ")[1] ?? "" : when(b.from)?.split(",")[0] ?? ""));
  if (hourly) c.notes.push(bi("Counts per 2 hours swing with the time of day, so no limits or trend are read from them.", "2 மணி நேரக் கணக்குகள் நாளின் நேரத்தோடு மாறும்: அவற்றிலிருந்து வரம்போ போக்கோ கணிக்கவில்லை."));
  const items: Extract<BlockT, { kind: "Findings" }>["items"] = [];
  const zoneLabel = (z: number) => (ta ? zoneTa(w, z) : zoneName(w, z)) ?? `Zone ${z}`;
  const open = modifiedZ(zrows.map((z) => ({ key: String(z.zone), value: Number(z.open ?? z.n ?? 0) })));
  const severe = modifiedZ(zrows.map((z) => ({ key: String(z.zone), value: Number(z.severe ?? 0) })));
  for (const o of open.value.slice(0, 2)) items.push({ title: ta ? `${zoneLabel(Number(o.key))}: மற்ற மண்டலங்களை விட ${o.z > 0 ? "அதிகம்" : "குறைவு"} திறந்த சம்பவங்கள்` : `${zoneLabel(Number(o.key))} has ${o.z > 0 ? "far more" : "far fewer"} open cases than the other zones`, value: o.value, unit: ta ? "திறந்தவை" : "open", method: open.method, n: open.n, caveat: ta ? open.caveat.ta : open.caveat.en, tone: "bad" });
  for (const o of severe.value.slice(0, 1)) if (!open.value.some((x) => x.key === o.key)) items.push({ title: ta ? `${zoneLabel(Number(o.key))}: கடுமையான சம்பவங்கள் அசாதாரணம்` : `${zoneLabel(Number(o.key))} stands out for severe cases`, value: o.value, unit: ta ? "கடுமையானவை" : "severe", method: severe.method, n: severe.n, caveat: ta ? severe.caveat.ta : severe.caveat.en, tone: "bad" });
  const chart = cChart(counts);
  const latestOut = !hourly && chart.value.latestOut;
  if (!hourly && counts.length >= 4) items.push({ title: chart.value.latestOut ? (ta ? `கடைசிக் கால எண்ணிக்கை வரம்புக்கு வெளியே` : `The latest count is outside its usual limits`) : (ta ? `கடைசிக் கால எண்ணிக்கை வழக்கமான வரம்புக்குள்` : `The latest count is within its usual limits`), value: chart.value.latest, unit: ta ? "சம்பவங்கள்" : "incidents", method: chart.method, n: chart.n, caveat: ta ? chart.caveat.ta : chart.caveat.en, tone: chart.value.latestOut ? "bad" : "ok" });
  const trendS = trendOf(counts);
  if (!hourly && counts.length >= 4) items.push({ title: trendS.value.direction === "rising" ? (ta ? "போக்கு உயர்கிறது" : "The series is rising") : trendS.value.direction === "falling" ? (ta ? "போக்கு குறைகிறது" : "The series is falling") : (ta ? "தெளிவான போக்கு இல்லை" : "No clear trend"), value: trendS.value.slope, unit: ta ? "ஒரு காலத்துக்கு" : "per period", method: trendS.method, n: trendS.n, caveat: ta ? trendS.caveat.ta : trendS.caveat.en, tone: trendS.value.direction === "rising" ? "warn" : "ok" });
  const d = (drv?.data ?? {}) as { categories?: Row[] };
  const rise = [...(d.categories ?? [])].filter((x) => Number(x.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta))[0];
  if (rise) items.push({ title: ta ? `வேகமாக உயர்வது: ${clip(kindLabel(c, rise), 60)}` : `Rising fastest: ${clip(rise.label, 60)}`, value: Number(rise.delta), unit: ta ? "கூடுதல்" : "more", method: `Against the period before (${Number(rise.prev)} to ${Number(rise.n)})`, n: 2, caveat: ta ? "இரண்டு காலங்களின் ஒப்பீடு மட்டுமே." : "A comparison of two periods only.", tone: "warn" });
  const titles = bi("What stands out", "தனித்து நிற்பவை");
  const title = titles[ta ? "ta" : "en"];
  if (!items.length) return { title: titles, takeaway: null, say: bi("Nothing stands out in this data.", "இந்தத் தரவில் தனித்து நிற்பது எதுவும் இல்லை."), blocks: [] };
  const lead = open.value[0];
  const en = lead ? `${zoneName(w, Number(lead.key)) ?? ""} stands out: ${spoken(lead.value)} open cases against a typical ${spoken(lead.median)}.` : `No zone stands out from the rest${latestOut ? ", but the latest count is outside its usual limits" : ""}.`;
  const tam = lead ? `${zoneTa(w, Number(lead.key)) ?? ""} தனித்து நிற்கிறது: ${spoken(lead.value)} திறந்த சம்பவங்கள், வழக்கமாக ${spoken(lead.median)}.` : `எந்த மண்டலமும் தனித்து நிற்கவில்லை${latestOut ? ", ஆனால் கடைசி எண்ணிக்கை வரம்புக்கு வெளியே" : ""}.`;
  const marks = hourly ? [] : chart.value.signals.slice(0, 8).map((i) => ({ i, why: ta ? "வரம்புக்கு வெளியே" : "Outside the limits" }));
  const blocks: BlockT[] = [{ kind: "Findings", id: "find", title, items: items.slice(0, 6) }];
  if (counts.length) blocks.push({ kind: "Trend", id: "trend", title: ta ? "காலவாரி எண்ணிக்கை" : "Incidents over time", unit: "incidents", labels, values: counts, marks, normal: hourly ? null : { lo: chart.value.lcl, hi: chart.value.ucl } });
  blocks.push({ kind: "MapView", id: "map", title: ta ? "மண்டலங்கள்" : "The zones", rule: open.method, shade: { geo: "zone", label: L(c, "Open incidents", "திறந்த சம்பவங்கள்"), values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.open ?? x.n ?? 0) })) }, points: [], outline: open.value.map((o) => Number(o.key)).slice(0, 15) });
  return { title: titles, takeaway: bi(en, tam), say: bi(en, tam), blocks };
}

// ------------------------------------------------------------------ complete --

/**
 * "Complete this data": the open Stage's list (slots.ids), a Studio dataset named in the sentence, or the unresolved incidents,
 * one page of them, and the screen says how many of how many. A cell is filled only from deterministic code (complete.ts) and
 * shows its source; what cannot be filled is named. Nothing is guessed, and follow-ups for what is left are offered as drafts.
 */
async function complete(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const ta = c.ta;
  let input: InRow[] = [];
  let whatEn = "Unresolved incidents", whatTa = "தீர்க்கப்படாத சம்பவங்கள்";
  let read = 0, total = 0;
  const toIn = (x: CaseRowT, asOf: string | null | undefined): InRow => ({ id: x.id, title: x.title, zone: x.zone, zoneName: x.zoneName, ward: x.ward, place: x.place, dept: x.dept, deptName: x.deptName, cat: x.cat, lat: x.lat, lon: x.lon, t: x.t, hours: hoursBetween(x.t, asOf ?? c.asOf) });
  const ds = slots.name && c.h.dataset ? await c.h.dataset(slots.name) : null;
  if (ds) {
    c.runs.push("studio_dataset");
    c.sources.add(`Data Studio: ${ds.name}`);
    whatEn = whatTa = clip(ds.name, 100);
    input = ds.rows.slice(0, 30).map((x) => ({ ...x, id: clip(x.id, 80) }));
    read = input.length; total = ds.total ?? read;
  } else if (slots.ids?.length) {
    // the rows on the open Stage, one incident at a time, a few at once: an id the store no longer holds is said, not hidden
    whatEn = "This list"; whatTa = "இந்தப் பட்டியல்";
    c.runs.push("incident_detail");
    c.sources.add("incident_detail");
    const got: (ToolResult | null)[] = [];
    for (let i = 0; i < slots.ids.length; i += 6) got.push(...await Promise.all(slots.ids.slice(i, i + 6).map((id) => c.h.tool("incident_detail", { id }).catch(() => null))));
    for (const r of got) {
      const inc = (r?.data as { incident?: Row } | null | undefined)?.incident;
      if (!inc) continue;
      c.asOf ??= r?.asOf ?? null;
      input.push(toIn(caseRow(inc, w), r?.asOf));
    }
    read = total = input.length;
    if (input.length < got.length) c.notes.push(bi(`${got.length - input.length} of the ${got.length} rows could not be read.`, `${got.length}-இல் ${got.length - input.length} வரிசைகளைப் படிக்க முடியவில்லை.`));
  } else {
    const data = await incidentList(c, { status: "open", sort: "sev" });
    input = data.rows.map((x) => toIn(caseRow(x, w), c.asOf));
    read = input.length; total = Math.max(Number(data.total) || 0, read);
    if (slots.fresh) input = input.filter((x) => !x.zone || !x.place || !x.dept);
  }
  const k: Lookups = c.h.lookups?.(w) ?? {};
  const res = completeRows(input, k);
  // the screen covers part of a longer list: said in its title (so the figures are on the Stage), its takeaway and its first words
  const part = total > read;
  const titles = bi(clip(`${whatEn}: completed${part ? ` (first ${read} of ${total})` : ""}`, 160), clip(`${whatTa}: நிரப்பியவை${part ? ` (முதல் ${read}, மொத்தம் ${total})` : ""}`, 160));
  const title = titles[ta ? "ta" : "en"];
  if (!res.rows.length) return { title: titles, takeaway: null, say: bi("Nothing here to complete.", "நிரப்ப வேண்டியது எதுவும் இல்லை."), blocks: [] };
  const COLS = [{ key: "ward", en: "Ward", ta: "வார்டு" }, { key: "zone", en: "Zone", ta: "மண்டலம்" }, { key: "place", en: "Place", ta: "இடம்" }, { key: "dept", en: "Department", ta: "துறை" }, { key: "age", en: "Open, hours", ta: "திறந்த மணி" }] as const;
  const shown = res.rows.slice(0, 30);
  const blocks: BlockT[] = [{ kind: "Filled", id: "filled", title, cols: COLS.map((x) => ({ key: x.key, label: ta ? x.ta : x.en })),
    rows: shown.map((r) => ({ id: r.id, title: clip(r.title, 240), cells: COLS.map((x) => { const v = r.cells[x.key]; return { v: typeof v.v === "string" ? clip(v.v, 160) : v.v, src: v.src, filled: v.filled }; }) })),
    filled: res.filled, left: res.left, cannot: res.cannot.slice(0, 8).map((x) => ({ col: x.col, n: x.n, why: ta ? x.ta : x.why })) }];
  const leftWords = res.cannot.map((x) => `${spoken(x.n)} ${x.col}`).join(", ");
  const lead = part ? bi(`The first ${spoken(read)} of ${spoken(total)}. `, `மொத்தம் ${spoken(total)}-இல் முதல் ${spoken(read)}. `) : bi("", "");
  // only gaps filled count: the age column is worked out for every row and fills nothing
  const say = bi(`${lead.en}${res.filled ? `I filled ${spoken(res.filled)} cells, each with its source. ` : res.left ? "" : "Nothing is missing in these rows."}${res.left ? `${spoken(res.left)} could not be filled: ${leftWords}. Nothing was guessed.` : res.filled ? "Nothing is left blank." : ""}`,
    `${lead.ta}${res.filled ? `${spoken(res.filled)} இடங்களை நிரப்பினேன், ஒவ்வொன்றுக்கும் ஆதாரத்துடன். ` : res.left ? "" : "இந்த வரிசைகளில் எதுவும் விடுபடவில்லை."}${res.left ? `${spoken(res.left)} நிரப்ப முடியவில்லை. எதையும் ஊகிக்கவில்லை.` : res.filled ? "எதுவும் காலியாக இல்லை." : ""}`);
  const ids = res.unresolved.slice(0, 10);
  const next: NextStepT[] = ids.length ? [{ label: bi(`Draft follow-ups for ${spoken(ids.length)} unresolved`, `தீர்க்கப்படாத ${spoken(ids.length)}-க்கு வரைவு`), kind: "draft", recipe: null, slots: null, ids, text: null }] : [];
  c.notes.push(bi("A filled cell shows where the value came from. Blank cells are left blank on purpose.", "நிரப்பிய ஒவ்வொரு இடமும் அதன் ஆதாரத்தைக் காட்டும். காலி இடங்கள் வேண்டுமென்றே காலியாக விடப்பட்டன."));
  if (res.derived) c.notes.push(bi("Open, hours is worked out from the report time and is not counted as filled.", "திறந்த மணி நேரம் பதிவின் நேரத்திலிருந்து கணக்கிடப்பட்டது; நிரப்பியதாக எண்ணப்படவில்லை."));
  return { title: titles, takeaway: bi(`${lead.en}${spoken(res.filled)} filled, ${spoken(res.left)} left.`, `${lead.ta}${spoken(res.filled)} நிரப்பியது, ${spoken(res.left)} மீதம்.`), say, blocks, next };
}

// ------------------------------------------------------------------ cases --

async function cases(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const sp = spanned(slots);
  if (sp) return spanCases(c, sp);
  const sev = slots.sev;
  const n = Math.min(Math.max(slots.n ?? 12, 1), 30);
  let rows: CaseRowT[]; let total: number; let source: "console-severity" | "list";
  // how many of the whole list are past their deadline: counted over the list the figure is about, never over the rows on screen
  let lateAll: number | null = null;
  let groupsTotal: number | null = null;
  const sortKey = slots.sort === "complaints" ? "c" : slots.sort === "time" ? "t" : "sev";
  // 23 Nov: "open the top three cases": exactly that many, in priority order, each with the reasons its priority was given
  const top = slots.top != null && slots.top >= 1 ? Math.min(slots.top, 20) : null;
  const pri = new Map<string, { score: number | null; why: Bilingual | null }>();
  const keep = <T extends Row>(xs: T[]): T[] => { for (const x of xs) pri.set(String(x.id), { score: num(x.priority), why: priorityWhy(x) }); return xs; };
  // "the severe cases": exactly the console's severity panel for this scope
  if (sev && !slots.q && !slots.status) {
    c.runs.push("console_severe");
    const r = await c.h.severe(s);
    c.sources.add("console severity panel");
    c.asOf ??= r.asOf;
    rows = keep(r.rows.filter((x) => x.sev === sev)).map((x) => caseRow(x, w));
    total = Number(r.counts[sev] ?? rows.length);
    source = "console-severity";
    lateAll = await lateTotal(c, sev, null);
  } else if (slots.status === "overdue" && c.h.list) {
    // the console's own past-deadline filter: its rows and its whole count (BUG-007, BUG-021)
    const r = await incidentList(c, { sev, status: "overdue", q: slots.q, sort: sortKey });
    rows = keep(r.rows).map((x) => caseRow(x, w));
    // rows are groups of one problem, the count is of incidents, as the console's past-deadline tile counts them
    total = lateAll = r.incidents;
    groupsTotal = r.total;
    source = "list";
  } else {
    const r = await incidentList(c, { sev, status: slots.status, q: slots.q, sort: sortKey });
    rows = keep(r.rows).map((x) => caseRow(x, w));
    if (slots.status === "overdue") rows = rows.filter((x) => x.overdue);
    // the headline counts incidents, as the past-deadline figure does; a list row is a group of them, so the part is never larger than the whole
    total = r.incidents;
    if (c.h.list) groupsTotal = r.total;
    if (slots.status === "overdue") {
      // hands without the console list (a test's): the list is one page of 12, so the overdue total is counted for the whole scope from
      // the departments' follow-ups, or the filtered list is read page by page (never from that page: BUG-007).
      // The rows shown are read the same way in both cases: a zone's overdue cases are not on the first page of 12, so the list is read page by page
      // (until a screenful is found when only the follow-ups count the total), each case once (SK-1, SK-2: "overdue cases in Tondiarpet" said none while three were past their deadline)
      let seen = r.rows.length, page = 0;
      const have = new Set(rows.map((x) => x.id));
      const more: CaseRowT[] = [];
      while (seen < r.total && page < 8 && (!!sev || !!slots.q || rows.length + more.length < n)) {
        page++;
        const p = await incidentList(c, { sev, status: "overdue", q: slots.q, sort: "sev", page }).catch(() => null);
        if (!p?.rows.length) break;
        seen += p.rows.length;
        for (const x of p.rows.map((y) => caseRow(y, w)).filter((y) => y.overdue)) if (!have.has(x.id)) { have.add(x.id); more.push(x); }
      }
      if (!sev && !slots.q) {
        const fu = await call(c, "dept_followups", { scope: scopeArg(s) }).catch(() => null);
        const fr = ((fu?.data as { rows?: Row[] } | undefined)?.rows ?? []).filter((x) => !s.dept || x.code === s.dept);
        total = fr.length ? Math.max(rows.length + more.length, fr.reduce((a, x) => a + (num(x.overdue) ?? 0), 0)) : rows.length + more.length;
      } else total = rows.length + more.length;
      rows = [...rows, ...more];
      lateAll = total;
    } else {
      lateAll = await lateTotal(c, sev, slots.q);
    }
    source = "list";
  }
  // the console's own list is shown whole ("the 6 severe cases" are the ones it shows, however many it shows now)
  // (23 Nov: unless a count was asked: "open top three cases" showed every severe case)
  rows = sortRows(rows, slots.sort).slice(0, top ?? (source === "console-severity" ? 30 : n));
  if (top && rows.length) return topCases(c, rows, total, sev, top, pri, source);
  // the list is complete when the rows shown are all of it: only then is a count over its rows (who holds most) a count of the list
  const complete = rows.length >= (groupsTotal ?? total);
  const sevWord = sev ? sev.toLowerCase() : "";
  const scope = scopeWords(w, { ...s, sev: null });
  // the words searched for are shown without a figure of their own (Finding 51: a model's "flood deaths 300" became the title)
  const topic = words(c, slots.q, 80);
  const titles = bi(`${sev ? `${sev} cases` : topic ? `Cases: ${topic}` : "Cases"} · ${scope.en}`, `${sev ? `${SEV_TA[sev]} சம்பவங்கள்` : topicTa(c, topic) ? `சம்பவங்கள்: ${topicTa(c, topic)}` : "சம்பவங்கள்"} · ${scope.ta}`);
  const title = L(c, titles.en, titles.ta);
  if (!rows.length) {
    // filters left on the console (not named in this request) can empty the list: say so and offer the whole district
    const inherited = (s.zone && !slots.zones.length) || (s.cat && !slots.cat) || (s.dept && !slots.dept) || (s.taluk && !slots.taluk);
    const filters = scopeWords(w, { ...s, sev: null, period: s.period });
    return { title: titles, takeaway: null,
      say: inherited
        ? bi(`No ${sevWord} cases ${inPeriod(s.period)} with the console's filters (${filters.en}). Say "all of Chennai" to look across the district.`, `கன்சோல் வடிகட்டிகளுடன் (${filters.ta}) ${sev ? SEV_TA[sev] : ""} சம்பவங்கள் இல்லை. முழு மாவட்டத்தையும் பார்க்க "முழு சென்னை" என்று சொல்லுங்கள்.`)
        : bi(`There are no ${sevWord ? `${sevWord} ` : ""}cases ${inPeriod(s.period)} for this view.`, `இந்தப் பார்வையில் ${PERIOD_TA[s.period]} ${sev ? SEV_TA[sev] : ""} சம்பவங்கள் இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: inherited ? L(c, `No incidents match this view. The console still has these filters on: ${filters.en}.`, `இந்தப் பார்வைக்கு எந்தச் சம்பவமும் பொருந்தவில்லை. கன்சோலில் இந்த வடிகட்டிகள் இன்னும் உள்ளன: ${filters.ta}.`) : L(c, "No incidents match this view.", "இந்தப் பார்வைக்கு எந்தச் சம்பவமும் பொருந்தவில்லை.") }],
      next: inherited ? [{ label: { en: "All of Chennai", ta: "முழு சென்னை" }, kind: "direct", recipe: "cases", slots: { ...slots, zones: [], dept: null, cat: null, taluk: null, fresh: true }, ids: [], text: null }] : [] };
  }
  const lateShown = rows.filter((r) => r.overdue).length;
  const late = lateAll ?? lateShown;
  // the severity panel's total counts cases (one per group of the same problem) and the past-deadline figure counts incidents, as the console's
  // tiles do: the sentence says so, so "9 severe cases, 10 past their deadline" is not read as 10 of 9 (QA4 gate, FB-1)
  const say = casesSay(rows, total, sev, s.period, { late: lateAll ?? undefined, complete, incidents: source === "console-severity", places: c.w.places });
  // the figure is the list's own: "of the whole list" when the screen shows part of it, "of those shown" only when the count could not be made
  // the severity panel counts its own rows and the past-deadline figure counts incidents, so a part can be larger than the whole ("54 of the 52"): then it is said without the whole
  const takeaway = late ? (lateAll != null && late > total
    ? bi(`${late} ${source === "console-severity" ? `incident${late === 1 ? " is" : "s are"}` : late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `${late} ${source === "console-severity" ? "பதிவுகள் " : ""}காலக்கெடுவைத் தாண்டியவை.`)
    : lateAll != null
    ? bi(`${late} of the ${total} ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `${total}-இல் ${late} காலக்கெடுவைத் தாண்டியவை.`)
    : bi(`${late} of the ${rows.length} shown ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `காட்டப்பட்ட ${rows.length}-இல் ${late} காலக்கெடுவைத் தாண்டியவை.`)) : null;
  const pts = points(rows);
  const blocks: BlockT[] = [];
  const byDept = new Map<string, number>();
  for (const r of rows) if (r.deptName) byDept.set(r.deptName, (byDept.get(r.deptName) ?? 0) + 1);
  // "held by" counts the rows it is given, so it is shown only for a list shown whole
  const lead = complete ? [...byDept.entries()].sort((a, b) => b[1] - a[1])[0] : undefined;
  blocks.push({ kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
    { key: "total", label: L(c, `${sev ?? "All"} cases, ${PERIOD_EN[s.period]}`, `${sev ? SEV_TA[sev] : "எல்லா"} சம்பவங்கள், ${PERIOD_TA[s.period]}`), value: total, unit: null, prev: null, delta: null, tone: sev === "Severe" ? "bad" : "neutral", spark: [] },
    { key: "late", label: L(c, "Past their deadline", "காலக்கெடு தாண்டியவை"), value: late, unit: null, prev: null, delta: null, tone: late ? "bad" : "good", spark: [] },
    ...(lead && lead[1] >= 2 ? [{ key: "dept", label: L(c, `Held by ${lead[0]}`, `${deptTaByName(rows).get(lead[0]) ?? lead[0]} வசம்`), value: lead[1], unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : [])
  ] });
  blocks.push({ kind: "CaseList", id: "cases", title, source, sev, total, rows });
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: L(c, "Where they are", "எங்கே உள்ளன"), rule: L(c, "Numbered as in the list; cases without an exact place are not drawn.", "பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை."), shade: null, points: pts, outline: s.zone ? [s.zone] : [] });
  return { title: titles, takeaway, say, blocks };
}

/**
 * 23 Nov: a case's priority reasons in plain words (the pipeline's priority_reasons, "Severe road accident (90); reported by 3 sources; 14
 * citizen complaints; resolution past the 48 h target"), without the severity score in brackets; the console's flags when there are none.
 */
export function priorityWhy(x: Row): Bilingual | null {
  const raw = String(x.priority_reasons ?? "").trim();
  const parts = raw ? raw.split(";").map((p) => p.replace(/\s*\(\d+(?:\.\d+)?\)\s*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean)
    : String(x.attention_reason ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const en = clip(parts.slice(0, 5).join("; "), 260);
  const TA: [RegExp, string][] = [[/reported by (\d+) sources/i, "$1 ஆதாரங்கள் தெரிவித்தவை"], [/(\d+) citizen complaints/i, "$1 குடிமக்கள் புகார்கள்"],
    [/(?:response|resolution) over twice the (\d+) h target/i, "$1 மணி நேர இலக்கைவிட இரு மடங்கு தாமதம்"], [/(?:response|resolution) past the (\d+) h target/i, "$1 மணி நேர இலக்கு தாண்டியது"],
    [/not yet verified by an officer/i, "அதிகாரி இன்னும் சரிபார்க்கவில்லை"], [/(\d+) new reports in 24 h/i, "24 மணி நேரத்தில் $1 புதிய பதிவுகள்"], [/covered by (\d+) news outlets/i, "$1 செய்தி ஊடகங்களில் வந்தது"],
    [/linked to a rain event/i, "மழையுடன் தொடர்புடையது"], [/in the news but not in any department's records/i, "செய்தியில் உள்ளது, துறைப் பதிவுகளில் இல்லை"]];
  const ta = parts.slice(1, 5).map((p) => { for (const [re, t] of TA) if (re.test(p)) return p.replace(re, t); return null; }).filter((p): p is string => !!p);
  return bi(en, ta.length ? ta.join("; ") : "");
}

/** what goes into a case's priority, said with a top-N list ("why these three") */
export const PRIORITY_HOW = bi("Why this order: each case's priority score adds up its severity, how far past its deadline it is, how many sources and citizen complaints report it, whether new reports are coming in, vulnerable people affected, news coverage and rain; the highest score comes first.",
  "வரிசை: ஒவ்வொரு சம்பவத்தின் முன்னுரிமை மதிப்பெண் அதன் தீவிரம், காலக்கெடு தாண்டிய அளவு, ஆதாரங்கள் மற்றும் புகார்களின் எண்ணிக்கை, புதிய பதிவுகள், பாதிக்கப்படும் மக்கள், செய்தி, மழை ஆகியவற்றைக் கூட்டுகிறது; அதிக மதிப்பெண் முதலில்.");

/**
 * 23 Nov: "open the top three cases", "the top 3 severe cases in Adyar": exactly that many, by priority, each named with why its priority is
 * high, then how the order was made. The list, its map and the reasons are on the screen; every figure said is in the reasons shown.
 */
function topCases(c: Ctx, rows: CaseRowT[], total: number, sev: Sev | null, top: number, pri: Map<string, { score: number | null; why: Bilingual | null }>, source: "console-severity" | "list"): Part {
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, sev: null });
  const kind = sev ? `${sev.toLowerCase()} ` : "";
  const name = (r: CaseRowT) => { const l = spokenLabel(r); const at = r.zoneName && !l.includes(r.zoneName) ? ` in ${r.zoneName}` : ""; return `${l}${at}`; };
  const nameTa = (r: CaseRowT) => [plainWhat(r.cat, r.title)?.ta ?? "ஒரு பிரச்சினை", r.zone ? ZONE_TA[r.zone] ?? r.zoneName : r.zoneName].filter(Boolean).join(", ");
  const whyOf = (r: CaseRowT): Bilingual | null => pri.get(r.id)?.why ?? (r.why ? bi(r.why, "") : null);
  const head = rows.length < top
    ? `There ${rows.length === 1 ? "is" : "are"} only ${plural(rows.length, `${kind}case`, `${kind}cases`)} ${inPeriod(s.period)}`
    : `The top ${spoken(top)} of ${plural(Math.max(total, rows.length), `${kind}case`, `${kind}cases`)} ${inPeriod(s.period)}, by priority`;
  const en = `${head}: ${rows.map((r, k) => { const y = whyOf(r); return `${k + 1}. ${name(r)}${y?.en ? ` (${y.en})` : ""}${r.overdue ? ", past its deadline" : ""}`; }).join("; ")}.`;
  const ta = `முன்னுரிமைப்படி முதல் ${spoken(rows.length)} ${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள்: ${rows.map((r, k) => { const y = whyOf(r); return `${k + 1}. ${nameTa(r)}${y?.ta ? ` (${y.ta})` : ""}`; }).join("; ")}.`;
  const title = bi(`Top ${spoken(rows.length)} ${kind}cases · ${scope.en}`, `முதல் ${spoken(rows.length)} ${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள் · ${scope.ta}`);
  const blocks: BlockT[] = [];
  // the whole answer in words, so every figure said (sources, complaints, hours past the target) is on the screen
  blocks.push({ kind: "Answer", id: "say", title: L(c, title.en, title.ta), text: clip(`${en} ${PRIORITY_HOW.en}`, 900), facts: [] });
  blocks.push({ kind: "CaseList", id: "cases", title: L(c, title.en, title.ta), source, sev, total, rows });
  blocks.push({ kind: "Ranking", id: "why", title: L(c, "Why each is here", "ஒவ்வொன்றும் ஏன் இங்கே"), unit: L(c, "priority", "முன்னுரிமை"), method: clip(L(c, PRIORITY_HOW.en, PRIORITY_HOW.ta), 240), order: "top",
    items: rows.map((r, k) => ({ key: `p${k}`, label: clip(c.ta ? nameTa(r) : name(r), 120), value: Math.round(pri.get(r.id)?.score ?? 0), rank: k + 1,
      sub: clip((c.ta ? whyOf(r)?.ta || whyOf(r)?.en : whyOf(r)?.en) ?? "", 160) || null, zone: r.zone, lat: r.lat, lon: r.lon, action: "none" as const })) });
  const pts = points(rows, rows.length);
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: L(c, "Where they are", "எங்கே உள்ளன"), rule: null, shade: null, points: pts, outline: s.zone ? [s.zone] : [] });
  return { title, takeaway: PRIORITY_HOW, say: bi(`${en} ${PRIORITY_HOW.en}`, `${ta} ${PRIORITY_HOW.ta}`), blocks };
}

/**
 * The spoken summary of a list of cases, as an aide would give it: how many, which need the Collector first and why (past
 * their deadline), who holds most of them, and what to say next. Names come from each incident's own short summary,
 * never an id or a citizen's words; every figure is a count of the rows.
 */
export function casesSay(rows: CaseRowT[], total: number, sev: Sev | null, period: PeriodKey, opts: { late?: number; complete?: boolean; when?: Bilingual; state?: Bilingual; incidents?: boolean;
  /** the gazetteer a case's place is named from (narrate.ts spokenPlace): a record's place text is never said as it is (reviewerF-02) */
  places?: Gazetteer } = {}): Bilingual {
  const sevWord = sev ? `${sev.toLowerCase()} ` : "";
  const placeOf = (r: CaseRowT) => spokenPlace(r.place, opts.places);
  // a case is named by its short summary; a long title would be the record read out, so it is retold as its kind and place
  const where = (r: CaseRowT) => {
    let l = spokenLabel(r);
    if (l.split(/\s+/).length >= 6) { const k = plainWhat(r.cat, r.title); const at = placeOf(r); l = `${k ? k.en : "an issue"}${at ? ` at ${at}` : ""}`; }
    return r.zoneName && !l.includes(r.zoneName) ? `${l} in ${r.zoneName}` : l;
  };
  // the Tamil line names a case by its kind in Tamil, its place and its zone: the English summary is a sentence of the record's own, and a Tamil answer holds no English sentence (QA4 G1, AUD-NF-17)
  const whereTa = (r: CaseRowT) => [plainWhat(r.cat, r.title)?.ta ?? "ஒரு பிரச்சினை", ((at) => (at && at !== r.zoneName ? at : null))(placeOf(r)), r.zoneName ? (r.zone ? ZONE_TA[r.zone] : null) ?? r.zoneName : null].filter(Boolean).join(", ");
  const late = rows.filter((r) => r.overdue);
  // the past-deadline figure is the whole list's when the caller counted it; the rows shown only name the cases
  const lateN = opts.late ?? late.length;
  const first = late.length ? late.slice(0, 2) : rows.slice(0, 1);
  const byDept = new Map<string, number>();
  for (const r of rows) if (r.deptName) byDept.set(r.deptName, (byDept.get(r.deptName) ?? 0) + 1);
  // who holds most is a count over the rows given: said only for a list given whole
  const [lead] = (opts.complete ?? rows.length >= total) ? [...byDept.entries()].sort((a, b) => b[1] - a[1]) : [];
  // a span named in the request is said as it was counted ("today (6 Nov, since midnight)", "right now, whatever the day reported"), never as a window
  const head = `${plural(total, `${sevWord}case`, `${sevWord}cases`)}${opts.state?.en ?? ""} ${opts.when?.en ?? inPeriod(period)}${rows.length < total ? `; here are the ${rows.length} that matter most` : ""}.`;
  const unit = opts.incidents && opts.late != null ? "incident" : "";
  const lateWho = (n: number) => (unit ? (n === 1 ? "One incident is" : `${spoken(n)} incidents are`) : n === 1 ? "One is" : `${spoken(n)} are`);
  const need = late.length
    ? `${lateN === 1 ? `${unit ? "One incident is" : "One is"} past its deadline and needs` : `${unit ? `${spoken(lateN)} incidents are` : `${spoken(lateN)} are`} past their deadline and need`} you first: ${first.map(where).join(", and ")}.`
    : `${lateN ? `${lateWho(lateN)} past the deadline, not among these. ` : ""}The most urgent: ${where(first[0])}.`;
  const who = lead && lead[1] >= 2 ? `${lead[0]} holds ${spoken(lead[1])} of them.` : "";
  const en = [head, need, who, "Say \"read them\", or \"open\" and a number."].filter(Boolean).join(" ");
  const ta = [`${opts.when?.ta ?? PERIOD_TA[period]} ${spoken(total)} ${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள்${opts.state?.ta ?? ""}.`,
    late.length ? `${lateN === 1 ? `1 ${unit ? "பதிவு " : ""}காலக்கெடு தாண்டியது, முதலில் கவனிக்க வேண்டியது` : `${spoken(lateN)} ${unit ? "பதிவுகள் " : ""}காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை`}: ${first.map(whereTa).join("; ")}.` : `${lateN ? `${nTa(lateN, "காலக்கெடு தாண்டியது", "காலக்கெடு தாண்டியவை")}, இவற்றில் இல்லை. ` : ""}மிக அவசரமானது: ${whereTa(first[0])}.`,
    lead && lead[1] >= 2 ? `${deptTaByName(rows).get(lead[0]) ?? lead[0]} வசம் ${spoken(lead[1])}.` : "", "\"படி\" அல்லது \"திற\" என்று எண்ணுடன் சொல்லுங்கள்."].filter(Boolean).join(" ");
  return bi(en, ta);
}

// ------------------------------------------------------------------ spans (QA pass 7) --
// A request that names a span the console's four windows do not hold ("today" since midnight, yesterday, last month, a named month, "right now") is
// counted over that span's own dates with Ask District IQ's counting (data.ts consoleSpan), and every line says the span: never the window that
// happens to be nearest (P6-022: "today" answered with this week; pass4-open-16: "last month" answered with the last 30 days). The meaning of the
// words is the shared reader's (lib/period/read.ts).

/** The span a request names with its own dates, when this screen must count it itself (not a comparison: that is periodCompare). */
const spanned = (slots: Slots): PeriodSpec | null => (slots.span && needsDates(slots.span) && slots.span.kind !== "compare" ? slots.span : null);
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** the period reader's notes (lib/period/read.ts writes them in English) in both languages; one it does not know is left out of a Tamil screen */
const spanNote = (n: string): Bilingual => bi(n, !/180 days/.test(n) ? ""
  : /start of this month/.test(n) ? "பதிவுகள் ஏறக்குறைய 180 நாட்கள் வரை மட்டுமே உள்ளன; இந்த மாதத்தின் தொடக்கம் அவற்றில் இல்லை."
  : /start of this period/.test(n) ? "பதிவுகள் ஏறக்குறைய 180 நாட்கள் வரை மட்டுமே உள்ளன; இந்தக் காலத்தின் தொடக்கம் அவற்றில் இல்லை."
  : "பதிவுகள் ஏறக்குறைய 180 நாட்கள் வரை மட்டுமே உள்ளன; அதிலிருந்து எண்ணப்பட்டது.");

/** Hands that cannot count a span (a test's fakes): said plainly, never answered with another window. */
function cannotSpan(c: Ctx, spec: PeriodSpec): Part {
  void spec;
  // every figure said is on the screen: the windows it can show are named in the note too
  return { title: heardTitle(c, bi("Cases", "சம்பவங்கள்")), takeaway: null,
    say: bi("I can't count that stretch of time here. Ask District IQ can, or I can show today, or the last 7, 30 or 90 days.", "அந்தக் காலத்தை இங்கே எண்ண முடியாது. District IQ-இடம் கேளுங்கள், அல்லது இன்று, கடந்த 7, 30, 90 நாட்களைக் காட்டலாம்."),
    blocks: [{ kind: "Note", id: "span", text: L(c, "This stretch of time is not one of the console's windows (today, the last 7, 30 or 90 days), and these figures could not be counted for it.",
      "இந்தக் காலம் கன்சோலின் சாளரங்களில் (இன்று, கடந்த 7, 30, 90 நாட்கள்) ஒன்றல்ல; இதற்கு இந்த எண்ணிக்கைகளை எண்ண முடியவில்லை.") }] };
}

async function spanCases(c: Ctx, spec: PeriodSpec): Promise<Part> {
  const { w, s, slots } = c;
  if (!c.h.span) return cannotSpan(c, spec);
  const sev = slots.sev;
  const n = Math.min(Math.max(slots.n ?? 12, 1), 30);
  const status = slots.status === "open" || slots.status === "overdue" ? slots.status : null;
  c.runs.push("incidents");
  c.sources.add("incidents");
  const r = await c.h.span(spec, s, { sev, status, n });
  if (!r) return cannotSpan(c, spec);
  c.asOf ??= r.asOf;
  const when = r.span.label;
  const rows = sortRows(r.rows.map((x) => caseRow(x, w)), slots.sort).slice(0, n);
  const asTa = c.ta;
  const scope = scopeWords(w, { ...s, sev: null }, false);
  const sevWord = sev ? `${sev.toLowerCase()} ` : "";
  // what was counted, said with the count: "open now" for the current state, "still open" or "past their deadline" when that was asked
  const state = r.span.now ? bi(status === "overdue" ? " open past their deadline now" : " open now", status === "overdue" ? " இப்போது காலக்கெடு தாண்டி நிலுவையில்" : " இப்போது நிலுவையில்")
    : status === "overdue" ? bi(" past their deadline", " காலக்கெடு தாண்டியவை") : status === "open" ? bi(" still open", " இன்னும் நிலுவையில்") : bi("", "");
  // (v18: a date or a range of dates reads "on 22 Nov", "from 15 Nov to 20 Nov"; the other spans read as they always did)
  const whenEn = r.span.now ? "" : /^[0-9]/.test(when.en) ? ` ${overWords(when.en)}` : ` ${when.en}`, whenTa = r.span.now ? "" : `${when.ta} `;
  // (the list's title has 160 characters on the catalog: a Tamil zone, department, kind and span ran past it and the screen was refused, review break C27)
  const titles = bi(clip([`${sev ? `${sev} cases` : "Cases"}`, scope.en, r.span.now ? "open now" : when.en].filter(Boolean).join(" · "), 160),
    clip([`${sev ? `${SEV_TA[sev]} சம்பவங்கள்` : "சம்பவங்கள்"}`, scope.ta, r.span.now ? "இப்போது" : when.ta].filter(Boolean).join(" · "), 160));
  const title = L(c, titles.en, titles.ta);
  const kpis: BlockT = { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
    { key: "total", label: clip(asTa ? `${sev ? SEV_TA[sev] : "எல்லா"} சம்பவங்கள்${state.ta}, ${r.span.now ? "எந்த நாள் பதிவானாலும்" : when.ta.replace(/\s*\(.*\)$/, "")}` : `${sev ?? "All"} cases${state.en}, ${r.span.now ? "whatever the day reported" : when.en}`, 80),
      value: r.total, unit: null, prev: r.prev?.n ?? null, delta: r.prev ? r.total - r.prev.n : null, tone: sev === "Severe" ? "bad" : "neutral", spark: [] },
    ...(status === "overdue" ? [] : [{ key: "late", label: asTa ? "காலக்கெடு தாண்டியவை" : "Past their deadline", value: r.late, unit: null, prev: null, delta: null, tone: r.late ? "bad" as const : "good" as const, spark: [] }]),
    ...(status || r.span.now ? [] : [{ key: "open", label: asTa ? "இன்னும் நிலுவையில்" : "Still open", value: r.open, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }])
  ] };
  if (r.prev && kpis.kind === "Kpis") c.notes.push(bi(`Beside the count: ${r.prev.label.en}, ${r.prev.n}.`, `ஒப்பீட்டுக்கு: ${r.prev.label.ta}, ${r.prev.n}.`));
  if (!r.total) {
    // none in the span asked: said for that span, never widened to another (P6-022)
    return { title: titles, takeaway: null, blocks: [kpis, { kind: "Note", id: "none", text: L(c, `No ${sevWord}incidents${state.en}${whenEn}${scope.en ? `, ${scope.en}` : ""}.`,
      `${whenTa}${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள்${state.ta} எதுவும் இல்லை${scope.ta ? `, ${scope.ta}` : ""}.`) }],
      say: bi(`No ${sevWord}cases${state.en}${whenEn}${r.span.now ? "" : "."}${r.span.now ? ", whatever the day reported." : ""}`, `${whenTa}${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள்${state.ta} எதுவும் இல்லை.`) };
  }
  const complete = rows.length >= r.total;
  const say = casesSay(rows, r.total, sev, s.period, { late: r.late, complete, places: c.w.places, when: bi(r.span.now ? "right now, whatever the day reported" : when.en, r.span.now ? "இப்போது, எந்த நாள் பதிவானாலும்" : when.ta), state });
  const late = r.late;
  const takeaway = late && status !== "overdue" ? bi(`${late} of the ${r.total} ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `${r.total}-இல் ${late} காலக்கெடுவைத் தாண்டியவை.`) : null;
  const blocks: BlockT[] = [kpis, { kind: "CaseList", id: "cases", title, source: "list", sev, total: r.total, rows }];
  const pts = points(rows);
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: asTa ? "எங்கே உள்ளன" : "Where they are", rule: asTa ? "பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை." : "Numbered as in the list; cases without an exact place are not drawn.", shade: null, points: pts, outline: s.zone ? [s.zone] : [] });
  return { title: titles, takeaway, say, blocks };
}

/** A brief on a place or a department over a span (a zone's report for last month): its figures over the span's own dates, and the cases that matter most. */
async function spanBrief(c: Ctx, spec: PeriodSpec): Promise<Part> {
  const { w, s } = c;
  // a body above the departments (GCC, PWD) has no one department to count by: not counted over a span here
  if (!c.h.span || c.slots.org) return cannotSpan(c, spec);
  c.runs.push("incidents");
  c.sources.add("incidents");
  const r = await c.h.span(spec, s, { sev: null, status: null, n: 6 });
  if (!r) return cannotSpan(c, spec);
  c.asOf ??= r.asOf;
  const when = r.span.label;
  const where = [zoneName(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.name ?? s.taluk : null, deptName(w, s.dept), catLabel(w, s.cat)].filter(Boolean).join(", ") || "Chennai district";
  const whereTa = [zoneTa(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.ta ?? s.taluk : null, deptTa(w, s.dept), catTa(w, s.cat)].filter(Boolean).join(", ") || "சென்னை மாவட்டம்";
  const rows = r.rows.map((x) => caseRow(x, w));
  const lead = r.span.now
    ? bi(`In ${where}, ${plural(r.total, "incident is", "incidents are")} open right now, whatever the day reported; ${spoken(r.late)} past ${r.late === 1 ? "its" : "their"} deadline, ${spoken(r.severe)} severe.`,
      `${whereTa}: இப்போது ${spoken(r.total)} சம்பவங்கள் நிலுவையில்; ${nTa(r.late, "காலக்கெடு தாண்டியது", "காலக்கெடு தாண்டியவை")}, ${nTa(r.severe, "கடுமையானது", "கடுமையானவை")}.`)
    : bi(`${capFirst(when.en)}: ${plural(r.total, "incident was", "incidents were")} reported in ${where}; ${spoken(r.open)} ${r.open === 1 ? "is" : "are"} still open, ${spoken(r.late)} past ${r.late === 1 ? "its" : "their"} deadline, ${spoken(r.severe)} severe.`,
      `${when.ta}: ${whereTa} பகுதியில் ${spoken(r.total)} சம்பவங்கள் பதிவாகின; ${spoken(r.open)} இன்னும் நிலுவையில், ${nTa(r.late, "காலக்கெடு தாண்டியது", "காலக்கெடு தாண்டியவை")}, ${nTa(r.severe, "கடுமையானது", "கடுமையானவை")}.`);
  const top = rows.slice(0, 4);
  const pointsTa = [{ text: lead.en, ta: lead.ta, incidentId: null as string | null },
    ...top.map((x) => ({ text: safeText(`${spokenLabel(x)}${x.zoneName && !spokenLabel(x).includes(x.zoneName) ? `, ${x.zoneName}` : ""}${x.overdue ? ": past its deadline" : ""}`, 400),
      ta: safeText(`${plainWhat(x.cat, x.title)?.ta ?? "ஒரு பிரச்சினை"}${x.zone ? `, ${ZONE_TA[x.zone] ?? x.zoneName ?? ""}` : ""}${x.overdue ? ": காலக்கெடு தாண்டியது" : ""}`, 400), incidentId: x.id }))];
  if (r.prev) c.notes.push(bi(`Reported ${r.prev.label.en}: ${r.prev.n}, for comparison.`, `ஒப்பீட்டுக்கு: ${r.prev.label.ta}, ${r.prev.n} பதிவானவை.`));
  if (r.span.note) c.notes.push(spanNote(r.span.note));
  return {
    title: bi(`${where} · brief, ${r.span.now ? "open now" : when.en}`, `${whereTa} · சுருக்கம், ${r.span.now ? "இப்போது நிலுவையில்" : when.ta}`),
    takeaway: lead,
    say: bi(`${pointsTa.length} ${pointsTa.length === 1 ? "point" : "points"} in the brief. ${lead.en}`, `சுருக்கத்தில் ${pointsTa.length} குறிப்புகள். ${lead.ta}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
        { key: "reported", label: clip(r.span.now ? L(c, "Open now", "இப்போது நிலுவையில்") : L(c, `Reported, ${when.en}`, `பதிவானவை, ${when.ta}`), 80), value: r.total, unit: null, prev: r.prev?.n ?? null, delta: r.prev ? r.total - r.prev.n : null, tone: "neutral", spark: [] },
        { key: "severe", label: L(c, "Severe", "கடுமையானவை"), value: r.severe, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        ...(r.span.now ? [] : [{ key: "open", label: L(c, "Still open", "இன்னும் நிலுவையில்"), value: r.open, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }]),
        { key: "overdue", label: L(c, "Past deadline", "காலக்கெடு தாண்டியவை"), value: r.late, unit: null, prev: null, delta: null, tone: "bad", spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: L(c, "The brief", "சுருக்கம்"), points: pointsTa }
    ]
  };
}

/**
 * Whether a kind of complaint went up or down against last month: the window back from now against the one of the same length just before it, as the console's own
 * "against the previous period" (pass4-open-17: this was a list of 616 cases). Both counts and the change are said, with the dates of each window.
 */
async function periodCompare(c: Ctx, key: PeriodKey): Promise<Part> {
  const { w, s, slots } = c;
  const subject = catLabel(w, s.cat) ?? "Incidents";
  const subjectTa = catTa(w, s.cat) ?? "சம்பவங்கள்";
  if (!c.h.compare) return cannotSpan(c, { kind: "compare", key });
  c.runs.push("count_incidents");
  c.sources.add("incidents");
  const status = slots.status === "open" || slots.status === "overdue" ? slots.status : null;
  const r = await c.h.compare(key, s, { sev: slots.sev, status });
  if (!r) return cannotSpan(c, { kind: "compare", key });
  c.asOf ??= r.asOf;
  const where = scopeWords(w, { ...s, cat: null, sev: null }, false);
  const sevWord = slots.sev ? `${slots.sev.toLowerCase()} ` : "";
  const what = `${sevWord}${subject.toLowerCase()}${generic(subject) ? "" : " incidents"}`;
  const diff = r.n - r.prev;
  // the change as the share of the earlier window, rounded the way it is read out
  const pct = r.prev ? Math.round((Math.abs(diff) / r.prev) * 100) : null;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "level";
  const cur = r.cmp.cur.label, before = r.cmp.prev.label;
  // "12 today against 9 yesterday by this time"; "40 in the last 7 days against 31 in the week before"
  const day = key === "daily", inCur = day ? cur.en : `in the ${cur.en}`, inBefore = day ? before.en : `in ${before.en}`;
  const en = dir === "level"
    ? `${capFirst(what)} are level: ${spoken(r.n)} ${inCur}, the same as ${inBefore}.`
    : `${capFirst(what)} are ${dir}: ${spoken(r.n)} ${inCur} against ${spoken(r.prev)} ${inBefore}${pct != null ? `, ${pct}% ${dir === "up" ? "higher" : "lower"}` : ""}.`;
  const ta = dir === "level"
    ? `${subjectTa}: ${cur.ta} ${spoken(r.n)}, ${before.ta} அதே அளவு.`
    : `${subjectTa}: ${cur.ta} ${spoken(r.n)}, ${before.ta} ${spoken(r.prev)}; ${pct != null ? `${pct}% ` : ""}${dir === "up" ? "அதிகம்" : "குறைவு"}.`;
  c.notes.push(bi(`Two windows of equal length: ${r.cmp.label.en}. Incidents first reported in each, with the console's filters for ${where.en || "the district"}.`,
    `சம நீளமுள்ள இரண்டு காலங்கள்: ${r.cmp.label.ta}. ஒவ்வொன்றிலும் முதலில் பதிவான சம்பவங்கள், ${where.ta || "மாவட்டம்"} கன்சோல் வடிகட்டிகளுடன்.`));
  const beforeTa = day ? before.ta : key === "weekly" ? "முந்தைய வாரம்" : key === "monthly" ? "முந்தைய மாதம்" : "முந்தைய காலாண்டு";
  return {
    title: bi(`${subject}${where.en ? ` · ${where.en}` : ""} · ${r.cmp.cur.label.en} against ${day ? before.en : `the ${key === "weekly" ? "week" : key === "monthly" ? "month" : "quarter"} before`}`,
      `${subjectTa}${where.ta ? ` · ${where.ta}` : ""} · ${r.cmp.cur.label.ta}, ${day ? `${beforeTa} உடன் ஒப்பீடு` : `${beforeTa}டன் ஒப்பீடு`}`),
    takeaway: bi(en, ta),
    say: bi(en, ta),
    blocks: [{ kind: "Kpis", id: "kpis", title: L(c, "Against the period before", "முந்தைய காலத்துடன் ஒப்பீடு"), items: [
      { key: "cur", label: clip(L(c, capFirst(cur.en), cur.ta), 80), value: r.n, unit: null, prev: r.prev, delta: diff, pct: pct == null ? null : diff < 0 ? -pct : pct, tone: diff > 0 ? "bad" : "good", spark: [] },
      { key: "prev", label: clip(L(c, capFirst(before.en), before.ta), 80), value: r.prev, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] }]
  };
}
const generic = (subject: string) => /^incidents$/i.test(subject);

async function caseDetail(c: Ctx): Promise<Part> {
  let id = c.slots.id;
  // "explain the flooding in Velachery": no number said, so the incident that matters most in what was named
  if (!id && (c.s.zone || c.s.cat || c.slots.q)) {
    const top = await incidentList(c, { sev: c.s.sev ?? null, status: "open", q: c.slots.q, sort: "sev" }).catch(() => null);
    id = String(top?.rows[0]?.id ?? "") || null;
    if (!id) return { title: bi("Nothing open", "திறந்த சம்பவம் இல்லை"), takeaway: null, say: bi("I can't find an open issue like that in the data.", "அப்படி ஒரு திறந்த பிரச்சினை தரவில் இல்லை."),
      blocks: [{ kind: "Note", id: "none", text: L(c, "No open incident matches this.", "இதற்குப் பொருந்தும் திறந்த சம்பவம் இல்லை.") }] };
  }
  if (!id) return { title: bi("Incident", "சம்பவம்"), takeaway: null, say: bi("Which incident? Say its number on the list.", "எந்தச் சம்பவம்? பட்டியலில் அதன் எண்ணைச் சொல்லுங்கள்."), blocks: [] };
  const r = await call(c, "incident_detail", { id });
  const d = r.data as { incident: Row; reports: Row[]; officials: Row[]; assigned?: Row | null } | null;
  // an id as asked is shown and said only as a code: never a figure of its own (Finding 51)
  const idShown = words(c, id, 80) || (c.ta ? "அந்த" : "that");
  if (!d?.incident) return { title: idShown, takeaway: null, say: bi(`I could not find incident ${idShown}.`, `${idShown} சம்பவம் கிடைக்கவில்லை.`),
    blocks: [{ kind: "Note", id: "none", text: L(c, `No incident ${idShown} in the data.`, `தரவில் ${idShown} சம்பவம் இல்லை.`) }] };
  const i = d.incident;
  const row = caseRow({ ...i, loc: i.place }, c.w);
  const what = (i.why?.what ?? []).map((x: unknown) => clip(x, 300)).slice(0, 6);
  const officials = (d.officials ?? []).slice(0, 4).map((o) => ({ name: clip(o.name, 80), role: clip(o.designation, 120) }));
  const timeline = (d.reports ?? []).slice(0, 20).map((x) => ({ t: clip(x.t, 30), source: clip(x.publisher ?? x.source, 60), text: clip(x.title ?? x.what, 300) }));
  const closed = closedAs(row.status, i.open);
  if (i.open_for && !closed) what.unshift(`Open for ${clip(i.open_for, 40)}`);
  const block: BlockT = { kind: "CaseDetail", id: "case", incident: { ...row, what: what.slice(0, 6), why: clip(i.why?.why?.[0], 300) || null, next: clip(i.why?.next, 300) || null,
    deadline: when(i.sla_due), officials }, timeline };
  const blocks: BlockT[] = [block];
  if (row.lat != null && row.lon != null) blocks.push({ kind: "MapView", id: "map", title: L(c, "Where", "இடம்"), rule: null, shade: null, outline: [],
    points: [{ n: 1, id: row.id, lat: row.lat, lon: row.lon as number, label: row.title, sev: row.sev, value: null, hot: true }] });
  // retold, not read out: a fact sheet from the record, then what is wrong, how long, why it matters and what I would do
  const placeTa = row.zone ? zoneTa(c.w, row.zone) : null;
  const facts = factSheet(row, { openFor: i.open_for, firstAt: i.t ?? i.first ?? null, next: actionForOne(i.cat ?? i.category_code, row.dept, row.deptName), placeTa, open: i.open,
    places: c.w.places });
  // v6 (Phase 3): briefed, not retold field by field: since when, why it matters, who has it and what is stuck, what to do (brief6.ts). The
  // news outlet is the record's own report's publisher, only when it is a news medium; an official is said by role, never by name, and only
  // from the record's own assignment (`assigned`), never the department's directory of contacts (the independent check, 17 Nov)
  const news = (d.reports ?? []).map((x) => ({ outlet: clip(x.publisher, 40), at: timeOf(x.t) })).find((x) => x.outlet && isNewsMedia(x.outlet)) ?? null;
  // the last report's time for "nothing new since": a day-only report counts at that day's end (brief6.ts latestOf), never dropped
  const times = (d.reports ?? []).map((x) => latestOf(x.t)).filter((x): x is number => x != null);
  const bf = { ...facts, since: timeOf(i.t ?? i.first), due: timeOf(i.sla_due), role: roleWords(d.assigned?.designation), officials: d.assigned ? 1 : 0, news,
    lastAt: times.length ? Math.max(...times) : null, now: Date.now() };
  const say = briefIssue(bf, spokenLabel(row), [row.title, ...(i.why?.what ?? []).map(String), ...timeline.map((x) => x.text)]);
  // the record's own title is English: a Tamil screen names the case by its kind in Tamil and its place
  const titleTa = [plainWhat(row.cat, row.title)?.ta ?? "சம்பவம்", placeTa ?? row.place].filter(Boolean).join(" · ");
  return { title: bi(row.title, clip(titleTa, 200)), takeaway: row.overdue && !closed ? bi("Past its deadline.", "காலக்கெடு தாண்டியது.") : null, say, blocks, aide: { brief: { ...bf, label: spokenLabel(row) } } };
}

// ------------------------------------------------------------------ news --

/** the words that name a zone in a news report: its names in both languages and the localities inside it */
function zoneWords(w: World, zone: number): string[] {
  const z = ZONES[zone];
  const out = [...(z?.en ?? []), ...(z?.ta ?? []), w.zones.find((x) => x.n === zone)?.name ?? ""];
  for (const p of w.places) if (p.zone === zone) out.push(p.name, ...p.aliases);
  return [...new Set(out.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 4))];
}

async function news(c: Ctx): Promise<Part> {
  const { s, slots, w } = c;
  c.runs.push("console_news");
  // the console keeps no news list per zone (reports carry a place name, not a zone): the district's news is read and
  // kept to the reports that name the zone or a locality in it
  const zone = s.zone;
  const zoneName = zone ? w.zones.find((x) => x.n === zone)?.name ?? `Zone ${zone}` : null;
  const r0 = await c.h.news(zone ? { ...s, zone: null } : s);
  const zw = zone ? zoneWords(w, zone) : [];
  const inZone = (x: Row) => !zone || zw.some((wd) => `${x.loc ?? ""} ${x.title ?? ""} ${x.original ?? ""}`.toLowerCase().includes(wd));
  const r = { ...r0, rows: r0.rows.filter(inZone) };
  c.sources.add("console latest news");
  c.asOf ??= r.asOf;
  // words that ask for news are not its topic ("today's news", "read the headlines", "இன்றைய செய்திகள்")
  const GENERIC = /^(news|today|todays|latest|headline|headlines|read|tell|show|about|this|week|month|please|செய்தி.*|இன்றைய|இன்று|படி.*|சொல்லு.*|காட்டு.*|seithi.*|padi|sollu)$/;
  const terms = (slots.q ?? "").toLowerCase().split(/[^a-z\u0B80-\u0BFF]+/).filter((x) => x.length >= 4 && !GENERIC.test(x))
    .map((x) => x.replace(/(ing|ed|s)$/, ""));
  const match = (x: Row) => !terms.length || terms.some((wd) => `${x.title ?? ""} ${x.original ?? ""} ${x.loc ?? ""}`.toLowerCase().includes(wd));
  let items = r.rows.filter(match).map((x) => ({
    id: String(x.id), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null,
    place: clip(x.loc, 120) || null, incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
  }));
  // a topic the latest news does not carry: the console's search over every report
  if (terms.length && items.length < 2) {
    const sr = await call(c, "search_records", { text: slots.q, scope: scopeArg(s), kinds: ["news"] }).catch(() => null);
    const found = ((sr?.data as { news?: Row[] } | undefined)?.news ?? []).map((x) => ({
      id: String(x.id ?? x.doc_id ?? x.title), title: clip(x.title, 300), source: clip(x.publisher ?? x.source, 80) || null, t: x.t ?? x.published ?? null,
      place: clip(x.place ?? x.loc, 120) || null, incidentId: x.incident ?? x.incident_id ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
    if (found.length) { items = found; c.notes.push(bi("Found by searching every news report (the latest news had none on this).", "எல்லாச் செய்தி அறிக்கைகளிலும் தேடிக் கண்டது (சமீபத்திய செய்திகளில் இது இல்லை).")); }
  }
  // a zone with no report of its own in the latest news: every report is searched for it
  if (zone && !items.length) {
    const sr = await call(c, "search_records", { text: zoneName, scope: scopeArg({ ...s, zone: null }), kinds: ["news"] }).catch(() => null);
    items = ((sr?.data as { news?: Row[] } | undefined)?.news ?? []).filter(inZone).map((x) => ({
      id: String(x.id ?? x.doc_id ?? x.title), title: clip(x.title, 300), source: clip(x.publisher ?? x.source, 80) || null, t: x.t ?? x.published ?? null,
      place: clip(x.place ?? x.loc, 120) || null, incidentId: x.incident ?? x.incident_id ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
  }
  const zoneNameTa = zone ? ZONE_TA[zone] ?? zoneName : null;
  if (zone && !items.length) {
    return { title: bi(`News · ${zoneName} · ${PERIOD_EN[s.period]}`, `செய்திகள் · ${zoneNameTa} · ${PERIOD_TA[s.period]}`), takeaway: null,
      say: bi(`No news report named ${zoneName} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} ${zoneNameTa} பற்றி செய்தி இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: L(c, `No news report ${inPeriod(s.period)} names ${zoneName} or a place in it.`, `${PERIOD_TA[s.period]} ${zoneNameTa} அல்லது அதிலுள்ள இடத்தைக் குறிப்பிடும் செய்தி இல்லை.`) }],
      next: [{ label: { en: "All of Chennai's news", ta: "சென்னை முழுவதும்" }, kind: "direct", recipe: "news", slots: { ...slots, zones: [], fresh: true }, ids: [], text: null }] };
  }
  // the topic as asked, shown and said without a figure of its own (Finding 51: "about flood deaths 300" was said)
  const asked = words(c, slots.q, 240);
  let topic = terms.length && asked ? ` about ${asked}` : zoneName ? ` from ${zoneName}` : "";
  let topicWordsTa = terms.length && topicTa(c, asked) ? `${topicTa(c, asked)} பற்றிய ` : zoneNameTa ? `${zoneNameTa} ` : "";
  // a topic nothing matched: say so, and still show the latest news
  if (terms.length && !items.length) {
    c.notes.push(bi(`No news matched "${clip(asked, 80)}"; showing the latest news instead.`, `"${clip(asked, 80)}" பற்றிய செய்தி இல்லை; சமீபத்திய செய்திகளைக் காட்டுகிறேன்.`));
    topic = "";
    topicWordsTa = "";
    items = r.rows.map((x) => ({
      id: String(x.id), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null,
      place: clip(x.loc, 120) || null, incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
  }
  items = items.slice(0, Math.min(slots.n ?? 12, 20));
  const titles = bi(`News${topic} · ${PERIOD_EN[s.period]}`, `${topicWordsTa}செய்திகள் · ${PERIOD_TA[s.period]}`);
  const title = L(c, titles.en, titles.ta);
  const taTopic = zone ? `${zoneNameTa} ` : "";
  if (!items.length) return { title: titles, takeaway: null, say: bi(`No news${topic} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} இது பற்றி செய்தி இல்லை.`), blocks: [] };
  const linked = items.filter((x) => x.incidentId).length;
  return {
    title: titles, takeaway: linked ? bi(`${linked} of these ${items.length} headlines are linked to an incident.`, `இந்த ${items.length} தலைப்புகளில் ${linked} ஒரு சம்பவத்துடன் இணைந்தவை.`) : null,
    say: bi(`${plural(items.length, "headline", "headlines")}${topic}. Reading them now.`, `${taTopic}${spoken(items.length)} தலைப்புச் செய்திகள். படிக்கிறேன்.`),
    blocks: [{ kind: "NewsReader", id: "news", title, total: terms.length ? items.length : r.total, items }]
  };
}

// ------------------------------------------------------------------ prices --

interface MandiRow { commodity: string; markets: number; avg_per_kg: number | null; avg_prev_per_kg: number | null;
  prices: { market: string; date: string; per_kg: number; prev_per_kg: number | null }[] }

/**
 * Vegetable prices at Chennai's Uzhavar Sandhai markets (retail, from the TN Agricultural Marketing department; 27 Nov: no longer
 * AGMARKNET, whose API asks for a CAPTCHA): one item's price at every market, or the day's price list.
 */
async function prices(c: Ctx): Promise<Part> {
  const r = await call(c, "mandi_prices", { commodity: c.slots.q, market: null });
  const d = r.data as { rows: MandiRow[]; latest: string | null; unknown: string[] };
  const latest = d.latest ? when(d.latest) ?? d.latest : null;
  if (!d.rows?.length) {
    // the item as asked, said and shown without a figure of its own (Finding 51)
    const asked = words(c, c.slots.q, 80);
    const what = asked || "vegetables", whatTa = asked || "காய்கறி";
    return { title: bi(`Prices · ${what}`, `விலைகள் · ${whatTa}`), takeaway: null, say: bi(`There is no recent market price for ${what}.`, `${whatTa} விலை சமீபத்திய சந்தை அறிக்கைகளில் இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: L(c, `No Chennai market reported a price for ${what} in the last 14 days.`, `கடந்த 14 நாட்களில் எந்தச் சென்னைச் சந்தையும் ${whatTa} விலையை அறிவிக்கவில்லை.`) }] };
  }
  const rs = (x: number | null) => (x == null ? "—" : `₹${Math.round(x)}`);
  if (c.slots.q) {
    const it = d.rows[0];
    const ps = [...it.prices].sort((a, b) => a.per_kg - b.per_kg);
    const lo = ps[0], hi = ps[ps.length - 1];
    const ch = it.avg_per_kg != null && it.avg_prev_per_kg ? change(it.avg_per_kg, it.avg_prev_per_kg) : { delta: null, pct: null };
    const trendEn = ch.pct == null || Math.abs(ch.pct) < 3 ? "about the same as the last report" : `${Math.abs(ch.pct)}% ${ch.pct > 0 ? "up" : "down"} since the last report`;
    const trendTa = ch.pct == null || Math.abs(ch.pct) < 3 ? "முந்தைய அறிக்கையைப் போலவே" : `முந்தைய அறிக்கையை விட ${Math.abs(ch.pct)}% ${ch.pct > 0 ? "அதிகம்" : "குறைவு"}`;
    const say = bi(`${it.commodity} costs ${rs(it.avg_per_kg)} a kilo on average across ${it.markets} Chennai markets, ${trendEn}. Cheapest at ${lo.market}, ${rs(lo.per_kg)}; dearest at ${hi.market}, ${rs(hi.per_kg)}.`,
      `${it.commodity} சராசரியாக கிலோ ${rs(it.avg_per_kg)}, ${it.markets} சென்னை சந்தைகளில்; ${trendTa}. மலிவு: ${lo.market}, ${rs(lo.per_kg)}; அதிகம்: ${hi.market}, ${rs(hi.per_kg)}.`);
    return {
      title: bi(`${it.commodity} prices · Chennai markets`, `${it.commodity} விலை · சென்னைச் சந்தைகள்`), takeaway: ch.pct != null && Math.abs(ch.pct) >= 10 ? bi(`${it.commodity} is ${trendEn}.`, `${it.commodity} ${trendTa}.`) : null, say,
      blocks: [
        { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
          { key: "avg", label: L(c, `Average, ${it.markets} markets`, `சராசரி, ${it.markets} சந்தைகள்`), value: Math.round(it.avg_per_kg ?? 0), unit: "₹/kg", prev: it.avg_prev_per_kg == null ? null : Math.round(it.avg_prev_per_kg), delta: ch.delta, tone: ch.pct != null && ch.pct >= 10 ? "bad" : "neutral", spark: [] },
          { key: "lo", label: L(c, `Cheapest: ${lo.market}`, `மலிவு: ${lo.market}`), value: Math.round(lo.per_kg), unit: "₹/kg", prev: null, delta: null, tone: "good", spark: [] },
          { key: "hi", label: L(c, `Dearest: ${hi.market}`, `அதிக விலை: ${hi.market}`), value: Math.round(hi.per_kg), unit: "₹/kg", prev: null, delta: null, tone: "neutral", spark: [] }
        ] },
        { kind: "Ranking", id: "markets", title: L(c, `${it.commodity} at each market${latest ? ` · reports to ${latest}` : ""}`, `ஒவ்வொரு சந்தையிலும் ${it.commodity}${latest ? ` · ${labelTa(latest)} வரையிலான அறிக்கைகள்` : ""}`), unit: "₹/kg",
          method: L(c, "Uzhavar Sandhai retail price, rupees per kilo (the latest report of each market; TN Agricultural Marketing department)", "உழவர் சந்தை சில்லறை விலை, கிலோவுக்கு ரூபாய் (ஒவ்வொரு சந்தையின் கடைசி அறிக்கை)"), order: "bottom",
          items: ps.map((p, i) => ({ key: p.market, label: p.market, value: Math.round(p.per_kg), rank: i + 1, sub: `${p.date}${p.prev_per_kg != null ? L(c, ` · was ₹${Math.round(p.prev_per_kg)}`, ` · முன்பு ₹${Math.round(p.prev_per_kg)}`) : ""}`, zone: null, lat: null, lon: null, action: "none" as const })) }
      ]
    };
  }
  const list = d.rows.filter((x) => x.avg_per_kg != null);
  const ups = list.map((x) => ({ x, ch: x.avg_prev_per_kg ? change(x.avg_per_kg!, x.avg_prev_per_kg) : { delta: null, pct: null } })).filter((y) => (y.ch.pct ?? 0) >= 10);
  return {
    title: bi("Vegetable prices · Chennai markets", "காய்கறி விலைகள் · சென்னைச் சந்தைகள்"), takeaway: ups.length ? bi(`Up 10% or more: ${ups.map((y) => y.x.commodity).join(", ")}.`, `10% அல்லது அதிகம் உயர்ந்தவை: ${ups.map((y) => y.x.commodity).join(", ")}.`) : null,
    say: bi(`Prices of ${list.length} items at Chennai markets${latest ? `, reports to ${latest}` : ""}. ${ups.length ? `${ups.map((y) => y.x.commodity).join(", ")} went up.` : "No big rises."}`,
      `சென்னை சந்தைகளில் ${list.length} பொருட்களின் விலை. ${ups.length ? `${ups.map((y) => y.x.commodity).join(", ")} விலை உயர்ந்துள்ளது.` : "பெரிய உயர்வு இல்லை."}`),
    blocks: [{ kind: "Ranking", id: "prices", title: L(c, "Average price per kilo", "கிலோவுக்குச் சராசரி விலை"), unit: "₹/kg",
      method: L(c, "Uzhavar Sandhai retail prices averaged across the Chennai markets that reported (TN Agricultural Marketing department)", "அறிக்கை தந்த சென்னை உழவர் சந்தைகளின் சில்லறை விலைகளின் சராசரி"), order: "top",
      items: list.map((x, i) => ({ key: x.commodity, label: x.commodity, value: Math.round(x.avg_per_kg!), rank: i + 1,
        sub: x.avg_prev_per_kg != null ? L(c, `was ₹${Math.round(x.avg_prev_per_kg)} · ${x.markets} markets`, `முன்பு ₹${Math.round(x.avg_prev_per_kg)} · ${x.markets} சந்தைகள்`) : L(c, `${x.markets} markets`, `${x.markets} சந்தைகள்`), zone: null, lat: null, lon: null, action: "none" as const })) }]
  };
}

// ------------------------------------------------------------------ readings --

const ENV: Record<Metric, { tool: string; en: string; ta: string; unit: string }> = {
  rain: { tool: "rainfall_24h_mm", en: "Rainfall in the last 24 hours", ta: "கடந்த 24 மணி நேர மழை", unit: "mm" },
  aqi: { tool: "aqi", en: "Air quality (AQI)", ta: "காற்றின் தரம்", unit: "AQI" },
  lakes: { tool: "lake_pct_full", en: "Reservoir storage", ta: "நீர்த்தேக்க இருப்பு", unit: "% full" },
  temp: { tool: "temp_max_c", en: "Maximum temperature", ta: "அதிகபட்ச வெப்பநிலை", unit: "°C" },
  humidity: { tool: "humidity_pct", en: "Relative humidity", ta: "ஈரப்பதம்", unit: "%" }
};

async function envRows(c: Ctx, m: Metric) {
  const r = await call(c, "environment", { metric: ENV[m].tool });
  return ((r.data as { rows: Row[] }).rows ?? []).filter((x) => num(x.value) != null);
}

async function readings(c: Ctx): Promise<Part> {
  const m = c.slots.metric ?? "lakes";
  const e = ENV[m];
  const rows = await envRows(c, m);
  const items = rows.map((x) => ({ id: String(x.place_id ?? x.place), name: clip(x.place, 120), value: round(Number(x.value), 1), t: x.t ?? null,
    mean28: num(x.mean28) == null ? null : round(Number(x.mean28), 1), z: num(x.zscore), anomaly: !!x.anomaly, detail: clip(x.detail, 200) || null }))
    .sort((a, b) => b.value - a.value);
  const station = words(c, c.slots.name, 80);
  const titles = bi(`${e.en}${station ? ` · ${station}` : ""}`, `${e.ta}${station ? ` · ${station}` : ""}`);
  const title = L(c, titles.en, titles.ta);
  if (!items.length) return { title: titles, takeaway: null, say: bi(`There is no ${e.en.toLowerCase()} reading in the data.`, `${e.ta} அளவீடு தரவில் இல்லை.`), blocks: [] };
  // a station named in the question; else a zone named in it, read through a station whose name holds the zone's name (QA4 gate, FB-2: "the rainfall in
  // Adyar" was answered with the city's highest reading). The data has stations, not zones, so a zone with no station of that name gets an honest line.
  const asked = c.slots.name ? [] : [...new Set(c.slots.zones)].filter((z) => zoneName(c.w, z));
  const named = c.slots.name ? items.find((x) => x.name.toLowerCase().includes(c.slots.name!.toLowerCase()) || c.slots.name!.toLowerCase().includes(x.name.toLowerCase().split(" ")[0]))
    : asked.length ? items.find((x) => asked.some((z) => x.name.toLowerCase().includes(String(zoneName(c.w, z)).toLowerCase()))) ?? null : null;
  const noStation = !c.slots.name && asked.length > 0 && !named;
  const top = named ?? items[0];
  const v = m === "lakes" ? Math.round(top.value) : top.value;
  const unitWord = m === "lakes" ? "% full" : ` ${e.unit}`;
  const at = when(top.t) ?? "the latest reading";
  // the Tamil line has its own month, clock and unit (a Latin "6 Nov, 8:30 AM" and "mm" in a Tamil line is a break: RC-15, SKG1-37)
  const atTa = when(top.t) ? labelTa(when(top.t) as string) : "சமீபத்திய அளவீடு";
  const unitTa = ({ rain: "மி.மீ", aqi: "AQI", lakes: "%", temp: "°C", humidity: "%" } as Record<Metric, string>)[m];
  const askedEn = asked.map((z) => zoneName(c.w, z)).join(" or ");
  const askedTa = asked.map((z) => zoneTa(c.w, z)).join(" அல்லது ");
  const say = noStation
    ? bi(`There is no ${e.en.toLowerCase()} gauge in ${askedEn}: the data has stations, not zones. Across ${items.length} stations the highest is ${top.name} at ${spoken(v)}${unitWord}, as of ${at}.`,
        `${askedTa} பகுதிக்கு ${e.ta} மானி இல்லை: தரவில் நிலையங்கள் மட்டுமே உள்ளன. ${items.length} நிலையங்களில் அதிகம்: ${top.name}, ${spoken(v)}${m === "lakes" ? "%" : ` ${unitTa}`}, ${atTa} நிலவரப்படி.`)
    : named
    ? bi(`${top.name} is at ${spoken(v)}${unitWord}, as of ${at}.`, `${top.name}: ${spoken(v)}${m === "lakes" ? "% நிரம்பியுள்ளது" : ` ${unitTa}`}, ${atTa} நிலவரப்படி.`)
    : bi(`${items.length} readings. Highest: ${top.name} at ${spoken(v)}${unitWord}, as of ${at}.`, `${items.length} அளவீடுகள். அதிகம்: ${top.name}, ${spoken(v)}${m === "lakes" ? "%" : ` ${unitTa}`}, ${atTa} நிலவரப்படி.`);
  const vs = top.mean28 != null && top.mean28 > 0 ? change(top.value, top.mean28) : { delta: null, pct: null };
  const takeaway = vs.pct != null && Math.abs(vs.pct) >= 10
    ? bi(`${top.name} is ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "above" : "below"} its 28-day average.`, `${top.name} அதன் 28 நாள் சராசரியை விட ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "அதிகம்" : "குறைவு"}.`) : null;
  const blocks: BlockT[] = [{ kind: "Readings", id: "readings", title, metric: m, unit: e.unit, items: named ? [named, ...items.filter((x) => x !== named)] : items }];
  const pts = rows.filter((x) => num(x.lat) != null && num(x.lon) != null && Math.abs(Number(x.lat) - 13.05) < 0.6)
    .map((x, i) => ({ n: i + 1, id: String(x.place_id ?? x.place), lat: Number(x.lat), lon: Number(x.lon), label: clip(x.place, 120), sev: null, value: round(Number(x.value), 1), hot: String(x.place) === top.name }));
  if (pts.length >= 2) blocks.push({ kind: "MapView", id: "map", title: L(c, "Stations", "நிலையங்கள்"), rule: null, shade: null, points: pts, outline: [] });
  return { title: titles, takeaway, say, blocks };
}

// ------------------------------------------------------------------ the city now --

const CITY_TILES: Record<string, string[]> = {
  traffic: ["traffic.very", "traffic.congested", "traffic.flooded", "traffic.accidents", "traffic.closed", "traffic.clusters"],
  flood: ["flood.likely", "flood.possible", "flood.chokes", "flood.jobs", "flood.rains"],
  rain: ["rain.level", "rain.today.top", "rain.raining", "flood.likely", "power.wards", "metro.late"],
  power: ["power.wards", "power.often", "power.avgHours", "power.lastRain"],
  metro: ["metro.late", "metro.lines", "metro.avgMin"],
  all: ["traffic.very", "traffic.congested", "traffic.clusters", "rain.level", "flood.likely", "power.wards"]
};
const CITY_TITLE: Record<string, { en: string; ta: string }> = {
  traffic: { en: "Live traffic now", ta: "நேரடி போக்குவரத்து" }, flood: { en: "Streets that flood", ta: "வெள்ளம் தேங்கும் தெருக்கள்" },
  rain: { en: "Rain now", ta: "மழை நிலவரம்" }, power: { en: "Power in heavy rain", ta: "கனமழையில் மின்சாரம்" }, metro: { en: "Trains in heavy rain", ta: "கனமழையில் ரயில்கள்" },
  all: { en: "The city now", ta: "நகர நிலவரம்" }
};

/**
 * "How is the traffic now?", "which streets flood?", "power cuts in heavy rain", "metro delays", "the city now": the shared
 * answer (lib/city/now.ts, through Ask District IQ's city_now tool), the same words the chatbot and Ask the Map say. Its
 * counts as tiles, its sentences as the brief (every figure Jarvis says is on the screen), the places as a list.
 */
async function city(c: Ctx): Promise<Part> {
  const topics = ["traffic", "flood", "rain", "power", "metro", "all"];
  const topic = topics.includes(String(c.slots.q)) ? String(c.slots.q) : "all";
  const zone = topic === "traffic" && c.slots.zones.length === 1 ? c.slots.zones[0] : null;
  // v12 (21 Nov): the spot or the rain asked for goes with the read (only when asked, so the plain read is shared with the snapshot's and the
  // speculative ones by the tool cache)
  const focus = topic === "traffic" && (c.slots.focus === "worst-jam" || c.slots.focus === "repeat") ? c.slots.focus : null;
  const rain = topic === "flood" && typeof c.slots.rain === "string" && /^(?:latest|rain-\d{4}-\d{2}-\d{2})$/.test(c.slots.rain) ? c.slots.rain : null;
  const rk = c.slots.rank;
  const rank = topic === "traffic" && rk && Number.isInteger(rk.n) && rk.n >= 1 ? { n: Math.min(rk.n, 10), order: rk.order === "least" ? "least" : "most", by: rk.by === "area" ? "area" : "road" } : null;
  const r = await call(c, "city_now", { topic, zone: rank?.by === "area" ? null : zone, ...(focus && !rank ? { focus } : {}), ...(rain ? { rain } : {}), ...(rank ? { rank } : {}) });
  const d = r.data as { headline: { en: string; ta: string }; say: { en: string; ta: string }; rows: { part: string; place: string; detail: string; value: number | null; unit: string | null; lat: number | null; lon: number | null }[];
    focus?: CityFocusPart | null; rainOf?: CityRainOf | null; ranked?: CityRanked | null };
  if (rank) return cityRanked(c, r, d);
  if (focus) return cityFocus(c, r, d, focus);
  if (rain) return cityRain(c, r, d);
  const fact = (id: string) => r.facts.find((f) => f.id === `city.${id}`);
  const tiles = (CITY_TILES[topic] ?? CITY_TILES.all).map(fact).filter((f): f is NonNullable<typeof f> => !!f).slice(0, 6);
  const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z(஀-௿])/).map((x) => x.trim()).filter(Boolean);
  const en = sentences(d.say.en), ta = sentences(d.say.ta);
  const blocks: BlockT[] = [];
  if (tiles.length) blocks.push({ kind: "Kpis", id: "city", title: CITY_TITLE[topic]?.en ?? d.headline.en, items: tiles.map((f) => ({ key: f.id.replace(/^city\./, "").slice(0, 40), label: clip(f.label, 80),
    value: f.value, unit: f.unit ? clip(f.unit, 20) : null, prev: null, delta: null, tone: /very|flooded|accidents|clusters|chokes|often/.test(f.id) && f.value > 0 ? "bad" as const : "neutral" as const, spark: [] })) });
  // the whole answer in words (an Answer block: shown, not read out point by point); every figure Jarvis says is in it
  blocks.push({ kind: "Answer", id: "say", title: CITY_TITLE[topic]?.en ?? d.headline.en, text: clip(d.say.en, 900),
    // the figures not already on the tiles above (each place's delay, reports, rains), so nothing shows twice
    facts: r.facts.filter((f) => !tiles.includes(f)).slice(0, 8).map((f) => ({ label: clip(f.label, 160), value: f.value, unit: f.unit ? clip(f.unit, 20) : null })) });
  const pts = d.rows.filter((x) => x.lat != null && x.lon != null).slice(0, 12)
    .map((x, i) => ({ n: i + 1, id: `city-${i}`, lat: Number(x.lat), lon: Number(x.lon), label: clip(`${x.part}: ${x.place}`, 160), sev: null, value: x.value, hot: i < 3 }));
  if (pts.length >= 2) blocks.push({ kind: "MapView", id: "map", title: "Where", rule: null, shade: null, points: pts, outline: [] });
  // the places with a figure (minutes of delay, rains hit, % full), worst first; a place with no figure is on the map and in the brief
  const ranked = d.rows.filter((x) => x.value != null).slice(0, 12);
  if (ranked.length) blocks.push({ kind: "Ranking", id: "places", title: topic === "traffic" ? "Needs action now (minutes of delay)" : "The places", unit: ranked[0].unit ? clip(ranked[0].unit, 30) : null,
    method: "Worst first, from the shared city data", order: "top",
    items: ranked.map((x, k) => ({ key: `r${k}`, label: clip(x.place, 120), value: Number(x.value), rank: k + 1, sub: clip(`${x.part} · ${x.detail}`, 160), zone: null, lat: x.lat, lon: x.lon, action: "none" as const })) });
  // said aloud: the first two sentences (each figure is in the answer above)
  const say = bi(en.slice(0, 2).join(" ") || d.headline.en, (ta.length ? ta.slice(0, 2).join(" ") : d.headline.ta));
  return { title: CITY_TITLE[topic]?.en ?? d.headline.en, takeaway: en[1] && en[2] ? bi(en[2], ta[2] ?? ta[1] ?? "") : null, say, blocks: blocks.slice(0, 6), next: [] };
}

type CityKpi = Extract<BlockT, { kind: "Kpis" }>["items"][number];
const cityKpi = (f: { id: string; label: string; value: number; unit?: string | null }, bad = false): CityKpi => ({ key: f.id.replace(/^city\./, "").slice(0, 40), label: clip(f.label, 80),
  value: f.value, unit: f.unit ? clip(f.unit, 20) : null, prev: null, delta: null, tone: bad && f.value > 0 ? "bad" : "neutral", spark: [] });

/**
 * v12 (21 Nov): "the most congested road", "zoom to the worst jam", "the repeating traffic": one spot, not the district overview. Its delay,
 * length, reports and open ones as tiles, the line code wrote for it said (lib/city/pick.ts spotLine / clusterLine: every figure is on the
 * tiles and in the answer), and one map point whose id is the spot's (the console opens the Traffic view on it: Thunai.tsx putStage).
 */
function cityFocus(c: Ctx, r: ToolResult, d: { say: { en: string; ta: string }; focus?: CityFocusPart | null }, focus: "worst-jam" | "repeat"): Part {
  const f = d.focus ?? null;
  const head = focus === "repeat" ? bi("Keeps coming back", "மீண்டும் மீண்டும் சிக்கல்") : bi("Most congested now", "அதிக நெரிசல்");
  if (!f) {
    // nothing jammed now, or no live traffic: the shared data's own sentence (city_now put it first), on its own
    const one = bi(d.say.en.split(/(?<=[.!?])\s+/)[0] ?? d.say.en, d.say.ta.split(/(?<=[.!?])\s+/)[0] ?? d.say.ta);
    return { title: head, takeaway: null, say: one, blocks: [{ kind: "Answer", id: "say", title: head.en, text: clip(one.en, 900), facts: [] }], next: [] };
  }
  const fact = (id: string) => r.facts.find((x) => x.id === `city.traffic.focus.${id}`);
  const tiles = [fact("delay"), fact("length"), fact("reports"), fact("open")].filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => cityKpi(x, /delay|open/.test(x.id)));
  const title = bi(`${head.en}: ${clip(f.name, 140)}`, `${head.ta}: ${clip(f.name, 140)}`);
  const blocks: BlockT[] = [];
  if (tiles.length) blocks.push({ kind: "Kpis", id: "spot-kpis", title: head.en, items: tiles });
  blocks.push({ kind: "Answer", id: "say", title: f.owner.name ? `Who answers for it: ${clip(f.owner.name, 100)}` : head.en, text: clip(f.line.en, 900), facts: [] });
  // one point: the spot itself, its id the TomTom spot's (or the trouble spot's), so the console flies to it and opens its card
  blocks.push({ kind: "MapView", id: "spot", title: "Where", rule: null, shade: null, outline: [],
    points: [{ n: 1, id: clip(f.id, 120), lat: f.lat, lon: f.lon, label: clip(f.name, 160), sev: null, value: f.delayMin ?? null, hot: true }] });
  return { title, takeaway: null, say: bi(f.line.en, f.line.ta), blocks, next: [] };
}

/**
 * 23 Nov: "the top three most congested roads", "which areas have the least traffic", "the three congested ones in Anna Nagar": the ranked
 * list (lib/city/now.ts rankPart), each with why it stands there, and how the order was made, said and shown. The map shows every one.
 */
function cityRanked(c: Ctx, r: ToolResult, d: { say: { en: string; ta: string }; ranked?: CityRanked | null }): Part {
  const rk = d.ranked ?? null;
  const head = !rk ? bi("Live traffic", "நேரடி போக்குவரத்து")
    : rk.by === "area" ? (rk.order === "most" ? bi("Zones with the most congestion now", "அதிக நெரிசல் உள்ள மண்டலங்கள்") : bi("Zones with the least congestion now", "குறைந்த நெரிசல் உள்ள மண்டலங்கள்"))
      : rk.order === "most" ? bi(rk.asked > 1 ? `Top ${rk.asked} most congested roads now` : "Most congested road now", `அதிக நெரிசலான ${rk.asked} சாலைகள்`) : bi("Least congested roads now", "குறைந்த நெரிசலான சாலைகள்");
  if (!rk || !rk.items.length) {
    const one = bi(d.say.en.split(/(?<=[.!?])\s+/)[0] ?? d.say.en, d.say.ta.split(/(?<=[.!?])\s+/)[0] ?? d.say.ta);
    return { title: head, takeaway: null, say: one, blocks: [{ kind: "Answer", id: "say", title: head.en, text: clip(d.say.en, 900), facts: [] }], next: [] };
  }
  const area = rk.by === "area";
  const blocks: BlockT[] = [];
  blocks.push({ kind: "Answer", id: "say", title: L(c, head.en, head.ta), text: clip(`${rk.line.en} ${rk.method.en}`, 900), facts: [] });
  blocks.push({ kind: "Ranking", id: "ranked", title: L(c, head.en, head.ta), unit: area ? "jams" : "min delay", method: clip(L(c, rk.method.en, rk.method.ta), 240), order: rk.order === "most" ? "top" : "bottom",
    items: rk.items.map((x) => ({ key: `r${x.rank}`, label: clip(x.name, 120), value: Number(area ? x.jams ?? 0 : x.delayMin ?? 0), rank: x.rank,
      sub: clip(`${L(c, x.why, x.whyTa)}${!area && x.zoneName ? ` · ${x.zoneName}` : ""}`, 160), zone: x.zone, lat: x.lat, lon: x.lon, action: "none" as const })) });
  const pts = rk.items.filter((x) => x.lat != null && x.lon != null)
    .map((x) => ({ n: x.rank, id: clip(x.spot ?? `zone-${x.zone}`, 120), lat: Number(x.lat), lon: Number(x.lon), label: clip(`${x.rank}. ${x.name}`, 160), sev: null, value: area ? x.jams : x.delayMin, hot: x.rank <= 3 }));
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: L(c, "Where", "எங்கே"), rule: null, shade: null, outline: [], points: pts });
  void r;
  // said aloud: the list itself, then why it is in this order
  return { title: head, takeaway: bi(rk.method.en, rk.method.ta), say: bi(`${rk.line.en} ${rk.method.en}`, `${rk.line.ta} ${rk.method.ta}`), blocks: blocks.slice(0, 6), next: [] };
}

/**
 * v12 (21 Nov): "the flooded streets in the last rain", "roads that flooded in the last range": one past heavy rain (the last with reports,
 * as Rain & flooding opens it, or the day asked), the streets its flooding reports stood on, and the line code wrote for it ("In the last
 * heavy rain (21 October), 14 streets flooded: A, B, C."). The console opens Rain & flooding on that rain (Thunai.tsx putStage).
 */
function cityRain(c: Ctx, r: ToolResult, d: { say: { en: string; ta: string }; rainOf?: CityRainOf | null }): Part {
  const ro = d.rainOf ?? null;
  if (!ro) {
    const one = bi(d.say.en.split(/(?<=[.!?])\s+/)[0] ?? d.say.en, d.say.ta.split(/(?<=[.!?])\s+/)[0] ?? d.say.ta);
    return { title: bi("Streets that flooded", "வெள்ளம் வந்த தெருக்கள்"), takeaway: null, say: one, blocks: [{ kind: "Answer", id: "say", title: "Streets that flooded", text: clip(one.en, 900), facts: [] }], next: [] };
  }
  const fact = (id: string) => r.facts.find((x) => x.id === `city.flood.rain.${id}`);
  const tiles = [fact("streets"), fact("reports")].filter((x): x is NonNullable<typeof x> => !!x).map((x) => cityKpi(x, true));
  const title = ro.latest ? bi("Streets that flooded in the last heavy rain", "கடந்த கனமழையில் வெள்ளம் வந்த தெருக்கள்") : bi("Streets that flooded in that heavy rain", "அந்தக் கனமழையில் வெள்ளம் வந்த தெருக்கள்");
  const blocks: BlockT[] = [];
  if (tiles.length) blocks.push({ kind: "Kpis", id: "rain-kpis", title: title.en, items: tiles });
  blocks.push({ kind: "Answer", id: "say", title: title.en, text: clip(ro.line.en, 900), facts: [] });
  const streets = ro.streets.slice(0, 12);
  if (streets.length) {
    blocks.push({ kind: "Ranking", id: "streets", title: "Flooding reports on each street in that rain", unit: "reports", method: "Most reports first, from the flood memory (lib/rehearsal)", order: "top",
      items: streets.map((s, k) => ({ key: `s${k}`, label: clip(c.ta ? s.label_ta : s.label, 120), value: s.n, rank: k + 1, sub: s.ward ? `Ward ${s.ward}` : null, zone: null, lat: s.lat, lon: s.lon, action: "none" as const })) });
    blocks.push({ kind: "MapView", id: "map", title: "Where", rule: null, shade: null, outline: [],
      points: streets.map((s, i) => ({ n: i + 1, id: clip(`street-${s.key}`, 120), lat: s.lat, lon: s.lon, label: clip(s.label, 160), sev: null, value: s.n, hot: i < 3 })) });
  }
  return { title, takeaway: null, say: bi(ro.line.en, ro.line.ta), blocks: blocks.slice(0, 6), next: [] };
}

// ------------------------------------------------------------------ ranking --

async function ranking(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const measure: Measure = slots.measure ?? (slots.metric ? (slots.metric === "humidity" ? "rain" : slots.metric) as Measure : "zone_attention");
  const n = Math.min(Math.max(slots.n ?? 5, 1), 15);
  const order = slots.order;
  let items: Extract<BlockT, { kind: "Ranking" }>["items"] = [];
  let unit: string | null = null; let methodBi = bi("", ""); let labelBi = bi("", ""); let shade: Extract<BlockT, { kind: "MapView" }>["shade"] = null; let pts: PointT[] = [];
  let asWhen: string | null = null; let all: number[] = [];
  if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    const m = measure as Metric;
    const rows = await envRows(c, m);
    const ranked = rank(rows, (x) => Number(x.value), n, order);
    all = rows.map((x) => Number(x.value));
    unit = ENV[m].unit; labelBi = bi(ENV[m].en, ENV[m].ta);
    methodBi = bi(`Latest reading at each ${m === "lakes" ? "reservoir" : "station"} (${rows.length} reporting), ranked; the data has no zone-level gauge, so places are the stations themselves.`,
      `ஒவ்வொரு ${m === "lakes" ? "நீர்த்தேக்கத்தின்" : "நிலையத்தின்"} கடைசி அளவீடு (${rows.length} அளவீடுகள்), வரிசைப்படி; தரவில் மண்டல அளவிலான மானி இல்லை, எனவே இடங்கள் நிலையங்களே.`);
    items = ranked.map((r) => ({ key: String(r.item.place_id ?? r.item.place), label: clip(r.item.place, 120), value: round(r.value, 1), rank: r.rank, sub: when(r.item.t), zone: null,
      lat: num(r.item.lat), lon: num(r.item.lon), action: "station" as const }));
    asWhen = when(ranked[0]?.item.t);
    pts = items.filter((x) => x.lat != null && x.lon != null && Math.abs((x.lat as number) - 13.05) < 0.6)
      .map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else if (measure.startsWith("zone_")) {
    const r = await call(c, "zones", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows;
    const key = { zone_severe: "severe", zone_open: "open", zone_incidents: "n", zone_complaints: "complaints", zone_attention: "score" }[measure as "zone_severe"] ?? "score";
    labelBi = ({ severe: bi("Severe incidents", "கடுமையான சம்பவங்கள்"), open: bi("Open incidents", "திறந்த சம்பவங்கள்"), n: bi("Incidents reported", "பதிவான சம்பவங்கள்"),
      complaints: bi("Open citizen complaints", "திறந்த குடிமக்கள் புகார்கள்"), score: bi("Attention score (3 × severe + high)", "கவனப் புள்ளி (3 × கடுமையானவை + அதிக முக்கியத்துவம்)") } as Record<string, Bilingual>)[key] ?? bi(key, key);
    unit = key === "score" ? "points" : "incidents";
    methodBi = bi(`${labelBi.en} by zone, ${PERIOD_EN[s.period]}, as the console's zone table counts them.`, `${labelBi.ta}, மண்டல வாரியாக, ${PERIOD_TA[s.period]}, கன்சோலின் மண்டல அட்டவணைப்படி.`);
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: L(c, `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, `${spoken(Number(x.item.severe))} கடுமையானவை · ${spoken(Number(x.item.open))} திறந்தவை`), zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const }));
    shade = { geo: "zone", label: L(c, labelBi.en, labelBi.ta), values: rows.map((x) => ({ key: Number(x.zone), value: Number(x[key]) })) };
  } else if (measure === "taluk_open") {
    const r = await call(c, "taluks", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    labelBi = bi("Unresolved incidents, last 30 days", "தீர்க்கப்படாத சம்பவங்கள், கடந்த 30 நாட்கள்"); unit = "incidents";
    methodBi = bi("Open incidents by revenue taluk over the last 30 days (the Trends page's taluk ranking).", "வருவாய் வட்ட வாரியாகக் கடந்த 30 நாட்களின் திறந்த சம்பவங்கள் (போக்குகள் பக்கத்தின் வட்டத் தரவரிசை).");
    all = rows.map((x) => Number(x.open));
    items = rank(rows, (x) => Number(x.open), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: L(c, `${spoken(Number(x.item.severe ?? 0))} severe`, `${spoken(Number(x.item.severe ?? 0))} கடுமையானவை`), zone: null, lat: num(x.item.lat), lon: num(x.item.lon), action: "none" as const }));
  } else if (measure === "hotspots") {
    const r = await call(c, "hotspots", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    labelBi = bi("Incidents in 30 days, per hotspot", "ஒவ்வொரு மையப் பகுதியிலும் 30 நாட்களில் சம்பவங்கள்"); unit = "incidents";
    methodBi = bi("Clusters of incidents within 250 m of each other (DBSCAN), 3 or more in the last 30 days.", "ஒன்றுக்கொன்று 250 மீ-க்குள் உள்ள சம்பவக் கொத்துகள் (DBSCAN), கடந்த 30 நாட்களில் 3 அல்லது அதிகம்.");
    all = rows.map((x) => Number(x.incidents_30d));
    items = rank(rows, (x) => Number(x.incidents_30d), n, order).map((x) => ({ key: String(x.item.id), label: `${clip(c.ta ? CAT_LABEL_TA[String(x.item.cat ?? "")] ?? x.item.label : x.item.label, 60)} · ${clip(x.item.top_place, 50)}`, value: x.value, rank: x.rank,
      sub: L(c, `${spoken(Number(x.item.open))} open · ${clip(x.item.zone_name, 40)}`, `${spoken(Number(x.item.open))} திறந்தவை · ${clip(zoneTa(w, num(x.item.zone)) ?? x.item.zone_name, 40)}`), zone: num(x.item.zone), lat: num(x.item.lat), lon: num(x.item.lon), action: "zone" as const }));
    pts = items.filter((x) => x.lat != null).map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else {
    const d = await deptMeasures(c);
    const key = measure === "dept_backlog" ? "days" : measure === "dept_resolution" ? "closeDays" : measure === "dept_overdue" ? "overdue" : "open";
    labelBi = ({ days: bi("Average age of open incidents", "திறந்த சம்பவங்களின் சராசரி வயது"), closeDays: bi("Average days to close", "மூட ஆன சராசரி நாட்கள்"),
      overdue: bi("Open past the deadline", "காலக்கெடு தாண்டி திறந்தவை"), open: bi("Open incidents", "திறந்த சம்பவங்கள்") } as Record<string, Bilingual>)[key] ?? bi(key, key);
    unit = key === "days" || key === "closeDays" ? "days" : "incidents";
    methodBi = ({ days: bi("Departments with 5 or more open incidents, by the average age of their open incidents (the console's backlog card).", "5 அல்லது அதிகம் திறந்த சம்பவங்கள் உள்ள துறைகள், அவற்றின் சராசரி வயதுப்படி (கன்சோலின் நிலுவை அட்டை)."),
      closeDays: bi(`Average days from first report to closing, incidents closed ${inPeriod(s.period)}.`, `முதல் பதிவிலிருந்து மூடும் வரை சராசரி நாட்கள், ${PERIOD_TA[s.period]} மூடிய சம்பவங்கள்.`),
      overdue: bi(`Open incidents past their deadline, ${PERIOD_EN[s.period]}.`, `காலக்கெடு தாண்டிய திறந்த சம்பவங்கள், ${PERIOD_TA[s.period]}.`),
      open: bi(`Open incidents, ${PERIOD_EN[s.period]}.`, `திறந்த சம்பவங்கள், ${PERIOD_TA[s.period]}.`) } as Record<string, Bilingual>)[key] ?? bi("", "");
    const rows = d.filter((x) => x[key] != null);
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
      sub: L(c, `${spoken(Number(x.item.open ?? 0))} open`, `${spoken(Number(x.item.open ?? 0))} திறந்தவை`), zone: null, lat: null, lon: null, action: "dept" as const }));
  }
  const label = L(c, labelBi.en, labelBi.ta), method = L(c, methodBi.en, methodBi.ta);
  const scope = scopeWords(w, s);
  const scoped = measure.startsWith("zone_") || measure.startsWith("dept_");
  const titles = bi(`${order === "top" ? "Top" : "Bottom"} ${items.length} · ${labelBi.en}${scoped ? ` · ${scope.en}` : ""}`, `${order === "top" ? "முதல்" : "கடைசி"} ${items.length} · ${labelBi.ta}${scoped ? ` · ${scope.ta}` : ""}`);
  const title = titles;
  if (!items.length) return { title, takeaway: null, say: bi("There is nothing to rank for this.", "இதற்கு வரிசைப்படுத்த எதுவும் இல்லை."), blocks: [] };
  const first = items[0];
  const vm = vsMedian(first.value, all);
  if (order === "top" && first.value === 0 && all.every((v) => v === 0)) {
    const nothing = bi(`Nothing to rank: all ${all.length} read 0${unit ? ` ${unit}` : ""}${asWhen ? ` as of ${asWhen}` : ""}.`, `வரிசைப்படுத்த எதுவும் இல்லை: ${all.length} அளவீடுகளும் 0${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`);
    return { title, takeaway: nothing, say: measure === "rain" ? bi(`No rain in the last 24 hours at any of the ${all.length} stations${asWhen ? `, as of ${asWhen}` : ""}.`, `கடந்த 24 மணி நேரத்தில் ${all.length} நிலையங்களிலும் மழை இல்லை${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`) : nothing,
      blocks: [{ kind: "Ranking", id: "rank", title: label, unit, method, order, items }, ...(pts.length ? [{ kind: "MapView" as const, id: "map", title: L(c, "Stations", "நிலையங்கள்"), rule: null, shade: null, points: pts, outline: [] }] : [])] };
  }
  // the Tamil lines name a zone and a department by their Tamil names (a zone by its number, a department by its code)
  const labelTaOf = (x: (typeof items)[number]) => (x.action === "zone" && x.zone != null ? zoneTa(w, x.zone) : x.action === "dept" ? deptTa(w, x.key) : null) ?? x.label;
  const asOfWords = asWhen ? `, as of ${asWhen}` : "";
  const say = bi(
    `${order === "top" ? "Highest" : "Lowest"}: ${first.label}, ${spoken(first.value)}${unit && unit !== "points" ? ` ${unit}` : ""}${asOfWords}.${items[1] ? ` Then ${items.slice(1, 3).map((x) => `${x.label} ${spoken(x.value)}`).join(", ")}.` : ""}`,
    `${order === "top" ? "அதிகம்" : "குறைவு"}: ${labelTaOf(first)}, ${spoken(first.value)}${unit && unit !== "points" ? ` ${UNIT_TA[unit] ?? unit}` : ""}${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.${items[1] ? ` அடுத்து ${items.slice(1, 3).map((x) => `${labelTaOf(x)} ${spoken(x.value)}`).join(", ")}.` : ""}`
  );
  const takeaway = order === "top" && vm.ratio && vm.ratio >= 1.5
    ? bi(`${first.label} is ${spoken(vm.ratio)}× the median of all ${all.length}.`, `${labelTaOf(first)}, அனைத்து ${all.length}-இன் இடைநிலையை விட ${spoken(vm.ratio)} மடங்கு.`)
    : bi(`${first.label} leads with ${spoken(first.value)}${unit && unit !== "points" ? ` ${unit}` : ""}.`, `${labelTaOf(first)} முதலிடம்: ${spoken(first.value)}.`);
  const blocks: BlockT[] = [{ kind: "Ranking", id: "rank", title: label, unit, method, order, items }];
  if (shade || pts.length) blocks.push({ kind: "MapView", id: "map", title: shade ? L(c, `${labelBi.en} by zone`, `${labelBi.ta}, மண்டல வாரியாக`) : L(c, "On the map", "வரைபடத்தில்"), rule: null, shade, points: pts, outline: items.filter((x) => x.zone).slice(0, 3).map((x) => x.zone as number) });
  const total = all.reduce((a, b) => a + b, 0);
  if (measure.startsWith("zone_") || measure === "taluk_open") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
      { key: "top", label: L(c, `${first.label}`, labelTaOf(first)), value: first.value, unit, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "total", label: L(c, "All areas together", "எல்லாப் பகுதிகளும் சேர்த்து"), value: total, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "share", label: L(c, `${first.label}'s share`, `${labelTaOf(first)} பங்கு`), value: share(first.value, total) ?? 0, unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  } else if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
      { key: "top", label: first.label, value: first.value, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "median", label: L(c, "Median of all stations", "எல்லா நிலையங்களின் இடைநிலை"), value: round(median(all) ?? 0, 1), unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "n", label: L(c, "Reporting", "அளவீடு தந்தவை"), value: all.length, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  }
  return { title, takeaway, say, blocks };
}

/** Departments with every measure the console has for them, joined by code. */
// Every department, side by side, whatever department the console is filtered to: the tools that rank departments read the department filter
// differently (departments and dept_backlog ignore it, dept_followups and resolution_times apply it), so with one department chosen the others
// read 0 past deadline (QA4 gate, gate-oracle-2). A screen that wants one department picks its row from this list.
async function deptMeasures(c: Ctx): Promise<Row[]> {
  const sc = { scope: scopeArg({ ...c.s, dept: null }) };
  const [deps, backlog, res, fol] = await Promise.all([
    call(c, "departments", sc), call(c, "dept_backlog", sc), call(c, "resolution_times", sc), call(c, "dept_followups", sc).catch(() => null)
  ]);
  const by = new Map<string, Row>();
  for (const d of (deps.data as { rows: Row[] }).rows) by.set(d.code, { code: d.code, name: d.name, open: d.open, n: d.n, severe: d.severe, unverified: d.unverified });
  for (const b of (backlog.data as { rows: Row[] }).rows) by.set(b.code, { ...(by.get(b.code) ?? { code: b.code, name: b.name }), days: b.days, backlogOpen: b.n, overdueAll: b.overdue });
  for (const r of (res.data as { rows: Row[] }).rows) by.set(r.code, { ...(by.get(r.code) ?? { code: r.code, name: r.name }), closeDays: r.days, closed: r.n, onTimePct: r.onTimePct });
  for (const f of ((fol?.data as { rows: Row[] } | undefined)?.rows ?? [])) by.set(f.code, { ...(by.get(f.code) ?? { code: f.code, name: f.name }), overdue: f.overdue, serious: f.serious, awaiting: f.awaiting, complaints: f.complaints });
  return [...by.values()];
}

// ------------------------------------------------------------------ compare --

const CMP_METRICS = [
  { key: "n", label: "Reported", ta: "பதிவானவை" }, { key: "severe", label: "Severe", ta: "கடுமையானவை" }, { key: "high", label: "High", ta: "அதிக முக்கியத்துவம்" }, { key: "open", label: "Open", ta: "திறந்தவை" },
  { key: "complaints", label: "Open complaints", ta: "திறந்த புகார்கள்" }, { key: "overdue", label: "Past deadline", ta: "காலக்கெடு தாண்டியவை" }
];
/** a comparison's measures as the screen shows them, in its language */
const metricsIn = (c: Pick<Ctx, "ta">, ms: { key: string; label: string; ta: string }[]) => ms.map((m) => ({ key: m.key, label: c.ta ? m.ta : m.label }));

async function compare(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  if (slots.depts.length >= 2) return compareDepts(c);
  const zones = [...new Set(slots.zones)].slice(0, 4);
  if (zones.length < 2) return { title: bi("Compare", "ஒப்பீடு"), takeaway: null, say: bi("Which two areas should I compare?", "எந்த இரண்டு பகுதிகளை ஒப்பிட வேண்டும்?"), blocks: [] };
  const base = { ...s, zone: null };
  const [zr, ...sides] = await Promise.all([
    call(c, "zones", { scope: scopeArg(base) }),
    ...zones.map((z) => Promise.all([call(c, "change_drivers", { scope: scopeArg(base, { zone: z }) }), call(c, "incident_series", { scope: scopeArg(base, { zone: z }) })]))
  ]) as [ToolResult, ...[ToolResult, ToolResult][]];
  const zrows = (zr.data as { rows: Row[] }).rows;
  let seriesLabels: string[] = [];
  const out = zones.map((z, i) => {
    const row = zrows.find((x) => Number(x.zone) === z) ?? {};
    const [cd, ser] = sides[i];
    const d = cd.data as { totals: Row; categories: Row[] };
    const buckets = ((ser.data as { buckets: Row[] }).buckets ?? []);
    if (!seriesLabels.length) seriesLabels = buckets.map((b) => when(b.from)?.split(",")[0] ?? "");
    return { key: String(z), label: (c.ta ? zoneTa(w, z) : zoneName(w, z)) ?? `Zone ${z}`, zone: z,
      values: { n: Number(row.n ?? d.totals?.n ?? 0), severe: Number(row.severe ?? 0), high: Number(row.high ?? 0), open: Number(row.open ?? 0), complaints: Number(row.complaints ?? 0), overdue: Number(d.totals?.overdue ?? 0) },
      cats: (d.categories ?? []).slice(0, 6).map((x) => ({ code: String(x.code), label: kindLabel(c, x), n: Number(x.n) })),
      series: buckets.map((b) => Number(b.n)) };
  });
  const gaps = largestGaps(out, CMP_METRICS.map((m) => m.key));
  const lab = (k: string) => CMP_METRICS.find((m) => m.key === k)?.label ?? k;
  const labTa = (k: string) => CMP_METRICS.find((m) => m.key === k)?.ta ?? k;
  // the sides are named in the screen's language; each line names them in its own
  const en = (label: string) => zoneName(w, out.find((x) => x.label === label)?.zone) ?? label;
  const tam = (label: string) => zoneTa(w, out.find((x) => x.label === label)?.zone) ?? label;
  const titles = bi(`${out.map((x) => en(x.label)).join(" vs ")} · ${PERIOD_EN[s.period]}`, `${out.map((x) => tam(x.label)).join(" / ")} ஒப்பீடு · ${PERIOD_TA[s.period]}`);
  const title = L(c, titles.en, titles.ta);
  const [a, b] = out;
  const g = gaps[0];
  const say = bi(
    `${out.map((x) => `${en(x.label)}: ${spoken(x.values.severe)} severe and ${spoken(x.values.open)} open.`).join(" ")}${g ? ` The biggest gap is ${lab(g.metric).toLowerCase()}: ${en(g.hi)} ${spoken(g.hiValue)} against ${en(g.lo)} ${spoken(g.loValue)}.` : ""}`,
    `${out.map((x) => `${tam(x.label)}: ${spoken(x.values.severe)} கடுமையான, ${spoken(x.values.open)} திறந்தவை.`).join(" ")}${g ? ` பெரிய வேறுபாடு ${labTa(g.metric)}: ${tam(g.hi)} ${spoken(g.hiValue)}, ${tam(g.lo)} ${spoken(g.loValue)}.` : ""}`
  );
  const takeaway = g ? bi(`${en(g.hi)} had ${g.ratio ? `${spoken(g.ratio)}×` : `${spoken(g.gap)} more`} the ${lab(g.metric).toLowerCase()} of ${en(g.lo)} ${inPeriod(s.period)}.`,
    `${PERIOD_TA[s.period]} ${tam(g.hi)}, ${tam(g.lo)}-ஐ விட ${g.ratio ? `${spoken(g.ratio)} மடங்கு` : `${spoken(g.gap)} கூடுதல்`} ${labTa(g.metric)}.`) : null;
  c.notes.push(bi("Median resolution time is not kept per zone in the data; the board compares counts.", "தீர்வு நேரத்தின் இடைநிலை மண்டல வாரியாகத் தரவில் இல்லை; இந்தப் பலகை எண்ணிக்கைகளை ஒப்பிடுகிறது."));
  return { title: titles, takeaway, say, blocks: [
    { kind: "Compare", id: "cmp", title, metrics: metricsIn(c, CMP_METRICS), sides: out, seriesLabels: c.ta ? seriesLabels.map(labelTa) : seriesLabels,
      diffs: gaps.slice(0, 6).map((x) => ({ metric: x.metric, label: L(c, lab(x.metric), labTa(x.metric)), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) },
    { kind: "MapView", id: "map", title: out.length === 2 ? L(c, "Both areas", "இரு பகுதிகளும்") : L(c, `The ${out.length} areas`, `${out.length} பகுதிகள்`), rule: null,
      shade: { geo: "zone", label: L(c, "Severe incidents", "கடுமையான சம்பவங்கள்"), values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.severe) })) }, points: [], outline: zones }
  ] };
}

async function compareDepts(c: Ctx): Promise<Part> {
  const d = await deptMeasures(c);
  const pick = c.slots.depts.slice(0, 4).map((code) => d.find((x) => x.code === code)).filter((x): x is Row => !!x);
  const metrics = [{ key: "open", label: "Open", ta: "திறந்தவை" }, { key: "overdue", label: "Past deadline", ta: "காலக்கெடு தாண்டியவை" }, { key: "severe", label: "Severe", ta: "கடுமையானவை" },
    { key: "days", label: "Avg age open (days)", ta: "திறந்தவற்றின் சராசரி வயது (நாட்கள்)" }, { key: "closeDays", label: "Avg days to close", ta: "மூட ஆன சராசரி நாட்கள்" }];
  // each body by its own name, in Tamil by its code (DEPT_TA covers every code)
  const nameTa = (x: Row) => DEPT_TA[String(x.code)] ?? String(x.name);
  const titles = bi(`${pick.map((x) => x.name).join(" vs ")} · ${PERIOD_EN[c.s.period]}`, `${pick.map(nameTa).join(" / ")} ஒப்பீடு · ${PERIOD_TA[c.s.period]}`);
  const title = L(c, titles.en, titles.ta);
  if (pick.length < 2) return { title: titles, takeaway: null, say: bi("I could not find both departments in the data.", "இரண்டு துறைகளையும் தரவில் காண முடியவில்லை."), blocks: [] };
  const sides = pick.map((x) => ({ key: String(x.code), label: clip(c.ta ? nameTa(x) : x.name, 80), zone: null, values: Object.fromEntries(metrics.map((m) => [m.key, Number(x[m.key] ?? 0)])), cats: [], series: [] }));
  const gaps = largestGaps(sides, metrics.map((m) => m.key));
  const g = gaps[0];
  const lab = (k: string) => metrics.find((m) => m.key === k)?.label ?? k;
  const labTa = (k: string) => metrics.find((m) => m.key === k)?.ta ?? k;
  const en = (label: string) => String(pick.find((x) => clip(c.ta ? nameTa(x) : x.name, 80) === label)?.name ?? label);
  const tam = (label: string) => { const x = pick.find((y) => clip(c.ta ? nameTa(y) : y.name, 80) === label); return x ? nameTa(x) : label; };
  return {
    title: titles, takeaway: g ? bi(`Largest gap: ${lab(g.metric)}, ${en(g.hi)} ${spoken(g.hiValue)} against ${en(g.lo)} ${spoken(g.loValue)}.`, `பெரிய வேறுபாடு: ${labTa(g.metric)}, ${tam(g.hi)} ${spoken(g.hiValue)}, ${tam(g.lo)} ${spoken(g.loValue)}.`) : null,
    say: bi(sides.map((x) => `${en(x.label)}: ${spoken(x.values.open)} open, ${spoken(x.values.overdue)} past deadline`).join(". ") + ".", sides.map((x) => `${tam(x.label)}: ${spoken(x.values.open)} திறந்தவை, ${spoken(x.values.overdue)} காலக்கெடு தாண்டியவை`).join(". ") + "."),
    blocks: [{ kind: "Compare", id: "cmp", title, metrics: metricsIn(c, metrics), sides, seriesLabels: [], diffs: gaps.slice(0, 5).map((x) => ({ metric: x.metric, label: L(c, lab(x.metric), labTa(x.metric)), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) }]
  };
}

// ------------------------------------------------------------------ trend --

async function seriesBlock(c: Ctx, s: ScopeT, title: string): Promise<{ block: Extract<BlockT, { kind: "Trend" }>; values: number[]; open: number[]; severe: number[]; labels: string[]; total: number }> {
  const r = await call(c, "incident_series", { scope: scopeArg(s) });
  const d = r.data as { buckets: Row[]; unit: string; normal: { lo: number; hi: number; mean: number } | null };
  const values = d.buckets.map((b) => Number(b.n));
  const labels = d.buckets.map((b) => (d.unit === "2h" || /hour/.test(d.unit) ? when(b.from)?.split(", ")[1] ?? "" : when(b.from)?.split(",")[0] ?? ""));
  const normal = d.normal && Number.isFinite(d.normal.hi) ? { lo: Number(d.normal.lo), hi: Number(d.normal.hi) } : null;
  const marks = unusualPoints(values, normal).slice(0, 12).map((i) => ({ i, why: normal ? `Above the usual range (${spoken(normal.lo)}–${spoken(normal.hi)})` : "More than 2 standard deviations above the mean" }));
  return { block: { kind: "Trend", id: "trend", title, unit: "incidents", labels, values, marks, normal }, values, open: d.buckets.map((b) => Number(b.open ?? 0)), severe: d.buckets.map((b) => Number(b.severe ?? 0)), labels, total: values.reduce((a, b) => a + b, 0) };
}

async function trend(c: Ctx): Promise<Part> {
  if (c.slots.span?.kind === "compare") return periodCompare(c, c.slots.span.key);
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, cat: null });
  const subject = catLabel(w, s.cat) ?? "Incidents";
  const subjectTa = catTa(w, s.cat) ?? "சம்பவங்கள்";
  // no kind named: "incidents", never "incidents of incidents" or "incidents reports" (same-number-21)
  const generic = !catLabel(w, s.cat);
  const t = await seriesBlock(c, s, L(c, `${subject} over time`, `${subjectTa}, காலவாரியாக`));
  const zr = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const title = bi(`${subject} · ${scope.en}`, `${subjectTa} · ${scope.ta}`);
  if (!t.total) return { title, takeaway: null, say: bi(`No ${subject.toLowerCase()} in this period.`, "இந்தக் காலத்தில் எதுவும் இல்லை."), blocks: [t.block] };
  const p = peak(t.values)!;
  const half = Math.floor(t.values.length / 2);
  const first = t.values.slice(0, half).reduce((a, b) => a + b, 0), second = t.values.slice(half).reduce((a, b) => a + b, 0);
  const ch = change(second, first);
  const say = bi(
    `${plural(t.total, "incident", "incidents")}${generic ? "" : ` of ${subject.toLowerCase()}`} ${inPeriod(s.period)}. The peak was ${spoken(p.value)} around ${t.labels[p.i]}.${ch.pct != null ? ` The second half had ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "more" : "fewer"} than the first.` : ""}`,
    `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)}: `}${spoken(t.total)} சம்பவங்கள். உச்சம் ${labelTa(t.labels[p.i])} அளவில் ${spoken(p.value)}.${ch.pct != null ? ` பின்பாதியில் ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "அதிகம்" : "குறைவு"}.` : ""}`
  );
  const takeaway = t.block.marks.length
    ? bi(`${plural(t.block.marks.length, "period was", "periods were")} above the usual range; the peak was ${spoken(p.value)} around ${t.labels[p.i]}.`, `${t.block.marks.length} காலங்கள் வழக்கத்தை விட அதிகம்; உச்சம் ${spoken(p.value)}.`)
    : ch.pct != null ? bi(`${ch.pct >= 0 ? "Rising" : "Falling"}: ${spoken(Math.abs(ch.pct))}% ${ch.pct >= 0 ? "more" : "fewer"} in the second half of the period.`, `${ch.pct >= 0 ? "ஏறுமுகம்" : "இறங்குமுகம்"}: ${spoken(Math.abs(ch.pct))}%.`) : null;
  return { title, takeaway, say, blocks: [
    { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
      { key: "total", label: L(c, `${subject}, ${PERIOD_EN[s.period]}`, `${subjectTa}, ${PERIOD_TA[s.period]}`), value: t.total, unit: null, prev: null, delta: null, tone: "neutral", spark: t.values.slice(-30) },
      { key: "peak", label: L(c, `Peak (${t.labels[p.i]})`, `உச்சம் (${labelTa(t.labels[p.i])})`), value: p.value, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "half", label: L(c, "Second half vs first", "பின்பாதி / முன்பாதி"), value: second, unit: null, prev: first, delta: ch.delta, pct: ch.pct, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] }
    ] },
    t.block,
    { kind: "Ranking", id: "zones", title: L(c, `Zones with the most ${subject.toLowerCase()}`, `அதிக ${subjectTa} உள்ள மண்டலங்கள்`), unit: "incidents", method: L(c, `Incidents reported by zone, ${PERIOD_EN[s.period]}.`, `மண்டல வாரியாகப் பதிவான சம்பவங்கள், ${PERIOD_TA[s.period]}.`), order: "top",
      items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: L(c, `${spoken(Number(x.item.open))} open`, `${spoken(Number(x.item.open))} திறந்தவை`), zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
    { kind: "MapView", id: "map", title: L(c, "By zone", "மண்டல வாரியாக"), rule: null, shade: { geo: "zone", label: L(c, subject, subjectTa), values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: [], outline: zr5.slice(0, 3).map((x) => Number(x.item.zone)) }
  ] };
}

// ------------------------------------------------------------------ why --

async function why(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, s);
  const r = await call(c, "change_drivers", { scope: scopeArg(s) });
  const d = r.data as { totals: Row; rainDays: number; rainDaysPrev: number; categories: Row[]; places: Row[]; depts: Row[]; top: Row[] };
  const t = d.totals ?? {};
  const rises = [...(d.categories ?? [])].filter((x) => Number(x.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 3);
  const ch = change(Number(t.n ?? 0), num(t.prev));
  const title = bi(`Why · ${scope.en}`, `ஏன் · ${scope.ta}`);
  const reasons: string[] = [];
  const reasonsTa: string[] = [];
  if (rises[0]) {
    reasons.push(`${rises.map((x) => `${clip(x.label, 60).toLowerCase()} rose by ${spoken(Number(x.delta))}`).join(", ")}`);
    reasonsTa.push(`${rises.map((x) => `${clip(kindTa(x), 60)} ${spoken(Number(x.delta))} கூடியது`).join(", ")}`);
  }
  if (num(t.rainLinked)) { reasons.push(`${Number(t.rainLinked) === 1 ? "1 incident was" : `${spoken(Number(t.rainLinked))} incidents were`} rain-linked over ${plural(d.rainDays, "rain day", "rain days")}`); reasonsTa.push(`${spoken(d.rainDays)} மழை நாட்களில் ${spoken(Number(t.rainLinked))} மழை தொடர்பானவை`); }
  if (num(t.overdue)) { reasons.push(Number(t.overdue) === 1 ? "1 open incident is past its deadline" : `${spoken(Number(t.overdue))} open incidents are past their deadline`); reasonsTa.push(nTa(Number(t.overdue), "காலக்கெடு தாண்டியது", "காலக்கெடு தாண்டியவை")); }
  const place = d.places?.[0];
  if (place) { reasons.push(`the busiest spot is ${clip(place.place, 60)} (${spoken(Number(place.n))} ${clip(place.category, 50).toLowerCase()})`); reasonsTa.push(`அதிக இடம் ${clip(place.place, 60)} (${spoken(Number(place.n))})`); }
  const head = ch.delta != null
    ? `${plural(Number(t.n), "incident", "incidents")} ${inPeriod(s.period)} against ${spoken(Number(t.prev))} the period before${ch.pct ? ` (${ch.pct > 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}%)` : ""}.`
    : `${plural(Number(t.n ?? 0), "incident", "incidents")} ${inPeriod(s.period)}.`;
  const headTa = `${PERIOD_TA[s.period]} ${spoken(Number(t.n ?? 0))} சம்பவங்கள்${num(t.prev) != null ? `, முந்தைய காலத்தில் ${spoken(Number(t.prev))}` : ""}.`;
  const text = L(c, `${head} ${reasons.length ? `Main reasons: ${reasons.join("; ")}.` : ""}`, `${headTa}${reasonsTa.length ? ` முக்கியக் காரணங்கள்: ${reasonsTa.join("; ")}.` : ""}`);
  const blocks: BlockT[] = [
    { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
      { key: "n", label: L(c, `Reported, ${PERIOD_EN[s.period]}`, `பதிவானவை, ${PERIOD_TA[s.period]}`), value: Number(t.n ?? 0), unit: null, prev: num(t.prev), delta: ch.delta, pct: ch.pct, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] },
      { key: "severe", label: L(c, "Severe", "கடுமையானவை"), value: Number(t.severe ?? 0), unit: null, prev: num(t.severePrev), delta: num(t.severePrev) != null ? Number(t.severe ?? 0) - Number(t.severePrev) : null, tone: "bad", spark: [] },
      { key: "overdue", label: L(c, "Past deadline (open)", "காலக்கெடு தாண்டியவை (திறந்தவை)"), value: Number(t.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "rain", label: L(c, "Rain-linked", "மழை தொடர்பானவை"), value: Number(t.rainLinked ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] },
    { kind: "Answer", id: "answer", title: L(c, "What drives it", "எது காரணம்"), text, facts: [
      ...rises.map((x) => ({ label: L(c, `${clip(x.label, 100)}: now vs before`, `${clip(kindTa(x), 100)}: இப்போது / முன்பு`), value: Number(x.n), unit: L(c, `(was ${spoken(Number(x.prev))})`, `(முன்பு ${spoken(Number(x.prev))})`) })),
      ...(d.depts ?? []).slice(0, 2).map((x) => ({ label: L(c, `${clip(x.name, 100)}: open past deadline`, `${clip(deptTaNamed(w, String(x.name)) ?? x.name, 100)}: காலக்கெடு தாண்டிய திறந்தவை`), value: Number(x.overdue ?? 0), unit: null }))
    ].slice(0, 12) }
  ];
  const cats = [...(d.categories ?? [])].sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 8);
  if (cats.length) blocks.push({ kind: "Chart", id: "chart", title: L(c, "Change by kind of incident (now minus before)", "வகைவாரி மாற்றம் (இப்போது − முன்பு)"), chart: "hbar", unit: "incidents", labels: cats.map((x) => kindLabel(c, x)), values: cats.map((x) => Number(x.delta)) });
  const top = (d.top ?? []).map((x) => caseRow({ ...x, sev: x.severity, why: null, reasons: x.reasons }, w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: L(c, "The incidents behind it", "இதற்குப் பின்னால் உள்ள சம்பவங்கள்"), source: "list", sev: null, total: top.length, rows: top });
  return {
    title,
    takeaway: rises[0] ? bi(`${clip(rises[0].label, 60)} rose the most: ${spoken(Number(rises[0].n))} against ${spoken(Number(rises[0].prev))}.`, `${clip(kindTa(rises[0]), 60)} அதிகம் உயர்ந்தது: ${spoken(Number(rises[0].n))}, முன்பு ${spoken(Number(rises[0].prev))}.`) : null,
    say: bi(`${head} ${reasons.slice(0, 2).length ? `Mainly: ${reasons.slice(0, 2).join("; ")}.` : ""}`.trim(), `${headTa}${reasonsTa.length ? ` ${reasonsTa.slice(0, 2).join("; ")}.` : ""}`),
    blocks
  };
}

// ------------------------------------------------------------------ performance --

async function performance(c: Ctx): Promise<Part> {
  return c.slots.by === "zone" ? zonePerformance(c) : deptPerformance(c);
}

async function deptPerformance(c: Ctx): Promise<Part> {
  const { s } = c;
  const d = await deptMeasures(c);
  const slowest = rank(d.filter((x) => x.days != null), (x) => Number(x.days), 8);
  // one department asked: its own open and past-deadline figures, not the sum of every department's (RC-09, PB-060)
  const mine = s.dept ? d.filter((x) => x.code === s.dept) : d;
  const totalOpen = mine.reduce((a, x) => a + Number(x.open ?? 0), 0);
  const overdue = mine.reduce((a, x) => a + Number(x.overdue ?? 0), 0);
  const closeDays = median(d.filter((x) => x.closeDays != null).map((x) => Number(x.closeDays)));
  const onTime = median(d.filter((x) => x.onTimePct != null).map((x) => Number(x.onTimePct)));
  const t = await seriesBlock(c, s, L(c, "Still open, by when reported", "இன்னும் திறந்தவை, பதிவான காலவாரியாக"));
  t.block.values = t.open;
  t.block.title = L(c, "Still open today, by when they were reported", "இன்னும் திறந்தவை, பதிவான காலவாரியாக");
  t.block.marks = [];
  t.block.normal = null;
  const heatRows = slowest.slice(0, 8).map((x) => x.item);
  const cols = [{ k: "open", l: "Open", ta: "திறந்தவை" }, { k: "overdue", l: "Past deadline", ta: "காலக்கெடு தாண்டியவை" }, { k: "serious", l: "Severe or high", ta: "கடுமை அல்லது அதிகம்" },
    { k: "awaiting", l: "Awaiting you", ta: "உங்களுக்காகக் காத்திருப்பவை" }, { k: "days", l: "Avg age (days)", ta: "சராசரி வயது (நாட்கள்)" }, { k: "closeDays", l: "Days to close", ta: "மூட ஆன நாட்கள்" }];
  // a body by its own name, in Tamil by its code
  const nameOf = (x: Row) => (c.ta ? DEPT_TA[String(x.code)] ?? String(x.name) : String(x.name));
  const nameTa = (x: Row) => DEPT_TA[String(x.code)] ?? String(x.name);
  const title = bi(`Department performance${s.dept ? ` · ${deptName(c.w, s.dept) ?? s.dept}` : ""} · ${PERIOD_EN[s.period]}`, `துறைகளின் செயல்பாடு${s.dept ? ` · ${deptTa(c.w, s.dept) ?? s.dept}` : ""} · ${PERIOD_TA[s.period]}`);
  if (!slowest.length) return { title, takeaway: null, say: bi("No department has enough open incidents to rank.", "வரிசைப்படுத்த போதுமான தரவு இல்லை."), blocks: [] };
  const [a, b, cc] = slowest;
  const say = bi(
    `Slowest: ${a.item.name}, open incidents ${spoken(a.value)} days old on average.${b ? ` Then ${b.item.name} at ${spoken(b.value)}${cc ? ` and ${cc.item.name} at ${spoken(cc.value)}` : ""}.` : ""}`,
    `மிக மெதுவானது: ${nameTa(a.item)}, திறந்த சம்பவங்கள் சராசரியாக ${spoken(a.value)} நாட்கள்.${b ? ` அடுத்து ${nameTa(b.item)} ${spoken(b.value)}${cc ? `, ${nameTa(cc.item)} ${spoken(cc.value)}` : ""}.` : ""}`
  );
  const vm = vsMedian(a.value, d.filter((x) => x.days != null).map((x) => Number(x.days)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name}'s open incidents are ${spoken(vm.ratio)}× older than the median department's.`, `${nameTa(a.item)}-இன் திறந்த சம்பவங்கள் இடைநிலைத் துறையை விட ${spoken(vm.ratio)} மடங்கு பழையவை.`) : null,
    say, blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
        { key: "open", label: L(c, `Open${s.dept ? `, ${deptName(c.w, s.dept) ?? s.dept}` : ""}, ${PERIOD_EN[s.period]}`, `திறந்தவை${s.dept ? `, ${deptTa(c.w, s.dept) ?? s.dept}` : ""}, ${PERIOD_TA[s.period]}`), value: totalOpen, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "overdue", label: L(c, "Past deadline", "காலக்கெடு தாண்டியவை"), value: overdue, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "close", label: L(c, "Median days to close", "மூட ஆன இடைநிலை நாட்கள்"), value: round(closeDays ?? 0, 1), unit: "days", prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "ontime", label: L(c, "Median closed on time", "உரிய நேரத்தில் மூடியவை (இடைநிலை)"), value: round(onTime ?? 0, 0), unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: L(c, "Slowest departments first", "மிக மெதுவான துறைகள் முதலில்"), unit: "days",
        method: L(c, "Average age of open incidents, departments with 5 or more open (the console's backlog card).", "திறந்த சம்பவங்களின் சராசரி வயது; 5 அல்லது அதிகம் திறந்தவை உள்ள துறைகள் (கன்சோலின் நிலுவை அட்டை)."), order: "top",
        items: slowest.map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
          sub: L(c, `${spoken(Number(x.item.open ?? x.item.backlogOpen ?? 0))} open · ${spoken(Number(x.item.overdue ?? 0))} past deadline`, `${spoken(Number(x.item.open ?? x.item.backlogOpen ?? 0))} திறந்தவை · ${spoken(Number(x.item.overdue ?? 0))} காலக்கெடு தாண்டியவை`), zone: null, lat: null, lon: null, action: "dept" as const })) },
      t.block,
      { kind: "Heat", id: "heat", title: L(c, "Department × measure (darker = worse within the column)", "துறை × அளவு (அடர் நிறம் = அந்த நெடுவரிசையில் மோசம்)"), rows: heatRows.map((x) => clip(nameOf(x), 80)), cols: cols.map((x) => L(c, x.l, x.ta)),
        cells: heatRows.map((x) => cols.map((col) => round(Number(x[col.k] ?? 0), 1))) }
    ] };
}

async function zonePerformance(c: Ctx): Promise<Part> {
  const { s, w } = c;
  const r = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const rows = (r.data as { rows: Row[] }).rows;
  const ranked = rank(rows, (x) => Number(x.score), 15);
  const t = await seriesBlock(c, { ...s, zone: null }, L(c, "Incidents reported over time", "காலவாரியாகப் பதிவான சம்பவங்கள்"));
  const cols = [{ k: "n", l: "Reported", ta: "பதிவானவை" }, { k: "severe", l: "Severe", ta: "கடுமையானவை" }, { k: "high", l: "High", ta: "அதிக முக்கியத்துவம்" }, { k: "open", l: "Open", ta: "திறந்தவை" }, { k: "complaints", l: "Complaints", ta: "புகார்கள்" }];
  const tot = (k: string) => rows.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const sum = (v: number[]) => v.reduce((a, x) => a + x, 0);
  const zoneOf = (x: Row) => clip((c.ta ? zoneTa(w, Number(x.zone)) : null) ?? x.name, 80);
  const title = bi(`Zone performance · all zones · ${PERIOD_EN[s.period]}`, `மண்டலங்களின் செயல்பாடு · அனைத்து மண்டலங்களும் · ${PERIOD_TA[s.period]}`);
  const [a, b] = ranked;
  if (!a) return { title, takeaway: null, say: bi("No zone data for this period.", "இந்தக் காலத்துக்கு மண்டலத் தரவு இல்லை."), blocks: [] };
  const vm = vsMedian(a.value, rows.map((x) => Number(x.score)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name} needs the most attention: ${spoken(vm.ratio)}× the median zone's score.`, `${zoneTa(w, Number(a.item.zone))} அதிக கவனம் தேவை: இடைநிலை மண்டலத்தை விட ${spoken(vm.ratio)} மடங்கு.`) : null,
    say: bi(`${a.item.name} needs the most attention: ${spoken(Number(a.item.severe))} severe and ${spoken(Number(a.item.open))} open.${b ? ` Then ${b.item.name}.` : ""}`,
      `${zoneTa(w, Number(a.item.zone))}: ${spoken(Number(a.item.severe))} கடுமையான, ${spoken(Number(a.item.open))} திறந்தவை.${b ? ` அடுத்து ${zoneTa(w, Number(b.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
        // the trend beside it counts every incident, those with no zone too: the tile is that count, so the two agree (RC-09, PB-067)
        { key: "n", label: L(c, `Reported, ${PERIOD_EN[s.period]}`, `பதிவானவை, ${PERIOD_TA[s.period]}`), value: t.total, unit: null, prev: null, delta: null, tone: "neutral", spark: t.values.slice(-30) },
        // Severe and Open are read from the same series as Reported: the zone rows leave out the incidents with no zone, and the whole-district
        // figure on every other screen includes them (QA4 gate, gate-oracle-3)
        { key: "severe", label: L(c, "Severe", "கடுமையானவை"), value: sum(t.severe), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "open", label: L(c, "Open", "திறந்தவை"), value: sum(t.open), unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "complaints", label: L(c, "Open complaints", "திறந்த புகார்கள்"), value: tot("complaints"), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: L(c, "Zones by attention score (worst first)", "கவனப் புள்ளிப்படி மண்டலங்கள் (மோசமானவை முதலில்)"), unit: "points",
        method: L(c, "Attention score = 3 × severe + high, as the console's 'Hotspot zones' tile.", "கவனப் புள்ளி = 3 × கடுமையானவை + அதிக முக்கியத்துவம் (கன்சோலின் மையப் பகுதி மண்டலங்கள் அட்டை போல)."), order: "top",
        items: ranked.slice(0, 15).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: L(c, `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, `${spoken(Number(x.item.severe))} கடுமையானவை · ${spoken(Number(x.item.open))} திறந்தவை`), zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      { kind: "MapView", id: "map", title: L(c, "Attention score by zone", "மண்டல வாரியாகக் கவனப் புள்ளி"), rule: null, shade: { geo: "zone", label: L(c, "Attention score", "கவனப் புள்ளி"), values: rows.map((x) => ({ key: Number(x.zone), value: Number(x.score) })) }, points: [], outline: ranked.slice(0, 3).map((x) => Number(x.item.zone)) },
      t.block,
      { kind: "Heat", id: "heat", title: L(c, "Zone × measure (darker = worse within the column)", "மண்டலம் × அளவு (அடர் நிறம் = அந்த நெடுவரிசையில் மோசம்)"), rows: ranked.slice(0, 10).map((x) => zoneOf(x.item)), cols: cols.map((x) => L(c, x.l, x.ta)),
        cells: ranked.slice(0, 10).map((x) => cols.map((col) => Number(x.item[col.k] ?? 0))) }
    ] };
}

// ------------------------------------------------------------------ dashboard --

async function dashboard(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, cat: null });
  const subject = catLabel(w, s.cat) ?? "Incidents";
  const generic = !catLabel(w, s.cat);
  const [k, zr, hs, list] = await Promise.all([
    call(c, "overview_kpis", { scope: scopeArg(s) }),
    call(c, "zones", { scope: scopeArg({ ...s, zone: null }) }),
    call(c, "hotspots", { scope: scopeArg(s) }).catch(() => null),
    incidentList(c, { sort: "sev", status: "open" })
  ]);
  const subjectTa = catTa(w, s.cat) ?? "சம்பவங்கள்";
  const t = await seriesBlock(c, s, L(c, `${subject} over time`, `${subjectTa}, காலவாரியாக`));
  const kd = k.data as { cur: Record<string, number>; prev: Record<string, number>; series: Record<string, number[]> };
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const rows = list.rows.map((x) => caseRow(x, w)).slice(0, 8);
  const hot = ((hs?.data as { rows: Row[] } | undefined)?.rows ?? []).filter((x) => !s.cat || x.cat === s.cat).slice(0, 8);
  const pts: PointT[] = [...points(rows, 3), ...hot.map((x, i) => ({ n: null, id: String(x.id), lat: Number(x.lat), lon: Number(x.lon), label: L(c, `Hotspot: ${clip(x.top_place, 60)} (${spoken(Number(x.incidents_30d))} in 30 days)`, `மையப் பகுதி: ${clip(x.top_place, 60)} (30 நாட்களில் ${spoken(Number(x.incidents_30d))})`), sev: null, value: Number(x.incidents_30d), hot: i === 0 }))];
  const TILE: Record<string, string> = { reported: "பதிவானவை", severe: "கடுமையானவை", ongoing: "இன்னும் திறந்தவை", complaints: "திறந்த புகார்கள்" };
  const tile = (key: string, label: string, tone: "bad" | "neutral") => ({ key, label: L(c, label, TILE[key] ?? label), value: Number(kd.cur?.[key] ?? 0), unit: null, prev: num(kd.prev?.[key]), delta: num(kd.prev?.[key]) != null ? Number(kd.cur?.[key] ?? 0) - Number(kd.prev[key]) : null,
    pct: change(Number(kd.cur?.[key] ?? 0), num(kd.prev?.[key])).pct, tone, spark: (kd.series?.[key] ?? []).slice(-30) });
  const title = bi(`${subject} dashboard · ${scope.en}`, `${subjectTa} டாஷ்போர்டு · ${scope.ta}`);
  const rep = Number(kd.cur?.reported ?? t.total);
  const prev = num(kd.prev?.reported);
  const ch = change(rep, prev);
  // one zone asked: no "most in" another zone; the ranking is of zones, which a zone's own dashboard is not (RC-09, PB-142)
  const topZone = !s.zone && zr5[0] && zr5[0].value > 0 ? zr5[0] : undefined;
  // nothing reported: say so plainly instead of ranking zeros
  if (!rep && !zrows.some((x) => Number(x.n) > 0)) {
    return { title, takeaway: bi(`No ${reportsOf(subject, generic)} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)} `}புகார்கள் இல்லை.`),
      say: bi(`No ${reportsOf(subject, generic)} ${inPeriod(s.period)}${prev ? `, against ${spoken(prev)} the period before` : ""}.`, `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)} `}புகார்கள் இல்லை.`),
      blocks: [{ kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [tile("reported", "Reported", "neutral"), tile("severe", "Severe", "bad")] }, t.block] };
  }
  return { title,
    takeaway: topZone ? bi(`${topZone.item.name} has the most: ${spoken(topZone.value)} of ${spoken(zrows.reduce((a, x) => a + Number(x.n), 0))}.`, `${zoneTa(w, Number(topZone.item.zone))} அதிகம்: ${spoken(topZone.value)}.`) : null,
    say: bi(`${spoken(rep)} ${reportsOf(subject, generic, rep)} ${inPeriod(s.period)}${ch.pct != null ? `, ${ch.pct >= 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}% on the period before` : ""}. ${spoken(Number(kd.cur?.severe ?? 0))} severe.${topZone ? ` Most in ${topZone.item.name}.` : ""}`,
      `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)}: `}${spoken(rep)} புகார்கள், ${nTa(Number(kd.cur?.severe ?? 0), "கடுமையானது", "கடுமையானவை")}.${topZone ? ` அதிகம் ${zoneTa(w, Number(topZone.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [tile("reported", "Reported", "neutral"), tile("severe", "Severe", "bad"), tile("ongoing", "Still open", "neutral"), tile("complaints", "Open complaints", "neutral")] },
      { kind: "MapView", id: "map", title: L(c, "Where", "இடம்"), rule: L(c, "Numbered pins are the cases below; rings are hotspots (3+ incidents within 250 m in 30 days).", "எண்ணிட்ட குறிகள் கீழே உள்ள சம்பவங்கள்; வளையங்கள் மையப் பகுதிகள் (30 நாட்களில் 250 மீ-க்குள் 3+ சம்பவங்கள்)."),
        shade: { geo: "zone", label: L(c, subject, subjectTa), values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: pts, outline: [] },
      { kind: "Ranking", id: "zones", title: L(c, "Zones with the most", "அதிகம் உள்ள மண்டலங்கள்"), unit: "incidents", method: L(c, `${subject} reported by zone, ${PERIOD_EN[s.period]}.`, `மண்டல வாரியாகப் பதிவான ${subjectTa}, ${PERIOD_TA[s.period]}.`), order: "top",
        items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: L(c, `${spoken(Number(x.item.open))} open`, `${spoken(Number(x.item.open))} திறந்தவை`), zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      t.block,
      { kind: "CaseList", id: "cases", title: L(c, "Open cases, most serious first", "திறந்த சம்பவங்கள், மிகத் தீவிரமானவை முதலில்"), source: "list", sev: null, total: Number(list.incidents ?? list.total ?? rows.length), rows }
    ] };
}

// ------------------------------------------------------------------ map --

async function mapScreen(c: Ctx): Promise<Part> {
  if (c.slots.what === "hotspots") return ranking({ ...c, slots: { ...c.slots, measure: "hotspots", n: c.slots.n ?? 8 } });
  const part = await cases({ ...c, slots: { ...c.slots, sev: c.slots.sev ?? (c.slots.what === "severe" || !c.slots.what ? "Severe" : null) } });
  // the map leads, the numbered list follows
  return { ...part, blocks: [...part.blocks].sort((a, b) => Number(b.kind === "MapView") - Number(a.kind === "MapView")) };
}

/** Distance in metres between two points (haversine). */
export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

/** the map's layers (Ask the Map's context points) in Tamil */
const LAYER_TA: Record<string, string> = { schools: "பள்ளிகள்", hospitals: "மருத்துவமனைகள்", shelters: "தங்குமிடங்கள்", police: "காவல் நிலையங்கள்", fire: "தீயணைப்பு நிலையங்கள்",
  wards: "வார்டுகள்", places: "இடங்கள்", lakes: "ஏரிகள்", markets: "சந்தைகள்", parks: "பூங்காக்கள்", temples: "கோயில்கள்", bus: "பேருந்து நிறுத்தங்கள்" };

async function nearby(c: Ctx): Promise<Part> {
  let q = c.slots.q ?? c.heard;
  c.runs.push("ask_map");
  let r = await c.h.map(q);
  // "flooding in Adyar" can mean the Adyar locality or Zone 13 Adyar: when the locality finds nothing, ask for the zone
  const zone = c.w.zones.find((z) => new RegExp(`(^|[^a-z])${z.name.toLowerCase().replace(/[^a-z]+/g, ".?")}($|[^a-z])`).test(q.toLowerCase()));
  if (zone && !Number(r.total ?? 0) && !/zone|மண்டல/i.test(q)) {
    const q2 = q.replace(new RegExp(zone.name, "i"), `${zone.name} zone`);
    c.runs.push("ask_map");
    const r2 = await c.h.map(q2);
    if (Number(r2.total ?? 0) > 0) {
      r = r2; q = q2;
      c.notes.push(bi(`Read "${zone.name}" as Zone ${zone.n} ${zone.name}: the ${zone.name} locality itself had no results.`, `"${zone.name}" என்பதை ${zoneTa(c.w, zone.n)} மண்டலமாக (மண்டலம் ${zone.n}) எடுத்தேன்: அந்த இடத்துக்குத் தனியாக முடிவுகள் இல்லை.`));
    }
  }
  c.sources.add("Ask the Map");
  c.asOf ??= r.asOf?.data ?? null;
  const rows = ((r.rows ?? []) as Row[]).map((x) => caseRow(x, c.w));
  const feats = ((r.features ?? []) as Row[]).filter((f) => num(f.lat) != null);
  const placesNear = ((r.context?.points ?? []) as Row[]).filter((p) => num(p.lat) != null);
  const notes = ((r.trace ?? []) as Row[]).map((t) => String(t.note_en ?? ""));
  const notesTa = ((r.trace ?? []) as Row[]).map((t) => String(t.note_ta ?? ""));
  const radius = (() => {
    for (const n of notes) { const m = n.match(/within (\d+(?:\.\d+)?)\s*(km|m)\b/); if (m) return Number(m[1]) * (m[2] === "km" ? 1000 : 1); }
    return 1000;
  })();
  const headline = clip(String(r.answer?.headline ?? r.say?.en ?? "").replace(/\s*·\s*map layer ready\.?$/i, ""), 300);
  // the map answers in the language it was asked in: a Tamil screen keeps a Tamil headline, else says the count in Tamil
  const total = Number(r.total ?? 0);
  const headlineTa = /[஀-௿]/.test(headline) ? headline.replace(/\s*·\s*வரைபட அடுக்கு தயார்\.?$/, "") : total ? `வரைபடத்தில் ${spoken(total)} முடிவுகள்.` : "";
  // the question as asked, shown without a figure of its own (Finding 51); on a Tamil screen, the Collector's own Tamil words when they were Tamil
  const asked = words(c, q, 200);
  const title = bi(asked || "Ask the Map", /[஀-௿]/.test(c.heard) ? clip(c.heard, 200) : topicTa(c, asked) || "வரைபடக் கேள்வி");
  // what Ask the Map found and how (its own words, code's): under the map, never in a title, which carries the request's words
  const rule = L(c, [headline && `${headline.replace(/\.$/, "")}.`, ...notes.filter(Boolean).slice(-3)].filter(Boolean).join(" ").slice(0, 240),
    [headlineTa && `${headlineTa.replace(/\.$/, "")}.`, ...notesTa.filter(Boolean).slice(-3)].filter(Boolean).join(" ").slice(0, 240)) || null;
  // the places (schools, hospitals ...) next to the results, nearest first: each with its distance to the closest result
  const ranked = placesNear.map((p) => {
    let best = Infinity, to: Row | null = null;
    for (const f of feats) { const m = metres({ lat: Number(p.lat), lon: Number(p.lon) }, { lat: Number(f.lat), lon: Number(f.lon) }); if (m < best) { best = m; to = f; } }
    return { p, m: best, to };
  }).filter((x) => x.m <= radius).sort((a, b) => a.m - b.m);
  const within = ranked.length;
  ranked.splice(15);
  const blocks: BlockT[] = [];
  const pts: PointT[] = [
    ...ranked.map((x, i) => ({ n: i + 1, id: String(x.p.id), lat: Number(x.p.lat), lon: Number(x.p.lon), label: `${clip(x.p.name ?? x.p.kind, 100)} · ${spoken(x.m)} m`, sev: null, value: x.m, hot: i < 3 })),
    ...rows.slice(0, 60).filter((x) => x.lat != null).map((x) => ({ n: null, id: x.id, lat: x.lat as number, lon: x.lon as number, label: x.title, sev: x.sev, value: null, hot: false }))
  ];
  const layer = clip(ranked[0]?.p.layer ?? "places", 30);
  const layerTa = LAYER_TA[layer.toLowerCase()] ?? "இடங்கள்";
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: L(c, "On the map", "வரைபடத்தில்"), rule, shade: null, points: pts, outline: [] });
  if (ranked.length) {
    blocks.push({ kind: "Ranking", id: "near", title: L(c, `${within} ${layer} within ${spoken(radius)} m${within > ranked.length ? `, nearest ${ranked.length} listed` : ""}`, `${spoken(radius)} மீ-க்குள் ${within} ${layerTa}${within > ranked.length ? `, அருகிலுள்ள ${ranked.length}` : ""}`), unit: "m",
      method: L(c, `Straight-line distance from each place to the closest result, within ${spoken(radius)} m (Ask the Map's rule).`, `ஒவ்வொரு இடத்திலிருந்தும் அருகிலுள்ள முடிவுக்கு நேர்க்கோட்டுத் தூரம், ${spoken(radius)} மீ-க்குள் (வரைபடத்தின் விதி).`), order: "bottom",
      items: ranked.map((x, i) => ({ key: String(x.p.id), label: clip(x.p.name ?? `${x.p.kind} (no name on the map)`, 120), value: x.m, rank: i + 1, sub: x.to ? safeText(x.to.title, 120) : null, zone: null, lat: Number(x.p.lat), lon: Number(x.p.lon), action: "none" as const })) });
  }
  if (rows.length) blocks.push({ kind: "CaseList", id: "cases", title: L(c, "The incidents", "சம்பவங்கள்"), source: "map", sev: null, total: Number(r.total ?? rows.length), rows: rows.slice(0, 30) });
  const nearest = ranked[0];
  const placeWord = clip(nearest?.p.layer ?? "place", 30).replace(/s$/, "");
  return {
    title, takeaway: headline ? bi(headline, headlineTa) : null,
    say: ranked.length
      ? bi(`${plural(within, placeWord, `${placeWord}s`)} within ${spoken(radius)} metres of the results${within > ranked.length ? `; the nearest ${ranked.length} are listed` : ""}. The nearest: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} metres away.`,
        `${within} ${layerTa} ${spoken(radius)} மீட்டருக்குள். மிக அருகில்: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} மீட்டர்.`)
      : headline ? bi(headline, headlineTa || "வரைபடத்தில் முடிவுகள் உள்ளன.") : bi("Ask the Map found nothing for that.", "வரைபடத்தில் எதுவும் கிடைக்கவில்லை."),
    blocks
  };
}

// ------------------------------------------------------------------ brief, drafts --

/**
 * Where a department's records come from, said plainly. The police, PWD and government-hospital feeds are made by the generators in
 * police_dataset_generator/, pwd_dataset_generator/ and chennai_hospital_data/ (docs/qa/DATA_SOURCES.md), and most citizen
 * complaints are test filings: a brief on them must never sound like an official report.
 */
export function recordsOf(code: string): Bilingual {
  if (code.startsWith("POL-")) return bi("These are generated police test records, not an official police report.", "இவை சோதனைக்காக உருவாக்கப்பட்ட காவல் பதிவுகள், அதிகாரப்பூர்வ காவல் அறிக்கை அல்ல.");
  if (code.startsWith("PWD-")) return bi("The PWD records here are generated test data.", "இங்குள்ள பொதுப்பணித் துறைப் பதிவுகள் சோதனைத் தரவு.");
  if (code === "HLT-DMS") return bi("The hospital records here are generated test data.", "இங்குள்ள மருத்துவமனைப் பதிவுகள் சோதனைத் தரவு.");
  return bi("Most complaint records here are test filings.", "இங்குள்ள பெரும்பாலான புகார்கள் சோதனைப் பதிவுகள்.");
}

/** How old the data is, in words (never a figure): stale data is called stale. */
export function freshness(asOf: string | null, now = Date.now()): Bilingual {
  const m = String(asOf ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return bi("I can't tell how recent this is.", "இது எவ்வளவு புதியது என்று தெரியவில்லை.");
  // the store's times are India time
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0) - 5, Number(m[5] ?? 0) - 30);
  const h = (now - t) / 3_600_000;
  if (h < 24) return bi("This is from today's records.", "இது இன்றைய பதிவுகளின்படி.");
  if (h < 48) return bi("This is as of yesterday's records.", "இது நேற்றைய பதிவுகளின்படி.");
  if (h < 24 * 7) return bi("These records are a few days old.", "இந்தப் பதிவுகள் சில நாட்கள் பழையவை.");
  if (h < 24 * 14) return bi("These records are about a week old.", "இந்தப் பதிவுகள் ஏறக்குறைய ஒரு வாரம் பழையவை.");
  return bi("These records are more than two weeks old, so treat them as stale.", "இந்தப் பதிவுகள் இரண்டு வாரங்களுக்கு மேல் பழையவை; பழைய தரவாகக் கொள்ளுங்கள்.");
}

const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const norm1 = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
/** "Taking that as Greater Chennai Police." when the words heard were not the body's own name */
function assumed(heard: string, name: string, ta: string | null): Bilingual {
  if (norm1(heard).includes(norm1(name)) || (ta && heard.includes(ta))) return bi("", "");
  return bi(`Taking that as ${name}. `, `${ta ?? name} என்று எடுத்துக்கொள்கிறேன். `);
}

/**
 * A brief on one body: a department, or the corporation or PWD across their own departments. Code builds every figure; the spoken
 * line is a short retelling (what it is, how it stands, what needs attention, where the records come from, how old they are),
 * never the records read out.
 */
async function bodyBrief(c: Ctx): Promise<Part> {
  const org = c.slots.org ?? null;
  const codes = org ? c.w.depts.filter((d) => d.code.startsWith(`${org}-`)).map((d) => d.code) : [c.s.dept as string];
  // the name as said aloud: no code in brackets ("Metro Water (CMWSSB)" is "Metro Water")
  const name = (org ? (org === "GCC" ? "Greater Chennai Corporation" : org === "PWD" ? "Public Works Department" : org) : deptName(c.w, c.s.dept) ?? String(c.s.dept)).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const ta = org === "GCC" ? "பெருநகர சென்னை மாநகராட்சி" : org === "PWD" ? "பொதுப்பணித்துறை" : DEPT_TA[String(c.s.dept)] ?? null;
  const scope = scopeArg({ ...c.s, dept: org ? null : c.s.dept });
  const [fu, br] = await Promise.all([call(c, "dept_followups", { scope }), org ? Promise.resolve(null) : call(c, "briefing", { scope }).catch(() => null)]);
  const rows = ((fu.data as { rows?: Row[] })?.rows ?? []).filter((r) => codes.includes(String(r.code)));
  const sum = (k: string) => rows.reduce((a, r) => a + (num(r[k]) ?? 0), 0);
  const open = sum("open"), overdue = sum("overdue"), serious = sum("serious");
  const st = ((br?.data as { stats?: Record<string, number> })?.stats ?? {}) as Record<string, number>;
  const reported = org ? null : num(st.reported);
  const att = ((br?.data as { attention?: Row[] })?.attention ?? []).filter((a) => !a.dept || codes.includes(String(a.dept)));
  const worst = [...rows].sort((a, b) => (num(b.open) ?? 0) - (num(a.open) ?? 0))[0];
  const pre = assumed(c.heard, name, ta);
  // one zone asked: the brief says so in its title and its lines (RC-09, PB-096); the figures above are already filtered to it
  const zAsked = c.s.zone ? zoneName(c.w, c.s.zone) : null;
  const inZone = zAsked ? ` in ${zAsked} zone` : "", inZoneTa = zAsked ? ` ${zoneTa(c.w, c.s.zone) ?? zAsked} பகுதியில்` : "";
  const when = PERIOD_EN[c.s.period], whenTa = PERIOD_TA[c.s.period];
  const src = recordsOf(org ? `${org}-` : codes[0]);
  const age = freshness(c.asOf);
  if (!rows.length && reported == null) {
    return { title: bi(`${name} · brief`, `${ta ?? name} · சுருக்கம்`), takeaway: null,
      say: bi(`${pre.en}I have no records for ${name} ${inPeriod(c.s.period)}. ${src.en} ${age.en}`, `${pre.ta}${ta ?? name}: ${whenTa} பதிவுகள் இல்லை. ${src.ta} ${age.ta}`),
      blocks: [{ kind: "Note", id: "empty", text: L(c, `No records for ${name} in this period. ${src.en}`, `${ta ?? name}: இந்தக் காலத்தில் பதிவுகள் இல்லை. ${src.ta}`) }] };
  }
  // the one thing to say first: what needs attention, as a judgement made from the figures
  const pressing = overdue > 0 && open > 0 && overdue / open >= 0.15;
  const head = reported != null ? `${plural(reported, "new incident", "new incidents")} came in ${when}${inZone}` : `${plural(open, "case is", "cases are")} open across its departments${inZone}`;
  const headTa = reported != null ? `${whenTa}${inZoneTa} ${spoken(reported)} புதிய சம்பவங்கள் வந்தன` : `அதன் துறைகளில்${inZoneTa} ${spoken(open)} வழக்குகள் நிலுவையில் உள்ளன`;
  // no follow-up row for the body says nothing about its open cases: say nothing, rather than "nothing is open"
  const stand = !rows.length ? "" : open || overdue
    ? `${reported != null ? `${plural(open, "case is", "cases are")} still open, and ` : ""}${overdue ? `${plural(overdue, "is", "are")} past the deadline` : "none is past the deadline"}`
    : "nothing is open";
  const standTa = !rows.length ? "" : open || overdue ? `${reported != null ? `${spoken(open)} இன்னும் நிலுவையில்; ` : ""}${overdue ? `${nTa(overdue, "கெடு தாண்டியது", "கெடு தாண்டியவை")}` : "கெடு தாண்டியது எதுவும் இல்லை"}` : "நிலுவையில் எதுவும் இல்லை";
  const zEn = att[0]?.zone ? clip(att[0].zone, 40) : null;
  const zTa = zEn ? c.w.zones.find((z) => z.name.toLowerCase() === zEn.toLowerCase())?.ta ?? zEn : null;
  const where = zEn ? ` The one to look at first is in ${zEn}.` : worst && org ? ` Most of it sits with ${clip(worst.name, 60)}.` : "";
  const whereTa = zTa ? ` முதலில் பார்க்க வேண்டியது ${zTa} பகுதியில்.` : worst && org ? ` பெரும்பகுதி ${DEPT_TA[String(worst.code)] ?? clip(worst.name, 60)} துறையிடம்.` : "";
  const advice = pressing ? " That backlog is the thing to chase today." : "";
  // a place the data cannot narrow to: said, so the Collector knows the figures are the district's
  // the place as asked, said without a figure of its own (Finding 51: a model's name slot was said as it came)
  const placeAsked = words(c, c.slots.name, 40);
  const wide = placeAsked && !c.s.zone ? ` I can't narrow these records to ${placeAsked}, so this is the whole district.` : "";
  const wideTa = placeAsked && !c.s.zone ? ` இவற்றை ${placeAsked} பகுதிக்கு மட்டும் பிரிக்க முடியவில்லை; இது மாவட்டம் முழுவதற்குமானது.` : "";
  const adviceTa = pressing ? " இந்த நிலுவையைத்தான் இன்று கேட்க வேண்டும்." : "";
  // every point carries its Tamil line (the sentences code builds); a record's own title stays as the record has it: no English sentence in a Tamil brief (RC-15, PB-207)
  const points = [
    { text: clip(`${head}${stand ? `; ${stand}` : ""}.`, 400), ta: clip(`${headTa}${standTa ? `; ${standTa}` : ""}.`, 400), incidentId: null },
    ...(serious ? [{ text: `${plural(serious, "is", "are")} serious (severe or high).`, ta: `${spoken(serious)} தீவிரமானவை (கடுமையானவை அல்லது அதிகம்).`, incidentId: null }] : []),
    ...att.slice(0, 3).map((a) => { const t = safeText(`${a.why?.summary && String(a.why.summary).length <= 110 ? a.why.summary : a.title}${a.zone ? `, ${a.zone}` : ""}`, 400); return { text: t, ta: t, incidentId: String(a.id) }; }),
    ...(org ? rows.slice(0, 4).map((r) => ({ text: `${clip(r.name, 60)}: ${spoken(num(r.open) ?? 0)} open, ${spoken(num(r.overdue) ?? 0)} past the deadline.`,
      ta: `${DEPT_TA[String(r.code)] ?? clip(r.name, 60)}: ${spoken(num(r.open) ?? 0)} நிலுவை, ${nTa(num(r.overdue) ?? 0, "கெடு தாண்டியது", "கெடு தாண்டியவை")}.`, incidentId: null })) : []),
    { text: `${src.en} ${age.en}`, ta: `${src.ta} ${age.ta}`, incidentId: null }
  ].slice(0, 10);
  return {
    title: bi(`${name}${zAsked ? ` · ${zAsked}` : ""} · brief, ${PERIOD_EN[c.s.period]}`, `${ta ?? name}${zAsked ? ` · ${zoneTa(c.w, c.s.zone) ?? zAsked}` : ""} · சுருக்கம், ${PERIOD_TA[c.s.period]}`),
    takeaway: bi(`${head}${stand ? `; ${stand}` : ""}.`, `${headTa}${standTa ? `; ${standTa}` : ""}.`),
    // the name once: after "Taking that as X." it is not said again
    say: bi(`${pre.en || `${name}: `}${cap1(head)}${stand ? `; ${stand}` : ""}.${where}${advice}${wide} ${src.en} ${age.en}`.replace(/\s+/g, " ").trim(),
      `${pre.ta || `${ta ?? name}: `}${headTa}${standTa ? `; ${standTa}` : ""}.${whereTa}${adviceTa}${wideTa} ${src.ta} ${age.ta}`.replace(/\s+/g, " ").trim()),
    blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
        ...(reported != null ? [{ key: "reported", label: L(c, "Reported", "பதிவானவை"), value: reported, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : []),
        { key: "open", label: L(c, "Open", "திறந்தவை"), value: open, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] },
        { key: "overdue", label: L(c, "Past deadline", "காலக்கெடு தாண்டியவை"), value: overdue, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] },
        { key: "serious", label: L(c, "Serious", "தீவிரமானவை"), value: serious, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: L(c, "The brief", "சுருக்கம்"), points }
    ]
  };
}

async function brief(c: Ctx): Promise<Part> {
  const sp = spanned(c.slots);
  if (sp) return spanBrief(c, sp);
  if (c.slots.org || c.s.dept) return bodyBrief(c);
  const r = await call(c, "briefing", { scope: scopeArg(c.s) });
  const d = r.data as { headline: string[]; stats: Record<string, number>; attention: Row[]; emerging: Row[]; conditions: string | null };
  const points = [
    ...(d.headline ?? []).map((t) => ({ text: safeText(t, 400), incidentId: null })),
    ...(d.attention ?? []).slice(0, 4).map((a) => ({ text: safeText(`${a.why?.summary && String(a.why.summary).length <= 110 ? a.why.summary : a.title}${a.zone ? `, ${a.zone}` : ""}${a.why?.attention?.[0] ? `: ${a.why.attention[0]}` : ""}`, 400), incidentId: String(a.id) })),
    ...(d.emerging ?? []).slice(0, 2).map((e) => ({ text: clip(e.text, 400), incidentId: null })),
    // the conditions (rain, air, reservoirs) are the district's, one set of stations: a brief on a zone, a body, a kind or a taluk does not carry them as if they were its own (RC-15, the grader's figure check)
    ...(d.conditions && !(c.s.zone || c.s.taluk || c.s.dept || c.s.cat) ? [{ text: clip(`Conditions: ${d.conditions}`, 400), incidentId: null }] : [])
  ].slice(0, 10);
  const st = d.stats ?? {};
  // the first point is the briefing tool's English sentence; the Tamil line is built from the same figures, so a Tamil answer holds no English sentence (QA4 G1, audit-understanding-17, AUD-NF-17)
  const chg = num(st.change);
  const nRep = Number(st.reported ?? 0);
  const scopeTa = [zoneTa(c.w, c.s.zone), c.s.taluk ? c.w.taluks.find((t) => t.code === c.s.taluk)?.ta ?? c.s.taluk : null, deptTa(c.w, c.s.dept), catTa(c.w, c.s.cat)].filter(Boolean).join(", ");
  const leadHeadTa = `${PERIOD_TA[c.s.period]} ${scopeTa ? `${scopeTa} பகுதியில்` : "சென்னை மாவட்டத்தில்"} ${spoken(nRep)} ${nRep === 1 ? "சம்பவம் பதிவானது" : "சம்பவங்கள் பதிவாகின"}${chg == null ? "" : chg === 0 ? "; முந்தைய காலத்தின் அதே அளவு" : `; முந்தைய காலத்தை விட ${spoken(Math.abs(chg))}% ${chg > 0 ? "அதிகம்" : "குறைவு"}`}.`;
  const leadTa = `${leadHeadTa} ${spoken(Number(st.open ?? 0))} இன்னும் நிலுவையில்${Number(st.overdue) ? `, ${nTa(Number(st.overdue), "கெடு தாண்டியது", "கெடு தாண்டியவை")}` : ""}; ${nTa(Number(st.severe ?? 0), "கடுமையானது", "கடுமையானவை")}.`;
  // the Tamil of each point the code builds (the lead, the open and overdue line, a record's own title); a sentence the briefing tool wrote only in English has no Tamil line and is shown as it is (RC-15, PB-207)
  const nHead = (d.headline ?? []).length, att = (d.attention ?? []).slice(0, 4), nAtt = att.length;
  const standLineTa = `${spoken(Number(st.open ?? 0))} இன்னும் நிலுவையில், ${nTa(Number(st.overdue ?? 0), "கெடு தாண்டியது", "கெடு தாண்டியவை")}; ${nTa(Number(st.severe ?? 0), "கடுமையானது", "கடுமையானவை")}.`;
  const sourcesTa = `${spoken(Number(st.multi ?? 0))} சம்பவங்கள் ஒன்றுக்கு மேற்பட்ட மூலங்களிலிருந்து வந்தன; ${spoken(Number(st.newsOnly ?? 0))} செய்தியில் மட்டும் உள்ளன.`;
  // the reasons the briefing tool writes are fixed English templates (reasons.ts holds the Tamil of each); a story or a reason the pipeline AI wrote has no Tamil line ("" here): shown as it is, left out of a Tamil reading
  const attTa = att.map((a) => {
    // up to two of the record's reasons: two cases of one body in one zone with the same first reason are told apart by the second (g-review: smaller point, RC-15)
    const r = (a.why?.attention ?? []).slice(0, 2).map((x: unknown) => reasonTa(String(x))).filter(Boolean).join("; ") || null;
    const zt = a.zone ? c.w.zones.find((x) => x.name === a.zone)?.ta ?? a.zone : null;
    // a record's own title is a headline in the data's language (English), with no Tamil of it: the Tamil line names the body and the place in Tamil and gives the reason, and the point still opens the record (RC-15, tanglish-brief-04, -07, -10, ta-followup-01)
    return safeText(`${deptTaNamed(c.w, a.dept ?? null) ?? "சம்பவம்"}${zt ? `, ${zt}` : ""}${r ? `: ${r}` : ""}`, 400);
  }).map((line, i, all) => { const before = all.slice(0, i).filter((x) => x === line).length; return before ? `${line} (${before + 1}-வது)` : line; }); // a line still the same as an earlier one is numbered: no two points say the same thing
  const condTa = d.conditions && !(c.s.zone || c.s.taluk || c.s.dept || c.s.cat) ? conditionsTa(String(d.conditions)) : null;
  const pointsTa = points.map((p, i): { text: string; ta?: string; incidentId: string | null } => {
    if (i < nHead) return i === 0 ? { ...p, ta: leadHeadTa } : i === 1 && st.open != null ? { ...p, ta: standLineTa } : i === 2 && Number(st.multi) ? { ...p, ta: sourcesTa } : { ...p, ta: "" };
    if (i < nHead + nAtt) return { ...p, ta: attTa[i - nHead] };
    return condTa && p.text.startsWith("Conditions: ") ? { ...p, ta: condTa } : { ...p, ta: "" };
  });
  return {
    title: bi(`Briefing · ${PERIOD_EN[c.s.period]}`, `சுருக்கம் · ${PERIOD_TA[c.s.period]}`),
    takeaway: points[0] ? bi(points[0].text, leadTa) : null,
    say: bi(`${points.length} points in the brief for ${PERIOD_EN[c.s.period]}. ${points[0]?.text ?? ""}`, `${PERIOD_TA[c.s.period]} சுருக்கத்தில் ${points.length} குறிப்புகள். ${points[0] ? leadTa : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: KEY_NUMBERS(c), items: [
        { key: "reported", label: L(c, "Reported", "பதிவானவை"), value: Number(st.reported ?? 0), unit: null, prev: null, delta: null, pct: num(st.change), tone: "neutral", spark: [] },
        { key: "severe", label: L(c, "Severe", "கடுமையானவை"), value: Number(st.severe ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "overdue", label: L(c, "Past deadline", "காலக்கெடு தாண்டியவை"), value: Number(st.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "newsOnly", label: L(c, "In the news only", "செய்தியில் மட்டும்"), value: Number(st.newsOnly ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: L(c, "The brief", "சுருக்கம்"), points: pointsTa }
    ]
  };
}

async function drafts(c: Ctx): Promise<Part> {
  return { title: bi("Waiting for your approval", "உங்கள் ஒப்புதலுக்குக் காத்திருப்பவை"), takeaway: null, say: bi("Here are the drafts waiting for your approval.", "உங்கள் ஒப்புதலுக்காகக் காத்திருக்கும் வரைவுகள் இவை."),
    blocks: [{ kind: "Drafts", id: "drafts", title: L(c, "Approval tray", "ஒப்புதல் தட்டு") }] };
}
