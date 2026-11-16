/**
 * Figures as Jarvis says them aloud (docs/qa/JARVIS_VOICE.md "Numbers"; ULTIMATE_JARVIS Pillar 4). Below a lakh: the figure
 * with Indian grouping, Intl.NumberFormat('en-IN') ("45,230"). From a lakh up: lakh and crore with one decimal ("1.2 lakh",
 * "3.4 crore"; in Tamil "1.2 லட்சம்", "3.4 கோடி"). Pure.
 *
 * A rounded form says a rounded value: 1,23,456 said as "1.2 lakh" says 1,20,000. Each spoken form carries that value, so
 * code hands the number gate the value it now says (spokenAllowed). The gate (numbergate.ts figuresIn) reads "1.2 lakh",
 * "3.4 crore", "1.2 லட்சம்" and "1,234 crore" as their values; numberwords.v4.test.ts holds it to that.
 *
 * v5 F1, no digit reaches any voice: after the gate has passed a chunk (and its lakh/crore form), aloud() says every number in it
 * in words, in the sentence's language ("1.2 lakh" is said "one point two lakh"; "1.2 லட்சம்" "ஒன்று புள்ளி இரண்டு லட்சம்").
 * It runs AFTER the gate and keeps the gate's verdict: it turns digits the gate already read into words of the same value, so it
 * can add no figure, and the gate itself reads exactly the strings it read before (it also guards every model string, so it is not
 * widened to read compound number words). A chunk that still holds any number sign after it (holdsDigit) is not said (mouth.ts).
 */
import { asciiDigits } from "./digits";
import { allowedSet } from "./numbergate";

export type SpokenLang = "en" | "ta";
export interface SpokenFigure { text: string; value: number }

const THOUSAND = 1000, LAKH = 100_000, CRORE = 10_000_000;
const WORD: Record<SpokenLang, { lakh: string; crore: string }> = { en: { lakh: "lakh", crore: "crore" }, ta: { lakh: "லட்சம்", crore: "கோடி" } };
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** One figure as it is said, and the value that form says. */
export function spokenFigure(n: number, lang: SpokenLang = "en"): SpokenFigure {
  if (!Number.isFinite(n)) return { text: String(n), value: n };
  const a = Math.abs(n), sign = n < 0 ? "-" : "", w = WORD[lang] ?? WORD.en;
  const out = (text: string, v: number): SpokenFigure => ({ text: `${sign}${text}`, value: v === 0 ? 0 : n < 0 ? -v : v });
  if (a >= LAKH) {
    // a lakh to one decimal is the nearest 10,000; a crore to one decimal the nearest 10,00,000 (99.96 lakh is said "1 crore")
    const lakhs = Math.round(a / 10_000) * 10_000;
    if (lakhs < CRORE) return out(`${oneDp.format(lakhs / LAKH)} ${w.lakh}`, lakhs);
    const crores = Math.round(a / 1_000_000) * 1_000_000;
    return out(`${oneDp.format(crores / CRORE)} ${w.crore}`, crores);
  }
  if (a >= THOUSAND) { const v = Math.round(a); return out(whole.format(v), v); }
  const v = Math.round(a * 10) / 10;
  return out(oneDp.format(v), v);
}

/**
 * The figures in a line Jarvis is about to say, from a lakh up, in lakh and crore. Only a figure written with grouping
 * commas is changed (that is how code writes a count: toLocaleString("en-IN")); a bare run of digits may be a PIN code or an
 * id, and is left as it is, as is a figure that already has its scale word or a unit glued to it. Returns the line and the
 * values the new forms say (for the gate: spokenAllowed).
 */
