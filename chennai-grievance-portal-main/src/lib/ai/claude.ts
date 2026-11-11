/**
 * The Claude API (Anthropic), through the official SDK (@anthropic-ai/sdk). One key, ANTHROPIC_API_KEY in the portal's .env.
 * Two kinds of caller share it:
 *   the console's AI steps, when AI_PROVIDER names claude (gateway.ts): model AI_CLAUDE_MODEL (default Claude Opus 5.5), the fast
 *     steps may use another (AI_CLAUDE_MODEL_FAST, e.g. claude-haiku-5-5); effort low for the fast steps, AI_CLAUDE_EFFORT or medium
 *     for the write-ups; an off-schema reply is asked for once more.
 *   Jarvis's ladder (lib/thunai/llm.ts), first when the key is set, whatever AI_PROVIDER says: model JARVIS_CLAUDE_MODEL, effort low
 *     (a spoken turn cannot wait, and code fetches every figure anyway), one try: any failure goes straight to the next rung. The
 *     ledger caps Jarvis's day (LIMITS in lib/thunai/ledger.ts).
 *
 * Each step asks for one JSON object matching the step's zod schema (structured outputs: output_config.format), checked again with
 * zod here. Opus 5.5 always thinks before it answers (depth is set with effort), so a console step has its own longer deadline
 * (AI_CLAUDE_TIMEOUT_MS). A request the model declines for policy reasons runs again server-side on Anthropic's recommended fallback
 * (fallbacks: "default"). A busy API (429, 529, 5xx) throws ClaudeBusyError; a refused key is remembered until .env holds another.
 * The long, fixed instructions go in the system block with a cache point. The prompt is never logged.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodSchema } from "ai";
import type { z } from "zod";
import { keyRefused, keyWorks } from "@/lib/ai/keyhealth";
import { ledger } from "@/lib/thunai/ledger";

export type ClaudeRole = "fast" | "reasoning";

const env = (k: string) => (process.env[k] ?? "").trim();

declare global {
  // eslint-disable-next-line no-var
  var __claude: { key: string; client: Anthropic } | undefined;
  // eslint-disable-next-line no-var
  var __claudeRefused: { key: string; reason: string } | undefined;
}

/** Why Claude is not being used ("key refused"), while .env still holds the refused key. */
export function claudeProblem(): string | null {
  const f = global.__claudeRefused;
  return f && f.key === env("ANTHROPIC_API_KEY") ? f.reason : null;
}

export const claudeConfigured = (): boolean => !!env("ANTHROPIC_API_KEY") && !claudeProblem();

/** A console step's model by its role; with no role, Jarvis's. */
export function claudeModel(role?: ClaudeRole): string {
  if (!role) return env("JARVIS_CLAUDE_MODEL") || "claude-opus-5-5";
  const main = env("AI_CLAUDE_MODEL") || "claude-opus-5-5";
  return role === "fast" ? env("AI_CLAUDE_MODEL_FAST") || main : main;
}

/** No retries inside the SDK: the gateway and the ladder decide what comes next. */
function client(): Anthropic {
  const key = env("ANTHROPIC_API_KEY");
  if (global.__claude?.key !== key) global.__claude = { key, client: new Anthropic({ apiKey: key, maxRetries: 0 }) };
  return global.__claude.client;
}

export class ClaudeBusyError extends Error {
  constructor(public retryAfter: number, detail: string) {
    super(`The Claude API is busy (${detail}).`);
  }
}

type Json = Record<string, unknown>;
const FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

/**
 * A JSON schema as structured outputs take it: every object closed (additionalProperties false), and the keywords it does not take
 * (lengths, ranges, patterns) moved into the description, where the model still reads them; zod checks them here. The SDK's
 * transformJSONSchema does the same but also moves enum and const away, and the routing steps need those kept as hard limits.
 */
function strict(s: Json): Json {
  const src = { ...s }, out: Json = {};
  const take = (k: string) => { const v = src[k]; delete src[k]; return v; };
  const defs = take("$defs") as Record<string, Json> | undefined;
  if (defs) out.$defs = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, strict(v)]));
  const ref = take("$ref");
  if (ref !== undefined) return { ...out, $ref: ref };
  const type = take("type"), anyOf = take("anyOf") ?? take("oneOf"), allOf = take("allOf");
  const is = (t: string) => type === t || (Array.isArray(type) && type.includes(t));
  if (Array.isArray(anyOf)) out.anyOf = (anyOf as Json[]).map(strict);
  else if (Array.isArray(allOf)) out.allOf = (allOf as Json[]).map(strict);
  if (type !== undefined) out.type = type;
  for (const k of ["description", "title", "enum", "const"]) { const v = take(k); if (v !== undefined) out[k] = v; }
  if (is("object")) {
    out.properties = Object.fromEntries(Object.entries((take("properties") as Record<string, Json>) ?? {}).map(([k, v]) => [k, strict(v)]));
    take("additionalProperties");
    out.additionalProperties = false;
    const req = take("required");
    if (req !== undefined) out.required = req;
  }
  if (is("array")) {
    const items = take("items");
    if (items && typeof items === "object" && !Array.isArray(items)) out.items = strict(items as Json);
    const min = src.minItems;
    if (min === 0 || min === 1) { out.minItems = min; delete src.minItems; }
  }
  if (is("string") && FORMATS.has(src.format as string)) out.format = take("format");
  delete src.$schema;
  delete src.default;
  const rest = Object.entries(src);
  if (rest.length) out.description = `${out.description ? `${out.description}\n\n` : ""}{${rest.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}}`;
  return out;
}

