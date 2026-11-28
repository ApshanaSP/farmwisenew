/**
 * v20 (28 Nov 2026): the one shared provider chain of the console's AI steps (gateway.ts providerOrder). The owner: "AI is not being used and
 * we don't get an AI answer in the side panels". .env named Claude then Bedrock; the Bedrock key had expired on 18 Oct, so when Claude was
 * out nothing answered, though the Groq and Gemini keys were there; and the background write-ups used up the Collector's own daily tokens.
 * Claude is mocked here; Groq and Gemini are answered by a stubbed fetch. No network, no key, no spend; the ledger is a temporary one.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const claude = vi.hoisted(() => ({ on: true, calls: 0, delayMs: 0, fail: null as null | (() => Error), tokens: 500 }));
vi.mock("@/lib/ai/claude", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/claude")>();
  return {
    ...real,
    claudeConfigured: () => !real.claudeOff() && claude.on,
    claudeProblem: () => null,
    claudeJson: async (a: { schema: z.ZodTypeAny }) => {
      claude.calls++;
      if (claude.delayMs) await new Promise((r) => setTimeout(r, claude.delayMs));
      if (claude.fail) throw claude.fail();
      return { object: a.schema.parse({ ok: true }), model: "claude-haiku-5-5", inputTokens: claude.tokens, outputTokens: 0, ms: 5, cacheReadTokens: 0, cacheWriteTokens: 0, path: "format", stopReason: "end_turn" };
    }
  };
});

import { ClaudeBusyError } from "@/lib/ai/claude";
import { bedrockKeyEnds } from "@/lib/ai/bedrock";
import { AiBudgetError, aiStatus, generateJson, providerOrder, resetAiForTests, type JsonCall } from "@/lib/ai/gateway";

const S = z.object({ ok: z.boolean() });
const call = (over: Partial<JsonCall<{ ok: boolean }>> = {}): JsonCall<{ ok: boolean }> =>
  ({ role: "fast", name: "analysis", schema: S, system: "s", prompt: "p", temperature: 0, maxOutputTokens: 100, user: "collector@x", timeoutMs: 3000, ...over });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const groqOk = (model: string) => json(200, { id: "x", object: "chat.completion", created: 1, model,
  choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }], usage: { prompt_tokens: 300, completion_tokens: 10, total_tokens: 310 } });
const geminiOk = () => json(200, { candidates: [{ content: { role: "model", parts: [{ text: "{\"ok\":true}" }] }, finishReason: "STOP", index: 0 }],
  usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 10, totalTokenCount: 310 } });
const limited = () => json(429, { error: { message: "Rate limit reached. Please try again in 1m30s.", type: "tokens", code: "rate_limit_exceeded" } });

/** a fetch that answers Groq and Gemini as told, and lists who was asked */
function providersAnswer(answer: { groq?: () => Response; gemini?: () => Response }) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (u: string | URL | Request) => {
    const url = String(u instanceof Request ? u.url : u);
    if (url.includes("groq.com")) { asked.push("groq"); return (answer.groq ?? (() => groqOk("openai/gpt-oss-20b")))(); }
    if (url.includes("generativelanguage")) { asked.push("gemini"); return (answer.gemini ?? geminiOk)(); }
    asked.push(`other:${url}`);
    return json(500, {});
  });
  return asked;
}

/** a short-term Bedrock API key, as AWS mints it, signed at `signed` for `secs` seconds */
const bedrockKey = (signed: string, secs: number) => `bedrock-api-key-${Buffer.from(`bedrock.amazonaws.com/?Action=CallWithBearerToken&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=${signed}&X-Amz-Expires=${secs}&Version=1`).toString("base64")}`;

