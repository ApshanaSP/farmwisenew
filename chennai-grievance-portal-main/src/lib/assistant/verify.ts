/**
 * The number verifier. Every number in an answer's headline, text, spoken summary and chart
 * titles must be a fact (at the precision it is written: "97.7%" and "98%" both match 97.65)
 * or context that is not a claim: dates, times, years, incident IDs, zone and ward numbers, street numbers,
 * the length of the window ("last 30 days"), numbers the question itself contains, and
 * numbers inside a headline quoted verbatim from the data. Anything else fails the answer.
 *
 * Numbers written as words are not checked; the composer is told to use digits.
 */
import type { Fact } from "@/lib/assistant/types";

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const TA_MONTHS = "ஜன|பிப்|மார்|ஏப்|மே|ஜூன்|ஜூலை|ஆக|செப்|அக்|நவ|டிச";
const WINDOW_WORD = /(last|past|previous|preceding|prior|over|within|in the|for the|next|kadandha|kadaisi|கடந்த|கடைசி|முந்தைய)\s*$/i;
/** Window lengths the console and tools use: 24 hours, 7/14/21/28/30/60/90/180 days, 12 weeks, 6 months, 2-hour buckets. */
const WINDOW_NUMBERS = new Set([1, 2, 6, 7, 12, 14, 21, 24, 28, 30, 60, 90, 180]);

