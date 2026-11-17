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
