/**
 * v10: the browser's lanes, in front of v8's (docs/jarvis/JARVIS_V10.md 4.3-4.8). One pure function the console (Thunai.tsx handle()) and the
 * evaluation (eval10.live.ts) both run, so what is measured is what the console does.
 *
 *   1. a cut-off line ("Tell me about the", "What are the") or a lone unclear word waits for the rest: nothing is answered, the next sentence
 *      within a few seconds is joined to it (the owner's turns, 18-19 Nov: answered as if they were requests)
 *   2. the screen model (screen10.ts): a position said by ear ("the fast news") is read as the position when a list is on screen
 *   3. a named event or name said by ear (entity10.ts against the day's lexicon): "Tell me about Cyclone Aquan" is the news about Cyclone Akvan,
 *      with the weather readings for a storm; a name heard only half-surely is asked back in a few words ("Cyclone Akvan?"); a class word with a
 *      name the lexicon does not know ("Cyclone Zorbo") still searches the news, never the instant look-up
 *   4. the news in Tamil script's own loanword ("நியூஸ்"), and a story described with no news word ("adha kaattu"): news8.ts
 *   5. then v8's lanes as they were (browser.ts browserLaneV8)
 *
 * Ask the Map by voice (map10.ts) and the dashboard's controls (controls10.ts) sit between 3 and 5 when their modules answer.
 */
import type { NewsAskT } from "../newsask";
import type { Lang, Step } from "../types";
import { mapCommand10, type MapCmd, type MapCtx10 } from "./map10";
import { controlCommand10, type ControlHit } from "./controls10";
import { browserLaneV8, type BrowserCtx, type BrowserLane, type LastFound } from "../v8/browser";
import { namingWords, newsRequest, topicWords } from "../v8/news8";
import { userLang8 } from "../v8/browser";
import { classMention, findMentions, type Mention } from "./entity10";
import type { Entity10 } from "./lexicon10";
import { earOrdinals, screenModel, type ScreenModel } from "./screen10";
import { understandV10 } from "./flag10";
import { embeddedAsk, unclearWord } from "../addressed";
import { districtNounIn } from "../quick";

export type BrowserLane10 = BrowserLane
  /** a cut-off line, a lone unclear word or a line of fillers ("Please."): nothing said; the next sentence is joined to a cut-off one (Thunai.tsx
   * keeps it a few seconds) */
  | { lane: "wait"; why: "cut-off" | "one-word" | "filler"; lang: Lang }
  /** a name heard half-surely: asked back in a few words; a yes runs `then` */
  | { lane: "confirm"; ask: { en: string; ta: string }; then: string; mention: { id: string; name: string }; lang: Lang }
  /** Ask the Map by voice (map10.ts): one map operation; the console runs it (mapops.ts) */
  | { lane: "map"; cmd: MapCmd; lang: Lang }
  /** a dashboard control by voice (controls10.ts): its id, and its steps or the control pressed, or a question back */
  | { lane: "control"; id: string; steps?: Step[]; press?: string | null; value?: string | null; tick?: boolean | null; replace?: boolean; own?: boolean; which?: ControlHit["which"]; level: ControlHit["level"]; label?: ControlHit["label"]; lang: Lang };

export interface BrowserCtx10 extends BrowserCtx {
  lastLang?: Lang | null;
  lastFound?: LastFound | null;
  /** the day's lexicon (lexicon10.ts), from the server; null until it has come */
  lex?: Entity10[] | null;
  /** Ask the Map's suggested questions, when they show */
  suggest?: string[] | null;
  /** Ask the Map's state as the console publishes it (map10.ts MapCtx10 without the language); null: not known */
  askMap?: Omit<MapCtx10, "lang"> | null;
  /** the controls visible now, by registry id, when the console knows them */
  visible?: string[] | null;
  /** how the sentence came (Thunai.tsx sourceRef); unset: spoken. A typed line is finished when Enter is pressed: it never waits for its rest */
  source?: "whisper" | "captions" | "typed" | null;
  /** a dataset is open in the Data Studio (the console's studioRef on the Studio page): its own sentences are its intercept's */
  studio?: boolean;
}

/** words a sentence cannot end on: a line cut off before its point (v8's addressed.ts DANGLING8) */
const DANGLING = /(?:^|\s)(?:the|a|an|and|or|but|of|my|your|our|their|is|are|was|were|if|because|than|what|which|whats)\s*$/i;
/** a request's frame that wants its object and was cut off before it ("tell me about", "any news on", "what about"); a question may end on a
 * preposition otherwise ("Who is this case assigned to?") */
