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
 * One list, that stays (26 Nov 2026): what the checks find is written into the day's book (differbook.ts) and listed from there until its reports
 * leave the window, so a regrouped story, a new build, an article that joins, or a model that is busy or answers otherwise takes nothing away. The
 * Differ tab, the news badge, the incident pop-up and the assistants all read periodConflicts() / storyConflicts(). A model's verdict on a set of
 * reports is kept by what the reports say (their text), so the same text is never judged twice, and is reused when no model answers; the rules'
 * answer is never kept as the verdict: it stands in until a model has read the story.
 */
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { aiJson } from "@/lib/collector/aibrief";
import { when } from "@/lib/collector/analysis";
import { aiStatus } from "@/lib/ai/gateway";
import { newsStories, periodSince, type Period } from "@/lib/collector/intel";
import { about, bookVersion, found, listed, reportKey, settle, shown, textHash, type BookItem, type Holds } from "@/lib/collector/differbook";
import { dataVersion } from "@/lib/collector/datakey";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { dayKey } from "@/lib/period/day";
import { isNewsMedia } from "@/lib/collector/newsrel";
import { promises as fsp, readFileSync } from "node:fs";
import path from "node:path";

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
  /** the reports have come to say the same, or one was withdrawn: "resolved at 2:20 PM: the reports now agree" (the difference stays on the list, with this on it) */
  resolved?: string | null;
}
export interface StoryConflicts { id: string; title: string; incident: string | null; docIds: string[]; outlets: number; items: Difference[] }

