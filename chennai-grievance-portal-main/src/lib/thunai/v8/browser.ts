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

export type BrowserLane =
  | { lane: "news"; na: NewsAskT; lang: Lang }
  | { lane: "stage"; cmd: LocalCmd; lang: Lang }
  | { lane: "memory"; intent: "remember" | "forget" | "recall"; lang: Lang }
  | { lane: "today"; lang: Lang }
  | { lane: "brief"; lang: Lang }
  | { lane: "follow"; lang: Lang }
  | { lane: "mission"; lang: Lang }
  | { lane: "rules"; steps: Step[]; lang: Lang; reflex: boolean }
  | { lane: "server" };

export interface BrowserCtx {
  /** the open Stage's document, if any */
  stage: { recipe: string; blocks: { kind: string }[]; scope?: { zone: number | null } } | null;
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
