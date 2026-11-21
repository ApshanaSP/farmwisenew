/**
 * The Claude API (Anthropic), through the official SDK (@anthropic-ai/sdk). One key, ANTHROPIC_API_KEY in the portal's .env.
 * Two kinds of caller share it:
 *   the console's AI steps, when AI_PROVIDER names claude (gateway.ts): model AI_CLAUDE_MODEL (default Claude Opus 5.5), the fast
 *     steps AI_CLAUDE_MODEL_FAST (default Haiku 5.5 since v12, 21 Nov: it was Opus); effort low for the fast steps, AI_CLAUDE_EFFORT or medium
 *     for the write-ups; an off-schema reply is asked for once more.
 *   Jarvis's ladder (lib/thunai/llm.ts), first when the key is set (JARVIS_PLANNER_LEAD=groq puts it after Groq), whatever AI_PROVIDER
 *     says: model JARVIS_CLAUDE_MODEL (default Haiku 5.5), one try: any failure goes straight to the next rung. On Haiku 5.5 (v5 A6):
 *     thinking always disabled, effort JARVIS_HAIKU_EFFORT (low, or medium), max_tokens 600; on another model effort low (a spoken
 *     turn cannot wait, and code fetches every figure anyway). The ledger caps Jarvis's day (LIMITS in lib/thunai/ledger.ts).
 *
 * Each step asks for one JSON object matching the step's zod schema (structured outputs: output_config.format), checked again with
 * zod here. A schema over structured outputs' limits (16 union-typed, 24 optional parameters) goes out rewritten without nullable
 * fields ("" or left out for none) and the reply is read back to nulls before zod; only a schema still over them, or one holding a
 * free-form map, is asked for as plain JSON. Each answer says which (`path`) and what it read from the prompt cache. Opus 5.5
 * always thinks before it answers (depth is set with effort), so a console step has its own longer deadline (AI_CLAUDE_TIMEOUT_MS).
 * A request the model declines for policy reasons runs again server-side on Anthropic's recommended fallback (fallbacks: "default").
 * A busy API (429, 529, 5xx) throws ClaudeBusyError (a 429 is logged as capacity: fallback_429); a refused key (401, 403) is
 * remembered for 10 minutes or until .env holds another (the ladder skips Claude at once meanwhile). A Jarvis reply that stopped on
 * "refusal" or "max_tokens" is never used: the next rung answers, and the stop is logged with the model and the reason only. The long,
 * fixed instructions go in the system block with a cache point. The prompt is never logged.
 * claudeWarm writes a planner prefix into the cache: v12 (21 Nov) from the server's keep-warm (lib/thunai/keepwarm.ts) while Jarvis is in use,
 * after its other steps; /api/jarvis/warm on mode-on only when no keep-warm runs.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodSchema } from "ai";
import type { z } from "zod";
import { beginClaude, budgetLeft, endClaude, recordClaude, recordEstimate } from "@/lib/ai/claudebudget";
import { keyRefused, keyWorks } from "@/lib/ai/keyhealth";
import { compactPlan, type CompactPlan } from "@/lib/thunai/compact";
import { ledger } from "@/lib/thunai/ledger";
import { telemetry } from "@/lib/thunai/telemetry";

export type ClaudeRole = "fast" | "reasoning";

const env = (k: string) => (process.env[k] ?? "").trim();

declare global {
  // eslint-disable-next-line no-var
  var __claude: { key: string; client: Anthropic } | undefined;
  // eslint-disable-next-line no-var
  var __claudeRefused: { key: string; reason: string; until?: number } | undefined;
}

/** v5 A6 (c): a refused key rests this long; then one call may try it again (a key fixed in the console works without a restart) */
export const KEY_REFUSED_MS = 10 * 60_000;

/** Why Claude is not being used ("key refused"), while .env still holds the refused key and its 10 minutes are not over. */
export function claudeProblem(): string | null {
  const f = global.__claudeRefused;
  return f && f.key === env("ANTHROPIC_API_KEY") && (f.until == null || Date.now() < f.until) ? f.reason : null;
}

/**
 * The hard switch (v5 build): JARVIS_CLAUDE_OFF=1 and nothing reaches Anthropic (no ladder rung, no warm-up, no console step, no direct
 * call), whatever ANTHROPIC_API_KEY says: Next loads .env itself, so an emptied key in the shell may not stop it. Default off.
 */
export const claudeOff = (): boolean => env("JARVIS_CLAUDE_OFF") === "1";

// v6: and while the owner's spend ceiling has room (claudebudget.ts, JARVIS_CLAUDE_BUDGET_USD, default $5); past it, every caller goes to Groq
export const claudeConfigured = (): boolean => !claudeOff() && !!env("ANTHROPIC_API_KEY") && !claudeProblem() && budgetLeft();

