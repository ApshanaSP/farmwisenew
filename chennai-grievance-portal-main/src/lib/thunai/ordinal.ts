/**
 * Which case on the Stage a Collector means (RC-42): one reader for "3", "3rd", "third", "the second and third", "1 to 3",
 * "last", in English, Tamil script and Tanglish, in digits of any script. It reads the WHOLE phrase: a word it does not know
 * makes it return null, so the sentence goes on to the agent instead of being guessed from one word inside it ("the one in
 * Pallikaranai" is not "one"). A position is 1-based; LAST (-1) means the last one on screen.
 */
import { asciiDigits } from "./digits";

export const LAST = -1;

const EN_UNITS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_TENS_ORD = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];

/** Tanglish: a stem + the spoken endings (rendu, rendavathu, rendaavadhu...). */
const TG_STEMS: [string[], number][] = [
  [["onn", "ond"], 1], [["rend", "irand"], 2], [["moon", "mun", "moond"], 3], [["naal", "naang"], 4], [["anj", "ainth"], 5], [["aar"], 6],
  [["ezh", "yezh", "eezh"], 7], [["ett"], 8], [["onbad", "onbadh", "onbath", "ombod"], 9], [["path", "padh"], 10]
];
const TG_ENDS = ["u", "", "avathu", "aavathu", "vathu", "avadhu", "aavadhu", "vadhu", "um"];
/** Tamil script: a stem (without its closing ு) + the endings (இரண்டு, இரண்டாவது, இரண்டாவதை, இரண்டாவதும்). */
const TA_STEMS: [string[], number][] = [
  [["ஒன்ற"], 1], [["இரண்ட", "ரெண்ட"], 2], [["மூன்ற", "மூண"], 3], [["நான்க", "நால"], 4], [["ஐந்த", "அஞ்ச"], 5], [["ஆற"], 6], [["ஏழ"], 7], [["எட்ட"], 8], [["ஒன்பத"], 9], [["பத்த"], 10]
];
const TA_ENDS = ["ு", "ாவது", "வது", "ாவதை", "ாவதைத்", "ாவதில்", "ாவதும்", "ும்", "ை", "ைத்"];

const WORD = new Map<string, number>();
const put = (k: string, v: number) => { if (!WORD.has(k)) WORD.set(k, v); };
EN_UNITS.forEach((w, i) => w && put(w, i));
EN_ORD.forEach((w, i) => w && put(w, i));
EN_TENS.forEach((w, i) => w && put(w, i * 10));
EN_TENS_ORD.forEach((w, i) => w && put(w, i * 10));
put("top", 1);
for (const [stems, v] of TG_STEMS) for (const s of stems) for (const e of TG_ENDS) put(s + e, v);
for (const [stems, v] of TA_STEMS) for (const s of stems) for (const e of TA_ENDS) put(s + e, v);
for (const w of ["முதல்", "முதலாவது", "முதலாவதை", "முதலாவதைத்", "முதலில்", "mudhal", "mudhalaavadhu", "mudhalavathu", "mudhalaavathu", "mudhalil", "mudhala"]) put(w, 1);
const LAST_WORDS = new Set(["last", "final", "kadaisi", "kadasi", "kadaisiya", "kadaisiyaa", "கடைசி", "கடைசியாக", "கடைசியில்", "கடைசியை", "கடைசியாகவுள்ள"]);
/** words that carry no position: the noun for the thing, an article, "number", the Tamil "which is there" */
const FILLER = new Set([
  "the", "a", "an", "of", "no", "number", "num", "case", "cases", "complaint", "complaints", "incident", "incidents", "item", "items", "ones",
  "கேஸ்", "கேஸை", "கேஸைத்", "கேசு", "கேசை", "கேஸு", "புகார்", "புகாரை", "சம்பவம்", "சம்பவத்தை", "எண்", "எண்ணை", "அந்த", "உள்ளதை", "உள்ளது", "உள்ள", "ஐ", "வது",
  "nu", "number-a", "ah", "aa", "a", "ai", "from", "வரை", "varai"
]);
const AND = new Set(["and", "&", "plus", "then", "mattrum", "matrum", "மற்றும்", "அப்புறம்", "um"]);
const TO = new Set(["to", "through", "thru", "till", "until"]);

type Tok = { v: number; word: boolean } | "and" | "to" | "from" | "fill" | "one" | null;