/** One report as the checks read it. */
export interface Report {
  id: string; publisher: string; t: string; head: string; original: string | null; summary: string; lead: string; lang: string | null;
  /** the places the pipeline found in it (localities, not "Chennai") */
  places?: string[];
  url?: string | null;
  /** the incident it is linked to in this build */
  incident?: string | null;
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
/** "1 December" and "1 December 2026", four officials named and three of them: one says more than the other, they do not disagree */
const within = (a: string, b: string) => { const A = a.split(",").filter(Boolean), B = new Set(b.split(",").filter(Boolean)); return A.length > 0 && A.every((x) => B.has(x)); };
/**
 * The claims of a difference that really differ, or null: two outlets must state the fact with different figures (a
 * claim with no figure says nothing about a count), or, for a fact in words (a name, a place), with different names.
 * "his friend Sathyabharathi" and "his 19-year-old friend, Sathyabharathi" are the same; so are a date and the same date
 * with its year (one outlet says more; a figure or a name the other leaves out is no disagreement).
 */
export function distinct(claims: Claim[], field = ""): Claim[] | null {
  const numeric = claims.some((c) => numbersOf(c.says).size > 0);
  // a count must be a count of the field: "500 staged a protest" is not a number of arrests
  const own = COUNT_WORDS.find(([re]) => re.test(field))?.[1];
  const cl = (numeric ? claims.filter((c) => numbersOf(c.says).size > 0 && !ESTIMATE.test(c.says)) : claims).filter((c) => !own || own.test(c.says));
  if (new Set(cl.map((c) => c.publisher)).size < 2) return null;
  const bag = numeric ? (c: Claim) => figures(c.says) : (c: Claim) => names(c.says);
  const apart = (a: Claim, b: Claim) => {
    const x = bag(a), y = bag(b);
    if (!numeric && (!x || !y)) return (x || a.says.toLowerCase()) !== (y || b.says.toLowerCase());
    return !within(x, y) && !within(y, x);
  };
  if (!cl.some((a, i) => cl.some((b, j) => j > i && a.publisher !== b.publisher && apart(a, b)))) return null;
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

const NEWS_COLS = `d.doc_id AS id, d.title, d.title_en, d.lang, d.publisher, d.publisher_domain, d.publisher_tier, d.summary, d.url, d.linked_incident_id AS incident,
  SUBSTR(d.body, 1, 900) AS body, d.places, d.place_text, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t`;

function reportOf(r: Row, anyOutlet = false): Report | null {
  if (!r.title || (!anyOutlet && !isNewsMedia(r.publisher, r.publisher_domain, r.publisher_tier))) return null;
  const ta = r.lang && r.lang !== "en";
  const places = String(r.places ?? "").split("|").map((x) => x.trim()).filter(Boolean);
  if (!places.length && r.place_text) places.push(String(r.place_text));
  return {
    id: String(r.id), publisher: String(r.publisher ?? "News"), t: String(r.t), lang: r.lang ?? null,
    head: String((ta && r.title_en) || r.title).replace(/\s+/g, " ").trim(), original: ta ? String(r.title) : null,
    summary: String(r.summary ?? "").replace(/\s+/g, " ").trim(), lead: String(r.body ?? ""), places, url: r.url ? String(r.url) : null, incident: r.incident ? String(r.incident) : null
  };
}
async function reportsOf(ids: string[]): Promise<Map<string, Report>> {
  const out = new Map<string, Report>();
  const want = [...new Set(ids)];
  for (let k = 0; k < want.length; k += 400) {
    for (const r of await q(`SELECT ${NEWS_COLS} FROM documents d WHERE d.doc_id IN (?)`, [want.slice(k, k + 400)])) {
      const x = reportOf(r);
      if (x) out.set(x.id, x);
    }
  }
  return out;
}
/** The reports behind the book's entries as this build has them, by their address, else by their id (a build may have given them other ids). */
async function reportsBehind(items: BookItem[]): Promise<Map<string, Report>> {
  const ids = [...new Set(items.flatMap((x) => x.reports.map((r) => r.id)))], urls = [...new Set(items.flatMap((x) => x.reports.map((r) => r.url).filter((u): u is string => !!u)))];
  const out = new Map<string, Report>();
  for (let k = 0; k < Math.max(ids.length, urls.length); k += 300) {
    const a = ids.slice(k, k + 300), b = urls.slice(k, k + 300);
    for (const r of await q(`SELECT ${NEWS_COLS} FROM documents d WHERE ${a.length ? "d.doc_id IN (?)" : "1 = 0"} OR ${b.length ? "d.url IN (?)" : "1 = 0"} ORDER BY d.doc_id`, [...(a.length ? [a] : []), ...(b.length ? [b] : [])])) {
      // (a report already in the book is there whatever this build calls its outlet)
      const x = reportOf(r, true);
      if (!x) continue;
      for (const key of [reportKey(x.url, x.id), `id:${x.id}`]) if (!out.has(key)) out.set(key, x);
    }
  }
  return out;
}

/** At most 6 reports of a story for the checks: one per outlet (its latest), oldest first. */
function pick(reports: Report[]): Report[] {
  const seen = new Map<string, Report>();
  for (const r of [...reports].sort((a, b) => b.t.localeCompare(a.t) || a.id.localeCompare(b.id))) if (!seen.has(r.publisher)) seen.set(r.publisher, r);
  return [...seen.values()].slice(0, 6).sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id));
}
/** Could two outlets in this story be reporting the same incident at all (same day, same place)? Else nothing to compare. */
const comparable = (reps: Report[]) => reps.some((a, i) => reps.some((b, j) => j > i && a.publisher !== b.publisher && sameIncident(a, b)));