/** A console step's model by its role; with no role, Jarvis's. */
export function claudeModel(role?: ClaudeRole): string {
  // v5 A6: Haiku 5.5 leads Jarvis's planner (the owner's plan); Opus 5.5 only by explicit JARVIS_CLAUDE_MODEL, never on the voice lane by default
  if (!role) return env("JARVIS_CLAUDE_MODEL") || "claude-haiku-5-5";
  const main = env("AI_CLAUDE_MODEL") || "claude-opus-5-5";
  // v12 (21 Nov): the console's fast steps (Ask the Map's plan and rewording, routing) are Haiku unless AI_CLAUDE_MODEL_FAST names another.
  // They fell back to Opus: 106 Opus calls cost $4.47 of the $5 ceiling, and one timed-out Ask the Map plan on a filler sentence crossed it
  // at 06:38:33, which switched Claude off for Jarvis for the rest of the morning (the critic's review, "missed" 1)
  return role === "fast" ? env("AI_CLAUDE_MODEL_FAST") || "claude-haiku-5-5" : main;
}

/** No retries inside the SDK: the gateway and the ladder decide what comes next. */
function client(): Anthropic {
  // every request is built through here: the switch holds even for a caller that did not ask claudeConfigured()
  if (claudeOff()) throw new Error("Claude is switched off (JARVIS_CLAUDE_OFF=1).");
  // v6: the spend ceiling holds even for a caller that did not ask claudeConfigured()
  if (!budgetLeft()) throw new Error("The Claude spend ceiling is reached (JARVIS_CLAUDE_BUDGET_USD).");
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

/**
 * Structured outputs' explicit limits, across every strict schema of a request (platform docs, "Schema complexity limits", read
 * 15 Nov 2026; they apply to output_config.format and to strict tools alike, so a strict tool is no way round them): at most 16
 * parameters with a union type (anyOf, or a type list such as ["string","null"]) and at most 24 optional parameters (not in
 * `required`). The API refused the planner's 19 and 39 unions.
 */
const MAX_UNIONS = 16, MAX_OPTIONAL = 24;
function unions(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + unions(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Json;
  return (Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0) + Object.values(o).reduce((n: number, x) => n + unions(x), 0);
}
function optionals(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + optionals(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Json;
  const req = Array.isArray(o.required) ? (o.required as string[]) : [];
  const own = o.properties && typeof o.properties === "object" ? Object.keys(o.properties as Json).filter((k) => !req.includes(k)).length : 0;
  return own + Object.values(o).reduce((n: number, x) => n + optionals(x), 0);
}

/**
 * How a nullable field was written for the wire, so the reply can be read back: `blank` (a string, "" for none) or `omit`
 * (a number, a boolean, an object or a list, left out for none); `sub` for what is inside.
 */
interface Undo { props?: Record<string, { blank?: true; omit?: true; sub?: Undo }>; items?: Undo; any?: (Undo | null)[] }

/** The non-null side of a nullable field (`type: [T, "null"]`, or anyOf of one schema and null), else null. */
function nonNull(s: Json): Json | null {
  if (Array.isArray(s.type) && s.type.length === 2 && s.type.includes("null")) {
    const out: Json = { ...s, type: (s.type as string[]).find((t) => t !== "null") };
    if (Array.isArray(s.enum)) out.enum = (s.enum as unknown[]).filter((x) => x !== null);
    return out;
  }
  if (Array.isArray(s.anyOf) && s.anyOf.length === 2) {
    const [a, b] = s.anyOf as Json[];
    const other = a.type === "null" ? b : b.type === "null" ? a : null;
    if (!other || other.$ref) return null;
    return { ...other, ...(s.description ? { description: s.description } : {}) };
  }
  return null;
}
const hint = (s: Json, h: string): Json => ({ ...s, description: s.description ? `${s.description} (${h})` : h });

/**
 * The same schema with no nullable fields, so it fits the limits: a nullable string or string enum becomes a string ("" means
 * none: the enum gains ""), any other nullable field (a number, a boolean, an object, a list) becomes optional (left out means
 * none). A true union of two kinds is kept. The Undo says where to put the nulls back before zod reads the reply.
 */
function unNull(s: Json): { wire: Json; undo: Undo | null } {
  if (s.$ref) return { wire: s, undo: null };
  const out: Json = { ...s };
  const undo: Undo = {};
  if (s.properties && typeof s.properties === "object") {
    const req = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
    const props: Json = {};
    undo.props = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, Json>)) {
      const n = nonNull(v);
      if (n && n.type === "string") {
        props[k] = hint({ ...n, ...(Array.isArray(n.enum) ? { enum: [...(n.enum as unknown[]), ""] } : {}) }, "\"\" when none");
        undo.props[k] = { blank: true };
        continue;
      }
      if (n && typeof n.type === "string") {
        const inner = unNull(n);
        props[k] = hint(inner.wire, "left out when none");
        req.delete(k);
        undo.props[k] = { omit: true, ...(inner.undo ? { sub: inner.undo } : {}) };
        continue;
      }
      const inner = unNull(v);
      props[k] = inner.wire;
      if (inner.undo) undo.props[k] = { sub: inner.undo };
    }
    out.properties = props;
    if (Array.isArray(s.required)) out.required = (s.required as string[]).filter((k) => req.has(k));
  }
  if (s.items && typeof s.items === "object" && !Array.isArray(s.items)) {
    const inner = unNull(s.items as Json);
    out.items = inner.wire;
    if (inner.undo) undo.items = inner.undo;
  }
  if (Array.isArray(s.anyOf)) {
    const parts = (s.anyOf as Json[]).map(unNull);
    out.anyOf = parts.map((p) => p.wire);
    if (parts.some((p) => p.undo)) undo.any = parts.map((p) => p.undo);
  }
  if (s.$defs && typeof s.$defs === "object") out.$defs = Object.fromEntries(Object.entries(s.$defs as Record<string, Json>).map(([k, v]) => [k, unNull(v).wire]));
  return { wire: out, undo: undo.props && Object.keys(undo.props).length || undo.items || undo.any ? undo : null };
}

/** Put the nulls back: "" where a string was blank, null where a field was left out. Changes `v` in place. */
function restore(v: unknown, u: Undo | null | undefined): void {
  if (!u || v == null || typeof v !== "object") return;
  if (Array.isArray(v)) { if (u.items) for (const x of v) restore(x, u.items); return; }
  const o = v as Record<string, unknown>;
  // a kept union of objects: each side fills only the keys it has (zod drops a key that is not its own)
  if (u.any) for (const b of u.any) restore(o, b);
  for (const [k, p] of Object.entries(u.props ?? {})) {
    if (p.blank && o[k] === "") o[k] = null;
    else if (p.omit && o[k] === undefined) o[k] = null;
    else if (p.sub) restore(o[k], p.sub);
  }
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

/**
 * The step's schema for the wire. `strict` is what structured outputs get: the schema closed, and, when it is over the limits,
 * rewritten without nullable fields (unNull; `undo` reads the reply back); null when it holds a free-form map or is still over the
 * limits, and the step is then asked for as plain JSON in its one-line `shape`. Cached per zod schema.
 */
interface Wire { strict: Json | null; shape: string; undo: Undo | null; unions: number; optionals: number; rewritten: boolean }
const schemas = new WeakMap<object, Wire>();
function outputSchema(schema: z.ZodTypeAny): Wire {
  let s = schemas.get(schema);
  if (!s) {
    const plain = { ...(zodSchema(schema).jsonSchema as Json) };
    delete plain.$schema;
    let closed: Json | null = openMap(plain) ? null : strict(plain), undo: Undo | null = null, rewritten = false;
    const over = (x: Json) => unions(x) > MAX_UNIONS || optionals(x) > MAX_OPTIONAL;
    if (closed && over(closed)) {
      const r = unNull(closed);
      closed = r.wire; undo = r.undo; rewritten = true;
    }
    if (closed && over(closed)) closed = null;
    s = { strict: closed, shape: shape(plain), undo, unions: closed ? unions(closed) : unions(plain), optionals: closed ? optionals(closed) : optionals(plain), rewritten };
    schemas.set(schema, s);
  }
  return s;
}

/** What a schema goes out as (for tests and the build report): the path, its unions and optional parameters on the wire. */
export function claudeWire(schema: z.ZodTypeAny): { path: "format" | "json"; unions: number; optionals: number; rewritten: boolean; schema: Json | null } {
  const s = outputSchema(schema);
  return { path: s.strict && !tooHard.has(schema) ? "format" : "json", unions: s.unions, optionals: s.optionals, rewritten: s.rewritten, schema: s.strict };
}
/** Schemas the API refused after all: asked for as plain JSON from then on. */
const tooHard = new WeakSet<object>();

/**
 * v5 A7: a Jarvis call (no role) for a planner bundle with a screen, with JARVIS_PLAN_COMPACT=1, is asked for the compact plan (recipe
 * and the slots that have a value; lib/thunai/compact.ts), and its reply is read back to the full plan before the step's own check.
 * Flag off (the default), a console step, or any other schema: null, and the step's schema goes out as it always did.
 */
function compactFor(schema: z.ZodTypeAny, role?: ClaudeRole): CompactPlan | null {
  return !role && env("JARVIS_PLAN_COMPACT") === "1" ? compactPlan(schema) : null;
}

/** The models that take server-side refusal fallbacks (Haiku 5.5 has none). */
const FALLBACKS = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;
/** Haiku 5.5 turns thinking off with `disabled` (at effort high or below) */
const NO_THINK = /^claude-haiku-5-5$/;
/** Sonnet 5.5 refuses `disabled`; it turns thinking off only with `between_tools` (no other field, at effort high or below) */
const BETWEEN_TOOLS = /^claude-sonnet-5-5$/;

type Effort = "low" | "medium" | "high";
/**
 * v5 A6 (b): a Jarvis call's effort on Haiku 5.5, from JARVIS_HAIKU_EFFORT: low (default) or medium; anything else is low (with
 * thinking disabled, xhigh and max are a 400; high is not offered). Effort is part of the cached prefix: it is fixed per process.
 */
export function haikuEffort(): "low" | "medium" {
  return env("JARVIS_HAIKU_EFFORT").toLowerCase() === "medium" ? "medium" : "low";
}
/** v5 A6 (b): a Jarvis call's room on Haiku 5.5 with thinking off (a plan is about 230 tokens); a caller that asks for more gets more */
const HAIKU_MAX_TOKENS = 600;
/**
 * The thinking setting, per model (rule 7, verified 14 Nov 2026): Opus 5.5 never gets one (`disabled` is a 400 there at every
 * effort; it thinks adaptively and effort low keeps that short). A spoken turn on Haiku 5.5 is always sent `disabled` (v5 A6: leaving
 * the field out turns adaptive thinking on; JARVIS_CLAUDE_THINK no longer changes that). On Sonnet 5.5 (between_tools) it answers
 * without thinking first unless JARVIS_CLAUDE_THINK=1. Both are allowed at effort high or below. A console step keeps its thinking.
 */
function thinkingFor(model: string, jarvis: boolean, effort: Effort): { thinking?: { type: "disabled" } | { type: "between_tools" } } {
  if (!jarvis || !["low", "medium", "high"].includes(effort)) return {};
  if (NO_THINK.test(model)) return { thinking: { type: "disabled" as const } };
  if (env("JARVIS_CLAUDE_THINK") === "1") return {};
  if (BETWEEN_TOOLS.test(model)) return { thinking: { type: "between_tools" as const } };
  return {};
}

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
export interface ClaudeJsonResult<T> {
  object: T; model: string; inputTokens: number; outputTokens: number; ms: number;
  /** usage.cache_read_input_tokens: the prompt read from the cache (0 means the cache missed) */
  cacheReadTokens: number;
  /** usage.cache_creation_input_tokens: the prompt written to the cache */
  cacheWriteTokens: number;
  /** structured outputs (format), or the plain-JSON ask (json) */
  path: "format" | "json";
  /** the answer's stop_reason (end_turn, as a rule; v5 A6 d: the deploy check logs it per call) */
  stopReason: string | null;
}

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

type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
/**
 * One request's body. The cached prefix is the system block alone, with the cache point on it: the fixed instructions (and, on the
 * plain-JSON path, the reply's one-line shape, fixed per schema). Everything that changes per turn (the console state, the screen,
 * recent turns, what was said, the time) is in the user message after it, so it never moves the prefix. Thinking and effort are
 * fixed per model and route, so a warm-up writes the very prefix a spoken turn reads.
 */
function requestBody(a: { system: string; role?: ClaudeRole; maxOutputTokens?: number; images?: ClaudeJsonArgs<unknown>["images"] }, model: string, wire: Wire, mode: "format" | "json" | "bare", prompt: string, maxTokens?: number): Body {
  // v5 A6 (b): a Jarvis call on Haiku 5.5 answers with thinking disabled, at JARVIS_HAIKU_EFFORT
  const haiku = !a.role && NO_THINK.test(model);
  const effort: Effort = a.role === "reasoning" ? ((env("AI_CLAUDE_EFFORT") || "medium") as Effort) : haiku ? haikuEffort() : "low";
  const useFormat = mode === "format" && wire.strict != null;
  const how = mode !== "json" ? "" : `\n\nReply with only one JSON object, no prose and no code fences, every field present (null or [] where unused), in this shape:\n${wire.shape}`;
  return {
    model,
    // thinking shares this budget with the answer; a console write-up gets more room than a spoken turn; Haiku with thinking off needs no more than the plan
    max_tokens: maxTokens ?? (a.role ? Math.max(4000, (a.maxOutputTokens ?? 1500) * 3) : Math.max(haiku ? HAIKU_MAX_TOKENS : 2000, a.maxOutputTokens ?? 0)),
    system: [{ type: "text", text: a.system + how, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: a.images?.length
      ? [...a.images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })), { type: "text" as const, text: prompt }]
      : prompt }],
    output_config: { effort, ...(useFormat ? { format: { type: "json_schema" as const, schema: wire.strict! } } : {}) },
    ...thinkingFor(model, !a.role, effort),
    // a request Claude's safeguards decline runs again on the model Anthropic chooses for it, inside this call (a between_tools
    // request falls back with thinking disabled where the fallback model has no between_tools: SDK 1.4 BetaFallback docs)
    ...(FALLBACKS.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {})
  } as Body;
}

