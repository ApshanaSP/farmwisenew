/**
 * What Jarvis says once a plan's steps have run (components/collector/app/thunai/Thunai.tsx run()). QA pass 7, P6-022's journey (P6-024):
 * "How many cases are overdue?" with no model went to the rules' "ask" step, which hands the question to Ask District IQ; its answer is said by
 * askAnalyst itself (out(), the card in the thread), and the step returns no line. run() then took "no line" for "nothing was said" and put the
 * steps' description over the answer: the HUD and the reply read "Asked District IQ" and nothing else.
 *
 * The rule, in one place: the lines the steps returned are said (the note first); a step that answers for itself (ask: the analyst says its answer,
 * or that it could not) has already been said, so nothing is put over it; only a plan of moves with nothing to say is described ("Severe · Last 7 days").
 * (The map step only hands the question to the map, which shows its answer there: "Asked the map" on the HUD covers nothing.)
 */
import type { Step } from "./types";

/** steps whose answer is said by the step itself, after its own wait (askAnalyst: the card in the thread and out()) */
const ANSWERS_ITSELF = new Set<Step["a"]>(["ask"]);

export type AfterPlan = { kind: "say"; text: string } | { kind: "describe"; text: string } | { kind: "answered" };

export function afterPlan(steps: Step[], said: string[], note: string | undefined, describe: (s: Step) => string): AfterPlan {
  const line = [note, ...said].filter(Boolean).join(" ");
  if (line) return { kind: "say", text: line };
  if (steps.some((s) => ANSWERS_ITSELF.has(s.a))) return { kind: "answered" };
  return { kind: "describe", text: steps.map(describe).join(" · ") };
}
