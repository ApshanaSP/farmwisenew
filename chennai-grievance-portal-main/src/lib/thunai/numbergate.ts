/**
 * The number gate on every spoken chunk: every figure Jarvis says comes from code. A figure in digits, Tamil digits, lakh and
 * crore forms, a percentage or spelled out in English or Tamil is allowed only when code supplied it. Text built by code from
 * the data (templates, screens) carries its numbers as `allowed`; a model-written line has none, so it can hold no figure.
 *
 * Extends the agent's figuresOk and spellsNumber (stage.ts, agent.ts) so one rule holds for digits and for words. Pure.
 */
import { asciiDigits } from "./digits";
const EN_WORDS: Record<string, number> = {
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100_000, lakhs: 100_000, crore: 10_000_000, crores: 10_000_000, million: 1_000_000, billion: 1_000_000_000, dozen: 12, dozens: 12,
  hundreds: 100, thousands: 1000, millions: 1_000_000, billions: 1_000_000_000, half: 0.5, twice: 2, thrice: 3, double: 2, triple: 3,
  // multiples said as a verb or an adjective are figures too (SKG1-13)
  doubled: 2, tripled: 3, trebled: 3, treble: 3, quadruple: 4, quadrupled: 4, quintupled: 5, halved: 0.5
};
/** "threefold", "tenfold": a number word and "fold" */
const FOLD = /^(two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand)-?fold$/;
/** "one moment", "the first one" and "the second one" are not figures: "one" and the ordinals are left out on purpose, here and in Tamil */
const EN_PARTS: Record<string, number> = { third: 1 / 3, quarter: 0.25, fifth: 0.2, tenth: 0.1 };
/** Tamil number words by stem, so case endings, 11 to 19 and "-க்கணக்கான" count. Each stem stops short of the ordinary words beside it (நான், எண்ணிக்கை, பத்திரிகை, எட்டப்பட்டது). */
const TA_STEMS: [RegExp, number][] = [
  [/^பதினொ/, 11], [/^பன்னிர/, 12], [/^பதி(ன்)?மூ/, 13], [/^பதினான்|^பதினாலு/, 14], [/^பதினை|^பதினஞ்/, 15], [/^பதினாற/, 16], [/^பதினே/, 17], [/^பதினெ/, 18], [/^பத்தொன்ப/, 19],
  [/^இருநூற/, 200], [/^மு(ந்ந|ன்ன)ூற/, 300], [/^நானூற/, 400], [/^ஐ(ந்ந|ன்ன|ந)ூற/, 500], [/^அறுநூற/, 600], [/^எழுநூற/, 700], [/^எண்ணூற/, 800], [/^தொள்ளாயிர/, 900],
  [/^நூறு|^நூற்(று|றி|றை)/, 100], [/^ஆயிர/, 1000], [/^மூவாயிர/, 3000], [/^ஐயாயிர/, 5000], [/^இ?லட்ச(ம்|க்|த்|ங்|$)/, 100_000], [/^கோடி(க்|கள்|யே|$)/, 10_000_000],
  [/^இரண்ட|^ரெண்ட/, 2], [/^மூன்ற|^மூணு/, 3], [/^நான்க[ுிைா]|^நாலு/, 4], [/^ஐந்த|^அஞ்சு(க்கு|க்கும்)?$/, 5], [/^ஆறு(ப்|பேர்|பேரும்|ம்|க்கு|க்கும்)?$|^ஆறில்$/, 6], [/^ஏழு(ப்|பேர்|பேரும்|ம்|க்கு|க்கும்)?$|^ஏழில்$/, 7],
  [/^எட்டு(ப்|பேர்|பேரும்|க்கு|க்கும்)?$|^எட்டில்$/, 8], [/^ஈராயிர/, 2000], [/^தொள்ளாயிர/, 900], [/^ஒன்பத/, 9], [/^பத்து|^பத்தில்$/, 10],
  [/^பாதி(யளவு|யும்)?$/, 0.5], [/^இரட்டிப்|^இருமடங்/, 2], [/^மும்மடங்/, 3]
];
const TA_TENS: [RegExp, number][] = [[/^இருபத/, 20], [/^முப்பத/, 30], [/^நாற்பத/, 40], [/^ஐம்பத/, 50], [/^அறுபத/, 60], [/^எழுபத/, 70], [/^எண்பத/, 80], [/^தொண்ணூ/, 90]];
const TA_UNITS: [RegExp, number][] = [[/ொன்ப/, 9], [/ொன்ற/, 1], [/ரண்ட|ரெண்ட/, 2], [/மூன்ற|மூணு/, 3], [/நான்க|நால/, 4], [/ைந்த|ஐந்த|ஞ்சு/, 5], [/ாற/, 6], [/ேழ/, 7], [/ெட்ட/, 8]];
/** Tanglish numerals, the Tamil numerals in Latin letters with the spellings in common use (a closed set: 2 to 10, 11 to 19, the tens, 100, 200, 1000, lakh, crore) */
const TG_WORDS: Record<string, number> = {
  rendu: 2, irandu: 2, moonu: 3, munu: 3, moondru: 3, mundru: 3, naalu: 4, naangu: 4, anju: 5, ainthu: 5, aaru: 6, ezhu: 7, yezhu: 7, ettu: 8, ombodhu: 9, onbadhu: 9, ombadhu: 9, onbathu: 9, pathu: 10,
  pathinonnu: 11, pannirendu: 12, pannendu: 12, pathimoonu: 13, pathinaalu: 14, pathinaangu: 14, pathinanju: 15, pathinainthu: 15, pathinaaru: 16, pathinezhu: 17, pathinettu: 18, pathonbadhu: 19, pathombadhu: 19,
  irubadhu: 20, irupadhu: 20, muppadhu: 30, nalpadhu: 40, naarpadhu: 40, naarpathu: 40, aimbadhu: 50, aimbathu: 50, arubadhu: 60, ezhubadhu: 70, enbadhu: 80, thonnooru: 90, thonnuru: 90,
  nooru: 100, irunooru: 200, aayiram: 1000, laksham: 100_000, latcham: 100_000, kodi: 10_000_000
};
/**
 * Tanglish numbers are one word in many spellings (irupathu, irubadhu, irupadhu), so the table is read through a fold of the spelling: dh and th are t, b is p, d is t, zh is l, a double letter is one, aa is a, oo is u, ee is i.
 * The table lists each number once in any spelling; a spelling nobody listed still folds to the same key (SKG1-11, SKG1-12).
 */