/**
 * A 401 or 403: remembered for this key for 10 minutes (v5 A6 c), so no turn waits on Anthropic meanwhile (the ladder skips Claude at
 * once); after that one call may try it again, and a new key in .env is tried at once
 */
function refusedKey(e: InstanceType<typeof Anthropic.APIError>) {
  global.__claudeRefused = { key: env("ANTHROPIC_API_KEY"), reason: e.status === 401 ? "key not accepted" : "key refused", until: Date.now() + KEY_REFUSED_MS };
  keyRefused("anthropic", e.status ?? 401, e.message);
}

/** What a failed Claude call was billed for: a refused or off-schema reply still cost its tokens (review, Planner 4) */
export interface ClaudeBilled { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
const BILLED = Symbol.for("thunai.claude.billed");
/** The usage a claudeJson error carries when Claude answered (and billed) before it was refused: the caller records it before it moves on */
export function billedOf(e: unknown): ClaudeBilled | null {
  return e && typeof e === "object" && BILLED in e ? ((e as Record<symbol, unknown>)[BILLED] as ClaudeBilled) : null;
}

/**
 * v5 A6 (d): one Claude API request as the deploy check (lib/thunai/deploy.live.ts) reads it: its outcome, time and usage, for its
 * cost cap and timings. Codes and counts only: never a prompt, a reply or a key. The app adds no listener.
 */
export type ClaudeOutcome = "ok" | "refusal" | "max_tokens" | "off_schema" | "schema_refused" | "rate_limited" | "busy" | "timeout" | "key_refused" | "no_credit" | "aborted" | "error";
export interface ClaudeCallEvent {
  name: string; model: string; outcome: ClaudeOutcome; ms: number; stopReason: string | null; path: "format" | "json"; compact: boolean; warm: boolean;
  input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number;
}
const callListeners = new Set<(e: ClaudeCallEvent) => void>();
/** Listen to every Claude request; returns the way to stop listening. */
export function onClaudeCall(fn: (e: ClaudeCallEvent) => void): () => void {
  callListeners.add(fn);
  return () => { callListeners.delete(fn); };
}
function heard(base: Omit<ClaudeCallEvent, "stopReason" | "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens">, res?: Anthropic.Beta.BetaMessage) {
  if (!callListeners.size) return;
  const u = res?.usage;
  const e: ClaudeCallEvent = { ...base, stopReason: res?.stop_reason ?? null, input_tokens: u?.input_tokens ?? 0, output_tokens: u?.output_tokens ?? 0,
    cache_read_input_tokens: u?.cache_read_input_tokens ?? 0, cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0 };
  for (const f of callListeners) try { f(e); } catch { /* a listener never breaks a call */ }
}
/** What an API error was, as an outcome (a time-out before a connection failure: it is one) */
function outcomeOf(e: unknown): ClaudeOutcome {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "key_refused";
  if (e instanceof Anthropic.RateLimitError) return "rate_limited";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return "no_credit";
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) return "busy";
  if (e instanceof Anthropic.APIConnectionError) return "busy";
  return "error";
}

