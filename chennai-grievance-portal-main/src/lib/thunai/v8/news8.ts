/**
 * v8: a story asked for by what it is about, and a short news question (the owner's examples 1 and 2; docs/jarvis/JARVIS_V8.md).
 *
 *   newsRequest(text, o)  "open the Supreme Court news on Palikan", "the Pallikaranai marsh story", "read The Hindu's piece on the Metro",
 *                         "the Nungambakkam subway one, open it", a headline read aloud and "that news", Tamil and Tanglish the same: a
 *                         story by its topic ({ kind: "story" }). "Any news on the cyclone?", "what's the latest on the marsh", "what are the
 *                         papers saying about X": a news question ({ kind: "ask" }). Null when it is neither (the console's own cases, a
 *                         page, the news panel with no topic: "open the news", "today's news").
 *   rankStories(req, items, o)  every candidate (the stories on screen first, then the dashboard's stored news) scored against the topic:
 *                         IDF-weighted fuzzy matching of each topic word to the headline's words (match.ts), a bonus for being on screen, a
 *                         place named in the request that the story does not mention vetoes it (research 10, rec 4).
 *   pickStory(ranked)     the best story when it clears the floor; the runner-up of another story is kept to offer ("the other one").
 *                         Several outlets' reports of one event are one story: the one on screen, else the newest, is read.
 *
 * Pure: no network. The server (v8/newsfind.ts) supplies the store's stories; the browser sends the sentence and what is on screen.
 */
import { editDistance, enStem, fold, jaroWinkler, keySim, looseKey, skeleton, stemsOf, tokensOf } from "./match";
import { placeWord } from "./lang8";
import { ordWord, ordWordsOf } from "./ord8";
import { isEnglishWord } from "../english";

/** what the Collector says short for a name the headlines spell out: each must be in the headline, all its words */
const SAYS_FOR: Record<string, string[]> = { cm: ["chief", "minister"], hc: ["high", "court"], sc: ["supreme", "court"], dmk: ["dmk"], gcc: ["corporation"],
  tn: ["tamil", "nadu"], pm: ["prime", "minister"], mla: ["mla"], cmwssb: ["metrowater"], rmc: ["meteorological"], imd: ["meteorological"] };

export interface NewsReq {
  kind: "story" | "ask";
  /** the topic's words as heard (romanised), the request's own verbs, news nouns and fillers taken out */
  words: string[];
  /** an outlet named ("The Hindu's piece") */
  outlet: string | null;
  /** "that one", "this news": the story in focus or on screen is meant */
  ref: boolean;
  /** v9: topic words in a spoken verb form (Tamil, or Tanglish in small letters): a story without one is docked a fifth of a word, not a word */
  weak?: string[];
  /** v9: topic words said in Tamil or Tanglish with an English gloss: the English forms a headline may have instead (GLOSS8) */
  gloss?: Record<string, string[]>;
  /** v9: a story-like topic with no news word ("open the Kodungaiyur empty pot protest"): found only above SOFT_FLOOR, else the console's lanes */
  soft?: boolean;
  /** v9, soft: the event's own words ("protest"): a soft pick must have one (not the place alone) */
  event?: string[];
}

export interface StoryItem { id: string; title: string; titleEn?: string | null; outlets?: string[]; place?: string | null; story?: string | null; t?: string | null; onScreen?: number | null }
export interface Ranked { item: StoryItem; score: number; hits: number }

// ---- the request's own words: not the topic
const STOP = new Set(("a an the this that these those it its is are was were be been am do does did please pls can could would will shall should you me us my our i we " +
  "to of in on at for from by with about over into onto and or but so then now just also any some there here what whats which who whom how when where why " +
  "open opened opening read reads reading tell telling brief briefing explain summarise summarize sum up show showing give get go through play pull bring let see look check find " +
  "news newses story stories article articles piece pieces report reports headline headlines item items coverage update updates latest new today todays recent important " +
  "one ones thing things say says saying said write wrote written papers paper newspaper newspapers press media outlet outlets channel channels happening happened " +
  "jarvis hey hi ok okay yes yeah sir madam out more details detail full whole again thats its whats heres theres lets dont wanna want need " +
  "else anything something everything other others another same also too " +
  // the console's own places for the news: "go to the news page", "open the news panel", "read the news in Tamil" are moves, not topics
  "page pages panel panels tab tabs screen section window feed feeds widget list view mode tamil english language " +
  // v9: a period is the news panel's, not a topic ("read the news from last week": v8 searched for "week")
  "week weeks weekly month months monthly year years yesterday yesterdays tonight morning mornings evening evenings night " +
  // ordinals: "the second story" is the list's, not a topic
  "first second third fourth fifth sixth seventh eighth ninth tenth last 1st 2nd 3rd 4th 5th mudhal mudhalavadhu mudhalaavadhu rendavadhu rendaavadhu randavadhu " +
  "moonavadhu moonaavadhu munavadhu naalavadhu anjavadhu kadaisi kadasi mutal irantavatu rentavatu munravatu kataici katasi " +
  // Tanglish and romanised Tamil: verbs, particles, references, news words
  "pannu pannunga pannungal panni padi padinga padiunga padiyunga padichu padiyungal vasi vaasi sollu sollunga sollungal sollungo kaattu kaatu kattu kaattunga katunga kaminga kaami " +
  "thira thiranga thirandhu thirangal paru paaru paarunga enna ennachu edhu yenna irukku irukka iruka irukkaa vandhirukku vandhirukka potrukaanga solraanga sollirukaanga " +
  "pathi patthi paththi pattri patri athu adhu idhu ithu andha antha indha intha ah aa la le il ku kku oda seithi seidhi seythi sethi seidhigal " +
  // Tamil script (romanised by fold): செய்தி, சேதி, திற, படி, சொல், காட்டு, பற்றி, என்ன, இருக்கா, அந்த, இந்த, ஏதாவது, விளக்கு, கட்டுரை, அறிக்கை
  "seyti seytiyai seytiyait seytiyaip seytiyil seytikal seytikalai seti setiyai tirankal tiranka tira tiraku tirantu tirakavum patiyunkal patinka pati patikkavum " +
  "sollunkal sollunka sol sollu kattunkal kattunka kattu parri parriya enna irukka irukkiratha antha inta intha etavatu etavatu vilakku vilakkunkal katturai katturaiyai " +
  "arikkai arikkaiyai vantirukku vantirukkiratu ullatu ullana " +
  // v9: spoken Tanglish around the topic (v8's holdout: "Marina la enna aachu? edhavadhu news irukka?", "Pattinapakam la nadandha vettu sambavam
  // news sollunga", "news ah konjam padinga"): what happened, an incident, anything, a little, about, that one, the pronouns
  "aachu achu aacha aachaa ennaachu ennachu nadandha nadantha nadandhadhu nadanthathu nadandhathu nadandhuchu nadanthuchu nadandhurukku nadanthirukku " +
  "sambavam sambhavam sambavathai sambavatha edhavadhu ethavathu edhachum ethachum edhaavadhu vandhucha vandhuchu vanthucha vanthuchu vandhurukka vandhurukku " +
  "konjam pathina patthina paththina pathiya pathuna pathunna sambandhamana sammandhamana thodarbana kuritha kurithu onnu onna onnai ondru adha idha adhai idhai " +
  "aana oru solreengala sollreengala sollungalen padingalen kaattungalen he she hes shes they theyre im").split(/\s+/));

