/**
 * v5 A6 (b, c) on the wire, without the network: a fake client stands in for the SDK's (claude.ts reuses global.__claude while the key
 * is the same), and in the ladder tests a stub answers for Groq. No live call of any kind.
 *   (b) a Jarvis call on Haiku 5.5: thinking disabled always, effort from JARVIS_HAIKU_EFFORT (low; medium allowed; anything else low),
 *       the format, no sampling fields, no prefill, max_tokens 600, the system block with its cache point; the warm the same
 *   (c) 401/403: the key refused for 10 minutes, the ladder skips Claude at once; 429: next rung, logged as capacity; stop_reason
 *       refusal or max_tokens: next rung, logged (model and reason only); 400 "schema too complex": plain JSON, logged with its path
 */
import fs from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, type JsonCall, type JsonResult } from "@/lib/ai/gateway";
import { claudeConfigured, claudeJson, claudeModel, claudeWarm } from "./claude";
import { callLlm, resetLatency } from "@/lib/thunai/llm";
import { Ledger, MemoryStore, resetLedger } from "@/lib/thunai/ledger";

const KEY = "sk-ant-test-v5-000000";
const HAIKU = "claude-haiku-5-5";
type Json = Record<string, any>;
const usage = { input_tokens: 40, output_tokens: 30, cache_read_input_tokens: 1800, cache_creation_input_tokens: 0 };

/** the fake SDK client: every request body is kept; `reply` gives the message (or throws the API's error) */
function fake(reply: (body: Json, n: number) => unknown) {
  const bodies: Json[] = [];
  const create = vi.fn(async (body: Json) => { bodies.push(body); return reply(body, bodies.length); });
  global.__claude = { key: KEY, client: { beta: { messages: { create } } } as unknown as Anthropic };
  return bodies;
}
const message = (body: Json, text: string, stop = "end_turn") =>
  ({ model: body.model, stop_reason: stop, stop_details: stop === "refusal" ? { type: "refusal", category: "cyber" } : null, usage, content: [{ type: "text", text }] });

let dir = "";
const rows = () => (fs.existsSync(path.join(dir, "telemetry.ndjson")) ? fs.readFileSync(path.join(dir, "telemetry.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) : []);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-claude5-"));
  vi.stubEnv("THUNAI_DIR", dir);
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  for (const k of ["JARVIS_CLAUDE_MODEL", "JARVIS_CLAUDE_THINK", "JARVIS_HAIKU_EFFORT", "JARVIS_PLAN_COMPACT", "JARVIS_PLANNER_LEAD", "JARVIS_LADDER_PIN", "AI_CLAUDE_MODEL", "AI_CLAUDE_MODEL_FAST", "AI_CLAUDE_EFFORT"]) vi.stubEnv(k, "");
  resetLedger();
  resetLatency();
});
afterEach(() => {
  vi.useRealTimers();
  global.__claude = undefined; global.__claudeRefused = undefined; global.__keyProblems?.clear();
  vi.unstubAllEnvs();
  resetLedger();
});

const S = z.object({ ok: z.boolean() });
const SYSTEM = "A long, fixed system prompt.";
const ask = (over: Partial<Parameters<typeof claudeJson>[0]> = {}) => claudeJson({ name: "jarvis_screens0", schema: S, system: SYSTEM, prompt: "Said: \"x\"", maxOutputTokens: 500, ...over });

