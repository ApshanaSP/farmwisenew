/**
 * Where news reports of the same event disagree: one outlet says 2 died, another 3; a filmmaker "dies at 94" in one
 * report and "at 95" in another; the place or the cause differs. The Collector should not quote a figure that the
 * outlets themselves do not agree on, so the console says exactly what differs, between which outlets, the likely
 * reason, and whom to confirm it with.
 *
 * Precision first: a story on "Latest news" often joins reports of two incidents (two toxic-gas deaths in Kodungaiyur on
 * Monday, one in Pallikaranai on Wednesday), or a protest and the next day's "fresh spell". Their figures differ because
 * they are different events, not because the outlets disagree. So:
 *
 *   1. AI (when a model answers): the reports side by side (headline, summary, the start of the text, the places the
 *      pipeline found), asked first which reports describe the SAME incident, then for facts those reports state
 *      differently. Each claim must come from one of those reports and is checked against its text (a number it does not
 *      contain drops the claim); a difference left with fewer than two outlets is dropped. The model also says in one
 *      sentence what differs and the likely reason. When the model has read a story, its answer replaces the rules'.
 *   2. Rules (no model): explicit counts in each report's headline and summary (dead, injured, arrested, age), English and
 *      Tamil, compared only between reports of the same day (30 hours), in the same place (when both name one), with
 *      exact figures ("over 100" is not a count), never a date ("May 17 Movement") and never a follow-up report ("fresh",
 *      "another", "two more"). A count that only rises over the hours is the story developing, not a disagreement.
 *
 * Results are reused until the reports change (aibrief.aiJson keys on the facts; a memo per period here).
 */
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { aiJson } from "@/lib/collector/aibrief";
import { when } from "@/lib/collector/analysis";
import { newsStories, type Period } from "@/lib/collector/intel";
import { isNewsMedia } from "@/lib/collector/newsrel";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

export interface Claim { docId: string; publisher: string; t: string; says: string }
export interface Difference {
  /** what differs: "Deaths", "Age", "Place"... */
  field: string;
  /** only disagreements are reported; a figure that changed as the story developed is left out */
  kind: "conflict";
  claims: Claim[];
  /** one sentence: exactly what differs, between which outlets */
  what: string;
  /** the likely reason, from the reports alone (null when there is no clue) */
  reason: string | null;
  /** who can confirm it */
  check: string | null;
  by: "rules" | "ai";
}
export interface StoryConflicts { id: string; title: string; incident: string | null; docIds: string[]; outlets: number; items: Difference[] }

/** One report as the checks read it. */
export interface Report {
  id: string; publisher: string; t: string; head: string; original: string | null; summary: string; lead: string; lang: string | null;
  /** the places the pipeline found in it (localities, not "Chennai") */
  places?: string[];
}

