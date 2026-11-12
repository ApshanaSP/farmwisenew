/**
 * One reader for a window said as a count of time ("last 10 days", "கடந்த 2 வாரங்களில்", "pona 3 maasam"), for every lane that reads one:
 * Ask District IQ (assistant/fastpath.ts customWindow, unresolved.ts), Jarvis's fast lane and rules lane (thunai/quick.ts, understand.ts).
 * Before, each lane had its own list of words and its own number reader, so "last 10 days" was ten days in English and the 90-day default
 * in Tamil and Tanglish, and "pona 2 vaaram" was one week (QA pass 4, SKG1-20..27, SKG1-31, SKG1-32, g-review 3).
 *
 * It reads the SHAPE: a lead word (last, past, previous; kadantha, pona; கடந்த, சென்ற, போன) + a count + a unit of time. The count is digits of any
 * script, a number word of any of the three languages, or a short form ("7d", "24h"); the unit is a word of time with the case endings Tamil
 * puts on it (நாட்களில், வாரங்களில், மணி நேரத்தில்). A count that cannot be applied (0, negative, a fraction, more than the records hold) or a count
 * word it does not know is `bad`, never read as something else: the caller says so instead of answering with the default window.
 * Pure: no database, no clock, no model.
 */
import { asciiDigits } from "@/lib/thunai/digits";
import { readPositions } from "@/lib/thunai/ordinal";

export type Unit = "hour" | "day" | "week" | "month" | "year";
export interface SpanRead { kind: "span"; n: number; unit: Unit; hours: number; said: string }
export interface BadRead { kind: "bad"; why: "zero" | "negative" | "fraction" | "large" | "unread"; said: string }
export type WindowRead = SpanRead | BadRead;

const UNIT_HOURS: Record<Unit, number> = { hour: 1, day: 24, week: 168, month: 720, year: 8640 };
/** the records the console holds, in hours: a stretch longer than this cannot be counted (the store keeps about 180 days) */
export const RECORD_HOURS = 180 * 24;

/** "last", "past", "previous" and the Tamil and Tanglish words for them (not "next": that is a time to come) */
const LEAD = /^(?:last|past|previous|prev|kadantha|kadandha|kadaisi|kadaisiya|pona|poona|கடந்த|கடைசி|கடைசியாக|சென்ற|போன)$/;
const SKIP = new Set(["the", "oru", "an", "a"]);

/** The unit a token (and the one after it, for "மணி நேரம்" and "mani neram") names, and how many tokens it used. */
function unitOf(tok: string, next: string | undefined): { unit: Unit; used: number } | null {
  if (/^(?:hours?|hrs?|h)$/.test(tok)) return { unit: "hour", used: 1 };
  if (/^(?:days?|d)$/.test(tok)) return { unit: "day", used: 1 };
  if (/^(?:weeks?|wks?|w)$/.test(tok)) return { unit: "week", used: 1 };
  if (/^(?:months?|mos?)$/.test(tok)) return { unit: "month", used: 1 };
  if (/^(?:years?|yrs?|y)$/.test(tok)) return { unit: "year", used: 1 };
  // Tamil letters, with the endings (நாட்களில், நாளில், வாரங்களுக்கு, மாதத்தில், மணி நேரத்தில், ஆண்டுகளில்)
  if (/^மணி(?:நேர\S*)?$/u.test(tok)) return { unit: "hour", used: tok === "மணி" && next && /^நேர/u.test(next) ? 2 : 1 };
  if (/^நா(?:ள்|ளி|ளு|ட்)\S*$/u.test(tok)) return { unit: "day", used: 1 };
  if (/^வார(?:ம்|ங்|த்)\S*$/u.test(tok)) return { unit: "week", used: 1 };
  if (/^மாத(?:ம்|ங்|த்)\S*$/u.test(tok) || /^மாச\S*$/u.test(tok)) return { unit: "month", used: 1 };
  if (/^(?:வருட|வருஷ|ஆண்டு)\S*$/u.test(tok)) return { unit: "year", used: 1 };
  // Tanglish
  if (/^mani-?neram\S*$/.test(tok)) return { unit: "hour", used: 1 };
  if (tok === "mani" && next && /^neram/.test(next)) return { unit: "hour", used: 2 };
  if (/^(?:naal|naalu?kal|naatkal\S*|naatgal\S*|nal)(?:-?(?:la|il|ukku))?$/.test(tok) && tok !== "naalu") return { unit: "day", used: 1 };
  if (/^vaa?r(?:am|angal\S*|athula|athil|athukku)$/.test(tok)) return { unit: "week", used: 1 };
  if (/^maa?s(?:am|angal\S*|athula|athil|athukku)$|^maa?tham\S*$|^maathangal\S*$/.test(tok)) return { unit: "month", used: 1 };
  if (/^varu(?:sham|dam|shangal)\S*$/.test(tok)) return { unit: "year", used: 1 };
  return null;
}
const SHORT = /^(-?\d+)(h|hr|hrs|d|w|wk|wks|mo|mos|y|yr|yrs)$/;
const SHORT_UNIT: Record<string, Unit> = { h: "hour", hr: "hour", hrs: "hour", d: "day", w: "week", wk: "week", wks: "week", mo: "month", mos: "month", y: "year", yr: "year", yrs: "year" };
const ORDINAL = /(?:th|st|nd|rd|வது|வதை|vathu|vadhu)$|^(?:first|second|third|முதல்|mudhal)$/;

