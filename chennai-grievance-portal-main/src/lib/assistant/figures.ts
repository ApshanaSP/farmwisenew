/**
 * The figures of Ask District IQ's written answer (QA pass 7, reviewer5-06). The writer may state a figure only when the card carries it as
 * a typed value: a KPI, a dataset's value cell, the number of incidents or stories shown, an incident's deaths, injuries, complaints or
 * sources. Rendered text is never a source of figures: the code's answer repeats titles, places and headlines in changed forms (an outlet
 * suffix cut, a title cut to 120 characters, a runner-up headline quoted in a caveat), and all of that is other people's writing. Pass 6
 * took that writing out of the code's text by exact substring, so any changed copy left its digits in as allowed figures.
 *
 * Each typed figure carries what it counts, and each figure in a draft is bound to the words around it: "only 2 garbage cases are open"
 * needs a typed 2 that counts open cases, not the 2 stories shown. A figure is read however it is written: digits of any script,
 * fullwidth or styled digits, digits glued to letters ("Only2"), number words in English, Tamil and Tanglish ("two", "இரண்டு", "rendu").
 * Dates, times, ids, ward and zone labels, ordinal street names and the window's own length ("last 7 days") are not figures.
 */
import type { AnswerCard } from "@/lib/assistant/answer";
import { asciiDigits } from "@/lib/thunai/digits";

/** What a figure counts (a measure), or what it is a count of in the answer itself (shown items, stories, outlets). */
export type Cue = "open" | "overdue" | "severe" | "resolved" | "death" | "injured" | "complaint" | "percent" | "shown" | "stories" | "outlets";
const MEASURES: Cue[] = ["open", "overdue", "severe", "resolved", "death", "injured", "complaint", "percent"];

/** The words that say what a figure counts, in English, Tamil and Tanglish (the text is lower-cased first). */
const CUES: [Cue, RegExp][] = [
  ["open", /\b(open|pending|unresolved|outstanding|unattended|not (yet )?(closed|resolved|cleared))\b|நிலுவை|திறந்/],
  ["overdue", /\b(overdue|deadlines?|late|delayed|breach\w*)\b|காலக்கெடு|\bthaand/],
  ["severe", /\bsevere\b|கடுமை/],
  ["resolved", /\b(resolved?|closed|cleared|fixed|solved|disposed)\b|தீர்க்க|தீர்வு/],
  ["death", /\b(deaths?|dead|died|die|killed|fatal\w*|lives|life|toll)\b|உயிரிழ|இறந்|பலி|\buyir/],
  ["injured", /\b(injur\w*|hurt|wounded)\b|காய|\bkaayam/],
  ["complaint", /\b(complaints?|grievances?|petitions?)\b|புகார்|\bpugaar/],
  ["percent", /^\W{0,3}(%|per ?cent\b)|சதவீ/],
  ["outlets", /\b(outlets?|sources?|newspapers?|papers|channels?|publications?|media|reports|records)\b|ஊடக|ஆதார|பத்திரிகை/],
  ["stories", /\b(stor(y|ies)|headlines?|articles?|news)\b|செய்தி|\bseidhi/],
  ["shown", /\b(listed|list|shown|below|above|these|those|following|newest|latest|oldest|recent|highest|top|priority|serious|first|here|answer|steps?)\b|பட்டியல்|புதிய|முக்கிய|சமீப|\b(pudhu|mukkiya\w*)\b/]
];
/** The measures a typed figure's label names ("Still open", "Deaths", "Share resolved", "Open citizen complaints"). */
const labelCues = (label: string): Cue[] => {
  const l = ` ${label.toLowerCase()} `;
  const out = CUES.filter(([c, re]) => MEASURES.includes(c) && c !== "percent" && re.test(l)).map(([c]) => c);
  if (/share|rate|%|per ?cent/.test(l)) out.push("percent");
  return out;
};

