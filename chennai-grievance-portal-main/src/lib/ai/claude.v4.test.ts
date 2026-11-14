/**
 * v4 defect 11 and the Claude settings, on the wire, without the network (a fake client stands in for the SDK's; claude.ts reuses
 * global.__claude while the key is the same).
 *   - Structured outputs refuse a request whose strict schemas hold more than 16 parameters with union types (anyOf, or a type list
 *     such as ["string","null"]) or more than 24 optional parameters (platform docs, "Schema complexity limits", read 15 Nov 2026).
 *     The planner's Screen alone has 17 nullable fields, so every planner bundle used to fall back to plain JSON, silently.
 *   - Opus 5.5 keeps adaptive thinking (no `thinking` field) at effort low; Sonnet 5.5 turns it off only with between_tools;
 *     Haiku 5.5 with disabled. No temperature, top_p, top_k, no prefill.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodSchema } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as claude from "./claude";
import { claudeJson } from "./claude";
import { Call, Screen } from "@/lib/thunai/agent";
import { AiStep } from "@/lib/thunai/plan";

// round.ts is another lane's file: read its SCHEMAS when it exports them, without letting a half-edited round.ts stop this file
const round = await import("@/lib/thunai/round").catch(() => ({}));

const led = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/thunai/ledger", () => ({ ledger: () => ({ cool: vi.fn(), coolingUntil: () => 0, record: (...a: unknown[]) => led.rows.push(a), room: () => ({ ok: true }) }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: vi.fn() }));

const KEY = "sk-ant-test-v4-000000";
type Json = Record<string, any>;

// ---- the planner's schemas, as round.ts builds them (SCHEMAS is module-private there; when it is exported, the test uses it too)
const base = { kind: z.enum(["do", "clarify", "chat", "general", "refuse", "other"]), lang: z.enum(["en", "ta"]), reply: z.string().nullable(), options: z.array(z.object({ label: z.string(), request: z.string() })).max(3) };
const StageOpS = z.object({ op: z.enum(["open", "draft", "read", "next", "prev", "stop", "filter", "sort", "view", "pin", "export", "save", "close", "explain", "map"]), n: z.number().int().nullable(), text: z.string().nullable() }).nullable();
const BUNDLES: Record<string, z.ZodTypeAny> = {
  screens: z.object({ ...base, screen: Screen.nullable() }),
  console: z.object({ ...base, steps: z.array(AiStep).max(6) }),
  stage: z.object({ ...base, stage: StageOpS, screen: Screen.nullable() }),
  data: z.object({ ...base, calls: z.array(Call).max(3), done: z.boolean(), say: z.string().nullable(), screen: Screen.nullable() }),
  memory: z.object({ ...base, steps: z.array(AiStep).max(4), stage: StageOpS }),
  wide: z.object({ ...base, screen: Screen.nullable(), steps: z.array(AiStep).max(6), stage: StageOpS })
};
// v4 Pillar 1 gives every bundle `calls` (lane L2): the widest the planner can get
const WITH_CALLS = Object.fromEntries(Object.entries(BUNDLES).map(([k, s]) => [`${k}+calls`, (s as z.AnyZodObject).extend({ calls: z.array(Call).max(3), done: z.boolean(), say: z.string().nullable() })]));
const exported = (round as unknown as { SCHEMAS?: Record<string, z.ZodTypeAny> }).SCHEMAS ?? {};
const ALL: Record<string, z.ZodTypeAny> = { ...BUNDLES, ...WITH_CALLS, ...Object.fromEntries(Object.entries(exported).map(([k, s]) => [`round.SCHEMAS.${k}`, s])) };

/** parameters with a union type (anyOf or a type list), counted as the platform counts them, independently of claude.ts */
function unions(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + unions(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Json;
  return (Array.isArray(o.type) || Array.isArray(o.anyOf) ? 1 : 0) + Object.values(o).reduce((n: number, x) => n + unions(x), 0);
}
/** optional parameters: properties not listed in `required` */
function optionals(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + optionals(x), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Json;
  const own = o.properties && typeof o.properties === "object" ? Object.keys(o.properties).filter((k) => !(o.required ?? []).includes(k)).length : 0;
  return own + Object.values(o).reduce((n: number, x) => n + optionals(x), 0);
}

const usage = { input_tokens: 40, output_tokens: 30, cache_read_input_tokens: 1800, cache_creation_input_tokens: 120 };
function fake(reply: (body: Json) => unknown) {
  const bodies: Json[] = [];
  const create = vi.fn(async (body: Json) => { bodies.push(body); return { model: body.model, stop_reason: "end_turn", stop_details: null, usage, content: [{ type: "text", text: JSON.stringify(reply(body)) }] }; });
  global.__claude = { key: KEY, client: { beta: { messages: { create } } } as unknown as Anthropic };
  return bodies;
}

/** a reply as structured outputs would write it on the rewritten schema: "" for a string left empty, numbers left out */
function blankReply(s: Json): unknown {
  if (s.anyOf) return blankReply(s.anyOf.find((b: Json) => b.type !== "null"));
  if (s.type === "object") return Object.fromEntries(Object.entries(s.properties ?? {}).filter(([k]) => (s.required ?? []).includes(k)).map(([k, v]) => [k, blankReply(v as Json)]));
  if (s.type === "array") return [];
  if (s.type === "boolean") return false;
  if (s.type === "integer" || s.type === "number") return 1;
  if (s.enum) return s.enum.includes("") ? "" : s.enum[0];
  return "";
}

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", KEY); vi.stubEnv("JARVIS_CLAUDE_MODEL", ""); vi.stubEnv("JARVIS_CLAUDE_THINK", ""); led.rows.length = 0; });
afterEach(() => { global.__claude = undefined; global.__claudeRefused = undefined; global.__keyProblems?.clear(); vi.unstubAllEnvs(); });

describe("v4 defect 11: structured outputs apply to every planner schema", () => {
  it("counts the unions: Screen has 17 nullable fields, every planner bundle is over the API's 16", () => {
    expect(unions(zodSchema(Screen).jsonSchema)).toBe(17);
    for (const [name, s] of Object.entries(BUNDLES)) expect(unions(zodSchema(s as never).jsonSchema), name).toBeGreaterThan(16);
  });

  for (const [name, schema] of Object.entries(ALL)) {
    it(`${name}: sent with output_config.format, within 16 unions and 24 optional parameters, and the reply reads back`, async () => {
      const bodies = fake((b) => blankReply(b.output_config.format.schema));
      const r = await claudeJson({ name: `jarvis_${name}`, schema: schema as z.ZodType<unknown, z.ZodTypeDef, unknown>, system: "Plan.", prompt: "Said: \"x\"" });
      const sent = bodies[0].output_config?.format?.schema;
      expect(sent, "no format: the schema fell back to plain JSON").toBeTruthy();
      expect(unions(sent)).toBeLessThanOrEqual(16);
      expect(optionals(sent)).toBeLessThanOrEqual(24);
      expect(r.path).toBe("format");
      // "" and a left-out number come back as null, and the reply passes the real schema
      expect(schema.safeParse(r.object).success).toBe(true);
    });
  }

  it("puts null back where the wire said \"\" or left a number out", async () => {
    fake(() => ({ kind: "do", lang: "en", reply: "", options: [], screen: { recipe: "cases", period: "", zones: [5], dept: "", depts: [], cat: "SOLID_WASTE", taluk: "", sev: "Severe", status: "", q: "", metric: "", measure: "", by: "", order: "", id: "", name: "", what: "", sort: "" } }));
    const r = await claudeJson({ name: "jarvis_screens0", schema: BUNDLES.screens as z.ZodType<Json, z.ZodTypeDef, unknown>, system: "Plan.", prompt: "p" });
    expect(r.object.reply).toBeNull();
    expect(r.object.screen).toMatchObject({ recipe: "cases", period: null, n: null, item: null, sev: "Severe", cat: "SOLID_WASTE", zones: [5], q: null });
  });

  it("a schema still too big after the rewrite goes as plain JSON from the start, and says so", async () => {
    const S = z.object(Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`f${i}`, z.number().nullable()])));
    const bodies = fake(() => Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`f${i}`, null])));
    const r = await claudeJson({ name: "big", schema: S, system: "s", prompt: "p" });
    expect(bodies[0].output_config.format).toBeUndefined();
    expect(r.path).toBe("json");
  });
});