describe("A6 (b): the request a Jarvis call sends to Haiku 5.5", () => {
  it("Haiku 5.5 by default: thinking disabled, effort low, the format, no sampling fields or prefill, max_tokens 600, the cache point", async () => {
    const bodies = fake((b) => message(b, '{"ok":true}'));
    await ask();
    const b = bodies[0];
    expect(b.model).toBe(HAIKU);
    expect(b.thinking).toEqual({ type: "disabled" });
    expect(b.output_config.effort).toBe("low");
    expect(b.output_config.format.type).toBe("json_schema");
    for (const k of ["temperature", "top_p", "top_k"]) expect(b[k]).toBeUndefined();
    expect(b.messages.every((m: Json) => m.role === "user")).toBe(true);
    expect(b.max_tokens).toBe(600);
    expect(b.system).toEqual([{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }]);
    // Haiku 5.5 has no server-side fallback
    expect(b.fallbacks).toBeUndefined();
  });

  it("JARVIS_HAIKU_EFFORT: medium is kept; max, xhigh, high and anything else fall back to low; thinking stays disabled", async () => {
    const want: Record<string, string> = { medium: "medium", MEDIUM: "medium", low: "low", max: "low", xhigh: "low", high: "low", fast: "low", "": "low" };
    for (const [v, effort] of Object.entries(want)) {
      vi.stubEnv("JARVIS_HAIKU_EFFORT", v);
      const bodies = fake((b) => message(b, '{"ok":true}'));
      await ask();
      expect(bodies[0].output_config.effort, `JARVIS_HAIKU_EFFORT=${v}`).toBe(effort);
      expect(bodies[0].thinking, `JARVIS_HAIKU_EFFORT=${v}`).toEqual({ type: "disabled" });
    }
  });

  it("JARVIS_CLAUDE_THINK=1 no longer turns thinking on for Haiku's voice lane", async () => {
    vi.stubEnv("JARVIS_CLAUDE_THINK", "1");
    const bodies = fake((b) => message(b, '{"ok":true}'));
    await ask();
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
  });

  it("a caller that asks for more output than 600 still gets it (a mission plan asks for 700)", async () => {
    const bodies = fake((b) => message(b, '{"ok":true}'));
    await ask({ maxOutputTokens: 700 });
    expect(bodies[0].max_tokens).toBe(700);
  });

  it("Opus 5.5, only by explicit JARVIS_CLAUDE_MODEL, is never sent thinking disabled (it answers 400), whatever the other flags say", async () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "claude-opus-5-5");
    for (const [think, effort] of [["", ""], ["1", "medium"], ["", "max"]]) {
      vi.stubEnv("JARVIS_CLAUDE_THINK", think);
      vi.stubEnv("JARVIS_HAIKU_EFFORT", effort);
      const bodies = fake((b) => message(b, '{"ok":true}'));
      await ask();
      expect(bodies[0].model).toBe("claude-opus-5-5");
      expect(bodies[0].thinking).toBeUndefined();
      expect(bodies[0].output_config.effort).toBe("low");
    }
  });

  it("no Sonnet by default: Jarvis's model is Haiku 5.5, the console's is Opus 5.5", () => {
    expect(claudeModel()).toBe(HAIKU);
    expect(claudeModel("fast")).toBe("claude-opus-5-5");
    expect(claudeModel("reasoning")).toBe("claude-opus-5-5");
  });

  it("a console step on Haiku (a role) keeps its own settings: no thinking field, its own effort and room", async () => {
    vi.stubEnv("AI_CLAUDE_MODEL_FAST", HAIKU);
    vi.stubEnv("JARVIS_HAIKU_EFFORT", "medium");
    const bodies = fake((b) => message(b, '{"ok":true}'));
    await ask({ role: "fast" });
    expect(bodies[0].model).toBe(HAIKU);
    expect(bodies[0].thinking).toBeUndefined();
    expect(bodies[0].output_config.effort).toBe("low");
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(4000);
  });

  it("the warm sends the same format, thinking and effort as a spoken turn (JARVIS_HAIKU_EFFORT=medium)", async () => {
    vi.stubEnv("JARVIS_HAIKU_EFFORT", "medium");
    const bodies = fake((b) => message(b, '{"ok":true}'));
    await claudeWarm({ system: SYSTEM, schema: S });
    await ask();
    const [w, turn] = bodies;
    expect(w.max_tokens).toBe(1);
    expect(JSON.stringify(w.output_config)).toBe(JSON.stringify(turn.output_config));
    expect(w.output_config.effort).toBe("medium");
    expect(w.thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(w.thinking)).toBe(JSON.stringify(turn.thinking));
    expect(JSON.stringify(w.system)).toBe(JSON.stringify(turn.system));
  });
});

// ---- (c) the ladder with Claude first (JARVIS_PLANNER_LEAD=haiku, the default) and a stub for Groq

const fresh = () => new Ledger(new MemoryStore());
const base = () => ({ name: "jarvis_screens0", system: "s", prompt: "p", schema: S, maxOutputTokens: 500, user: "u", lane: "planner" as const, until: Date.now() + 8000 });
/** Claude through the real gateway (and so claude.ts and the fake client); any other rung answers at once, as Groq would */
function stub(asked: string[]) {
  return (async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    if (c.only?.provider === "anthropic") return generateJson(c);
    const m = c.only!.models[0];
    asked.push(`${c.only!.provider}/${m}`);
    return { object: { ok: true } as U, info: { step: c.name, provider: c.only!.provider, model: m, ms: 5, inputTokens: 100, outputTokens: 20, attempts: 1 } as never };
  }) as never;
}
const deps = (asked: string[]) => ({ generate: stub(asked), ledger: fresh(), bedrockOk: () => false, claudeOk: claudeConfigured });
const authError = () => new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());