// ------------------------------------------------------------ verdicts --
// 23 Nov 2026: one verdict per set of reports, kept, so the same reports always give the same answer. 26 Nov, what still changed it: the set's
// key was its ids and the story's lead report, which a new build, or one more article, draws again; the rules' answer was kept as the verdict when
// the model did not answer (and for every story past the twelve it reads at a time), so it was never asked again. Now a verdict is the model's
// only, kept by what the reports say (textHash), and what it found is in the day's book, which no later verdict empties.
interface Verdict { at: number; items: { d: Difference; /** each claim's report, by its text */ h: string[] }[] }
declare global {
  // eslint-disable-next-line no-var
  var __conflictVerdicts: Map<string, Verdict> | undefined;
  // eslint-disable-next-line no-var
  var __conflictVerdictsSave: ReturnType<typeof setTimeout> | null | undefined;
  // eslint-disable-next-line no-var
  var __conflictRest: number | undefined;
}
const VERDICT_FILE = () => path.join(process.env.DIQ_DATA_DIR ?? path.join(process.cwd(), "data"), "news-verdicts.json");
const VERDICT_DAYS = 14;
function verdicts(): Map<string, Verdict> {
  if (global.__conflictVerdicts) return global.__conflictVerdicts;
  const m = new Map<string, Verdict>();
  try {
    const j = process.env.VITEST ? null : (JSON.parse(readFileSync(VERDICT_FILE(), "utf8")) as { v?: number; rows?: [string, Verdict][] });
    const since = Date.now() - VERDICT_DAYS * 864e5;
    if (j?.v === V) for (const [k, x] of j.rows ?? []) if (x && x.at >= since && Array.isArray(x.items)) m.set(k, x);
  } catch { /* none yet */ }
  global.__conflictVerdicts = m;
  return m;
}
function saveVerdicts(): void {
  if (process.env.VITEST || global.__conflictVerdictsSave) return;
  global.__conflictVerdictsSave = setTimeout(() => {
    global.__conflictVerdictsSave = null;
    const m = verdicts();
    const since = Date.now() - VERDICT_DAYS * 864e5;
    const rows = [...m.entries()].filter(([, x]) => x.at >= since).slice(-3000);
    void fsp.writeFile(VERDICT_FILE(), JSON.stringify({ v: V, rows })).catch((e) => console.warn("[conflicts] verdicts not saved:", (e as Error).message));
  }, 2000);
}
/** the reports compared, by what they say */
const sigOf = (reps: Report[]) => `t|${reps.map(textHash).sort().join(",")}`;
/** What a model answered for these reports (on this build's ids), or null: none has read them. */
function verdictOf(reps: Report[]): Difference[] | null {
  const v = verdicts().get(sigOf(reps));
  if (!v) return null;
  const by = new Map(reps.map((r) => [textHash(r), r]));
  return v.items.map(({ d, h }) => ({ ...d, claims: d.claims.map((c, k) => { const r = by.get(h[k]); return r ? { ...c, docId: r.id, t: r.t } : c; }) }));
}
function keepVerdict(reps: Report[], items: Difference[]): void {
  const by = new Map(reps.map((r) => [r.id, textHash(r)]));
  verdicts().set(sigOf(reps), { at: Date.now(), items: items.map((d) => ({ d, h: d.claims.map((c) => by.get(c.docId) ?? "") })) });
  saveVerdicts();
}

/** after the model fails, the rules stand in this long before it is asked again */
const REST_MS = 10 * 60_000;
const resting = () => (global.__conflictRest ?? 0) > Date.now();
/** Reads the stories no model has read (at most AI_STORIES); true when it answered. What it finds is written into the book. */
async function read(stories: { s: Story; key: string; title: string; reports: Report[] }[], user: string, now: string): Promise<boolean> {
  const ai = await aiDifferences(stories, user).catch((e) => (console.warn(`[conflicts] ${(e as Error).message.slice(0, 160)}`), null));
  if (!ai) { global.__conflictRest = Date.now() + REST_MS; return false; }
  let n = 0;
  for (const x of stories) {
    const d = ai.get(x.key);
    if (!d) continue;
    keepVerdict(x.reports, d);
    n += found(storyOf(x.s, x.reports), d, new Map(x.reports.map((r) => [r.id, r])), now);
  }
  if (n) bumpDataEpoch();
  return true;
}

// --------------------------------------------------------------- the list --

/** a news story (intel.ts newsStories), as much of it as the checks need */
interface Story { id: string; title: string; incident: string | null; docIds: string[]; t: string }
const storyOf = (s: Story, reps: Report[]) => ({ title: s.title, docIds: s.docIds, incident: s.incident, outlets: new Set(reps.map((r) => r.publisher)).size });
/** What a report says, for settling a difference: evidence in the reports themselves, never a new verdict. */
const HOLDS: Holds = {
  claim: claimHolds,
  differ: (claims, field) => distinct(claims.map((c) => ({ docId: "", t: "", ...c })), field) !== null,
  count: (field, r) => (FOLLOW_UP.test(`${r.head} ${r.original ?? ""}`) ? null : claimsOf(r).get(field) ?? null)
};

/**
 * The differences between the reports of one story (the news preview and the incident pop-up): those the list found for any of these reports;
 * a set of reports it never compared is compared now, and what is found joins the list.
 */
