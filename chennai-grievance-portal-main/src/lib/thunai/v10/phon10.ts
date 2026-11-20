/**
 * v10: names said by ear (docs/jarvis/JARVIS_V10.md 4.2). The owner, 19 Nov: "I'm not pronouncing it correctly. It should understand it."
 *
 *   earKey(word)        a coarse sound key for a name as an Indian English or Tamil speaker says it and a speech-to-text writes it: the
 *                       consonants in order, a first vowel marked, the distinctions Tamil does not make folded away (voicing: k/g, t/d,
 *                       p/b; aspiration: th, dh, kh, bh; the three n's, l's and r's; v/w; s/sh/ch/z; f/p; q/qu/k), doubled letters and
 *                       the enunciative final vowel ("Murasu", "Kasimedu") dropped. "Aquan", "Akvan" and "Akwan" are one key; "saikilon"
 *                       and "cyclone" are one key; "ராஜவுகாந்தி நகர்" and "Rajiv Gandhi Nagar" joined are one key.
 *   earSim(a, b)        0..1: how close two words sound: their ear keys' edit distance, length-weighted, together with v8's Tamil-loose key
 *                       (match.ts looseKey) so the vowels still count when the consonants agree.
 *   phraseSim(h, n)     0..1: a heard phrase against a name of one to four words, joined or word by word.
 *
 * Pure, no I/O. The thresholds are starting values (docs/jarvis/v10-research/20-names-by-ear.md); the entity layer (entity10.ts) decides.
 */
import { editDistance, fold, jaroWinkler, looseKey, stemsOf } from "../v8/match";

/** the sound classes a speech-to-text spells differently for the same sound in Tamil and Indian English */
export function earKey(word: string): string {
  let s = fold(word).replace(/\s+/g, "");
  if (!s) return "";
  // spellings first (before single letters are folded): English digraphs and their Tamil-ear equivalents
  s = s.replace(/tion$/, "san").replace(/sion$/, "san")
    .replace(/qu/g, "kv").replace(/q/g, "k").replace(/ck/g, "k").replace(/x/g, "ks")
    .replace(/ph/g, "p").replace(/f/g, "p").replace(/zh/g, "l").replace(/sh|ch/g, "s").replace(/z/g, "s").replace(/w/g, "v")
    // c is s before e, i, y (and "cy" as in cyclone), k otherwise
    .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k")
    // h after a consonant is aspiration (th, dh, kh, gh, bh, jh): gone; a first h stays as h
    .replace(/([^aeiouh])h/g, "$1")
    // voicing is one sound in Tamil script: k/g, t/d, p/b
    .replace(/g/g, "k").replace(/d/g, "t").replace(/b/g, "p")
    // "-ng-" before k is the nasal of the k ("Kodungaiyur": nk); ny/nj as n
    .replace(/nj|ny/g, "n");
  // y between or after vowels is a glide ("Kodungaiyur", "Velachery"); a first y stays
  s = s.replace(/([aeiou])y/g, "$1").replace(/y(?=[aeiou])/g, (m, i) => (i === 0 ? m : ""));
  // the enunciative final vowel of a Tamil name, and any final vowel of a long one ("Murasu", "Kasimedu", "Pallikaranai")
  if (s.length > 4) s = s.replace(/[aeiou]+$/, "");
  // the consonants in order, doubled letters once; a first vowel kept as "a" (its quality varies by ear: "Akvan"/"Ekvan")
  const first = /^[aeiou]/.test(s) ? "a" : "";
  const cons = s.replace(/[aeiouy]/g, "").replace(/([a-z])\1+/g, "$1");
  return first + cons;
}

/** an ear key of a phrase, its words joined (a name the ears split or joined: "Kasi medu", "Vela cherry", "rajavukanti nakar") */
export const earKeyJoined = (phrase: string): string => earKey(fold(phrase).replace(/\s+/g, ""));

/** 0..1 for two ear keys: 1 equal; else 1 - (edit distance / the longer length), only from 3 letters up */
export function earKeySim(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const n = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 3) return 0;
  return Math.max(0, 1 - editDistance(a, b) / n);
}

/**
 * How close two single words sound, 0..1. The ear keys carry the consonants; v8's loose keys carry the vowels. Equal ear keys and close loose
 * keys: the same word by ear. A key of two consonants is too little to tell names apart ("Adyar", "Atur"): only equal loose keys then.
 */
export function earSim(a: string, b: string): number {
  const la = looseKey(fold(a).replace(/\s+/g, "")), lb = looseKey(fold(b).replace(/\s+/g, ""));
  if (!la || !lb) return 0;
  if (la === lb) return 1;
  const ea = earKey(a), eb = earKey(b);
  const jw = jaroWinkler(la, lb);
  // (the consonants, the first vowel's mark aside: two consonants are too few to tell names apart by ear, "Adyar" and "Atur" are both "tr")
  const ca = ea.replace(/^a/, ""), cb = eb.replace(/^a/, "");
  if (ca.length < 3 || cb.length < 3) return jw >= 0.94 && Math.abs(la.length - lb.length) <= 1 ? jw * 0.95 : 0;
  const ek = earKeySim(ea, eb);
  // the same consonants by ear: as close as the vowels allow, never below 0.86 ("aquan"/"akvan", "saikilon"/"cyclone"); vowels wholly unlike
  // are another word
  if (ek === 1) return jw >= 0.7 ? Math.max(0.86, Math.min(0.97, jw + 0.05)) : 0;
  // one consonant apart in a key of five or more, and the spellings close (a misheard letter: "murasar"/"murasu" is two apart, below)
  if (ek >= 0.8) return Math.min(0.9, (jw + ek) / 2);
  return jw >= 0.92 && ek >= 0.6 ? Math.min(0.85, jw * 0.9) : 0;
}