describe("v20: one chain, every configured provider behind the named ones", () => {
  beforeEach(() => {
    // the free tiers' use and rests go to a ledger of this test's own, never the site's data/thunai/ledger.sqlite
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-chain20-")));
    resetAiForTests();
    Object.assign(claude, { on: true, calls: 0, delayMs: 0, fail: null, tokens: 500 });
    for (const [k, v] of Object.entries({ AI_PROVIDER: "claude", AI_FALLBACK_PROVIDER: "bedrock", AI_FORCE_PROVIDER: "", AI_CHAT_PROVIDER: "", AI_STRICT_PROVIDERS: "",
      ANTHROPIC_API_KEY: "sk-ant-test", GROQ_API_KEY: "gq-test", GROQ_API_KEY_2: "", GEMINI_API_KEY: "gm-test", AWS_BEARER_TOKEN_BEDROCK: bedrockKey("20261018T095412Z", 43200),
      AWS_ACCESS_KEY_ID: "", AWS_PROFILE: "", JARVIS_CLAUDE_OFF: "", AI_MODEL_FAST: "openai/gpt-oss-20b", AI_GEMINI_MODEL_FAST: "gemini-3.5-flash-lite",
      ASSISTANT_DAILY_TOKENS: "", ASSISTANT_BACKGROUND_TOKENS: "", AI_BACKGROUND_CLAUDE_TOKENS: "" })) vi.stubEnv(k, v);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("the order: what .env names, then Groq and Gemini; background work tries Gemini before Groq", () => {
    expect(providerOrder()).toEqual(["anthropic", "bedrock", "groq", "gemini"]);
    expect(providerOrder(undefined, false, undefined, true)).toEqual(["anthropic", "bedrock", "gemini", "groq"]);
  });

  it("an expired short-term Bedrock key is left out without a call, and the status says when it ended", () => {
    expect(new Date(bedrockKeyEnds(bedrockKey("20261018T095412Z", 43200))!).toISOString()).toBe("2026-10-18T21:54:12.000Z");
    expect(bedrockKeyEnds("ABSKlongtermkey")).toBeNull();
    const st = aiStatus();
    expect(st.providers.map((p) => p.name)).toEqual(["anthropic", "groq", "gemini"]);
    expect(st.problem).toMatch(/Bedrock API key expired on 2026-10-18/);
  });

  it("Claude answers first when it can", async () => {
    const asked = providersAnswer({});
    const r = await generateJson(call());
    expect(r.info.provider).toBe("anthropic");
    expect(claude.calls).toBe(1);
    expect(asked).toEqual([]);
  });

  it("Claude rate-limited: Groq answers the same call", async () => {
    claude.fail = () => new ClaudeBusyError(20, "rate limited");
    const asked = providersAnswer({});
    const r = await generateJson(call());
    expect(r.info.provider).toBe("groq");
    expect(asked).toEqual(["groq"]);
  });

  it("Claude past the spend ceiling (out of the chain) and Groq at its limit: Gemini answers, and the log says why Claude was skipped", async () => {
    claude.on = false;
    vi.stubEnv("JARVIS_CLAUDE_OFF", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const asked = providersAnswer({ groq: limited });
    const r = await generateJson(call());
    expect(r.info.provider).toBe("gemini");
    expect(asked).toEqual(["groq", "gemini"]);
    expect(warn.mock.calls.flat().join("\n")).toMatch(/anthropic is skipped: switched off/);
  });

  it("a slow Claude no longer uses up the chain's time: Groq still gets its turn", async () => {
    // before v20 the chain's deadline was twice one free call (here 2 x 150 ms): a Claude failure after 400 ms left no time for anyone else
    Object.assign(claude, { delayMs: 400, fail: () => new ClaudeBusyError(10, "no answer in 0 s") });
    const asked = providersAnswer({});
    const r = await generateJson(call({ timeoutMs: 150 }));
    expect(r.info.provider).toBe("groq");
    expect(asked).toEqual(["groq"]);
  });

  it("every provider failing: one log line names what each did, and the call throws (the panel shows its rules text)", async () => {
    claude.fail = () => new ClaudeBusyError(20, "rate limited");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    providersAnswer({ groq: limited, gemini: limited });
    await expect(generateJson(call())).rejects.toThrow();
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("[ai] analysis: no AI answer"));
    expect(line).toMatch(/anthropic: The Claude API is busy/);
    expect(line).toMatch(/groq: /);
    expect(line).toMatch(/gemini: /);
  });

  it("AI_STRICT_PROVIDERS=1 keeps the named providers only: Claude out means no answer, as before v20", async () => {
    vi.stubEnv("AI_STRICT_PROVIDERS", "1");
    claude.fail = () => new ClaudeBusyError(20, "rate limited");
    const asked = providersAnswer({});
    await expect(generateJson(call())).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it("background write-ups are charged to their own allowance, not to the Collector who opened the page", async () => {
    vi.stubEnv("ASSISTANT_DAILY_TOKENS", "1000");
    claude.tokens = 900;
    providersAnswer({});
    // the story picker and the key points, in the background: 2 x 900 tokens, more than the Collector's 1,000
    await generateJson(call({ background: true, name: "story-pick2" }));
    await generateJson(call({ background: true, name: "day3" }));
    // the Collector's own clicks still answer (the allowance is checked before a call: 0, then 900 of 1,000 used)
    expect((await generateJson(call())).info.provider).toBe("anthropic");
    expect((await generateJson(call())).info.provider).toBe("anthropic");
    // and the Collector's own allowance still holds for the Collector's own calls (1,800 used)
    await expect(generateJson(call())).rejects.toBeInstanceOf(AiBudgetError);
  });

  it("past Claude's background share of the day, background work goes to the free models; a panel the Collector opens still gets Claude", async () => {
    vi.stubEnv("AI_BACKGROUND_CLAUDE_TOKENS", "1000");
    claude.tokens = 1200;
    const asked = providersAnswer({});
    expect((await generateJson(call({ background: true }))).info.provider).toBe("anthropic");
    expect((await generateJson(call({ background: true }))).info.provider).toBe("gemini");
    expect((await generateJson(call())).info.provider).toBe("anthropic");
    expect(asked).toEqual(["gemini"]);
  });

  it("`skip` leaves a provider out for one call (a write-up whose figures one model got wrong twice)", async () => {
    const asked = providersAnswer({});
    const r = await generateJson(call({ skip: ["anthropic"] }));
    expect(r.info.provider).toBe("groq");
    expect(claude.calls).toBe(0);
    expect(asked).toEqual(["groq"]);
  });
});
