/**
 * A screen built with the time its request named (QA pass 7, P6-022, pass4-open-16/17). The checker (agent.ts checkScreen) keeps the slots it knows
 * and drops the rest, so the span a rules lane read ("today" since midnight, last month, right now, up or down from last month) would be lost on the
 * way and the screen counted over the nearest console window. The span is checked here (lib/period/read.ts checkSpec) and put back after the checker.
 * Every rules-lane screen goes through here: the quick lane, the resolve lane, and a screen asked for directly (a next step keeps the span it came with).
 */
import { checkScreen, directScreen, scopeAfter, syncSteps, type AgentResult } from "./agent";
import type { Hands } from "./screens";
import { buildScreen } from "./screens";
import type { Recipe } from "./stage";
import type { Lang, ScreenState, World } from "./types";
import { checkSpec, needsDates } from "@/lib/period/read";

export async function spanScreen(recipe: Recipe, rawSlots: unknown, state: ScreenState, w: World, hands: Hands, heard: string, lang: Lang): Promise<AgentResult> {
  const span = checkSpec((rawSlots as Record<string, unknown> | null)?.span);
  if (!span || !needsDates(span) || recipe === "answer") return directScreen(recipe, rawSlots, state, w, hands, heard, lang);
  const t0 = Date.now();
  const sc = checkScreen({ ...(rawSlots as object), recipe }, w, null);
  if (!sc) return directScreen(recipe, rawSlots, state, w, hands, heard, lang);
  const slots = { ...sc.slots, span };
  const stage = (await buildScreen(sc.recipe, slots, scopeAfter(state, []), w, hands, heard)).doc;
  // the console keeps its own window: a span is none of its four, so no period step mirrors it (the filter steps still do)
  const steps = syncSteps(sc.recipe, slots, stage.scope, state).filter((x) => x.a !== "period");
  return { kind: "do", lang, reply: null, steps, stage, stageOp: null, say: stage.say[lang], options: [], rounds: 0, calls: [], model: null, ms: Date.now() - t0, note: null };
}