export async function storyConflicts(ids: string[], title: string, user: string, id?: string): Promise<StoryConflicts | null> {
  const map = await reportsOf(ids.slice(0, 60));
  const all = [...map.values()], keys = all.map((r) => reportKey(r.url, r.id));
  const reps = pick(all);
  const key = id ?? reps[0]?.id ?? ids[0];
  const outlets = new Set(reps.map((r) => r.publisher)).size;
  const now = istNow();
  let items = about(ids, keys);
  if (!items.length) {
    if (outlets < 2 || !comparable(reps)) return null;
    const s: Story = { id: key, title, incident: all.find((r) => r.incident)?.incident ?? null, docIds: ids, t: reps[reps.length - 1].t };
    const had = verdictOf(reps);
    if (had) found(storyOf(s, reps), had, map, now);
    else if (resting() || !aiStatus().available || !(await read([{ s, key, title, reports: reps }], user, now))) found(storyOf(s, reps), ruleDifferences(reps), map, now);
    items = about(ids, keys);
  }
  const byKey = await reportsBehind(items);
  settle(items, byKey, (x) => all.filter((r) => x.reports.some((b) => { const own = byKey.get(b.key); return own ? sameIncident(own, r) : false; })), HOLDS, now, await dataVersion());
  return { id: key, title, incident: null, docIds: ids, outlets, items: items.map((x) => shown(x, byKey)) };
}
const istNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

const V = 6;
const AI_STORIES = 12;
/** how long a page waits for the model: what it finds later joins the list by itself (bumpDataEpoch: the consoles refresh at their next check) */
const WAIT_MS = 20_000;
interface Compared { s: Story; key: string; title: string; reports: Report[]; all: Report[]; rules: Difference[] }
declare global {
  // eslint-disable-next-line no-var
  var __conflicts: Map<string, { at: number; v: Compared[] }> | undefined;
  // eslint-disable-next-line no-var
  var __conflictFlights: Map<string, Promise<PeriodConflicts>> | undefined;
  // eslint-disable-next-line no-var
  var __conflictReads: Map<string, Promise<boolean>> | undefined;
}
export interface PeriodConflicts { stories: StoryConflicts[]; checked: number; ai: boolean }

/** The period's stories with two or more outlets on the same incident, with their reports: the ones whose figures already differ first, then those with the most outlets. */
async function compared(period: Period, now: string, build: string): Promise<{ list: Compared[]; stories: Story[] }> {
  const stories = await newsStories(period, now);
  const all = stories.filter((s) => s.outletNames.length >= 2);
  const memoKey = `${V}|${period}|${build}|${all.map((s) => `${s.id}:${s.docIds.length}`).join(",")}`;
  const memo = (global.__conflicts ??= new Map()).get(memoKey);
  if (memo && Date.now() - memo.at < 10 * 60_000) return { list: memo.v, stories };
  const reps = await reportsOf(all.flatMap((s) => s.docIds.slice(0, 40)));
  const list = all.map((s) => {
    const mine = s.docIds.map((d) => reps.get(d)).filter((r): r is Report => !!r);
    return { s, key: s.id, title: s.title, all: mine, reports: pick(mine) };
  }).filter((x) => new Set(x.reports.map((r) => r.publisher)).size >= 2 && comparable(x.reports))
    .map((x) => ({ ...x, rules: ruleDifferences(x.reports) }))
    .sort((a, b) => Number(b.rules.length > 0) - Number(a.rules.length > 0) || b.reports.length - a.reports.length || b.s.t.localeCompare(a.s.t) || a.key.localeCompare(b.key));
  global.__conflicts.set(memoKey, { at: Date.now(), v: list });
  while (global.__conflicts.size > 12) global.__conflicts.delete(global.__conflicts.keys().next().value!);
  return { list, stories };
}

/**
 * Every difference between outlets found in the period's news, one list for every reader, in one order: the largest gap first, then the newest.
 * A difference found during the day stays until the day rolls over (a longer period: until its reports leave the period, by whole days).
 */