/** a word and the stems its Tamil or Tanglish case endings hide ("Akvanla", "புயலுக்கு"), the word itself first */
export const formsOf = (w: string): string[] => [w, ...stemsOf(w)];

/** the best ear similarity of a heard word to a name's word, through the heard word's case endings */
export const wordEar = (heard: string, name: string): number => Math.max(...formsOf(heard).map((f, i) => earSim(f, name) * (i === 0 ? 1 : 0.98)));

/**
 * A heard phrase (1-4 words) against a name (1-4 words), 0..1: the whole phrase joined against the whole name joined (the ears split
 * "Kasimedu" or joined "Rajiv Gandhi"), else every word of the name heard in order. A name's generic words ("nagar", "road", "street",
 * "salai") must be heard too, but are not enough alone.
 */
export function phraseSim(heard: string, name: string): number {
  const hw = fold(heard).split(" ").filter(Boolean), nw = fold(name).split(" ").filter((x) => x && x !== "the");
  if (!hw.length || !nw.length) return 0;
  const joined = earSim(hw.join(""), nw.join(""));
  if (nw.length === 1) return Math.max(joined, ...hw.map((h) => wordEar(h, nw[0])));
  // word by word, in order: each name word matched by a heard word after the last one matched
  let at = 0, sum = 0, distinct = 0;
  for (const n of nw) {
    let best = 0, bi = -1;
    for (let i = at; i < hw.length; i++) { const s = wordEar(hw[i], n); if (s > best) { best = s; bi = i; } }
    if (best < 0.8) { sum = -1; break; }
    sum += best; at = bi + 1;
    if (!GENERIC.has(n)) distinct++;
  }
  const byWord = sum > 0 && distinct > 0 ? sum / nw.length : 0;
  return Math.max(joined, byWord);
}
const GENERIC = new Set(["nagar", "salai", "road", "street", "main", "east", "west", "north", "south", "colony", "new", "old", "puram", "pettai", "pet", "kuppam", "theru", "teru", "nakar"]);

/**
 * Class words said by ear: the kind of thing a name is ("Cyclone Akvan", "the Kodungaiyur protest"). A class word next to a name narrows the
 * names it can be and lowers the bar for the name (entity10.ts). Each class: the word as written, and as an Indian English speaker or Tamil
 * script writes it ("saikilon", "சைக்ளோன்", "puyal", "புயல்").
 */
export type EntityClass = "storm" | "protest" | "fire" | "accident" | "crime" | "court" | "place" | "person" | "outlet" | "dept" | "event";
const CLASS_WORDS: [EntityClass, string[]][] = [
  ["storm", ["cyclone", "cyclonic", "storm", "puyal", "puyalu", "depression", "typhoon", "hurricane", "low pressure"]],
  ["protest", ["protest", "agitation", "dharna", "porattam", "poraattam", "aarpattam", "marial", "strike"]],
  ["fire", ["fire", "blaze", "thee", "theevibathu"]],
  ["accident", ["accident", "crash", "vibathu", "vipathu"]],
  ["court", ["court", "verdict", "order", "ruling", "neethimandram"]]
];
/** Tamil-script class words, by their own letters (romanised they collide with other words) */
const CLASS_TA: [EntityClass, RegExp][] = [
  ["storm", /^(?:புயல்|புயலு?|சைக்ளோன்|சைக்கிளோன்|சைக்லோன்|சைக்கலோன்|சைகிளோன்|சைக்கிலோன்|காற்றழுத்த)/u],
  ["protest", /^(?:போராட்ட|ஆர்ப்பாட்ட|மறியல்|ப்ரொட்டெஸ்ட்|புரொட்டெஸ்ட்)/u],
  ["fire", /^(?:தீ$|தீவிபத்|தீப்பிடி|ஃபயர்)/u],
  ["accident", /^(?:விபத்|ஆக்சிடென்ட்|ஆக்ஸிடென்ட்)/u],
  ["court", /^(?:நீதிமன்ற|உயர்நீதிமன்ற|உச்சநீதிமன்ற|கோர்ட்)/u]
];

/** the class a heard word names by ear, or null ("saikilon" and "சைக்கிளோன்" are a cyclone; "cycle" is not) */
export function classOf(word: string): EntityClass | null {
  const raw = word.normalize("NFC").replace(/[^\p{L}\p{M}]/gu, "");
  if (!raw) return null;
  if (/[஀-௿]/u.test(raw)) { for (const [c, re] of CLASS_TA) if (re.test(raw)) return c; return null; }
  const w = raw.toLowerCase();
  for (const [c, words] of CLASS_WORDS) {
    for (const x of words) {
      if (x.includes(" ")) continue;
      if (w === x || formsOf(w).includes(x)) return c;
      // by ear only for a long class word and a heard word that is no other English word of its shape ("cycle", "cyclist" are not cyclone)
      if (x.length >= 6 && w.length >= 5 && !NOT_CLASS.has(w) && earSim(w, x) >= 0.86) return c;
    }
  }
  return null;
}
/** heard words that sound near a class word but are words of their own */
const NOT_CLASS = new Set(["cycle", "cycles", "cyclist", "cyclists", "cycling", "silicon", "salon", "saloon", "stormy", "story", "stories", "protect", "protected", "protection", "fired", "fires", "accidental", "courts", "courtyard", "order", "orders"]);
