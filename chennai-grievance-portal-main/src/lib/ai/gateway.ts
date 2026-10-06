/**
 * The one door to the language models for Ask District IQ. Google Gemini is the default
 * provider; Amazon Bedrock (Amazon Nova Lite, bedrock.ts), Groq and OpenAI remain optional
 * (AI_PROVIDER / AI_FALLBACK_PROVIDER). Every call asks for JSON that must match a zod
 * schema (a tool call on Bedrock; generateText with Output.object elsewhere);
 * a busy provider (429, 5xx) is retried with backoff and jitter; a model rate-limited for
 * longer (a daily cap) hands over to the provider's other model; then the next provider is
 * tried, then the caller gets AiBusyError with the seconds to wait.
 *
 * Keys are read here, on the server, and nowhere else. Calls are logged with provider,
 * model, tokens and latency, never with the prompt (it can carry untrusted text), and each
 * user has a daily token budget.
 */
import { APICallError, Output, generateText, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";
import { BedrockBusyError, bedrockConfigured, bedrockJson, bedrockModel, bedrockProblem } from "@/lib/ai/bedrock";

export type Role = "fast" | "reasoning";
export type ProviderName = "gemini" | "bedrock" | "groq" | "openai";

export class AiUnavailableError extends Error {
  constructor() {
    super("No AI provider is configured: add GEMINI_API_KEY (or the AWS keys for Amazon Bedrock) to the portal's .env.");
  }
}
export class AiBusyError extends Error {
  constructor(public retryAfter: number) {
    super(`The AI service is busy. Try again in ${retryAfter} s.`);
  }
}
export class AiBudgetError extends Error {
  constructor() {
    super("Today's AI budget for this account is used up. It resets at midnight.");
  }
}

interface Provider {
  name: ProviderName;
  model: (role: Role) => { id: string; lm: LanguageModel | null };
  /**
   * Every model the provider may use for the role, in preference order. Each free model has its own per-minute allowance,
   * so a pool of them carries several times the load of one; the least-used model with allowance left goes first.
   */
  pool?: (role: Role) => { id: string; lm: LanguageModel }[];
  /** the free tier's per-minute limits for one model of this provider */
  limits?: { tpm: number; rpm: number };
  options: (role: Role, id?: string) => Record<string, Record<string, string | boolean | Record<string, string>>>;
  /** providers called through their own SDK rather than the AI SDK (Bedrock's Converse API) */
  json?: <T>(c: JsonCall<T>) => Promise<JsonResult<T>>;
}

const env = (k: string) => (process.env[k] ?? "").trim();

/** A comma-separated model list from the environment, else the defaults. */
const listEnv = (k: string, dflt: string[]) => (env(k) ? env(k).split(",").map((x) => x.trim()).filter(Boolean) : dflt);

/**
 * Google Gemini. Flash-Lite routes (about 2 s); 3.6 Flash writes (about 5 s, keeps to the facts better than Flash-Lite,
 * whose answers failed the number check more often). The other free models back them up; each has its own daily quota.
 * Thinking is kept low for speed.
 */
function gemini(): Provider | null {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return null;
  const p = createGoogleGenerativeAI({ apiKey });
  const ids = {
    fast: listEnv("AI_GEMINI_MODEL_FAST", ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash"]),
    reasoning: listEnv("AI_GEMINI_MODEL", ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"])
  };
  return {
    name: "gemini",
    model: (role) => ({ id: ids[role][0], lm: p(ids[role][0]) }),
    pool: (role) => ids[role].map((id) => ({ id, lm: p(id) })),
    limits: { tpm: 250_000, rpm: 10 },
    options: () => ({ google: { structuredOutputs: true, thinkingConfig: { thinkingLevel: env("AI_REASONING_EFFORT") || "low" } } })
  };
}

/** Amazon Bedrock (Converse API). */
function bedrock(): Provider | null {
  if (!bedrockConfigured()) return null;
  return {
    name: "bedrock",
    model: (role) => ({ id: bedrockModel(role), lm: null }),
    options: () => ({}),
    json: async <T>(c: JsonCall<T>): Promise<JsonResult<T>> => {
      const r = await bedrockJson({ name: c.name, role: c.role, schema: c.schema, lenient: c.lenient, system: c.system, prompt: c.prompt,
        maxOutputTokens: c.maxOutputTokens, abortSignal: c.abortSignal });
      const info: CallInfo = { step: c.name, provider: "bedrock", model: r.model, ms: r.ms, inputTokens: r.inputTokens, outputTokens: r.outputTokens, attempts: 1 };
      charge(c.user, info.inputTokens - r.cacheReadTokens + info.outputTokens);
      console.info(`[assistant] ${c.name} bedrock/${r.model} ${r.ms} ms, ${r.inputTokens}+${r.outputTokens} tokens (${r.cacheReadTokens} from cache)`);
      return { object: r.object, info };
    }
  };
}

function groq(): Provider | null {
  const apiKey = env("GROQ_API_KEY");
  if (!apiKey) return null;
  const p = createGroq({ apiKey });
  // three free models, 8,000 tokens a minute each (about 1 s a call when not rate-limited); qwen also writes strict JSON
  const ids = {
    fast: listEnv("AI_MODEL_FAST", ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]),
    reasoning: listEnv("AI_MODEL_REASONING", ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"])
  };
  return {
    name: "groq",
    model: (role) => ({ id: ids[role][0], lm: p(ids[role][0]) }),
    pool: (role) => ids[role].map((id) => ({ id, lm: p(id) })),
    limits: { tpm: 8_000, rpm: 30 },
    // gpt-oss thinks before it answers: keep that short (speed, and the free tier's tokens per minute); qwen takes no effort setting
    options: (_role, id) => ({ groq: { structuredOutputs: true, strictJsonSchema: true, reasoningFormat: "hidden",
      ...(id && !id.startsWith("openai/") ? {} : { reasoningEffort: env("AI_REASONING_EFFORT") || "low" }) } })
  };
}

function openai(): Provider | null {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) return null;
  const p = createOpenAI({ apiKey });
  const ids = { fast: env("AI_FALLBACK_MODEL_FAST") || "gpt-4.1-mini", reasoning: env("AI_FALLBACK_MODEL_REASONING") || "gpt-4.1-mini" };
  return {
    name: "openai",
    model: (role) => ({ id: ids[role], lm: p(ids[role]) }),
    // store: false, so prompts are not kept on OpenAI's side
    options: () => ({ openai: { strictJsonSchema: true, store: false } })
  };
}

/**
 * Providers in the order they are tried: AI_PROVIDER (default gemini), then AI_FALLBACK_PROVIDER (default none); only those
 * configured. `prefer` goes first when it is configured (the source onboarding agent asks for Gemini).
 */
function providers(prefer?: ProviderName): Provider[] {
  const make: Record<string, () => Provider | null> = { gemini, bedrock, groq, openai };
  const order = [...(prefer ? [prefer] : []), env("AI_PROVIDER") || "gemini", env("AI_FALLBACK_PROVIDER") || "none"];
  const out: Provider[] = [];
  for (const name of order) {
    const p = make[name]?.();
    if (p && !out.some((x) => x.name === p.name)) out.push(p);
  }
  return out;
}

/** What the assistant can use right now (for the dialog's status line and the sources panel). */
export function aiStatus() {
  const list = providers();
  return {
    available: list.length > 0,
    /** why the model is not being used ("AWS keys expired"), when that is known */
    problem: bedrockProblem(),
    providers: list.map((p) => ({ name: p.name, fast: p.model("fast").id, reasoning: p.model("reasoning").id })),
    stt: env("AI_MODEL_STT") || "whisper-large-v3-turbo"
  };
}

// ------------------------------------------------------------ token budget --

const DAILY_TOKENS = Number(env("ASSISTANT_DAILY_TOKENS")) || 600_000;
const spent = new Map<string, { day: string; tokens: number }>();
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

function budgetLeft(user: string): boolean {
  const s = spent.get(user);
  return !s || s.day !== today() || s.tokens < DAILY_TOKENS;
}
function charge(user: string, tokens: number) {
  const d = today();
  const s = spent.get(user);
  spent.set(user, { day: d, tokens: (s && s.day === d ? s.tokens : 0) + tokens });
}

// ------------------------------------------------------------------- calls --

export interface JsonCall<T> {
  role: Role;
  /** short name of the step, for logs ("router", "planner", "composer") */
  name: string;
  /** sent to the provider as a strict JSON schema */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** checks a draft the provider rejected (optional fields tolerant); never sent */
  lenient?: z.ZodType<T, z.ZodTypeDef, unknown>;
  system: string;
  prompt: string;
  temperature: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /** who is asking, for the daily budget */
  user: string;
  /** a provider to try first, when it is configured */
  prefer?: ProviderName;
}

export interface CallInfo { step: string; provider: ProviderName; model: string; ms: number; inputTokens: number; outputTokens: number; attempts: number }
export interface JsonResult<T> { object: T; info: CallInfo }

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason ?? new Error("aborted")); }, { once: true });
  });

