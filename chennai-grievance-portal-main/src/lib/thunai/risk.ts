/**
 * Every action's risk level. A: Thunai does it at once and offers undo (reading, moving around, filters, panels, drafts that
 * stay in the console). B: one tap or "yes" (it changes something saved). C: anything that can reach a person outside the
 * console; it needs "confirm" plus the count of what is in the tray.
 */
import type { ActionName, Step } from "./types";

export type Risk = "A" | "B" | "C";

const RISK: Record<ActionName, Risk> = {
  page: "A", period: "A", view: "A", mapMode: "A", layer: "A", panel: "A", close: "A", item: "A", draft: "A", zoom: "A",
  ask: "A", map: "A", theme: "A", lang: "A", mode: "A", speed: "A", handsfree: "A", undo: "A", stop: "A", off: "A",
  repeat: "A", whatDid: "A", whereAmI: "A", explain: "A", numbers: "A", click: "A", scroll: "A", type: "A", clearText: "A",
  recall: "A", read: "A", help: "A", mission: "A",
  workspace: "B", remember: "B", forget: "B", remind: "B",
  send: "C", confirm: "C"
};

export function riskOf(step: Step): Risk {
  // opening a saved workspace only changes the view
  if (step.a === "workspace" && step.op === "open") return "A";
  return RISK[step.a];
}

/** The highest risk of a plan. */
export function planRisk(steps: Step[]): Risk {
  return steps.reduce<Risk>((r, s) => (riskOf(s) > r ? riskOf(s) : r), "A");
}

/**
 * Level C gate: "confirm N" sends only when N equals the number of cards waiting, the cards have been on screen for
 * at least 2 seconds, and nothing has been added since they were shown.
 */
export function confirmGate(n: number | null, waiting: number, shownAt: number | null, now: number): { ok: boolean; why: string | null } {
  if (!waiting) return { ok: false, why: "nothing" };
  if (n == null) return { ok: false, why: "count" };
  if (n !== waiting) return { ok: false, why: "mismatch" };
  if (shownAt == null || now - shownAt < 2000) return { ok: false, why: "early" };
  return { ok: true, why: null };
}
