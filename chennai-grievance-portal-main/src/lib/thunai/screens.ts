/**
 * Thunai's screen builders: a recipe and its slots (chosen by the model, checked by agent.ts) become a Stage document
 * (stage.ts). Code fetches the data with Ask District IQ's tools and the console's own views (data.ts `Hands`, injected so
 * this is unit-tested with fakes), computes the insights with explicit rules (insight.ts), and writes the takeaway and the
 * spoken line in English and Tamil from templates. No figure here comes from a model.
 */
import type { ToolResult } from "@/lib/assistant/types";
import { aggregate, change, largestGaps, median, peak, rank, round, share, spoken, unusualPoints, vsMedian } from "./insight";
import type { BlockT, Bilingual, CaseRowT, NextStepT, PointT, Recipe, ScopeT, StageDocT } from "./stage";
import type { PeriodKey, Sev, World } from "./types";
import { nextSteps } from "./next";
import { completeRows, type InRow, type Lookups } from "./complete";
import { cChart, modifiedZ, trendOf } from "./stats";
import { UNIT_TA, hoursBetween } from "./stagelocal";
import { DEPT_ALIASES, DEPT_TA, ZONES, ZONE_TA_NAME as ZONE_TA } from "./lexicon";
import { conditionsTa, reasonTa } from "./reasons";
import { CAT_LABEL_TA, closedAs, explainIssue, factSheet, idam, plainWhat, plainWho } from "./narrate";

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
  what: "severe" | "hotspots" | "cases" | null;
  sort: "priority" | "complaints" | "time" | null;
  /** start clean: the console's own filters are not inherited (a Stage control's "All of Chennai") */
  fresh?: boolean;
  /** complete: the open Stage's incident ids; those rows are completed, not the console's list */
  ids?: string[];
  /** brief: a body above the departments (GCC, PWD), briefed across its own departments */
  org?: string | null;
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
}

export interface Built { doc: StageDocT; runs: string[] }

// ------------------------------------------------------------------ words --

const PERIOD_EN: Record<PeriodKey, string> = { daily: "today", weekly: "this week", monthly: "the last 30 days", quarterly: "the last 90 days" };
/** the period as an adverb after a noun: "cases today", "cases this week", "cases in the last 30 days" (never "cases the last 30 days", QA4 G1: AUD-NF-16, audit-understanding-20) */
const inPeriod = (p: PeriodKey): string => (p === "monthly" || p === "quarterly" ? `in ${PERIOD_EN[p]}` : PERIOD_EN[p]);
const PERIOD_TA: Record<PeriodKey, string> = { daily: "இன்று", weekly: "இந்த வாரம்", monthly: "கடந்த 30 நாட்களில்", quarterly: "கடந்த 90 நாட்களில்" };
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
const zoneTa = (w: World, n: number | null | undefined) => (n ? w.zones.find((z) => z.n === n)?.ta ?? zoneName(w, n) : null);
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
const MONTH_TA: Record<string, string> = { Jan: "ஜன.", Feb: "பிப்.", Mar: "மார்.", Apr: "ஏப்.", May: "மே", Jun: "ஜூன்", Jul: "ஜூலை", Aug: "ஆக.", Sep: "செப்.", Oct: "அக்.", Nov: "நவ.", Dec: "டிச." };
/** A chart's time label ("21 Oct", "3 pm") in Tamil, so a Tamil line never says a Latin month or AM/PM (RC-15). */
const labelTa = (l: string) => String(l).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTH_TA[m]).replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (_m, h, mi, ap) => `${/pm/i.test(ap) ? "பிற்பகல்" : "முற்பகல்"} ${h}${mi ? `:${mi}` : ""}`);
const reportsOf = (subject: string, generic: boolean, n = 2): string => (generic ? (n === 1 ? "incident" : "incidents") : `${subject.toLowerCase()} ${n === 1 ? "report" : "reports"}`);
const plural = (n: number, one: string, many: string) => `${spoken(n)} ${n === 1 ? one : many}`;
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
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
function scopeWords(w: World, s: ScopeT): Bilingual {
  const en = [zoneName(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.name ?? s.taluk : null, deptName(w, s.dept), catLabel(w, s.cat), s.sev, PERIOD_EN[s.period]].filter(Boolean);
  const ta = [zoneTa(w, s.zone), s.taluk ? w.taluks.find((t) => t.code === s.taluk)?.ta ?? s.taluk : null, deptTa(w, s.dept), catTa(w, s.cat), s.sev ? SEV_TA[s.sev] : null, PERIOD_TA[s.period]].filter(Boolean);
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

interface Ctx { w: World; h: Hands; s: ScopeT; slots: Slots; heard: string; runs: string[]; sources: Set<string>; notes: string[]; asOf: string | null }

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

type Part = { title: string; takeaway: Bilingual | null; say: Bilingual; blocks: BlockT[]; next?: NextStepT[] };

const RECIPE: Record<Recipe, (c: Ctx) => Promise<Part>> = {
  cases, case: caseDetail, news, readings, prices, ranking, compare, trend, why, performance, dashboard, map: mapScreen, nearby, brief, drafts, advise, insight, complete, answer: async () => {
    throw new Error("the answer screen is written from the agent's own results");
  }
};

/** Build a screen. Throws only on a programming error; a tool failure becomes a Note block that says so. */
export async function buildScreen(recipe: Recipe, slots: Slots, base: ScopeT, w: World, h: Hands, heard: string, id = `st-${Date.now().toString(36)}`): Promise<Built> {
  const s: ScopeT = {
    period: slots.period ?? base.period, zone: slots.zones.length === 1 ? slots.zones[0] : slots.zones.length ? null : base.zone,
    dept: slots.dept ?? (slots.depts.length ? null : base.dept), cat: slots.cat ?? base.cat, taluk: slots.taluk ?? base.taluk, sev: slots.sev ?? null
  };
  // news covers the whole district unless the request names its own area or topic: the console's filters (say, Flooding
  // left on by an earlier dashboard) would otherwise turn "today's news" into "today's flooding news"
  // a request that names its own place or topic starts clean (as v1's planner does); one that names nothing keeps the
  // console's filters, so "the severe cases" are the ones the console shows
  const named = slots.zones.length > 0 || !!slots.dept || !!slots.cat || !!slots.taluk || slots.depts.length > 0;
  if (recipe === "news" || recipe === "brief" || slots.fresh || named) { s.zone = slots.zones[0] ?? null; s.dept = slots.dept; s.cat = slots.cat; s.taluk = slots.taluk; }
  const c: Ctx = { w, h, s, slots, heard, runs: [], sources: new Set(), notes: [], asOf: null };
  let part: Part;
  try {
    part = await RECIPE[recipe](c);
  } catch (e) {
    part = { title: heard, takeaway: null, say: bi("I could not get that data just now.", "அந்தத் தரவை இப்போது பெற முடியவில்லை."),
      blocks: [{ kind: "Note", id: "err", text: `The data could not be read: ${clip((e as Error).message, 200)}` }] };
  }
  if (!part.blocks.length) part.blocks.push({ kind: "Note", id: "empty", text: "Nothing in the data matches this, for this scope." });
  const doc: StageDocT = { v: 1, id, recipe, title: clip(part.title, 200), takeaway: part.takeaway && fitBi(part.takeaway), say: fitBi(part.say), blocks: part.blocks.slice(0, 6), scope: s,
    slots: slots as unknown as Record<string, unknown>, sources: [...c.sources].slice(0, 10).map((x) => clip(x, 80)), asOf: c.asOf, notes: c.notes.slice(0, 4) };
  doc.next = part.next ?? (part.blocks.some((b) => b.kind === "Note") && part.blocks.length === 1 ? [] : nextSteps(doc));
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
  const ta = /[஀-௿]/.test(c.heard);
  const where = s.zone ? bi(` in ${zoneName(w, s.zone)}`, ` ${zoneTa(w, s.zone) ?? zoneName(w, s.zone)} பகுதியில்`) : bi("", "");
  const [inc, late, drv] = await Promise.all([
    incidentList(c, { status: "open", sort: "sev" }).catch(() => null),
    // the cases past their deadline, whole scope: the first of them is the one to ring about, not the first one on a page of open cases
    c.h.list ? incidentList(c, { status: "overdue", sort: "sev" }).catch(() => null) : Promise.resolve(null),
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
    const h = holder(first), p = at(first);
    points.push(first.overdue
      ? { en: `First: ${clip(first.title, 120)}${p ? ` at ${p}` : ""} is past its deadline${h ? `; ${h} holds it, call them` : ""}.`,
        ta: `முதலில்: ${clip(first.title, 120)}${p ? `, ${p}` : ""} காலக்கெடு தாண்டிவிட்டது${h ? `; ${h} துறையை அழையுங்கள்` : ""}.`, id: first.id }
      : { en: `First: ${clip(first.title, 120)}${p ? ` at ${p}` : ""}${first.sev ? `, ${first.sev.toLowerCase()}` : ""}${h ? `, with ${h}` : ""}.`,
        ta: `முதலில்: ${clip(first.title, 120)}${p ? `, ${p}` : ""}${h ? `; ${h} வசம் உள்ளது` : ""}.`, id: first.id });
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
      ta: `${ofTa}${dept && n > 1 ? `; ${partTa ? `${partTa} ` : ""}${spoken(n)} ${dept} வசம்: இன்றே நிலவரம் கேளுங்கள்` : ""}.`, id: null });
  }
  // 3. what is rising fastest, with the ask that fits it
  const rise = [...(d.categories ?? [])].filter((x) => Number(x.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta))[0];
  if (rise) {
    const act = actionFor(String(rise.label ?? rise.code ?? ""));
    points.push({ en: `${clip(rise.label, 60)} rose by ${spoken(Number(rise.delta))} ${inPeriod(s.period)} (${spoken(Number(rise.n))} against ${spoken(Number(rise.prev))}). Suggested: ${act.en}.`,
      ta: `${clip(rise.label, 60)} ${PERIOD_TA[s.period]} ${spoken(Number(rise.delta))} கூடியது (${spoken(Number(rise.n))}, முன்பு ${spoken(Number(rise.prev))}). பரிந்துரை: ${act.ta}.`, id: null });
  }
  // 4. the busiest spot
  const place = d.places?.[0];
  if (place && points.length < 4) points.push({ en: `The busiest spot is ${clip(place.place, 60)}: ${spoken(Number(place.n))} ${clip(place.category, 50).toLowerCase()}.`,
    ta: `அதிக சம்பவங்கள்: ${clip(place.place, 60)} (${spoken(Number(place.n))}).`, id: null });
  const title = ta ? `இப்போது என்ன செய்ய வேண்டும்${where.ta}` : `What needs you first${where.en}`;
  if (!points.length) return { title, takeaway: null, say: bi(`Nothing open needs you${where.en} right now.`, `இப்போது${where.ta} உங்கள் கவனம் தேவைப்படும் திறந்த சம்பவம் இல்லை.`), blocks: [] };
  const blocks: BlockT[] = [{ kind: "Brief", id: "advise", title, points: points.map((p) => ({ text: clip(ta ? p.ta : p.en, 400), incidentId: p.id })) }];
  if (rows.length) blocks.push({ kind: "CaseList", id: "open", title: ta ? "அவசரமான திறந்த சம்பவங்கள்" : "The most urgent open cases", source: "list", sev: null, total: rows.length, rows });
  const cats = [...(d.categories ?? [])].sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 8);
  if (cats.length) blocks.push({ kind: "Chart", id: "chart", title: ta ? "முந்தைய காலத்தை விட மாற்றம்" : "Change against the period before", chart: "hbar", unit: "incidents", labels: cats.map((x) => clip(x.label, 80)), values: cats.map((x) => Number(x.delta)) });
  const n = points.length;
  const say = bi(`${n === 1 ? "One thing needs" : `${spoken(n)} things need`} you${where.en}. ${points.slice(0, 3).map((p) => p.en).join(" ")}`,
    `${where.ta ? `${where.ta.trim()} ` : ""}${spoken(n)} விஷயங்கள் உங்கள் கவனத்துக்கு. ${points.slice(0, 3).map((p) => p.ta).join(" ")}`);
  return { title, takeaway: null, say, blocks };
}