/**
 * One structured answer from Claude. Throws ClaudeBusyError (rate limit, overload, too slow) or a plain Error, and the caller moves on.
 * An error thrown after Claude answered (a refusal, an off-schema reply, a failed second try) carries the usage it was billed (billedOf).
 */
export async function claudeJson<T>(a: ClaudeJsonArgs<T>): Promise<ClaudeJsonResult<T>> {
  if (claudeOff()) throw new Error("Claude is switched off (JARVIS_CLAUDE_OFF=1).");
  const model = a.model || claudeModel(a.role);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    return await claudeAsk(a, model, usage);
  } catch (e) {
    if (usage.input + usage.output > 0 && e && typeof e === "object") {
      try { Object.defineProperty(e, BILLED, { value: { model, inputTokens: usage.input, outputTokens: usage.output, cacheReadTokens: usage.cacheRead, cacheWriteTokens: usage.cacheWrite } satisfies ClaudeBilled }); } catch { /* a frozen error: not recorded */ }
    }
    throw e;
  }
}

/**
 * v6: one Claude request under the owner's spend ceiling: it holds one call's margin while it is out (claudebudget.ts beginClaude), and a
 * request that was sent but never answered (aborted, timed out: it may still be billed) is counted at its worst case. The independent
 * check, 17 Nov, found both uncounted.
 */
