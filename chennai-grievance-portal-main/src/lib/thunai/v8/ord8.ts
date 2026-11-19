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
  [["padhinon", "pathinon", "padhinonn", "pathinonn", "padhinor", "pathinor"], 11], [["pannend", "pannirend", "pannirand", "pannendu"], 12],
  // v10 (v9's blind set: "pathinettavadhu", 18th, went to the planner): the teens, the twentieth and the thirtieth said as one word, and "onn-"
  // for the first after a tens word ("irubatthu onnaavadhu", 21st)
  [["padhimoon", "pathimoon", "padhimun", "pathimun", "padhinmoon", "pathinmoon"], 13], [["padhinaal", "pathinaal", "padhinaang", "pathinaang", "padhinal", "pathinal"], 14],
  [["padhinanj", "pathinanj", "padhinainth", "pathinainth", "padhinaind", "pathinaind"], 15], [["padhinaar", "pathinaar", "padhinar", "pathinar"], 16],
  [["padhinezh", "pathinezh", "padhinel", "pathinel", "padhineezh", "pathineezh"], 17], [["padhinett", "pathinett", "padhinet", "pathinet"], 18],
  [["patthonbad", "pathonbad", "patthonbath", "pathonbath", "patthombad", "pathombad", "patthombath", "pathombath", "padhonbad", "padhombad"], 19],
  [["irubad", "irubath", "irubadh", "irupath", "irupadh", "iruvath", "iruvadh", "irubatth"], 20], [["muppad", "muppath", "muppadh", "muppatth"], 30],
  [["onn", "onr", "ond"], 1]];
const TG_END = ["avadhu", "aavadhu", "avathu", "aavathu", "vadhu", "vathu", "avadha", "aavadha", "avatha", "aavatha", "avadhai", "aavadhai", "avathai", "aavathai"];
/** Tamil: a number's stem (without its closing vowel sign) and an ordinal ending (ஏழாவது, ஏழாவதை, ஏழாவதைத்) */
const TA_STEM: [string[], number][] = [[["இரண்ட", "ரெண்ட"], 2], [["மூன்ற", "மூண"], 3], [["நான்க", "நால"], 4], [["ஐந்த", "அஞ்ச"], 5], [["ஆற"], 6], [["ஏழ"], 7], [["எட்ட"], 8],
  // (v9, the review: the spoken ஒம்பது, the spellings பன்னிரெண்டு and பதினோர், and the -ஆம் ordinal, ஏழாம்)
  [["ஒன்பத", "ஒம்பத"], 9], [["பத்த"], 10], [["பதினொன்ற", "பதினோர"], 11], [["பன்னிரண்ட", "பன்னிரெண்ட"], 12],
  // v10: the teens, the twentieth and the thirtieth as one word (பதினெட்டாவது, இருபதாவது), and ஒன்றாவது
  [["பதின்மூன்ற", "பதிமூன்ற"], 13], [["பதினான்க", "பதினாலா"], 14], [["பதினைந்த", "பதினஞ்ச"], 15], [["பதினாற"], 16], [["பதினேழ"], 17], [["பதினெட்ட"], 18],
  [["பத்தொன்பத", "பத்தொம்பத"], 19], [["இருபத"], 20], [["முப்பத"], 30], [["ஒன்ற"], 1]];
const TA_END = ["ாவது", "ாவதை", "ாவதைத்", "ாவதைப்", "ாவதைச்", "ாவதில்", "ாவதும்", "ாம்"];
const ORD_WORD = new Map<string, number>();
EN_ORDS.forEach((w, i) => ORD_WORD.set(w, i + 1));
for (const [stems, n] of TG_STEM) for (const s of stems) for (const e of TG_END) ORD_WORD.set(s + e, n);
for (const [stems, n] of TA_STEM) for (const s of stems) for (const e of TA_END) ORD_WORD.set(s + e, n);
for (const w of ["mudhal", "mudhalavadhu", "mudhalaavadhu", "mudhalavathu", "mudhalaavathu", "modhal", "முதல்", "முதலாவது", "முதலாவதை", "முதலாவதைத்"]) ORD_WORD.set(w, 1);
for (const w of ["last", "final", "kadaisi", "kadasi", "kadaisiya", "கடைசி", "கடைசியை", "கடைசியைப்", "கடைசியா", "கடைசியாக"]) ORD_WORD.set(w, -1);
ORD_WORD.set("thirtieth", 30);