/** A figure the card carries as a typed value, with the measures it counts. `needs`: a count of the answer's own items (incidents listed,
 * stories, outlets, an incident's deaths) is a figure only when the words name it ("the 5 newest", "2 stories", "3 outlets", "1 death"),
 * never as a bare "2 cases are open": a list of 2 open cases does not make 2 the number of open cases. */
export interface Typed { value: number; counts: Cue[]; needs: Cue | null }

/** Every typed figure of a card: from its structured data only, never from its text. */
export function cardFigures(card: AnswerCard): Typed[] {
  const out: Typed[] = [];
  const add = (v: unknown, counts: Cue[], needs: Cue | null = null) => { if (typeof v === "number" && Number.isFinite(v)) out.push({ value: v, counts, needs }); };
  for (const k of card.kpis ?? []) {
    const c = [...labelCues(k.label), ...(k.format === "percent" ? ["percent" as Cue] : [])];
    add(k.value, c); add(k.prev, c);
  }
  for (const d of card.datasets ?? []) {
    // a value field's cells (a score such as priority is not additive and never a figure the answer states)
    const fields = (d.fields ?? []).filter((f) => f.kind === "value" && f.additive !== false);
    for (const r of d.rows ?? []) for (const f of fields) add(r[f.key], [...labelCues(f.label), ...(f.format === "percent" ? ["percent" as Cue] : [])]);
    add(d.total, []); add(d.normal?.lo, []); add(d.normal?.hi, []);
    add(d.rows?.length, [], "shown");
  }
  if (card.chart?.threshold) add(card.chart.threshold.value, []);
  // what the answer lists, and what holds for every item listed: the filters in force, or each item's own severity and status
  // ("the 5 newest open garbage complaints" when the list is of open ones)
  const f = card.context?.activeFilters;
  const items = card.incidents ?? [];
  const every = (p: (x: (typeof items)[number]) => boolean) => items.length > 0 && items.every(p);
  const listed: Cue[] = [...(f?.openOnly || f?.overdue || every((x) => !/resolved|closed|rejected|lapsed|verified|completed/i.test(x.status ?? "")) ? ["open" as Cue] : []),
    ...(f?.overdue ? ["overdue" as Cue] : []), ...(/severe/i.test(f?.sev ?? "") || every((x) => /^severe$/i.test(x.severity ?? "")) ? ["severe" as Cue] : [])];
  if (card.incidents) add(items.length, listed, "shown");
  if (card.incident) add(1, [], "shown");
  add(card.context?.n, listed, "shown");
  add(card.context?.resultIds?.length, listed, "shown");
  for (const x of [...items, ...(card.incident ? [card.incident] : [])]) {
    add(x.dead, ["death"], "death"); add(x.injured, ["injured"], "injured"); add(x.citizenComplaintCount, ["complaint"], "complaint");
    add(x.sourceCount, [], "outlets"); add(x.newsOutletCount, [], "outlets");
  }
  if (card.stories) {
    add(card.stories.length, [], "stories");
    add(card.context?.storyIds?.length, [], "stories");
    for (const s of card.stories) { add(s.sourceCount, [], "outlets"); add(s.sources?.length, [], "outlets"); }
  }
  if (card.actions) { add(card.actions.length, [], "shown"); for (const g of card.actions) add(g.items?.length, [], "shown"); }
  return out;
}

/** A figure read from a text: its value, how precisely it was written, and what the words around it say it counts. */
export interface Read { raw: string; value: number; decimals: number; scale: number; said: Cue[] }

// ------------------------------------------------------------------ reading --

const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯︀-️﻿]/g;
/** As a reader sees it: compatibility forms folded (fullwidth, styled and superscript digits are digits), invisible characters gone,
 * every script's digits as 0-9, Tamil's numerals for 10, 100 and 1000 as digits, spaces collapsed. */
export function plain(s: string): string {
  return asciiDigits(String(s ?? "").normalize("NFKC").replace(INVISIBLE, ""))
    .replace(/௰/g, " 10 ").replace(/௱/g, " 100 ").replace(/௲/g, " 1000 ").replace(/[^\S\n]+/g, " ");
}