async function billed<R>(model: string, body: { max_tokens: number }, send: (c: Anthropic) => Promise<R>, o: { warm?: boolean } = {}): Promise<R> {
  // the client (and its ceiling check) first, then this call's margin: held before the check, its own margin closed the ceiling at
  // $4.50, and every call between $4.50 and $4.75 threw instead of going out or going to Groq. Nothing was sent, so nothing to count.
  const c = client();
  beginClaude();
  try {
    return await send(c);
  } catch (e) {
    // v12 (21 Nov): a warm-up whose time ran out before any response arrived is not counted at a worst case. The SDK's APIConnectionTimeoutError
    // comes only from its timer around the fetch, which stops once the response headers are in (SDK 1.4 client.js fetchWithTimeout): no
    // byte came back. All 7 warms logged so far timed out that way while the server's thread was held at Jarvis's opening (the report,
    // first-question-latency RC6), and each was charged against the $5 ceiling. A warm asks for at most 1 token, so its own worst case is
    // its prompt; a planner turn, an abort, or anything else is still counted as before.
    const warmTimedOut = o.warm && e instanceof Anthropic.APIConnectionTimeoutError;
    if (!warmTimedOut && (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError || (e as Error)?.name === "AbortError")) recordEstimate(model, JSON.stringify(body).length, body.max_tokens);
    throw e;
  } finally {
    endClaude();
  }
}

