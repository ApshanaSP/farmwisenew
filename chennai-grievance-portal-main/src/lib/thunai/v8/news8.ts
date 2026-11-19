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
  "arikkai arikkaiyai vantirukku vantirukkiratu ullatu ullana").split(/\s+/));

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
  { name: "Malaimurasu Seithikal", words: ["malaimurasu"] }, { name: "DD News", words: ["dd", "news"] }, { name: "DD News", words: ["doordarshan"] }, { name: "News On AIR", words: ["news", "on", "air"] },
  { name: "Dinamani", words: ["dinamani"] }, { name: "Dinamalar", words: ["dinamalar"] }, { name: "Dinakaran", words: ["dinakaran"] }, { name: "Maalaimalar", words: ["maalaimalar"] },
  { name: "NDTV", words: ["ndtv"] }, { name: "News18", words: ["news18"] }, { name: "BBC", words: ["bbc"] }, { name: "PTI", words: ["pti"] },
  { name: "BusinessLine", words: ["businessline"] }, { name: "Mathrubhumi English", words: ["mathrubhumi"] },
  // (not "Times Now", "India Today" or "News7": ordinary words in a sentence, "three times now", "open news 7")
  // "தி இந்து" (the paper's name said in Tamil); "இந்து" alone is the religion ("இந்து அறநிலையத் துறை")
  { name: "The Hindu", words: ["thi", "indhu"] },
  { name: "The Hindu", words: ["hindu"], notBefore: ["tamil", "munnani", "makkal", "temple", "temples", "religious", "religion", "endowments", "outfit", "outfits", "organisation", "organisations", "organization", "organizations", "festival", "festivals", "devotees", "mahasabha", "front"] }
];
/**
 * one heard word against one word of an outlet's name, 0..1: the same loose key 1 (a name with a digit: the same word, "News18"); `byEar`, a
 * word of six letters or more one or two edits away (Jaro-Winkler and the edit distance's first band only: no "cut short" or consonants-only
 * match, which made "malar" Malaimurasu and the four Dina- papers one another)
 */
const outletWord = (tok: string, w: string, byEar: boolean): number => {
  if (/\d/.test(w)) return tok === w ? 1 : 0;
  const a = looseKey(tok), b = looseKey(w);
  if (a && a === b) return 1;
  if (!byEar || w.length < 6 || a.length < 5) return 0;
  const jw = jaroWinkler(a, b), dl = editDistance(a, b);
  return (Math.min(a.length, b.length) <= 7 ? jw >= 0.9 && dl <= 1 : jw >= 0.88 && dl <= 2) ? jw : 0;
};
/** the outlet named in these words, and where (its first word and how many words it takes), or null: an exact name anywhere first, then the
 * closest name by ear */