export function periodConflicts(period: Period, now: string, user: string): Promise<PeriodConflicts> {
  const flights = (global.__conflictFlights ??= new Map());
  const key = `${period}|${dayKey(now)}`;
  const had = flights.get(key);
  if (had) return had;
  const p = periodFresh(period, now, user).finally(() => flights.delete(key));
  flights.set(key, p);
  return p;
}

async function periodFresh(period: Period, now: string, user: string): Promise<PeriodConflicts> {
  const build = await dataVersion();
  const { list, stories } = await compared(period, now, build);
  const put = (x: Compared, d: Difference[]) => found(storyOf(x.s, x.reports), d, new Map(x.reports.map((r) => [r.id, r])), now);
  const unread: Compared[] = [];
  let ai = false;
  for (const x of list) {
    const v = verdictOf(x.reports);
    if (v) { ai = true; put(x, v); } else unread.push(x);
  }
  // the model reads what it has not read; while it cannot, the rules' answer stands in (it is asked again later, and takes nothing away)
  if (unread.length) {
    if (resting() || !aiStatus().available) unread.forEach((x) => put(x, x.rules));
    else {
      const reads = (global.__conflictReads ??= new Map());
      const ask = unread.slice(0, AI_STORIES), k = ask.map((x) => sigOf(x.reports)).join(";");
      const job = reads.get(k) ?? read(ask, user, now).finally(() => reads.delete(k));
      reads.set(k, job);
      const done = await Promise.race([job, new Promise<"late">((r) => { setTimeout(() => r("late"), WAIT_MS).unref?.(); })]);
      if (done === true) ai = true;
      else if (done === false) unread.forEach((x) => put(x, x.rules));
    }
  }

  // from the start of the day the period begins in: an entry leaves with its whole day, never in the middle of one
  const items = listed(`${periodSince(period, now).slice(0, 10)} 00:00:00`, now);
  const byKey = await reportsBehind(items);
  const idsOf = (x: BookItem) => new Set([...x.docIds, ...x.reports.map((r) => byKey.get(r.key)?.id ?? r.id)]);
  /** the story on the page that holds its reports now, whatever its id */
  const nowIn = (x: BookItem): Story | null => {
    const own = x.reports.map((r) => byKey.get(r.key)?.id ?? r.id), ids = idsOf(x);
    return stories.find((s) => own.some((d) => s.docIds.includes(d))) ?? stories.find((s) => s.docIds.some((d) => ids.has(d))) ?? null;
  };
  const at = new Map(items.map((x) => [x.key, nowIn(x)]));
  const others = new Map(list.map((x) => [x.s.id, x.all]));
  settle(items, byKey, (x) => (others.get(at.get(x.key)?.id ?? "") ?? []).filter((r) => x.reports.some((b) => { const own = byKey.get(b.key); return own ? sameIncident(own, r) : false; })), HOLDS, now, build);

  const rows = new Map<string, StoryConflicts>();
  for (const x of listed(`${periodSince(period, now).slice(0, 10)} 00:00:00`, now)) {
    const s = at.get(x.key) ?? null;
    const row = rows.get(x.group);
    const own = x.reports.map((r) => byKey.get(r.key)).filter((r): r is Report => !!r);
    if (row) {
      row.items.push(shown(x, byKey));
      row.docIds = [...new Set([...row.docIds, ...(s?.docIds ?? []), ...own.map((r) => r.id), ...x.docIds])];
      row.outlets = Math.max(row.outlets, x.outlets);
      row.incident ??= s?.incident ?? own.find((r) => r.incident)?.incident ?? null;
    } else rows.set(x.group, { id: x.group, title: s?.title ?? x.title, incident: s?.incident ?? own.find((r) => r.incident)?.incident ?? (byKey.size ? null : x.incident),
      docIds: [...new Set([...(s?.docIds ?? []), ...own.map((r) => r.id), ...x.docIds])], outlets: x.outlets, items: [shown(x, byKey)] });
  }
  return { stories: [...rows.values()], checked: list.length, ai };
}

/** The one list of differences between outlets for anyone else who needs it (an assistant, a report): the Differ tab's own, for the day. */
export const dayDifferences = (now: string, user: string): Promise<PeriodConflicts> => periodConflicts("daily", now, user);
/** moves when the list changed (a key for anything kept from it) */
export const differencesVersion = (): number => bookVersion();