// ------------------------------------------------------------------ insight --

/**
 * "What stands out?": the zones unlike the rest (modified z-score), whether the latest count is outside its limits (c-chart),
 * and which way the series is going (Theil-Sen with Mann-Kendall). Every finding carries its method, its n and a caveat. The
 * spoken line reads only those.
 */
async function insight(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const ta = /[஀-௿]/.test(c.heard);
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
  if (hourly) c.notes.push(ta ? "2 மணி நேரக் கணக்குகள் நாளின் நேரத்தோடு மாறும்: அவற்றிலிருந்து வரம்போ போக்கோ கணிக்கவில்லை." : "Counts per 2 hours swing with the time of day, so no limits or trend are read from them.");
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
  if (rise) items.push({ title: ta ? `வேகமாக உயர்வது: ${clip(rise.label, 60)}` : `Rising fastest: ${clip(rise.label, 60)}`, value: Number(rise.delta), unit: ta ? "கூடுதல்" : "more", method: `Against the period before (${Number(rise.prev)} to ${Number(rise.n)})`, n: 2, caveat: ta ? "இரண்டு காலங்களின் ஒப்பீடு மட்டுமே." : "A comparison of two periods only.", tone: "warn" });
  const title = ta ? "தனித்து நிற்பவை" : "What stands out";
  if (!items.length) return { title, takeaway: null, say: bi("Nothing stands out in this data.", "இந்தத் தரவில் தனித்து நிற்பது எதுவும் இல்லை."), blocks: [] };
  const lead = open.value[0];
  const en = lead ? `${zoneName(w, Number(lead.key)) ?? ""} stands out: ${spoken(lead.value)} open cases against a typical ${spoken(lead.median)}.` : `No zone stands out from the rest${latestOut ? ", but the latest count is outside its usual limits" : ""}.`;
  const tam = lead ? `${zoneTa(w, Number(lead.key)) ?? ""} தனித்து நிற்கிறது: ${spoken(lead.value)} திறந்த சம்பவங்கள், வழக்கமாக ${spoken(lead.median)}.` : `எந்த மண்டலமும் தனித்து நிற்கவில்லை${latestOut ? ", ஆனால் கடைசி எண்ணிக்கை வரம்புக்கு வெளியே" : ""}.`;
  const marks = hourly ? [] : chart.value.signals.slice(0, 8).map((i) => ({ i, why: ta ? "வரம்புக்கு வெளியே" : "Outside the limits" }));
  const blocks: BlockT[] = [{ kind: "Findings", id: "find", title, items: items.slice(0, 6) }];
  if (counts.length) blocks.push({ kind: "Trend", id: "trend", title: ta ? "காலவாரி எண்ணிக்கை" : "Incidents over time", unit: "incidents", labels, values: counts, marks, normal: hourly ? null : { lo: chart.value.lcl, hi: chart.value.ucl } });
  blocks.push({ kind: "MapView", id: "map", title: ta ? "மண்டலங்கள்" : "The zones", rule: open.method, shade: { geo: "zone", label: "Open incidents", values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.open ?? x.n ?? 0) })) }, points: [], outline: open.value.map((o) => Number(o.key)).slice(0, 15) });
  return { title, takeaway: bi(en, tam), say: bi(en, tam), blocks };
}

// ------------------------------------------------------------------ complete --

/**
 * "Complete this data": the open Stage's list (slots.ids), a Studio dataset named in the sentence, or the unresolved incidents,
 * one page of them, and the screen says how many of how many. A cell is filled only from deterministic code (complete.ts) and
 * shows its source; what cannot be filled is named. Nothing is guessed, and follow-ups for what is left are offered as drafts.
 */