/** The count a few tokens name: digits (of any script), or number words of any of the three languages; null if it is none. */
function countOf(toks: string[]): number | "negative" | "fraction" | null {
  if (!toks.length) return null;
  if (toks.length === 1) {
    const x = asciiDigits(toks[0]);
    if (/^-\d+(?:[.,]\d+)?$/.test(x)) return "negative";
    if (/^\d+[.,]\d+$/.test(x)) return "fraction";
    if (/^\d+$/.test(x)) return Number(x);
  }
  if (toks.some((x) => ORDINAL.test(x))) return null;
  if (toks.length === 1 && /^(?:a|an)$/.test(toks[0])) return 1;
  const v = readPositions(toks);
  return v && v.length === 1 && v[0] > 0 ? v[0] : null;
}

/** The text as a window reader sees it: lower case, digits of every script as 0-9, punctuation off the ends of each word. */
const words = (text: string): string[] =>
  asciiDigits(text.normalize("NFC").toLowerCase()).replace(/(?<=[\p{L}\p{M}])-(?=[\p{L}\p{M}])/gu, " ").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{M}\p{N}-]+|[^\p{L}\p{M}\p{N}]+$/gu, "")).filter(Boolean);

/**
 * The window a sentence names as a count of time, or null when it names none (no lead word, or "last week" with no count). A count and unit with a
 * count that cannot be applied is `bad`; an unknown word where the count should be is `bad` too ("unread"), so it is said and never guessed.
 */
export function windowIn(text: string): WindowRead | null {
  const t = words(text);
  for (let i = 0; i < t.length; i++) {
    if (!LEAD.test(t[i])) continue;
    let j = i + 1;
    while (j < t.length && SKIP.has(t[j])) j++;
    if (j >= t.length) continue;
    // "7d", "24h", "-5d": the count and the unit in one word
    const sh = SHORT.exec(t[j]);
    if (sh) return span(Number(sh[1]), SHORT_UNIT[sh[2]], t.slice(i, j + 1).join(" "));
    // "last week", "pona vaaram": no count, so no count of time (a calendar week or month, read elsewhere)
    if (unitOf(t[j], t[j + 1])) continue;
    // a count of one or two words, then the unit
    for (const len of [1, 2]) {
      const u = t[j + len] ? unitOf(t[j + len], t[j + len + 1]) : null;
      if (!u) continue;
      const toks = t.slice(j, j + len), said = t.slice(i, j + len + u.used).join(" ");
      const c = countOf(toks);
      if (c === "negative" || c === "fraction") return { kind: "bad", why: c, said };
      if (c === null) {
        // a lone number-like word that no table holds ("pathinaidhu naal"): said as unread, never as the default window
        return { kind: "bad", why: "unread", said };
      }
      return span(c, u.unit, said);
    }
  }
  return null;
}