const SMALL: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, million: 1e6, billion: 1e9 };
const EN_WORD = `${Object.keys(SMALL).join("|")}|hundred|${Object.keys(SCALE).join("|")}|dozen|couple`;
const EN_RUN = new RegExp(`\\b(?:an?\\s+)?(?:${EN_WORD})(?:(?:\\s+and\\s+|[\\s-]+)(?:${EN_WORD}))*\\b`, "gi");
/** "one" as a pronoun ("this one", "the worst one", "one of them"), not a count */
const ONE_PRONOUN_BEFORE = /^(the|this|that|which|each|every|any|no|another|other|same|serious|severe|important|urgent|big|recent|main|first|last|next|right|wrong|single|worst|best|most|least|\w+est)$/;

/** English number words as one value: "twenty-one" 21, "one hundred and five" 105, "two lakh" 200000, "a dozen" 12; null when vague ("lakhs"). */
function enValue(run: string): number | null {
  let total = 0, cur = 0, seen = false, article = false;
  for (const t of run.toLowerCase().split(/[\s-]+/).filter((x) => x && x !== "and")) {
    if (t === "a" || t === "an") { article = true; continue; }
    if (t in SMALL) { cur += SMALL[t]; seen = true; }
    else if (t === "hundred") { if (!seen && !article) return null; cur = (cur || 1) * 100; seen = true; }
    else if (t in SCALE) { if (!seen && !article) return null; total += (cur || 1) * SCALE[t]; cur = 0; seen = true; }
    else if (t === "dozen") { cur = (cur || 1) * 12; seen = true; }
    else if (t === "couple") { if (!article) return null; cur += 2; seen = true; }
  }
  return seen ? total + cur : null;
}

/** Tamil and Tanglish number words (Tamil inflects: "இரண்டே" only two, "இரண்டும்" both, so the stem is matched). "ஒரு" (a) is not one. */
const TA_WORDS: [RegExp, number][] = [
  [/^(ஒன்று|ஒன்றே|ஒன்றும்)$/, 1], [/^இரண்ட/, 2], [/^மூன்ற/, 3], [/^நான்க/, 4], [/^ஐந்த/, 5], [/^(ஆறு|ஆறே|ஆறும்)$/, 6], [/^(ஏழு|ஏழே|ஏழும்)$/, 7],
  [/^(எட்டு|எட்டே|எட்டும்)$/, 8], [/^ஒன்பத/, 9], [/^(பத்து|பத்தே|பத்தும்)$/, 10], [/^பதினொன்ற/, 11], [/^பன்னிரண்ட/, 12], [/^இருபத/, 20], [/^முப்பத/, 30],
  [/^நாற்பத/, 40], [/^ஐம்பத/, 50], [/^அறுபத/, 60], [/^எழுபத/, 70], [/^எண்பத/, 80], [/^தொண்ணூற/, 90], [/^(நூறு|நூறே)$/, 100], [/^ஆயிரம்/, 1000],
  [/^(onnu|onnum)$/, 1], [/^(rendu|randu|rendum|randum|rende)$/, 2], [/^(moonu|munu|moonum|moone)$/, 3], [/^(naalu|nalu|naalum)$/, 4],
  [/^(anju|anjum|ainthu|aindhu|anje)$/, 5], [/^(aaru|aarum)$/, 6], [/^(ezhu|ezhum|ezu)$/, 7], [/^(ettu|ettum)$/, 8], [/^(ombadhu|onbadhu|ombodhu|onbathu|ombathu)$/, 9],
  [/^(pathu|patthu|paththu|pathum)$/, 10], [/^(irubadhu|irupadhu|irubathu)$/, 20], [/^(muppadhu|muppathu)$/, 30], [/^(naarpadhu|narpadhu)$/, 40],
  [/^(aimbadhu|ambadhu)$/, 50], [/^(nooru|nuru)$/, 100], [/^(aayiram|ayiram)$/, 1000]
];