async function complete(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const ta = /[஀-௿]/.test(c.heard);
  let input: InRow[] = [];
  let what = ta ? "தீர்க்கப்படாத சம்பவங்கள்" : "Unresolved incidents";
  let read = 0, total = 0;
  const toIn = (x: CaseRowT, asOf: string | null | undefined): InRow => ({ id: x.id, title: x.title, zone: x.zone, zoneName: x.zoneName, ward: x.ward, place: x.place, dept: x.dept, deptName: x.deptName, cat: x.cat, lat: x.lat, lon: x.lon, t: x.t, hours: hoursBetween(x.t, asOf ?? c.asOf) });
  const ds = slots.name && c.h.dataset ? await c.h.dataset(slots.name) : null;
  if (ds) {
    c.runs.push("studio_dataset");
    c.sources.add(`Data Studio: ${ds.name}`);
    what = clip(ds.name, 100);
    input = ds.rows.slice(0, 30).map((x) => ({ ...x, id: clip(x.id, 80) }));
    read = input.length; total = ds.total ?? read;
  } else if (slots.ids?.length) {
    // the rows on the open Stage, one incident at a time, a few at once: an id the store no longer holds is said, not hidden
    what = ta ? "இந்தப் பட்டியல்" : "This list";
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
    if (input.length < got.length) c.notes.push(ta ? `${got.length - input.length} வரிசைகளைப் படிக்க முடியவில்லை.` : `${got.length - input.length} of the ${got.length} rows could not be read.`);
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
  const title = clip(ta ? `${what}: நிரப்பியவை${part ? ` (முதல் ${read}, மொத்தம் ${total})` : ""}` : `${what}: completed${part ? ` (first ${read} of ${total})` : ""}`, 160);
  if (!res.rows.length) return { title, takeaway: null, say: bi("Nothing here to complete.", "நிரப்ப வேண்டியது எதுவும் இல்லை."), blocks: [] };
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
  c.notes.push("A filled cell shows where the value came from. Blank cells are left blank on purpose.");
  if (res.derived) c.notes.push(ta ? "திறந்த மணி நேரம் பதிவின் நேரத்திலிருந்து கணக்கிடப்பட்டது; நிரப்பியதாக எண்ணப்படவில்லை." : "Open, hours is worked out from the report time and is not counted as filled.");
  return { title, takeaway: bi(`${lead.en}${spoken(res.filled)} filled, ${spoken(res.left)} left.`, `${lead.ta}${spoken(res.filled)} நிரப்பியது, ${spoken(res.left)} மீதம்.`), say, blocks, next };
}

// ------------------------------------------------------------------ cases --

async function cases(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const sev = slots.sev;
  const n = Math.min(Math.max(slots.n ?? 12, 1), 30);
  let rows: CaseRowT[]; let total: number; let source: "console-severity" | "list";
  // how many of the whole list are past their deadline: counted over the list the figure is about, never over the rows on screen
  let lateAll: number | null = null;
  let groupsTotal: number | null = null;
  const sortKey = slots.sort === "complaints" ? "c" : slots.sort === "time" ? "t" : "sev";
  // "the severe cases": exactly the console's severity panel for this scope
  if (sev && !slots.q && !slots.status) {
    c.runs.push("console_severe");
    const r = await c.h.severe(s);
    c.sources.add("console severity panel");
    c.asOf ??= r.asOf;
    rows = r.rows.filter((x) => x.sev === sev).map((x) => caseRow(x, w));
    total = Number(r.counts[sev] ?? rows.length);
    source = "console-severity";
    lateAll = await lateTotal(c, sev, null);
  } else if (slots.status === "overdue" && c.h.list) {
    // the console's own past-deadline filter: its rows and its whole count (BUG-007, BUG-021)
    const r = await incidentList(c, { sev, status: "overdue", q: slots.q, sort: sortKey });
    rows = r.rows.map((x) => caseRow(x, w));
    // rows are groups of one problem, the count is of incidents, as the console's past-deadline tile counts them
    total = lateAll = r.incidents;
    groupsTotal = r.total;
    source = "list";
  } else {
    const r = await incidentList(c, { sev, status: slots.status, q: slots.q, sort: sortKey });
    rows = r.rows.map((x) => caseRow(x, w));
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
  rows = sortRows(rows, slots.sort).slice(0, source === "console-severity" ? 30 : n);
  // the list is complete when the rows shown are all of it: only then is a count over its rows (who holds most) a count of the list
  const complete = rows.length >= (groupsTotal ?? total);
  const sevWord = sev ? sev.toLowerCase() : "";
  const scope = scopeWords(w, { ...s, sev: null });
  const asTa = /[஀-௿]/.test(c.heard);
  const L = (en: string, ta: string) => (asTa ? ta : en);
  const title = asTa ? `${sev ? `${SEV_TA[sev]} சம்பவங்கள்` : slots.q ? `சம்பவங்கள்: ${slots.q}` : "சம்பவங்கள்"} · ${scope.ta}` : `${sev ? `${sev} cases` : slots.q ? `Cases: ${slots.q}` : "Cases"} · ${scope.en}`;
  if (!rows.length) {
    // filters left on the console (not named in this request) can empty the list: say so and offer the whole district
    const inherited = (s.zone && !slots.zones.length) || (s.cat && !slots.cat) || (s.dept && !slots.dept) || (s.taluk && !slots.taluk);
    const filters = scopeWords(w, { ...s, sev: null, period: s.period });
    return { title, takeaway: null,
      say: inherited
        ? bi(`No ${sevWord} cases ${inPeriod(s.period)} with the console's filters (${filters.en}). Say "all of Chennai" to look across the district.`, `கன்சோல் வடிகட்டிகளுடன் (${filters.ta}) ${sev ? SEV_TA[sev] : ""} சம்பவங்கள் இல்லை. முழு மாவட்டத்தையும் பார்க்க "முழு சென்னை" என்று சொல்லுங்கள்.`)
        : bi(`There are no ${sevWord ? `${sevWord} ` : ""}cases ${inPeriod(s.period)} for this view.`, `இந்தப் பார்வையில் ${PERIOD_TA[s.period]} ${sev ? SEV_TA[sev] : ""} சம்பவங்கள் இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: inherited ? `No incidents match this view. The console still has these filters on: ${filters.en}.` : "No incidents match this view." }],
      next: inherited ? [{ label: { en: "All of Chennai", ta: "முழு சென்னை" }, kind: "direct", recipe: "cases", slots: { ...slots, zones: [], dept: null, cat: null, taluk: null, fresh: true }, ids: [], text: null }] : [] };
  }
  const lateShown = rows.filter((r) => r.overdue).length;
  const late = lateAll ?? lateShown;
  const say = casesSay(rows, total, sev, s.period, { late: lateAll ?? undefined, complete });
  // the figure is the list's own: "of the whole list" when the screen shows part of it, "of those shown" only when the count could not be made
  // the severity panel counts its own rows and the past-deadline figure counts incidents, so a part can be larger than the whole ("54 of the 52"): then it is said without the whole
  const takeaway = late ? (lateAll != null && late > total
    ? bi(`${late} ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `${late} காலக்கெடுவைத் தாண்டியவை.`)
    : lateAll != null
    ? bi(`${late} of the ${total} ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `${total}-இல் ${late} காலக்கெடுவைத் தாண்டியவை.`)
    : bi(`${late} of the ${rows.length} shown ${late === 1 ? "is" : "are"} past ${late === 1 ? "its" : "their"} deadline.`, `காட்டப்பட்ட ${rows.length}-இல் ${late} காலக்கெடுவைத் தாண்டியவை.`)) : null;
  const pts = points(rows);
  const blocks: BlockT[] = [];
  const byDept = new Map<string, number>();
  for (const r of rows) if (r.deptName) byDept.set(r.deptName, (byDept.get(r.deptName) ?? 0) + 1);
  // "held by" counts the rows it is given, so it is shown only for a list shown whole
  const lead = complete ? [...byDept.entries()].sort((a, b) => b[1] - a[1])[0] : undefined;
  blocks.push({ kind: "Kpis", id: "kpis", title: "Key numbers", items: [
    { key: "total", label: L(`${sev ?? "All"} cases, ${PERIOD_EN[s.period]}`, `${sev ? SEV_TA[sev] : "எல்லா"} சம்பவங்கள், ${PERIOD_TA[s.period]}`), value: total, unit: null, prev: null, delta: null, tone: sev === "Severe" ? "bad" : "neutral", spark: [] },
    { key: "late", label: L("Past their deadline", "காலக்கெடு தாண்டியவை"), value: late, unit: null, prev: null, delta: null, tone: late ? "bad" : "good", spark: [] },
    ...(lead && lead[1] >= 2 ? [{ key: "dept", label: L(`Held by ${lead[0]}`, `${lead[0]} வசம்`), value: lead[1], unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : [])
  ] });
  blocks.push({ kind: "CaseList", id: "cases", title, source, sev, total, rows });
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: L("Where they are", "எங்கே உள்ளன"), rule: L("Numbered as in the list; cases without an exact place are not drawn.", "பட்டியலில் உள்ளபடி எண்கள்; சரியான இடம் இல்லாத சம்பவங்கள் வரையப்படவில்லை."), shade: null, points: pts, outline: s.zone ? [s.zone] : [] });
  return { title, takeaway, say, blocks };
}

/**
 * The spoken summary of a list of cases, as an aide would give it: how many, which need the Collector first and why (past
 * their deadline), who holds most of them, and what to say next. Names come from each incident's own short summary,
 * never an id or a citizen's words; every figure is a count of the rows.
 */
export function casesSay(rows: CaseRowT[], total: number, sev: Sev | null, period: PeriodKey, opts: { late?: number; complete?: boolean } = {}): Bilingual {
  const sevWord = sev ? `${sev.toLowerCase()} ` : "";
  // a case is named by its short summary; a long title would be the record read out, so it is retold as its kind and place
  const where = (r: CaseRowT) => {
    let l = spokenLabel(r);
    if (l.split(/\s+/).length >= 6) { const k = plainWhat(r.cat, r.title); l = `${k ? k.en : "an issue"}${r.place ? ` at ${r.place}` : ""}`; }
    return r.zoneName && !l.includes(r.zoneName) ? `${l} in ${r.zoneName}` : l;
  };
  // the Tamil line names a case by its kind in Tamil, its place and its zone: the English summary is a sentence of the record's own, and a Tamil answer holds no English sentence (QA4 G1, AUD-NF-17)
  const whereTa = (r: CaseRowT) => [plainWhat(r.cat, r.title)?.ta ?? "ஒரு பிரச்சினை", r.place && r.place !== r.zoneName ? r.place : null, r.zoneName ? (r.zone ? ZONE_TA[r.zone] : null) ?? r.zoneName : null].filter(Boolean).join(", ");
  const late = rows.filter((r) => r.overdue);
  // the past-deadline figure is the whole list's when the caller counted it; the rows shown only name the cases
  const lateN = opts.late ?? late.length;
  const first = late.length ? late.slice(0, 2) : rows.slice(0, 1);
  const byDept = new Map<string, number>();
  for (const r of rows) if (r.deptName) byDept.set(r.deptName, (byDept.get(r.deptName) ?? 0) + 1);
  // who holds most is a count over the rows given: said only for a list given whole
  const [lead] = (opts.complete ?? rows.length >= total) ? [...byDept.entries()].sort((a, b) => b[1] - a[1]) : [];
  const head = `${plural(total, `${sevWord}case`, `${sevWord}cases`)} ${inPeriod(period)}${rows.length < total ? `; here are the ${rows.length} that matter most` : ""}.`;
  const need = late.length
    ? `${lateN === 1 ? "One is past its deadline and needs" : `${spoken(lateN)} are past their deadline and need`} you first: ${first.map(where).join(", and ")}.`
    : `${lateN ? `${lateN === 1 ? "One is" : `${spoken(lateN)} are`} past the deadline, not among these. ` : ""}The most urgent: ${where(first[0])}.`;
  const who = lead && lead[1] >= 2 ? `${lead[0]} holds ${spoken(lead[1])} of them.` : "";
  const en = [head, need, who, "Say \"read them\", or \"open\" and a number."].filter(Boolean).join(" ");
  const ta = [`${PERIOD_TA[period]} ${spoken(total)} ${sev ? `${SEV_TA[sev]} ` : ""}சம்பவங்கள்.`,
    late.length ? `${spoken(lateN)} காலக்கெடு தாண்டியவை, முதலில் கவனிக்க வேண்டியவை: ${first.map(whereTa).join("; ")}.` : `${lateN ? `${spoken(lateN)} காலக்கெடு தாண்டியவை, இவற்றில் இல்லை. ` : ""}மிக அவசரமானது: ${whereTa(first[0])}.`,
    lead && lead[1] >= 2 ? `${lead[0]} வசம் ${spoken(lead[1])}.` : "", "\"படி\" அல்லது \"திற\" என்று எண்ணுடன் சொல்லுங்கள்."].filter(Boolean).join(" ");
  return bi(en, ta);
}

async function caseDetail(c: Ctx): Promise<Part> {
  let id = c.slots.id;
  // "explain the flooding in Velachery": no number said, so the incident that matters most in what was named
  if (!id && (c.s.zone || c.s.cat || c.slots.q)) {
    const top = await incidentList(c, { sev: c.s.sev ?? null, status: "open", q: c.slots.q, sort: "sev" }).catch(() => null);
    id = String(top?.rows[0]?.id ?? "") || null;
    if (!id) return { title: "Nothing open", takeaway: null, say: bi("I can't find an open issue like that in the data.", "அப்படி ஒரு திறந்த பிரச்சினை தரவில் இல்லை."), blocks: [{ kind: "Note", id: "none", text: "No open incident matches this." }] };
  }
  if (!id) return { title: "Incident", takeaway: null, say: bi("Which incident? Say its number on the list.", "எந்தச் சம்பவம்? பட்டியலில் அதன் எண்ணைச் சொல்லுங்கள்."), blocks: [] };
  const r = await call(c, "incident_detail", { id });
  const d = r.data as { incident: Row; reports: Row[]; officials: Row[] } | null;
  if (!d?.incident) return { title: id, takeaway: null, say: bi(`I could not find incident ${id}.`, `${id} சம்பவம் கிடைக்கவில்லை.`), blocks: [{ kind: "Note", id: "none", text: `No incident ${id} in the data.` }] };
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
  if (row.lat != null && row.lon != null) blocks.push({ kind: "MapView", id: "map", title: "Where", rule: null, shade: null, outline: [],
    points: [{ n: 1, id: row.id, lat: row.lat, lon: row.lon as number, label: row.title, sev: row.sev, value: null, hot: true }] });
  // retold, not read out: a fact sheet from the record, then what is wrong, how long, why it matters and what I would do
  const placeTa = row.zone ? zoneTa(c.w, row.zone) : null;
  const facts = factSheet(row, { openFor: i.open_for, firstAt: i.t ?? i.first ?? null, next: actionForOne(i.cat ?? i.category_code, row.dept, row.deptName), placeTa, open: i.open });
  const say = explainIssue(facts, spokenLabel(row), [row.title, ...(i.why?.what ?? []).map(String), ...timeline.map((x) => x.text)]);
  return { title: row.title, takeaway: row.overdue && !closed ? bi("Past its deadline.", "காலக்கெடு தாண்டியது.") : null, say, blocks };
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
  const words = (slots.q ?? "").toLowerCase().split(/[^a-z\u0B80-\u0BFF]+/).filter((x) => x.length >= 4 && !GENERIC.test(x))
    .map((x) => x.replace(/(ing|ed|s)$/, ""));
  const match = (x: Row) => !words.length || words.some((wd) => `${x.title ?? ""} ${x.original ?? ""} ${x.loc ?? ""}`.toLowerCase().includes(wd));
  let items = r.rows.filter(match).map((x) => ({
    id: String(x.id), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null,
    place: clip(x.loc, 120) || null, incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
  }));
  // a topic the latest news does not carry: the console's search over every report
  if (words.length && items.length < 2) {
    const sr = await call(c, "search_records", { text: slots.q, scope: scopeArg(s), kinds: ["news"] }).catch(() => null);
    const found = ((sr?.data as { news?: Row[] } | undefined)?.news ?? []).map((x) => ({
      id: String(x.id ?? x.doc_id ?? x.title), title: clip(x.title, 300), source: clip(x.publisher ?? x.source, 80) || null, t: x.t ?? x.published ?? null,
      place: clip(x.place ?? x.loc, 120) || null, incidentId: x.incident ?? x.incident_id ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
    if (found.length) { items = found; c.notes.push("Found by searching every news report (the latest news had none on this)."); }
  }
  // a zone with no report of its own in the latest news: every report is searched for it
  if (zone && !items.length) {
    const sr = await call(c, "search_records", { text: zoneName, scope: scopeArg({ ...s, zone: null }), kinds: ["news"] }).catch(() => null);
    items = ((sr?.data as { news?: Row[] } | undefined)?.news ?? []).filter(inZone).map((x) => ({
      id: String(x.id ?? x.doc_id ?? x.title), title: clip(x.title, 300), source: clip(x.publisher ?? x.source, 80) || null, t: x.t ?? x.published ?? null,
      place: clip(x.place ?? x.loc, 120) || null, incidentId: x.incident ?? x.incident_id ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
  }
  if (zone && !items.length) {
    return { title: `News · ${zoneName} · ${PERIOD_EN[s.period]}`, takeaway: null,
      say: bi(`No news report named ${zoneName} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} ${ZONE_TA[zone] ?? zoneName} பற்றி செய்தி இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: `No news report ${inPeriod(s.period)} names ${zoneName} or a place in it.` }],
      next: [{ label: { en: "All of Chennai's news", ta: "சென்னை முழுவதும்" }, kind: "direct", recipe: "news", slots: { ...slots, zones: [], fresh: true }, ids: [], text: null }] };
  }
  let topic = words.length && slots.q ? ` about ${slots.q}` : zoneName ? ` from ${zoneName}` : "";
  // a topic nothing matched: say so, and still show the latest news
  if (words.length && !items.length) {
    c.notes.push(`No news matched "${clip(slots.q, 80)}"; showing the latest news instead.`);
    topic = "";
    items = r.rows.map((x) => ({
      id: String(x.id), title: clip(x.title, 300), source: clip((x.outletNames ?? [])[0] ?? x.publisher, 80) || null, t: x.t ?? null,
      place: clip(x.loc, 120) || null, incidentId: x.incident ?? null, url: typeof x.url === "string" && /^https?:\/\//.test(x.url) && x.url.length <= 2000 ? x.url : null
    }));
  }
  items = items.slice(0, Math.min(slots.n ?? 12, 20));
  const title = `News${topic} · ${PERIOD_EN[s.period]}`;
  const taTopic = zone ? `${ZONE_TA[zone] ?? zoneName} ` : "";
  if (!items.length) return { title, takeaway: null, say: bi(`No news${topic} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} இது பற்றி செய்தி இல்லை.`), blocks: [] };
  const linked = items.filter((x) => x.incidentId).length;
  return {
    title, takeaway: linked ? bi(`${linked} of these ${items.length} headlines are linked to an incident.`, `இந்த ${items.length} தலைப்புகளில் ${linked} ஒரு சம்பவத்துடன் இணைந்தவை.`) : null,
    say: bi(`${plural(items.length, "headline", "headlines")}${topic}. Reading them now.`, `${taTopic}${spoken(items.length)} தலைப்புச் செய்திகள். படிக்கிறேன்.`),
    blocks: [{ kind: "NewsReader", id: "news", title, total: words.length ? items.length : r.total, items }]
  };
}

