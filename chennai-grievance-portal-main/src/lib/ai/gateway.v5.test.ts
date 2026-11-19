import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, onAttempt, type AttemptEvent, type JsonCall } from "./gateway";

const S = z.object({ ok: z.boolean() });
const call = (model: string, over: Partial<JsonCall<{ ok: boolean }>> = {}): JsonCall<{ ok: boolean }> => ({ role: "fast", name: "t", schema: S, system: "s".repeat(350), prompt: "p", temperature: 0, maxOutputTokens: 100, user: "u", lane: "eval", timeoutMs: 4000, only: { provider: "groq", models: [model] }, ...over });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const done = (model: string, cached: number | null) => json(200, {
  id: "x", object: "chat.completion", created: 1, model,
  choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940, ...(cached != null ? { prompt_tokens_details: { cached_tokens: cached } } : {}) }
}, { "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "7060", "x-ratelimit-limit-requests": "1000", "x-request-id": "not-kept" });

function provider(answer: (model: string) => Response) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => { const model = JSON.parse(String(init.body)).model as string; asked.push(model); return answer(model); });
  return asked;
}

describe("A5: a strict-mode 400 is a schema failure: one retry on the same model, then the next model", () => {
  let events: AttemptEvent[] = [];
  let stop = () => {};
  beforeEach(() => {
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-gw5a5-")));
    vi.stubEnv("GROQ_API_KEY", "k1"); vi.stubEnv("GROQ_API_KEY_2", "k2"); vi.stubEnv("GROQ_API_KEY_3", "k3");
    vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", "");
    events = [];
    stop = onAttempt((e) => events.push(e));
  });
  afterEach(() => { stop(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const jvf = (draft?: string) => json(400, { error: { message: "Failed to generate JSON. Please adjust your prompt.", type: "invalid_request_error", code: "json_validate_failed", ...(draft ? { failed_generation: draft } : {}) } });

  it("no usable draft: the same model is asked once more, its other pooled keys are not, and the next model answers", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/strict,test/next");
    const asked = provider((m) => (m === "test/strict" ? jvf() : done(m, null)));
    const r = await generateJson(call("test/strict", { only: { provider: "groq", models: ["test/strict", "test/next"] } }));
    expect(r.info.model.split("#")[0]).toBe("test/next");
    expect(asked).toEqual(["test/strict", "test/strict", "test/next"]);
    expect(events.filter((e) => e.outcome === "json_validate_failed")).toHaveLength(2);
    expect(events.some((e) => e.outcome === "rate_limited" || e.outcome === "busy")).toBe(false);
  });

  it("a ladder rung pins one model: a strict-mode 400 costs it two calls at most, never one a pooled key (production shape)", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/rung");
    const asked = provider(() => jvf());
    await expect(generateJson(call("test/rung"))).rejects.toThrow();
    expect(asked).toEqual(["test/rung", "test/rung"]);
    const asked2 = provider(() => jvf("{\"ok\":\"not a boolean\"}"));
    await expect(generateJson(call("test/rung"))).rejects.toThrow();
    expect(asked2).toEqual(["test/rung", "test/rung"]);
  });

  it("a draft our schema refuses too: the same, one retry and then the next model", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/bad,test/next");
    const asked = provider((m) => (m === "test/bad" ? jvf("{\"ok\":\"not a boolean\"}") : done(m, null)));
    await generateJson(call("test/bad", { only: { provider: "groq", models: ["test/bad", "test/next"] } }));
    expect(asked).toEqual(["test/bad", "test/bad", "test/next"]);
  });
});

describe("the per-attempt record (v5 6.2 and A2 b)", () => {
  let events: AttemptEvent[] = [];
  let stop = () => {};
  beforeEach(() => {
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-gw5-")));
    vi.stubEnv("GROQ_API_KEY", "k1");
    vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", "");
    events = [];
    stop = onAttempt((e) => events.push(e));
  });
  afterEach(() => { stop(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("a Groq answer carries its cached input tokens, and the attempt its rate-limit headers (and no other header)", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/cache");
    provider((m) => done(m, 512));
    const r = await generateJson(call("test/cache"));
    expect(r.info.cacheReadTokens).toBe(512);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "ok", model: "test/cache", inputTokens: 900, outputTokens: 40, cachedTokens: 512 });
    expect(events[0].rateHeaders).toEqual({ "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "7060", "x-ratelimit-limit-requests": "1000" });
  });

  it("no cache reported: no cached count is made up", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/nocache");
    provider((m) => done(m, null));
    const r = await generateJson(call("test/nocache"));
    expect(r.info.cacheReadTokens).toBeUndefined();
    expect(events[0].cachedTokens).toBeUndefined();
  });

  it("a 429 is recorded as rate_limited, a strict-mode 400 as json_validate_failed", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/limited");
    provider(() => json(429, { error: { message: "Rate limit reached", type: "tokens" } }, { "retry-after": "90" }));
    await expect(generateJson(call("test/limited"))).rejects.toThrow();
    expect(events.map((e) => e.outcome)).toEqual(["rate_limited"]);
    expect(events[0].rateHeaders).toEqual({ "retry-after": "90" });
    events.length = 0;
    vi.stubEnv("AI_MODEL_FAST", "test/strict");
    provider(() => json(400, { error: { message: "Failed to generate JSON", type: "invalid_request_error", code: "json_validate_failed" } }));
    await expect(generateJson(call("test/strict"))).rejects.toThrow();
    expect(events[0].outcome).toBe("json_validate_failed");
  });
});

// v5 final run (16 Nov): with every Groq rung out of its minute, the ladder's last rung (gemini-3.5-flash-lite) refused the wide planner
// schema with 400 "too many states", which the gateway did not read as a schema it cannot take, so no model answered
describe("Gemini refusing a schema as too complex ('too many states'): asked again with the schema as instructions", () => {
  beforeEach(() => {
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-gw5-gem-")));
    vi.stubEnv("GEMINI_API_KEY", "g1");
    vi.stubEnv("AI_PROVIDER", "gemini"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("the second request carries no response schema and its plain JSON reply is used", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(b);
      const gc = (b.generationConfig ?? {}) as Record<string, unknown>;
      if (gc.responseSchema || gc.responseJsonSchema) return json(400, { error: { code: 400, message: "The specified schema produces a constraint that has too many states for serving. Typical causes of this error are schemas with lots of text.", status: "INVALID_ARGUMENT" } });
      return json(200, { candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }], role: "model" }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5, totalTokenCount: 55 } });
    });
    const r = await generateJson(call("gemini-3.5-flash-lite", { only: { provider: "gemini", models: ["gemini-3.5-flash-lite"] } }));
    expect(r.object).toEqual({ ok: true });
    expect(bodies.length).toBe(2);
  });
});