export function outletRun(toks: string[]): { name: string; i: number; n: number } | null {
  let best: { name: string; i: number; n: number; s: number } | null = null;
  for (const byEar of [false, true]) {
    for (const o of OUTLETS) {
      const joinedName = o.words.join("");
      for (let i = 0; i < toks.length; i++) {
        const after = (n: number) => !o.notBefore?.includes(toks[i + n] ?? "");
        if (i + o.words.length <= toks.length && after(o.words.length)) {
          const s = Math.min(...o.words.map((w, k) => outletWord(toks[i + k], w, byEar)));
          if (s > 0 && (!best || s > best.s)) best = { name: o.name, i, n: o.words.length, s };
        }
        // a name said in parts ("dina malar", "maalai malar", "news 18")
        for (let n = 2; n <= 3 && i + n <= toks.length; n++) {
          if (n === o.words.length || !after(n)) continue;
          const said = toks.slice(i, i + n).join("");
          const s = said.length >= 5 ? outletWord(said, joinedName, byEar) : 0;
          if (s > 0 && (!best || s > best.s)) best = { name: o.name, i, n, s };
        }
      }
      if (!byEar && best) return { name: best.name, i: best.i, n: best.n };
    }
  }
  return best ? { name: best.name, i: best.i, n: best.n } : null;
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
const TA_OWN = /^(?:(?:செய்தி|சேதி|கட்டுரை|அறிக்கை)(?:யை|யைப்|யைத்|யில்|யில|யின்|கள்|களை|களில்|யா|யும்)?|திற(?:ங்க|ங்கள்|ந்து|க்கவும்|க்க)?|படி(?:ங்க|யுங்கள்|யுங்க|க்கவும்|த்து)?|சொல்(?:லு|லுங்க|லுங்கள்|லவும்)?|காட்டு(?:ங்க|ங்கள்)?|காமி(?:ங்க)?|விளக்கு(?:ங்க|ங்கள்)?|பற்றி|பத்தி|குறித்து|என்ன|இருக்கா|இருக்கு|இருக்கிறதா|வந்திருக்கு|வந்திருக்கா|அந்த|அந்தச்|அந்தத்|இந்த|இந்தச்|இந்தத்|ஏதாவது|போடு(?:ங்க)?|தயவுசெய்து|கொஞ்சம்|முதல்|முதலாவது|இரண்டாவது|ரெண்டாவது|மூன்றாவது|கடைசி)$/u;
/** Tanglish news words with their endings ("seithiya", "seidhila"); "pannunga" as Whisper spells it ("panyunga", "panunga": the real run o8b) */
const TG_NEWS = /^(?:seithi|seidhi|seythi|sethi|seyti|seiti|seti)|^pa+n+[iy]?u+(?:nga|ngal|ngo)?$/;

/** the topic words of a request: its own verbs, news nouns, references and fillers out; Tamil romanised */
export function topicWords(text: string, outlet: string | null): string[] {
  const t = text.split(/\s+/).filter((w) => !TA_OWN.test(w.replace(/^[^஀-௿]+/u, "").replace(/[^஀-௿]+$/u, ""))).join(" ");
  let toks = outletToks(t);
  // the outlet's own words are not the topic (found again on these words: the same reader as outletIn's)
  if (outlet) { const r = outletRun(toks); if (r && r.name === outlet) toks = [...toks.slice(0, r.i), ...toks.slice(r.i + r.n)]; }
  return toks.filter((w) => !STOP.has(w) && !TG_NEWS.test(w) && !/^\d+$/.test(w) && w.length >= 2 && !STOP.has(w.replace(/(?:a|ah|ai|ae|e|il|la|le)$/, "")));
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
  const theOne = /\b(?:the|that|this|andha|antha)\s+[\p{L}\p{M}\s.'’-]{2,60}?\s+one\b|\bone about\b|\b(?:that|this) one\b/iu.test(text) && o.onScreen;
  if (!newsy && !theOne && !asks) return null;
  // at most 12 topic words (a request at the schema's 400 characters must not hold the server: the review, 19 Nov)
  const words = topicWords(text, outlet).slice(0, 12);
  // "read the second story", "open the news": no topic of its own (ordinals and the panel are other lanes')
  if (!words.length && !outlet) return null;
  // "what's happening in Royapuram": a place's situation is the console's (its place lane), unless it names the news
  if (!newsy && !theOne && words.every((w) => placeWord(w))) return null;
  if (ORDINAL_ONLY.test(text.replace(/[.?!,]+$/g, "").trim())) return null;
  const ref = REF.test(text) && words.length <= 3;
  if (asks && !STORY_VERB.test(text.replace(/\bshow me\b/i, ""))) return { kind: "ask", words, outlet, ref };
  // "what happened at X" with no news word is a question about the district, unless it names a story's topic: the ranking decides
  return { kind: STORY_VERB.test(text) || theOne || (newsy && !asks) ? "story" : "ask", words, outlet, ref };
}

// ---- ranking

interface Doc { item: StoryItem; keys: Set<string>; /** the story's word keys by their first letter: every match path needs that letter equal */ byFirst: Map<string, { k: string; en: string | null }[]>; latin: boolean }
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
  const byFirst = new Map<string, { k: string; en: string | null }[]>();
  const seen = new Set<string>();
  for (const w of toks) {
    const k = looseKey(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const e = { k, en: /^[a-z]{5,}$/.test(w) ? looseKey(enStem(w)) : null };
    const l = byFirst.get(k[0]); if (l) l.push(e); else byFirst.set(k[0], [e]);
  }
  const d: Doc = { item: x, keys, byFirst, latin: !/[஀-௿]/u.test(x.title) };
  if (docMemo.size > 20_000) docMemo.clear();
  docMemo.set(memoKey, d);
  return d;
};

/** one topic word, worked out once: its key, its stems' keys, its English stem */
interface QWord { w: string; k: string; stems: string[]; en: string | null; says: string[] | null }
const qOf = (w: string): QWord => ({ w, k: looseKey(w), stems: stemsOf(w).map(looseKey).filter((s) => s.length >= 4), en: /^[a-z]{5,}$/.test(w) ? looseKey(enStem(w)) : null, says: SAYS_FOR[w]?.map(looseKey) ?? null });

/** a long name cut short by the ears ("Palikana" for Pallikaranai): the same first six letters or more, most of the shorter word */
const sharedHead = (a: string, b: string): number => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/** how well one topic word is in one story: its best word, 0 below 0.8 (the memo holds each word pair's score across the stories) */
function simIn(q: QWord, d: Doc, memo: Map<string, number>): number {
  if (d.keys.has(q.k)) return 1;
  if (q.says && q.says.every((k) => d.keys.has(k))) return 1;
  let best = 0;
  for (const { k: tk, en: ten } of d.byFirst.get(q.k[0]) ?? []) {
    const mk = `${q.k}|${tk}`;
    let s = memo.get(mk);
    if (s === undefined) {
      s = keySim(q.k, tk);
      for (const st of q.stems) if (st[0] === tk[0]) s = Math.max(s, keySim(st, tk) * 0.98);
      if (s < 0.8 && q.en && ten && q.en === ten) s = 0.92;
      if (s < 0.8 && q.k.length >= 4 && tk.length >= 4 && skeleton(q.k).length >= 3 && skeleton(q.k) === skeleton(tk)) s = 0.85;
      if (s < 0.8) { const h = sharedHead(q.k, tk); if (h >= 6 && h >= 0.6 * Math.min(q.k.length, tk.length)) s = 0.85; }
      memo.set(mk, s);
    }
    if (s > best) best = s;
    if (best >= 1) break;
  }
  return best >= 0.8 ? best : 0;
}

/**
 * v9: a joined word ("Kasi medu" said for Kasimedu) in one story: its whole key, or a case ending's stem, against one headline word (0 below 0.88).
 * No shared head and no consonants-only match: those would let "Pallikaranai marsh" joined stand for "marsh" in every Pallikaranai story.
 */
function joinedIn(q: QWord, d: Doc, memo: Map<string, number>): number {
  let best = 0;
  for (const { k: tk } of d.byFirst.get(q.k[0]) ?? []) {
    const mk = `j|${q.k}|${tk}`;
    let s = memo.get(mk);
    if (s === undefined) {
      s = keySim(q.k, tk);
      for (const st of q.stems) if (st[0] === tk[0]) s = Math.max(s, keySim(st, tk) * 0.98);
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
export function rankStories(req: Pick<NewsReq, "words" | "outlet">, items: StoryItem[], o: { places?: string[] } = {}): Ranked[] {
  if (!items.length || (!req.words.length && !req.outlet)) return [];
  const docs = items.map(docOf);
  const n = docs.length;
  const qs = req.words.map(qOf);
  // the request's place words, decided once a word: a topic word that names a district place ("Palikan" -> Pallikaranai)
  const placeKeys = [...new Set((o.places ?? []).map((p) => looseKey(fold(p).replace(/\s+/g, ""))).filter((k) => k.length >= 4))];
  const placeOf = qs.map((q) => q.k.length >= 4 && placeKeys.some((pk) => pk[0] === q.k[0] && (pk === q.k || keySim(q.k, pk) >= 0.88 || q.stems.some((st) => st === pk))));
  const memo = new Map<string, number>();
  const sims = qs.map((q) => docs.map((d) => simIn(q, d, memo)));
  // v9: a name the ears split in two or three ("Kasi medu" for Kasimedu, "Palli Karanai" for Pallikaranai: v8's holdout): in each story, the
  // joined word's match stands for its parts when it is better than theirs; a joined place the story does not mention vetoes it, unless the
  // story has every part as a word of its own ("Anna Nagar" written apart)
  const vetoed = new Set<number>();
  for (let i = 0; i < qs.length; i++) {
    for (const span of [2, 3]) {
      if (i + span > qs.length) break;
      const joined = req.words.slice(i, i + span).join("");
      if (joined.length < 6) continue;
      const jq = qOf(joined);
      const isPlace = placeKeys.some((pk) => pk[0] === jq.k[0] && (pk === jq.k || keySim(jq.k, pk) >= 0.88));
      docs.forEach((d, j) => {
        const s = joinedIn(jq, d, memo);
        if (s > 0) { for (let k = i; k < i + span; k++) if (sims[k][j] < s) sims[k][j] = s; }
        else if (isPlace && !sims.slice(i, i + span).every((row) => row[j] > 0)) vetoed.add(j);
      });
    }
  }
  const idf = sims.map((row) => { const df = row.filter((s) => s > 0).length; return Math.log(1 + (n - df + 0.5) / (df + 0.5)); });
  const maxIdf = Math.max(...idf, 0.0001);
  // a word no story holds counts at half weight (something the news does not have: "Kerala floods"); a short fragment that is no word at all
  // ("Imash" in "Palikana Imash", the ears' "Pallikaranai marsh", the real run 18 Nov) at a fifth
  const weight = idf.map((v, i) => (sims[i].some((s) => s > 0) ? v : (qs[i].w.length <= 5 && /^[a-z]+$/.test(qs[i].w) && !isEnglishWord(qs[i].w) ? 0.2 : 0.5) * maxIdf));
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  return docs.map((d, j) => {
    let s = 0, hits = 0;
    req.words.forEach((q, i) => { const v = sims[i][j]; if (v > 0) hits++; s += weight[i] * v; });
    let score = req.words.length ? s / total : 0;
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

/** two reports of one event: the same story id, or most of their words shared */
export function sameStory(a: StoryItem, b: StoryItem): boolean {
  if (a.story && b.story && a.story === b.story) return true;
  const ka = new Set(tokensOf(`${a.titleEn || a.title}`).filter((w) => w.length >= 4).map(looseKey));
  const kb = new Set(tokensOf(`${b.titleEn || b.title}`).filter((w) => w.length >= 4).map(looseKey));
  if (!ka.size || !kb.size) return false;
  const inter = [...ka].filter((k) => kb.has(k)).length;
  return inter / Math.min(ka.size, kb.size) >= 0.5 && inter >= 2;
}

export const FLOOR = 0.55;
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
  for (const r of good) {
    const g = groups.find((x) => sameStory(x[0].item, r.item));
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
