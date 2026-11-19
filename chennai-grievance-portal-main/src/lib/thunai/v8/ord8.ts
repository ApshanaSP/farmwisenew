/**
 * v9: a position said of a list ("the seventh", "7th", "ஏழாவது", "ezhavadhu", "the last", "number 7"), read word by word in English, Tamil and
 * Tanglish. v8 read Tamil to the fifth, English to the tenth, and "முதல்" inside முதல்வர் (the Chief Minister) as "first" (v8's holdout:
 * "ஏழாவது செய்தியைத் திறங்க", "read me the last one"). Only a position word: never a count ("rendu", "two", "ஏழு": those are counts or a number
 * in a story, "aaru flyover", six flyovers). A street ("Second Line Beach", "First Main Road") or a floor ("ஒன்பதாவது மாடி" is a word apart:
 * the caller looks at the word after it) is no position. Pure; used by refs8.ts (cases, stories on screen) and news8.ts (no topic word).
 */
const EN_ORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const EN_CARD = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty"];
/** Tanglish: a number's stem and an ordinal ending ("ezhavadhu", "ettaavathu", "pathavadhu") */
const TG_STEM: [string[], number][] = [[["rend", "irand", "rand"], 2], [["moon", "mun", "moond", "moonr"], 3], [["naal", "naang", "nang"], 4], [["anj", "ainth", "aind"], 5], [["aar", "ar"], 6],
  [["ezh", "yezh", "eezh", "el", "ezhu"], 7], [["ett", "et"], 8], [["onbad", "onbadh", "onbath", "ombad", "ombadh", "ombath", "onpath"], 9], [["path", "padh", "patth", "paath"], 10],
  // (v9, the review: 11 and 12 as said, "padhinonnavadhu", "pannendavadhu")
  [["padhinon", "pathinon", "padhinonn", "pathinonn", "padhinor", "pathinor"], 11], [["pannend", "pannirend", "pannirand", "pannendu"], 12]];
const TG_END = ["avadhu", "aavadhu", "avathu", "aavathu", "vadhu", "vathu", "avadha", "aavadha", "avatha", "aavatha", "avadhai", "aavadhai", "avathai", "aavathai"];
/** Tamil: a number's stem (without its closing vowel sign) and an ordinal ending (ஏழாவது, ஏழாவதை, ஏழாவதைத்) */
const TA_STEM: [string[], number][] = [[["இரண்ட", "ரெண்ட"], 2], [["மூன்ற", "மூண"], 3], [["நான்க", "நால"], 4], [["ஐந்த", "அஞ்ச"], 5], [["ஆற"], 6], [["ஏழ"], 7], [["எட்ட"], 8],
  // (v9, the review: the spoken ஒம்பது, the spellings பன்னிரெண்டு and பதினோர், and the -ஆம் ordinal, ஏழாம்)
  [["ஒன்பத", "ஒம்பத"], 9], [["பத்த"], 10], [["பதினொன்ற", "பதினோர"], 11], [["பன்னிரண்ட", "பன்னிரெண்ட"], 12]];
const TA_END = ["ாவது", "ாவதை", "ாவதைத்", "ாவதைப்", "ாவதைச்", "ாவதில்", "ாவதும்", "ாம்"];
const ORD_WORD = new Map<string, number>();
EN_ORDS.forEach((w, i) => ORD_WORD.set(w, i + 1));
for (const [stems, n] of TG_STEM) for (const s of stems) for (const e of TG_END) ORD_WORD.set(s + e, n);
for (const [stems, n] of TA_STEM) for (const s of stems) for (const e of TA_END) ORD_WORD.set(s + e, n);
for (const w of ["mudhal", "mudhalavadhu", "mudhalaavadhu", "mudhalavathu", "mudhalaavathu", "modhal", "முதல்", "முதலாவது", "முதலாவதை", "முதலாவதைத்"]) ORD_WORD.set(w, 1);
for (const w of ["last", "final", "kadaisi", "kadasi", "kadaisiya", "கடைசி", "கடைசியை", "கடைசியைப்", "கடைசியா", "கடைசியாக"]) ORD_WORD.set(w, -1);

/** the words of a sentence (letters with their marks, or digits), lower case; "7-வது" and "7 வது" one word */
export const ordWordsOf = (text: string): string[] =>
  text.normalize("NFC").toLowerCase().replace(/(\d)\s*-?\s*(வது|ஆவது)/gu, "$1$2").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

/** one word as a position (-1: the last): an ordinal word, or a number with an ordinal ending ("7th", "7வது", "7ஆவது"); else null */
export const ordWord = (w: string): number | null => {
  const v = ORD_WORD.get(w);
  if (v != null) return v;
  const m = /^(\d{1,2})(?:st|nd|rd|th|வது|ஆவது|ாவது|avadhu|aavadhu|avathu|vathu|vadhu)$/u.exec(w);
  return m && Number(m[1]) >= 1 ? Number(m[1]) : null;
};

/** the word after a position that makes it a street or a floor, not a place on a list */
const STREET = /^(?:line|street|st|main|avenue|cross|road|lane|floor|block|stage|phase|sector)$/;

/** Where a sentence names a position: its value (-1: the last), its word's index, the words around it (or null), whether it is said in the
 * accusative ("ஏழாவதை", "ezhavadhai": the thing itself, no noun needed), and what kind of word it is: an English one ("seventh", "7th",
 * "last", which needs "the" before it to be a position: "wait a second" is none), a Tamil or Tanglish ordinal ("ஏழாவது", "ezhavadhu"), or
 * "number 7" ("no. 9", "நம்பர் 7"; "no one" is no position: the review, 19 Nov). */
export interface OrdinalAt { n: number; i: number; prev: string | null; prev2: string | null; next: string | null; acc: boolean; kind: "en" | "ta" | "number"; words: string[] }
export function ordinalAt(text: string): OrdinalAt | null {
  const w = ordWordsOf(text);
  for (let i = 0; i < w.length; i++) {
    let n = ordWord(w[i]);
    let at = i;
    let kind: OrdinalAt["kind"] = /^(?:[a-z]+|\d{1,2}(?:st|nd|rd|th))$/.test(w[i]) && !/(?:vadhu|vathu|adhai|athai|adha|atha)$|^(?:mudhal|modhal|kadaisi|kadasi)/.test(w[i]) ? "en" : "ta";
    if (n == null && /^(?:number|no|item|nambar|நம்பர்|எண்)$/u.test(w[i]) && w[i + 1]) {
      // a number after "no" only as digits ("no. 9"): "no one" is nobody
      const c = /^\d{1,2}$/.test(w[i + 1]) ? Number(w[i + 1]) : w[i] === "no" ? 0 : EN_CARD.indexOf(w[i + 1]) + 1;
      if (c >= 1) { n = c; at = i + 1; kind = "number"; }
    }
    if (n == null) continue;
    const next = w[at + 1] ?? null;
    if (next && STREET.test(next)) continue;
    return { n, i: at, prev: w[i - 1] ?? null, prev2: w[i - 2] ?? null, next, acc: /(?:ை|ைத்|ைப்|ைச்|adhai|athai|aavadhai|aavathai)$/u.test(w[at]), kind, words: w };
  }
  return null;
}

/** the position a sentence names (-1: the last), or null */
export const ordinalOf = (text: string): number | null => ordinalAt(text)?.n ?? null;