/** Lower-case, digits of every script as 0-9, "3rd" and "3-வது" as "3", "1-3" as "1 to 3"; then its words. */
export function tokensOf(text: string): string[] {
  const t = asciiDigits(text.normalize("NFC").toLowerCase())
    .replace(/(\d)\s*-?\s*(?:வது|வதை(?:த்)?|வதில்|vathu|vadhu|avathu|aavathu)(?![\p{L}\p{M}])/gu, "$1")
    .replace(/(\d)(?:st|nd|rd|th)(?![\p{L}\p{M}])/gu, "$1")
    .replace(/(\d)[.,](?=\d)/g, "$1z") // a decimal stays one word that no table holds, so "3.5" is refused and not read as 3 and 5
    .replace(/(\d)\s*-\s*(\d)/g, "$1 to $2")
    .replace(/&/g, " and ");
  return t.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

function classify(w: string): Tok {
  if (/^\d+$/.test(w)) return { v: Number(w), word: false };
  if (LAST_WORDS.has(w)) return { v: LAST, word: true };
  if (AND.has(w)) return "and";
  if (TO.has(w)) return "to";
  if (w === "முதல்" || w === "mudhal") return "from";
  if (w === "one") return "one";
  if (WORD.has(w)) return { v: WORD.get(w)!, word: true };
  if (FILLER.has(w)) return "fill";
  return null;
}

/**
 * What a phrase names: a list of positions, "the first N" or "the last N" (a count). ONE rule for the count words of all three languages (first, top, முதல், mudhal;
 * last, கடைசி, kadaisi), so "last two", "கடைசி இரண்டு" and "kadaisi 2" are the same two cases, and "first and third" is cases 1 and 3, not the first three (SKG1-01..06).
 * In a list, a negative position counts from the end: -1 is the last, -2 the one before it ("second last"). Null if any word is not understood.
 */
export type Pick = { kind: "list"; ns: number[] } | { kind: "first"; n: number } | { kind: "last"; n: number };
const FIRST_WORDS = new Set(["first", "top", "முதல்", "முதலில்", "mudhal", "mudhala", "mudhalil"]);

export function readPicks(words: string[], opts: { count?: boolean } = {}): Pick | null {
  if (!words.length) return null;
  const toks: Tok[] = words.map(classify);
  if (toks.some((x) => x === null)) return null;
  // "first three", "last 2", "top 5": a count, when a count is wanted and the head word is followed by one number and nothing else (but filler)
  const at = toks.findIndex((x) => x !== "fill"); // "the last two": a leading article is no part of the count
  if (opts.count && at >= 0 && words.length > at + 1 && (FIRST_WORDS.has(words[at]) || LAST_WORDS.has(words[at]))) {
    const head = words[at];
    const rest = words.slice(at + 1).filter((w) => classify(w) !== "fill");
    const nums = rest.every((w) => { const t = classify(w); return t === "one" || (!!t && typeof t === "object" && t.v > 0); });
    const n = nums && rest.length ? listOf(rest.map(classify))?.[0] : undefined;
    if (nums && n !== undefined && listOf(rest.map(classify))?.length === 1 && n > 0 && n <= 50) {
      if (LAST_WORDS.has(head) && n === 1) return { kind: "list", ns: [LAST] }; // "the last one" is the last case, a position
      return { kind: FIRST_WORDS.has(head) ? "first" : "last", n };
    }
  }
  const ns = listOf(toks);
  return ns ? { kind: "list", ns } : null;
}

/** The positions named by the words, in order, or null if any word is not understood or none is named. A count ("first N", "last N") is the positions it covers when `count` is allowed. */
export function readPositions(words: string[], opts: { count?: boolean } = {}): number[] | null {
  const p = readPicks(words, opts);
  if (!p) return null;
  if (p.kind === "list") return p.ns;
  return p.kind === "first" ? Array.from({ length: p.n }, (_, i) => i + 1) : Array.from({ length: p.n }, (_, i) => i - p.n);
}

function listOf(toks: Tok[]): number[] | null {
  // "twenty one", "twenty-first": a tens word and a unit word are one number
  const merged: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i], b = toks[i + 1];
    const unit = b && typeof b === "object" ? b : b === "one" ? { v: 1, word: true } : null;
    if (a && typeof a === "object" && a.word && a.v >= 20 && a.v % 10 === 0 && unit && unit.word && unit.v >= 1 && unit.v <= 9) { merged.push({ v: a.v + unit.v, word: true }); i++; }
    else merged.push(a);
  }
  const hasOther = merged.some((x) => x && typeof x === "object");
  const out: number[] = [];
  let pendingTo = false, prevNum = false;
  for (let i = 0; i < merged.length; i++) {
    const x = merged[i];
    if (x === "fill") continue;
    if (x === "one") { if (!hasOther) { out.push(1); prevNum = true; } continue; }
    if (x === "and") { pendingTo = false; prevNum = false; continue; }
    if (x === "to") { if (!out.length) return null; pendingTo = true; prevNum = false; continue; }
    // முதல் / mudhal: "from" between numbers ("3 முதல் 5" is 3 to 5), "first" when it leads
    if (x === "from") {
      if (out.length && prevNum && !pendingTo) { pendingTo = true; prevNum = false; continue; }
      if (!out.length) { out.push(1); prevNum = true; continue; }
      return null;
    }
    if (!x) return null;
    if (x.v === 0) return null;
    // "second last", "2nd last": the one before the last (a number and then "last"), not the second and the last
    if (x.v === LAST && prevNum && !pendingTo && out[out.length - 1] > 0) { const k = out.pop() as number; out.push(k >= 2 ? -k : LAST); prevNum = false; continue; }
    if (pendingTo) {
      const lo = out[out.length - 1];
      if (lo <= 0 || x.v <= 0 || x.v < lo || x.v - lo > 49) return null;
      for (let k = lo + 1; k <= x.v; k++) out.push(k);
      pendingTo = false;
    } else out.push(x.v);
    prevNum = x.v > 0;
  }
  if (pendingTo || !out.length) return null;
  return [...new Set(out)];
}

/** the verbs of "open it": the word for open, and the little words Tamil and Tanglish put round it */
export const OPEN_VERBS = new Set(["open", "thira", "thirandhu", "thirakkavum", "thirakka", "thirangal", "thirungal", "திற", "திறந்து", "திறங்க", "திறக்க", "திறக்கவும்", "திறங்கள்"]);
export const SOFT_VERBS = new Set(["me", "pannu", "panni", "pannunga", "kaattu", "kaatu", "kaattunga", "காட்டு", "காட்டுங்க", "பண்ணு", "பண்ணுங்க", "please", "pls", "plz", "ah"]);

/** The one position a short sentence names ("open the second one", "மூணாவது கேஸ்"), or null: a sentence with any other word in it names none (RC-42). */
export function singlePosition(text: string): number | null {
  const rest = tokensOf(text).filter((w) => !OPEN_VERBS.has(w) && !SOFT_VERBS.has(w));
  const ns = readPositions(rest);
  return ns && ns.length === 1 && ns[0] > 0 ? ns[0] : null;
}
