/**
 * v6: the room a live holdout run (holdout.live.ts: planner2, planner3) counts on before it starts: Claude's day (tokens, and requests at
 * about `perRequest` tokens each) when Haiku leads the planner (llm.ts ladder: a working key, the spend ceiling not reached, no
 * JARVIS_PLANNER_LEAD=groq), else what the three Groq planners have left of theirs. Counts only.
 */
import type { Ledger } from "./ledger";

export const GROQ_PLANNERS = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];

export function runRoom(l: Ledger, claude: { leads: boolean; model: string }, perRequest = 3000): { who: "anthropic" | "groq"; left: number } {
  if (claude.leads) {
    const r = l.room("anthropic", claude.model);
    return { who: "anthropic", left: Math.max(0, Math.min(r.left.tpd, r.left.rpd * perRequest)) };
  }
  return { who: "groq", left: GROQ_PLANNERS.reduce((a, m) => a + Math.max(0, l.room("groq", m).left.tpd), 0) };
}

/**
 * Before an item: wait (on the ledger's own clock, polling every `stepMs`) until the lead's minute window has room for `need` tokens:
 * Claude's model, or any one of the Groq planners. Returns the ms waited (0: room at once), or -1 after `maxMs` with no room (the item
 * then runs and is scored as it comes out: a turn no model answered is a capacity row). The first Claude-led live30 (17 Nov) ran its
 * items back to back with the window full and lost 21 of 30 turns to it.
 */
export async function waitForRoom(l: Ledger, lead: { who: "anthropic" | "groq"; model: string }, need: number,
  o: { sleep?: (ms: number) => Promise<void>; stepMs?: number; maxMs?: number } = {}): Promise<number> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const step = o.stepMs ?? 2000, max = o.maxMs ?? 120_000;
  const ok = () => (lead.who === "anthropic" ? l.room("anthropic", lead.model, { tokens: need }).ok : GROQ_PLANNERS.some((m) => l.room("groq", m, { tokens: need }).ok));
  let waited = 0;
  while (!ok()) {
    if (waited >= max) return -1;
    await sleep(step);
    waited += step;
  }
  return waited;
}