/**
 * Groq checks structured output against the schema after generation; a miss comes back as HTTP
 * 400 "json_validate_failed" with the draft in failed_generation. The draft often matches our
 * own (more tolerant) zod schema, so it is worth checking before asking again.
 */
function failedDraft(e: APICallError): unknown | null {
  if (e.statusCode !== 400 || !/json_validate_failed|does not match the expected schema/i.test(`${e.responseBody ?? ""} ${e.message}`)) return null;
  try {
    const raw = JSON.parse(e.responseBody ?? "{}")?.error?.failed_generation;
    if (typeof raw !== "string") return null;
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

function retryAfterSeconds(e: APICallError): number | null {
  const h = e.responseHeaders ?? {};
  const v = h["retry-after"] ?? h["Retry-After"];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.ceil(n)) : null;
}

/** Ask a model for an object matching `schema`. Tries each configured provider; throws AiBusyError, AiUnavailableError or AiBudgetError. */
export async function generateJson<T>(c: JsonCall<T>): Promise<JsonResult<T>> {
  const list = providers(c.prefer);
  if (!list.length) throw new AiUnavailableError();
  if (!budgetLeft(c.user)) throw new AiBudgetError();
  const state = { busyFor: null as number | null, lastError: null as unknown, attempts: 0 };
  for (const p of list) {
    if (p.json) {
      state.attempts++;
      try {
        return await p.json(c);
      } catch (e) {
        if (c.abortSignal?.aborted) throw e;
        state.lastError = e;
        if (e instanceof BedrockBusyError) state.busyFor = Math.max(state.busyFor ?? 0, e.retryAfter);
        console.warn(`[assistant] ${c.name} ${p.name} failed: ${(e as Error).message.slice(0, 200)}`);
        continue;
      }
    }
    // a pool of models, each with its own free allowance: those resting after a refusal or without allowance left this
    // minute are skipped (no refused call costs the Collector time); among the rest, the least used goes first
    if (p.pool) {
      const need = Math.ceil((c.system.length + c.prompt.length) / 3.5) + Math.round((c.maxOutputTokens ?? 1200) * 0.4);
      const models = p.pool(c.role).map((m, rank) => ({ ...m, rank, key: `${p.name}/${m.id}` }))
        .filter((m) => (cooling.get(m.key) ?? 0) <= Date.now());
      const room = (m: { key: string }) => {
        const u = usedLastMinute(m.key), lim = p.limits ?? { tpm: Infinity, rpm: Infinity };
        return u.requests < lim.rpm && u.tokens + need <= lim.tpm ? lim.tpm - u.tokens : -1;
      };
      // keep the preferred order while a model has room; models that would go over this minute's allowance go last
      const order = [...models].sort((a, b) => Number(room(b) < 0) - Number(room(a) < 0) || a.rank - b.rank);
      for (const m of order) {
        if (room(m) < 0 && order.some((x) => room(x) >= 0)) continue;
        const r = await tryModel(c, p, m.id, m.lm, state);
        if (r.result) return r.result;
        if (r.longBusy) console.warn(`[assistant] ${c.name}: ${m.key} is busy or rate-limited; next model`);
      }
      continue;
    }
    // each model has its own rate limits: when one is out for a long while (a daily cap) or overloaded, the provider's other model answers
    const first = p.model(c.role), other = p.model(c.role === "fast" ? "reasoning" : "fast");
    if (!first.lm) continue;
    const r = await tryModel(c, p, first.id, first.lm, state);
    if (r.result) return r.result;
    if (r.longBusy && other.id !== first.id && other.lm) {
      console.warn(`[assistant] ${c.name}: ${p.name}/${first.id} is rate-limited for a while; trying ${p.name}/${other.id}`);
      const r2 = await tryModel(c, p, other.id, other.lm, state);
      if (r2.result) return r2.result;
    }
  }
  if (state.busyFor != null) throw new AiBusyError(state.busyFor);
  throw state.lastError instanceof Error ? state.lastError : new Error("The AI call failed.");
}

/** Up to three tries on one model. `longBusy`: it is rate-limited for longer than is worth waiting. */
/**
 * Models that just said "rate limited" or "overloaded", until when: skipped meanwhile, so a free tier that is out of its
 * per-minute (or daily) allowance does not cost every question a refused call before the next model answers.
 */
const cooling = new Map<string, number>();

/** Tokens and requests each model used in the last minute (this server's calls; the free tiers count per minute). */
const usage = new Map<string, { t: number; tokens: number }[]>();
function usedLastMinute(key: string): { requests: number; tokens: number } {
  const now = Date.now();
  const l = (usage.get(key) ?? []).filter((x) => now - x.t < 60_000);
  usage.set(key, l);
  return { requests: l.length, tokens: l.reduce((a, x) => a + x.tokens, 0) };
}
const recordUse = (key: string, tokens: number) => { const l = usage.get(key) ?? []; l.push({ t: Date.now(), tokens }); usage.set(key, l); };

async function tryModel<T>(c: JsonCall<T>, p: Provider, id: string, lm: LanguageModel,
  state: { busyFor: number | null; lastError: unknown; attempts: number }): Promise<{ result?: JsonResult<T>; longBusy: boolean }> {
  const key = `${p.name}/${id}`;
  if ((cooling.get(key) ?? 0) > Date.now()) return { longBusy: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    state.attempts++;
    const t0 = Date.now();
    try {
      const r = await generateText({
        model: lm, system: c.system, prompt: c.prompt, temperature: c.temperature, maxOutputTokens: c.maxOutputTokens ?? 1200,
        maxRetries: 0, abortSignal: c.abortSignal, output: Output.object({ schema: c.schema, name: c.name }), providerOptions: p.options(c.role, id)
      });
      const info: CallInfo = { step: c.name, provider: p.name, model: id, ms: Date.now() - t0, attempts: state.attempts,
        inputTokens: r.usage?.inputTokens ?? 0, outputTokens: r.usage?.outputTokens ?? 0 };
      charge(c.user, info.inputTokens + info.outputTokens);
      recordUse(key, info.inputTokens + info.outputTokens);
      console.info(`[assistant] ${c.name} ${p.name}/${id} ${info.ms} ms, ${info.inputTokens}+${info.outputTokens} tokens`);
      return { result: { object: r.output as T, info }, longBusy: false };
    } catch (e) {
      if (c.abortSignal?.aborted) throw e;
      state.lastError = e;
      if (APICallError.isInstance(e)) {
        const draft = failedDraft(e);
        if (draft !== null) {
          const parsed = (c.lenient ?? c.schema).safeParse(draft);
          if (parsed.success) {
            const info: CallInfo = { step: c.name, provider: p.name, model: id, ms: Date.now() - t0, attempts: state.attempts, inputTokens: 0, outputTokens: 0 };
            console.info(`[assistant] ${c.name} ${p.name}/${id}: provider rejected the draft; it passed our schema, used it`);
            return { result: { object: parsed.data, info }, longBusy: false };
          }
          const issue = parsed.error.issues[0];
          console.warn(`[assistant] ${c.name} draft off-schema at ${issue?.path.join(".")}: ${issue?.message}`);
          state.lastError = new Error(`off-schema output at ${issue?.path.join(".") || "(root)"}: ${issue?.message}`);
          if (attempt === 0) continue;
          return { longBusy: false };
        }
      }
      const status = APICallError.isInstance(e) ? e.statusCode : undefined;
      const busy = status === 429 || (status != null && status >= 500) || (APICallError.isInstance(e) && e.isRetryable);
      console.warn(`[assistant] ${c.name} ${p.name}/${id} failed (${status ?? (e as Error).name}): ${(e as Error).message.slice(0, 160)}`);
      // 503 "high demand" or 429 "rate limited": waiting keeps the Collector waiting; hand over to the other model (then the
      // next provider) at once. Free tiers cap tokens per minute, and one question can use most of a minute's allowance.
      if (status === 503 || status === 429) {
        state.busyFor = Math.max(state.busyFor ?? 0, 10);
        // a daily quota ("exceeded your current quota") rests longer than a per-minute limit
        const wait = APICallError.isInstance(e) ? retryAfterSeconds(e) : null;
        const daily = /quota|per day|RPD|TPD/i.test((e as Error).message);
        cooling.set(key, Date.now() + 1000 * (daily ? 15 * 60 : Math.min(120, Math.max(20, wait ?? 60))));
        return { longBusy: true };
      }
      if (busy) {
        const wait = APICallError.isInstance(e) ? retryAfterSeconds(e) : null;
        state.busyFor = Math.max(state.busyFor ?? 0, wait ?? 10);
        // a short wait is worth it (tokens-per-minute limits refill in seconds); a long one is not: try another model or provider
        if (attempt < 2 && (wait == null || wait <= 8)) {
          await sleep(wait != null ? wait * 1000 + Math.random() * 400 : Math.min(4000, 400 * 2 ** attempt + Math.random() * 400), c.abortSignal);
          continue;
        }
        return { longBusy: status === 429 && wait != null && wait > 8 };
      }
      // bad JSON or a schema mismatch: one more try on the same model, then the next provider
      // (with a pool, the next model is a better bet than the same one again)
      if (!status && attempt === 0 && !p.pool) continue;
      return { longBusy: false };
    }
  }
  return { longBusy: false };
}
