/**
 * v8: the browser's own decisions about a sentence, before the server's round, as one pure function (no React, no network).
 *
 * Thunai.tsx handle() takes a sentence through these lanes in this order: the news reader (newsask.ts), the open Stage's own commands
 * (stagelocal.ts), the memory, brief, follow and mission flows (quick.ts intentMarker, missions.words.ts), the instant controls and plain
 * moves the rules are sure of (understand.ts), and only then the server's round. The evaluation (v8/eval8.live.ts) runs a sentence through
 * this same function, so what it scores is what the browser does.
 *
 * `v8: false` is v7's order exactly (the evaluation's "before"); `v8: true` adds the v8 lanes (v8/understand8.ts) in front.
 */
import type { NewsOnScreen, NewsAskT } from "../newsask";
import { newsAsk } from "../newsask";
import { localStageCommand, type LocalCmd } from "../stagelocal";
import { intentMarker } from "../quick";
import { missionIntent } from "../missions.words";
import { understand } from "../understand";
import { isNavCommand, isPlainMove, isReflex } from "../plan";
import { planRisk } from "../risk";
import type { Lang, ScreenState, Step, World } from "../types";
import { asksWhatToday, followAsk } from "@/components/collector/app/thunai/aide";
import { understandV8 } from "./flag8";
import { placeWord, replyLang8 } from "./lang8";
import { newsRequest, outletIn, topicWords } from "./news8";
import { newsOrdinal8, stageRef8, type RowRef } from "./refs8";

export type BrowserLane =
  /** v9: `soft`, a soft find's way back: the lane the sentence takes when the news has nothing that close (the console does the same) */
  | { lane: "news"; na: NewsAskT; lang: Lang; soft?: BrowserLane }
  | { lane: "stage"; cmd: LocalCmd; lang: Lang; explain?: boolean }
  | { lane: "memory"; intent: "remember" | "forget" | "recall"; lang: Lang }
  | { lane: "today"; lang: Lang }
  | { lane: "brief"; lang: Lang }
  | { lane: "follow"; lang: Lang }
  | { lane: "mission"; lang: Lang }
  | { lane: "rules"; steps: Step[]; lang: Lang; reflex: boolean }
  | { lane: "server" };

export interface BrowserCtx {
  /** the open Stage's document, if any */
  stage: { recipe: string; blocks: { kind: string; rows?: unknown }[]; scope?: { zone: number | null }; slots?: Record<string, unknown> | null } | null;
  /** what news the screen shows (Thunai.tsx newsOnScreen: Jarvis's news list, else the console's news panel) */
  news: NewsOnScreen;
  /** the console's state (Thunai.tsx buildState) */
  state: ScreenState;
  world: World;
  /** the language the console listens in (its setting) */
  listenLang: Lang;
  /** the language the ears reported for this sentence, if any (Whisper's label) */
  heardLang?: Lang | null;
  /** an incident whose case screen is open (CaseDetail), for "follow this" */
  incident?: string | null;
  /** v7's answers (NEXT_PUBLIC_JARVIS_ANSWER): "tell me about this news" is a read */
  v7?: boolean;
}

/** the language Thunai.tsx v7 gives a sentence before the server: the ears' label, else Tamil letters, else the console's setting */
export const v7Lang = (said: string, c: Pick<BrowserCtx, "heardLang" | "listenLang">): Lang => c.heardLang ?? (/[஀-௿]/.test(said) ? "ta" : c.listenLang);