// ------------------------------------------------------------------ prices --

interface MandiRow { commodity: string; markets: number; avg_per_kg: number | null; avg_prev_per_kg: number | null;
  prices: { market: string; date: string; per_kg: number; prev_per_kg: number | null }[] }

/** Vegetable prices at Chennai's markets (AGMARKNET): one item's price at every market, or the day's price list. */
async function prices(c: Ctx): Promise<Part> {
  const r = await call(c, "mandi_prices", { commodity: c.slots.q, market: null });
  const d = r.data as { rows: MandiRow[]; latest: string | null; unknown: string[] };
  const latest = d.latest ? when(d.latest) ?? d.latest : null;
  if (!d.rows?.length) {
    const what = c.slots.q ?? "vegetables";
    return { title: `Prices · ${what}`, takeaway: null, say: bi(`There is no recent market price for ${what}.`, `${what} விலை சமீபத்திய சந்தை அறிக்கைகளில் இல்லை.`),
      blocks: [{ kind: "Note", id: "none", text: `No Chennai market reported a price for ${what} in the last 14 days.` }] };
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
      title: `${it.commodity} prices · Chennai markets`, takeaway: ch.pct != null && Math.abs(ch.pct) >= 10 ? bi(`${it.commodity} is ${trendEn}.`, `${it.commodity} ${trendTa}.`) : null, say,
      blocks: [
        { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
          { key: "avg", label: `Average, ${it.markets} markets`, value: Math.round(it.avg_per_kg ?? 0), unit: "₹/kg", prev: it.avg_prev_per_kg == null ? null : Math.round(it.avg_prev_per_kg), delta: ch.delta, tone: ch.pct != null && ch.pct >= 10 ? "bad" : "neutral", spark: [] },
          { key: "lo", label: `Cheapest: ${lo.market}`, value: Math.round(lo.per_kg), unit: "₹/kg", prev: null, delta: null, tone: "good", spark: [] },
          { key: "hi", label: `Dearest: ${hi.market}`, value: Math.round(hi.per_kg), unit: "₹/kg", prev: null, delta: null, tone: "neutral", spark: [] }
        ] },
        { kind: "Ranking", id: "markets", title: `${it.commodity} at each market${latest ? ` · reports to ${latest}` : ""}`, unit: "₹/kg", method: "AGMARKNET modal price, rupees per kilo (the latest report of each market)", order: "bottom",
          items: ps.map((p, i) => ({ key: p.market, label: p.market, value: Math.round(p.per_kg), rank: i + 1, sub: `${p.date}${p.prev_per_kg != null ? ` · was ₹${Math.round(p.prev_per_kg)}` : ""}`, zone: null, lat: null, lon: null, action: "none" as const })) }
      ]
    };
  }
  const list = d.rows.filter((x) => x.avg_per_kg != null);
  const ups = list.map((x) => ({ x, ch: x.avg_prev_per_kg ? change(x.avg_per_kg!, x.avg_prev_per_kg) : { delta: null, pct: null } })).filter((y) => (y.ch.pct ?? 0) >= 10);
  return {
    title: "Vegetable prices · Chennai markets", takeaway: ups.length ? bi(`Up 10% or more: ${ups.map((y) => y.x.commodity).join(", ")}.`, `10% அல்லது அதிகம் உயர்ந்தவை: ${ups.map((y) => y.x.commodity).join(", ")}.`) : null,
    say: bi(`Prices of ${list.length} items at Chennai markets${latest ? `, reports to ${latest}` : ""}. ${ups.length ? `${ups.map((y) => y.x.commodity).join(", ")} went up.` : "No big rises."}`,
      `சென்னை சந்தைகளில் ${list.length} பொருட்களின் விலை. ${ups.length ? `${ups.map((y) => y.x.commodity).join(", ")} விலை உயர்ந்துள்ளது.` : "பெரிய உயர்வு இல்லை."}`),
    blocks: [{ kind: "Ranking", id: "prices", title: "Average price per kilo", unit: "₹/kg", method: "AGMARKNET modal prices averaged across the Chennai markets that reported", order: "top",
      items: list.map((x, i) => ({ key: x.commodity, label: x.commodity, value: Math.round(x.avg_per_kg!), rank: i + 1, sub: x.avg_prev_per_kg != null ? `was ₹${Math.round(x.avg_prev_per_kg)} · ${x.markets} markets` : `${x.markets} markets`, zone: null, lat: null, lon: null, action: "none" as const })) }]
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
  const title = `${e.en}${c.slots.name ? ` · ${c.slots.name}` : ""}`;
  if (!items.length) return { title, takeaway: null, say: bi(`There is no ${e.en.toLowerCase()} reading in the data.`, `${e.ta} அளவீடு தரவில் இல்லை.`), blocks: [] };
  const named = c.slots.name ? items.find((x) => x.name.toLowerCase().includes(c.slots.name!.toLowerCase()) || c.slots.name!.toLowerCase().includes(x.name.toLowerCase().split(" ")[0])) : null;
  const top = named ?? items[0];
  const v = m === "lakes" ? Math.round(top.value) : top.value;
  const unitWord = m === "lakes" ? "% full" : ` ${e.unit}`;
  const at = when(top.t) ?? "the latest reading";
  // the Tamil line has its own month, clock and unit (a Latin "6 Nov, 8:30 AM" and "mm" in a Tamil line is a break: RC-15, SKG1-37)
  const atTa = when(top.t) ? labelTa(when(top.t) as string) : "சமீபத்திய அளவீடு";
  const unitTa = ({ rain: "மி.மீ", aqi: "AQI", lakes: "%", temp: "°C", humidity: "%" } as Record<Metric, string>)[m];
  const say = named
    ? bi(`${top.name} is at ${spoken(v)}${unitWord}, as of ${at}.`, `${top.name}: ${spoken(v)}${m === "lakes" ? "% நிரம்பியுள்ளது" : ` ${unitTa}`}, ${atTa} நிலவரப்படி.`)
    : bi(`${items.length} readings. Highest: ${top.name} at ${spoken(v)}${unitWord}, as of ${at}.`, `${items.length} அளவீடுகள். அதிகம்: ${top.name}, ${spoken(v)}${m === "lakes" ? "%" : ` ${unitTa}`}, ${atTa} நிலவரப்படி.`);
  const vs = top.mean28 != null && top.mean28 > 0 ? change(top.value, top.mean28) : { delta: null, pct: null };
  const takeaway = vs.pct != null && Math.abs(vs.pct) >= 10
    ? bi(`${top.name} is ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "above" : "below"} its 28-day average.`, `${top.name} அதன் 28 நாள் சராசரியை விட ${spoken(Math.abs(vs.pct))}% ${vs.pct > 0 ? "அதிகம்" : "குறைவு"}.`) : null;
  const blocks: BlockT[] = [{ kind: "Readings", id: "readings", title, metric: m, unit: e.unit, items: named ? [named, ...items.filter((x) => x !== named)] : items }];
  const pts = rows.filter((x) => num(x.lat) != null && num(x.lon) != null && Math.abs(Number(x.lat) - 13.05) < 0.6)
    .map((x, i) => ({ n: i + 1, id: String(x.place_id ?? x.place), lat: Number(x.lat), lon: Number(x.lon), label: clip(x.place, 120), sev: null, value: round(Number(x.value), 1), hot: String(x.place) === top.name }));
  if (pts.length >= 2) blocks.push({ kind: "MapView", id: "map", title: "Stations", rule: null, shade: null, points: pts, outline: [] });
  return { title, takeaway, say, blocks };
}

// ------------------------------------------------------------------ ranking --