const DANGLING_FRAME = /\b(?:tell (?:me|us)|talk|read|news|update|updates|anything|something|what|how|more)\s+(?:about|on|for|regarding|from)\s*$/i;
/** a whole short request that ends on such a word all the same ("what's going on", "carry on", "log in", "zoom in", "which one is it about") */
const WHOLE = /^(?:(?:hey |ok |okay )?jarvis,? )?(?:what'?s going on|what is going on|go on|carry on|move on|log in|sign in|zoom in|come in|hold on|turn (?:it )?on|switch (?:it )?on|what are you up to|what is it about|what'?s it about|what is this about|what'?s this about|which one is it about)\s*$/i;
/** Tamil and Tanglish lines cut off before their noun: a determiner at the end ("அந்த", "oru"). Not "என்ன" ("அண்ணா நகர் பிரைஸ் என்ன?" is a whole
 * question: Tamil asks with "what" at the end), nor "பற்றி"/"pathi" or "la" ("Akvan puyal pathi?", "Adyar la?" are whole follow-ups): the dry
 * replay of the owner's turns, 19 Nov */
const DANGLING_TA = /(?:அந்த|இந்த|எந்த|ஒரு)\s*$/u;
const DANGLING_TG = /\b(?:andha|indha|endha|oru)\s*$/i;
/** a line of words that carry nothing alone ("தயவுசெய்து,", "Please.", "hmm"): not a thanks, a yes or a no (each a whole answer) */
const FILLERS = /^(?:(?:please|pls|hmm*|mm+|uh|um|ah|oh|aha|தயவுசெய்து|ம்ம்|ம்)[\s,.!?…]*)+$/iu;
/** a greeting or a thanks said alone, in Tanglish or Tamil script ("vanakkam", "வணக்கம்", "nandri", "Namaskaram"; the English ones are English words):
 * whole, never a noise word (v10 review 2, round 3: "Hey Jarvis, vanakkam" got an earcon and no reply) */
const GREETING = /^(?:vanakkam|vanakam|vannakam|vanakkom|namaskaram|namaskar|namaste|namasthe|nandri|nanri|nandrigal|வணக்கம்|நமஸ்காரம்|நமஸ்தே|நன்றி|நன்றிகள்)[\s,.!?…]*$/iu;

/** Is this line cut off before its point? Its words, the punctuation the speech-to-text put at the end aside. */
export function cutOff(text: string): boolean {
  // the words as the gate reads them (addressed.ts norm): "what's" is "whats", and a dash, an ellipsis or a comma the speech-to-text wrote is no word,
  // so every line the open mic's gate holds as cut off is cut off here too, and joinCut gives it its rest ("Tell me what's", "Show me the—": v10
  // review 2, round 2)
  const t = text.normalize("NFC").replace(/[’']/g, "").replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  // (a question embedded in a request ends on its verb and is whole: "Tell me where the Adyar zonal office is", v10 review 2, finding 19)
  if (WHOLE.test(t) || embeddedAsk(t)) return false;
  const words = t.split(/\s+/);
  // one word that is a whole request (a verb, a yes, a place) is not cut off: only the dangling words count
  if (DANGLING.test(` ${t}`) || DANGLING_FRAME.test(t)) return true;
  if (words.length >= 2 && (DANGLING_TA.test(t) || DANGLING_TG.test(t))) return true;
  return false;
}

/** the speech-to-text's joined words, split as said ("Goto" is "go to") */
export const heardFix = (s: string): string => s.replace(/\bgoto\b/gi, (m) => (m[0] === "G" ? "Go to" : "go to"));

/** a fresh request of its own: a verb or a question word first (not the rest of a cut-off line) */
const FRESH = /^(?:(?:hey |hi |ok |okay )?jarvis,? )?(?:show|open|read|tell|go|what|which|who|where|when|how|why|close|stop|compare|any|is|are|can|could|please|pull|bring|give|take|list|filter|draft|send|play|explain)\b|^(?:காட்டு|திற|படி|சொல்|என்ன|எந்த|யார்|எங்கே)/iu;
const flat = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
/**
 * v10: the rest of a cut-off line. A sentence said within `ms` of a line cut off before its point is its rest ("Tell me about the" ... "fast
 * news"), unless it says the cut line over again whole (the owner did: "Tell me about the" then "Tell me about the fast news.") or is a fresh
 * request of its own.
 */
export function joinCut(cut: { text: string; at: number } | null, said: string, now: number, ms = 12_000): string {
  const n = said.trim();
  if (!cut || now - cut.at > ms || now < cut.at) return n;
  // (the end's punctuation off, a dash the speech-to-text wrote for the pause too: "Tell me about the-" ... "fast news")
  const c = cut.text.replace(/[\s.!?,;:…\-‐‑‒–—―]+$/u, "").trim();
  if (!c) return n;
  // only a line cut off before its point has a rest: a noise word that waited ("வாயமுர்ரா.") is dropped, never put in front of the next request
  // (it flipped the answer to Tamil: v10 review 2, finding 26); a lone determiner ("அந்த") is cut off all the same
  if (!cutOff(c) && !DANGLING_TA.test(c) && !DANGLING_TG.test(c)) return n;
  if (flat(n).includes(flat(c)) || FRESH.test(n)) return n;
  return `${c} ${n}`;
}

/** a find body for a named thing: the request with the name the store spells, and the spellings a headline may have */
function entityFind(said: string, m: Mention, c: BrowserCtx10, lang: Lang, weather: boolean): NewsAskT {
  const words = said.split(/(\s+)/);
  // the heard words swapped for the store's own spelling ("Cyclone Aquan" -> "Cyclone Akvan"), the rest as said
  const q = said.replace(m.heard, m.entity.core).slice(0, 400);
  void words;
  const items = (c.news.items ?? []).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id) && !/^web-\d/.test(x.id));
  return { kind: "find", body: { find: { q, lang, screen: items.slice(0, 250).map((x) => ({ id: x.id, title: x.title ? x.title.slice(0, 400) : null, source: x.source ? x.source.slice(0, 300) : null })),
    entity: { name: m.entity.name, kind: m.entity.kind, spellings: m.entity.spellings.slice(0, 12) }, ...(weather ? { weather: true } : {}) } } } as NewsAskT;
}

/** the console's own records and controls: a sentence about them is the console's, a name in it notwithstanding ("show the complaints in Adyar") */
const CONSOLE = /\b(?:complaints?|grievances?|petitions?|cases?|incidents?|tickets?|officers?|departments?|backlog|sla|overdue|readings?|rainfall|reservoirs?|lakes?|aqi|zones?|wards?|taluks?|drafts?|tray|map|maps|page|panel|tab|trends?|chart|graph|filter|period|weekly|monthly|dashboard|briefing|layer|layers)\b|புகார்|சம்பவ|மனு|மண்டல|வார்டு|வரைபட/iu;
/** a forecast question with no name: the weather look-up's, as in v6 ("will it rain tonight", "IMD forecast") */
const FORECAST_ONLY = /\b(?:will it rain|going to rain|forecast|nowcast|red alert|orange alert|yellow alert|weather (?:warning|alert|forecast|bulletin))\b|வானிலை\s*(?:முன்னறிவிப்பு|எச்சரிக்கை)|நாளை மழை/iu;
/** asked about a name: "tell me about", "what about", "any news on", "the latest on", "update on", "explain", "what happened to", "who is", "read",
 * "open", and the Tamil and Tanglish "pathi", பற்றி, பத்தி */
const ABOUT = /\b(?:tell (?:me|us) (?:more )?about|what about|how about|anything (?:on|about)|news (?:on|about)|latest (?:on|about)|updates? (?:on|about)|explain|what happened (?:to|with|at)|what'?s happening (?:to|with)|who is|who'?s|read|open|pull up|brief me on|health|status of)\b|\b(?:pathi|patthi|paththi|enna aachu|enna achu)\b|பற்றி|பத்தி|என்ன ஆச்சு|என்னாச்சு/iu;
/** a news-like ask about a storm with no name ("what's the latest on the cyclone", "puyal pathi enna news"): the news, with the weather */
const STORM_ASK = /\b(?:latest|update|updates|news|happening|happened|status|where is|tell me about|what about|explain)\b|\b(?:enna aachu|enna nilamai|pathi enna|pathi sollu\w*)\b|என்ன ஆச்சு|பற்றி|நிலவரம்|செய்தி|நியூஸ்/iu;

/** v10's order: the cut-off wait, the by-ear positions, the named thing, then v8's lanes. */
export function browserLaneV10(said0: string, c: BrowserCtx10): BrowserLane10 {
  const f = v10Front(said0, c);
  return f.lane ?? browserLaneV8(f.said, c);
}

/**
 * v10's own lanes, in front of v8's: the lane they take (null: none of v10's), and the sentence as v8's lanes are to read it (a position by ear
 * read as the position). Thunai.tsx runs this, then its own inline v8 lanes on `said`, as browserLaneV10 runs browserLaneV8.
 */
export function v10Front(said1: string, c: BrowserCtx10): { said: string; lane: BrowserLane10 | null } {
  if (!understandV10()) return { said: said1, lane: null };
  // the speech-to-text's own joins: "Goto News." is "go to news" (the owner's turn, 19 Nov: v9 searched the news for "goto")
  const said0 = heardFix(said1);
  const lane = v10Lane(said0, c);
  const sm: ScreenModel = screenModel({ stage: c.stage, state: c.state, news: c.news, suggest: c.suggest ?? null });
  return { said: earOrdinals(said0, { list: sm.lists.length > 0 }), lane: lane && lane.lane !== "server" ? lane : null };
}

function v10Lane(said0: string, c: BrowserCtx10): BrowserLane10 | null {
  const lang = userLang8(said0, c.lastLang ?? null);
  // 1. cut off before its point: wait for the rest (the gate silences it on the open mic; here, named or engaged, it is not answered either);
  // and a lone word no lexicon knows ("வாயமுர்ரா.": the owner's turn, answered by the planner on 18 Nov)
  // (a typed line is finished when Enter is pressed: it is answered as typed, as v9 did; v10 review 2, finding 19)
  const typed = c.source === "typed";
  if (!typed && cutOff(said0)) return { lane: "wait", why: "cut-off", lang };
  // (a name of the day or the news word said alone is no noise: "Akvan", "Arlekar", "அக்வான்", "Seithi"; v10 review 2, finding 23)
  if (!typed && unclearWord(said0, districtNounIn(said0, c.world)) && !NEWS_WORD.test(said0) && !GREETING.test(said0.normalize("NFC").trim())
    && !(c.lex?.length && findMentions(said0, c.lex, { kinds: ["storm", "name"] }).length)) return { lane: "wait", why: "one-word", lang };
  // fillers alone carry nothing ("தயவுசெய்து,", "Please.": the brief's Part 3, v10 review 2, finding 27); a thanks, a yes or a no is whole. Typed, they
  // are answered as typed: a typed line never waits (round 2: a typed "Please." got no reply at all)
  if (!typed && FILLERS.test(said0.normalize("NFC").trim())) return { lane: "wait", why: "filler", lang };
  // 2. a position by ear, read as the position, when a list is on screen
  const sm: ScreenModel = screenModel({ stage: c.stage, state: c.state, news: c.news, suggest: c.suggest ?? null });
  const said = earOrdinals(said0, { list: sm.lists.length > 0 });
  // 2b. Ask the Map by voice, then a dashboard control by voice (each module answers only for what is plainly its own)
  const mc = mapCommand10(said, { ...(c.askMap ?? { open: false, hasAnswer: false }), lang });
  if (mc) return { lane: "map", cmd: mc, lang };
  const cc = controlCommand10(said, { state: c.state, lang, visible: c.visible ?? null, stage: !!c.stage, studio: !!c.studio });
  if (cc) return { ...cc, lane: "control", lang };
  // 3. a named thing: the day's lexicon, by ear
  const consoleThing = CONSOLE.test(said) && !/\b(?:news|story|article|seithi|seidhi)\b|செய்தி|நியூஸ்/iu.test(said);
  if (!consoleThing && c.lex?.length) {
    const ms = findMentions(said, c.lex, { kinds: ["storm", "name"] });
    // a person's or a body's name is the news only when asked about ("tell me about Arlekar", "any update on the IOCL"), or said alone; "CM Vijay is
    // visiting Adyar, what should I know?" is a visit's brief (v7's asks7), not a story. A storm heard only half-surely with no class word is asked
    // about as a name is ("Adyar AE avan phone edukkala" was asked back "Cyclone Akvan?": v10 review 2, finding 22)
    const m = ms.find((x) => (x.entity.kind === "storm" && (x.band === "sure" || x.cls === "storm")) || ABOUT.test(said) || said.replace(/[.?!,]/g, "").trim().split(/\s+/).length <= 3);
    if (m) {
      const storm = m.entity.kind === "storm";
      if (m.band === "ask") {
        const then = said.replace(m.heard, m.entity.core);
        return { lane: "confirm", ask: { en: `${m.entity.name}?`, ta: storm ? `${m.entity.core} புயலா?` : `${m.entity.name}-ஆ?` }, then, mention: { id: m.entity.id, name: m.entity.name }, lang };
      }
      return { lane: "news", na: entityFind(said, m, c, lang, storm), lang };
    }
  }
  // a class word with a name the lexicon does not know ("Cyclone Zorbo"): still the news (and the weather for a storm), never the look-up
  if (!consoleThing) {
    const cm = classMention(said);
    if (cm && cm.cls === "storm") {
      const fake: Mention = { entity: { id: `storm:${cm.name}`, kind: "storm", name: `Cyclone ${cm.name}`, core: cm.name, spellings: [cm.name], keys: [], docs: [], n: 0 }, score: 1, band: "sure", heard: cm.name, at: [0, 0], cls: "storm" };
      return { lane: "news", na: entityFind(said, fake, c, lang, true), lang };
    }
    // a storm asked about with no name ("what's the latest on the cyclone"): the news about the storm, with the weather; a forecast stays v6's
    const stormWord = /\b(?:cyclone|storm|puyal)\b|புயல்|சைக்ளோன்|சைக்கிளோன்/iu.test(said);
    if (stormWord && STORM_ASK.test(said) && !FORECAST_ONLY.test(said)) {
      const items = (c.news.items ?? []).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id) && !/^web-\d/.test(x.id));
      return { lane: "news", na: { kind: "find", body: { find: { q: `news on the cyclone ${said}`.slice(0, 400), lang, screen: items.slice(0, 250).map((x) => ({ id: x.id, title: x.title ? x.title.slice(0, 400) : null, source: x.source ? x.source.slice(0, 300) : null })), weather: true } } } as NewsAskT, lang };
    }
  }
  // 4. a story on the screen named by its topic with no news word ("Open the GCC issue." over the news panel: the owner, 18 Nov): a find among the
  // screen's stories only, soft (nothing that close: the lanes behind take the sentence, as v8 sent it)
  const main = sm.lists[0];
  // (only what v8's own news lane does not read: "open that one, that's ...", "the DT Next one", an outlet's story are its: v8's dev set)
  // (v10 review 2, round 2, news-1: and only with a word that names a story, as a soft find's: "Open Adyar", "open the Royapuram protest" are
  // the console's views, as in v9, never a story there)
  if (main?.kind === "news" && !consoleThing && SCREEN_VERB.test(said) && !NEWS_WORD.test(said) && !PANEL_WORD.test(said) && namingWords(said, topicWords(said, null)).which.length
    && !newsRequest(said, { onScreen: true })) {
    const items = main.items.filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id));
    return { lane: "news", na: { kind: "find", body: { find: { q: said.slice(0, 400), lang, screen: items.slice(0, 250).map((x) => ({ id: x.id, title: x.title ? x.title.slice(0, 400) : null, source: x.source ? String(x.source).slice(0, 300) : null })), onlyScreen: true } }, soft: true } as NewsAskT, lang, soft: browserLaneV8(said, c) };
  }
  // 5. none of v10's: v8's lanes take it (with the by-ear positions read)
  return null;
}
/** a verb that opens, reads or tells about one thing on a list (not "show": the console's views) */
const SCREEN_VERB = /\b(?:open|read|play|pull up|bring up|tell me about|tell me more about|explain)\b|\b(?:open pannu\w*|padi\w*|thira\w*|sollu\w*)\b|(?:^|\s)(?:திற|படி|சொல்)\S*/iu;
// (v10 review 2, round 2, news-4b: the press's English in Tamil letters with any ending, as news8.ts reads it)
const NEWS_WORD = /\b(?:news|story|stories|article|report|headline|piece|seithi|seidhi)\b|செய்தி|சேதி|நியூஸ|ஹெட்லைன|ஸ்டோரி|ஆர்டிகிள|ஆர்ட்டிக்கிள|ரிப்போர்ட/iu;
/** the console's own panels and pages, closing and switching: moves, never a story */
const PANEL_WORD = /\b(?:panel|page|tab|window|screen|section|close|switch|filter|sort)\b|பேனல்|பக்கம்/iu;
