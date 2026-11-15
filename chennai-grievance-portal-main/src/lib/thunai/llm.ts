/**
 * Jarvis's way to a model: a ladder over organisations and models, under the ledger, with a hedge. Server only.
 *   Claude if ANTHROPIC_API_KEY is set -> Groq with the most budget -> next Groq -> flash-lite -> Bedrock if its keys work -> null
 *   (the caller's rules-only answer). With no Claude key (or a refused one) the ladder is what it always was.
 * Each hop is logged. The hedge: when the first model has not answered by its own observed p95, one more model is asked and the
 * loser is aborted. A rung with fewer than 8 times of its own waits its provider's default instead (Claude 6 s: it thinks before
 * it answers, p50 about 3.9 s; others 3.5 s). The hedge goes only into Groq, and never with under 40 % of a minute's budget left
 * on that model. The loser's time is kept too, as aborted at the moment it was stopped (a lower bound, apart from completed
 * answers), so a model that often loses is not read as fast. Everything inside the caller's deadline and signal. A call the turn
 * cancels (and a hedge still running then) is recorded in the ledger at its estimated input tokens, as a lost hedge is.
 */
import { billedOf, claudeConfigured, claudeModel } from "@/lib/ai/claude";
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
export function ladder(need: number, l: Ledger = ledger(), bedrock = false, claude = false): Rung[] {
  // qwen first while the minute has room for this call and a margin (fastest, and on the held-out rows the most often right), else by what is left of the minute
  const roomy = (x: { model: string; r: { left: { tpm: number } } }) => x.model === GROQ_MODELS[0] && x.r.left.tpm >= need * 1.5;
  const groq = GROQ_MODELS.map((model) => ({ model, r: l.room("groq", model, { tokens: need }) })).filter((x) => x.r.ok)
    .sort((a, b) => Number(roomy(b)) - Number(roomy(a)) || Math.min(b.r.left.tpm, b.r.left.tpd) - Math.min(a.r.left.tpm, a.r.left.tpd))
    .map((x): Rung => ({ provider: "groq", model: x.model }));
  const lite: Rung[] = l.room("gemini", LITE_MODEL, { tokens: need }).ok ? [{ provider: "gemini", model: LITE_MODEL }] : [];
  const first: Rung[] = claude && l.room("anthropic", claudeModel(), { tokens: need }).ok ? [{ provider: "anthropic", model: claudeModel() }] : [];
  return [...first, ...groq, ...lite, ...(bedrock ? [{ provider: "bedrock" as const, model: "" }] : [])];
}

// ---- each rung's own record of how long it takes

/** Times a rung needs of its own before its p95 sets its hedge */
export const OWN_SAMPLES = 8;
/** The hedge's wait for a rung without 8 times of its own: Claude thinks before it answers, so it gets at least 6 s */
const HEDGE_DEFAULT: Partial<Record<ProviderName, number>> = { anthropic: 6000 };
const HEDGE_DEFAULT_OTHER = 3500;
/** The hedge never fires later than this before the turn's deadline, so the rung it goes to has time to answer */
const RESCUE_MS = 1500;
const KEEP = 50;

interface Book { done: number[]; aborted: number[] }
const books = new Map<string, Book>();
const keyOf = (provider: string, model: string) => `${provider}/${model.split("#")[0]}`;
const bookOf = (provider: string, model: string): Book => {
  const k = keyOf(provider, model);
  let b = books.get(k);
  if (!b) { b = { done: [], aborted: [] }; books.set(k, b); }
  return b;
};
const push = (a: number[], ms: number) => { a.push(Math.max(0, Math.round(ms))); if (a.length > KEEP) a.shift(); };

/** A completed answer's time */
export function observeDone(provider: string, model: string, ms: number) { push(bookOf(provider, model).done, ms); }
/** A call Jarvis stopped (a hedge's loser, or the deadline) after `ms`: its real time is at least that */
export function observeAborted(provider: string, model: string, ms: number) { push(bookOf(provider, model).aborted, ms); }
/** Forget every record (tests only) */
export function resetLatency() { books.clear(); }

/**
 * A rung's times: completed and aborted kept apart. p50 and p95 are read over both, an aborted time standing in as a lower bound
 * (its real time was at least that); `censored` says the p95 is such a lower bound.
 */
export function latencyStats(provider: string, model: string) {
  const b = books.get(keyOf(provider, model)) ?? { done: [], aborted: [] };
  const all = [...b.done.map((ms) => ({ ms, cut: false })), ...b.aborted.map((ms) => ({ ms, cut: true }))].sort((x, y) => x.ms - y.ms || Number(x.cut) - Number(y.cut));
  const at = (q: number) => all[Math.min(all.length - 1, Math.floor(all.length * q))];
  return { done: [...b.done], aborted: [...b.aborted], n: all.length, p50: all.length ? at(0.5).ms : null, p95: all.length ? at(0.95).ms : null, censored: all.length ? at(0.95).cut : false };
}