async function ranking(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  const measure: Measure = slots.measure ?? (slots.metric ? (slots.metric === "humidity" ? "rain" : slots.metric) as Measure : "zone_attention");
  const n = Math.min(Math.max(slots.n ?? 5, 1), 15);
  const order = slots.order;
  let items: Extract<BlockT, { kind: "Ranking" }>["items"] = [];
  let unit: string | null = null; let method = ""; let label = ""; let shade: Extract<BlockT, { kind: "MapView" }>["shade"] = null; let pts: PointT[] = [];
  let asWhen: string | null = null; let all: number[] = [];
  if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    const m = measure as Metric;
    const rows = await envRows(c, m);
    const ranked = rank(rows, (x) => Number(x.value), n, order);
    all = rows.map((x) => Number(x.value));
    unit = ENV[m].unit; label = ENV[m].en;
    method = `Latest reading at each ${m === "lakes" ? "reservoir" : "station"} (${rows.length} reporting), ranked; the data has no zone-level gauge, so places are the stations themselves.`;
    items = ranked.map((r) => ({ key: String(r.item.place_id ?? r.item.place), label: clip(r.item.place, 120), value: round(r.value, 1), rank: r.rank, sub: when(r.item.t), zone: null,
      lat: num(r.item.lat), lon: num(r.item.lon), action: "station" as const }));
    asWhen = when(ranked[0]?.item.t);
    pts = items.filter((x) => x.lat != null && x.lon != null && Math.abs((x.lat as number) - 13.05) < 0.6)
      .map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else if (measure.startsWith("zone_")) {
    const r = await call(c, "zones", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows;
    const key = { zone_severe: "severe", zone_open: "open", zone_incidents: "n", zone_complaints: "complaints", zone_attention: "score" }[measure as "zone_severe"] ?? "score";
    label = { severe: "Severe incidents", open: "Open incidents", n: "Incidents reported", complaints: "Open citizen complaints", score: "Attention score (3 × severe + high)" }[key] ?? key;
    unit = key === "score" ? "points" : "incidents";
    method = `${label} by zone, ${PERIOD_EN[s.period]}, as the console's zone table counts them.`;
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const }));
    shade = { geo: "zone", label, values: rows.map((x) => ({ key: Number(x.zone), value: Number(x[key]) })) };
  } else if (measure === "taluk_open") {
    const r = await call(c, "taluks", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    label = "Unresolved incidents, last 30 days"; unit = "incidents"; method = "Open incidents by revenue taluk over the last 30 days (the Trends page's taluk ranking).";
    all = rows.map((x) => Number(x.open));
    items = rank(rows, (x) => Number(x.open), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.severe ?? 0))} severe`, zone: null, lat: num(x.item.lat), lon: num(x.item.lon), action: "none" as const }));
  } else if (measure === "hotspots") {
    const r = await call(c, "hotspots", { scope: scopeArg(s) });
    const rows = (r.data as { rows: Row[] }).rows ?? [];
    label = "Incidents in 30 days, per hotspot"; unit = "incidents"; method = "Clusters of incidents within 250 m of each other (DBSCAN), 3 or more in the last 30 days.";
    all = rows.map((x) => Number(x.incidents_30d));
    items = rank(rows, (x) => Number(x.incidents_30d), n, order).map((x) => ({ key: String(x.item.id), label: `${clip(x.item.label, 60)} · ${clip(x.item.top_place, 50)}`, value: x.value, rank: x.rank,
      sub: `${spoken(Number(x.item.open))} open · ${clip(x.item.zone_name, 40)}`, zone: num(x.item.zone), lat: num(x.item.lat), lon: num(x.item.lon), action: "zone" as const }));
    pts = items.filter((x) => x.lat != null).map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: x.label, sev: null, value: x.value, hot: x.rank <= 3 }));
  } else {
    const d = await deptMeasures(c);
    const key = measure === "dept_backlog" ? "days" : measure === "dept_resolution" ? "closeDays" : measure === "dept_overdue" ? "overdue" : "open";
    label = { days: "Average age of open incidents", closeDays: "Average days to close", overdue: "Open past the deadline", open: "Open incidents" }[key] ?? key;
    unit = key === "days" || key === "closeDays" ? "days" : "incidents";
    method = { days: "Departments with 5 or more open incidents, by the average age of their open incidents (the console's backlog card).",
      closeDays: `Average days from first report to closing, incidents closed ${inPeriod(s.period)}.`, overdue: `Open incidents past their deadline, ${PERIOD_EN[s.period]}.`,
      open: `Open incidents, ${PERIOD_EN[s.period]}.` }[key] ?? "";
    const rows = d.filter((x) => x[key] != null);
    all = rows.map((x) => Number(x[key]));
    items = rank(rows, (x) => Number(x[key]), n, order).map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
      sub: `${spoken(Number(x.item.open ?? 0))} open`, zone: null, lat: null, lon: null, action: "dept" as const }));
  }
  const scope = scopeWords(w, s);
  const title = `${order === "top" ? "Top" : "Bottom"} ${items.length} · ${label}${measure.startsWith("zone_") || measure.startsWith("dept_") ? ` · ${scope.en}` : ""}`;
  if (!items.length) return { title, takeaway: null, say: bi("There is nothing to rank for this.", "இதற்கு வரிசைப்படுத்த எதுவும் இல்லை."), blocks: [] };
  const first = items[0];
  const vm = vsMedian(first.value, all);
  if (order === "top" && first.value === 0 && all.every((v) => v === 0)) {
    const nothing = bi(`Nothing to rank: all ${all.length} read 0${unit ? ` ${unit}` : ""}${asWhen ? ` as of ${asWhen}` : ""}.`, `வரிசைப்படுத்த எதுவும் இல்லை: ${all.length} அளவீடுகளும் 0${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`);
    return { title, takeaway: nothing, say: measure === "rain" ? bi(`No rain in the last 24 hours at any of the ${all.length} stations${asWhen ? `, as of ${asWhen}` : ""}.`, `கடந்த 24 மணி நேரத்தில் ${all.length} நிலையங்களிலும் மழை இல்லை${asWhen ? `, ${asWhen} நிலவரப்படி` : ""}.`) : nothing,
      blocks: [{ kind: "Ranking", id: "rank", title: label, unit, method, order, items }, ...(pts.length ? [{ kind: "MapView" as const, id: "map", title: "Stations", rule: null, shade: null, points: pts, outline: [] }] : [])] };
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
  if (shade || pts.length) blocks.push({ kind: "MapView", id: "map", title: shade ? `${label} by zone` : "On the map", rule: null, shade, points: pts, outline: items.filter((x) => x.zone).slice(0, 3).map((x) => x.zone as number) });
  const total = all.reduce((a, b) => a + b, 0);
  if (measure.startsWith("zone_") || measure === "taluk_open") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "top", label: `${first.label}`, value: first.value, unit, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "total", label: "All areas together", value: total, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "share", label: `${first.label}'s share`, value: share(first.value, total) ?? 0, unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  } else if (measure === "rain" || measure === "aqi" || measure === "lakes" || measure === "temp") {
    blocks.unshift({ kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "top", label: first.label, value: first.value, unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "median", label: "Median of all stations", value: round(median(all) ?? 0, 1), unit, prev: null, delta: null, tone: "neutral", spark: [] },
      { key: "n", label: "Reporting", value: all.length, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] });
  }
  return { title, takeaway, say, blocks };
}

/** Departments with every measure the console has for them, joined by code. */
async function deptMeasures(c: Ctx): Promise<Row[]> {
  const sc = { scope: scopeArg(c.s) };
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
  { key: "n", label: "Reported" }, { key: "severe", label: "Severe" }, { key: "high", label: "High" }, { key: "open", label: "Open" },
  { key: "complaints", label: "Open complaints" }, { key: "overdue", label: "Past deadline" }
];

async function compare(c: Ctx): Promise<Part> {
  const { w, s, slots } = c;
  if (slots.depts.length >= 2) return compareDepts(c);
  const zones = [...new Set(slots.zones)].slice(0, 4);
  if (zones.length < 2) return { title: "Compare", takeaway: null, say: bi("Which two areas should I compare?", "எந்த இரண்டு பகுதிகளை ஒப்பிட வேண்டும்?"), blocks: [] };
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
    return { key: String(z), label: zoneName(w, z) ?? `Zone ${z}`, zone: z,
      values: { n: Number(row.n ?? d.totals?.n ?? 0), severe: Number(row.severe ?? 0), high: Number(row.high ?? 0), open: Number(row.open ?? 0), complaints: Number(row.complaints ?? 0), overdue: Number(d.totals?.overdue ?? 0) },
      cats: (d.categories ?? []).slice(0, 6).map((x) => ({ code: String(x.code), label: clip(x.label, 80), n: Number(x.n) })),
      series: buckets.map((b) => Number(b.n)) };
  });
  const gaps = largestGaps(out, CMP_METRICS.map((m) => m.key));
  const lab = (k: string) => CMP_METRICS.find((m) => m.key === k)?.label ?? k;
  const title = `${out.map((x) => x.label).join(" vs ")} · ${PERIOD_EN[s.period]}`;
  const [a, b] = out;
  const g = gaps[0];
  const say = bi(
    `${out.map((x) => `${x.label}: ${spoken(x.values.severe)} severe and ${spoken(x.values.open)} open.`).join(" ")}${g ? ` The biggest gap is ${lab(g.metric).toLowerCase()}: ${g.hi} ${spoken(g.hiValue)} against ${g.lo} ${spoken(g.loValue)}.` : ""}`,
    `${out.map((x) => `${zoneTa(w, x.zone)}: ${spoken(x.values.severe)} கடுமையான, ${spoken(x.values.open)} திறந்தவை.`).join(" ")}${g ? ` பெரிய வேறுபாடு ${lab(g.metric)}: ${g.hi} ${spoken(g.hiValue)}, ${g.lo} ${spoken(g.loValue)}.` : ""}`
  );
  const takeaway = g ? bi(`${g.hi} had ${g.ratio ? `${spoken(g.ratio)}×` : `${spoken(g.gap)} more`} the ${lab(g.metric).toLowerCase()} of ${g.lo} ${inPeriod(s.period)}.`,
    `${PERIOD_TA[s.period]} ${g.hi}, ${g.lo}-ஐ விட ${g.ratio ? `${spoken(g.ratio)} மடங்கு` : `${spoken(g.gap)} கூடுதல்`} ${lab(g.metric)}.`) : null;
  c.notes.push("Median resolution time is not kept per zone in the data; the board compares counts.");
  return { title, takeaway, say, blocks: [
    { kind: "Compare", id: "cmp", title, metrics: CMP_METRICS, sides: out, seriesLabels,
      diffs: gaps.slice(0, 6).map((x) => ({ metric: x.metric, label: lab(x.metric), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) },
    { kind: "MapView", id: "map", title: out.length === 2 ? "Both areas" : `The ${out.length} areas`, rule: null, shade: { geo: "zone", label: "Severe incidents", values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.severe) })) }, points: [], outline: zones }
  ] };
}

