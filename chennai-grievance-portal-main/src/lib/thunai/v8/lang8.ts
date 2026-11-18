/**
 * v8: the reply's language is the language of the Collector's own words on this turn (the owner's example 4; research 20, R3).
 *
 *   Tamil letters (at least half of the letters that are not a place name): Tamil, unless the Tamil-script words are English words written in
 *   Tamil letters ("ஷோ தி சிவியர் கேசஸ்") with no Tamil grammar among them: English.
 *   Latin letters: a Tamil word at the end of the clause (Tamil is verb-final: "severe cases kaattunga", "Adyar la enna problem"), or more
 *   Tamil words than English function words: Tamil (Tanglish); else any English word: English.
 *   No language in it at all (a place name alone, "ok"): the Collector's last language that had one, else English.
 * Never the speech-to-text's label, the console's setting or Jarvis's own last reply: those are what made spoken English come back in Tamil.
 * Pure; runs in the browser and on the server.
 */
import { AREA_WORDS } from "../areas";
import { LOCALITY_WORDS } from "../areas.localities";
import { isEnglishWord } from "../english";
import { ZONES } from "../lexicon";
import { romanise } from "../xlit";

export type L8 = "en" | "ta";

/** Tamil grammar in Latin letters: question words, verbs and their endings, case endings said as words, particles */
const TG = new Set(("enna ennachu enga engey epdi eppadi eppo eppodhu evlo evvalavu ethana yaaru yaar edhu ethu yen yenna enaku enakku " +
  "kaattu kaatu kattu kaattunga kaatunga kattunga katunga kaami kaaminga kaminga sollu sollunga sollungal sollungo paaru paru paarunga pannu pannunga pannungal panni " +
  "podu podunga kudu kudunga padi padinga padiunga padiyunga vaasi vasi thira thiranga thirandhu maathu mathu maathunga oppidu oppidunga theriyuma therinjukkanum " +
  "irukku irukka irukkaa iruka irundhu illa illai venum vendaam venaam aachu achu aagudhu nadakkudhu nadandhudhu nadanthathu varudhu poguthu pochu " +
  "la le ku kku ukku oda ode kitta pathi patthi paththi dhaan thaan nu nga unga ga da di pa ma").split(/\s+/));
/** Tamil content words in Latin letters */
const TC = new Set(("mazhai mazha kuppai thanni thaneer vellam saalai salai naalaikku naalai innaiku inniku indru romba konjam nilavaram nilamai pugar pugaar " +
  "seithi seidhi seythi sethi kadaisi mudhal rendavadhu moonavadhu adhu idhu andha indha antha intha avanga avaru ellam ellaam mattum innum vera").split(/\s+/));
/** English grammar: articles, prepositions, auxiliaries, pronouns, question words, the console's command verbs */
const EG = new Set(("the a an of to in on at for from with about into over by and or but this that these those it its is are was were be been am do does did have has had " +
  "what whats which who whom whose how when where why can could would will shall should may might must me my mine we our us you your he she they them their i im " +
  "show open give tell compare list read go take bring pull find check look let get please also only just more less any some all not no " +
  "there here than then now today tomorrow yesterday week month").split(/\s+/));
/** words that carry no language: backchannels, the name, the console's own short codes */
const NEUTRAL = new Set(("ok okay okk seri sari haan hmm mm um uh ah aa er jarvis hey hi hello yes yeah no aqi pwd gcc tvk cm mla mp dro rdo vao pa ae aee sla ward zone").split(/\s+/));

const TAMIL = /[஀-௿]/u;
const tamilWords = (s: string) => s.split(/[^஀-௿]+/u).filter(Boolean);
const latinWords = (s: string) => s.toLowerCase().replace(/[’']/g, "").split(/[^a-z]+/).filter(Boolean);

/** Tamil grammar in Tamil letters: a verb or question word, a case ending glued on (இல், க்கு, ஐ ...) */
const TA_GRAMMAR = /(?:என்ன|எங்கே|எங்க|எப்படி|எப்போ|எத்தனை|எவ்வளவு|யார்|ஏன்|எது|காட்டு|சொல்|பார்|திற|படி|போடு|கொடு|இருக்கு|இல்லை|உள்ளது|ஆச்சு|நடக்க|வேண்டும்|ங்க|ுங்கள்|ில்|ிலே|க்கு|ுக்கு|யை|ை|ோட|ஆ$)/u;

export interface Lang8Opts {
  /** a word that names a place, a zone, a body or a person (neutral): the district's own names */
  isName?: (word: string) => boolean;
  /** the Collector's last turn's language that had one */
  last?: L8 | null;
}

/** "en", "ta", or null when the words carry no language */
export function wordsLang(text: string, o: Lang8Opts = {}): L8 | null {
  const isName = o.isName ?? (() => false);
  const t = text.normalize("NFC");
  // Tamil letters: the words that are not a district name
  const ta = tamilWords(t).filter((w) => !isName(w) && !isName(romanise(w).replace(/\s+/g, "")));
  const la = latinWords(t).filter((w) => !NEUTRAL.has(w) && !isName(w));
  const taLetters = ta.join("").length, laLetters = la.join("").length;
  if (ta.length && taLetters >= laLetters) {
    // English written in Tamil letters, with no Tamil grammar: English
    const grammar = ta.some((w) => TA_GRAMMAR.test(w));
    const asEnglish = ta.filter((w) => isEnglishWord(romanise(w).replace(/\s+/g, "").toLowerCase())).length;
    if (!grammar && asEnglish / ta.length >= 0.6 && ta.length >= 2) return "en";
    return "ta";
  }
  // a place said in Tamil letters alone ("அடையாறு?"): the letters are the evidence (the review, 18 Nov)
  if (!la.length) return ta.length || TAMIL.test(t) ? "ta" : null;
  const tg = la.filter((w) => TG.has(w)).length, tc = la.filter((w) => TC.has(w)).length, eg = la.filter((w) => EG.has(w)).length;
  const last = la[la.length - 1];
  // Tamil is verb-final: a Tamil word ending the clause makes it Tanglish ("severe cases kaattunga")
  if (TG.has(last) && !EG.has(last)) return "ta";
  if (tg + tc > eg) return "ta";
  const ec = la.filter((w) => !TG.has(w) && !TC.has(w) && !EG.has(w) && isEnglishWord(w)).length;
  if (eg + ec >= 1) return "en";
  return null;
}

const ZONE_WORDS: ReadonlySet<string> = new Set(Object.values(ZONES).flatMap((z) => [...z.en.flatMap((n) => n.split(/[\s-]+/)), ...z.ta]));
/** a word of a district place's name (a zone, an area, a locality, in English or Tamil letters): it carries no language */
export function placeWord(word: string): boolean {
  const x = word.toLowerCase();
  if (ZONE_WORDS.has(word) || ZONE_WORDS.has(x)) return true;
  if (x.length < 4 || TG.has(x) || EG.has(x) || TC.has(x)) return false;
  return AREA_WORDS.has(x) || LOCALITY_WORDS.has(x);
}
/** a word of a zone's or one of the 250 areas' names (not the street list, which holds people's names: "Ramesh" is a person to the gate) */
export function areaWord(word: string): boolean {
  const x = word.toLowerCase();
  return ZONE_WORDS.has(word) || ZONE_WORDS.has(x) || (x.length >= 4 && AREA_WORDS.has(x));
}

/** The reply's language for this turn: its own words, else the last language the Collector used, else English. */
export const replyLang8 = (text: string, o: Lang8Opts = {}): L8 => wordsLang(text, o) ?? o.last ?? "en";