const NEWS_NOUN = /\b(?:news|story|stories|article|piece|report|headline|coverage|seithi|seidhi|seythi|sethi)\b|செய்தி|சேதி|கட்டுரை/iu;
const STORY_VERB = /\b(?:open|read|play|brief me|tell me|tell us|explain|summari[sz]e|sum up|go through|pull up|show me)\b|\b(?:padi|padinga|padiunga|sollu|sollunga|open pannu|open pannunga|kaattu|kaattunga|thira|thiranga)\b|திற|படி|சொல்|காட்டு|விளக்கு/iu;
const ASK_EN = /^(?:(?:hey |ok |okay )?jarvis,? )?(?:any|is there (?:any|anything)|anything|what(?:'s| is| are)? the (?:latest|news|update|story)|what(?:'s| is) (?:new|happening|the latest)|what (?:are|do|did|does) (?:the )?(?:papers|newspapers|media|press|news|reports?|outlets?)|latest|what happened (?:at|to|with|in)|any (?:update|word))\b/i;
const ASK_TA = /(?:பற்றி|குறித்து)\s*(?:ஏதாவது|என்ன)?\s*(?:செய்தி|சேதி)|(?:செய்தி|சேதி)(?:யில்|ல|களில்)?\s*(?:என்ன|ஏதாவது)|(?:செய்தி|சேதி)\s*(?:இருக்கா|இருக்கிறதா|உண்டா|வந்திருக்கா)/u;
const ASK_TG = /\b(?:pathi|patthi|paththi)\s+(?:enna\s+)?(?:news|seithi|seidhi)\b|\b(?:news|seithi|seidhi)\s+(?:la|le|il)\s+(?:enna|edhavadhu)\b|\b(?:news|seithi)\s+(?:irukka|irukkaa|iruka|undaa|vandhirukka)\b/i;
/** the console's own records: a case, a complaint, a reading is never a story */
const CONSOLE = /\b(?:cases?|complaints?|grievances?|petitions?|incidents?|tickets?|readings?|rainfall|reservoirs?|lakes?|aqi|officers?|departments? (?:performance|backlog)|zones?|wards?|taluks?|drafts?|tray)\b|புகார்|சம்பவ|மனு|மண்டல/iu;
/** a report of the console's own (an officer's, an action-taken, a weekly one, the rainfall or the zone's): not the press (v7's newsask OWN_REPORT, the review 18 Nov) */
const OWN_REPORT = /\b(?:officer'?s?|action[- ]taken|atr|status|progress|weekly|monthly|daily|quarterly|annual|inspection|field|audit|my|our|department'?s?|dept|zone|ward|sla|incident|police|fir|rainfall|rain|situation|briefing|brief|summary|performance|collector'?s?) reports?\b/i;
/** the press, in a news question's frame ("what are the papers saying", "what is the media saying") */
const PRESS = /\b(?:papers|newspapers?|media|press)\b/i;
const PRESS_SAYS = /\bwhat(?:'s| is| are| do| does)? (?:the )?(?:papers|newspapers?|media|press|news) (?:saying|say|reporting|report)\b/i;
/** a news question about a topic named after it: "any update on X", "what happened at X", "anything about X" */
const NAMED_ASK = /^(?:(?:hey |ok |okay )?jarvis,? )?(?:any (?:update|updates|word|news)|anything(?: new)?|is there (?:any|anything)(?: new)?|what happened|what'?s (?:new|happening|the latest))\s+(?:on|about|at|to|with|in|regarding)\b/i;
/** names that are the console's own (its officers, offices, the assistant): not a news topic */
const NOT_A_NAME = /^(?:jarvis|collector|collectorate|dro|rdo|ae|aee|je|bdo|vao|pwd|gcc|tneb|cmwssb|corporation|commissioner|tahsildar|tamil|english|i|ok|okay|hey|hi|sir|madam)$/i;
/** a capitalised name or an acronym after the first word that is no place and none of the console's own */
const namedTopic = (text: string): boolean =>
  text.replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(1).some((w) => /^\p{Lu}/u.test(w) && !NOT_A_NAME.test(w) && !placeWord(w));
/** a forecast or a warning (v6's look-up lane answers those from the Met office and NDMA) */
const FORECAST = /\b(?:will it rain|going to rain|forecast|nowcast|weather (?:warning|alert|forecast|report|update|bulletin)|red alert|orange alert|yellow alert)\b|வானிலை|முன்னறிவிப்பு/iu;
/**
 * v9: a story-like topic with no news word: a verb that opens, reads or tells (not "show": the console's views), an event a report is about,
 * and nothing of the console's own (its records, pages, charts, officers, backlog). In English, Tamil script and Tanglish. ("theft"'s Tamil and
 * Tanglish words are left out on purpose: the blind set's helper named "thiruttu" in its report.)
 */
const SOFT_VERB = /\b(?:open|read|play|pull up|bring up|tell me about|tell me more about)\b|\b(?:open pannu\w*|padi\w*|thira\w*|sollu\w*)\b|(?:^|\s)(?:திற|படி|சொல்)\S*/iu;
const EVENT_EN = "protests?|protesters|agitations?|dharna|demonstrations?|hunger strike|strikes?|bandh|rall(?:y|ies)|sit-?in|roko|blockade|siege|fires?|blaze|blasts?|explosions?|" +
  "accidents?|crash(?:es)?|collisions?|collapse[ds]?|cave-?in|murders?|killings?|stabbing|hacking|attacks?|assault|arrests?|raids?|seizure|bust|haul|robbery|heist|burglary|theft|" +
  "snatching|fraud|scam|suicides?|deaths?|drowning|stampede|clash(?:es)?|riots?|lathi-?charge|inauguration|reopening|launch|ban|verdict|ruling|judge?ment|plea|hearing|probe|leak|" +
  "spill|outbreak|eviction|demolitions?|smuggling";
const EVENT_TG = "porattam|poraattam|poratam|aarpattam|arpattam|marial|maraiyal|unnaviratham|vibathu|vibaththu|vibatthu|thee|kolai|kollai|kaidhu|kaithu|sodhanai|mosadi|" +
  "tharkolai|maranam|mothal|kalavaram|thirappu|thadai|theerppu|vettu|kuthu";
const EVENT_TA = "போராட்ட|ஆர்ப்பாட்ட|மறியல்|உண்ணாவிரத|வேலைநிறுத்த|தீவிபத்|விபத்|வெடி|கொலை|கொள்ளை|கைது|சோதனை|ரெய்டு|பறிமுதல்|மோசடி|தற்கொலை|மரண|உயிரிழ|பலி|மோதல்|" +
  "கலவர|திறப்பு|தடை|தீர்ப்பு|இடிப்பு";
const EVENT = new RegExp(String.raw`\b(?:${EVENT_EN}|${EVENT_TG})\b|(?:^|\s)(?:${EVENT_TA})|(?:^|\s)தீ(?:\s|$|யில்|யை)`, "iu");
/** the console's own words: a soft request with one is the console's ("open the fire department's backlog", "the strike rate chart") */
const SOFT_NOT = /\b(?:departments?|dept|backlog|pending|overdue|sla|officers?|staff|charts?|graphs?|map|maps|page|panel|tab|trends?|ranking|rate|score|dashboard|list|table|counts?|numbers?|stats|statistics|data|summary|alerts?|warnings?|forecast|view|filter|category|categories|severe|severity|open cases|status)\b|புகார்|மனு|மண்டல|வார்டு/iu;

/** a negation: "don't open the news" */
const NEGATED = /\b(?:don'?t|dont|do not|never|no need|stop)\b|வேண்டாம்|வேணாம்|\bvenaam\b|\bvendaam\b/iu;
const ORDINAL_ONLY = /^(?:the )?(?:first|second|third|fourth|fifth|last|1st|2nd|3rd|mudhal|rendavadhu|rendaavadhu|moonavadhu|kadaisi)(?: one| news| story| article)?$/i;
/** a reference to the story in focus: "that one", "this news", "andha news", "அந்தச் செய்தி" */
const REF = /\b(?:that|this|it)\b|\b(?:andha|antha|indha|intha|adhu|idhu)\b|அந்த|இந்த/iu;

/**
 * The outlets a request may name, as words (the console's name for each, as the store's publisher names it). v9: read word by word on the
 * request's own words (Tamil script romanised, an acronym said letter by letter joined, a possessive's 's off), each word by its Tamil-loose key;
 * a word of six letters or more may be misheard ("Chronical", "Dinmalar"), a name said in two parts is joined ("Dina malar", "Maalai Malar").
 * The most specific name first ("Hindu Tamil Thisai" before "The Hindu", "The New Indian Express" before "The Indian Express"). `notBefore`: a
 * word after the name that makes it something else ("Hindu Munnani", "Thanthi TV"). v8 read exact spellings only: "Deccan Chronical" and
 * "ETV Bharath" were no outlet, and "the Indian Express one" was The New Indian Express (the holdout's h-reference-3 and -4).
 */
interface OutletDef { name: string; words: string[]; notBefore?: string[] }
const OUTLETS: OutletDef[] = [
  { name: "Hindu Tamil Thisai", words: ["hindu", "tamil", "thisai"] }, { name: "Hindu Tamil Thisai", words: ["hindu", "tamil"] }, { name: "Hindu Tamil Thisai", words: ["indhu", "tamil"] },
  { name: "The Times of India", words: ["times", "of", "india"] }, { name: "The Times of India", words: ["toi"] },
  { name: "The New Indian Express", words: ["new", "indian", "express"] }, { name: "The Indian Express", words: ["indian", "express"] },
  { name: "The Economic Times", words: ["economic", "times"] }, { name: "Hindustan Times", words: ["hindustan", "times"] },
  { name: "Deccan Chronicle", words: ["deccan", "chronicle"] }, { name: "ETV Bharat", words: ["etv", "bharat"] }, { name: "Free Press Journal", words: ["free", "press", "journal"] },
  { name: "Thanthi TV", words: ["thanthi", "tv"] }, { name: "Thanthi TV", words: ["thanthi", "tivi"] },
  { name: "Daily Thanthi", words: ["daily", "thanthi"] }, { name: "Daily Thanthi", words: ["dina", "thanthi"] }, { name: "Daily Thanthi", words: ["dinathanthi"] },
  { name: "Daily Thanthi", words: ["thanthi"], notBefore: ["tv", "tivi"] },
  { name: "DT Next", words: ["dt", "next"] }, { name: "DT Next", words: ["dtnext"] },
  { name: "Makkal Kural", words: ["makkal", "kural"] }, { name: "Polimer News", words: ["polimer"] }, { name: "Puthiya Thalaimurai", words: ["puthiya", "thalaimurai"] },
  { name: "Malaimurasu Seithikal", words: ["malaimurasu"] }, { name: "DD News", words: ["dd", "news"] }, { name: "DD News", words: ["doordarshan"] },
  // (News On AIR by its spoken names, never "news on air ...": "any news on air quality" is a topic; the review, 19 Nov)
  { name: "News On AIR", words: ["all", "india", "radio"] }, { name: "News On AIR", words: ["akashvani"] },
  { name: "Dinamani", words: ["dinamani"] }, { name: "Dinamalar", words: ["dinamalar"] }, { name: "Dinakaran", words: ["dinakaran"] }, { name: "Maalaimalar", words: ["maalaimalar"] },
  { name: "NDTV", words: ["ndtv"] }, { name: "News18", words: ["news18"] }, { name: "BBC", words: ["bbc"] }, { name: "PTI", words: ["pti"] },
  { name: "BusinessLine", words: ["businessline"] }, { name: "Mathrubhumi English", words: ["mathrubhumi"] },
  // (not "Times Now", "India Today" or "News7": ordinary words in a sentence, "three times now", "open news 7")
  // "தி இந்து" (the paper's name said in Tamil); "இந்து" alone is the religion ("இந்து அறநிலையத் துறை")
  { name: "The Hindu", words: ["ti", "indhu"] },
  { name: "The Hindu", words: ["hindu"], notBefore: ["tamil", "munnani", "makkal", "temple", "temples", "religious", "religion", "endowments", "outfit", "outfits", "organisation", "organisations", "organization", "organizations", "festival", "festivals", "devotees", "mahasabha", "front"] }
];
/** an outlet's word worked out once: as written, its loose key, and whether it is matched only as itself (short, or with a digit) */
interface OWord { w: string; k: string; exact: boolean }
const oWord = (w: string): OWord => ({ w, k: looseKey(w), exact: /\d/.test(w) || w.length <= 3 });
const OUTLET_KEYS = OUTLETS.map((o) => ({ o, words: o.words.map(oWord), joined: oWord(o.words.join("")) }));
/** a heard word worked out once: as written and its loose key; whether it may be an outlet's word misheard (no English word: "next", "text") */
interface HWord { w: string; k: string; ear: boolean }
/**
 * one heard word against one word of an outlet's name, 0..1: the same loose key 1 (a short word or one with a digit: the same word, "News18",
 * "dd"; "9th" keys like "dd"); `byEar`, an outlet's word of six letters or more misheard: a heard word that is no English word, with the same
 * first letter and a length within two, one or two edits away (Jaro-Winkler and the edit distance's first band: no "cut short" or
 * consonants-only match, which made "malar" Malaimurasu, the four Dina- papers one another, and "next" DT Next: the review, 19 Nov)
 */
const outletWord = (h: HWord, o: OWord, byEar: boolean): number => {
  if (o.exact || /\d/.test(h.w)) return h.w === o.w ? 1 : 0;
  if (h.k && h.k === o.k) return 1;
  if (!byEar || !h.ear || o.w.length < 6 || h.k.length < 5 || h.k[0] !== o.k[0] || Math.abs(h.k.length - o.k.length) > 2) return 0;
  const jw = jaroWinkler(h.k, o.k);
  if (jw < 0.88) return 0;
  const dl = editDistance(h.k, o.k);
  return (Math.min(h.k.length, o.k.length) <= 7 ? jw >= 0.9 && dl <= 1 : dl <= 2) ? jw : 0;
};
/** the last few readings (topicWords reads the same words again for the outlet's place in them) */
const outletMemo = new Map<string, { name: string; i: number; n: number } | null>();
/** the outlet named in these words, and where (its first word and how many words it takes), or null: an exact name anywhere first, then the
 * closest name by ear */
export function outletRun(toks: string[]): { name: string; i: number; n: number } | null {
  const memoKey = toks.join(" ");
  if (outletMemo.has(memoKey)) return outletMemo.get(memoKey)!;
  const hs: HWord[] = toks.map((w) => ({ w, k: looseKey(w), ear: !/\d/.test(w) && !isEnglishWord(w) }));
  // a name said in parts ("dina malar", "maalai malar", "news 18"), as one heard word (misheard only if a part is no English word: "the next")
  const joinedAt = (i: number, n: number): HWord => { const w = toks.slice(i, i + n).join(""); return { w, k: looseKey(w), ear: !/\d/.test(w) && hs.slice(i, i + n).some((h) => h.ear) }; };
  let best: { name: string; i: number; n: number; s: number } | null = null;
  for (const byEar of [false, true]) {
    for (const { o, words, joined } of OUTLET_KEYS) {
      for (let i = 0; i < hs.length; i++) {
        const after = (n: number) => !o.notBefore?.includes(toks[i + n] ?? "");
        if (i + words.length <= hs.length && after(words.length)) {
          // a word of a longer name may be misheard when another of its words was heard exactly ("Deccan Chronical": "chronical" is an old
          // English word, so it is no outlet's word alone)
          const exact = words.map((w, k) => outletWord(hs[i + k], w, false));
          const anyExact = words.length >= 2 && exact.some((x) => x > 0);
          let s = 1;
          for (let k = 0; k < words.length && s > 0; k++) s = Math.min(s, exact[k] || (byEar ? outletWord(anyExact ? { ...hs[i + k], ear: true } : hs[i + k], words[k], true) : 0));
          if (s > 0 && (!best || s > best.s)) best = { name: o.name, i, n: words.length, s };
        }
        for (let n = 2; n <= 3 && i + n <= hs.length; n++) {
          if (n === words.length || !after(n)) continue;
          const h = joinedAt(i, n);
          const s = h.w.length >= 5 ? outletWord(h, joined, byEar) : 0;
          if (s > 0 && (!best || s > best.s)) best = { name: o.name, i, n, s };
        }
      }
      if (!byEar && best) break;
    }
    if (best) break;
  }
  const r = best ? { name: best.name, i: best.i, n: best.n } : null;
  if (outletMemo.size > 500) outletMemo.clear();
  outletMemo.set(memoKey, r);
  return r;
}
/** a request's own words for the outlets: the possessive's 's taken off ("The Hindu's piece") */
const outletToks = (text: string): string[] => tokensOf(text.replace(/(\p{L})['’]s\b/gu, "$1"));
export const outletIn = (text: string): string | null => outletRun(outletToks(text))?.name ?? null;
/** the console's own name for an outlet a story lists (its whole name, word for word, "the" aside), memoised */
const outletNameMemo = new Map<string, string | null>();
const outletOfName = (name: string): string | null => {
  let v = outletNameMemo.get(name);
  if (v === undefined) {
    const toks = outletToks(name).filter((t) => t !== "the");
    v = OUTLETS.find((o) => o.words.length === toks.length && o.words.every((w, k) => looseKey(toks[k]) === looseKey(w)))?.name ?? null;
    if (outletNameMemo.size > 2000) outletNameMemo.clear();
    outletNameMemo.set(name, v);
  }
  return v;
};
const plainName = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
/** a story's outlet is the one asked for: the same console name, or the same name as written ("Polimer News"); "The New Indian Express" is never
 * "The Indian Express" (v8 matched any outlet whose name held the one asked for) */
export const sameOutlet = (storyOutlet: string, asked: string): boolean => outletOfName(storyOutlet) === asked || plainName(storyOutlet) === plainName(asked);

/** Tamil-script words that are the request's own (news nouns, verbs, references, question words), as whole words with their endings: முதல்வர் (the
 * CM), இந்திய and காட்டுப்பள்ளி are topics, not "first", "this" and "show" (the review, 18 Nov) */
// v9: and the spoken forms around a topic (v8's holdout: "தீபம் பத்தின செய்தியைச் சொல்லுங்க", "செய்தி என்ன? அதைப் படிங்க"): about (பத்தின,
// பற்றிய, குறித்த, தொடர்பான), that and this (அதை, இதை, அது, அதுல), what happened (ஆச்சு, நடந்த), an incident, anything, one (ஒண்ணு), the
// verbs' polite and spoken endings (படிங்களேன், படிச்சு, திறக்கணும், சொல்றாங்க)
const TA_OWN = /^(?:(?:செய்தி|சேதி|கட்டுரை|அறிக்கை)(?:யை|யைப்|யைத்|யைச்|யில்|யில|யின்|கள்|களை|களில்|யா|யும்|ல)?|திற(?:ங்க|ங்கள்|ங்களேன்|ங்கோ|ந்து|க்கவும்|க்க|க்கணும்)?|படி(?:ங்க|யுங்கள்|யுங்க|ங்களேன்|க்கவும்|க்கணும்|த்து|ச்சு|ச்சுக்)?|சொல்(?:லு|லுங்க|லுங்கள்|லுங்களேன்|லவும்|லணும்)?|சொல்றாங்க|சொல்லிருக்காங்க|போட்டிருக்காங்க|காட்டு(?:ங்க|ங்கள்)?|காமி(?:ங்க)?|விளக்கு(?:ங்க|ங்கள்)?|பற்றி|பற்றிய|பத்தி|பத்தின|பத்துன|பத்தியான|குறித்து|குறித்த|தொடர்பான|சம்பந்தமான|என்ன|என்னாச்சு|ஆச்சு|நடந்த|நடந்தது|நடந்துச்சு|நடந்திருக்கு|இருக்கா|இருக்கு|இருக்கிறதா|வந்திருக்கு|வந்திருக்கா|வந்துச்சா|வந்துச்சு|வந்ததா|அந்த|அந்தச்|அந்தத்|இந்த|இந்தச்|இந்தத்|அதை|அதைப்|அதைத்|அதைச்|இதை|இதைப்|இதைத்|இதைச்|அது|இது|அதுல|இதுல|ஏதாவது|ஏதும்|ஏதாச்சும்|சம்பவம்|சம்பவத்தை|சம்பவத்தைப்|ஒண்ணு|ஒண்ணை|ஒண்ணைப்|ஒன்றை|ஒன்றைப்|ஒரு|போடு(?:ங்க)?|தயவுசெய்து|கொஞ்சம்|முதல்|முதலாவது|இரண்டாவது|ரெண்டாவது|மூன்றாவது|கடைசி)$/u;
/**
 * v9: the event and civic nouns the Collector says in Tamil or Tanglish, in the English a headline uses (a Tamil request about an English-only
 * report: "Pattinapakam la ... vettu" is "Man hacked ... in Pattinapakkam"). A headline word matched this way counts as 0.9 of its own.
 * Keyed by the Tamil word itself (its inflections by the stems listed: பாலத்தில் is பாலம், never பள்ளம்; கொள்ளை is not கொலை; தி.மு.க.'s தி is not
 * தீ) and by the Tanglish spellings exactly; never by the loose key, which made a bridge a pothole, robbery murder and the DMK a fire (the review,
 * 19 Nov). The English is the word itself with its regular endings ("rains", "trees", "hacked", "stabbed"), never its loose key (drug is not truck,
 * tree is not three, plane is not plan). Left out: a Tanglish spelling that is another Tamil word ("palli" is a school and half of Pallikaranai),
 * and theft, mosquitoes and power cuts' "current" (the blind set's helper named "thiruttu", "kosu" and "current" in its report).
 */
interface Gloss { ta?: string[]; taExact?: string[]; tg?: string[]; en: string[] }
const GLOSS8: Gloss[] = [
  { ta: ["வெட்டிக்", "வெட்டிப்", "வெட்டப்"], taExact: ["வெட்டு", "வெட்டி"], tg: ["vettu"], en: ["hack", "slash", "sickle"] },
  { ta: ["குத்திக்", "குத்தப்"], taExact: ["குத்து", "குத்தி"], tg: ["kuthu", "kutthu"], en: ["stab"] },
  { ta: ["கொலை"], tg: ["kolai"], en: ["murder", "kill", "killing"] }, { ta: ["கொள்ளை"], tg: ["kollai"], en: ["robbery", "rob", "loot", "heist", "dacoity"] },
  { ta: ["தீவிபத்", "தீப்பிடி", "தீப்பற்"], taExact: ["தீ", "தீயில்", "தீயை", "தீயால்"], tg: ["thee"], en: ["fire", "blaze", "gutted"] },
  { ta: ["விபத்"], tg: ["vibathu", "vibaththu", "vibatthu", "vipathu"], en: ["accident", "crash", "collision", "collide", "mishap"] },
  { ta: ["கைது", "கைதான"], tg: ["kaidhu", "kaithu"], en: ["arrest", "nab"] },
  { ta: ["போராட்ட", "ஆர்ப்பாட்ட"], tg: ["porattam", "poraattam", "poratam", "poraatam", "aarpattam", "arpattam"], en: ["protest", "agitation", "stir", "dharna", "demonstration"] },
  { ta: ["மறியல்"], tg: ["marial", "maraiyal"], en: ["blockade", "roko"] }, { ta: ["உண்ணாவிரத"], tg: ["unnaviratham"], en: ["hunger"] },
  { ta: ["வெடிவிபத்", "வெடிப்பு", "வெடித்து", "வெடித்த", "வெடிகுண்டு"], tg: ["vedi", "vedippu"], en: ["blast", "explosion", "explode", "bomb"] },
  { ta: ["தற்கொலை"], tg: ["tharkolai", "tarkolai"], en: ["suicide"] },
  { ta: ["மரண", "உயிரிழ", "சாவு", "பலியா"], taExact: ["பலி"], tg: ["maranam"], en: ["death", "dead", "die", "kill"] },
  { ta: ["மோசடி"], tg: ["mosadi"], en: ["fraud", "scam", "cheat", "dupe"] }, { ta: ["கஞ்சா"], tg: ["ganja", "kanja"], en: ["ganja", "cannabis"] },
  { ta: ["போதை"], tg: ["bodhai", "bothai"], en: ["drug", "narcotic"] }, { ta: ["மழை"], tg: ["mazhai", "mazha"], en: ["rain", "rainfall", "downpour", "shower"] },
  { ta: ["வெள்ளம்", "வெள்ளத்", "வெள்ளப்", "வெள்ளநீர்"], tg: ["vellam"], en: ["flood", "inundate", "waterlog", "waterlogging"] },
  { ta: ["புயல்"], tg: ["puyal"], en: ["cyclone"] }, { ta: ["குடிநீர்"], tg: ["kudineer", "kudinir"], en: ["drinking", "water"] },
  { ta: ["தட்டுப்பாடு"], tg: ["thattuppadu", "thattupaadu", "thattupadu"], en: ["shortage", "scarcity"] },
  { ta: ["கழிவுநீர்", "சாக்கடை"], tg: ["kazhivuneer", "saakkadai", "sakkadai"], en: ["sewage", "sewer", "sewerage"] },
  { ta: ["குப்பை"], tg: ["kuppai"], en: ["garbage", "waste", "trash", "dump"] }, { ta: ["மின்தடை", "மின்வெட்டு"], tg: ["mintadai", "minthadai", "minvettu"], en: ["shutdown", "outage"] },
  { ta: ["பள்ளம்", "பள்ளத்", "பள்ளங்க"], tg: ["pallam"], en: ["pothole", "crater"] }, { ta: ["பாலம்", "பாலத்", "பாலங்க"], tg: ["paalam"], en: ["bridge", "flyover"] },
  { ta: ["மரம்", "மரங்க", "மரத்"], tg: ["maram"], en: ["tree"] }, { ta: ["நாய்", "தெருநாய்"], tg: ["naai", "naay"], en: ["dog"] },
  { ta: ["குதிரை"], tg: ["kudhirai", "kuthirai"], en: ["horse"] }, { ta: ["பாம்பு"], tg: ["paambu", "pambu"], en: ["snake"] },
  { ta: ["மாடு", "மாடுக", "மாட்டுக்"], tg: ["maadu"], en: ["cattle", "cow", "bull"] }, { ta: ["பேருந்து"], tg: ["perundhu"], en: ["bus"] },
  { ta: ["ரயில்", "ரெயில்"], en: ["train", "rail"] }, { ta: ["கடலோர"], taExact: ["கடல்", "கடலில்", "கடலுக்கு", "கடலின்"], tg: ["kadal"], en: ["sea", "coast", "coastal"] },
  { ta: ["மீனவ"], tg: ["meenavar", "meenavargal"], en: ["fishermen", "fisherman", "fisher", "fisherfolk"] },
  { ta: ["நீதிமன்ற", "உயர்நீதிமன்ற", "உச்சநீதிமன்ற"], en: ["court"] }, { ta: ["கோயில", "கோவில"], tg: ["kovil", "koil"], en: ["temple"] },
  { ta: ["தேர்தல"], tg: ["therthal"], en: ["election", "poll"] }, { ta: ["விமான"], tg: ["vimanam"], en: ["flight", "plane", "aircraft"] },
  { taExact: ["பள்ளி", "பள்ளியில்", "பள்ளிகள்", "பள்ளிக்கு", "பள்ளியின்", "பள்ளிகளில்"], en: ["school"] },
  { ta: ["அமைச்ச"], en: ["minister"] }, { ta: ["ஆட்சியர"], en: ["collector"] }
];
/** an English word and its regular forms ("rain": rains, rained, raining; "stab": stabbed; "explode": exploded, exploding) */
const englishForms = (w: string): string[] => {
  const ends = ["", "s", "es", "ed", "d", "ing", "ings", "er", "ers"];
  const out = ends.map((e) => w + e);
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(w)) out.push(...["ed", "ing", "er", "ers"].map((e) => w + w.slice(-1) + e));
  if (w.endsWith("e")) out.push(...["ing", "ings"].map((e) => w.slice(0, -1) + e));
  if (w.endsWith("y")) out.push(w.slice(0, -1) + "ies");
  return out;
};
const GLOSS_FORMS = new Map<Gloss, Set<string>>(GLOSS8.map((g) => [g, new Set(g.en.flatMap(englishForms))]));
/** the gloss of one word as said: a Tamil word by its own letters (an exact form, else a listed stem it begins with), a Latin word by its spelling */
const glossOfWord = (raw: string): Gloss | null => {
  const ta = raw.replace(/[^஀-௿]/gu, "");
  if (ta) return GLOSS8.find((g) => g.taExact?.includes(ta) || g.ta?.some((p) => ta.startsWith(p))) ?? null;
  const lw = raw.toLowerCase().replace(/[^a-z]/g, "");
  return lw ? GLOSS8.find((g) => g.tg?.includes(lw)) ?? null : null;
};
/** each topic word with a gloss, by the word as said: its English forms */
const glossesOf = (text: string, words: string[]): Record<string, string[]> | null => {
  const out: Record<string, string[]> = {};
  for (const raw of text.split(/\s+/)) {
    const g = glossOfWord(raw);
    if (!g) continue;
    for (const t of tokensOf(raw)) if (words.includes(t)) out[t] = [...GLOSS_FORMS.get(g)!];
  }
  return Object.keys(out).length ? out : null;
};

/**
 * v9: a word in a spoken verb form: the event in the Collector's own words, which a headline may say otherwise (the horse story says
 * தறிகெட்டு where the Collector said மிரண்டு). In a story that does not have it, it counts at a fifth, as a fragment does; in a story that has
 * it, in full. Tamil: a relative participle or a finite ending (ஓடின, ஓடிய, நடந்த, போட்ட, சொன்ன, போட்டாங்க) and the past participle in -ண்டு
 * (மிரண்டு); not -ந்து, -ட்டு, -த்து or -ச்சு, which end as many nouns (பேருந்து, மின்வெட்டு, விபத்து, பேச்சு: the review, 19 Nov). Tanglish in small
 * letters: -ndu, -chu ("mirandu"), no English word and no place. Never a word with a gloss or an event's own word.
 */
const TA_VERBISH = /(?:ின|ிய|ந்த|ட்ட|த்த|ன்ன|ச்ச|ண்டு|ாங்க|ாங்களாம்|ாராம்|ானாம்|ிட்டாங்க|ிருக்காங்க)$/u;
const TA_NOT_VERB = /^(?:வெடி)?குண்டு$|^(?:துண்டு|வண்டு|ரவுண்டு)$/u;
const TG_VERBISH = /^[a-z]{3,}(?:ndu|chu|cchu)$/;
const TG_NOT_VERB = new Set(["gundu", "kundu", "thundu", "vandu", "pechu", "moochu", "pochu"]);
const weakWords = (text: string): string[] => [
  ...(text.match(/[஀-௿]+/gu) ?? []).filter((w) => TA_VERBISH.test(w) && !TA_NOT_VERB.test(w) && !glossOfWord(w) && !EVENT.test(w)).flatMap((w) => tokensOf(w)),
  ...(text.match(/[A-Za-z]+/g) ?? []).filter((w) => TG_VERBISH.test(w) && !TG_NOT_VERB.has(w) && !glossOfWord(w) && !isEnglishWord(w) && !placeWord(w))
];
/** Tanglish news words with their endings ("seithiya", "seidhila"); "pannunga" as Whisper spells it ("panyunga", "panunga": the real run o8b) */
const TG_NEWS = /^(?:seithi|seidhi|seythi|sethi|seyti|seiti|seti)|^pa+n+[iy]?u+(?:nga|ngal|ngo)?$/;

/** the topic words of a request: its own verbs, news nouns, references and fillers out; Tamil romanised */
export function topicWords(text: string, outlet: string | null): string[] {
  const t = text.split(/\s+/).filter((w) => { const ta = w.replace(/^[^஀-௿]+/u, "").replace(/[^஀-௿]+$/u, ""); return !TA_OWN.test(ta) && !(ta && ordWord(ta) != null); }).join(" ");
  let toks = outletToks(t);
  // the outlet's own words are not the topic (found again on these words: the same reader as outletIn's)
  if (outlet) { const r = outletRun(toks); if (r && r.name === outlet) toks = [...toks.slice(0, r.i), ...toks.slice(r.i + r.n)]; }
  // (v9: a position, "seventh", "7th", "ezhavadhu", ஏழாவது, is the list's, never a topic: ord8.ts)
  return toks.filter((w) => !STOP.has(w) && !TG_NEWS.test(w) && !/^\d+$/.test(w) && w.length >= 2 && !STOP.has(w.replace(/(?:a|ah|ai|ae|e|il|la|le)$/, "")) && ordWord(w) == null);
}

/**
 * Is this a story asked for by its topic, or a news question? `o.onScreen`: news is on the screen (Jarvis's list or the console's panel), so
 * "the X one" means a story there. Null: not this lane's.
 */
export function newsRequest(raw: string, o: { onScreen?: boolean } = {}): NewsReq | null {
  const text = raw.trim();
  if (!text || text.length > 400 || NEGATED.test(text)) return null;
  const outlet = outletIn(text);
  const consoleThing = CONSOLE.test(text) && !NEWS_NOUN.test(text);
  if (consoleThing || OWN_REPORT.test(text)) return null;
  if (FORECAST.test(text) && !NEWS_NOUN.test(text)) return null;
  const newsy = NEWS_NOUN.test(text) || !!outlet;
  // a news question names the news ("any NEWS on the cyclone", "what are the PAPERS saying"): "anything urgent?", "latest numbers for Adyar?",
  // "what happened to the drain work?" are the console's (the review, 18 Nov)
  // ... or the press ("what are the papers saying about ..."), or a topic by its own name ("any update on the Supreme Court bench?", "what happened at
  // the IOCL plant?": a capitalised name or an acronym that is no place, officer or office of the console's; the live dev re-check, 19 Nov)
  const asks = (newsy || PRESS.test(text) || (NAMED_ASK.test(text) && namedTopic(text))) &&
    (ASK_EN.test(text) || ASK_TA.test(text) || ASK_TG.test(text) || PRESS_SAYS.test(text));
  // "the Nungambakkam subway one", "the one about ...", and "open that one, that's the Supreme Court order" (the owner's words, 18 Nov)
  // (v9: "the last one", "the seventh one" are positions, refs8.ts's, never "the X one" with X a topic)
  const xOne = /\b(?:the|that|this|andha|antha)\s+([\p{L}\p{M}\s.'’-]{2,60}?)\s+one\b/iu.exec(text);
  const theOne = ((!!xOne && !ordWordsOf(xOne[1]).some((w) => ordWord(w) != null)) || /\bone about\b|\b(?:that|this) one\b/iu.test(text)) && o.onScreen;
  // v9: "open the Kodungaiyur empty pot protest", "the IOCL fire, open that": a story-like topic with no news word (soft: found only above
  // SOFT_FLOOR, else the console's own lanes take the sentence, as they did in v8)
  const soft = !newsy && !theOne && !asks && SOFT_VERB.test(text) && EVENT.test(text) && !SOFT_NOT.test(text);
  if (!newsy && !theOne && !asks && !soft) return null;
  // at most 12 topic words (a request at the schema's 400 characters must not hold the server: the review, 19 Nov)
  const words = topicWords(text, outlet).slice(0, 12);
  // a soft request names which one: a word besides the event ("the protest" alone is the console's PUBLIC_ORDER view)
  if (soft) {
    const eventToks = new Set(text.split(/\s+/).filter((w) => EVENT.test(w)).flatMap((w) => tokensOf(w)));
    const which = words.filter((w) => !eventToks.has(w));
    const event = words.filter((w) => eventToks.has(w));
    if (!which.length || !event.length) return null;
    const weak = weakWords(text).filter((w) => words.includes(w));
    const gloss = glossesOf(text, words);
    return { kind: "story", words, outlet: null, ref: false, soft: true, event, ...(weak.length ? { weak } : {}), ...(gloss ? { gloss } : {}) };
  }
  // "read the second story", "open the news": no topic of its own (ordinals and the panel are other lanes')
  if (!words.length && !outlet) return null;
  // "what's happening in Royapuram": a place's situation is the console's (its place lane), unless it names the news
  if (!newsy && !theOne && words.every((w) => placeWord(w))) return null;
  if (ORDINAL_ONLY.test(text.replace(/[.?!,]+$/g, "").trim())) return null;
  const ref = REF.test(text) && words.length <= 3;
  const weak = weakWords(text).filter((w) => words.includes(w));
  const gloss = glossesOf(text, words);
  const extra = { ...(weak.length ? { weak } : {}), ...(gloss ? { gloss } : {}) };
  if (asks && !STORY_VERB.test(text.replace(/\bshow me\b/i, ""))) return { kind: "ask", words, outlet, ref, ...extra };
  // "what happened at X" with no news word is a question about the district, unless it names a story's topic: the ranking decides
  return { kind: STORY_VERB.test(text) || theOne || (newsy && !asks) ? "story" : "ask", words, outlet, ref, ...extra };
}

// ---- ranking

interface Doc { item: StoryItem; keys: Set<string>; /** the story's word keys by their first letter: every match path needs that letter equal */ byFirst: Map<string, { k: string; en: string | null; eng: boolean }[]>; latin: boolean;
  /** v9: its words as written (romanised, lower case): a gloss's English forms are looked up here */
  raw: Set<string> }
/** a story's words, keyed once (and kept for the next request: the same stored stories come back) */
const docMemo = new Map<string, Doc>();
const docOf = (x: StoryItem): Doc => {
  const memoKey = `${x.id}|${x.title}|${x.titleEn ?? ""}|${x.place ?? ""}`;
  const hit = docMemo.get(memoKey);
  if (hit) return { ...hit, item: x };
  // (at most 40 words a headline, each headline on its own: a 400-character title sent from a screen is cut, and a long Tamil headline
  // never pushes the English one out; the live dev re-check, 19 Nov)
  const part = (s: string | null | undefined) => tokensOf(s ?? "").filter((w) => w.length >= 2).slice(0, 40);
  const toks = [...new Set([...part(x.title), ...part(x.titleEn), ...part(x.place).slice(0, 8)])];
  const keys = new Set(toks.map(looseKey).filter(Boolean));
  const byFirst = new Map<string, { k: string; en: string | null; eng: boolean }[]>();
  const seen = new Set<string>();
  for (const w of toks) {
    const k = looseKey(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const e = { k, en: /^[a-z]{5,}$/.test(w) ? looseKey(enStem(w)) : null, eng: /^[a-z]+$/.test(w) && isEnglishWord(w) };
    const l = byFirst.get(k[0]); if (l) l.push(e); else byFirst.set(k[0], [e]);
  }
  const d: Doc = { item: x, keys, byFirst, latin: !/[஀-௿]/u.test(x.title), raw: new Set(toks) };
  if (docMemo.size > 20_000) docMemo.clear();
  docMemo.set(memoKey, d);
  return d;
};

/** one topic word, worked out once: its key, its stems' keys, its English stem, and (v9) its gloss's English forms (GLOSS8) */
interface QWord { w: string; k: string; stems: string[]; en: string | null; says: string[] | null; gloss: string[] | null }
const qOf = (w: string, gloss: string[] | null = null): QWord =>
  ({ w, k: looseKey(w), stems: stemsOf(w).map(looseKey).filter((s) => s.length >= 4), en: /^[a-z]{5,}$/.test(w) ? looseKey(enStem(w)) : null, says: SAYS_FOR[w]?.map(looseKey) ?? null, gloss });

/** a long name cut short by the ears ("Palikana" for Pallikaranai): the same first six letters or more, most of the shorter word */
const sharedHead = (a: string, b: string): number => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** how well one topic word is in one story: its best word, 0 below 0.8 (the memo holds each word pair's score across the stories) */
function simIn(q: QWord, d: Doc, memo: Map<string, number>): number {
  if (d.keys.has(q.k)) return 1;
  if (q.says && q.says.every((k) => d.keys.has(k))) return 1;
  let best = 0;
  for (const { k: tk, en: ten, eng } of d.byFirst.get(q.k[0]) ?? []) {
    const mk = `${q.k}|${tk}|${eng ? 1 : 0}`;
    let s = memo.get(mk);
    if (s === undefined) {
      // (v9: a headline word that is an English word is not reached by the "cut short" or shared-head rules: those are for a name the ears cut
      // short, "Palikan", and a Tamil word in its Tamil ending, மரம் in மரங்கள்; "maram", a tree, is not "marathon": the review, 19 Nov)
      s = keySim(q.k, tk, !eng);
      for (const st of q.stems) if (st[0] === tk[0]) s = Math.max(s, keySim(st, tk, !eng) * 0.98);
      if (s < 0.8 && q.en && ten && q.en === ten) s = 0.92;
      if (s < 0.8 && q.k.length >= 4 && tk.length >= 4 && skeleton(q.k).length >= 3 && skeleton(q.k) === skeleton(tk)) s = 0.85;
      if (s < 0.8 && !eng) { const h = sharedHead(q.k, tk); if (h >= 6 && h >= 0.6 * Math.min(q.k.length, tk.length)) s = 0.85; }
      memo.set(mk, s);
    }
    if (s > best) best = s;
    if (best >= 1) break;
  }
  // v9: the word's English in the headline, word for word ("vettu" in "Man hacked ...")
  if (best < 0.9 && q.gloss && q.gloss.some((f) => d.raw.has(f))) best = 0.9;
  return best >= 0.8 ? best : 0;
}

/**
 * v9: a joined word ("Kasi medu" said for Kasimedu) in one story: its whole key, or a case ending's stem, against one headline word (0 below 0.88).
 * No shared head and no consonants-only match: those would let "Pallikaranai marsh" joined stand for "marsh" in every Pallikaranai story.
 */
function joinedIn(q: QWord, d: Doc, memo: Map<string, number>, parts: QWord[]): number {
  let best = 0;
  for (const { k: tk, eng } of d.byFirst.get(q.k[0]) ?? []) {
    const mk = `j|${parts.map((p) => p.k).join("+")}|${tk}|${eng ? 1 : 0}`;
    let s = memo.get(mk);
    if (s === undefined) {
      // (by its spelling: no consonants-only match, and no "cut short" against an English word: "beach horse" is not "fisheries")
      s = keySim(q.k, tk, !eng, false);
      for (const st of q.stems) if (st[0] === tk[0]) s = Math.max(s, keySim(st, tk, !eng, false) * 0.98);
      // v9 (the review, 19 Nov): only a headline word the parts are not ("kasimedu" is neither "kasi" nor "medu"); "adyar hc" and "வேளச்சேரி மழை"
      // joined match "Adyar" and "வேளச்சேரியில்", which the place alone already is, and must not credit "hc" or "மழை" to every story of it
      if (s >= 0.88 && parts.some((p) => keySim(p.k, tk) >= 0.8 || p.stems.some((st) => keySim(st, tk) >= 0.8))) s = 0;
      memo.set(mk, s);
    }
    if (s > best) best = s;
    if (best >= 1) break;
  }
  return best >= 0.88 ? best : 0;
}

/** the zones and places a request names (research 10, rec 4: a place the story does not mention vetoes it) */
export interface Places { names: string[] }

/** Score every candidate story against the request. Stories on screen first; ties go to the newer. */
export function rankStories(req: Pick<NewsReq, "words" | "outlet" | "weak" | "gloss">, items: StoryItem[], o: { places?: string[] } = {}): Ranked[] {
  if (!items.length || (!req.words.length && !req.outlet)) return [];
  const docs = items.map(docOf);
  const n = docs.length;
  const qs = req.words.map((w) => qOf(w, req.gloss?.[w] ?? null));
  // the request's place words, decided once a word: a topic word that names a district place ("Palikan" -> Pallikaranai)
  const placeKeys = [...new Set((o.places ?? []).map((p) => looseKey(fold(p).replace(/\s+/g, ""))).filter((k) => k.length >= 4))];
  const placeOf = qs.map((q) => q.k.length >= 4 && placeKeys.some((pk) => pk[0] === q.k[0] && (pk === q.k || keySim(q.k, pk) >= 0.88 || q.stems.some((st) => st === pk))));
  const memo = new Map<string, number>();
  const sims = qs.map((q) => docs.map((d) => simIn(q, d, memo)));
  // v9: a name the ears split in two or three ("Kasi medu" for Kasimedu, "Palli Karanai" for Pallikaranai: v8's holdout): in each story, the
  // joined word's match stands for its parts when it is a headline word the parts are not (joinedIn); a joined place vetoes a story that has
  // none of its parts. (The review, 19 Nov: no part of two letters, தி.நகர்'s "ti", nor a last part of three, "Adyar HC"; and a story that says
  // "Marina" is not vetoed for "Marina beach", nor an English "T. Nagar" story for தி.நகர்)
  const vetoed = new Set<number>();
  for (let i = 0; i < qs.length; i++) {
    for (const span of [2, 3]) {
      if (i + span > qs.length) break;
      const parts = qs.slice(i, i + span);
      if (parts.some((p) => p.w.length <= 2) || parts[span - 1].w.length <= 3) continue;
      const joined = req.words.slice(i, i + span).join("");
      if (joined.length < 6) continue;
      const jq = qOf(joined);
      const isPlace = placeKeys.some((pk) => pk[0] === jq.k[0] && (pk === jq.k || keySim(jq.k, pk) >= 0.88));
      docs.forEach((d, j) => {
        const s = joinedIn(jq, d, memo, parts);
        if (s > 0) { for (let k = i; k < i + span; k++) if (sims[k][j] < s) sims[k][j] = s; }
        else if (isPlace && sims.slice(i, i + span).every((row) => row[j] === 0)) vetoed.add(j);
      });
    }
  }
  const idf = sims.map((row) => { const df = row.filter((s) => s > 0).length; return Math.log(1 + (n - df + 0.5) / (df + 0.5)); });
  const maxIdf = Math.max(...idf, 0.0001);
  // a word no story holds counts at half weight (something the news does not have: "Kerala floods"); a short fragment that is no word at all
  // ("Imash" in "Palikana Imash", the ears' "Pallikaranai marsh", the real run 18 Nov) at a fifth
  // (v9: a Tamil word with a gloss is a word, not a fragment: "maram" that no story has counts at half, as "Kerala" does)
  const weight = idf.map((v, i) => (sims[i].some((s) => s > 0) ? v : (qs[i].w.length <= 5 && /^[a-z]+$/.test(qs[i].w) && !isEnglishWord(qs[i].w) && !qs[i].gloss ? 0.2 : 0.5) * maxIdf));
  // (v9: a spoken verb form, newsRequest's `weak`, costs a story that does not have it a fifth, and counts in full in a story that has it: v8 gave
  // "மிரண்டு" its full weight against the horse story, which says "தறிகெட்டு", because three other stories had it)
  const weakAt = qs.map((q) => (req.weak ?? []).includes(q.w));
  return docs.map((d, j) => {
    let s = 0, hits = 0, total = 0;
    req.words.forEach((q, i) => {
      const v = sims[i][j];
      if (v > 0) hits++;
      const w = weakAt[i] && v === 0 ? Math.min(weight[i], 0.2 * maxIdf) : weight[i];
      s += w * v; total += w;
    });
    let score = req.words.length ? s / (total || 1) : 0;
    if (req.outlet) {
      const asked = req.outlet;
      const has = (d.item.outlets ?? []).some((x) => sameOutlet(x, asked));
      score = req.words.length ? (has ? score + 0.15 : score - 0.3) : has ? 0.7 : 0;
      if (has && !req.words.length) hits = 1;
    }
    if (d.item.onScreen != null) score += 0.1;
    // a place the request names that the story does not mention: never this story
    if (placeOf.some((p, i) => p && sims[i][j] === 0) || vetoed.has(j)) score = Math.min(score, 0.3);
    return { item: d.item, score, hits };
  }).sort((a, b) => b.score - a.score || (a.item.onScreen ?? 999) - (b.item.onScreen ?? 999) || String(b.item.t ?? "").localeCompare(String(a.item.t ?? "")));
}

/** a report's headline keys for sameStory (v9: kept per pickStory call: worked out again on every pair, a rain week's 600 matches took ~1 s) */
const storyKeys = (x: StoryItem, memo?: Map<StoryItem, Set<string>>): Set<string> => {
  let k = memo?.get(x);
  if (!k) { k = new Set(tokensOf(`${x.titleEn || x.title}`).filter((w) => w.length >= 4).map(looseKey)); memo?.set(x, k); }
  return k;
};
/** two reports of one event: the same story id, or most of their words shared */
export function sameStory(a: StoryItem, b: StoryItem, memo?: Map<StoryItem, Set<string>>): boolean {
  if (a.story && b.story && a.story === b.story) return true;
  const ka = storyKeys(a, memo);
  const kb = storyKeys(b, memo);
  if (!ka.size || !kb.size) return false;
  const inter = [...ka].filter((k) => kb.has(k)).length;
  const min = Math.min(ka.size, kb.size);
  // (v9: two short headlines that share only a two-word place are two events, "Trees uprooted in Anna Nagar" and "Anna Nagar tower park
  // reopens": a third shared word, or the shorter headline wholly in the longer; the review, 19 Nov)
  return inter / min >= 0.5 && inter >= 2 && (inter >= 3 || inter === min || min >= 6);
}

export const FLOOR = 0.55;
/** v9: a soft request's floor (no news word said: only a close story is taken for it; else the console's lanes answer as they did) */
export const SOFT_FLOOR = 0.7;
export const MARGIN = 0.15;

export interface Picked { pick: StoryItem | null; score: number; other: StoryItem | null; close: boolean; stories: StoryItem[] }

/**
 * The story meant: the best above the floor (several outlets' reports of one event count as one: the one on screen, else the newest). Another
 * story within the margin is kept as `other` (said: "say 'the other one' for ..."), never a question back for a read: the Collector corrects a
 * named pick in two words (research 10, recs 5-7). `stories`: the distinct stories above the floor, best first (for a news question).
 */
export function pickStory(ranked: Ranked[], lang: "en" | "ta" | null = null, floor = FLOOR): Picked {
  const good = ranked.filter((r) => r.score >= floor && r.hits > 0);
  if (!good.length) return { pick: null, score: ranked[0]?.score ?? 0, other: null, close: false, stories: [] };
  const groups: Ranked[][] = [];
  const keyMemo = new Map<StoryItem, Set<string>>();
  for (const r of good) {
    const g = groups.find((x) => sameStory(x[0].item, r.item, keyMemo));
    if (g) g.push(r); else groups.push([r]);
  }
  // within one event: the report in the request's own language (an English request is not read a Tamil headline: the real run, 18 Nov), then
  // the one on screen, then the newest
  const inLang = (x: StoryItem) => (lang == null ? 0 : (/[஀-௿]/u.test(x.title) ? "ta" : "en") === lang ? 0 : 1);
  const lead = (g: Ranked[]) => [...g].sort((a, b) => inLang(a.item) - inLang(b.item) || (a.item.onScreen ?? 999) - (b.item.onScreen ?? 999) || String(b.item.t ?? "").localeCompare(String(a.item.t ?? "")))[0];
  const first = lead(groups[0]);
  const second = groups[1] ? lead(groups[1]) : null;
  const close = !!second && groups[0][0].score - groups[1][0].score < MARGIN;
  return { pick: first.item, score: groups[0][0].score, other: close && second ? second.item : null, close, stories: groups.slice(0, 5).map(lead).map((r) => r.item) };
}