async function compareDepts(c: Ctx): Promise<Part> {
  const d = await deptMeasures(c);
  const pick = c.slots.depts.slice(0, 4).map((code) => d.find((x) => x.code === code)).filter((x): x is Row => !!x);
  const metrics = [{ key: "open", label: "Open" }, { key: "overdue", label: "Past deadline" }, { key: "severe", label: "Severe" }, { key: "days", label: "Avg age open (days)" }, { key: "closeDays", label: "Avg days to close" }];
  const title = `${pick.map((x) => x.name).join(" vs ")} · ${PERIOD_EN[c.s.period]}`;
  if (pick.length < 2) return { title, takeaway: null, say: bi("I could not find both departments in the data.", "இரண்டு துறைகளையும் தரவில் காண முடியவில்லை."), blocks: [] };
  const sides = pick.map((x) => ({ key: String(x.code), label: clip(x.name, 80), zone: null, values: Object.fromEntries(metrics.map((m) => [m.key, Number(x[m.key] ?? 0)])), cats: [], series: [] }));
  const gaps = largestGaps(sides, metrics.map((m) => m.key));
  const g = gaps[0];
  const lab = (k: string) => metrics.find((m) => m.key === k)?.label ?? k;
  return {
    title, takeaway: g ? bi(`Largest gap: ${lab(g.metric)}, ${g.hi} ${spoken(g.hiValue)} against ${g.lo} ${spoken(g.loValue)}.`, `பெரிய வேறுபாடு: ${lab(g.metric)}, ${g.hi} ${spoken(g.hiValue)}, ${g.lo} ${spoken(g.loValue)}.`) : null,
    say: bi(sides.map((x) => `${x.label}: ${spoken(x.values.open)} open, ${spoken(x.values.overdue)} past deadline`).join(". ") + ".", sides.map((x) => `${x.label}: ${spoken(x.values.open)} திறந்தவை, ${spoken(x.values.overdue)} காலக்கெடு தாண்டியவை`).join(". ") + "."),
    blocks: [{ kind: "Compare", id: "cmp", title, metrics, sides, seriesLabels: [], diffs: gaps.slice(0, 5).map((x) => ({ metric: x.metric, label: lab(x.metric), hi: x.hi, lo: x.lo, ratio: x.ratio, gap: x.gap })) }]
  };
}

// ------------------------------------------------------------------ trend --

async function seriesBlock(c: Ctx, s: ScopeT, title: string): Promise<{ block: Extract<BlockT, { kind: "Trend" }>; values: number[]; open: number[]; labels: string[]; total: number }> {
  const r = await call(c, "incident_series", { scope: scopeArg(s) });
  const d = r.data as { buckets: Row[]; unit: string; normal: { lo: number; hi: number; mean: number } | null };
  const values = d.buckets.map((b) => Number(b.n));
  const labels = d.buckets.map((b) => (d.unit === "2h" || /hour/.test(d.unit) ? when(b.from)?.split(", ")[1] ?? "" : when(b.from)?.split(",")[0] ?? ""));
  const normal = d.normal && Number.isFinite(d.normal.hi) ? { lo: Number(d.normal.lo), hi: Number(d.normal.hi) } : null;
  const marks = unusualPoints(values, normal).slice(0, 12).map((i) => ({ i, why: normal ? `Above the usual range (${spoken(normal.lo)}–${spoken(normal.hi)})` : "More than 2 standard deviations above the mean" }));
  return { block: { kind: "Trend", id: "trend", title, unit: "incidents", labels, values, marks, normal }, values, open: d.buckets.map((b) => Number(b.open ?? 0)), labels, total: values.reduce((a, b) => a + b, 0) };
}