describe("Claude settings per model (rule 7) and the prompt cache", () => {
  const S = z.object({ ok: z.boolean() });
  const ask = () => claudeJson({ name: "t", schema: S, system: "A long, fixed system prompt.", prompt: "Said: \"what changed today\" at 10:42" });

  it("Opus 5.5: effort low, adaptive thinking left on (no thinking field), no sampling fields, no prefill", async () => {
    const bodies = fake(() => ({ ok: true }));
    await ask();
    const b = bodies[0];
    expect(b.model).toBe("claude-opus-5-5");
    expect(b.output_config.effort).toBe("low");
    expect(b.thinking).toBeUndefined();
    for (const k of ["temperature", "top_p", "top_k"]) expect(b[k]).toBeUndefined();
    expect(b.messages.every((m: Json) => m.role === "user")).toBe(true);
  });

  it("Sonnet 5.5: thinking off only through between_tools, at effort low", async () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "claude-sonnet-5-5");
    const bodies = fake(() => ({ ok: true }));
    await ask();
    expect(bodies[0].thinking).toEqual({ type: "between_tools" });
    expect(bodies[0].output_config.effort).toBe("low");
  });

  it("Haiku 5.5: thinking disabled, at effort low", async () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "claude-haiku-5-5");
    const bodies = fake(() => ({ ok: true }));
    await ask();
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    expect(bodies[0].output_config.effort).toBe("low");
  });

  it("the per-turn prompt sits after the cache point: the system block is the fixed text alone, and the cache reads and writes come back", async () => {
    const bodies = fake(() => ({ ok: true }));
    const r = await ask();
    expect(bodies[0].system).toEqual([{ type: "text", text: "A long, fixed system prompt.", cache_control: { type: "ephemeral" } }]);
    expect(JSON.stringify(bodies[0].system)).not.toContain("10:42");
    expect(r.cacheReadTokens).toBe(1800);
    expect(r.cacheWriteTokens).toBe(120);
  });
});