/** How long the hedge waits on this rung: its own p95 (at least 1 s) once it has 8 times of its own, else its provider's default */
export function hedgeAfter(provider: string, model: string): number {
  const s = latencyStats(provider, model);
  if (s.n < OWN_SAMPLES || s.p95 == null) return HEDGE_DEFAULT[provider as ProviderName] ?? HEDGE_DEFAULT_OTHER;
  return Math.max(1000, s.p95);
}

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
export interface LlmDeps { generate?: Generate; ledger?: Ledger; now?: () => number; bedrockOk?: () => boolean; claudeOk?: () => boolean; gapMs?: number }

const bedrockReady = () => !!(process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_ACCESS_KEY_ID) && process.env.JARVIS_BEDROCK === "1";

/**
 * One rung's call. The caller's signal and the turn's deadline both stop it. A Groq or Gemini call gets at most 6 s; Claude, which
 * thinks first, runs to the deadline while a hedge can still rescue the turn, and otherwise leaves the next rung its 1.5 s.
 */
function ask<T>(c: LlmCall<T>, rung: Rung, g: Generate, now: () => number, stop: AbortSignal, raceable: boolean): Promise<JsonResult<T>> {
  const left = c.until - now();
  const cap = rung.provider === "anthropic" ? (raceable ? left : Math.max(6000, left - RESCUE_MS)) : 6000;
  return g<T>({
    role: "fast", name: c.name, schema: c.schema, lenient: c.lenient, system: c.system, prompt: c.prompt, temperature: 0, maxOutputTokens: c.maxOutputTokens, user: c.user,
    lane: c.lane, timeoutMs: Math.max(800, Math.min(cap, left)), abortSignal: AbortSignal.any([stop, AbortSignal.timeout(Math.max(1, left))]),
    only: { provider: rung.provider, models: rung.model ? [rung.model] : [] }
  });
}

type Who = "main" | "hedge";