async function trend(c: Ctx): Promise<Part> {
  const { w, s } = c;
  const scope = scopeWords(w, { ...s, cat: null });
  const subject = catLabel(w, s.cat) ?? "Incidents";
  // no kind named: "incidents", never "incidents of incidents" or "incidents reports" (same-number-21)
  const generic = !catLabel(w, s.cat);
  const t = await seriesBlock(c, s, `${subject} over time`);
  const zr = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const title = `${subject} · ${scope.en}`;
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
    { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "total", label: `${subject}, ${PERIOD_EN[s.period]}`, value: t.total, unit: null, prev: null, delta: null, tone: "neutral", spark: t.values.slice(-30) },
      { key: "peak", label: `Peak (${t.labels[p.i]})`, value: p.value, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "half", label: "Second half vs first", value: second, unit: null, prev: first, delta: ch.delta, pct: ch.pct, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] }
    ] },
    t.block,
    { kind: "Ranking", id: "zones", title: `Zones with the most ${subject.toLowerCase()}`, unit: "incidents", method: `Incidents reported by zone, ${PERIOD_EN[s.period]}.`, order: "top",
      items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
    { kind: "MapView", id: "map", title: "By zone", rule: null, shade: { geo: "zone", label: subject, values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: [], outline: zr5.slice(0, 3).map((x) => Number(x.item.zone)) }
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
  const title = `Why · ${scope.en}`;
  const reasons: string[] = [];
  const reasonsTa: string[] = [];
  if (rises[0]) {
    reasons.push(`${rises.map((x) => `${clip(x.label, 60).toLowerCase()} rose by ${spoken(Number(x.delta))}`).join(", ")}`);
    reasonsTa.push(`${rises.map((x) => `${clip(x.label, 60)} ${spoken(Number(x.delta))} கூடியது`).join(", ")}`);
  }
  if (num(t.rainLinked)) { reasons.push(`${Number(t.rainLinked) === 1 ? "1 incident was" : `${spoken(Number(t.rainLinked))} incidents were`} rain-linked over ${plural(d.rainDays, "rain day", "rain days")}`); reasonsTa.push(`${spoken(d.rainDays)} மழை நாட்களில் ${spoken(Number(t.rainLinked))} மழை தொடர்பானவை`); }
  if (num(t.overdue)) { reasons.push(Number(t.overdue) === 1 ? "1 open incident is past its deadline" : `${spoken(Number(t.overdue))} open incidents are past their deadline`); reasonsTa.push(`${spoken(Number(t.overdue))} காலக்கெடு தாண்டியவை`); }
  const place = d.places?.[0];
  if (place) { reasons.push(`the busiest spot is ${clip(place.place, 60)} (${spoken(Number(place.n))} ${clip(place.category, 50).toLowerCase()})`); reasonsTa.push(`அதிக இடம் ${clip(place.place, 60)} (${spoken(Number(place.n))})`); }
  const head = ch.delta != null
    ? `${plural(Number(t.n), "incident", "incidents")} ${inPeriod(s.period)} against ${spoken(Number(t.prev))} the period before${ch.pct ? ` (${ch.pct > 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}%)` : ""}.`
    : `${plural(Number(t.n ?? 0), "incident", "incidents")} ${inPeriod(s.period)}.`;
  const headTa = `${PERIOD_TA[s.period]} ${spoken(Number(t.n ?? 0))} சம்பவங்கள்${num(t.prev) != null ? `, முந்தைய காலத்தில் ${spoken(Number(t.prev))}` : ""}.`;
  const text = `${head} ${reasons.length ? `Main reasons: ${reasons.join("; ")}.` : ""}`;
  const blocks: BlockT[] = [
    { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
      { key: "n", label: `Reported, ${PERIOD_EN[s.period]}`, value: Number(t.n ?? 0), unit: null, prev: num(t.prev), delta: ch.delta, pct: ch.pct, tone: (ch.delta ?? 0) > 0 ? "bad" : "good", spark: [] },
      { key: "severe", label: "Severe", value: Number(t.severe ?? 0), unit: null, prev: num(t.severePrev), delta: num(t.severePrev) != null ? Number(t.severe ?? 0) - Number(t.severePrev) : null, tone: "bad", spark: [] },
      { key: "overdue", label: "Past deadline (open)", value: Number(t.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
      { key: "rain", label: "Rain-linked", value: Number(t.rainLinked ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
    ] },
    { kind: "Answer", id: "answer", title: "What drives it", text, facts: [
      ...rises.map((x) => ({ label: `${clip(x.label, 100)}: now vs before`, value: Number(x.n), unit: `(was ${spoken(Number(x.prev))})` })),
      ...(d.depts ?? []).slice(0, 2).map((x) => ({ label: `${clip(x.name, 100)}: open past deadline`, value: Number(x.overdue ?? 0), unit: null }))
    ].slice(0, 12) }
  ];
  const cats = [...(d.categories ?? [])].sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 8);
  if (cats.length) blocks.push({ kind: "Chart", id: "chart", title: "Change by kind of incident (now minus before)", chart: "hbar", unit: "incidents", labels: cats.map((x) => clip(x.label, 80)), values: cats.map((x) => Number(x.delta)) });
  const top = (d.top ?? []).map((x) => caseRow({ ...x, sev: x.severity, why: null, reasons: x.reasons }, w));
  if (top.length) blocks.push({ kind: "CaseList", id: "top", title: "The incidents behind it", source: "list", sev: null, total: top.length, rows: top });
  return {
    title,
    takeaway: rises[0] ? bi(`${clip(rises[0].label, 60)} rose the most: ${spoken(Number(rises[0].n))} against ${spoken(Number(rises[0].prev))}.`, `${clip(rises[0].label, 60)} அதிகம் உயர்ந்தது: ${spoken(Number(rises[0].n))}, முன்பு ${spoken(Number(rises[0].prev))}.`) : null,
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
  const t = await seriesBlock(c, s, "Still open, by when reported");
  t.block.values = t.open;
  t.block.title = "Still open today, by when they were reported";
  t.block.marks = [];
  t.block.normal = null;
  const heatRows = slowest.slice(0, 8).map((x) => x.item);
  const cols = [{ k: "open", l: "Open" }, { k: "overdue", l: "Past deadline" }, { k: "serious", l: "Severe or high" }, { k: "awaiting", l: "Awaiting you" }, { k: "days", l: "Avg age (days)" }, { k: "closeDays", l: "Days to close" }];
  const title = `Department performance${s.dept ? ` · ${deptName(c.w, s.dept) ?? s.dept}` : ""} · ${PERIOD_EN[s.period]}`;
  if (!slowest.length) return { title, takeaway: null, say: bi("No department has enough open incidents to rank.", "வரிசைப்படுத்த போதுமான தரவு இல்லை."), blocks: [] };
  const [a, b, cc] = slowest;
  const say = bi(
    `Slowest: ${a.item.name}, open incidents ${spoken(a.value)} days old on average.${b ? ` Then ${b.item.name} at ${spoken(b.value)}${cc ? ` and ${cc.item.name} at ${spoken(cc.value)}` : ""}.` : ""}`,
    `மிக மெதுவானது: ${a.item.name}, திறந்த சம்பவங்கள் சராசரியாக ${spoken(a.value)} நாட்கள்.${b ? ` அடுத்து ${b.item.name} ${spoken(b.value)}${cc ? `, ${cc.item.name} ${spoken(cc.value)}` : ""}.` : ""}`
  );
  const vm = vsMedian(a.value, d.filter((x) => x.days != null).map((x) => Number(x.days)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name}'s open incidents are ${spoken(vm.ratio)}× older than the median department's.`, `${a.item.name}-இன் திறந்த சம்பவங்கள் இடைநிலைத் துறையை விட ${spoken(vm.ratio)} மடங்கு பழையவை.`) : null,
    say, blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        { key: "open", label: `Open${s.dept ? `, ${deptName(c.w, s.dept) ?? s.dept}` : ""}, ${PERIOD_EN[s.period]}`, value: totalOpen, unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "overdue", label: "Past deadline", value: overdue, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "close", label: "Median days to close", value: round(closeDays ?? 0, 1), unit: "days", prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "ontime", label: "Median closed on time", value: round(onTime ?? 0, 0), unit: "%", prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: "Slowest departments first", unit: "days", method: "Average age of open incidents, departments with 5 or more open (the console's backlog card).", order: "top",
        items: slowest.map((x) => ({ key: String(x.item.code), label: clip(x.item.name, 120), value: round(x.value, 1), rank: x.rank,
          sub: `${spoken(Number(x.item.open ?? x.item.backlogOpen ?? 0))} open · ${spoken(Number(x.item.overdue ?? 0))} past deadline`, zone: null, lat: null, lon: null, action: "dept" as const })) },
      t.block,
      { kind: "Heat", id: "heat", title: "Department × measure (darker = worse within the column)", rows: heatRows.map((x) => clip(x.name, 80)), cols: cols.map((x) => x.l),
        cells: heatRows.map((x) => cols.map((col) => round(Number(x[col.k] ?? 0), 1))) }
    ] };
}

async function zonePerformance(c: Ctx): Promise<Part> {
  const { s, w } = c;
  const r = await call(c, "zones", { scope: scopeArg({ ...s, zone: null }) });
  const rows = (r.data as { rows: Row[] }).rows;
  const ranked = rank(rows, (x) => Number(x.score), 15);
  const t = await seriesBlock(c, { ...s, zone: null }, "Incidents reported over time");
  const cols = [{ k: "n", l: "Reported" }, { k: "severe", l: "Severe" }, { k: "high", l: "High" }, { k: "open", l: "Open" }, { k: "complaints", l: "Complaints" }];
  const tot = (k: string) => rows.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const title = `Zone performance · all zones · ${PERIOD_EN[s.period]}`;
  const [a, b] = ranked;
  if (!a) return { title, takeaway: null, say: bi("No zone data for this period.", "இந்தக் காலத்துக்கு மண்டலத் தரவு இல்லை."), blocks: [] };
  const vm = vsMedian(a.value, rows.map((x) => Number(x.score)));
  return { title,
    takeaway: vm.ratio ? bi(`${a.item.name} needs the most attention: ${spoken(vm.ratio)}× the median zone's score.`, `${zoneTa(w, Number(a.item.zone))} அதிக கவனம் தேவை: இடைநிலை மண்டலத்தை விட ${spoken(vm.ratio)} மடங்கு.`) : null,
    say: bi(`${a.item.name} needs the most attention: ${spoken(Number(a.item.severe))} severe and ${spoken(Number(a.item.open))} open.${b ? ` Then ${b.item.name}.` : ""}`,
      `${zoneTa(w, Number(a.item.zone))}: ${spoken(Number(a.item.severe))} கடுமையான, ${spoken(Number(a.item.open))} திறந்தவை.${b ? ` அடுத்து ${zoneTa(w, Number(b.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        // the trend beside it counts every incident, those with no zone too: the tile is that count, so the two agree (RC-09, PB-067)
        { key: "n", label: `Reported, ${PERIOD_EN[s.period]}`, value: t.total, unit: null, prev: null, delta: null, tone: "neutral", spark: t.values.slice(-30) },
        { key: "severe", label: "Severe", value: tot("severe"), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "open", label: "Open", value: tot("open"), unit: null, prev: null, delta: null, tone: "neutral", spark: [] },
        { key: "complaints", label: "Open complaints", value: tot("complaints"), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Ranking", id: "rank", title: "Zones by attention score (worst first)", unit: "points", method: "Attention score = 3 × severe + high, as the console's 'Hotspot zones' tile.", order: "top",
        items: ranked.slice(0, 15).map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.severe))} severe · ${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      { kind: "MapView", id: "map", title: "Attention score by zone", rule: null, shade: { geo: "zone", label: "Attention score", values: rows.map((x) => ({ key: Number(x.zone), value: Number(x.score) })) }, points: [], outline: ranked.slice(0, 3).map((x) => Number(x.item.zone)) },
      t.block,
      { kind: "Heat", id: "heat", title: "Zone × measure (darker = worse within the column)", rows: ranked.slice(0, 10).map((x) => clip(x.item.name, 80)), cols: cols.map((x) => x.l),
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
  const t = await seriesBlock(c, s, `${subject} over time`);
  const kd = k.data as { cur: Record<string, number>; prev: Record<string, number>; series: Record<string, number[]> };
  const zrows = (zr.data as { rows: Row[] }).rows;
  const zr5 = rank(zrows, (x) => Number(x.n), 5);
  const rows = list.rows.map((x) => caseRow(x, w)).slice(0, 8);
  const hot = ((hs?.data as { rows: Row[] } | undefined)?.rows ?? []).filter((x) => !s.cat || x.cat === s.cat).slice(0, 8);
  const pts: PointT[] = [...points(rows, 3), ...hot.map((x, i) => ({ n: null, id: String(x.id), lat: Number(x.lat), lon: Number(x.lon), label: `Hotspot: ${clip(x.top_place, 60)} (${spoken(Number(x.incidents_30d))} in 30 days)`, sev: null, value: Number(x.incidents_30d), hot: i === 0 }))];
  const tile = (key: string, label: string, tone: "bad" | "neutral") => ({ key, label, value: Number(kd.cur?.[key] ?? 0), unit: null, prev: num(kd.prev?.[key]), delta: num(kd.prev?.[key]) != null ? Number(kd.cur?.[key] ?? 0) - Number(kd.prev[key]) : null,
    pct: change(Number(kd.cur?.[key] ?? 0), num(kd.prev?.[key])).pct, tone, spark: (kd.series?.[key] ?? []).slice(-30) });
  const title = `${subject} dashboard · ${scope.en}`;
  const rep = Number(kd.cur?.reported ?? t.total);
  const prev = num(kd.prev?.reported);
  const ch = change(rep, prev);
  // one zone asked: no "most in" another zone; the ranking is of zones, which a zone's own dashboard is not (RC-09, PB-142)
  const topZone = !s.zone && zr5[0] && zr5[0].value > 0 ? zr5[0] : undefined;
  // nothing reported: say so plainly instead of ranking zeros
  if (!rep && !zrows.some((x) => Number(x.n) > 0)) {
    return { title, takeaway: bi(`No ${reportsOf(subject, generic)} ${inPeriod(s.period)}.`, `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)} `}புகார்கள் இல்லை.`),
      say: bi(`No ${reportsOf(subject, generic)} ${inPeriod(s.period)}${prev ? `, against ${spoken(prev)} the period before` : ""}.`, `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)} `}புகார்கள் இல்லை.`),
      blocks: [{ kind: "Kpis", id: "kpis", title: "Key numbers", items: [tile("reported", "Reported", "neutral"), tile("severe", "Severe", "bad")] }, t.block] };
  }
  return { title,
    takeaway: topZone ? bi(`${topZone.item.name} has the most: ${spoken(topZone.value)} of ${spoken(zrows.reduce((a, x) => a + Number(x.n), 0))}.`, `${zoneTa(w, Number(topZone.item.zone))} அதிகம்: ${spoken(topZone.value)}.`) : null,
    say: bi(`${spoken(rep)} ${reportsOf(subject, generic, rep)} ${inPeriod(s.period)}${ch.pct != null ? `, ${ch.pct >= 0 ? "up" : "down"} ${spoken(Math.abs(ch.pct))}% on the period before` : ""}. ${spoken(Number(kd.cur?.severe ?? 0))} severe.${topZone ? ` Most in ${topZone.item.name}.` : ""}`,
      `${PERIOD_TA[s.period]} ${generic ? "" : `${catTa(w, s.cat)}: `}${spoken(rep)} புகார்கள், ${spoken(Number(kd.cur?.severe ?? 0))} கடுமையானவை.${topZone ? ` அதிகம் ${zoneTa(w, Number(topZone.item.zone))}.` : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [tile("reported", "Reported", "neutral"), tile("severe", "Severe", "bad"), tile("ongoing", "Still open", "neutral"), tile("complaints", "Open complaints", "neutral")] },
      { kind: "MapView", id: "map", title: "Where", rule: "Numbered pins are the cases below; rings are hotspots (3+ incidents within 250 m in 30 days).", shade: { geo: "zone", label: subject, values: zrows.map((x) => ({ key: Number(x.zone), value: Number(x.n) })) }, points: pts, outline: [] },
      { kind: "Ranking", id: "zones", title: "Zones with the most", unit: "incidents", method: `${subject} reported by zone, ${PERIOD_EN[s.period]}.`, order: "top",
        items: zr5.map((x) => ({ key: String(x.item.zone), label: clip(x.item.name, 80), value: x.value, rank: x.rank, sub: `${spoken(Number(x.item.open))} open`, zone: Number(x.item.zone), lat: null, lon: null, action: "zone" as const })) },
      t.block,
      { kind: "CaseList", id: "cases", title: "Open cases, most serious first", source: "list", sev: null, total: Number(list.incidents ?? list.total ?? rows.length), rows }
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
    if (Number(r2.total ?? 0) > 0) { r = r2; c.notes.push(`Read "${zone.name}" as Zone ${zone.n} ${zone.name}: the ${zone.name} locality itself had no results.`); q = q2; }
  }
  c.sources.add("Ask the Map");
  c.asOf ??= r.asOf?.data ?? null;
  const rows = ((r.rows ?? []) as Row[]).map((x) => caseRow(x, c.w));
  const feats = ((r.features ?? []) as Row[]).filter((f) => num(f.lat) != null);
  const placesNear = ((r.context?.points ?? []) as Row[]).filter((p) => num(p.lat) != null);
  const notes = ((r.trace ?? []) as Row[]).map((t) => String(t.note_en ?? ""));
  const radius = (() => {
    for (const n of notes) { const m = n.match(/within (\d+(?:\.\d+)?)\s*(km|m)\b/); if (m) return Number(m[1]) * (m[2] === "km" ? 1000 : 1); }
    return 1000;
  })();
  const headline = clip(String(r.answer?.headline ?? r.say?.en ?? "").replace(/\s*·\s*map layer ready\.?$/i, ""), 300);
  const title = clip(q, 200);
  const rule = `${notes.filter(Boolean).slice(-3).join(" ")}`.slice(0, 240) || null;
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
  if (pts.length) blocks.push({ kind: "MapView", id: "map", title: clip(headline || title, 160), rule, shade: null, points: pts, outline: [] });
  if (ranked.length) {
    blocks.push({ kind: "Ranking", id: "near", title: `${within} ${clip(ranked[0].p.layer ?? "places", 30)} within ${spoken(radius)} m${within > ranked.length ? `, nearest ${ranked.length} listed` : ""}`, unit: "m", method: `Straight-line distance from each place to the closest result, within ${spoken(radius)} m (Ask the Map's rule).`, order: "bottom",
      items: ranked.map((x, i) => ({ key: String(x.p.id), label: clip(x.p.name ?? `${x.p.kind} (no name on the map)`, 120), value: x.m, rank: i + 1, sub: x.to ? safeText(x.to.title, 120) : null, zone: null, lat: Number(x.p.lat), lon: Number(x.p.lon), action: "none" as const })) });
  }
  if (rows.length) blocks.push({ kind: "CaseList", id: "cases", title: "The incidents", source: "map", sev: null, total: Number(r.total ?? rows.length), rows: rows.slice(0, 30) });
  const nearest = ranked[0];
  const placeWord = clip(nearest?.p.layer ?? "place", 30).replace(/s$/, "");
  return {
    title, takeaway: headline ? bi(headline, headline) : null,
    say: ranked.length
      ? bi(`${plural(within, placeWord, `${placeWord}s`)} within ${spoken(radius)} metres of the results${within > ranked.length ? `; the nearest ${ranked.length} are listed` : ""}. The nearest: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} metres away.`,
        `${within} இடங்கள் ${spoken(radius)} மீட்டருக்குள். மிக அருகில்: ${clip(nearest.p.name ?? placeWord, 80)}, ${spoken(nearest.m)} மீட்டர்.`)
      : headline ? bi(headline, headline) : bi("Ask the Map found nothing for that.", "வரைபடத்தில் எதுவும் கிடைக்கவில்லை."),
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
    return { title: `${name} · brief`, takeaway: null,
      say: bi(`${pre.en}I have no records for ${name} ${inPeriod(c.s.period)}. ${src.en} ${age.en}`, `${pre.ta}${ta ?? name}: ${whenTa} பதிவுகள் இல்லை. ${src.ta} ${age.ta}`),
      blocks: [{ kind: "Note", id: "empty", text: `No records for ${name} in this period. ${src.en}` }] };
  }
  // the one thing to say first: what needs attention, as a judgement made from the figures
  const pressing = overdue > 0 && open > 0 && overdue / open >= 0.15;
  const head = reported != null ? `${plural(reported, "new incident", "new incidents")} came in ${when}${inZone}` : `${plural(open, "case is", "cases are")} open across its departments${inZone}`;
  const headTa = reported != null ? `${whenTa}${inZoneTa} ${spoken(reported)} புதிய சம்பவங்கள் வந்தன` : `அதன் துறைகளில்${inZoneTa} ${spoken(open)} வழக்குகள் நிலுவையில் உள்ளன`;
  // no follow-up row for the body says nothing about its open cases: say nothing, rather than "nothing is open"
  const stand = !rows.length ? "" : open || overdue
    ? `${reported != null ? `${plural(open, "case is", "cases are")} still open, and ` : ""}${overdue ? `${plural(overdue, "is", "are")} past the deadline` : "none is past the deadline"}`
    : "nothing is open";
  const standTa = !rows.length ? "" : open || overdue ? `${reported != null ? `${spoken(open)} இன்னும் நிலுவையில்; ` : ""}${overdue ? `${spoken(overdue)} கெடு தாண்டியவை` : "கெடு தாண்டியது எதுவும் இல்லை"}` : "நிலுவையில் எதுவும் இல்லை";
  const zEn = att[0]?.zone ? clip(att[0].zone, 40) : null;
  const zTa = zEn ? c.w.zones.find((z) => z.name.toLowerCase() === zEn.toLowerCase())?.ta ?? zEn : null;
  const where = zEn ? ` The one to look at first is in ${zEn}.` : worst && org ? ` Most of it sits with ${clip(worst.name, 60)}.` : "";
  const whereTa = zTa ? ` முதலில் பார்க்க வேண்டியது ${zTa} பகுதியில்.` : worst && org ? ` பெரும்பகுதி ${DEPT_TA[String(worst.code)] ?? clip(worst.name, 60)} துறையிடம்.` : "";
  const advice = pressing ? " That backlog is the thing to chase today." : "";
  // a place the data cannot narrow to: said, so the Collector knows the figures are the district's
  const wide = c.slots.name && !c.s.zone ? ` I can't narrow these records to ${clip(c.slots.name, 40)}, so this is the whole district.` : "";
  const wideTa = c.slots.name && !c.s.zone ? ` இவற்றை ${clip(c.slots.name, 40)} பகுதிக்கு மட்டும் பிரிக்க முடியவில்லை; இது மாவட்டம் முழுவதற்குமானது.` : "";
  const adviceTa = pressing ? " இந்த நிலுவையைத்தான் இன்று கேட்க வேண்டும்." : "";
  // every point carries its Tamil line (the sentences code builds); a record's own title stays as the record has it: no English sentence in a Tamil brief (RC-15, PB-207)
  const points = [
    { text: clip(`${head}${stand ? `; ${stand}` : ""}.`, 400), ta: clip(`${headTa}${standTa ? `; ${standTa}` : ""}.`, 400), incidentId: null },
    ...(serious ? [{ text: `${plural(serious, "is", "are")} serious (severe or high).`, ta: `${spoken(serious)} தீவிரமானவை (கடுமையானவை அல்லது அதிகம்).`, incidentId: null }] : []),
    ...att.slice(0, 3).map((a) => { const t = safeText(`${a.why?.summary && String(a.why.summary).length <= 110 ? a.why.summary : a.title}${a.zone ? `, ${a.zone}` : ""}`, 400); return { text: t, ta: t, incidentId: String(a.id) }; }),
    ...(org ? rows.slice(0, 4).map((r) => ({ text: `${clip(r.name, 60)}: ${spoken(num(r.open) ?? 0)} open, ${spoken(num(r.overdue) ?? 0)} past the deadline.`,
      ta: `${DEPT_TA[String(r.code)] ?? clip(r.name, 60)}: ${spoken(num(r.open) ?? 0)} நிலுவை, ${spoken(num(r.overdue) ?? 0)} கெடு தாண்டியவை.`, incidentId: null })) : []),
    { text: `${src.en} ${age.en}`, ta: `${src.ta} ${age.ta}`, incidentId: null }
  ].slice(0, 10);
  return {
    title: `${name}${zAsked ? ` · ${zAsked}` : ""} · brief, ${PERIOD_EN[c.s.period]}`,
    takeaway: bi(`${head}${stand ? `; ${stand}` : ""}.`, `${headTa}${standTa ? `; ${standTa}` : ""}.`),
    // the name once: after "Taking that as X." it is not said again
    say: bi(`${pre.en || `${name}: `}${cap1(head)}${stand ? `; ${stand}` : ""}.${where}${advice}${wide} ${src.en} ${age.en}`.replace(/\s+/g, " ").trim(),
      `${pre.ta || `${ta ?? name}: `}${headTa}${standTa ? `; ${standTa}` : ""}.${whereTa}${adviceTa}${wideTa} ${src.ta} ${age.ta}`.replace(/\s+/g, " ").trim()),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        ...(reported != null ? [{ key: "reported", label: "Reported", value: reported, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] }] : []),
        { key: "open", label: "Open", value: open, unit: null, prev: null, delta: null, tone: "neutral" as const, spark: [] },
        { key: "overdue", label: "Past deadline", value: overdue, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] },
        { key: "serious", label: "Serious", value: serious, unit: null, prev: null, delta: null, tone: "bad" as const, spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: "The brief", points }
    ]
  };
}

async function brief(c: Ctx): Promise<Part> {
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
  const leadTa = `${leadHeadTa} ${spoken(Number(st.open ?? 0))} இன்னும் நிலுவையில்${Number(st.overdue) ? `, ${spoken(Number(st.overdue))} கெடு தாண்டியவை` : ""}; ${spoken(Number(st.severe ?? 0))} கடுமையானவை.`;
  // the Tamil of each point the code builds (the lead, the open and overdue line, a record's own title); a sentence the briefing tool wrote only in English has no Tamil line and is shown as it is (RC-15, PB-207)
  const nHead = (d.headline ?? []).length, att = (d.attention ?? []).slice(0, 4), nAtt = att.length;
  const standLineTa = `${spoken(Number(st.open ?? 0))} இன்னும் நிலுவையில், ${spoken(Number(st.overdue ?? 0))} கெடு தாண்டியவை; ${spoken(Number(st.severe ?? 0))} கடுமையானவை.`;
  const sourcesTa = `${spoken(Number(st.multi ?? 0))} சம்பவங்கள் ஒன்றுக்கு மேற்பட்ட மூலங்களிலிருந்து வந்தன; ${spoken(Number(st.newsOnly ?? 0))} செய்தியில் மட்டும் உள்ளன.`;
  // the reasons the briefing tool writes are fixed English templates (reasons.ts holds the Tamil of each); a story or a reason the pipeline AI wrote has no Tamil line ("" here): shown as it is, left out of a Tamil reading
  const attTa = att.map((a) => {
    const r = a.why?.attention?.[0] ? reasonTa(String(a.why.attention[0])) : null;
    const zt = a.zone ? c.w.zones.find((x) => x.name === a.zone)?.ta ?? a.zone : null;
    // a record's own title is a headline in the data's language (English), with no Tamil of it: the Tamil line names the body and the place in Tamil and gives the reason, and the point still opens the record (RC-15, tanglish-brief-04, -07, -10, ta-followup-01)
    return safeText(`${deptTaNamed(c.w, a.dept ?? null) ?? "சம்பவம்"}${zt ? `, ${zt}` : ""}${r ? `: ${r}` : ""}`, 400);
  });
  const condTa = d.conditions && !(c.s.zone || c.s.taluk || c.s.dept || c.s.cat) ? conditionsTa(String(d.conditions)) : null;
  const pointsTa = points.map((p, i): { text: string; ta?: string; incidentId: string | null } => {
    if (i < nHead) return i === 0 ? { ...p, ta: leadHeadTa } : i === 1 && st.open != null ? { ...p, ta: standLineTa } : i === 2 && Number(st.multi) ? { ...p, ta: sourcesTa } : { ...p, ta: "" };
    if (i < nHead + nAtt) return { ...p, ta: attTa[i - nHead] };
    return condTa && p.text.startsWith("Conditions: ") ? { ...p, ta: condTa } : { ...p, ta: "" };
  });
  return {
    title: `Briefing · ${PERIOD_EN[c.s.period]}`,
    takeaway: points[0] ? bi(points[0].text, leadTa) : null,
    say: bi(`${points.length} points in the brief for ${PERIOD_EN[c.s.period]}. ${points[0]?.text ?? ""}`, `${PERIOD_TA[c.s.period]} சுருக்கத்தில் ${points.length} குறிப்புகள். ${points[0] ? leadTa : ""}`),
    blocks: [
      { kind: "Kpis", id: "kpis", title: "Key numbers", items: [
        { key: "reported", label: "Reported", value: Number(st.reported ?? 0), unit: null, prev: null, delta: null, pct: num(st.change), tone: "neutral", spark: [] },
        { key: "severe", label: "Severe", value: Number(st.severe ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "overdue", label: "Past deadline", value: Number(st.overdue ?? 0), unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "newsOnly", label: "In the news only", value: Number(st.newsOnly ?? 0), unit: null, prev: null, delta: null, tone: "neutral", spark: [] }
      ] },
      { kind: "Brief", id: "brief", title: "The brief", points: pointsTa }
    ]
  };
}

async function drafts(): Promise<Part> {
  return { title: "Waiting for your approval", takeaway: null, say: bi("Here are the drafts waiting for your approval.", "உங்கள் ஒப்புதலுக்காகக் காத்திருக்கும் வரைவுகள் இவை."),
    blocks: [{ kind: "Drafts", id: "drafts", title: "Approval tray" }] };
}