async function claudeAsk<T>(a: ClaudeJsonArgs<T>, model: string, usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): Promise<ClaudeJsonResult<T>> {
  const t0 = Date.now();
  const timeout = a.timeoutMs ?? (a.role ? Number(env("AI_CLAUDE_TIMEOUT_MS")) || 25_000 : 6000);
  const attempts = a.role ? 2 : 1;
  let lastIssue = "";
  // v5 A7: what goes out (the compact plan, or the step's own schema)
  const plan = compactFor(a.schema, a.role);
  const sent: z.ZodTypeAny = plan?.schema ?? a.schema;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const sch = outputSchema(sent);
    const useFormat = sch.strict != null && !tooHard.has(sent);
    const prompt = attempt === 0 ? a.prompt : `${a.prompt}\n\nYour previous reply did not match the schema (${lastIssue}). Reply again with one complete, valid JSON object.`;
    let res: Anthropic.Beta.BetaMessage;
    const tA = Date.now();
    const ev = (outcome: ClaudeOutcome, r?: Anthropic.Beta.BetaMessage) => heard({ name: a.name, model, outcome, ms: Date.now() - tA, path: useFormat ? "format" : "json", compact: !!plan, warm: false }, r);
    try {
      const body = requestBody(a, model, sch, useFormat ? "format" : "json", prompt);
      res = await billed(model, body, (c) => c.beta.messages.create(body, { timeout, signal: a.abortSignal }));
    } catch (e) {
      if (a.abortSignal?.aborted) { ev("aborted"); throw e; }
      const schemaRefused = useFormat && e instanceof Anthropic.BadRequestError && !/credit balance/i.test(e.message) && /schema|output_config|format|compil/i.test(e.message);
      ev(schemaRefused ? "schema_refused" : outcomeOf(e));
      if (e instanceof Anthropic.BadRequestError) {
        if (/credit balance/i.test(e.message)) {
          ledger().cool("anthropic", model, COOL_NO_CREDIT_MS);
          keyRefused("anthropic", 400, "no credit left");
          throw new Error("The Claude API account has no credit left. Add credit at console.anthropic.com.");
        }
        // not taken after all: this same call asks again as plain JSON, so one refused schema does not cost the turn
        if (useFormat && /schema|output_config|format|compil/i.test(e.message)) {
          tooHard.add(sent);
          console.warn(`[claude] ${a.name}: schema not taken, plain JSON from now on: ${e.message.slice(0, 160)}`);
          // v5 A6 (c): logged with the path the call now takes (the model and a code only)
          telemetry("claude_schema", { provider: "anthropic", model, why: "schema-refused", path: "json" });
          attempt--;
          continue;
        }
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        refusedKey(e);
        throw new Error(`The Claude API refused the key (${e.status}). Put a valid ANTHROPIC_API_KEY in .env.`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        ledger().cool("anthropic", model, COOL_BUSY_MS);
        // v5 A6 (c): a capacity failure (the next rung answers), never a refused key
        telemetry("fallback_429", { provider: "anthropic", model, status: 429, fallback: "next-rung" });
        throw new ClaudeBusyError(retryAfter(e, 20), "rate limited");
      }
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ClaudeBusyError(10, `no answer in ${Math.round(timeout / 1000)} s`);
      // 529 overloaded and other 5xx
      if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) throw new ClaudeBusyError(retryAfter(e, 15), `HTTP ${e.status}`);
      if (e instanceof Anthropic.APIConnectionError) throw new ClaudeBusyError(10, "connection failed");
      throw e;
    }
    keyWorks("anthropic");
    // v6: every billed response counts against the spend ceiling, whatever happens to its reply next
    recordClaude(res.model || model, res.usage);
    usage.input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
    // v5 A6 (c): a stop the reply cannot be trusted after is logged with the model and the reason only (never the text)
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") telemetry("claude_stop", { model, why: res.stop_reason });
    // a decline the fallback model declined too
    if (res.stop_reason === "refusal") { ev("refusal", res); throw new Error(`Claude declined ${a.name}${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`); }
    // a spoken turn never takes a reply that was cut off, even one that reads as a whole object: the next rung answers
    if (res.stop_reason === "max_tokens" && !a.role) { ev("max_tokens", res); throw new Error(`Claude's ${a.name} was cut off (max_tokens)`); }
    // only the answer's text: thinking and fallback markers are not part of it
    const raw = firstJson(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
    const answered = res;
    const done = (object: T): ClaudeJsonResult<T> => {
      ev("ok", answered);
      return { object, model, ms: Date.now() - t0, inputTokens: usage.input, outputTokens: usage.output, cacheReadTokens: usage.cacheRead, cacheWriteTokens: usage.cacheWrite, path: useFormat ? "format" : "json", stopReason: answered.stop_reason ?? null };
    };
    if (raw != null) {
      // the wire said "" or left a field out where the schema says null
      restore(raw, sch.undo);
      // v5 A7: a compact reply is checked as sent (an unknown slot key is off-schema, never dropped), then read back to the full plan
      const asSent = plan ? plan.schema.safeParse(raw) : null;
      const full = plan ? plan.toFull(raw) : raw;
      const ok = a.schema.safeParse(full);
      if (ok.success && (!asSent || asSent.success)) return done(ok.data);
      const loose = a.lenient?.safeParse(full);
      if (loose?.success) return done(loose.data);
      const issue = (asSent && !asSent.success ? asSent.error : ok.error)?.issues[0];
      lastIssue = `${issue?.path.join(".") || "(root)"}: ${issue?.message}`;
    } else {
      lastIssue = res.stop_reason === "max_tokens" ? "the reply was cut off" : "no JSON object";
    }
    ev("off_schema", res);
    console.warn(`[claude] ${a.name} ${model}: off-schema reply (${lastIssue})${attempt + 1 < attempts ? "; asking again" : ""}`);
  }
  throw new Error(`Claude's ${a.name} did not match its schema: ${lastIssue}`);
}

