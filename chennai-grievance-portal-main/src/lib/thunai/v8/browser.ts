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
import { newsRequest } from "./news8";
import { newsOrdinal8, stageRef8, type RowRef } from "./refs8";

export type BrowserLane =
  | { lane: "news"; na: NewsAskT; lang: Lang }
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
  stage: { recipe: string; blocks: { kind: string; rows?: unknown }[]; scope?: { zone: number | null } } | null;
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
export interface LastFound { id: string; title?: string | null; other: { id: string } | null }
const STORY_NOUN = /\b(?:story|article|piece|news report|news item|headline)\b/i;
/** "what else is in the news about it", "anything more on that", "what are the other papers saying": the story found last, searched again */
const MORE_ON_IT = /\b(?:what else|anything else|anything more|more (?:on|about) (?:it|this|that)|other (?:papers|reports|outlets|stories|news)|what are (?:the )?other)\b|\b(?:vera enna|innum enna|vera ethavadhu)\b|வேற என்ன|இன்னும் என்ன|மற்ற (?:பத்திரிகை|செய்தி)/iu;
const OTHER_ONE = /^(?:no,? |nope,? )?(?:the )?other (?:one|story|news|report|article)\b|^(?:mattha|matha|matra|innoru) (?:news|onnu|seithi)\b|^மற்றொன்று|^மற்றச் செய்தி|^இன்னொன்று/iu;

/** v8's news lane: a story by its topic, a news question, or "the other one" after a found story. Null: not this lane's. */
export function newsLane8(said: string, c: { news: NewsOnScreen; world: World; lang: Lang; lastFound?: LastFound | null }): NewsAskT | null {
  if (!understandV8()) return null;
  const t = said.trim();
  // a mission or a memory request is never the news lane's; "brief me on the Minjur desal plant story" names a story, so it is
  const im = intentMarker(said);
  if ((im && !(im.intent === "brief" && STORY_NOUN.test(t))) || missionIntent(said, c.world)) return null;
  if (c.lastFound?.other && OTHER_ONE.test(t)) return { kind: "read", body: { id: c.lastFound.other.id } };
  if (c.lastFound?.title && MORE_ON_IT.test(t)) return { kind: "find", body: { find: { q: `news on ${c.lastFound.title}`.slice(0, 400), lang: c.lang, screen: [] } } };
  const items = (c.news.items ?? []).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x.id) && !/^web-\d/.test(x.id));
  // a story on the screen by its position, in any of the three languages ("rendavadhu news ah padinga", "open the third news")
  const at = newsOrdinal8(t, items);
  if (at) return { kind: "read", body: { id: at } };
  const req = newsRequest(t, { onScreen: items.length > 0 });
  if (!req) return null;
  return { kind: "find", body: { find: { q: t.slice(0, 400), lang: c.lang, screen: items.slice(0, 250).map((x) => ({ id: x.id, title: x.title ? x.title.slice(0, 400) : null, source: x.source ? x.source.slice(0, 300) : null })) } } };
}

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
  const n8 = newsLane8(said, { news: c.news, world: c.world, lang, lastFound: c.lastFound });
  if (n8) return { lane: "news", na: n8, lang };
  // a case on the list on screen, by its position or its place ("the Teynampet one", "ரெண்டாவது சம்பவத்தைத் திறங்க")
  const r8 = refLane8(said, c.stage);
  if (r8) return { lane: "stage", cmd: { op: "open", n: r8.n }, lang, explain: r8.op === "explain" };
  const v7 = browserLaneV7(said, { ...c, heardLang: lang, listenLang: lang });
  return v7.lane === "server" ? v7 : { ...v7, lang };
}