describe("pre-warming the planner's cache", () => {
  type Warm = (a: { system: string; schema?: z.ZodTypeAny; lane?: string }) => Promise<{ maxTokens: number; cacheWrite: number; cacheRead: number } | null>;
  const warm = () => (claude as unknown as { claudeWarm: Warm }).claudeWarm;

  it("without a schema: max_tokens 0, the very same system block, thinking and effort as a spoken turn; counted in the ledger", async () => {
    const bodies = fake(() => ({ ok: true }));
    const w = await warm()({ system: "Planner system." });
    await claudeJson({ name: "t", schema: z.object({ ok: z.boolean() }), system: "Planner system.", prompt: "p" });
    const [wb, real] = bodies;
    expect(wb.max_tokens).toBe(0);
    expect(wb.output_config.format).toBeUndefined();
    expect(wb.system).toEqual([{ type: "text", text: "Planner system.", cache_control: { type: "ephemeral" } }]);
    expect(wb.system[0].text).toBe(real.system[0].text);
    expect(wb.thinking).toEqual(real.thinking);
    expect(wb.output_config.effort).toBe(real.output_config.effort);
    expect(w?.maxTokens).toBe(0);
    expect(led.rows.length).toBe(1);
  });

  it("with the planner's schema: the same output_config as the real call (format cannot go with max_tokens 0, so max_tokens 1)", async () => {
    const bodies = fake((b) => blankReply(b.output_config.format?.schema ?? { type: "object" }));
    await warm()({ system: "Planner system.", schema: BUNDLES.screens });
    await claudeJson({ name: "t", schema: BUNDLES.screens as z.ZodType<unknown, z.ZodTypeDef, unknown>, system: "Planner system.", prompt: "p" });
    const [wb, real] = bodies;
    expect(wb.max_tokens).toBe(1);
    expect(JSON.stringify(wb.output_config)).toBe(JSON.stringify(real.output_config));
    expect(JSON.stringify(wb.system)).toBe(JSON.stringify(real.system));
  });

  it("no key, or a refused one: nothing is sent", async () => {
    const bodies = fake(() => ({ ok: true }));
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await warm()({ system: "s" })).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", KEY);
    global.__claudeRefused = { key: KEY, reason: "key not accepted" };
    expect(await warm()({ system: "s" })).toBeNull();
    expect(bodies.length).toBe(0);
  });

  it("a 401 on the warm marks the key refused, so the ladder skips Claude at once", async () => {
    global.__claude = { key: KEY, client: { beta: { messages: { create: async () => { throw new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", new Headers()); } } } } as unknown as Anthropic };
    expect(await warm()({ system: "s" })).toBeNull();
    expect(claude.claudeConfigured()).toBe(false);
  });
});
