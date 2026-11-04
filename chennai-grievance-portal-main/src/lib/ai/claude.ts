/**
 * Claude for Jarvis, through Anthropic's own SDK. Jarvis's ladder (lib/thunai/llm.ts) asks here first when ANTHROPIC_API_KEY
 * is in .env; with no key, a refused key, no credit or any failure, the ladder goes on to Groq as it always did. Nothing else
 * in the portal calls Claude: AI_PROVIDER is untouched.
 *
 * This is the one rung that costs money, so effort is low (a spoken turn cannot wait, and code fetches every figure anyway), the
 * fixed instructions are cached, and the ledger caps a day's requests (LIMITS in lib/thunai/ledger.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodSchema } from "ai";
import type { z } from "zod";
import { ledger } from "@/lib/thunai/ledger";

const env = (k: string) => (process.env[k] ?? "").trim();

declare global {
  // eslint-disable-next-line no-var
  var __claude: { key: string; client: Anthropic } | undefined;
  // eslint-disable-next-line no-var
  var __claudeRefused: string | undefined;
}

/** A key Anthropic has refused is not tried again until .env holds a different one. */
export const claudeConfigured = (): boolean => !!env("ANTHROPIC_API_KEY") && global.__claudeRefused !== env("ANTHROPIC_API_KEY");
export const claudeModel = (): string => env("JARVIS_CLAUDE_MODEL") || "claude-opus-5-5";

function client(): Anthropic {
  const key = env("ANTHROPIC_API_KEY");
  // no retries inside the SDK: a failure goes straight to the next rung, and the turn has 8 s in all
  if (global.__claude?.key !== key) global.__claude = { key, client: new Anthropic({ apiKey: key, maxRetries: 0 }) };
  return global.__claude.client;
}

/** The constraints structured outputs does not take. Zod still checks them on the way back. */
const UNSUPPORTED = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems", "default"]);
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !UNSUPPORTED.has(k)).map(([k, x]) => [k, clean(x)]));
}
const schemas = new WeakMap<object, Record<string, unknown>>();
function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  let s = schemas.get(schema);
  if (!s) { s = clean(zodSchema(schema).jsonSchema) as Record<string, unknown>; schemas.set(schema, s); }
  return s;
}
/** Structured outputs refuses a schema with too many optional parameters (it refused the planner's 19 and 39). */
const MAX_UNIONS = 16;
function unions(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + unions(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Record<string, unknown>;
  return (Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0) + Object.values(o).reduce((n: number, x) => n + unions(x), 0);
}
/** Schemas structured outputs would not take: asked for as plain JSON. */
const tooHard = new WeakSet<object>();

/**
 * The answer's shape in one line, for the plain-JSON ask. The JSON schema itself came to three thousand tokens on every turn,
 * and the prompt already says what each field is for. Zod still checks the reply against the real schema.
 */
function shape(v: unknown): string {
  const s = v as { type?: string | string[]; enum?: unknown[]; anyOf?: unknown[]; items?: unknown; properties?: Record<string, unknown> };
  if (s.enum) return s.enum.map(String).join("|");
  if (s.anyOf) return s.anyOf.map(shape).join("|");
  if (Array.isArray(s.type)) return s.type.map((type) => shape({ ...s, type })).join("|");
  if (s.type === "array") return `[${s.items ? shape(s.items) : ""}]`;
  if (s.properties) return `{${Object.entries(s.properties).map(([k, x]) => `${k}:${shape(x)}`).join(",")}}`;
  return String(s.type ?? "any");
}

export interface ClaudeJsonArgs<T> {
  name: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  lenient?: z.ZodType<T, z.ZodTypeDef, unknown>;
  system: string;
  prompt: string;
  /** what the caller wants for its answer; thinking also counts against max_tokens, so the request asks for more */
  maxOutputTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}
export interface ClaudeJsonResult<T> { object: T; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; ms: number }

const COOL_BUSY_MS = 60_000, COOL_NO_CREDIT_MS = 3_600_000;

/** One structured answer from Claude. Throws on any failure, and the ladder moves on. */
export async function claudeJson<T>(a: ClaudeJsonArgs<T>): Promise<ClaudeJsonResult<T>> {
  const model = claudeModel(), t0 = Date.now();
  const strict = !tooHard.has(a.schema) && unions(jsonSchema(a.schema)) <= MAX_UNIONS;
  const system = strict ? a.system : `${a.system}\n\nReply with only one JSON object, no prose and no code fences, every field present (null or [] where unused), in this shape:\n${shape(jsonSchema(a.schema))}`;
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client().beta.messages.create({
      model,
      max_tokens: Math.max(2000, a.maxOutputTokens ?? 0),
      // a request Claude's safeguards decline runs again on the model Anthropic chooses for it, inside this call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: a.prompt }],
      output_config: { effort: "low", ...(strict ? { format: { type: "json_schema" as const, schema: jsonSchema(a.schema) } } : {}) }
    } as Anthropic.Beta.MessageCreateParamsNonStreaming, { signal: a.abortSignal, timeout: a.timeoutMs ?? 6000 }) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) global.__claudeRefused = env("ANTHROPIC_API_KEY");
    else if (e instanceof Anthropic.RateLimitError) ledger().cool("anthropic", model, COOL_BUSY_MS);
    else if (e instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(e.message)) ledger().cool("anthropic", model, COOL_NO_CREDIT_MS);
      // not taken after all: this same call asks again as plain JSON, so one refused schema does not cost the turn
      else if (strict && /schema|output_config|format/i.test(e.message)) { tooHard.add(a.schema); console.warn(`[claude] ${a.name}: schema not taken, plain JSON from now on: ${e.message.slice(0, 160)}`); return claudeJson(a); }
    }
    throw e;
  }
  if (res.stop_reason === "refusal") throw new Error(`Claude declined ${a.name}`);
  const block = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  const text = block?.text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "") ?? "";
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error(`Claude's ${a.name} was not JSON (${res.stop_reason}, ${text.length} characters)`); }
  const ok = a.schema.safeParse(raw);
  const parsed = ok.success ? ok : a.lenient?.safeParse(raw);
  if (!parsed?.success) throw new Error(`Claude's ${a.name} did not match its schema`);
  const u = res.usage;
  return { object: parsed.data, model, inputTokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, ms: Date.now() - t0 };
}