/** Number words written as digits, so the rest reads one form: "only two cases" -> "only 2 cases". */
function wordsAsDigits(t: string): string {
  let s = t.replace(EN_RUN, (run: string, at: number, all: string) => {
    const v = enValue(run.trim());
    if (v == null) return run;
    const next = all.slice(at + run.length);
    if (/^-[a-z]/i.test(next)) return run; // "two-wheeler", "one-way": a name, not a count
    if (/^one$/i.test(run.trim())) {
      const before = (all.slice(0, at).match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] ?? "").toLowerCase();
      if (ONE_PRONOUN_BEFORE.test(before) || /^\s+(of|another|by)\b/i.test(next)) return run;
    }
    return ` ${v} `;
  });
  s = s.replace(/[\p{L}\p{M}]+/gu, (w) => { const lw = w.toLowerCase(); const hit = TA_WORDS.find(([re]) => re.test(lw)); return hit ? ` ${hit[1]} ` : w; });
  // Roman numerals of two or more letters ("II", "XII"); not single letters, not DC or CM
  s = s.replace(/\b(?=[IVX]{2,}\b)(X{0,3})(IX|IV|V?I{0,3})\b/g, (m, x: string, r: string) => {
    const units = r === "IX" ? 9 : r === "IV" ? 4 : (r.startsWith("V") ? 5 : 0) + (r.match(/I/g)?.length ?? 0);
    return ` ${x.length * 10 + units} `;
  });
  return s;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const TA_MONTHS = "ஜன|பிப்|மார்|ஏப்|மே|ஜூன்|ஜூலை|ஆக|செப்|அக்|நவ|டிச";