export interface ClaudeWarmResult { model: string; ms: number; maxTokens: number; inputTokens: number; cacheRead: number; cacheWrite: number; path: "format" | "json" }

/**
 * Write a planner prefix into the prompt cache before the first spoken turn needs it (mode-on). The request is built exactly as a
 * spoken turn's (requestBody: same system block and cache point, same thinking, effort and fallbacks) with a placeholder user
 * message. With no schema: max_tokens 0 (the API runs the prefill, writes the cache and returns no output; SDK 1.4's max_tokens
 * doc and the platform's pre-warming guide). With a schema that goes as structured outputs: max_tokens 0 is refused alongside
 * output_config.format, and the format changes the cached prompt, so the warm is a real call of 1 token with the same format.
 * A max_tokens 0 the API refuses is tried once with 1. Counted in the ledger (lane warm). null: no key, a refused key, no room in
 * Claude's day, or the call failed (never thrown: a warm-up never reaches a turn).
 */
export async function claudeWarm(w: { system: string; schema?: z.ZodTypeAny; model?: string; timeoutMs?: number }): Promise<ClaudeWarmResult | null> {
  if (!claudeConfigured()) return null;
  const model = w.model || claudeModel(), t0 = Date.now();
  const l = ledger();
  if (!l.room("anthropic", model, { tokens: Math.ceil(w.system.length / 3.5) }).ok) return null;
  // v5 A7: the format a spoken turn sends (the compact plan when JARVIS_PLAN_COMPACT=1), so the warm compiles and caches the same one
  const sent = w.schema ? compactFor(w.schema)?.schema ?? w.schema : undefined;
  const sch: Wire = sent ? outputSchema(sent) : { strict: null, shape: "", undo: null, unions: 0, optionals: 0, rewritten: false };
  const useFormat = !!sent && sch.strict != null && !tooHard.has(sent);
  // with no schema, the system block as the format path sends it; a schema asked for as plain JSON adds its shape line, as its turns do
  const mode = useFormat ? "format" : w.schema ? "json" : "bare";
  let maxTokens = useFormat ? 1 : 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tA = Date.now();
    const ev = (outcome: ClaudeOutcome, r?: Anthropic.Beta.BetaMessage) => heard({ name: "warm", model, outcome, ms: Date.now() - tA, path: useFormat ? "format" : "json", compact: sent !== w.schema, warm: true }, r);
    try {
      const body = requestBody({ system: w.system }, model, sch, mode, "warm", maxTokens);
      const res = await billed(model, body, (c) => c.beta.messages.create(body, { timeout: w.timeoutMs ?? 10_000 }), { warm: true }).catch((e: unknown) => { ev(outcomeOf(e)); throw e; });
      ev("ok", res);
      keyWorks("anthropic");
      recordClaude(res.model || model, res.usage);
      const u = res.usage;
      const input = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      l.record("anthropic", model, { tokens: input + u.output_tokens, lane: "warm" });
      const out: ClaudeWarmResult = { model, ms: Date.now() - t0, maxTokens, inputTokens: input, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, path: useFormat ? "format" : "json" };
      telemetry("warm", { provider: "anthropic", model, ms: out.ms, tokens: input + u.output_tokens, cacheRead: out.cacheRead, cacheWrite: out.cacheWrite, path: out.path, ok: true });
      return out;
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && maxTokens === 0 && attempt === 0 && /max_tokens/i.test(e.message)) { maxTokens = 1; continue; }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) refusedKey(e);
      else if (e instanceof Anthropic.RateLimitError) l.cool("anthropic", model, COOL_BUSY_MS);
      console.warn(`[claude] warm ${model} failed: ${(e as Error).message?.slice(0, 160)}`);
      telemetry("warm", { provider: "anthropic", model, ms: Date.now() - t0, ok: false, status: e instanceof Anthropic.APIError && typeof e.status === "number" ? e.status : undefined });
      return null;
    }
  }
  return null;
}

// ------------------------------------------------------------ v7: plain text, streamed --

