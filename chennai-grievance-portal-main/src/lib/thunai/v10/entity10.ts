/**
 * v10: names said by ear, found in a request (docs/jarvis/JARVIS_V10.md 4.2): one entity layer every lane asks.
 *
 *   findMentions(text, lex)   every name of the lexicon the request says, however the ears spelt it: each word run (one to four words) scored
 *                             against each entry's spellings by sound (phon10.phraseSim); a class word beside it ("cyclone", "saikilon",
 *                             "puyal", "protest") narrows the entries to its class and lowers the bar. A mention is "sure" (said back by
 *                             its own name, searched by the store's spellings), "ask" (between the floor and sure: "Cyclone Akvan?" in three
 *                             or four words, never a refusal and never the wrong story), or not a mention.
 *   classMention(text)        a class word heard with a name beside it that the lexicon does not know ("Cyclone Xyz"): a named event all
 *                             the same (the instant lane never answers a question that names something it does not know: 4.4).
 *
 * Pure. Thresholds from the research (v10-research/20-names-by-ear.md) and the owner's own turns; tuned on the dev set only.
 */
import { isEnglishWord } from "../english";
import { editDistance, fold } from "../v8/match";
import { placeWord } from "../v8/lang8";
import { topicGlossed } from "../v8/news8";
import type { Entity10 } from "./lexicon10";
import { classOf, earKeyJoined, phraseSim, type EntityClass } from "./phon10";

export interface Mention {
  entity: Entity10;
  score: number;
  /** "sure": act on it; "ask": confirm it in a few words first */
  band: "sure" | "ask";
  /** the words heard for it, as said */
  heard: string;
  /** the word span in the request's words */
  at: [number, number];
  /** a class word said with it ("cyclone"), if any */
  cls: EntityClass | null;
}

/** start values: a name said by itself must sound very close; next to its class word, a little less */
export const SURE = 0.9;
export const SURE_WITH_CLASS = 0.84;
export const ASK_FLOOR = 0.8;
/** two different entries this close are not told apart: ask, never guess */
export const TIE = 0.03;

/** the request's words as said (letters and marks; Tamil and Latin), with their folded forms */
interface W { raw: string; f: string; cls: EntityClass | null; stop: boolean }
const STOPWORDS = new Set(("a an the this that these those it its is are was were be do does did please can could would will you me my our i we to of in on at for from by with about " +
  "and or but so then now just any some what whats which who how when where why tell show open read give get news story article report latest today update updates " +
  "jarvis hey hi ok okay yes no sir madam la le ku pathi patthi paththi enna sollu sollunga padinga padi kaattu kaattunga thiranga thira pannunga pannu adha idha andha indha " +
  "seithi seidhi " +
  // (the Tanglish he, she, they and this one, never a name: "avan" sounded as Akvan, v10 review 2, finding 22; their case forms: TG_PRON)
  "avan aval avar avaru avanga avangal ivan ival ivar ivaru ivanga").split(/\s+/));
/** the Tanglish he, she, they and this one with the case and question endings the ears write ("avana", "avanukku", "avanoda", "avankitta",
 * "avangalukku", "avanaa"): never a name. v10 review 2, round 2: the bare forms alone were stopped, and "avana pathi sollu" was still asked back
 * "Cyclone Akvan?". Whole words only: "Avadi", "Avaniyapuram" are places */
const TG_PRON = /^[ai]va(?:n|l|r|ru|nga|ngal|rgal)(?:a|aa|ai|e|ey|o|um|ukku|kku|uku|ukkum|oda|odu|ode|odaya|udaya|kitta|kita|kitte|ta|tta|ala|aala|ale|aale|dhaan|thaan|daan|than)?$/;
const TA_STOP = /^(?:பற்றி|பத்தி|என்ன|சொல்லுங்க|சொல்லு|படிங்க|படி|காட்டு|காட்டுங்க|திறங்க|திற|செய்தி|நியூஸ்|அந்த|இந்த|அது|இது)/u;
/** the Tamil he, she, they and this one, with their case endings (அவன், அவனை, அவருக்கு, அவங்க): never a name (அவன் sounded as அக்வான், v10 review 2,
 * finding 22); whole words only, so a place that begins so (அவனியாபுரம்) still is one. Round 2: the stem with any of its spoken endings, the bare
 * spoken object and the question too (அவன, அவனா, அவனும், அவன்தான், அவனால், அவனிடம், அவங்கள, அவங்களோட): one letter off, they were still asked back */