const tgFold = (w: string): string => w.toLowerCase().replace(/zh/g, "l").replace(/dh|th/g, "t").replace(/[bp]+/g, "p").replace(/d/g, "t").replace(/aa/g, "a").replace(/oo/g, "u").replace(/ee/g, "i").replace(/([a-z])\1+/g, "$1");
const TG_MORE: Record<string, number> = {
  randu: 2, irendu: 2, moonru: 3, munru: 3, moonrru: 3, nalu: 4, nangu: 4, anchu: 5, aindhu: 5, aintu: 5, ayndhu: 5, aru: 6, elu: 7, yettu: 8, onpathu: 9, ombathu: 9, patthu: 10,
  padhinonnu: 11, pathinondru: 11, panniranda: 12, pathinmoonu: 13, pathinaindhu: 15, irubathu: 20, muppathu: 30, nalpathu: 40, nalupathu: 40, aimpathu: 50, ambathu: 50, ainpathu: 50,
  arupathu: 60, elupathu: 70, enpathu: 80, thonpathu: 90, thombathu: 90, thombadhu: 90, thonpadhu: 90,
  munnooru: 300, moonooru: 300, naanooru: 400, naannooru: 400, ainooru: 500, ainnooru: 500, aarunooru: 600, ezhunooru: 700, ettunooru: 800, thollaayiram: 900,
  irandaayiram: 2000, irandayiram: 2000, moonaayiram: 3000, munaayiram: 3000, moonraayiram: 3000, naalaayiram: 4000, naangaayiram: 4000, ainthaayiram: 5000, ainthayiram: 5000, aindhaayiram: 5000,
  aaraayiram: 6000, ezhaayiram: 7000, ettaayiram: 8000, onbathaayiram: 9000
};
const TG_FOLDED = new Map<string, number>();
for (const [k, v] of [...Object.entries(TG_WORDS), ...Object.entries(TG_MORE)]) if (!TG_FOLDED.has(tgFold(k))) TG_FOLDED.set(tgFold(k), v);
/** "ஆறு" is also a river and a place-name ending: only a whole word that stands as a number counts */
const TA_RIVER = /(அடையாறு|பாலாறு|கூவம் ஆறு|ஆறு கரை|ஆற்று)/g;