/** Window lengths the console and its answers use (24 hours, 36 hours for news, 7/30/90 days...). */
const WINDOWS = new Set([1, 2, 6, 7, 12, 14, 21, 24, 28, 30, 36, 48, 60, 72, 90, 180]);
/** Not figures: ids, dates, times, years of a date, ward and zone labels, ordinal street names, the window's own length. */
const NOT_FIGURES: RegExp[] = [
  /\b[A-Z]{2,}[-_][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g, // INC-20260928-BF90AB, GCC-SWM
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b\\.?(?:,?\\s+\\d{4})?`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"),
  new RegExp(`\\d{1,2}\\s*(?:${TA_MONTHS})\\S*`, "g"),
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi,
  /\b\d{1,2}\.\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)/gi,
  /\b(?:in|since|of|from|till|until|by|during|year)\s+(?:19|20)\d{2}\b/gi,
  /\b(?:zone|ward|zones|wards|மண்டலம்|மண்டல|வார்டு)\s*(?:no\.?\s*)?\d{1,3}(?:\s*(?:and|&|,|to|-)\s*\d{1,3})*/gi,
  /\b\d{1,3}(?:st|nd|rd|th)\s+(?:street|st\.?|cross|main|road|rd\.?|lane|avenue|block|sector|floor|phase|stage)\b/gi
];
const WINDOW = /(\b(?:last|past|previous|preceding|kadandha|kadaisi)\b|கடந்த|கடைசி|முந்தைய)\s*(\d{1,3})\s*[- ]?(hours?|hrs?|days?|weeks?|months?|மணி\S*|நாட்\S*|நாள்\S*|வார\S*|மாத\S*|naal\S*|naatkal|vaaram|maasam|mani)/gi;
const FIGURE = /(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(?:\s*(lakhs?|lacs?|crores?|k|million|thousand|hundred)\b)?/gi;
const AFTER_STOP = /[.;:!?\n,()·|–—]/;
const BEFORE_STOP = /[.;!?\n,()·|–—]/g;

const cuesIn = (after: string, before: string): Cue[] => {
  const a = ` ${after.toLowerCase()}`, b = ` ${before.toLowerCase()} `;
  return CUES.filter(([c, re]) => (c === "percent" ? re.test(after.toLowerCase()) : re.test(a) || re.test(b))).map(([c]) => c);
};

/**
 * Every figure in a text, read as a reader reads it. `quotable`: others' writing (titles, places, headlines, articles); a word-for-word
 * quote of it in quotation marks is that writing, attributed, and its numbers are not the answer's figures (null: no quote counts).
 */
export function readFigures(text: string, quotable: string[] | null): Read[] {
  let t = ` ${plain(text)} `;
  if (quotable?.length) {
    const q = quotable.map(plain).map((x) => x.trim()).filter((x) => x.length >= 6);
    // (an apostrophe inside a word, "The Hindu's", opens or closes no quote)
    t = t.replace(/(?<![\p{L}\p{N}])([“"‘'«„「])([^“”"‘’'«»„「」]{6,240})([”"’'»“」])(?![\p{L}\p{N}])/gu, (m, _o, inner: string) => (q.some((x) => x.includes(inner.trim())) ? " " : m));
  }
  t = t.replace(/^(\s*)\d+[.)]\s+/gm, "$1- "); // a numbered list's own numbers
  t = wordsAsDigits(t);
  for (const re of NOT_FIGURES) t = t.replace(re, " ");
  t = t.replace(WINDOW, (m, word: string, n: string) => (WINDOWS.has(Number(n)) ? ` ${word} ` : m));
  const found = [...t.matchAll(FIGURE)];
  return found.map((m, k) => {
    const at = m.index ?? 0, end = at + m[0].length;
    // the words after it, to the next figure or clause break; the words before it, back to the last break or figure
    // (with no break since the figure before, these words are that figure's)
    const beforeAll = t.slice(k ? (found[k - 1].index ?? 0) + found[k - 1][0].length : 0, at);
    const lastBreak = Math.max(-1, ...[...beforeAll.matchAll(BEFORE_STOP)].map((x) => x.index ?? 0));
    const before = k && lastBreak < 0 ? "" : beforeAll.slice(lastBreak + 1).slice(-40);
    const afterAll = t.slice(end, found[k + 1]?.index ?? t.length);
    const stop = afterAll.search(AFTER_STOP);
    let after = (stop < 0 ? afterAll : afterAll.slice(0, stop)).slice(0, 80);
    // a base ("23% of the 51 cases reported are resolved", "out of 51"): what the sentence says is the part's, not the base's
    if (/\b(of|of the|of all|out of|among|among the)\s*$/i.test(beforeAll)) after = after.split(/\b(?:are|is|were|was|have|has|had|remain\w*|stay\w*|still)\b/i)[0];
    const digits = m[1].replace(/,/g, "");
    const unit = (m[3] ?? "").toLowerCase();
    const scale = unit.startsWith("lakh") || unit.startsWith("lac") ? 1e5 : unit.startsWith("crore") ? 1e7 : unit === "k" || unit === "thousand" ? 1e3
      : unit === "million" ? 1e6 : unit === "hundred" ? 100 : 1;
    return { raw: m[0].trim(), value: Number(`${digits}${m[2] ? `.${m[2]}` : ""}`) * scale, decimals: (m[2] ?? "").length, scale, said: cuesIn(after, before) };
  });
}

/** The question's own numbers ("top 5", "above 85%"): the Collector's words, which the answer may repeat whatever they count. */
export const askedFigures = (question: string): Typed[] => readFigures(question, null).map((r) => ({ value: r.value, counts: [...MEASURES], needs: null }));

/**
 * Whether a figure read from the draft is one of the card's typed figures: the same value at the precision written, counting what the
 * words say it counts. A measure the words name (open, severe, deaths, complaints, a percentage) must be one the typed figure counts; a
 * count of the answer's own items (incidents listed, stories, outlets) must be named as such.
 */
export function fits(r: Read, typed: Typed[]): boolean {
  const tol = 0.5 * 10 ** -r.decimals * r.scale + 1e-9;
  const measures = r.said.filter((c) => MEASURES.includes(c));
  return typed.some((t) => Math.abs(t.value - r.value) <= tol && measures.every((m) => t.counts.includes(m)) && (!t.needs || r.said.includes(t.needs)));
}
