import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeBusyError, claudeConfigured, claudeJson, claudeModel } from "./claude";

// the shared ledger stays out of it: cooling here would leak into the other tests and the developer's own ledger
vi.mock("@/lib/thunai/ledger", () => ({ ledger: () => ({ cool: vi.fn(), coolingUntil: () => 0, record: vi.fn() }) }));

// The Claude provider, without the network: a fake client stands in for the SDK's (claude.ts reuses global.__claude
// while the key in .env is the same).
const KEY = "sk-ant-test-0000000000";
const Out = z.object({ answer: z.string(), n: z.number() });
const call = { name: "test", role: "fast" as const, schema: Out, system: "Answer.", prompt: "Q" };
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function fake(create: (...a: unknown[]) => unknown) {
  global.__claude = { key: KEY, client: { beta: { messages: { create: vi.fn(create) } } } as unknown as Anthropic };
  return global.__claude.client.beta.messages.create as unknown as ReturnType<typeof vi.fn>;
}

describe("Claude provider", () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = KEY; delete process.env.AI_CLAUDE_MODEL; });
  afterEach(() => { global.__claude = undefined; global.__claudeRefused = undefined; global.__keyProblems?.clear(); delete process.env.ANTHROPIC_API_KEY; });

  it("reads the JSON from the text block after a thinking block, with structured outputs and the refusal fallback", async () => {
    const create = fake(async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage,
      content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: '{"answer":"yes","n":3}' }] }));
    const r = await claudeJson(call);
    expect(r.object).toEqual({ answer: "yes", n: 3 });
    const body = create.mock.calls[0][0] as Record<string, any>;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    // never sent to these models: they answer 400
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it("keeps enums as hard limits, closes objects, and moves lengths into the description", async () => {
    const S = z.object({ intent: z.enum(["map", "cases"]), note: z.string().max(40).nullable(), tags: z.array(z.object({ k: z.string() })) });
    const create = fake(async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"intent":"map","note":null,"tags":[]}' }] }));
    await claudeJson({ ...call, schema: S });
    const sent = JSON.stringify((create.mock.calls[0][0] as Record<string, any>).output_config.format.schema);
    expect(sent).toContain('"enum":["map","cases"]');
    expect(sent).not.toContain('"maxLength"');
    expect(sent).toContain("maxLength: 40");
    expect(sent.match(/"additionalProperties":false/g)?.length).toBe(2);
  });

  it("a schema with a free-form map is asked for as plain JSON (structured outputs would leave the map empty)", async () => {
    const S = z.object({ slots: z.record(z.string()) });
    const create = fake(async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"slots":{"zone":"Adyar"}}' }] }));
    const r = await claudeJson({ ...call, schema: S });
    expect(r.object.slots.zone).toBe("Adyar");
    const body = create.mock.calls[0][0] as Record<string, any>;
    expect(body.output_config.format).toBeUndefined();
    expect(body.system[0].text).toContain("Reply with only one JSON object");
  });

  it("sends no fallback to Haiku 5.5, which has none", async () => {
    process.env.AI_CLAUDE_MODEL = "claude-haiku-5-5";
    const create = fake(async () => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"answer":"a","n":1}' }] }));
    await claudeJson(call);
    expect((create.mock.calls[0][0] as Record<string, unknown>).fallbacks).toBeUndefined();
  });

  it("a declined request throws instead of returning empty text", async () => {
    fake(async () => ({ model: "claude-opus-5-5", stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, usage, content: [] }));
    await expect(claudeJson(call)).rejects.toThrow(/declined/);
  });

  it("a rate limit is busy, with the seconds the API asks for", async () => {
    fake(async () => { throw new Anthropic.RateLimitError(429, {}, "rate limited", new Headers({ "retry-after": "7" })); });
    const e = await claudeJson(call).catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeBusyError);
    expect((e as ClaudeBusyError).retryAfter).toBe(7);
  });

  it("a refused key is remembered until another key is pasted", async () => {
    fake(async () => { throw new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", new Headers()); });
    await expect(claudeJson(call)).rejects.toThrow(/refused the key/);
    expect(claudeConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-1111111111";
    expect(claudeConfigured()).toBe(true);
  });

  it("a schema structured outputs refuse is asked for again as plain JSON", async () => {
    let n = 0;
    const create = fake(async () => {
      // the SDK builds the message from the response body, as the API sends it
      if (n++ === 0) throw new Anthropic.BadRequestError(400, { type: "invalid_request_error", message: "output_config.format.schema: unsupported keyword" }, undefined, new Headers());
      return { model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: '```json\n{"answer":"ok","n":2}\n```' }] };
    });
    const r = await claudeJson({ ...call, schema: z.object({ answer: z.string(), n: z.number() }) });
    expect(r.object.answer).toBe("ok");
    expect((create.mock.calls[1][0] as Record<string, any>).output_config.format).toBeUndefined();
  });

  it("a Jarvis call (no role) is its own: Jarvis's model, low effort, one try", async () => {
    process.env.JARVIS_CLAUDE_MODEL = "claude-sonnet-5-5";
    process.env.AI_CLAUDE_MODEL = "claude-opus-5";
    const create = fake(async () => ({ model: "claude-sonnet-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"wrong":1}' }] }));
    await expect(claudeJson({ ...call, role: undefined })).rejects.toThrow(/did not match/);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0] as Record<string, any>;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.output_config.effort).toBe("low");
    expect(claudeModel("reasoning")).toBe("claude-opus-5");
    delete process.env.JARVIS_CLAUDE_MODEL;
  });

  it("a schema with more optional fields than the API takes goes as plain JSON from the start", async () => {
    const S = z.object(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, z.string().nullable()])));
    const create = fake(async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, null]))) }] }));
    await claudeJson({ ...call, schema: S });
    expect((create.mock.calls[0][0] as Record<string, any>).output_config.format).toBeUndefined();
  });

  it("an empty credit balance says so", async () => {
    fake(async () => { throw new Anthropic.BadRequestError(400, { type: "invalid_request_error", message: "Your credit balance is too low" }, undefined, new Headers()); });
    await expect(claudeJson(call)).rejects.toThrow(/no credit/);
    expect(global.__keyProblems?.get("anthropic")?.reason).toBe("no credit left");
  });
});