/** things a count is about: the nouns after "one" or "single" that make it a figure (reference data: the words this portal counts) */
const COUNTED = "cases?|complaints?|incidents?|issues?|deaths?|persons?|people|reports?|alerts?|zones?|wards?|departments?|officers?|days?|weeks?|hours?|percent|lakh|crore|mm|millimetres?|floods?|flooding|leaks?|accidents?|fires?|areas?|streets?|localit(?:y|ies)|sites?|lakes?|schools?|hospitals?|stations?|taluks?|crews?|teams?|workers?|vehicles?|trees?|potholes?|drains?|roads?|tickets?|requests?|grievances?|petitions?|residents?|citizens?|households?|famil(?:y|ies)|houses?|buildings?|bridges?|pumps?|lights?|buses";
const TG_COUNTED = "pugar|pugargal|sambavam|sambavangal|mandalam|thurai|naal|vaaram|manineram|maranam|nabar|edam|pagudhi|saalai|eri|vaardu";
const TA_COUNTED = "புகார்|சம்பவ|மண்டல|வார்டு|வார்டி|துறை|அதிகாரி|நாள்|நாளி|வாரம்|வாரத்|மணி|எச்சரிக்கை|மரணம்|உயிரிழ|நபர்|கேஸ்|வழக்கு|இடத்|பகுதி|சாலை|ஏரி|வடிகால்|குடும்ப|வீடு|பள்ளி|மருத்துவமனை";
/** "one" is not a count after these (the second one, this one, which one, no one) or before these (one moment, one by one) */
const ONE_AFTER_WORD = new Set(["the", "this", "that", "these", "those", "which", "what", "no", "any", "each", "every", "another", "next", "last", "previous", "other", "same", "latest", "newest", "oldest", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "final", "big", "small", "little", "good", "bad", "right", "wrong", "young", "old", "pick", "choose", "select", "take", "try", "name", "by", "at", "some"]);
const ONE_BEFORE_WORD = new Set(["moment", "moments", "second", "seconds", "sec", "minute", "minutes", "min", "by", "another", "thing", "point", "time", "times", "of", "can", "could", "would", "should", "who", "that", "which"]);
const TENS_W: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNITS_W = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export interface Figure { raw: string; value: number; words?: boolean }

/**
 * The text as the gate reads it (RC-13): digits of every script as 0-9 (digits.ts), NFKC (fullwidth letters and digits,
 * superscripts, circled numbers), Arabic and fullwidth separators, and no zero-width or direction marks inside a word or number.
 */
