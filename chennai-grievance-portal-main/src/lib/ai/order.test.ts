import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { aiStatus } from "./gateway";

// The user's order is what runs: Claude, then Bedrock. Gemini and Groq keys stay in .env for Jarvis's voice, and must
// not slip into the AI steps.
const KEYS = ["AI_PROVIDER", "AI_FALLBACK_PROVIDER", "AI_CHAT_PROVIDER", "AI_FORCE_PROVIDER", "ANTHROPIC_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "GEMINI_API_KEY", "GROQ_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_PROFILE"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

describe("provider order", () => {
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("AI_PROVIDER=claude, AI_FALLBACK_PROVIDER=bedrock: Claude then Bedrock, other keys ignored", () => {
    Object.assign(process.env, { AI_PROVIDER: "claude", AI_FALLBACK_PROVIDER: "bedrock", ANTHROPIC_API_KEY: "sk-ant-x", AWS_BEARER_TOKEN_BEDROCK: "b", GEMINI_API_KEY: "g", GROQ_API_KEY: "q" });
    delete process.env.AI_CHAT_PROVIDER; delete process.env.AI_FORCE_PROVIDER;
    expect(aiStatus().providers.map((p) => p.name)).toEqual(["anthropic", "bedrock"]);
    expect(aiStatus().providers[0].reasoning).toBe("claude-opus-5-5");
  });

  it("without the Claude key, Bedrock answers alone", () => {
    Object.assign(process.env, { AI_PROVIDER: "claude", AI_FALLBACK_PROVIDER: "bedrock", AWS_BEARER_TOKEN_BEDROCK: "b" });
    delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_CHAT_PROVIDER; delete process.env.AI_FORCE_PROVIDER;
    expect(aiStatus().providers.map((p) => p.name)).toEqual(["bedrock"]);
  });

  it("a console step's `prefer` cannot bring in a provider the settings leave out", async () => {
    const { generateJson, AiUnavailableError } = await import("./gateway");
    Object.assign(process.env, { AI_PROVIDER: "claude", AI_FALLBACK_PROVIDER: "bedrock" });
    for (const k of ["ANTHROPIC_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AI_CHAT_PROVIDER", "AI_FORCE_PROVIDER"]) delete process.env[k];
    process.env.GROQ_API_KEY = "";
    const call = { role: "fast" as const, name: "t", schema: z.object({ a: z.string() }), system: "s", prompt: "p", temperature: 0, user: "u" };
    // with the keys gone nothing can answer: a console step asking for Gemini is not sent to Gemini on its key alone
    process.env.GEMINI_API_KEY = "g";
    await expect(generateJson({ ...call, prefer: "gemini" })).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