describe("A6 (c): failures on the Claude rung", () => {
  it("a 401 skips Claude at once; a second turn inside 10 minutes makes no Claude call; after 10 minutes one call tries again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-11-20T10:00:00+05:30").getTime();
    vi.setSystemTime(t0);
    let claudeCalls = 0;
    fake(() => { claudeCalls++; throw authError(); });
    const asked: string[] = [];
    const first = await callLlm(base(), deps(asked));
    expect(claudeCalls).toBe(1);
    expect(first?.model).toBe("qwen/qwen3.8-27b");
    expect(first?.hops[0]).toBe(`anthropic/${HAIKU}:failed`);
    expect(claudeConfigured()).toBe(false);

    vi.setSystemTime(t0 + 5 * 60_000);
    const second = await callLlm(base(), deps(asked));
    expect(claudeCalls).toBe(1);
    expect(second?.hops).toEqual(["groq/qwen/qwen3.8-27b"]);

    vi.setSystemTime(t0 + 9 * 60_000 + 59_000);
    await callLlm(base(), deps(asked));
    expect(claudeCalls).toBe(1);

    vi.setSystemTime(t0 + 10 * 60_000 + 1000);
    expect(claudeConfigured()).toBe(true);
    const later = await callLlm(base(), deps(asked));
    expect(claudeCalls).toBe(2);
    // refused again: another 10 minutes
    expect(later?.model).toBe("qwen/qwen3.8-27b");
    expect(claudeConfigured()).toBe(false);
  });

  it("a 403 is a refused key too, for 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-11-20T11:00:00+05:30").getTime();
    vi.setSystemTime(t0);
    fake(() => { throw new Anthropic.PermissionDeniedError(403, { type: "error", error: { type: "permission_error", message: "forbidden" } }, "forbidden", new Headers()); });
    await expect(ask()).rejects.toThrow(/refused the key/);
    expect(claudeConfigured()).toBe(false);
    vi.setSystemTime(t0 + 10 * 60_000 + 1);
    expect(claudeConfigured()).toBe(true);
  });

  it("a 429 goes to the next rung at once and is logged as capacity (fallback_429), not as a refused key", async () => {
    fake(() => { throw new Anthropic.RateLimitError(429, {}, "rate limited", new Headers({ "retry-after": "7" })); });
    const asked: string[] = [];
    const r = await callLlm(base(), deps(asked));
    expect(r?.model).toBe("qwen/qwen3.8-27b");
    expect(asked[0]).toBe("groq/qwen/qwen3.8-27b");
    expect(claudeConfigured()).toBe(true);
    expect(rows().find((x) => x.event === "fallback_429")).toMatchObject({ provider: "anthropic", model: HAIKU, status: 429 });
  });

  for (const [stop, text] of [["refusal", ""], ["max_tokens", '{"ok":tr'], ["max_tokens", '{"ok":true}']] as const) {
    it(`stop_reason ${stop}${text === '{"ok":true}' ? " (even with a whole object)" : ""}: the first Groq rung answers; logged with the model and the reason only`, async () => {
      fake((b) => message(b, text, stop));
      const asked: string[] = [];
      const r = await callLlm(base(), deps(asked));
      expect(r?.model).toBe("qwen/qwen3.8-27b");
      expect(asked).toEqual(["groq/qwen/qwen3.8-27b"]);
      const ev = rows().filter((x) => x.event === "claude_stop");
      expect(ev.length).toBe(1);
      // nothing but the time, the event, the model and the reason: never the reply or the prompt
      expect(Object.keys(ev[0]).sort()).toEqual(["at", "event", "model", "why"]);
      expect(ev[0]).toMatchObject({ model: HAIKU, why: stop });
    });
  }

  it("a 400 for a schema too complex: the same call asks again as plain JSON, logged with its path", async () => {
    const Big = z.object({ answer: z.string(), n: z.number() });
    const bodies = fake((b, n) => {
      if (n === 1) throw new Anthropic.BadRequestError(400, { type: "invalid_request_error", message: "output_config.format.schema: the schema is too complex" }, undefined, new Headers());
      return message(b, '{"answer":"ok","n":2}');
    });
    const r = await ask({ schema: Big });
    expect(r.path).toBe("json");
    expect(bodies[1].output_config.format).toBeUndefined();
    expect(rows().find((x) => x.event === "claude_schema")).toMatchObject({ model: HAIKU, path: "json" });
  });
});