export interface ClaudeTextArgs { name: string; system: string; prompt: string; maxOutputTokens: number; model?: string; timeoutMs?: number; abortSignal?: AbortSignal }
export interface ClaudeTextResult { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; ms: number; firstMs: number | null; stopReason: string | null }

/**
 * v7: Jarvis's answer writer on Claude (lib/thunai/aide7/stream.ts): one plain-text answer, streamed to `onText` as it comes. The same
 * rules as a planner call: JARVIS_CLAUDE_OFF stops it; the owner's spend ceiling holds (client(): no call past it; this call's margin is
 * held while it is out; a request sent and never answered is counted at its worst; every billed response is recorded); thinking disabled
 * on Haiku 5.5 at JARVIS_HAIKU_EFFORT; the fixed instructions are the system block with the cache point (byte-stable: the writer's
 * prompt has no per-turn text there), everything per turn in the user message. A refused key is remembered as for the planner; a 429
 * cools Claude and throws ClaudeBusyError (the ladder's next rung answers). A "refusal" stop throws after the text (the writer checks
 * every sentence anyway and speaks none it has not checked).
 */
export async function claudeStreamText(a: ClaudeTextArgs, onText: (t: string) => void): Promise<ClaudeTextResult> {
  if (claudeOff()) throw new Error("Claude is switched off (JARVIS_CLAUDE_OFF=1).");
  const model = a.model || claudeModel();
  const c = client();
  const effort: Effort = NO_THINK.test(model) ? haikuEffort() : "low";
  const body = {
    model, max_tokens: a.maxOutputTokens,
    system: [{ type: "text" as const, text: a.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: a.prompt }],
    output_config: { effort },
    ...thinkingFor(model, true, effort)
  };
  const t0 = Date.now();
  let firstMs: number | null = null;
  let res: Anthropic.Beta.BetaMessage;
  beginClaude();
  try {
    const stream = c.beta.messages.stream(body as never, { timeout: a.timeoutMs ?? 8000, signal: a.abortSignal });
    stream.on("text", (t: string) => { if (firstMs == null) firstMs = Date.now() - t0; onText(t); });
    res = (await stream.finalMessage()) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    // v7 review (Spend 1): only an HTTP error the API answered with (a status) bills nothing. Anything else went out and may have been
    // billed: an abort, a time-out, an error event mid-stream (overloaded_error after message_start comes as an APIError with no status),
    // a dropped connection. It is counted at its worst case, and the error carries that estimate (billedOf) for Jarvis's own day cap.
    const est: ClaudeBilled | null = e instanceof Anthropic.APIError && typeof e.status === "number" ? null
      : { model, inputTokens: Math.ceil(JSON.stringify(body).length / 3), outputTokens: body.max_tokens, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (est) recordEstimate(model, JSON.stringify(body).length, body.max_tokens);
    const fail = <E>(x: E): E => {
      if (est && x && typeof x === "object" && !(BILLED in x)) try { Object.defineProperty(x, BILLED, { value: est }); } catch { /* a frozen error: the dollars are counted all the same */ }
      return x;
    };
    heard({ name: a.name, model, outcome: a.abortSignal?.aborted ? "aborted" : outcomeOf(e), ms: Date.now() - t0, path: "json", compact: false, warm: false });
    if (a.abortSignal?.aborted) throw fail(e);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { refusedKey(e); throw new Error(`The Claude API refused the key (${e.status}).`); }
    if (e instanceof Anthropic.RateLimitError) { ledger().cool("anthropic", model, COOL_BUSY_MS); telemetry("fallback_429", { provider: "anthropic", model, status: 429, fallback: "next-rung" }); throw new ClaudeBusyError(retryAfter(e, 20), "rate limited"); }
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) { ledger().cool("anthropic", model, COOL_NO_CREDIT_MS); keyRefused("anthropic", 400, "no credit left"); throw new Error("The Claude API account has no credit left."); }
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw fail(new ClaudeBusyError(10, `no answer in ${Math.round((a.timeoutMs ?? 8000) / 1000)} s`));
    if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) throw new ClaudeBusyError(retryAfter(e, 15), `HTTP ${e.status}`);
    if (e instanceof Anthropic.APIConnectionError) throw fail(new ClaudeBusyError(10, "connection failed"));
    throw fail(e);
  } finally {
    endClaude();
  }
  keyWorks("anthropic");
  recordClaude(res.model || model, res.usage);
  heard({ name: a.name, model, outcome: res.stop_reason === "refusal" ? "refusal" : "ok", ms: Date.now() - t0, path: "json", compact: false, warm: false }, res);
  const u = res.usage;
  const out: ClaudeTextResult = { model: res.model || model, inputTokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, ms: Date.now() - t0, firstMs, stopReason: res.stop_reason ?? null };
  if (res.stop_reason === "refusal") { telemetry("claude_stop", { model, why: "refusal" }); throw Object.assign(new Error(`Claude declined ${a.name}`), { [BILLED]: { model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, cacheReadTokens: out.cacheReadTokens, cacheWriteTokens: out.cacheWriteTokens } }); }
  return out;
}
