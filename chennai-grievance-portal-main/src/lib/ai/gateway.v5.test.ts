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
