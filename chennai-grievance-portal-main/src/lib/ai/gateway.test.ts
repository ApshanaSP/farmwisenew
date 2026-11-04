import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ledger } from "@/lib/thunai/ledger";
import { generateJson, type JsonCall } from "./gateway";

const S = z.object({ ok: z.boolean() });
const call = (model: string, over: Partial<JsonCall<{ ok: boolean }>> = {}): JsonCall<{ ok: boolean }> => ({ role: "fast", name: "t", schema: S, system: "s".repeat(350), prompt: "p", temperature: 0, maxOutputTokens: 100, user: "u", lane: "planner", timeoutMs: 4000, only: { provider: "groq", models: [model] }, ...over });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const limited = (retryAfter?: number) => json(429, { error: { message: "Rate limit reached", type: "tokens" } }, retryAfter ? { "retry-after": String(retryAfter) } : {});

/** every request the provider got, with its key and model; `answer` says what comes back */
function provider(answer: (model: string) => Response) {
  const asked: { key: string; model: string }[] = [];
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model as string;
    asked.push({ key: new Headers(init.headers).get("authorization") ?? "", model });
    return answer(model);
  });
  return asked;
}

describe("the gateway under a rate limit", () => {
  beforeEach(() => {
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-gw-")));
    vi.stubEnv("GROQ_API_KEY", "k1"); vi.stubEnv("GROQ_API_KEY_2", "k2"); vi.stubEnv("GROQ_API_KEY_3", "k3");
    vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("a 429 is the organisation's: the other pooled keys are not asked in the same call", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/org");
    const asked = provider(() => limited());
    await expect(generateJson(call("test/org"))).rejects.toThrow();
    expect(asked.length).toBe(1);
  });
  it("the wait for a model that frees up stays inside the models the caller named", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/near,test/far");
    // test/near cools for about 2 s, with no time left to wait for it
    provider(() => limited(1));
    await expect(generateJson(call("test/near", { timeoutMs: 500 }))).rejects.toThrow();
    // test/far cools for 2 minutes: nothing to wait for, and test/near is not this call's to spend
    const asked = provider(() => limited(120));
    await expect(generateJson(call("test/far"))).rejects.toThrow();
    expect(asked.map((x) => x.model)).toEqual(["test/far"]);
  });
  it("an accepted failed draft still counts: the turn's tokens, and the ledger", async () => {
    vi.stubEnv("AI_MODEL_FAST", "test/draft");
    provider(() => json(400, { error: { message: "Failed to generate JSON", type: "invalid_request_error", code: "json_validate_failed", failed_generation: "{\"ok\":true}" } }));
    const before = ledger().spent("groq", "test/draft", 60_000);
    const r = await generateJson(call("test/draft"));
    expect(r.object).toEqual({ ok: true });
    expect(r.info.inputTokens).toBeGreaterThan(100);
    const after = ledger().spent("groq", "test/draft", 60_000);
    expect(after.requests).toBe(before.requests + 1);
    expect(after.tokens).toBe(before.tokens + r.info.inputTokens);
  });
});