/** Up the ladder until one answers. null: nothing could, inside the deadline: the caller answers from the rules. */
export async function callLlm<T>(c: LlmCall<T>, d: LlmDeps = {}): Promise<LlmResult<T> | null> {
  const g = d.generate ?? generateJson;
  const l = d.ledger ?? ledger();
  const now = d.now ?? Date.now;
  const t0 = now();
  const need = estimate(c.system, c.prompt, c.maxOutputTokens);
  const inputGuess = Math.ceil((c.system.length + c.prompt.length) / 3.5);
  // a test's own model stands alone: a key in the developer's .env does not change what it asks
  const rungs = ladder(need, l, (d.bedrockOk ?? bedrockReady)(), (d.claudeOk ?? (d.generate ? () => false : claudeConfigured))());
  const hops: string[] = [];
  /** a call Jarvis stopped: its time is a lower bound, and the request still counts against the model's allowance */
  const stopped = (rung: Rung, ms: number, why: string) => {
    observeAborted(rung.provider, rung.model, ms);
    if (rung.provider !== "bedrock") l.record(rung.provider as Org, rung.model, { tokens: inputGuess, lane: c.lane });
    telemetry("llm", { model: rung.model, provider: rung.provider, ms, lane: c.lane, hop: hops.length, ok: false, aborted: true, why });
  };
  for (let i = 0; i < rungs.length; i++) {
    if (c.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (now() >= c.until) { hops.push("deadline"); break; }
    const rung = rungs[i];
    const label = `${rung.provider}/${rung.model}`;
    // the hedge goes only into Groq, only with budget to spare on that model, and only with time for it to answer
    const next = rungs[i + 1];
    const left = c.until - now();
    const canHedge = c.hedge !== false && !!next && next.provider === "groq" && left > RESCUE_MS / 2
      && l.room(next.provider as Org, next.model, { tokens: need }).frac >= 0.4;
    const own = hedgeAfter(rung.provider, rung.model);
    const wait = canHedge ? Math.max(0, Math.min(own, left - RESCUE_MS)) : 0;
    const why = wait < own ? "rescue" : latencyStats(rung.provider, rung.model).n >= OWN_SAMPLES ? "p95" : "default";
    const a = new AbortController();
    const stopA = c.signal ? AbortSignal.any([c.signal, a.signal]) : a.signal;
    const tMain = now();
    let mainSettled = false, hedgeSettled = false, tHedge = 0;
    const main = ask(c, rung, g, now, stopA, canHedge).finally(() => { mainSettled = true; });
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hedged = false;
    // which calls were still running when the turn was cancelled: each is recorded at its estimate (review, Planner 4)
    const cancelled = { main: false, hedge: false };
    const onCancel = () => { cancelled.main = !mainSettled; cancelled.hedge = hedged && !hedgeSettled; };
    c.signal?.addEventListener("abort", onCancel, { once: true });
    const b = new AbortController();
    const hedge = canHedge
      ? new Promise<JsonResult<T>>((res, rej) => {
        timer = setTimeout(() => {
          hedged = true;
          tHedge = now();
          hops.push(`hedge:${next.provider}/${next.model}`);
          console.info(`[jarvis llm] ${c.name}: hedging ${label} into ${next.provider}/${next.model} after ${wait} ms (${why})`);
          ask(c, next, g, now, c.signal ? AbortSignal.any([c.signal, b.signal]) : b.signal, false).finally(() => { hedgeSettled = true; }).then(res, rej);
        }, wait);
        // a main that fails before the timer goes to the next rung now: the timer is only for a main that is slow
        main.catch((e) => { if (!hedged) { if (timer) clearTimeout(timer); rej(e); } });
      })
      : null;
    const tagged = (p: Promise<JsonResult<T>>, who: Who) => p.then((r) => ({ r, who }));
    try {
      const { r, who } = await (hedge ? Promise.any([tagged(main, "main"), tagged(hedge, "hedge")]) : tagged(main, "main"));
      if (timer) clearTimeout(timer);
      // the loser stops spending, and its time so far is kept as a lower bound
      const loserRunning = hedged && (who === "main" ? !hedgeSettled : !mainSettled);
      a.abort(); b.abort();
      main.catch(() => undefined); hedge?.catch(() => undefined);
      const winner = who === "main" ? rung : next;
      observeDone(winner.provider, r.info.model, r.info.ms);
      if (loserRunning) stopped(who === "main" ? next : rung, now() - (who === "main" ? tHedge : tMain), "hedge-lost");
      const tokens = r.info.inputTokens + r.info.outputTokens;
      hops.push(who === "main" ? label : `${next.provider}/${next.model}`);
      if (hedged) telemetry("hedge", { provider: rung.provider, model: rung.model, into: `${next.provider}/${next.model}`, after: wait, why, winner: who, lane: c.lane });
      telemetry("llm", { model: r.info.model, provider: r.info.provider, ms: r.info.ms, tokens, lane: c.lane, hop: hops.length, ok: true, hedged, winner: hedged ? who : undefined,
        path: r.info.path, cacheRead: r.info.cacheReadTokens, cacheWrite: r.info.cacheWriteTokens });
      return { object: r.object, model: r.info.model, tokens, ms: now() - t0, hops, hedged };
    } catch (x) {
      // Promise.any wraps its losers; the first is main's own reason
      const e = x instanceof AggregateError ? x.errors[0] : x;
      if (timer) clearTimeout(timer);
      const cut = now() >= c.until;
      a.abort(); b.abort();
      main.catch(() => undefined); hedge?.catch(() => undefined);
      if (c.signal?.aborted) {
        // cancelled by the turn: each call still running then was asked and still counts against its model's allowance, at its estimate
        // (a Claude reply that was billed before the cancel was recorded with its own usage by the gateway: not counted twice)
        const whose = x instanceof AggregateError ? x.errors : [x];
        if (cancelled.main && !billedOf(whose[0])) stopped(rung, now() - tMain, "cancelled");
        if (cancelled.hedge && !billedOf(whose[1])) stopped(next, now() - tHedge, "cancelled");
        throw e;
      }
      hops.push(`${label}:failed`);
      console.warn(`[jarvis llm] ${c.name}: ${label} failed: ${(e as Error).message?.slice(0, 120)}`);
      // stopped by the turn's deadline: a lower bound on its time, not a failure of the model
      if (cut) { stopped(rung, now() - tMain, "deadline"); if (hedged) stopped(next, now() - tHedge, "deadline"); }
      else telemetry("llm", { model: rung.model, provider: rung.provider, ms: now() - t0, lane: c.lane, hop: hops.length, ok: false });
      if (hedged) telemetry("hedge", { provider: rung.provider, model: rung.model, into: `${next.provider}/${next.model}`, after: wait, why, winner: "none", lane: c.lane });
      // a hedge that already ran took the next rung with it
      if (hedged) i++;
    } finally {
      c.signal?.removeEventListener("abort", onCancel);
    }
  }
  console.warn(`[jarvis llm] ${c.name}: no model answered (${hops.join(" > ") || "no rungs"})`);
  return null;
}