/** Does the schema hold a free-form map (z.record)? Structured outputs close every object, so such a map would come back empty. */
function openMap(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Json;
  if (o.additionalProperties && typeof o.additionalProperties === "object") return true;
  return Object.values(o).some((v) => (Array.isArray(v) ? v.some(openMap) : openMap(v)));
}

/** Structured outputs refuses a schema with too many optional parameters (it refused the planner's 19 and 39). */
const MAX_UNIONS = 16;
function unions(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + unions(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Json;
  return (Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0) + Object.values(o).reduce((n: number, x) => n + unions(x), 0);
}

/**
 * The answer's shape in one line, for the plain-JSON ask. The JSON schema itself came to three thousand tokens on every turn, and
 * the prompt already says what each field is for. Zod still checks the reply against the real schema.
 */
function shape(v: unknown): string {
  const s = v as { type?: string | string[]; enum?: unknown[]; anyOf?: unknown[]; items?: unknown; properties?: Record<string, unknown>; additionalProperties?: unknown };
  if (s.enum) return s.enum.map(String).join("|");
  if (s.anyOf) return s.anyOf.map(shape).join("|");
  if (Array.isArray(s.type)) return s.type.map((type) => shape({ ...s, type })).join("|");
  if (s.type === "array") return `[${s.items ? shape(s.items) : ""}]`;
  if (s.properties) return `{${Object.entries(s.properties).map(([k, x]) => `${k}:${shape(x)}`).join(",")}}`;
  if (s.additionalProperties && typeof s.additionalProperties === "object") return `{<key>:${shape(s.additionalProperties)}}`;
  return String(s.type ?? "any");
}

/** The step's schema: for structured outputs (null when it holds a free-form map or too many unions), and its one-line shape. Cached per zod schema. */
const schemas = new WeakMap<object, { strict: Json | null; shape: string }>();
function outputSchema(schema: z.ZodTypeAny): { strict: Json | null; shape: string } {
  let s = schemas.get(schema);
  if (!s) {
    const plain = { ...(zodSchema(schema).jsonSchema as Json) };
    delete plain.$schema;
    s = { strict: openMap(plain) || unions(plain) > MAX_UNIONS ? null : strict(plain), shape: shape(plain) };
    schemas.set(schema, s);
  }
  return s;
}
/** Schemas the API refused after all: asked for as plain JSON from then on. */
const tooHard = new WeakSet<object>();

/** The models that take server-side refusal fallbacks (Haiku 5.5 has none). */
const FALLBACKS = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;
/** The models whose thinking may be turned off at low effort (Opus 5.5 and Sonnet 5.5 refuse it). */
const NO_THINK = /^claude-haiku-5-5$/;

export interface ClaudeJsonArgs<T> {
  name: string;
  /** a console step's role; left out, the call is Jarvis's (low effort, one try) */
  role?: ClaudeRole;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  lenient?: z.ZodType<T, z.ZodTypeDef, unknown>;
  system: string;
  prompt: string;
  /** photos sent before the prompt (Manu Desk: a petition's pages), base64 */
  images?: { mediaType: "image/jpeg" | "image/png"; data: string }[];
  /** this call's own model, instead of the role's */
  model?: string;
  /** what the caller wants for its answer; thinking also counts against max_tokens, so the request asks for more */
  maxOutputTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}
export interface ClaudeJsonResult<T> { object: T; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; ms: number }

const COOL_BUSY_MS = 60_000, COOL_NO_CREDIT_MS = 3_600_000;

/** The first JSON object in a reply (structured outputs send it bare; the plain-JSON ask may wrap it in a fence). */
function firstJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Seconds the API asks us to wait (retry-after), else a default. */
function retryAfter(e: InstanceType<typeof Anthropic.APIError>, dflt: number): number {
  const n = Number(e.headers?.get("retry-after"));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : dflt;
}

/** One structured answer from Claude. Throws ClaudeBusyError (rate limit, overload, too slow) or a plain Error, and the caller moves on. */
export async function claudeJson<T>(a: ClaudeJsonArgs<T>): Promise<ClaudeJsonResult<T>> {
  const model = a.model || claudeModel(a.role), t0 = Date.now();
  const effort = a.role === "reasoning" ? ((env("AI_CLAUDE_EFFORT") || "medium") as "low" | "medium" | "high") : "low";
  const timeout = a.timeoutMs ?? (a.role ? Number(env("AI_CLAUDE_TIMEOUT_MS")) || 25_000 : 6000);
  const attempts = a.role ? 2 : 1;
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let lastIssue = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const sch = outputSchema(a.schema);
    const useFormat = sch.strict != null && !tooHard.has(a.schema);
    const how = useFormat ? "" : `\n\nReply with only one JSON object, no prose and no code fences, every field present (null or [] where unused), in this shape:\n${sch.shape}`;
    const prompt = attempt === 0 ? a.prompt : `${a.prompt}\n\nYour previous reply did not match the schema (${lastIssue}). Reply again with one complete, valid JSON object.`;
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await client().beta.messages.create({
        model,
        // thinking shares this budget with the answer; a console write-up gets more room than a spoken turn
        max_tokens: a.role ? Math.max(4000, (a.maxOutputTokens ?? 1500) * 3) : Math.max(2000, a.maxOutputTokens ?? 0),
        system: [{ type: "text", text: a.system + how, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: a.images?.length
          ? [...a.images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })), { type: "text" as const, text: prompt }]
          : prompt }],
        output_config: { effort, ...(useFormat ? { format: { type: "json_schema" as const, schema: sch.strict! } } : {}) },
        // a spoken turn on Haiku 5.5 answers without thinking first (allowed at low effort; the schema still holds the reply's
        // shape): the answer comes about a second sooner. JARVIS_CLAUDE_THINK=1 keeps the thinking
        ...(!a.role && NO_THINK.test(model) && env("JARVIS_CLAUDE_THINK") !== "1" ? { thinking: { type: "disabled" as const } } : {}),
        // a request Claude's safeguards decline runs again on the model Anthropic chooses for it, inside this call
        ...(FALLBACKS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {})
      }, { timeout, signal: a.abortSignal });
    } catch (e) {
      if (a.abortSignal?.aborted) throw e;
      if (e instanceof Anthropic.BadRequestError) {
        if (/credit balance/i.test(e.message)) {
          ledger().cool("anthropic", model, COOL_NO_CREDIT_MS);
          keyRefused("anthropic", 400, "no credit left");
          throw new Error("The Claude API account has no credit left. Add credit at console.anthropic.com.");
        }
        // not taken after all: this same call asks again as plain JSON, so one refused schema does not cost the turn
        if (useFormat && /schema|output_config|format/i.test(e.message)) {
          tooHard.add(a.schema);
          console.warn(`[claude] ${a.name}: schema not taken, plain JSON from now on: ${e.message.slice(0, 160)}`);
          attempt--;
          continue;
        }
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        // remembered for this key: no more waiting on Anthropic until a new key is pasted
        global.__claudeRefused = { key: env("ANTHROPIC_API_KEY"), reason: e.status === 401 ? "key not accepted" : "key refused" };
        keyRefused("anthropic", e.status, e.message);
        throw new Error(`The Claude API refused the key (${e.status}). Put a valid ANTHROPIC_API_KEY in .env.`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        ledger().cool("anthropic", model, COOL_BUSY_MS);
        throw new ClaudeBusyError(retryAfter(e, 20), "rate limited");
      }
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ClaudeBusyError(10, `no answer in ${Math.round(timeout / 1000)} s`);
      // 529 overloaded and other 5xx
      if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) throw new ClaudeBusyError(retryAfter(e, 15), `HTTP ${e.status}`);
      if (e instanceof Anthropic.APIConnectionError) throw new ClaudeBusyError(10, "connection failed");
      throw e;
    }
    keyWorks("anthropic");
    usage.input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    // a decline the fallback model declined too
    if (res.stop_reason === "refusal") throw new Error(`Claude declined ${a.name}${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`);
    // only the answer's text: thinking and fallback markers are not part of it
    const raw = firstJson(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
    const done = (object: T): ClaudeJsonResult<T> => ({ object, model, ms: Date.now() - t0, inputTokens: usage.input, outputTokens: usage.output, cacheReadTokens: usage.cacheRead });
    if (raw != null) {
      const ok = a.schema.safeParse(raw);
      if (ok.success) return done(ok.data);
      const loose = a.lenient?.safeParse(raw);
      if (loose?.success) return done(loose.data);
      const issue = ok.error.issues[0];
      lastIssue = `${issue?.path.join(".") || "(root)"}: ${issue?.message}`;
    } else {
      lastIssue = res.stop_reason === "max_tokens" ? "the reply was cut off" : "no JSON object";
    }
    console.warn(`[claude] ${a.name} ${model}: off-schema reply (${lastIssue})${attempt + 1 < attempts ? "; asking again" : ""}`);
  }
  throw new Error(`Claude's ${a.name} did not match its schema: ${lastIssue}`);
}