const TA_PRON = /^(?:அவ|இவ)(?:(?:ன|ள|ர|ங்கள|ர்கள)(?:்|ை|ா|ே|ும்|ுக்கு|ுக்கா|ுக்கும்|ோட|ோடு|ோட்ட|ுடைய|ுட|ிடம்|ால்|ாலே|்கிட்ட|்கிட்டே|்ட|்ட்ட|்தான்|ைப்|ைத்தான்|ைதான்)?|ங்க(?:கிட்ட|தான்)?|ரு)$/u;
/** a Tamil verb's spoken and written endings (has come, is there, they said, it happened ...): never a name */
const TA_VERB = new RegExp(`(?:ருக்கு|ருக்கா|ருக்கும்|ருக்கிறது|ருக்கின்றன|ச்சு|ச்சா|ந்தது|ந்துச்சு|றாங்க|ராங்க|ிங்க|ுங்க|ீங்க|ாங்க|ுது|ுதா|ிறது|ின்றன|ின்றது|கிறார்|கிறார்கள்|ட்டாங்க|ட்டார்|னார்|னாங்க|லாம்|ணும்|ணுமா|வேண்டும்|` +
  // (and what went or happened, "திருட்டு போனது" as Pondy: news9, the dry run of 19 Nov)
  `னது|னதா|னதை|ட்டது|த்தது|ச்சது|ண்டது|ன்னது)$|^(?:போன|போய்|வந்த|போனா|வந்தா|போகும்|வரும்)$`, "u");

const wordsOf = (text: string): W[] => text.normalize("NFC").split(/[^\p{L}\p{M}\p{N}'’]+/u).filter(Boolean).map((raw) => {
  const f = fold(raw);
  const ta = /[஀-௿]/u.test(raw);
  return { raw, f, cls: classOf(raw), stop: ta ? TA_STOP.test(raw) || TA_PRON.test(raw) : STOPWORDS.has(f) || TG_PRON.test(f) };
});

