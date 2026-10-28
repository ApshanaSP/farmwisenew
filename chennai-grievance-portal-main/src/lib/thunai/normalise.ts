/**
 * Stage 1 of understanding: Tamil script, Latin script and mixed (Tanglish) speech into one token stream.
 *
 * - Number words become digits: English (one … twenty, first … fifteenth, 7th), Tamil formal and colloquial (ஏழு, ஏழாவது,
 *   ஏழாம், பதினஞ்சு), Tanglish (ezhu, padhinanju). Exact tokens only, so அடையாறு (a river name ending in ஆறு, "six") is
 *   never read as 6, and ஐந்து (5) is never confused with பதினைந்து (15).
 * - Politeness words are dropped (please, sir, madam, ஐயா, சார், the -ங்க ending).
 * - Tamil-script loan words become their English token (ஜோன் -> zone, ஃபில்டர் -> filter).
 * - Tamil case endings are left on the token; link.ts matches Tamil names by stem, so அடையாற்றில் still reaches Adyar.
 */

const TA_NUM: [string, number][] = [
  ["பத்தொன்பது", 19], ["பதினெட்டு", 18], ["பதினேழு", 17], ["பதினாறு", 16], ["பதினைந்து", 15], ["பதினஞ்சு", 15],
  ["பதினான்கு", 14], ["பதினாலு", 14], ["பதிமூன்று", 13], ["பதிமூணு", 13], ["பன்னிரண்டு", 12], ["பன்னெண்டு", 12],
  ["பதினொன்று", 11], ["பதினொண்ணு", 11], ["இருபது", 20], ["ஒன்பது", 9], ["ஒம்பது", 9], ["பத்து", 10], ["எட்டு", 8],
  ["ஏழு", 7], ["ஆறு", 6], ["ஐந்து", 5], ["அஞ்சு", 5], ["நான்கு", 4], ["நாலு", 4], ["மூன்று", 3], ["மூணு", 3],
  ["இரண்டு", 2], ["ரெண்டு", 2], ["ஒன்று", 1], ["ஒண்ணு", 1]
];
/** ordinal stems: ஏழாவது / ஏழாம் = 7th */
const TA_ORD: [string, number][] = [
  ["பத்தொன்பதா", 19], ["பதினெட்டா", 18], ["பதினேழா", 17], ["பதினாறா", 16], ["பதினைந்தா", 15], ["பதினஞ்சா", 15],
  ["பதினான்கா", 14], ["பதினாலா", 14], ["பதிமூன்றா", 13], ["பன்னிரண்டா", 12], ["பதினொன்றா", 11], ["இருபதா", 20],
  ["ஒன்பதா", 9], ["பத்தா", 10], ["எட்டா", 8], ["ஏழா", 7], ["ஆறா", 6], ["ஐந்தா", 5], ["அஞ்சா", 5], ["நான்கா", 4],
  ["நாலா", 4], ["மூன்றா", 3], ["மூணா", 3], ["இரண்டா", 2], ["ரெண்டா", 2], ["ஒன்றா", 1], ["முதலா", 1]
];
const TA_ORD_END = /^(வது|ம்|வதை|வதுக்கு|வதுல|வதில்)$/;
/** a number word may carry a case ending: ஏழுக்கு, பதினஞ்சுக்கு, அஞ்சுல */
const TA_NUM_END = /^(க்கு|க்குள்|ல|ல்|ஐ|ம்|வும்)?$/;

const EN_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11,
  twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  // Tanglish
  onnu: 1, rendu: 2, irandu: 2, moonu: 3, munu: 3, naalu: 4, nalu: 4, anju: 5, aindhu: 5, aaru: 6, ezhu: 7, ellu: 7,
  ettu: 8, ombodhu: 9, ombadhu: 9, onbadhu: 9, pathu: 10, padhu: 10, padhinonnu: 11, pannendu: 12, padhimoonu: 13,
  padhinaalu: 14, padhinanju: 15, padinanju: 15, padhinaaru: 16
};

const LOAN: Record<string, string> = {
  "ஜோன்": "zone", "சோன்": "zone", "ஜோனை": "zone", "ஃபில்டர்": "filter", "ஃபில்டரை": "filter", "பில்டர்": "filter", "பில்டரை": "filter",
  "வீக்லி": "weekly", "டெய்லி": "daily", "மந்த்லி": "monthly", "கிரிட்டிகல்": "critical", "மேப்": "map", "மேப்ல": "map", "மேப்பில்": "map",
  "லேயர்": "layer", "ஜூம்": "zoom", "கம்பேர்": "compare", "டிராஃப்ட்": "draft", "கன்ஃபர்ம்": "confirm", "ஓபன்": "open",
  "க்ளோஸ்": "close", "டார்க்": "dark", "லைட்": "light", "மோட்": "mode", "சேவ்": "save", "செண்ட்": "send", "டாஷ்போர்டு": "dashboard"
};

const NUM_CONTEXT = new Set(["zone", "ward", "confirm", "click", "back", "undo", "filter", "to", "number", "step", "steps", "press", "tap", "உறுதி", "uruthi"]);

const POLITE = new Set(["please", "pls", "plz", "kindly", "sir", "madam", "mam", "maam", "thunai", "hey", "ok", "okay",
  "ஐயா", "சார்", "மேடம்", "தயவுசெய்து", "துணை", "ப்ளீஸ்"]);

export interface Normalised {
  /** lower-case tokens; numbers as digit strings */
  tokens: string[];
  /** the tokens joined by single spaces */
  text: string;
  /** Tamil script in the sentence */
  tamil: boolean;
}

