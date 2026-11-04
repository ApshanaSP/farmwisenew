/**
 * What the code alone makes of a sentence: the privacy and never-send refusals, the frame, the lanes, the fast lane, the rules.
 * Returns an intent, or null when it is left to the planner. Used to score the held-out set "via rules and router", and by
 * anything that needs the answer without spending a model call. Pure.
 */
import { resolveFrame } from "./frame";
import { isPlainMove } from "./plan";
import { quickScreen } from "./quick";
import { routeByRules } from "./router";
import type { StageContext } from "./stage";
import type { ScreenState, World } from "./types";
import { understand } from "./understand";

export interface RuleRead { intent: string | null; lane: string; bundle: string | null }

const SAVE_WORDS = /\b(save|pin|remember|note that|bookmark|keep this)\b|சேமி|நினைவில்|பின் செய்|save pannu|note pannu|nyabagam/i;

export function ruleIntent(text: string, world: World, state: ScreenState, ctx: { stage?: StageContext | null; after?: string | null } = {}): RuleRead {
  const stage = ctx.stage ?? null;
  const route = routeByRules(text, world, !!stage || !!ctx.after);
  if (route.lane === "refuse") return { intent: "refuse", lane: "refuse", bundle: null };
  const frame = resolveFrame({ text, stage, turns: [], lastPlace: null, lastText: ctx.after ?? null, world });
  if (frame.kind === "screen") return { intent: frame.recipe, lane: "frame", bundle: null };
  if (frame.kind === "stageOp") return { intent: "stage_op", lane: "frame", bundle: null };
  if (route.lane === "general") return { intent: "general", lane: "general", bundle: null };
  const q = quickScreen(text, world);
  if (q) return { intent: q.recipe, lane: "quick", bundle: null };
  const r = understand(text, state, world, { speechConf: 0.95 });
  if (r.kind === "refuse") return { intent: "refuse", lane: "rules", bundle: null };
  if (r.kind === "do" && r.steps.some((s) => s.a === "workspace" || s.a === "remember" || s.a === "remind")) return { intent: "save", lane: "rules", bundle: null };
  if (r.kind === "do" && r.confidence >= 0.85 && isPlainMove(r.steps)) return { intent: "navigate", lane: "rules", bundle: null };
  if (SAVE_WORDS.test(text) && (route.bundle === "memory")) return { intent: null, lane: "planner", bundle: "memory" };
  return { intent: null, lane: route.lane === null ? "router" : "planner", bundle: route.bundle };
}

/** Which intents a planner bundle can serve: a sentence left to the planner with the right bundle is correctly routed. */
export const BUNDLE_SERVES: Record<string, string[]> = {
  screens: ["cases", "case", "news", "readings", "ranking", "compare", "trend", "why", "performance", "dashboard", "map", "nearby", "brief", "prices", "insight", "complete", "advise", "answer"],
  console: ["navigate"], stage: ["stage_op", "case", "cases", "compare", "trend", "why", "ranking", "dashboard", "map", "news", "performance", "save"],
  // the data bundle's first call carries the screens too; the wide bundle holds the screens, the console steps and the keeping steps
  data: ["cases", "case", "news", "readings", "ranking", "compare", "trend", "why", "performance", "dashboard", "map", "nearby", "brief", "prices", "insight", "complete", "advise", "answer"], memory: ["save"],
  wide: ["cases", "case", "news", "readings", "ranking", "compare", "trend", "why", "performance", "dashboard", "map", "nearby", "brief", "prices", "insight", "complete", "advise", "answer", "navigate", "save"]
};
