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
import { fold, looseKey, tokenSim, tokensOf } from "./match";
import { placeWord } from "./lang8";

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
/** a forecast or a warning (v6's look-up lane answers those from the Met office and NDMA) */
const FORECAST = /\b(?:will it rain|going to rain|forecast|nowcast|weather (?:warning|alert|forecast|report|update|bulletin)|red alert|orange alert|yellow alert)\b|வானிலை|முன்னறிவிப்பு/iu;
/** a negation: "don't open the news" */
const NEGATED = /\b(?:don'?t|dont|do not|never|no need|stop)\b|வேண்டாம்|வேணாம்|\bvenaam\b|\bvendaam\b/iu;
const ORDINAL_ONLY = /^(?:the )?(?:first|second|third|fourth|fifth|last|1st|2nd|3rd|mudhal|rendavadhu|rendaavadhu|moonavadhu|kadaisi)(?: one| news| story| article)?$/i;
/** a reference to the story in focus: "that one", "this news", "andha news", "அந்தச் செய்தி" */
const REF = /\b(?:that|this|it)\b|\b(?:andha|antha|indha|intha|adhu|idhu)\b|அந்த|இந்த/iu;

/** the outlets a request may name (spoken forms -> the outlet's name as the console lists it) */
export const OUTLET_NAMES: [RegExp, string][] = [
  [/\b(?:the )?hindu\b(?! tamil)/i, "The Hindu"], [/\bhindu tamil\b|இந்து தமிழ்/iu, "Hindu Tamil Thisai"], [/\b(?:times of india|toi)\b/i, "The Times of India"],
  [/\bdt ?next\b|\bd\.? ?t\.? next\b/i, "DT Next"], [/\b(?:new )?indian express\b/i, "The New Indian Express"], [/\bdinamani\b|தினமணி/iu, "Dinamani"],
  [/\bdina?malar\b|தினமலர்/iu, "Dinamalar"], [/\b(?:daily |dina )?thanthi\b(?! tv)|தினத்தந்தி/iu, "Daily Thanthi"], [/\bthanthi tv\b/i, "Thanthi TV"],
  [/\bdinakaran\b|தினகரன்/iu, "Dinakaran"], [/\beconomic times\b/i, "The Economic Times"], [/\bdeccan chronicle\b/i, "Deccan Chronicle"], [/\betv bharat\b/i, "ETV Bharat"],
  [/\bndtv\b/i, "NDTV"], [/\bnews ?18\b/i, "News18"], [/\bbbc\b/i, "BBC"], [/\bmakkal kural\b/i, "Makkal Kural"]
];
export const outletIn = (text: string): string | null => OUTLET_NAMES.find(([re]) => re.test(text))?.[1] ?? null;

/** Tamil-script words that are the request's own (news nouns, verbs, references, question words), whatever their endings */
const TA_OWN = /^(?:செய்தி|சேதி|கட்டுரை|அறிக்கை|திற|படி|படிங்க|சொல்|காட்டு|காமி|விளக்கு|பற்றி|பத்தி|குறித்து|என்ன|இருக்|வந்திருக்|அந்த|இந்த|ஏதாவது|போடு|தயவு|கொஞ்சம்|முதல்|இரண்டாவது|ரெண்டாவது|மூன்றாவது|கடைசி)/u;
/** Tanglish news words with their endings ("seithiya", "seidhila") */
const TG_NEWS = /^(?:seithi|seidhi|seythi|sethi|seyti|seiti|seti)/;

/** the topic words of a request: its own verbs, news nouns, references and fillers out; Tamil romanised */
export function topicWords(text: string, outlet: string | null): string[] {
  let t = text.split(/\s+/).filter((w) => !TA_OWN.test(w.replace(/^[^஀-௿]+/u, ""))).join(" ");
  if (outlet) for (const [re] of OUTLET_NAMES.filter(([, n]) => n === outlet)) t = t.replace(re, " ");
  return tokensOf(t).filter((w) => !STOP.has(w) && !TG_NEWS.test(w) && !/^\d+$/.test(w) && w.length >= 2 && !STOP.has(w.replace(/(?:a|ah|ai|ae|e|il|la|le)$/, "")));
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
  if (consoleThing) return null;
  if (FORECAST.test(text) && !NEWS_NOUN.test(text)) return null;
  const newsy = NEWS_NOUN.test(text) || !!outlet;
  const asks = ASK_EN.test(text) || ASK_TA.test(text) || ASK_TG.test(text) || /\bwhat(?:'s| is| are) the (?:papers|news) saying\b/i.test(text);
  // "the Nungambakkam subway one", "the one about ...", and "open that one, that's the Supreme Court order" (the owner's words, 18 Nov)
  const theOne = /\b(?:the|that|this|andha|antha)\s+[\p{L}\p{M}\s.'’-]{2,60}?\s+one\b|\bone about\b|\b(?:that|this) one\b/iu.test(text) && o.onScreen;
  if (!newsy && !theOne && !asks) return null;
  const words = topicWords(text, outlet);
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

interface Doc { item: StoryItem; toks: string[]; keys: string[]; outlets: string[] }
const docOf = (x: StoryItem): Doc => {
  const toks = [...new Set([...tokensOf(`${x.title} ${x.titleEn ?? ""} ${x.place ?? ""}`)])].filter((w) => w.length >= 2);
  return { item: x, toks, keys: toks.map(looseKey), outlets: (x.outlets ?? []).map((n) => n.toLowerCase()) };
};
/** how well one topic word is in one story: its best word, 0 below 0.8 */
const simIn = (q: string, d: Doc): number => {
  const qk = looseKey(q);
  if (d.keys.includes(qk)) return 1;
  const says = SAYS_FOR[q];
  if (says && says.every((w) => d.keys.includes(looseKey(w)))) return 1;
  let best = 0;
  for (const t of d.toks) { const s = tokenSim(q, t); if (s > best) best = s; if (best >= 1) break; }
  return best >= 0.8 ? best : 0;
};

/** the zones and places a request names (research 10, rec 4: a place the story does not mention vetoes it) */
export interface Places { names: string[] }

/** Score every candidate story against the request. Stories on screen first; ties go to the newer. */
export function rankStories(req: Pick<NewsReq, "words" | "outlet">, items: StoryItem[], o: { places?: string[] } = {}): Ranked[] {
  if (!items.length || (!req.words.length && !req.outlet)) return [];
  const docs = items.map(docOf);
  const n = docs.length;
  // the request's place words: a topic word that names a district place ("Palikan" -> Pallikaranai)
  const placeKeys = new Set((o.places ?? []).map((p) => looseKey(fold(p).replace(/\s+/g, ""))));
  const isPlace = (q: string) => [...placeKeys].some((pk) => pk.length >= 4 && (looseKey(q) === pk || tokenSim(q, pk) >= 0.88));
  const sims = req.words.map((q) => docs.map((d) => simIn(q, d)));
  const idf = sims.map((row) => { const df = row.filter((s) => s > 0).length; return Math.log(1 + (n - df + 0.5) / (df + 0.5)); });
  const maxIdf = Math.max(...idf, 0.0001);
  // a word no story holds (a slip of the ears, or something the news does not have) counts at half weight
  const weight = idf.map((v, i) => (sims[i].some((s) => s > 0) ? v : 0.5 * maxIdf));
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  const outletKey = req.outlet ? req.outlet.toLowerCase().replace(/^the /, "") : null;
  return docs.map((d, j) => {
    let s = 0, hits = 0;
    req.words.forEach((q, i) => { const v = sims[i][j]; if (v > 0) hits++; s += weight[i] * v; });
    let score = req.words.length ? s / total : 0;
    if (outletKey) {
      const has = d.outlets.some((x) => x.replace(/^the /, "") === outletKey || x.includes(outletKey));
      score = req.words.length ? (has ? score + 0.15 : score - 0.3) : has ? 0.7 : 0;
      if (has && !req.words.length) hits = 1;
    }
    if (d.item.onScreen != null) score += 0.1;
    // a place the request names that the story does not mention: never this story
    if (req.words.some((q, i) => isPlace(q) && sims[i][j] === 0)) score = Math.min(score, 0.3);
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
export function pickStory(ranked: Ranked[]): Picked {
  const good = ranked.filter((r) => r.score >= FLOOR && r.hits > 0);
  if (!good.length) return { pick: null, score: ranked[0]?.score ?? 0, other: null, close: false, stories: [] };
  const groups: Ranked[][] = [];
  for (const r of good) {
    const g = groups.find((x) => sameStory(x[0].item, r.item));
    if (g) g.push(r); else groups.push([r]);
  }
  const lead = (g: Ranked[]) => [...g].sort((a, b) => (a.item.onScreen ?? 999) - (b.item.onScreen ?? 999) || String(b.item.t ?? "").localeCompare(String(a.item.t ?? "")))[0];
  const first = lead(groups[0]);
  const second = groups[1] ? lead(groups[1]) : null;
  const close = !!second && groups[0][0].score - groups[1][0].score < MARGIN;
  return { pick: first.item, score: groups[0][0].score, other: close && second ? second.item : null, close, stories: groups.slice(0, 5).map(lead).map((r) => r.item) };
}