/** The names the request says, best first; spans never overlap (the better mention keeps its words). */
export function findMentions(text: string, lex: Entity10[], o: { kinds?: Entity10["kind"][] } = {}): Mention[] {
  const ws = wordsOf(text);
  if (!ws.length || !lex.length) return [];
  const pool = o.kinds ? lex.filter((e) => o.kinds!.includes(e.kind)) : lex;
  const found: Mention[] = [];
  for (let i = 0; i < ws.length; i++) {
    if (ws[i].stop || ws[i].cls) continue;
    for (let n = 1; n <= 4 && i + n <= ws.length; n++) {
      const span = ws.slice(i, i + n);
      if (span.some((w) => w.stop || w.cls) && n > 1) break;
      const heard = span.map((w) => w.raw).join(" ");
      const hf = span.map((w) => w.f).join(" ");
      // an English word is no name by ear ("fast", "sea", "bird" is not Bharati: v8's dev set): a span with one counts only by an exact spelling
      const english = span.some((w) => /^[a-z]+$/.test(w.f) && isEnglishWord(w.f));
      // (a name the ears split into words, one of them English, "Vela cherry", "Deccan Chronical": by ear when sure, never asked; the names
      // research's must-match list, 20-names-by-ear.md 7.4). v10 dev2: or split into a two-letter piece that is no word at all and an English
      // word, beside its class word ("cyclone ak van", "ak wan puyal": Akvan; "cyclone van" alone is no name)
      const clsBy = ws[i - 1]?.cls ?? ws[i + n]?.cls ?? null;
      const mixed = english && n >= 2 && (span.some((w) => /^[a-z]{3,}$/.test(w.f) && !isEnglishWord(w.f) && !/['’]/.test(w.raw))
        || (!!clsBy && span.some((w) => /^[a-z]{2}$/.test(w.f) && !isEnglishWord(w.f))));
      // nor a Tamil verb or a word with a verb's ending ("வந்திருக்கு" is not Vandalur's வண்டலூர்)
      if (span.some((w) => /[஀-௿]/u.test(w.raw) && TA_VERB.test(w.raw.normalize("NFC")))) break;
      // nor a word the news reads as a topic (கோயில், திருட்டு, தீ, "kovil": the gloss table's): "கோயில்ல திருட்டு" was asked back as Coilathur
      // (கொளத்தூர்) on the store of 20 Nov
      if (span.some((w) => topicGlossed(w.raw))) break;
      if (hf.replace(/\s+/g, "").length < 3) continue;
      // the class word right before or after the run ("Cyclone Aquan", "Murasar Saikilon", "அக்வான் புயல்")
      const cls = ws[i - 1]?.cls ?? ws[i + n]?.cls ?? null;
      const hk = earKeyJoined(hf);
      for (const e of pool) {
        // a class said: only entries of that class (a storm's name is no place)
        if (cls && e.cls && e.cls !== cls) continue;
        if (cls === "storm" && e.kind !== "storm") continue;
        // the sound keys first (cheap): the same first consonant, or the entry's key within reach
        if (!e.keys.some((k) => k[0] === hk[0] || k.replace(/^a/, "")[0] === hk.replace(/^a/, "")[0])) continue;
        let s = 0;
        // (Tamil letters heard match a name's Tamil spellings; across scripts only beside a class word ("அக்வான் புயல்"): Tamil verbs sound like
        // Latin names, "வந்திருக்கு" like Vandalur, on the real store, 19 Nov)
        const taHeard = /[஀-௿]/u.test(heard);
        for (const sp of e.spellings) {
          // (or English words that, joined, are the name's letters but one: "Vela cherry" is "velacherry", Velachery)
          const joined = n >= 2 && hf.replace(/\s+/g, "").length >= 7 && editDistance(hf.replace(/\s+/g, ""), fold(sp).replace(/\s+/g, "")) <= 1;
          if (english && !mixed && !joined && fold(sp) !== hf) continue;
          if (taHeard && !cls && !/[஀-௿]/u.test(sp)) continue;
          s = Math.max(s, phraseSim(heard, sp));
          if (s >= 1) break;
        }
        if (s < ASK_FLOOR) continue;
        const sure = cls && e.kind === "storm" ? SURE_WITH_CLASS : cls ? SURE_WITH_CLASS + 0.02 : SURE;
        if (english && s < sure) continue;
        // a place said by itself is the console's own matter; it is a mention only when it sounds like the place (no "ask" band for places)
        if (e.kind === "place" && s < sure) continue;
        found.push({ entity: e, score: s + (cls && e.cls === cls ? 0.02 : 0), band: s >= sure ? "sure" : "ask", heard, at: [i, i + n], cls });
      }
    }
  }
  // the best mention of each span; spans never overlap; two entries too close on one span: asked, never guessed
  // (the same score: the shorter span, so a word heard after the name, "Arlakar health", stays the request's own)
  found.sort((a, b) => b.score - a.score || (a.at[1] - a.at[0]) - (b.at[1] - b.at[0]) || b.entity.n - a.entity.n);
  const out: Mention[] = [];
  for (const m of found) {
    if (out.some((x) => x.at[0] < m.at[1] && m.at[0] < x.at[1])) {
      // the same span, another entry this close: the kept one is asked back
      const kept = out.find((x) => x.at[0] === m.at[0] && x.at[1] === m.at[1]);
      if (kept && kept.entity.id !== m.entity.id && kept.score - m.score < TIE && kept.entity.kind === m.entity.kind) kept.band = "ask";
      continue;
    }
    out.push({ ...m });
  }
  return out;
}

/** A class word with a name beside it that the lexicon does not know: { cls, name } ("Cyclone Xyz", "the Zorbo protest"), else null */
export function classMention(text: string): { cls: EntityClass; name: string } | null {
  const ws = wordsOf(text);
  for (let i = 0; i < ws.length; i++) {
    const c = ws[i].cls;
    if (!c) continue;
    for (const j of [i + 1, i - 1]) {
      const w = ws[j];
      if (!w || w.stop || w.cls) continue;
      const ta = /[஀-௿]/u.test(w.raw);
      // a name: no English word ("Cyclone update"), no district place ("the Adyar fire" is the console's view of Adyar), at least three letters
      if (w.f.length >= 3 && (ta || !isEnglishWord(w.f)) && !placeWord(w.f) && !placeWord(w.raw)) return { cls: c, name: w.raw };
    }
  }
  return null;
}

/** what a mention is said back as when asked ("Cyclone Akvan?", "Pallikaranai?") */
export const askBack = (m: Mention, lang: "en" | "ta"): string => {
  const n = m.entity.name;
  if (lang === "ta") return m.entity.kind === "storm" ? `${m.entity.core} புயலா?` : `${n}-ஆ?`;
  return `${n}?`;
};