const invisible = (c: number) => (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || c === 0x2060 || c === 0xfeff || c === 0xad;
const ARABIC_DECIMAL = String.fromCharCode(0x66b), ARABIC_THOUSANDS = String.fromCharCode(0x66c);
/** the Tamil number signs for ten, a hundred and a thousand: not decimal digits, so digits.ts does not read them (SKG1-10) */
const TA_SIGNS: Record<string, string> = { "௰": " 10 ", "௱": " 100 ", "௲": " 1000 " };
export const forGate = (text: string): string =>
  asciiDigits(Array.from(text).filter((ch) => !invisible(ch.codePointAt(0) as number)).map((ch) => TA_SIGNS[ch] ?? ch).join("").normalize("NFKC")).split(ARABIC_DECIMAL).join(".").split(ARABIC_THOUSANDS).join(",");

/** A Tamil word's value, or null: tens with their units (இருபத்தைந்து), thousands with their head (இரண்டாயிரம்). Ordinals (இரண்டாவது) and "both" (இரண்டையும்) are not figures. */
/** People counted in one word: இருவர் (two people), மூவர், நால்வர், ஐவர், அறுவர், எழுவர், with their endings (SKG1-08) */
const TA_PEOPLE: [RegExp, number][] = [[/^இருவ/, 2], [/^மூவ/, 3], [/^நால்வ/, 4], [/^ஐவ/, 5], [/^அறுவ/, 6], [/^எழுவ/, 7], [/^எண்மர/, 8]];
const TA_PEOPLE_END = /^(?:ர்|ரும்|ரை|ரைத்|ருக்கு|ருக்கும்|ரில்|ரின்|ரிடம்|ருமே)$/;
function taNumber(w: string): number | null {
  for (const [re, v] of TA_PEOPLE) { const m = re.exec(w); if (m && TA_PEOPLE_END.test(w.slice(m[0].length))) return v; }
  if (/ாம்$|ாவத/.test(w) || /^(இரண்|ரெண்)(டும்|டையும்|டிலும்)$/.test(w)) return null;
  const k = w.indexOf("ாயிர");
  if (k > 0) { const head = taNumber(`${w.slice(0, k)}ு`); if (head) return head * 1000; }
  for (const [re, v] of TA_TENS) {
    const m = re.exec(w);
    if (m) return v + (TA_UNITS.find(([u]) => u.test(w.slice(m[0].length)))?.[1] ?? 0);
  }
  return TA_STEMS.find(([re]) => re.test(w))?.[1] ?? null;
}

/** Every figure in the text, with its value: digits (grouped Indian or Western, decimals, %), Tamil digits, lakh/crore, words. */
export function figuresIn(text: string): Figure[] {
  const t = forGate(text);
  const out: Figure[] = [];
  const seenWord = new Set<string>();
  // a code that starts with a letter is no figure (INC-2026-004, Covid-19), but a range is two (10-20)
  const d = t.replace(/\p{L}[\p{L}\p{M}\d]*(?:-[\p{L}\p{M}\d]*\d[\p{L}\p{M}\d]*)+/gu, " ");
  // a digit run counts with a letter after it (1990s, 5km, 500க்கும்); with a scale word: "3.5 lakh", "2 crore", "12 லட்சம்", "10k"
  const num = /(?<![\p{L}\d])(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?:(?:\s*(lakhs?|crores?|thousand|hundred|லட்சம்|இலட்சம்|கோடி|ஆயிரம்|நூறு)|(k))(?![\p{L}\p{M}\d]))?/giu;
  for (let m; (m = num.exec(d)); ) {
    const base = Number((m[1] + (m[2] ?? "")).replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const scale = m[3]?.toLowerCase();
    const mult = m[4] ? 1000 : !scale ? 1 : /lakh|லட்சம்/.test(scale) ? 100_000 : /crore|கோடி/.test(scale) ? 10_000_000 : /thousand|ஆயிரம்/.test(scale) ? 1000 : 100;
    out.push({ raw: m[0].trim(), value: base * mult });
    if (scale) seenWord.add(scale);
  }
  // "twenty-one", "twenty one", "twentyone" are one figure, 21, not 20 and 1
  const en = t.replace(/(?<![\p{L}])(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]*(one|two|three|four|five|six|seven|eight|nine)(?![\p{L}])/giu, (m, tens: string, unit: string) => {
    out.push({ raw: m, value: TENS_W[tens.toLowerCase()] + UNITS_W.indexOf(unit.toLowerCase()) + 1, words: true });
    return " ";
  });
  for (const m of en.matchAll(/(?<![\p{L}])([a-z]+)(?![\p{L}])/giu)) {
    const w = m[1].toLowerCase();
    if (seenWord.has(w)) continue;
    if (w === "double" && /^[\s-]*(check|click|tap)/i.test(en.slice((m.index ?? 0) + w.length))) continue;
    // a word like constructor or toString is a property of every object, not a number word (scans-code-2, the same class as RC-14)
    if (Object.hasOwn(EN_WORDS, w)) out.push({ raw: m[1], value: EN_WORDS[w], words: true });
    else if (TG_FOLDED.has(tgFold(w))) out.push({ raw: m[1], value: TG_FOLDED.get(tgFold(w)) as number, words: true });
    else if (FOLD.test(w)) out.push({ raw: m[1], value: EN_WORDS[(FOLD.exec(w) as RegExpExecArray)[1]], words: true });
  }
  // a fraction of a unit of time, said as one word before the unit: "அரை மணி நேரம்" (half an hour), "ஒன்றரை மணி நேரம்", "arai manineram" (SKG1-10)
  for (const m of t.matchAll(/(?<![\p{L}\p{M}])(ஒன்றரை|இரண்டரை|மூன்றரை|அரை|முக்கால்|கால்)\s*(?=மணி|நாள்|நாட்|வாரம்|வாரத்|மாதம்|மாதத்|வருட|ஆண்டு|கிலோ)/gu))
    out.push({ raw: m[1], value: { ஒன்றரை: 1.5, இரண்டரை: 2.5, மூன்றரை: 3.5, அரை: 0.5, முக்கால்: 0.75, கால்: 0.25 }[m[1]] as number, words: true });
  for (const m of en.matchAll(/(?<![\p{L}])(arai|onnarai|oonrarai|irandarai|mukkaal|kaal|kal)\s+(?=mani|naal|vaaram|maasam|varusham|kilo)/giu))
    out.push({ raw: m[1], value: { arai: 0.5, onnarai: 1.5, oonrarai: 1.5, irandarai: 2.5, mukkaal: 0.75, kaal: 0.25, kal: 0.25 }[m[1].toLowerCase()] as number, words: true });
  // "இரு" (two) before a thing counted: "இரு புகார்கள்". On its own it is a verb (stay), so it is a figure only beside one of the counted nouns
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\p{L}\p{M}])இரு\s+(?:${TA_COUNTED})`, "gu"))) out.push({ raw: "இரு", value: 2, words: true });
  for (const m of en.matchAll(/(?<![\p{L}])(?:a|one)\s+(third|quarter|fifth|tenth)\s+of(?![\p{L}])/giu)) out.push({ raw: m[0], value: EN_PARTS[m[1].toLowerCase()], words: true });
  // "one" as a count (BUG-017, RC-13): a figure unless it stands for a thing already named ("the second one", "which one", "no one") or is a set phrase ("one moment", "one by one")
  for (const m of en.matchAll(/(?<![\p{L}])one(?![\p{L}])/giu)) {
    const before = en.slice(0, m.index).match(/([\p{L}'-]+)\W*$/u)?.[1]?.toLowerCase() ?? "";
    const after = en.slice((m.index ?? 0) + 3).match(/^\W*([\p{L}'-]+)(?:\W+([\p{L}'-]+))?/u);
    const next = after?.[1]?.toLowerCase() ?? "", next2 = after?.[2]?.toLowerCase() ?? "";
    if (ONE_AFTER_WORD.has(before)) continue;
    if (ONE_BEFORE_WORD.has(next) || (next === "more" && ONE_BEFORE_WORD.has(next2)) || (Object.hasOwn(EN_WORDS, next) && EN_WORDS[next] >= 100)) continue;
    out.push({ raw: "one", value: 1, words: true });
  }
  // "a single severe case", "the sole officer": one, in other words (the noun must be a thing counted)
  for (const m of en.matchAll(new RegExp(`(?<![\\p{L}])(?:single|sole|lone|solitary)\\s+(?:[\\p{L}-]+\\s+){0,2}(?:${COUNTED})(?![\\p{L}])`, "giu"))) out.push({ raw: m[0], value: 1, words: true });
  // Tanglish: "oru severe case dhaan", "onnu dhaan", "ore oru complaint", "oru complaint"
  for (const m of en.matchAll(new RegExp(`(?<![\\p{L}])(?:(?:ore|orey)\\s+oru|(?:onnu|onne|onnae)\\s+(?:dhaan|thaan|mattum|maatum)|oru\\s+(?:\\p{L}+\\s+){0,3}(?:dhaan|thaan|mattum|maatum)|oru\\s+(?:\\p{L}+\\s+){0,2}(?:${COUNTED}|${TG_COUNTED}))(?![\\p{L}])`, "giu"))) out.push({ raw: m[0], value: 1, words: true });
  // Tamil: "ஒரே ஒரு", "ஒன்றே ஒன்று", "ஒன்று மட்டும்", "ஒரு புகார் மட்டும்", "ஒரு சம்பவம்"
  for (const m of t.matchAll(new RegExp(`(?<![\\p{L}\\p{M}])(?:ஒரே\\s*(?:ஒரு|யொரு)|ஒரேயொரு|ஒன்றே\\s*ஒன்று|ஒன்(?:று|றை|றில்)\\s+(?:மட்டும்|மட்டுமே|தான்)|ஒரு\\s+(?:[\\p{L}\\p{M}]+\\s+){0,2}(?:மட்டும்|மட்டுமே)|ஒரு\\s+(?:[\\p{L}\\p{M}]+\\s+){0,2}(?:${TA_COUNTED})[\\p{L}\\p{M}]*)`, "gu"))) out.push({ raw: m[0], value: 1, words: true });
  if (/\b(percent|per cent)\b|சதவீத/i.test(t) && !/%/.test(t) && !out.some((f) => !f.words)) out.push({ raw: "percent", value: NaN, words: true });
  const clean = t.replace(TA_RIVER, " ");
  for (const m of clean.matchAll(/[஀-௿]+/g)) {
    if (seenWord.has(m[0])) continue;
    const v = taNumber(m[0]);
    if (v != null) out.push({ raw: m[0], value: v, words: true });
  }
  return out;
}

/** "Zone 13" names a zone, when it is one of `zones`: the number is a label, not a figure. */
export function zoneLabelsOut(text: string, zones: Iterable<number>): string {
  const real = new Set(zones);
  return text.replace(/(?<![\p{L}])(zone|மண்டலம்)\s*(\d{1,2})(?![\d\p{L}])/giu, (m, _w: string, n: string) => (real.has(Number(n)) ? " " : m));
}

/** an incident's id (INC-2026-004): with a real zone's label ("Zone 13"), the one code with digits a model's words keep whole */
const INC_ID = /(?<![\p{L}\p{M}\d])INC(?:-[A-Za-z0-9_]+)+/gu;
/** a digit run glued to a word, which figuresIn leaves out on purpose: "deaths-300" is masked as a code, "x300" is not read */
const GLUED = /(?<=[\p{L}\p{M}]|[\p{L}\p{M}\d]-)\d+(?:[.,]\d+)*/gu;

/**
 * The figures glued to a word in a model's words ("deaths-300", "x300", "Velachery-300", "deaths-٣٠٠"; review, Numbers 1). figuresIn masks
 * a letter-led code whole and does not read a digit run after a letter, which suits code's own lines (PM2.5, a station's code) but lets a
 * model's figure through. Outside an incident's id and a real zone's label (`zones`), each such run is a figure. For a model's words only.
 */
export function gluedFigures(text: string, zones: Iterable<number> = []): Figure[] {
  const t = zoneLabelsOut(forGate(text).replace(INC_ID, " "), zones);
  return [...t.matchAll(GLUED)].map((m) => ({ raw: m[0], value: Number(m[0].replace(/,/g, "")) }));
}

/** Every figure in a model's words: the gate's reading (figuresIn) and the glued ones, a real zone's label and an incident's id left out. */
export function modelFiguresIn(text: string, zones: Iterable<number> = []): Figure[] {
  const real = [...zones];
  return [...figuresIn(zoneLabelsOut(text, real)), ...gluedFigures(text, real)];
}
const PERCENT_WORD = /(?<![\p{L}\p{M}])(?:per\s?cent|percentage|சதவீத[஀-௿]*|sadhaveedham|sathaveetham)(?![\p{L}\p{M}])/giu;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A model's words with every figure taken out (Finding 51): digits of every script, lakh/crore, percentages and number words in English,
 * Tamil and Tanglish, by the gate's own reading (figuresIn), and any digit run glued to a word (gluedFigures: "deaths-300", "x300"). A real
 * zone's label ("Zone 13", `zones`) and an incident's id (INC-2026-004) stay. Returns the text unchanged when it holds no figure, and null
 * when a figure could not be taken out, so the caller drops the slot. For words a screen shows or says: never for a lookup, which keeps what
 * the Collector asked for.
 */
export function stripFigures(text: string, zones: Iterable<number> = []): string | null {
  const real = [...zones];
  const has = (t: string) => figuresIn(zoneLabelsOut(t, real)).length > 0 || gluedFigures(t, real).length > 0;
  if (!has(text)) return text;
  const kept: string[] = [];
  // a private-use mark stands in for each kept code or label while the figures around it are taken out (it is neither a letter nor a digit)
  const keep = (m: string) => { kept.push(m); return String.fromCharCode(0xe000 + kept.length - 1); };
  let t = forGate(text).replace(INC_ID, (m: string) => (/\d/.test(m) ? keep(m) : m)).replace(/(?<![\p{L}])(?:zone|மண்டலம்)\s*(\d{1,2})(?![\d\p{L}])/giu, (m: string, n: string) => (real.includes(Number(n)) ? keep(m) : m));
  for (let round = 0; round < 12; round++) {
    const figs = figuresIn(t);
    if (!figs.length) break;
    const before = t;
    for (const f of [...figs].sort((a, b) => b.raw.length - a.raw.length)) {
      if (f.raw === "percent") { t = t.replace(PERCENT_WORD, " "); continue; }
      // a count said in a phrase ("oru maranam", "a single death", "ஒரு புகார் மட்டும்") loses its number word, not the words it counts;
      // "ore oru" and "ஒரே ஒரு" are one number said twice, so both words go (else the "oru" left reads as a count again)
      const raw = f.words && /\s/.test(f.raw) ? (/^(?:ore|orey|ஒரே)\s+(?:oru|ஒரு)(?![\p{L}\p{M}])/iu.exec(f.raw)?.[0] ?? f.raw.split(/\s+/)[0]) : f.raw;
      const re = /\p{L}/u.test(raw) && !/^\d/.test(raw)
        ? new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(raw)}(?![\\p{L}\\p{M}])`, "giu")
        // a figure in digits goes with its sign, its percent and a scale word after it ("45%", "3.5 lakh")
        : new RegExp(`[-+−]?(?<![\\p{L}\\p{M}\\d.,])${escapeRe(f.raw)}(?![\\d])\\s*(?:%|${PERCENT_WORD.source})?`, "giu");
      t = t.replace(re, " ");
    }
    if (t === before) break;
  }
  // what figuresIn leaves on purpose: a digit run glued to a word ("deaths-300", "x300", "Velachery-300"), with the hyphen that glues it
  t = t.replace(/-?\d+(?:[.,]\d+)*%?(?:-(?=[\p{L}\p{M}]))?/gu, " ");
  t = t.replace(/[-]/g, (c) => kept[c.charCodeAt(0) - 0xe000] ?? "").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").replace(/^[\s,.;:–-]+|[\s,;:–-]+$/g, "").trim();
  return has(t) ? null : t;
}