/** v7's order (Thunai.tsx handle(), 18 Nov, 22304da4), for a sentence with no card or mission waiting */
export function browserLaneV7(said: string, c: BrowserCtx): BrowserLane {
  const lg = v7Lang(said, c);
  const na = intentMarker(said) || missionIntent(said, c.world) ? null : newsAsk(said, c.news, { v7: c.v7 !== false });
  if (na) return { lane: "news", na, lang: lg };
  if (c.stage) {
    const lc = localStageCommand(said);
    if (lc) return { lane: "stage", cmd: lc, lang: /[஀-௿]/.test(said) ? "ta" : c.listenLang };
  }
  const im = intentMarker(said);
  if (im?.intent === "remember" && im.rest) return { lane: "memory", intent: "remember", lang: lg };
  if (im?.intent === "forget") return { lane: "memory", intent: "forget", lang: lg };
  if (im?.intent === "recall") return { lane: "memory", intent: "recall", lang: lg };
  if (asksWhatToday(said)) return { lane: "today", lang: lg };
  const mi = im?.intent === "brief" ? null : missionIntent(said, c.world);
  if ((im?.intent === "brief" && !im.rest) || (mi?.template === "brief" && !mi.place)) return { lane: "brief", lang: lg };
  const onScreen = c.incident ?? null;
  const fa = followAsk(said, { incident: onScreen ?? (c.stage ? null : c.state.incident), zone: c.stage ? c.stage.scope?.zone ?? null : c.state.zone, world: c.world });
  if (fa) return { lane: "follow", lang: lg };
  if (mi || im?.intent === "mission") return { lane: "mission", lang: lg };
  const rules = understand(said, c.state, c.world, { speechConf: 0.95 });
  if (rules.kind === "do" && isReflex(rules.steps, c.state)) return { lane: "rules", steps: rules.steps, lang: rules.lang, reflex: true };
  if (rules.kind === "do" && rules.confidence >= 0.9 && planRiskA(rules.steps) && (isPlainMove(rules.steps) || isNavCommand(said, rules.steps))) return { lane: "rules", steps: rules.steps, lang: rules.lang, reflex: false };
  return { lane: "server" };
}

/** risk A: a move, a view, a read (risk.ts planRisk's level A) */
const planRiskA = (steps: Step[]) => planRisk(steps) === "A";

// ---- v8: the lanes in front of v7's (docs/jarvis/JARVIS_V8.md: the owner's examples 1, 2 and 4)

/** the story found last and the other one offered with it ("say 'the other one'") */
export interface LastFound { id: string; title?: string | null; /** the request that found it (its topic words are searched again for "what else") */ q?: string | null; other: { id: string } | null }
const STORY_NOUN = /\b(?:story|article|piece|news report|news item|headline)\b/i;
/** "what else is in the news about it", "anything more on that", "what are the other papers saying": the story found last, searched again */
// (it must point at the story: "anything else?" or "what else is pending in Teynampet?" is a new request: the review, 18 Nov)
const MORE_ON_IT = /\bwhat else (?:is|are) (?:there )?(?:in the )?(?:news|papers)\b|\b(?:anything|something) (?:else|more) (?:in the news|in the papers|on (?:it|this|that))\b|\bmore (?:on|about) (?:it|this|that|this story|that story)\b|\bother (?:papers|reports|outlets)\b|\bwhat are (?:the )?other (?:papers|outlets|reports)\b|\b(?:idha|adha|indha news|andha news) pathi (?:vera|innum) enna\b|இதைப் பற்றி (?:வேற|இன்னும்) என்ன|மற்ற (?:பத்திரிகை|ஊடக)/iu;
/** the found story's own words for a search again, its negations left out (a title with "never" or "stop" is no "don't") */
const searchWords = (title: string) => title.replace(/\b(?:don'?t|dont|do not|never|no need|stop)\b/gi, " ").replace(/வேண்டாம்|வேணாம்/gu, " ").replace(/\s+/g, " ").trim();
const OTHER_ONE = /^(?:no,? |nope,? )?(?:the )?other (?:one|story|news|report|article)\b|^(?:mattha|matha|matra|innoru) (?:news|onnu|seithi)\b|^மற்றொன்று|^மற்றச் செய்தி|^இன்னொன்று/iu;

/**
 * v8's news lane: a story by its topic, a news question, or "the other one" after a found story. Null: not this lane's. v9: `panel`, the news on
 * screen is the console's own news panel (no Stage open): "the seventh one", "the last one" there are its stories (refs8.ts newsOrdinal8).
 * v9: a story-like topic with no news word ("open the Kodungaiyur empty pot protest") is a soft find (`soft: true`): found only when close,
 * else the lanes behind this one take it; never over a list of cases on screen (`cases`: "open the Adyar fire one" there is a case).
 */
export function newsLane8(said: string, c: { news: NewsOnScreen; world: World; lang: Lang; lastFound?: LastFound | null; panel?: boolean; cases?: boolean }): NewsAskT | null {
  if (!understandV8()) return null;
  const t = said.trim();
  // a mission or a memory request is never the news lane's; "brief me on the Minjur desal plant story" names a story, so it is
  const im = intentMarker(said);
  const briefOnStory = /\bbrief\b/i.test(t) && STORY_NOUN.test(t);
  if ((im && !(im.intent === "brief" && briefOnStory)) || (missionIntent(said, c.world) && !briefOnStory)) return null;
  if (c.lastFound?.other && OTHER_ONE.test(t)) return { kind: "read", body: { id: c.lastFound.other.id } };
  // more on the story found last: the other reports of it, the one already read left out
  // the Collector's own topic words from the turn that found it ("the Pallikaranai marsh"), else the found headline's: other outlets word the same
  // event differently, and a whole headline's words score them under the floor (the live dev re-check, 19 Nov)
  if ((c.lastFound?.title || c.lastFound?.q) && MORE_ON_IT.test(t)) {
    const own = c.lastFound.q ? topicWords(c.lastFound.q, outletIn(c.lastFound.q)).join(" ") : "";
    const about = own || searchWords(c.lastFound.title ?? "");
    if (about) return { kind: "find", body: { find: { q: `news on ${about}`.slice(0, 400), lang: c.lang, screen: [], exclude: [c.lastFound.id] } } };
  }
  const items = (c.news.items ?? []).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id) && !/^web-\d/.test(x.id));
  // a story on the screen by its position, in any of the three languages ("rendavadhu news ah padinga", "open the third news")
  const at = newsOrdinal8(t, items, { panel: c.panel === true });
  if (at) return { kind: "read", body: { id: at } };
  const req = newsRequest(t, { onScreen: items.length > 0 });
  if (!req || (req.soft && c.cases)) return null;
  return { kind: "find", body: { find: { q: t.slice(0, 400), lang: c.lang, screen: items.slice(0, 250).map((x) => ({ id: x.id, title: x.title ? x.title.slice(0, 400) : null, source: x.source ? x.source.slice(0, 300) : null })) } }, ...(req.soft ? { soft: true } : {}) };
}