/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.3): a tens word said before a unit's ordinal makes one position ("irubathi rendavadhu" is the 22nd, "twenty
 * second" too); v9 read the unit alone (the 2nd: a wrong story read). The tens as said in English, Tanglish and Tamil script.
 */
const TENS = new Map<string, number>([
  ...["twenty"].map((w) => [w, 20] as [string, number]), ...["thirty"].map((w) => [w, 30] as [string, number]),
  ...["irubathi", "irubathu", "irubadhu", "irubadhi", "irupathi", "irupathu", "iruvathi", "iruvathu", "irubatthi", "irubatthu", "irubadhthi", "irubattu", "irubatti"].map((w) => [w, 20] as [string, number]),
  ...["muppathi", "muppathu", "muppadhu", "muppadhi", "muppatthi", "muppatthu"].map((w) => [w, 30] as [string, number]),
  ...["இருபத்தி", "இருபத்து", "இருபது"].map((w) => [w, 20] as [string, number]), ...["முப்பத்தி", "முப்பத்து", "முப்பது"].map((w) => [w, 30] as [string, number])
]);
/** a Tamil compound said as one word: இருபத்திரண்டாவது (இருபத்தி + இரண்டாவது), இருபத்தொன்றாவது (இருபத்து + ஒன்றாவது), இருபத்துநான்காவது: the tens
 * prefix, then the unit's ordinal with the sandhi undone (த fused with the unit's first vowel: தி இ, தொ ஒ, தை ஐ, தே ஏ, தெ எ, தா ஆ) */
const TA_TENS_PREFIX: [string, number][] = [["இருபத்", 20], ["முப்பத்", 30]];
const SANDHI: Record<string, string> = { "ி": "இ", "ொ": "ஒ", "ை": "ஐ", "ே": "ஏ", "ெ": "எ", "ா": "ஆ", "ு": "உ" };
const taCompound = (w: string): number | null => {
  for (const [p, tens] of TA_TENS_PREFIX) {
    if (!w.startsWith(p) || w.length <= p.length + 2) continue;
    const rest = w.slice(p.length);
    const cands: string[] = [];
    if (rest.startsWith("து")) cands.push(rest.slice(2));
    if (rest[0] === "த" && SANDHI[rest[1]]) cands.push(SANDHI[rest[1]] + rest.slice(2));
    for (const c of cands) { const u = ORD_WORD.get(c); if (u != null && u >= 1 && u <= 9) return tens + u; }
  }
  return null;
};

/** the words of a sentence (letters with their marks, or digits), lower case; "7-வது" and "7 வது" one word */
export const ordWordsOf = (text: string): string[] =>
  text.normalize("NFC").toLowerCase().replace(/(\d)\s*-?\s*(வது|ஆவது)/gu, "$1$2").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

/** one word as a position (-1: the last): an ordinal word, or a number with an ordinal ending ("7th", "7வது", "7ஆவது"); else null */
export const ordWord = (w: string): number | null => {
  const v = ORD_WORD.get(w);
  if (v != null) return v;
  // v10: a Tamil compound as one word (இருபத்திரண்டாவது)
  if (/^(?:இருபத்|முப்பத்)/u.test(w)) { const c = taCompound(w); if (c != null) return c; }
  const m = /^(\d{1,2})(?:st|nd|rd|th|வது|ஆவது|ாவது|avadhu|aavadhu|avathu|vathu|vadhu)$/u.exec(w);
  return m && Number(m[1]) >= 1 ? Number(m[1]) : null;
};
/** v10: a tens word ("twenty", "irubathi", "இருபத்தி"): its value, else null */
export const tensWord = (w: string | null | undefined): number | null => (w ? TENS.get(w) ?? null : null);

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
    // v10: a tens word before a unit's ordinal is one position ("irubathi rendavadhu", "twenty second"): its words before the tens word are the
    // position's own ("open the twenty second news": "the" before it)
    const tens = kind !== "number" && n >= 1 && n <= 9 ? tensWord(w[i - 1]) : null;
    if (tens != null) n += tens;
    const b = tens != null ? i - 1 : i;
    return { n, i: at, prev: w[b - 1] ?? null, prev2: w[b - 2] ?? null, next, acc: /(?:ை|ைத்|ைப்|ைச்|adhai|athai|aavadhai|aavathai)$/u.test(w[at]), kind, words: w };
  }
  return null;
}

/** the position a sentence names (-1: the last), or null */
export const ordinalOf = (text: string): number | null => ordinalAt(text)?.n ?? null;
