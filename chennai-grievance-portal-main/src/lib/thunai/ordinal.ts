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
  "nu", "number-a", "ah", "aa", "a", "ai"
]);
const AND = new Set(["and", "&", "plus", "then", "mattrum", "matrum", "மற்றும்", "அப்புறம்", "um"]);
const TO = new Set(["to", "through", "thru", "till", "until"]);

type Tok = { v: number; word: boolean } | "and" | "to" | "fill" | "one" | null;

/** Lower-case, digits of every script as 0-9, "3rd" and "3-வது" as "3", "1-3" as "1 to 3"; then its words. */
export function tokensOf(text: string): string[] {
  const t = asciiDigits(text.normalize("NFC").toLowerCase())
    .replace(/(\d)\s*-?\s*(?:வது|வதை(?:த்)?|வதில்|vathu|vadhu|avathu|aavathu)(?![\p{L}\p{M}])/gu, "$1")
    .replace(/(\d)(?:st|nd|rd|th)(?![\p{L}\p{M}])/gu, "$1")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 to $2")
    .replace(/&/g, " and ");
  return t.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

function classify(w: string): Tok {
  if (/^\d+$/.test(w)) return { v: Number(w), word: false };
  if (LAST_WORDS.has(w)) return { v: LAST, word: true };
  if (AND.has(w)) return "and";
  if (TO.has(w)) return "to";
  if (w === "one") return "one";
  if (WORD.has(w)) return { v: WORD.get(w)!, word: true };
  if (FILLER.has(w)) return "fill";
  return null;
}

/**
 * The positions named by the words, in order, or null if any word is not understood or none is named. "first N" and "top N"
 * (a count) is the first N when `count` is allowed.
 */
export function readPositions(words: string[], opts: { count?: boolean } = {}): number[] | null {
  if (!words.length) return null;
  const toks: Tok[] = words.map(classify);
  if (toks.some((x) => x === null)) return null;
  // "first three" / "top 5": a count, not a list
  if (opts.count && (words[0] === "first" || words[0] === "top") && words.length > 1) {
    const rest = readPositions(words.slice(1));
    if (rest && rest.length === 1 && rest[0] > 0 && rest[0] <= 50) return Array.from({ length: rest[0] }, (_, i) => i + 1);
    return null;
  }
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
  let pendingTo = false;
  for (const x of merged) {
    if (x === "fill") continue;
    if (x === "one") { if (!hasOther) out.push(1); continue; }
    if (x === "and") { pendingTo = false; continue; }
    if (x === "to") { if (!out.length) return null; pendingTo = true; continue; }
    if (!x) return null;
    if (x.v === 0) return null;
    if (pendingTo) {
      const lo = out[out.length - 1];
      if (lo <= 0 || x.v <= 0 || x.v < lo || x.v - lo > 49) return null;
      for (let k = lo + 1; k <= x.v; k++) out.push(k);
      pendingTo = false;
    } else out.push(x.v);
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
