/**
 * Jarvis's way to a model: a ladder over organisations and models, under the ledger, with a hedge. Server only.
 *   Groq with the most budget -> next Groq -> flash-lite -> Bedrock if its keys work -> null (the caller's rules-only answer).
 * Each hop is logged. The hedge: when the first model has not answered by its observed p95 (never under 1 s), one more model
 * is asked and the loser is aborted; never into gemini-3.8-flash (20 a day), and never with under 40 % of a minute's budget
 * left on the hedge's model. Everything inside the caller's deadline and signal.
 */
import { generateJson, type JsonCall, type JsonResult, type ProviderName } from "@/lib/ai/gateway";
import type { z } from "zod";
import { ledger, type Lane, type Ledger, type Org } from "./ledger";
import { telemetry } from "./telemetry";

export const GROQ_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
export const LITE_MODEL = "gemini-3.5-flash-lite";
/** one call's rough tokens, before it is made */
export const estimate = (system: string, prompt: string, maxOut: number) => Math.ceil((system.length + prompt.length) / 3.5) + Math.round(maxOut * 0.4);

export interface Rung { provider: ProviderName; model: string }

/** The rungs in order: the Groq models with the most budget left first; those out of budget are not rungs at all. */
export function ladder(need: number, l: Ledger = ledger(), bedrock = false): Rung[] {
  const groq = GROQ_MODELS.map((model) => ({ model, r: l.room("groq", model, { tokens: need }) })).filter((x) => x.r.ok)
    // qwen first when it fits one call (its output cap is small but it answers fastest), else by what is left of the minute
    .sort((a, b) => Math.min(b.r.left.tpm, b.r.left.tpd) - Math.min(a.r.left.tpm, a.r.left.tpd))
    .map((x): Rung => ({ provider: "groq", model: x.model }));
  const lite: Rung[] = l.room("gemini", LITE_MODEL, { tokens: need }).ok ? [{ provider: "gemini", model: LITE_MODEL }] : [];
  return [...groq, ...lite, ...(bedrock ? [{ provider: "bedrock" as const, model: "" }] : [])];
}

const samples = new Map<string, number[]>();
/** Observed p95 for a model (at least 1 s; 3.5 s until there are enough answers to say) */
export function hedgeAfter(model: string): number {
  const s = samples.get(model) ?? [];
  if (s.length < 8) return 3500;
  const sorted = [...s].sort((a, b) => a - b);
  return Math.max(1000, sorted[Math.floor(sorted.length * 0.95)]);
}
const observe = (model: string, ms: number) => { const s = samples.get(model) ?? []; s.push(ms); if (s.length > 50) s.shift(); samples.set(model, s); };

export interface LlmCall<T> {
  name: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  lenient?: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxOutputTokens: number;
  user: string;
  lane: Lane;
  /** when the whole turn runs out (ms since the epoch) */
  until: number;
  signal?: AbortSignal;
  hedge?: boolean;
}
export interface LlmResult<T> { object: T; model: string; tokens: number; ms: number; hops: string[]; hedged: boolean }

type Generate = <U>(c: JsonCall<U>) => Promise<JsonResult<U>>;
export interface LlmDeps { generate?: Generate; ledger?: Ledger; now?: () => number; bedrockOk?: () => boolean; gapMs?: number }

const bedrockReady = () => !!(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_ACCESS_KEY_ID) && process.env.JARVIS_BEDROCK === "1";

/** One rung's call. The caller's signal and the turn's deadline both stop it. */
function ask<T>(c: LlmCall<T>, rung: Rung, g: Generate, now: () => number, stop: AbortSignal): Promise<JsonResult<T>> {
  return g<T>({
    role: "fast", name: c.name, schema: c.schema, lenient: c.lenient, system: c.system, prompt: c.prompt, temperature: 0, maxOutputTokens: c.maxOutputTokens, user: c.user,
    lane: c.lane, timeoutMs: Math.max(800, Math.min(6000, c.until - now())), abortSignal: stop,
    only: { provider: rung.provider, models: rung.model ? [rung.model] : [] }
  });
}

/** Up the ladder until one answers. null: nothing could, inside the deadline: the caller answers from the rules. */
export async function callLlm<T>(c: LlmCall<T>, d: LlmDeps = {}): Promise<LlmResult<T> | null> {
  const g = d.generate ?? generateJson;
  const l = d.ledger ?? ledger();
  const now = d.now ?? Date.now;
  const t0 = now();
  const need = estimate(c.system, c.prompt, c.maxOutputTokens);
  const rungs = ladder(need, l, (d.bedrockOk ?? bedrockReady)());
  const hops: string[] = [];
  for (let i = 0; i < rungs.length; i++) {
    if (c.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (now() >= c.until) { hops.push("deadline"); break; }
    const rung = rungs[i];
    const a = new AbortController();
    const stopA = c.signal ? AbortSignal.any([c.signal, a.signal]) : a.signal;
    const main = ask(c, rung, g, now, stopA);
    const label = `${rung.provider}/${rung.model}`;
    // the hedge waits for the model's own p95, and goes only with budget to spare and a rung to go to
    const next = rungs[i + 1];
    const canHedge = c.hedge !== false && !!next && next.model !== "gemini-3.8-flash" && next.provider !== "bedrock"
      && l.room(next.provider as Org, next.model, { tokens: need }).frac >= 0.4;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hedged = false;
    const b = new AbortController();
    const hedge = canHedge
      ? new Promise<JsonResult<T>>((res, rej) => {
        timer = setTimeout(() => {
          hedged = true;
          hops.push(`hedge:${next.provider}/${next.model}`);
          console.info(`[jarvis llm] ${c.name}: hedging ${label} into ${next.provider}/${next.model}`);
          ask(c, next, g, now, c.signal ? AbortSignal.any([c.signal, b.signal]) : b.signal).then(res, rej);
        }, hedgeAfter(rung.model));
      })
      : null;
    try {
      const r = await (hedge ? Promise.any([main, hedge]) : main);
      if (timer) clearTimeout(timer);
      a.abort(); b.abort(); // the loser stops spending
      main.catch(() => undefined); hedge?.catch(() => undefined);
      observe(r.info.model.split("#")[0], r.info.ms);
      const tokens = r.info.inputTokens + r.info.outputTokens;
      hops.push(label);
      telemetry("llm", { model: r.info.model, provider: r.info.provider, ms: r.info.ms, tokens, lane: c.lane, hop: hops.length, ok: true });
      return { object: r.object, model: r.info.model, tokens, ms: now() - t0, hops, hedged };
    } catch (e) {
      if (timer) clearTimeout(timer);
      a.abort(); b.abort();
      main.catch(() => undefined); hedge?.catch(() => undefined);
      if (c.signal?.aborted) throw e;
      hops.push(`${label}:failed`);
      console.warn(`[jarvis llm] ${c.name}: ${label} failed: ${(e as Error).message?.slice(0, 120)}`);
      telemetry("llm", { model: rung.model, provider: rung.provider, ms: now() - t0, lane: c.lane, hop: hops.length, ok: false });
      // a hedge that already ran took the next rung with it
      if (hedged) i++;
    }
  }
  console.warn(`[jarvis llm] ${c.name}: no model answered (${hops.join(" > ") || "no rungs"})`);
  return null;
}