/** v9: the news on screen is the console's own news panel: no Stage open, or Jarvis's read of one story (`slots.web`) over the open panel
 * ("read the seventh one" after a first read still means the panel: the review, 19 Nov) */
export const onNewsPanel = (stage: BrowserCtx["stage"], state: Pick<ScreenState, "panel">): boolean => !stage || (!!stage.slots?.web && state.panel === "news");

/** v9: the open Stage shows a list of cases (a soft find never runs over one) */
export const casesOnStage = (stage: BrowserCtx["stage"]): boolean => !!stage && stage.blocks.some((b) => b.kind === "CaseList" && Array.isArray(b.rows) && b.rows.length > 0);

/** v8: a case on the open Stage's list the sentence points at (refs8.ts), or null */
export function refLane8(said: string, stage: BrowserCtx["stage"]): { op: "open" | "explain"; n: number } | null {
  if (!understandV8() || !stage) return null;
  const rows = stage.blocks.flatMap((b) => (b.kind === "CaseList" && Array.isArray(b.rows) ? (b.rows as RowRef[]) : []));
  return rows.length ? stageRef8(said, rows) : null;
}

/** v8: the reply's language from the Collector's own words (lang8.ts), else the last language they used, else English */
export const userLang8 = (said: string, last: Lang | null): Lang => replyLang8(said, { isName: placeWord, last });

/** v8's order: the v8 news lane, then v7's lanes, every lane answering in the language of the Collector's own words */
export function browserLaneV8(said: string, c: BrowserCtx & { lastLang?: Lang | null; lastFound?: LastFound | null }): BrowserLane {
  if (!understandV8()) return browserLaneV7(said, c);
  const lang = userLang8(said, c.lastLang ?? null);
  const n8 = newsLane8(said, { news: c.news, world: c.world, lang, lastFound: c.lastFound, panel: onNewsPanel(c.stage, c.state), cases: casesOnStage(c.stage) });
  if (n8 && !(n8.kind === "find" && n8.soft)) return { lane: "news", na: n8, lang };
  const behind = ((): BrowserLane => {
    // a case on the list on screen, by its position or its place ("the Teynampet one", "ரெண்டாவது சம்பவத்தைத் திறங்க")
    const r8 = refLane8(said, c.stage);
    if (r8) return { lane: "stage", cmd: { op: "open", n: r8.n }, lang, explain: r8.op === "explain" };
    const v7 = browserLaneV7(said, { ...c, heardLang: lang, listenLang: lang });
    return v7.lane === "server" ? v7 : { ...v7, lang };
  })();
  // v9: a soft find first; nothing that close in the news, the lane it would have taken (Thunai.tsx goes on the same way)
  return n8 ? { lane: "news", na: n8, lang, soft: behind } : behind;
}
