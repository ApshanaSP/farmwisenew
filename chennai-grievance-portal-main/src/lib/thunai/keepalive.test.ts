/**
 * Jarvis v5 E3 (JARVIS_V5_BUILD_2 section 8, Phase 5): the warm connection to Groq, JARVIS_KEEPALIVE.
 *   - keepalive.ts's fetch is npm undici's own fetch, given undici's own Agent as its dispatcher (never the built-in fetch with an
 *     npm Agent), and that Agent has keepAliveTimeout 60 s and keepAliveMaxTimeout 600 s;
 *   - JARVIS_KEEPALIVE=1: stt.ts's Whisper requests and gateway.ts's Groq chat calls go through it;
 *   - JARVIS_KEEPALIVE=0: the built-in fetch is used, looked up at call time (so a test's stubbed fetch still sees every call).
 * No network: undici's fetch is replaced by a fake that records its calls. Sentences are invented.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ calls: [] as { url: string; init: Record<string, unknown> }[], answer: null as null | ((url: string, init: Record<string, unknown>) => Response) }));
vi.mock("undici", async (importOriginal) => {
  const real = await importOriginal<typeof import("undici")>();
  return {
    ...real,
    fetch: vi.fn(async (url: string, init: Record<string, unknown>) => {
      seen.calls.push({ url: String(url), init });
      return seen.answer ? seen.answer(String(url), init) : new Response("{}", { status: 200 });
    })
  };
});

import { Agent } from "undici";
import { groqFetch, KEEPALIVE_OPTIONS, keepAliveAgent, keepAliveOn, warmFetch } from "./keepalive";
import { resetLedger } from "./ledger";
import { hearUtterance } from "./stt";
import { generateJson } from "@/lib/ai/gateway";
import { z } from "zod";

const optionsOf = (a: Agent): Record<string, unknown> => {
  const sym = Object.getOwnPropertySymbols(a).find((s) => s.description === "options");
  return sym ? ((a as unknown as Record<symbol, Record<string, unknown>>)[sym] ?? {}) : {};
};
const wav = () => { const b = new ArrayBuffer(44 + 32000), v = new DataView(b); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); return b; };
const whisper = (url: string, init: Record<string, unknown>) => {
  const en = (init.body as FormData).get("language") === "en";
  void url;
  return new Response(JSON.stringify({ text: en ? "show the drain status" : "ஷோ", duration: 1, segments: [{ avg_logprob: en ? -0.1 : -1.4, no_speech_prob: 0.01, compression_ratio: 1.2 }] }), { status: 200 });
};
const chat = () => new Response(JSON.stringify({
  id: "x", object: "chat.completion", created: 1, model: "test/ka",
  choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }
}), { status: 200, headers: { "content-type": "application/json" } });
const S = z.object({ ok: z.boolean() });
const call = () => ({ role: "fast" as const, name: "t", schema: S, system: "s".repeat(350), prompt: "p", temperature: 0, maxOutputTokens: 50, user: "u", lane: "eval" as const, timeoutMs: 4000, only: { provider: "groq" as const, models: ["test/ka"] } });

beforeEach(() => {
  seen.calls.length = 0; seen.answer = null;
  vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-ka-")));
  vi.stubEnv("GROQ_API_KEY", "x");
  vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", ""); vi.stubEnv("AI_MODEL_FAST", "test/ka");
  resetLedger();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetLedger(); });

describe("E3: keepalive.ts's fetch is undici's, on undici's own Agent", () => {
  it("the Agent is npm undici's, with keepAliveTimeout 60 s and keepAliveMaxTimeout 600 s, made once", () => {
    expect(KEEPALIVE_OPTIONS).toEqual({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 });
    const a = keepAliveAgent();
    expect(a).toBeInstanceOf(Agent);
    expect(optionsOf(a)).toMatchObject({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 });
    expect(keepAliveAgent()).toBe(a);
  });
  it("warmFetch calls undici's own fetch (not the built-in one) with that Agent as the dispatcher", async () => {
    const builtin = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", builtin);
    await warmFetch("https://api.groq.com/openai/v1/models", { method: "GET" });
    expect(builtin).not.toHaveBeenCalled();
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0].init.dispatcher).toBe(keepAliveAgent());
    expect(seen.calls[0].init.method).toBe("GET");
  });
  it("a built-in FormData body (stt.ts's Whisper upload) reaches undici as undici's own FormData, every field and the file kept", async () => {
    // npm undici's fetch brand-checks its own FormData class: given the built-in one it would send the text "[object FormData]"
    // (the live measurement met exactly that: Groq answered 400), so warmFetch copies the fields into undici's FormData
    const { FormData: UFormData } = await vi.importActual<typeof import("undici")>("undici");
    const f = new FormData();
    f.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "speech.wav");
    f.append("model", "whisper-large-v3-turbo");
    f.append("language", "ta");
    await warmFetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", body: f });
    const body = seen.calls[0].init.body as InstanceType<typeof UFormData>;
    expect(body).toBeInstanceOf(UFormData);
    expect(body.get("model")).toBe("whisper-large-v3-turbo");
    expect(body.get("language")).toBe("ta");
    const file = body.get("file") as File;
    expect(file.name).toBe("speech.wav");
    expect(file.type).toBe("audio/wav");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);
    // a string body (the gateway's JSON) is passed as it is
    await warmFetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", body: "{\"a\":1}" });
    expect(seen.calls[1].init.body).toBe("{\"a\":1}");
  });
  it("JARVIS_KEEPALIVE=1: groqFetch goes through undici with the Agent; =0: the built-in fetch, looked up at call time", async () => {
    const builtin = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", builtin);
    vi.stubEnv("JARVIS_KEEPALIVE", "1");
    expect(keepAliveOn()).toBe(true);
    await groqFetch("https://api.groq.com/x", {});
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0].init.dispatcher).toBe(keepAliveAgent());
    expect(builtin).not.toHaveBeenCalled();
    vi.stubEnv("JARVIS_KEEPALIVE", "0");
    expect(keepAliveOn()).toBe(false);
    await groqFetch("https://api.groq.com/x", {});
    expect(builtin).toHaveBeenCalledTimes(1);
    expect(seen.calls).toHaveLength(1);
  });
});

describe("E3: stt.ts's Whisper requests and gateway.ts's Groq calls use it", () => {
  it("JARVIS_KEEPALIVE=1: both forced Whisper decodes go through undici's fetch on the Agent", async () => {
    vi.stubEnv("JARVIS_KEEPALIVE", "1");
    seen.answer = whisper;
    const builtin = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", builtin);
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en" });
    expect(h).toMatchObject({ text: "show the drain status", noise: false });
    expect(seen.calls.map((c) => c.url)).toEqual(["https://api.groq.com/openai/v1/audio/transcriptions", "https://api.groq.com/openai/v1/audio/transcriptions"]);
    expect(seen.calls.every((c) => c.init.dispatcher === keepAliveAgent())).toBe(true);
    expect(builtin).not.toHaveBeenCalled();
  });
  it("JARVIS_KEEPALIVE=0: the Whisper requests go to the built-in fetch, undici's is never called", async () => {
    vi.stubEnv("JARVIS_KEEPALIVE", "0");
    const builtin = vi.fn(async (u: string, init: RequestInit) => whisper(u, init as unknown as Record<string, unknown>));
    vi.stubGlobal("fetch", builtin);
    const h = await hearUtterance(wav(), { lane: "engaged", site: "en" });
    expect(h.text).toBe("show the drain status");
    expect(builtin).toHaveBeenCalledTimes(2);
    expect(seen.calls).toHaveLength(0);
  });
  it("JARVIS_KEEPALIVE=1: a Groq chat call through the gateway (createGroq({ apiKey, fetch })) goes through undici's fetch on the Agent", async () => {
    vi.stubEnv("JARVIS_KEEPALIVE", "1");
    seen.answer = () => chat();
    const builtin = vi.fn(async () => chat());
    vi.stubGlobal("fetch", builtin);
    const r = await generateJson(call());
    expect(r.object).toEqual({ ok: true });
    expect(seen.calls.length).toBeGreaterThanOrEqual(1);
    expect(seen.calls[0].url).toContain("api.groq.com");
    expect(seen.calls.every((c) => c.init.dispatcher === keepAliveAgent())).toBe(true);
    expect(builtin).not.toHaveBeenCalled();
  });
  it("JARVIS_KEEPALIVE=0: the gateway's Groq call goes to the built-in fetch (a test's stub still sees it)", async () => {
    vi.stubEnv("JARVIS_KEEPALIVE", "0");
    const builtin = vi.fn(async () => chat());
    vi.stubGlobal("fetch", builtin);
    const r = await generateJson(call());
    expect(r.object).toEqual({ ok: true });
    expect(builtin).toHaveBeenCalled();
    expect(seen.calls).toHaveLength(0);
  });
});