/** Figures a chunk may use: the same value in any form, rounded to whole and to one place (as the screens show it). */
export function allowedSet(values: Iterable<number | string>): Set<string> {
  const s = new Set<string>();
  for (const v of values) {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,%\s]/g, ""));
    if (!Number.isFinite(n)) continue;
    for (const x of [n, Math.abs(n), Math.round(n), Math.round(Math.abs(n)), Math.round(n * 10) / 10, Math.round(Math.abs(n) * 10) / 10]) s.add(String(x));
  }
  return s;
}

export interface GateResult { ok: boolean; bad: string[] }

/** Does every figure in the chunk come from code? */
export function gateChunk(chunk: string, allowed: Set<string>): GateResult {
  const bad = figuresIn(chunk).filter((f) => !allowed.has(String(f.value))).map((f) => f.raw);
  return { ok: !bad.length, bad };
}

/**
 * Speech templates: the model writes {n:key} placeholders only, code fills them from named values. An unknown key refuses the
 * whole line; any figure the model wrote itself refuses it too. "percent" after a placeholder is the placeholder's unit, and
 * a zone the turn's tools named (`zones`) is a name. Returns the filled line, or null.
 */
export function fillTemplate(tpl: string, values: Record<string, number | string>, zones: Iterable<number> = []): string | null {
  const literal = zoneLabelsOut(tpl.replace(/\{n:[a-zA-Z0-9_]+\}(\s*(percent|per cent|சதவீத[஀-௿]*))?/gi, " "), zones);
  // the template is the model's words: a figure glued to a word ("Velachery-300") is its figure too (gluedFigures)
  if (figuresIn(literal).length || gluedFigures(literal, zones).length) return null;
  let ok = true;
  const out = tpl.replace(/\{n:([a-zA-Z0-9_]+)\}/g, (_, k: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, k)) { ok = false; return ""; }
    return String(values[k]);
  });
  return ok ? out : null;
}