export function speakNumbers(text: string, lang: SpokenLang = "en"): { text: string; values: number[] } {
  const values: number[] = [];
  const re = /(?<![\p{L}\p{M}\p{N}.,\-/:#])(\d{1,3}(?:,\d{2,3})+)(\.\d+)?(?![\p{L}\p{M}\p{N}]|[.,]\d|\s*(?:lakhs?|crores?|thousand|hundred|million|billion|percent|per cent|%|இ?லட்ச|கோடி|ஆயிர|நூறு|சதவீத))/giu;
  const out = text.replace(re, (m: string, int: string, dec?: string) => {
    const n = Number(`${int.replace(/,/g, "")}${dec ?? ""}`);
    if (!Number.isFinite(n) || n < LAKH) return m;
    const f = spokenFigure(n, lang);
    values.push(f.value);
    return f.text;
  });
  return { text: out, values };
}

/** The figures a line may say once its numbers are in spoken form: what code allowed, and the rounded values it now says. */
export function spokenAllowed(allowed: Set<string>, values: Iterable<number>): Set<string> {
  const s = new Set(allowed);
  for (const v of allowedSet(values)) s.add(v);
  return s;
}

/* ---- v5 F1: every number a voice says, in words (see the file's comment) ---- */

/** Does the text still hold a number sign of any script (digits, ௪௭, ௰, ½, Ⅻ)? A voice is never handed one. */
export const holdsDigit = (text: string): boolean => /\p{N}/u.test(text);

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const en99 = (n: number): string => (n < 20 ? EN_ONES[n] : `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? `-${EN_ONES[n % 10]}` : ""}`);
function en999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return en99(r);
  return r ? `${EN_ONES[h]} hundred and ${en99(r)}` : `${EN_ONES[h]} hundred`;
}
/** English, Indian scale: "forty-five thousand two hundred and thirty", "one lakh twenty thousand", "two crore fifty lakh" */
function enWhole(n: number): string {
  if (n === 0) return EN_ONES[0];
  const crore = Math.floor(n / CRORE), lakh = Math.floor((n % CRORE) / LAKH), th = Math.floor((n % LAKH) / THOUSAND), rest = n % THOUSAND;
  const parts: string[] = [];
  if (crore) parts.push(`${enWhole(crore)} crore`);
  if (lakh) parts.push(`${en99(lakh)} lakh`);
  if (th) parts.push(`${en99(th)} thousand`);
  if (rest) parts.push(parts.length && rest < 100 ? `and ${en99(rest)}` : en999(rest));
  return parts.join(" ");
}

/*
 * Tamil number words. MODEL-DRAFTED: written by a model from standard written Tamil, NOT CHECKED BY A TAMIL SPEAKER. The joins follow
 * the usual written forms (இருபத்தொன்று, நாற்பத்தேழு, இருநூற்று முப்பது, நாற்பத்தைந்தாயிரத்து, ஒரு லட்சத்து, இரண்டு கோடியே); where
 * a spoken form differs (ஐயாயிரம், மூவாயிரம்) the plainer written one is used.
 */
const TA_ONES = ["பூஜ்ஜியம்", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு", "பதின்மூன்று", "பதினான்கு", "பதினைந்து", "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது"];
const TA_TENS = ["", "", "இருபது", "முப்பது", "நாற்பது", "ஐம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு"];
const TA_HUNDREDS = ["", "நூறு", "இருநூறு", "முந்நூறு", "நானூறு", "ஐந்நூறு", "அறுநூறு", "எழுநூறு", "எண்ணூறு", "தொள்ளாயிரம்"];
const VIRAMA = "்", U_SIGN = "ு";
/** each independent vowel and the sign it becomes after a consonant (அ: none) */
const TA_VOWEL_SIGN: Record<string, string> = Object.fromEntries(
  ([[0x0b85, ""], [0x0b86, "ா"], [0x0b87, "ி"], [0x0b88, "ீ"], [0x0b89, "ு"], [0x0b8a, "ூ"], [0x0b8e, "ெ"], [0x0b8f, "ே"], [0x0b90, "ை"], [0x0b92, "ொ"], [0x0b93, "ோ"], [0x0b94, "ௌ"]] as [number, string][])
    .map(([c, s]) => [String.fromCharCode(c), s])
);
/** "இருபது" → "இருபத்த்": the consonant before the last உ doubled, with its virama, ready to take the next word's vowel */
const doubled = (w: string) => { const c = w[w.length - 2]; return `${w.slice(0, -2)}${c}${VIRAMA}${c}${VIRAMA}`; };
/** a stem ending in a virama joined to the word after it: a vowel goes onto the consonant (இருபத்த் + ஒன்று), a consonant takes உ first (இருபத்து + மூன்று) */
function taJoin(stem: string, word: string): string {
  const base = stem.slice(0, -1), sign = TA_VOWEL_SIGN[word[0]];
  return sign !== undefined ? `${base}${sign}${word.slice(1)}` : `${base}${U_SIGN}${word}`;
}
function ta99(n: number): string {
  if (n < 20) return TA_ONES[n];
  const t = Math.floor(n / 10), u = n % 10;
  return u ? taJoin(doubled(TA_TENS[t]), TA_ONES[u]) : TA_TENS[t];
}
function ta999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return ta99(r);
  if (!r) return TA_HUNDREDS[h];
  // நூறு → நூற்று, தொள்ளாயிரம் → தொள்ளாயிரத்து, before the rest
  return `${h === 9 ? "தொள்ளாயிரத்து" : `${doubled(TA_HUNDREDS[h]).slice(0, -1)}${U_SIGN}`} ${ta99(r)}`;
}
/** 1 to 99 thousands: ஆயிரம், இரண்டாயிரம், இருபத்தோராயிரம், பதினோராயிரம்; `more` when a smaller part follows (…ஆயிரத்து) */
function taThousands(k: number, more: boolean): string {
  const end = more ? "ாயிரத்து" : "ாயிரம்";
  if (k === 1) return more ? "ஆயிரத்து" : "ஆயிரம்";
  const w = ta99(k), one = `ொன்று`;
  // …ஒன்று before a thousand is …ஓர் (இருபத்தோராயிரம்)
  if (w.endsWith(one)) return `${w.slice(0, -one.length)}ோர${end}`;
  return `${w.endsWith(U_SIGN) ? w.slice(0, -1) : w}${end}`;
}
/** Tamil: "நாற்பத்தைந்தாயிரத்து இருநூற்று முப்பது", "ஒரு லட்சத்து இருபதாயிரம்", "இரண்டு கோடியே ஐம்பது லட்சம்" */
function taWhole(n: number): string {
  if (n === 0) return TA_ONES[0];
  const crore = Math.floor(n / CRORE), lakh = Math.floor((n % CRORE) / LAKH), th = Math.floor((n % LAKH) / THOUSAND), rest = n % THOUSAND;
  const parts: string[] = [];
  if (crore) parts.push(`${crore === 1 ? "ஒரு" : taWhole(crore)} ${lakh || th || rest ? "கோடியே" : "கோடி"}`);
  if (lakh) parts.push(`${lakh === 1 ? "ஒரு" : ta99(lakh)} ${th || rest ? "லட்சத்து" : "லட்சம்"}`);
  if (th) parts.push(taThousands(th, rest > 0));
  if (rest) parts.push(ta999(rest));
  return parts.join(" ");
}

/** A whole number in words, Indian scale (thousand, lakh, crore), in English or Tamil. Its sign and any fraction are the caller's. */
export function numberInWords(n: number, lang: SpokenLang = "en"): string {
  const w = Math.floor(Math.abs(n));
  return lang === "ta" ? taWhole(w) : enWhole(w);
}

const POINT: Record<SpokenLang, string> = { en: "point", ta: "புள்ளி" };
/** digits said one by one: a PIN code, an id, a leading zero, the digits after a decimal point */
const oneByOne = (d: string, l: SpokenLang) => Array.from(d, (c) => (l === "ta" ? TA_ONES : EN_ONES)[Number(c)]).join(" ");
const EN_ORD: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
/** "twenty-one" → "twenty-first", "twenty" → "twentieth" */
function enOrdinal(words: string): string {
  const m = /[a-z]+$/.exec(words);
  if (!m) return words;
  const last = m[0];
  return words.slice(0, m.index) + (EN_ORD[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`));
}
/** a Tamil number word with an ending that starts with ஆ: மூன்று + ஆவது = மூன்றாவது, பத்து + ஆம் = பத்தாம், கோடி + ஆவது = கோடியாவது */
function taEnding(word: string, ending: string): string {
  const tail = `ா${ending.slice(1)}`;
  return word.endsWith(U_SIGN) || word.endsWith(VIRAMA) ? `${word.slice(0, -1)}${tail}` : `${word}ய${tail}`;
}

/** Where a sentence's numbers are said: Tamil letters make it a Tamil sentence, Latin letters an English one; neither keeps the answer's language. */
export function sentenceLang(text: string, fallback: SpokenLang): SpokenLang {
  if (/[அ-ஹ]/u.test(text)) return "ta";
  if (/\p{Script=Latin}/u.test(text)) return "en";
  return fallback;
}

export interface Aloud {
  /** the text as the voice gets it */
  text: string;
  /** each number put in words: where it sat in the text as shown, and where its words sit in `text` */
  spans: { shown: [number, number]; said: [number, number] }[];
}

/** a number in the text: a run of digits of any script with its grouping commas and decimal point (Arabic ones too), or a clock's hh:mm; or one other number sign */
const NUMBER = /\p{Nd}+(?:[,.٫٬]\p{Nd}+)*(?::\p{Nd}{2}(?!\p{Nd}))?|[\p{No}\p{Nl}]/gu;
/** the Tamil signs for ten, a hundred and a thousand (not decimal digits) */
const TA_NUMBER_SIGN: Record<string, number> = { "௰": 10, "௱": 100, "௲": 1000 };
const LETTER = /[\p{L}\p{M}]/u;
/** a Latin letter right after the number gets a space ("5km" → "five km"); a Tamil case ending is joined to the words ("500க்கும்") */
const latinNext = (after: string) => /^[\p{L}\p{M}]/u.test(after) && !/^\p{Script=Tamil}/u.test(after);

interface Said { from: number; to: number; say: string; code: boolean }

/*
 * review numbers-privacy-1: code writes its counts with no grouping commas (insight.ts spoken() is String(v); screens.ts and the recipes
 * build their say lines with it), so a bare run of digits is a count unless what stands right before it makes it a code. These do:
 */
/** the word PIN (pincode, postal code) right before a six-digit figure, in English or Tamil ("PIN 600042", "அஞ்சல் குறியீடு 600020") */
const PIN_WORD = /(?<![\p{L}\p{M}])(?:pin\s?code|pincode|pin|postal\s+code|zip\s?code|zip|அஞ்சல்\s+குறியீடு|அஞ்சல்\s+எண்|பின்\s?கோடு)\s*[:#.\-–]?\s*$/iu;
/** a Tamil Nadu PIN code's shape (600xxx to 643xxx): after a place name it is a PIN, not a count of six lakh */
const TN_PIN = /^6[0-4]\d{4}$/;
/** a place's name right before the figure, capitalised or in Tamil letters, with a space, a comma or a dash between ("Velachery 600042", "Chennai - 600020", "சென்னை 600020") */
const PLACE_BEFORE = /(?:^|[^\p{L}\p{M}])(?:\p{Lu}|[அ-ஹ])[\p{L}\p{M}]*[ \t]*,?[ \t]*(?:[-–—][ \t]*)?$/u;
/** a word that names the figure after it as an id or a phone number ("complaint number 12345", "No. 54321", "#12345", "புகார் எண் 12345") */
const ID_WORD = /(?:(?<![\p{L}\p{M}])(?:id|no\.|number|ref|ticket|phone|mobile|helpline|tel|எண்|தொலைபேசி|கைபேசி|அலைபேசி)\s*[:.\-–]?|#)\s*$/iu;

/** A bare run of five digits or more that the text right before it makes a code (read one by one): a PIN after the word PIN or a place name, an id. */
function codeByContext(before: string, digits: string): boolean {
  const b = before.slice(-48);
  if (/^[1-9]\d{5}$/.test(digits) && PIN_WORD.test(b)) return true;
  if (TN_PIN.test(digits) && PLACE_BEFORE.test(b)) return true;
  return ID_WORD.test(b);
}

/**
 * A figure in digits (no clock), as the gate reads it: grouped Indian or Western with a decimal, else each comma or dot part on its own.
 * `before` is the text right before it, which can make a bare run of digits a code.
 */
function figureWords(s: string, l: SpokenLang, before = ""): { words: string; value: number; whole: boolean } {
  const g = /^(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?$/.exec(s);
  if (!g) return { words: s.split(",").map((p) => p.split(".").map((q) => figureWords(q, l).words).join(` ${POINT[l]} `)).join(", "), value: NaN, whole: false };
  const ip = g[1].replace(/,/g, ""), fp = g[2], bare = !g[1].includes(",") && !fp;
  // one by one: more digits than a number holds exactly, a leading zero, or a bare run of five or more that what stands before it makes
  // a code (codeByContext). Any other bare run is a count, said as a number ("12345": "twelve thousand three hundred and forty-five").
  const byOne = ip.length > 15 || (bare && ip.length > 1 && ip[0] === "0") || (bare && ip.length >= 5 && codeByContext(before, ip));
  const words = (byOne ? oneByOne(ip, l) : numberInWords(Number(ip), l)) + (fp ? ` ${POINT[l]} ${oneByOne(fp, l)}` : "");
  return { words, value: Number(`${ip}${fp ? `.${fp}` : ""}`), whole: !byOne && !fp };
}

/** a code's digits (INC-2026-004, Covid-19, PM2.5): three or more, or a leading zero, one by one; else in words */
function codeWords(s: string, l: SpokenLang): string {
  const [whole, ...fracs] = s.replace(/:/g, ".").split(".");
  const w = whole.split(",").map((x) => (x.length >= 3 || (x.length > 1 && x[0] === "0") ? oneByOne(x, l) : numberInWords(Number(x), l))).join(", ");
  return fracs.length ? `${w} ${POINT[l]} ${fracs.map((f) => oneByOne(f, l)).join(` ${POINT[l]} `)}` : w;
}

function clockWords(h: number, mm: number, l: SpokenLang): string {
  const hw = numberInWords(h, l), mw = numberInWords(mm, l);
  if (l === "ta") return mm ? `${hw} மணி ${mw} நிமிடம்` : `${hw} மணி`;
  return mm === 0 ? `${hw} o'clock` : mm < 10 ? `${hw} oh ${mw}` : `${hw} ${mw}`;
}

/** One number of the text in words, with what it takes with it: a sign, a range's dash, %, an ordinal or Tamil ending, "k". */
function sayNumber(text: string, i: number, run: string, l: SpokenLang, last: { end: number; code: boolean } | null): Said | null {
  const to0 = i + run.length;
  const before = text[i - 1] ?? "", before2 = text[i - 2] ?? "", after = text.slice(to0);
  // another number sign: the Tamil signs for ten, a hundred and a thousand, or one NFKC makes digits (², ①); any other is left, so the chunk is refused
  if (!/\p{Nd}/u.test(run)) {
    const k = run.normalize("NFKC");
    const v = TA_NUMBER_SIGN[run] ?? (/^\p{Nd}+$/u.test(k) ? Number(asciiDigits(k)) : NaN);
    if (!Number.isFinite(v)) return null;
    return { from: i, to: to0, say: `${LETTER.test(before) ? " " : ""}${numberInWords(v, l)}${latinNext(after) ? " " : ""}`, code: false };
  }
  const s = asciiDigits(run).replace(/٫/g, ".").replace(/٬/g, ",");
  // a code: digits glued to a letter (PM2.5, x300), or after a hyphen, underscore or slash that follows a letter or a code's digits (INC-2026-004, Covid-19)
  const code = LETTER.test(before) || (/[-_/]/.test(before) && (LETTER.test(before2) || (!!last?.code && last.end === i - 1)));
  if (code) return { from: i, to: to0, say: `${LETTER.test(before) ? " " : ""}${codeWords(s, l)}${latinNext(after) ? " " : ""}`, code: true };
  // a clock: 10:30, 9:05, 10:00
  const clock = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (clock && Number(clock[1]) <= 24 && Number(clock[2]) < 60) return { from: i, to: to0, say: clockWords(Number(clock[1]), Number(clock[2]), l), code: false };
  // a range: the figure before, a dash, this one ("10-20", "10 – 20")
  const dash = last && !last.code && /^\s?[-–—]\s?$/u.test(text.slice(last.end, i));
  // a sign: "-3" at the start of a word ("by -3", "(-3)")
  const sign = !dash && /[-−+]/u.test(before) && (i === 1 || /[\s([]/u.test(before2)) ? before : "";
  const f = s.includes(":") ? { words: s.split(":").map((x) => figureWords(x, l).words).join(" "), value: NaN, whole: false } : figureWords(s, l, text.slice(Math.max(0, i - 48), i));
  let words = f.words, to = to0;
  const pct = /^\s?%/u.exec(after), kilo = /^k(?![\p{L}\p{M}\p{N}])/iu.exec(after), enOrd = /^(?:st|nd|rd|th)(?![\p{L}\p{M}])/iu.exec(after);
  const taOrd = /^-?(?:ஆவது|வது)/u.exec(after), taAm = /^-?(?:ஆம்|ம்)(?![\p{L}\p{M}])/u.exec(after);
  if (pct) { to += pct[0].length; words += l === "ta" ? " சதவீதம்" : " percent"; }
  else if (kilo && Number.isFinite(f.value)) { to += 1; words = numberInWords(Math.round(f.value * 1000), l); }
  else if (f.whole && (enOrd || taOrd)) { to += (enOrd ?? taOrd)![0].length; words = l === "ta" ? taEnding(words, "ஆவது") : enOrdinal(words); }
  else if (f.whole && taAm) { to += taAm[0].length; words = l === "ta" ? taEnding(words, "ஆம்") : enOrdinal(words); }
  else if (l === "ta" && f.whole && f.value === 1 && /^\s(?:லட்ச|கோடி|ஆயிர)/u.test(after)) words = "ஒரு";
  else if (latinNext(after)) words += " ";
  if (sign) words = `${sign === "+" ? (l === "ta" ? "பிளஸ்" : "plus") : l === "ta" ? "மைனஸ்" : "minus"} ${words}`;
  if (dash) return { from: last!.end, to, say: l === "ta" ? ` முதல் ${words} வரை` : ` to ${words}`, code: false };
  return { from: sign ? i - 1 : i, to, say: words, code: false };
}

/**
 * The text with every number in it said in words, in `lang` (the sentence's language: sentenceLang). Run it after the number gate: it
 * says the same values the gate read (grouped and decimal figures as the gate reads them; lakh and crore words kept), a code's or a
 * PIN code's digits one by one. A number sign it cannot say is left, so holdsDigit() is true and the voice refuses the chunk.
 */
export function aloud(text: string, lang: SpokenLang): Aloud {
  const spans: Aloud["spans"] = [];
  let out = "", at = 0, last: { end: number; code: boolean } | null = null;
  const re = new RegExp(NUMBER.source, "gu");
  for (let m; (m = re.exec(text)); ) {
    const r = sayNumber(text, m.index, m[0], lang, last);
    if (!r || r.from < at) continue;
    out += text.slice(at, r.from);
    spans.push({ shown: [r.from, r.to], said: [out.length, out.length + r.say.length] });
    out += r.say;
    at = r.to;
    re.lastIndex = Math.max(re.lastIndex, r.to);
    last = { end: r.to, code: r.code };
  }
  return spans.length ? { text: out + text.slice(at), spans } : { text, spans };
}

/** Where a place in the words said (a voice's word boundary) sits in the text as shown; inside a number's words, the number's start. */
export function shownIndex(a: Aloud, i: number): number {
  let shift = 0;
  for (const sp of a.spans) {
    if (i < sp.said[0]) break;
    if (i < sp.said[1]) return sp.shown[0];
    shift = sp.shown[1] - sp.said[1];
  }
  return Math.max(0, i + shift);
}