const PATTERNS: RegExp[] = [
  /\b[A-Z]{2,}[-_][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g, // IDs: INC-20260928-BF90AB, THR-..., TLK-EGM
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g, // ISO dates and times
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b\\.?(?:,?\\s+\\d{4})?`, "gi"), // 29 Sep 2026
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"), // Sep 29
  new RegExp(`\\d{1,2}\\s*(?:${TA_MONTHS})\\S*`, "g"), // 29 செப்.
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // 29/09
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi, // 6:43 PM, 18:43
  /\b\d{1,2}\.\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)/gi, // 6.43 pm (a dot only with am/pm: 97.65 is a number)
  /\b(?:19|20)\d{2}\b/g, // years
  /\b(?:zone|ward|zones|wards|மண்டலம்|மண்டல|வார்டு)\s*(?:no\.?\s*)?\d{1,3}(?:\s*(?:and|&|,|to|-)\s*\d{1,3})*/gi, // Zone 9, wards 64 and 65
  /\bw\/e\b/gi,
  /\b\d{1,3}(?:st|nd|rd|th)?\s+(?:street|st\.?|cross|main|road|rd\.?|lane|avenue|block|sector|floor|phase|stage)\b/gi // addresses: 19th Street, 2nd Main Road
];
const NUMBER = /(?<![\w.])[-−]?(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{2})+,\d{3}|\d+)(?:\.\d+)?(?:\s*(lakhs?|crores?|k)\b)?/gi;
const DURATION = /(\d{1,3})\s*[- ]?(?:hours?|hrs?|days?|weeks?|months?|மணி\S*|நாட்\S*|நாள்\S*|வார\S*|மாத\S*|naal|naatkal|vaaram|maasam)/gi;

export interface Verdict { ok: boolean; checked: number; unmatched: string[] }

/** Numbers written in a text, with how many decimals each was written with. */
export function extractNumbers(text: string, quotable: string[] = []): { raw: string; value: number; decimals: number; scale: number; before: string; after: string }[] {
  let t = ` ${String(text ?? "").replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0x0be6))} `;
  // a headline quoted verbatim from the data carries its own numbers
  t = t.replace(/[“"‘']([^“”"‘’']{6,240})[”"’']/g, (m, inner: string) => (quotable.some((q) => q.includes(inner.trim())) ? " " : m));
  for (const re of PATTERNS) t = t.replace(re, " ");
  // the window's own length ("last 30 days", "28-day mean"), not a claim
  t = t.replace(DURATION, (m, n: string, offset: number, all: string) =>
    WINDOW_NUMBERS.has(Number(n)) || WINDOW_WORD.test(all.slice(Math.max(0, offset - 20), offset)) ? " " : m);
  const out: { raw: string; value: number; decimals: number; scale: number; before: string; after: string }[] = [];
  for (const m of t.matchAll(NUMBER)) {
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 28), at).toLowerCase();
    const after = t.slice(at + m[0].length, at + m[0].length + 24).toLowerCase();
    const raw = m[0].trim();
    const digits = raw.replace(/[−]/g, "-").replace(/[^0-9.-]/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const decimals = (digits.split(".")[1] ?? "").length;
    const unit = (m[1] ?? "").toLowerCase();
    const scale = unit.startsWith("lakh") ? 1e5 : unit.startsWith("crore") ? 1e7 : unit === "k" ? 1e3 : 1;
    value *= scale;
    out.push({ raw, value, decimals, scale, before, after });
  }
  return out;
}

/**
 * What a number is said to measure, from the word right after it ("24 deaths", "12 injured", "40%"): its value must then
 * come from a fact about that measure, not merely equal some other fact ("24 deaths" from a fact about 24 complaints fails).
 */
const MEASURES: { said: RegExp; fact: RegExp }[] = [
  { said: /^\s*(deaths?|dead|died|killed|fatalit|lives? lost|people (died|were killed))/, fact: /death|dead|died|killed|fatal/ },
  { said: /^\s*(injur|people injured|hurt|wounded)/, fact: /injur|hurt|wound/ },
  { said: /^\s*(citizen )?complaints?/, fact: /complaint/ },
  { said: /^\s*(%|per ?cent|percent)/, fact: /pct|percent|share|rate|%|occupancy/ },
  { said: /^\s*(severe)\b/, fact: /severe/ },
  { said: /^\s*(open|pending|unresolved|still open)\b/, fact: /open|pending|unresolved|backlog/ }
];
const UP = /\b(rose|rise|rising|risen|increase[ds]?|up|higher|more|jump(ed)?|grew|growth|surge[ds]?)\b[^.]{0,18}$/;
const DOWN = /\b(fell|fall|falling|fallen|decrease[ds]?|down|lower|fewer|less|drop(ped)?|declin(e|ed)|dipped)\b[^.]{0,18}$/;

/**
 * Check the texts of an answer against the facts. `context` = numbers that are not claims (the question's own, the scope's).
 * A number passes when a fact has its value (at the precision written) and, where the words say what it measures or which
 * way it moved, a fact of that measure and direction has it: "24 deaths" needs a death fact, "rose 21.2%" a positive change.
 */
export function verifyNumbers(texts: string[], facts: Fact[], context: number[] = [], quotable: string[] = []): Verdict {
  const unmatched: string[] = [];
  let checked = 0;
  for (const text of texts) {
    for (const n of extractNumbers(text, quotable)) {
      checked++;
      const tol = 0.5 * 10 ** -n.decimals * n.scale + 1e-9;
      const near = (a: number) => Math.abs(Math.abs(a) - Math.abs(n.value)) <= tol;
      const matches = facts.filter((f) => near(f.value));
      const inContext = context.some(near);
      if (!matches.length) { if (!inContext) unmatched.push(n.raw); continue; }
      const measure = MEASURES.find((m) => m.said.test(n.after));
      const about = (f: Fact) => `${f.id} ${f.label}`.toLowerCase();
      // only a fact clearly about another measure is ruled out ("24 deaths" on a complaints fact); an unlabelled one still counts
      const otherMeasure = (f: Fact) => !measure!.fact.test(about(f)) && MEASURES.some((m) => m !== measure && m.fact.test(about(f)));
      let ok = measure ? matches.filter((f) => !otherMeasure(f)) : matches;
      // a change's direction: "rose 21%" must not rest on a fact of -21%
      const change = ok.filter((f) => /change|delta|diff|vs|pct/.test(about(f)));
      if (change.length && UP.test(n.before)) ok = ok.filter((f) => !change.includes(f) || f.value > 0);
      else if (change.length && DOWN.test(n.before)) ok = ok.filter((f) => !change.includes(f) || f.value < 0);
      if (!ok.length && !(inContext && !measure)) unmatched.push(n.raw);
    }
  }
  return { ok: unmatched.length === 0, checked, unmatched: [...new Set(unmatched)] };
}

/** Numbers in the question and the scope line: repeating them is not a claim. */
export function contextNumbers(...texts: string[]): number[] {
  const out: number[] = [];
  for (const t of texts) for (const n of extractNumbers(t)) out.push(n.value);
  for (const re of [/\b(?:zone|ward|மண்டலம்)\s*(\d{1,3})/gi]) for (const t of texts) for (const m of String(t).matchAll(re)) out.push(Number(m[1]));
  return out;
}