// ------------------------------------------------------------- numbers --

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, a: 1, an: 1, single: 1, dozen: 12,
  // Tamil: "இருவர்" two persons, "மூவர்" three...
  "இருவர்": 2, "மூவர்": 3, "நால்வர்": 4, "ஐவர்": 5
};
// a number right after a month name is a date ("May 17 Movement", "Oct 12"), never a count
const MONTH = "(?<!\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s)";
const NUM = `${MONTH}\\b(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;
const val = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()] ?? NaN);

/** Every number a text states, in digits or words ("two" -> 2). */
export function numbersOf(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.match(/\d+(?:[.,]\d+)*/g) ?? []) out.add(Number(m.replace(/,/g, "")));
  for (const m of text.toLowerCase().match(/[a-z]+|இருவர்|மூவர்|நால்வர்|ஐவர்/g) ?? []) if (WORDS[m] != null && m !== "a" && m !== "an") out.add(WORDS[m]);
  return out;
}

// ---------------------------------------------------------------- rules --

const W = "(?:[a-z'-]+\\s+){0,3}?";
const SLOTS: { field: string; noun: string; check: string; res: RegExp[] }[] = [
  { field: "Deaths", noun: "death tolls", check: "Confirm the toll with the police or the hospital before quoting it.", res: [
    new RegExp(`${NUM}\\s+${W}(?:killed|dead|die|dies|died|drown(?:ed|s)?|charred|electrocuted|succumb(?:ed|s)?|perish(?:ed|es)?|lose\\s+lives|lost\\s+(?:their\\s+)?lives|bodies)\\b`, "gi"),
    new RegExp(`\\b(?:kills?|claims?|death toll(?:\\s+(?:rises|climbs|goes up))?(?:\\s+to)?)\\s+${NUM}\\b(?!\\s*(?:years?|crore|lakh|%))`, "gi"),
    /(\d{1,3})\s*(?:பேர்\s*)?(?:பலி|உயிரிழப்பு|உயிரிழந்தனர்|சாவு)/g,
    /(இருவர்|மூவர்|நால்வர்|ஐவர்)\s*(?:பலி|உயிரிழப்பு|உயிரிழந்தனர்|சாவு)/g
  ] },
  { field: "Injured", noun: "numbers of injured", check: "Confirm the number of injured with the hospital.", res: [
    new RegExp(`${NUM}\\s+${W}(?:injured|hurt|wounded|hospitali[sz]ed)\\b`, "gi"),
    new RegExp(`\\binjur(?:es|ing)\\s+${NUM}\\b`, "gi"),
    /(\d{1,3})\s*(?:பேர்\s*)?(?:படுகாயம்|காயம்)/g
  ] },
  { field: "Arrests", noun: "numbers arrested", check: "Confirm the arrests with the police station handling the case.", res: [
    new RegExp(`${NUM}\\s+(?!more\\b)${W}(?:arrested|held|nabbed|detained|apprehended)\\b`, "gi"),
    new RegExp(`\\b(?:arrests?|nabs?|holds?|detains?)\\s+${NUM}\\b(?!\\s+more)`, "gi"),
    /(\d{1,3})\s*பேர்\s*கைது/g
  ] },
  { field: "Age", noun: "ages", check: "The outlets give different ages; check the official record before quoting one.", res: [
    /\b(?:dies|died|passes away|passed away|dead)\s+at\s+(\d{2,3})\b/gi,
    /\baged?\s+(\d{1,3})\b/gi
  ] }
];
/** "over 100", "more than 40", "nearly 500", "300க்கும் மேற்பட்டோர்": an estimate, not a figure to compare. */
const APPROX = /\b(?:over|more than|nearly|about|around|almost|at least|close to|upto|up to|some|several|hundreds|dozens)\s+$|மேற்பட்ட|சுமார்/i;
/** A follow-up of the event, not the same report of it: "fresh protests", "another death", "two more arrested", "day 2". */
/** A claim that gives only an estimate ("Over 100 detained"): two estimates, or an estimate and a figure, do not disagree. */
const ESTIMATE = /\b(?:over|more than|nearly|about|around|almost|at least|close to|upto|up to|some|several|hundreds|dozens)\s+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)|\d+\s*\+|மேற்பட்ட|சுமார்/i;
const FOLLOW_UP = /\b(?:fresh|another|again|second|third|yet more|more held|more arrested|continues?|continuing|day \d|days? after|toll rises|rises to)\b|மேலும்|மீண்டும்|மற்றொரு|தொடரும்/i;

/** The counts a report states, by field: from its headline (English and as published) and summary. */
export function claimsOf(r: Report): Map<string, { v: number; says: string }> {
  const text = [r.head, r.original ?? "", r.summary].join(" . ");
  const out = new Map<string, { v: number; says: string }>();
  for (const s of SLOTS) {
    const vals = new Map<number, string>();
    let approx = false;
    for (const re of s.res) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const v = val(m[1]);
        if (!(v > 0 && v < 500)) continue;
        // "over 100 detained", "300க்கும் மேற்பட்டோர் கைது": an estimate
        if (APPROX.test(text.slice(Math.max(0, m.index! - 16), m.index!)) || APPROX.test(m[0])) { approx = true; continue; }
        vals.set(v, m[0].trim());
      }
    }
    // a report stating two different counts for one field (two incidents in one report), or an estimate, is not used
    if (vals.size === 1 && !approx) {
      const [[v, says]] = [...vals.entries()];
      out.set(s.field, { v, says });
    }
  }
  return out;
}

const hours = (a: string, b: string) => Math.abs(Date.parse(a.replace(" ", "T")) - Date.parse(b.replace(" ", "T"))) / 3.6e6;
const GENERIC_PLACE = /^(chennai|tamil ?nadu|india|city|greater chennai)$/i;
const placeSet = (r: Report) => new Set((r.places ?? []).map((p) => p.trim().toLowerCase()).filter((p) => p && !GENERIC_PLACE.test(p)));
/** Two reports can be of the same incident: same day, and the same place when both name one. */
export function sameIncident(a: Report, b: Report): boolean {
  if (hours(a.t, b.t) > 30) return false;
  const pa = placeSet(a), pb = placeSet(b);
  if (!pa.size || !pb.size) return true;
  for (const p of pa) if (pb.has(p)) return true;
  return false;
}

/**
 * Counts the outlets state differently for the same incident. One claim per outlet; only reports of the same day and
 * place are compared, and a count that only rises over the hours is the story developing (left out).
 */
export function ruleDifferences(reports: Report[]): Difference[] {
  const out: Difference[] = [];
  const usable = [...reports].filter((r) => !FOLLOW_UP.test(`${r.head} ${r.original ?? ""}`)).sort((a, b) => a.t.localeCompare(b.t));
  const claims = usable.map((r) => ({ r, c: claimsOf(r) }));
  for (const s of SLOTS) {
    const byOutlet = new Map<string, { r: Report; v: number; says: string }>();
    for (const { r, c } of claims) {
      const x = c.get(s.field);
      if (x) byOutlet.set(r.publisher, { r, ...x });
    }
    const list = [...byOutlet.values()];
    // pairs that really disagree: other outlets, other figures, the same incident, and not a later, higher count
    const keep = new Set<(typeof list)[number]>();
    let gap = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]].sort((x, y) => x.r.t.localeCompare(y.r.t));
      if (a.v === b.v || !sameIncident(a.r, b.r)) continue;
      if (s.field !== "Age" && b.v > a.v && hours(a.r.t, b.r.t) >= 4) continue; // the toll rose as the story developed
      keep.add(a); keep.add(b);
      gap = Math.max(gap, hours(a.r.t, b.r.t));
    }
    if (keep.size < 2) continue;
    const cl = [...keep].sort((a, b) => a.r.t.localeCompare(b.r.t));
    out.push({
      field: s.field, kind: "conflict", by: "rules", check: s.check,
      what: `The outlets give different ${s.noun}: ${cl.map((x) => `${x.v} (${x.r.publisher})`).join(", ")}.`,
      reason: gap >= 6 ? `The reports are ${Math.round(gap)} hours apart; the later one may carry a corrected figure.` : null,
      claims: cl.map((x) => ({ docId: x.r.id, publisher: x.r.publisher, t: x.r.t, says: x.says }))
    });
  }
  return out;
}

// ------------------------------------------------------------------- AI --

const Schema = z.object({
  stories: z.array(z.object({
    story: z.number(),
    same: z.array(z.number()).describe("the R numbers of the reports about the story's main incident (same incident, same place, same occasion)"),
    differences: z.array(z.object({
      field: z.string().describe("what differs, 1 to 3 words: Deaths, Injured, Arrests, Age, Place, Date or time, Cause, Names, Amount, Outcome"),
      kind: z.enum(["conflict", "update"]).describe("conflict: the reports state the same fact differently; update: a later report changed it as the story developed"),
      claims: z.array(z.object({
        r: z.number().describe("the R number of the report"),
        says: z.string().describe("what that report states, at most 10 words, with its figure exactly as written")
      })).describe("one claim per report that states this fact, at least two"),
      what: z.string().describe("one sentence, at most 28 words: exactly what differs, naming the outlets and what each says"),
      reason: z.string().describe("the likely reason, only if the reports show it (one is hours later, one counts a person still in hospital), at most 18 words; else empty"),
      check: z.string().describe("who can confirm the fact, and what to confirm, at most 16 words")
    })).describe("empty when the reports of the main incident agree")
  }))
});
const SYSTEM = `You check news coverage for the office of the District Collector of Chennai. Each story below is a group of reports
(R1, R2... oldest first) that an automatic grouping believes are about one event. The grouping is sometimes wrong.
Step 1, "same": list the reports that describe the story's MAIN incident: the same occurrence, at the same place, on the same
occasion. Leave out reports about a different incident of the same kind (a gas leak in another locality, a death on another day),
a follow-up event (a protest by the relatives, a fresh round of protests the next day, a court hearing), or a different group
of people. When the places differ, they are different incidents.
Step 2, "differences": among the "same" reports only, the facts they state DIFFERENTLY: numbers (dead, injured, arrested, age,
money, count of anything), the place, the date or time, the cause, the names of the people, and the outcome.
Not a difference: one report giving a detail another leaves out; the same fact in other words or another language; an estimate
and a figure ("over 100" and "102"); two different facts (the day of the attack and the day of the arrest). If a later report
changes a figure as the story develops (more arrests the next day, a toll that rises), that is kind "update"; reports that state
the same fact differently are kind "conflict".
For each difference: the field, the kind, one claim per report (its R number and what it says, with the figure exactly as the
report writes it), "what": one plain sentence naming the outlets and what each says, "reason": the likely reason only when the
reports show it, else empty, and who can confirm it (police, hospital, the Corporation, the department). Use only the reports.
Most stories have no difference: then give an empty list. Translate Tamil into English. Plain formal English, no markdown.`;

const lead = (r: Report) => r.lead.replace(/\s+/g, " ").slice(0, 480);
const reportLine = (r: Report, k: number) =>
  `  R${k + 1} | ${when(r.t)} | ${r.publisher}${placeSet(r).size ? ` | places: ${[...placeSet(r)].join(", ")}` : ""} | ${r.head}` +
  `${r.original ? ` (as published: ${r.original})` : ""}` +
  `${r.summary && r.summary !== r.head ? ` | summary: ${r.summary.slice(0, 240)}` : ""}${lead(r) ? ` | text: ${lead(r)}` : ""}`;
/** What the AI read of a report: its claims must be in here. */
const readText = (r: Report) => [r.head, r.original ?? "", r.summary.slice(0, 240), lead(r)].join(" ");

const STOP = new Set(["the", "and", "that", "with", "from", "this", "says", "said", "report", "reports", "were", "was", "has", "have", "their", "they", "for"]);
/** A claim must be in its report: its numbers among the report's numbers, and (for an English report) one of its words. */
export function claimHolds(says: string, r: Report): boolean {
  const text = readText(r);
  const have = numbersOf(text);
  for (const n of numbersOf(says)) if (!have.has(n)) return false;
  if (r.lang && r.lang !== "en") return true; // the claim is a translation
  const words = says.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP.has(w)) ?? [];
  const low = text.toLowerCase();
  return !words.length || words.some((w) => low.includes(w.slice(0, Math.max(4, w.length - 2))));
}

const figures = (s: string) => [...numbersOf(s)].sort((a, b) => a - b).join(",");
/** The words a claim about a count must use (English or Tamil): the field name -> its verbs. */
const COUNT_WORDS: [RegExp, RegExp][] = [
  [/arrest|detain|held|custody/i, /arrest|held|hold|detain|nab|apprehend|custody|caught|கைது|பிடி/i],
  [/death|dead|toll|killed|casualt/i, /dead|die|death|kill|toll|bod(?:y|ies)|lives|life|drown|charred|perish|succumb|பலி|உயிர|சாவு|மரண/i],
  [/injur|hurt|wound/i, /injur|hurt|wound|hospitali|காய/i]
];
const COMMON = new Set(["The", "This", "That", "Police", "On", "In", "At", "A", "An", "He", "She", "They", "His", "Her", "Over", "About", "Around", "More", "Than"]);
const names = (s: string) => (s.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).filter((w) => !COMMON.has(w)).sort().join(",");
/**
 * The claims of a difference that really differ, or null: two outlets must state the fact with different figures (a
 * claim with no figure says nothing about a count), or, for a fact in words (a name, a place), with different names.
 * "his friend Sathyabharathi" and "his 19-year-old friend, Sathyabharathi" are the same.
 */
export function distinct(claims: Claim[], field = ""): Claim[] | null {
  const numeric = claims.some((c) => numbersOf(c.says).size > 0);
  // a count must be a count of the field: "500 staged a protest" is not a number of arrests
  const own = COUNT_WORDS.find(([re]) => re.test(field))?.[1];
  const cl = (numeric ? claims.filter((c) => numbersOf(c.says).size > 0 && !ESTIMATE.test(c.says)) : claims).filter((c) => !own || own.test(c.says));
  if (new Set(cl.map((c) => c.publisher)).size < 2) return null;
  if (new Set(cl.map(numeric ? (c: Claim) => figures(c.says) : (c: Claim) => names(c.says) || c.says.toLowerCase())).size < 2) return null;
  return cl;
}

interface Input { key: string; title: string; reports: Report[] }

/** The model's differences per story key (an empty list: it read the story and the reports agree); null when no model answered. */
async function aiDifferences(stories: Input[], user: string): Promise<Map<string, Difference[]> | null> {
  const out = new Map<string, Difference[]>();
  let answered = 0;
  // one small call at a time: the free tiers allow few tokens a minute, and a refused call costs a retry
  for (let k = 0; k < stories.length; k += 3) {
    const chunk = stories.slice(k, k + 3);
    const facts = chunk.map((s, j) => [`STORY ${j + 1}: ${s.title}`, ...s.reports.map(reportLine)].join("\n")).join("\n\n");
    const r = await aiJson({ kind: "news-conflicts3", system: SYSTEM, facts, schema: Schema, user, temperature: 0, maxOutputTokens: 1400,
      // claims are checked per report below; the free text must not bring numbers of its own
      text: (o) => o.stories.flatMap((x) => x.differences.flatMap((d) => [d.what, d.reason, d.check])).join(" ") });
    if (!r) { if (!answered) return null; break; }
    answered++;
    chunk.forEach((s) => out.set(s.key, []));
    for (const x of r.o.stories) {
      const s = chunk[x.story - 1];
      if (!s) continue;
      const same = new Set(x.same.filter((n) => s.reports[n - 1]));
      const diffs: Difference[] = [];
      for (const d of x.differences) {
        if (d.kind !== "conflict") continue;
        const claims = d.claims.map((c) => ({ c, rep: s.reports[c.r - 1] }))
          // a claim from a report of another incident is no disagreement
          // nor is one from a follow-up report ("fresh spell of protests", "two more held")
          .filter(({ c, rep }) => rep && same.has(c.r) && c.says.trim() && !FOLLOW_UP.test(`${rep.head} ${rep.original ?? ""}`) && claimHolds(c.says, rep))
          .map(({ c, rep }) => ({ docId: rep.id, publisher: rep.publisher, t: rep.t, says: c.says.trim().replace(/\.$/, "") }))
          .filter((c, j, all) => all.findIndex((y) => y.docId === c.docId) === j)
          .sort((a, b) => a.t.localeCompare(b.t));
        const kept = distinct(claims, d.field);
        if (!kept) continue;
        const field = tidyField(d.field);
        diffs.push({ field, kind: "conflict", claims: kept, by: "ai", check: d.check.trim() || null,
          what: d.what.trim() || `${kept.map((c) => `${c.publisher}: ${c.says}`).join("; ")}.`, reason: d.reason.trim() || null });
      }
      out.set(s.key, diffs);
    }
  }
  return answered ? out : null;
}

const FIELD_ALIAS: Record<string, string> = { dead: "Deaths", death: "Deaths", deaths: "Deaths", "death toll": "Deaths", toll: "Deaths", casualties: "Deaths",
  injuries: "Injured", injured: "Injured", arrest: "Arrests", arrests: "Arrests", arrested: "Arrests", age: "Age", location: "Place", place: "Place" };
const tidyField = (f: string) => FIELD_ALIAS[f.trim().toLowerCase()] ?? f.trim().replace(/^./, (x) => x.toUpperCase());

// --------------------------------------------------------------- stories --

const NEWS_COLS = `d.doc_id AS id, d.title, d.title_en, d.lang, d.publisher, d.publisher_domain, d.publisher_tier, d.summary,
  SUBSTR(d.body, 1, 900) AS body, d.places, d.place_text, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t`;

async function reportsOf(ids: string[]): Promise<Map<string, Report>> {
  const out = new Map<string, Report>();
  const want = [...new Set(ids)];
  for (let k = 0; k < want.length; k += 400) {
    const rows = await q(`SELECT ${NEWS_COLS} FROM documents d WHERE d.doc_id IN (?)`, [want.slice(k, k + 400)]);
    for (const r of rows) {
      if (!r.title || !isNewsMedia(r.publisher, r.publisher_domain, r.publisher_tier)) continue;
      const ta = r.lang && r.lang !== "en";
      const places = String(r.places ?? "").split("|").map((x) => x.trim()).filter(Boolean);
      if (!places.length && r.place_text) places.push(String(r.place_text));
      out.set(String(r.id), {
        id: String(r.id), publisher: String(r.publisher ?? "News"), t: String(r.t), lang: r.lang ?? null,
        head: String((ta && r.title_en) || r.title).replace(/\s+/g, " ").trim(), original: ta ? String(r.title) : null,
        summary: String(r.summary ?? "").replace(/\s+/g, " ").trim(), lead: String(r.body ?? ""), places
      });
    }
  }
  return out;
}

/** At most 6 reports of a story for the checks: one per outlet (its latest), oldest first. */
function pick(reports: Report[]): Report[] {
  const seen = new Map<string, Report>();
  for (const r of [...reports].sort((a, b) => b.t.localeCompare(a.t))) if (!seen.has(r.publisher)) seen.set(r.publisher, r);
  return [...seen.values()].slice(0, 6).sort((a, b) => a.t.localeCompare(b.t));
}
/** Could two outlets in this story be reporting the same incident at all (same day, same place)? Else nothing to compare. */
const comparable = (reps: Report[]) => reps.some((a, i) => reps.some((b, j) => j > i && a.publisher !== b.publisher && sameIncident(a, b)));

/** The model's reading when it read the story (it saw which reports are the same incident), else the rules'. */
const combine = (rules: Difference[], ai: Difference[] | undefined) => ai ?? rules;

/** The differences between the reports of one story (the news preview and the incident pop-up). */
export async function storyConflicts(ids: string[], title: string, user: string, id?: string): Promise<StoryConflicts | null> {
  const reps = pick([...(await reportsOf(ids.slice(0, 60))).values()]);
  if (new Set(reps.map((r) => r.publisher)).size < 2 || !comparable(reps)) return null;
  const key = id ?? reps[0].id;
  const ai = await aiDifferences([{ key, title, reports: reps }], user);
  return { id: key, title, incident: null, docIds: ids, outlets: new Set(reps.map((r) => r.publisher)).size, items: combine(ruleDifferences(reps), ai?.get(key)) };
}

const V = 5;
const AI_STORIES = 12;
declare global {
  // eslint-disable-next-line no-var
  var __conflicts: Map<string, { at: number; v: PeriodConflicts }> | undefined;
}
export interface PeriodConflicts { stories: StoryConflicts[]; checked: number; ai: boolean }

/** Every story of the period's news (2+ outlets) whose reports of the same incident disagree, most outlets first. */
export async function periodConflicts(period: Period, now: string, user: string): Promise<PeriodConflicts> {
  const all = (await newsStories(period, now)).filter((s) => s.outletNames.length >= 2);
  const memoKey = `${V}|${period}|${all.map((s) => `${s.id}:${s.docIds.length}`).join(",")}`;
  const memo = (global.__conflicts ??= new Map()).get(memoKey);
  if (memo && Date.now() - memo.at < 30 * 60_000) return memo.v;

  const reps = await reportsOf(all.flatMap((s) => s.docIds.slice(0, 40)));
  const inputs = all.map((s) => ({ s, key: s.id, title: s.title, reports: pick(s.docIds.map((d) => reps.get(d)).filter((r): r is Report => !!r)) }))
    .filter((x) => new Set(x.reports.map((r) => r.publisher)).size >= 2 && comparable(x.reports))
    .map((x) => ({ ...x, rules: ruleDifferences(x.reports) }))
    // the model reads first the stories where the figures already differ, then those with the most outlets
    .sort((a, b) => Number(b.rules.length > 0) - Number(a.rules.length > 0) || b.reports.length - a.reports.length || b.s.t.localeCompare(a.s.t));
  const ai = inputs.length ? await aiDifferences(inputs.slice(0, AI_STORIES), user) : null;
  const stories = inputs.map(({ s, key, title, reports, rules }) => ({
    id: key, title, incident: s.incident, docIds: s.docIds, outlets: new Set(reports.map((r) => r.publisher)).size,
    items: combine(rules, ai?.get(key))
  })).filter((x) => x.items.length).sort((a, b) => b.items.length - a.items.length || b.outlets - a.outlets);
  const v: PeriodConflicts = { stories, checked: inputs.length, ai: !!ai };
  // without a model, try again in 5 minutes rather than 30
  global.__conflicts.set(memoKey, { at: ai ? Date.now() : Date.now() - 25 * 60_000, v });
  while (global.__conflicts.size > 12) global.__conflicts.delete(global.__conflicts.keys().next().value!);
  return v;
}
