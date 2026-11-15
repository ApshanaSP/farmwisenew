/**
 * The per-turn record of every live run (v5 build, 6.2) and the summary every live run prints. Timings, ids, model names and
 * counts only: never a sentence, never a reply.
 *
 *   groqOnly()       the v5 build makes NO live Claude call (owner, 15 Nov 2026): a live run removes the Anthropic key from its
 *                    own process and pins the planner lead to Groq before any call
 *   recordTurn()     listens to the gateway's attempts and the ladder's walks for one scored turn
 *   liveSummary()    the score with its Wilson interval, per answering model, capacity failures as their own column, and the
 *                    clean-turn score beside the score with capacity failures counted as wrong. A run that met ANY 429 is
 *                    labelled a capacity failure, never a plain score
 */
import { onAttempt, type AttemptEvent } from "@/lib/ai/gateway";
import { claudeConfigured } from "@/lib/ai/claude";
import { wilson } from "./evalstats";
import { onLlmCall, type LlmCallEvent } from "./llm";

/** No live Claude call in this build: called at the top of every live runner, before any model is asked. */
export function groqOnly(): void {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.JARVIS_PLANNER_LEAD = "groq";
  if (claudeConfigured()) throw new Error("a live run must not be able to reach Claude");
}

export interface TurnRecord {
  model_used: string | null;
  rate_limited: boolean;
  fell_back: boolean;
  json_validate_failed: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  ms: number;
  ladder_order: string[];
  /** model attempts on this turn (all rungs, all rounds) */
  attempts: number;
}

/** Start recording one turn; stop() returns its record and stops listening. */
export function recordTurn(): { stop: (modelUsed?: string | null) => TurnRecord } {
  const t0 = Date.now();
  const attempts: AttemptEvent[] = [];
  const calls: LlmCallEvent[] = [];
  const s1 = onAttempt((e) => attempts.push(e));
  const s2 = onLlmCall((e) => calls.push(e));
  return {
    stop: (modelUsed) => {
      s1(); s2();
      return turnRecord(attempts, calls, Date.now() - t0, modelUsed);
    }
  };
}

/** The record from what was heard (pure, for tests). */
export function turnRecord(attempts: AttemptEvent[], calls: LlmCallEvent[], ms: number, modelUsed?: string | null): TurnRecord {
  const answered = calls.filter((c) => c.model);
  const model = modelUsed !== undefined ? modelUsed : answered.length ? answered[answered.length - 1].model : null;
  const first = calls[0]?.ladder ?? [];
  const bare = (m: string) => m.split("#")[0];
  return {
    model_used: model,
    rate_limited: attempts.some((a) => a.outcome === "rate_limited"),
    // another rung answered than the first one asked, on any call of the turn
    fell_back: calls.some((c) => c.model != null && c.ladder.length > 0 && !c.ladder[0].endsWith(`/${bare(c.model)}`)),
    json_validate_failed: attempts.some((a) => a.outcome === "json_validate_failed" || a.outcome === "draft_used"),
    prompt_tokens: attempts.reduce((s, a) => s + (a.inputTokens ?? 0), 0),
    completion_tokens: attempts.reduce((s, a) => s + (a.outputTokens ?? 0), 0),
    cached_tokens: attempts.reduce((s, a) => s + (a.cachedTokens ?? 0), 0),
    ms,
    ladder_order: first,
    attempts: attempts.length
  };
}

export interface LiveRow { ok: boolean; capacity?: boolean; lang?: string; rec?: TurnRecord | null }

const pct = (k: number, n: number) => { const w = wilson(k, n); return { k, n, p: Math.round(w.p * 10) / 10, lo: Math.round(w.lo * 10) / 10, hi: Math.round(w.hi * 10) / 10 }; };

/** What every live run prints and keeps. */
export function liveSummary(rows: LiveRow[]) {
  const n = rows.length;
  const capacity = rows.filter((r) => r.capacity || r.rec?.rate_limited).length;
  const any429 = rows.some((r) => r.rec?.rate_limited);
  const clean = rows.filter((r) => !(r.capacity || r.rec?.rate_limited));
  const byModel: Record<string, { k: number; n: number }> = {};
  for (const r of rows) {
    const m = r.rec?.model_used ?? "none";
    byModel[m] = byModel[m] ?? { k: 0, n: 0 };
    byModel[m].n++;
    if (r.ok) byModel[m].k++;
  }
  const sum = (k: "prompt_tokens" | "completion_tokens" | "cached_tokens") => rows.reduce((s, r) => s + (r.rec?.[k] ?? 0), 0);
  return {
    label: any429 ? "CAPACITY FAILURE (a 429 was met: not a plain score)" : capacity ? "capacity failures present" : "clean",
    allTurns: pct(rows.filter((r) => r.ok && !(r.capacity || r.rec?.rate_limited)).length, n),
    cleanTurns: pct(clean.filter((r) => r.ok).length, clean.length),
    capacityFailures: capacity,
    rateLimited: rows.filter((r) => r.rec?.rate_limited).length,
    jsonValidateFailed: rows.filter((r) => r.rec?.json_validate_failed).length,
    fellBack: rows.filter((r) => r.rec?.fell_back).length,
    byModel: Object.fromEntries(Object.entries(byModel).map(([m, x]) => [m, pct(x.k, x.n)])),
    tokens: { prompt: sum("prompt_tokens"), completion: sum("completion_tokens"), cached: sum("cached_tokens") },
    ladderOrders: [...new Set(rows.map((r) => (r.rec?.ladder_order ?? []).join(" > ")).filter(Boolean))]
  };
}