function span(n: number, unit: Unit, said: string): WindowRead {
  if (n === 0) return { kind: "bad", why: "zero", said };
  if (n < 0) return { kind: "bad", why: "negative", said };
  const hours = n * UNIT_HOURS[unit];
  if (hours > RECORD_HOURS) return { kind: "bad", why: "large", said };
  return { kind: "span", n, unit, hours, said };
}

/** The console's window that is exactly this many hours (24, 168, 720, 2160), or null: a stretch the console does not hold (336 hours, 3 days). */
export function heldPeriod(hours: number): "daily" | "weekly" | "monthly" | "quarterly" | null {
  return hours === 24 ? "daily" : hours === 168 ? "weekly" : hours === 720 ? "monthly" : hours === 2160 ? "quarterly" : null;
}

/**
 * Times the console does not hold and that name no count (a time to come is a forecast, which cannot.ts refuses): "since monday", "from last monday", "this year", "last year", "this fortnight", "year to date", and the
 * Tamil and Tanglish words for them. A lane that answered these with its default window would say the wrong period with a straight face (SKG1-24).
 */
const UNHELD_EN = /\b(?:since|from|this|last|past) (?:the )?(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?s?\b|\b(?:this|last|past|previous) (?:year|fortnight|decade)\b|\byear to date\b|\bytd\b|\bthis (?:calendar |financial |fiscal )?year\b|\ball time\b/;
const UNHELD_TG = /\b(?:indha|intha|pona|poona|kadantha|kadandha) (?:varusham|varudam|varsham)\b/;
const UNHELD_TA = /(?:இந்த|கடந்த|போன|சென்ற)\s*(?:வருடம்|வருஷம்|ஆண்டு)|(?:திங்கள்|திங்கட்|செவ்வாய்|புதன்|வியாழன்|வியாழக்|வெள்ளி|சனி|ஞாயிறு)\S*\s*(?:முதல்|இருந்து)/u;
/** The words of such a time as the sentence said them, or null. */
export const unheldPhrase = (text: string): string | null => {
  const t = text.normalize("NFC").toLowerCase();
  return (UNHELD_EN.exec(t) ?? UNHELD_TG.exec(t) ?? UNHELD_TA.exec(t))?.[0] ?? null;
};
export const unheldPhraseIn = (text: string): boolean => unheldPhrase(text) !== null;

/** Tamil month names as English ones, so one reader of months serves every language ("அக்டோபர் மாதம்" is "october மாதம்"). */
const TA_MONTHS: [RegExp, string][] = [
  [/ஜனவரி(?:யில்|ில்|ல்|்)?/gu, "january"], [/பிப்ரவரி(?:யில்|ில்|ல்|்)?/gu, "february"], [/மார்ச(?:யில்|ில்|ல்|்)?/gu, "march"], [/ஏப்ரல(?:யில்|ில்|ல்|்)?/gu, "april"], [/(?<![\p{L}\p{M}])மே(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])மே(?=யில்|ல்)/gu, "may"],
  [/ஜூன(?:யில்|ில்|ல்|்)?/gu, "june"], [/ஜூலை(?:யில்|ில்|ல்|்)?/gu, "july"], [/ஆகஸ்ட(?:யில்|ில்|ல்|்)?/gu, "august"], [/செப்டம்பர(?:யில்|ில்|ல்|்)?/gu, "september"], [/அக்டோபர(?:யில்|ில்|ல்|்)?/gu, "october"], [/நவம்பர(?:யில்|ில்|ல்|்)?/gu, "november"], [/டிசம்பர(?:யில்|ில்|ல்|்)?/gu, "december"]
];
export function englishMonths(text: string): string {
  let s = text;
  for (const [re, en] of TA_MONTHS) s = s.replace(re, en);
  return s;
}