/** A Tamil number word (with an optional case ending) or ordinal to its value, else null. */
export function taNumber(tok: string): number | null {
  for (const [w, n] of TA_NUM) if (tok.startsWith(w) && TA_NUM_END.test(tok.slice(w.length))) return n;
  for (const [w, n] of TA_ORD) if (tok.startsWith(w) && TA_ORD_END.test(tok.slice(w.length))) return n;
  return null;
}

export function enNumber(tok: string): number | null {
  if (/^\d{1,4}$/.test(tok)) return Number(tok);
  const m = /^(\d{1,3})(st|nd|rd|th|aavadhu|vadhu|ku|kku|la|a)$/.exec(tok);
  if (m) return Number(m[1]);
  if (tok in EN_NUM) return EN_NUM[tok];
  return null;
}

export function normalise(input: string): Normalised {
  const tamil = /[஀-௿]/.test(input);
  const cleaned = input
    .normalize("NFC")
    .replace(/[௦-௯]/g, (d) => String(d.charCodeAt(0) - 0x0be6)) // Tamil digits
    .toLowerCase()
    // "filter-a", "zone-ku", "Adyar-la": Tanglish case endings glued with a hyphen
    .replace(/-(a|ah|ku|kku|la|le|oda|ode|ai|um|nu|ah|kitta)\b/g, " ")
    .replace(/[“”"'`’‘]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s.%:/-]/gu, " ")
    .replace(/(\d)\s*km\b/g, "$1 km")
    .replace(/\s+/g, " ")
    .trim();
  const out: string[] = [];
  for (let raw of cleaned.split(" ")) {
    raw = raw.replace(/^[.\-:/]+|[.\-:/]+$/g, "");
    if (!raw) continue;
    // polite verb endings: "kaatunga", "காட்டுங்க" -> the verb (plural nouns such as மாவட்டங்கள் keep theirs)
    const tok = raw.replace(/ுங்க$/, "ு").replace(/^(.{3,}u)(nga|ngo)$/, "$1");
    if (POLITE.has(tok)) continue;
    if (tok in LOAN) { out.push(LOAN[tok]); continue; }
    const ta = /[஀-௿]/.test(tok) ? taNumber(tok) : null;
    if (ta != null) { out.push(String(ta)); continue; }
    // "one" is a number after a counting word ("zone one", "confirm one"); otherwise it is a pronoun ("the next one")
    if (tok === "one" && !NUM_CONTEXT.has(out[out.length - 1] ?? "")) { out.push(tok); continue; }
    const en = enNumber(tok);
    if (en != null) { out.push(String(en)); continue; }
    out.push(tok);
  }
  return { tokens: out, text: out.join(" "), tamil };
}

/** Reply in Tamil when the Collector spoke Tamil or Tanglish. */
const TANGLISH = /\b(kaatu|kattu|kaattu|maathu|mathu|maatru|pannu|pannunga|mattum|illa|vendaam|venam|sollu|po|poi|edhu|enna|evlo|evvalavu|epdi|enga|naalaikku|innaiku|indha|andha|idha|adha|anuppu|nirutthu|niruthu|podhum|paaru|paru|thirai|varudhu|irukku|aagudhu|kelu|kitta|thiru|thara|vaa|pakkathu|ellaam|ellam)\b/;
export function detectLang(input: string): "en" | "ta" {
  if (/[஀-௿]/.test(input)) return "ta";
  return TANGLISH.test(input.toLowerCase()) ? "ta" : "en";
}

/**
 * The "skeleton" of a Latin word for fuzzy matching across spellings: Thandaiyarpet, Tondiarpet and Tondiarpettai meet.
 * Aspirates and long vowels fold, doubled letters squash, vowels after the first letter drop.
 */
export function skeleton(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/zh/g, "l").replace(/sh/g, "s").replace(/ch/g, "c").replace(/kh/g, "k")
    .replace(/ph/g, "p").replace(/bh/g, "b").replace(/gh/g, "g").replace(/w/g, "v").replace(/y/g, "")
    .replace(/(.)\1+/g, "$1");
  return w.charAt(0) + w.slice(1).replace(/[aeiou]/g, "");
}

/** Levenshtein distance, capped (returns cap + 1 when the words are further apart). */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Does a Tamil token carry this Tamil name, with a case ending? How the ending attaches depends on how the name ends:
 * - in -u (அடையாறு, காலாண்டு): the -u and its consonant change (அடையாற்றில், அடையாறை), so match the name without them;
 * - in -am (வாரம், மாதம்): -ம் becomes -த்து-/-ங்- (வாரத்துக்கு, மாதத்தில்), so the next letter must be த, ங or ம
 *   (which keeps வாரியம், "board", from reading as வாரம், "week");
 * - in another consonant (அம்பத்தூர்): the ending's vowel sits on it (அம்பத்தூரை), so drop the pulli;
 * - in a vowel (மணலி, தண்டையார்பேட்டை): the ending follows the whole name (மணலியில்).
 */
export function taMatch(tok: string, name: string): boolean {
  if (tok === name) return true;
  const ch = [...name];
  const n = ch.length;
  if (n < 3) return false;
  const last = ch[n - 1], prev = ch[n - 2];
  let stem: string;
  let restOk = (_: string) => true;
  if (last === "ு" || last === "ூ") stem = ch.slice(0, -2).join("");
  else if (last === "்" && prev === "ம") { stem = ch.slice(0, -2).join(""); restOk = (r) => /^[தஙம]/.test(r); }
  else if (last === "்") stem = ch.slice(0, -1).join("");
  else stem = name;
  if ([...stem].length < 2 || !tok.startsWith(stem)) return false;
  const rest = tok.slice(stem.length);
  return rest.length > 0 && [...rest].length <= 9 && restOk(rest);
}
