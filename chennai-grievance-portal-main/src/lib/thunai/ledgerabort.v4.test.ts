/**
 * Review (Phase 7, Planner 4): a model call the turn cancelled never reached the ledger (llm.ts rethrew before recording; gateway.ts and
 * claude.ts rethrow an abort), and a Claude reply that was billed but refused or off-schema was not recorded either. A cancelled main
 * call (and a hedge still running) is now recorded at its estimated input tokens, and a billed Claude reply is recorded before it throws.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { schemaText, type JsonCall, type JsonResult } from "@/lib/ai/gateway";
import { claudeModel } from "@/lib/ai/claude";
import * as llm from "./llm";
import { callLlm } from "./llm";
import { ledger, Ledger, MemoryStore, resetLedger } from "./ledger";

const S = z.object({ ok: z.boolean() });
const base = (over = {}) => ({ name: "t", system: "a system prompt of some length", prompt: "the prompt", schema: S, maxOutputTokens: 100, user: "u", lane: "planner" as const, until: Date.now() + 8000, ...over });
// v5 A2 (review planner-quota-8): a stopped call is recorded at an estimate that counts the schema, as estimate() does
const GUESS = Math.ceil(("a system prompt of some length".length + "the prompt".length + schemaText(S).length) / 3.5);

/** a model per id that answers after `ms`, or waits until it is aborted */
function script(ms: Record<string, number>) {
  const asked: string[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    const m = c.only!.models[0];
    asked.push(m);
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, ms[m] ?? 600_000);
      c.abortSignal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
    });
    return { object: { ok: true } as U, info: { step: c.name, provider: c.only!.provider, model: m, ms: 5, inputTokens: 100, outputTokens: 20, attempts: 1 } };
  };
  return { generate: generate as never, asked };
}
const settle = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

let dir = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-ledgerabort-"));
  vi.stubEnv("THUNAI_DIR", dir);
  llm.resetLatency();
});
afterEach(() => { vi.unstubAllEnvs(); global.__claude = undefined; global.__claudeRefused = undefined; resetLedger(); });

describe("a cancelled call is still counted", () => {
  it("the turn's cancel while the main call runs: the main rung is recorded at its estimated input tokens", async () => {
    const l = new Ledger(new MemoryStore());
    const a = script({});
    const ctl = new AbortController();
    const p = settle(callLlm(base({ signal: ctl.signal }), { generate: a.generate, ledger: l, bedrockOk: () => false }));
    await new Promise((r) => setTimeout(r, 30));
    ctl.abort();
    const e = await p;
    expect((e as Error)?.name).toBe("AbortError");
    expect(a.asked).toEqual(["qwen/qwen3.8-27b"]);
    expect(l.spent("groq", "qwen/qwen3.8-27b", 60_000)).toMatchObject({ requests: 1, tokens: GUESS });
    expect(l.spent("groq", "qwen/qwen3.8-27b", 60_000, "planner").requests).toBe(1);
  });

  it("a hedge still running when the turn is cancelled is recorded too", async () => {
    // eight quick answers of its own: the hedge on qwen fires at its 1 s floor
    for (let i = 0; i < 8; i++) llm.observeDone("groq", "qwen/qwen3.8-27b", 100);
    const l = new Ledger(new MemoryStore());
    const a = script({});
    const ctl = new AbortController();
    const p = settle(callLlm(base({ signal: ctl.signal }), { generate: a.generate, ledger: l, bedrockOk: () => false }));
    await new Promise((r) => setTimeout(r, 1250));
    expect(a.asked.length).toBe(2);
    ctl.abort();
    expect(((await p) as Error)?.name).toBe("AbortError");
    for (const m of a.asked) expect(l.spent("groq", m, 60_000), m).toMatchObject({ requests: 1, tokens: GUESS });
  });

  it("a call that answered before the cancel is not counted twice", async () => {
    const l = new Ledger(new MemoryStore());
    const a = script({ "qwen/qwen3.8-27b": 5 });
    const ctl = new AbortController();
    const r = await callLlm(base({ signal: ctl.signal }), { generate: a.generate, ledger: l, bedrockOk: () => false });
    ctl.abort();
    expect(r?.model).toBe("qwen/qwen3.8-27b");
    // the fake generate does not record (the real gateway does); nothing was cancelled
    expect(l.spent("groq", "qwen/qwen3.8-27b", 60_000).requests).toBe(0);
  });
});

describe("Claude through the real gateway: billed replies and cancels reach the ledger", () => {
  const usage = { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  function claude(create: (body: unknown, opts: { signal?: AbortSignal }) => Promise<unknown>) {
    for (const k of ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4", "GROQ_API_KEY_5", "GEMINI_API_KEY", "AI_FORCE_PROVIDER"]) vi.stubEnv(k, "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-billed");
    resetLedger();
    global.__claude = { key: "sk-test-billed", client: { beta: { messages: { create } } } as never };
  }

  it("a refusal Claude billed is recorded with its usage", async () => {
    claude(async () => ({ model: claudeModel(), stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, usage, content: [] }));
    expect(await callLlm(base(), { bedrockOk: () => false })).toBeNull();
    expect(ledger().spent("anthropic", claudeModel(), 60_000)).toMatchObject({ requests: 1, tokens: 940 });
  });

  it("an off-schema reply Claude billed is recorded with its usage", async () => {
    claude(async () => ({ model: claudeModel(), stop_reason: "end_turn", usage, content: [{ type: "text", text: '{"wrong":1}' }] }));
    expect(await callLlm(base(), { bedrockOk: () => false })).toBeNull();
    expect(ledger().spent("anthropic", claudeModel(), 60_000)).toMatchObject({ requests: 1, tokens: 940 });
  });

  it("a Claude call the turn cancelled is recorded once, at its estimate", async () => {
    claude((_b, opts) => new Promise((_res, rej) => { opts.signal?.addEventListener("abort", () => rej(Object.assign(new Error("Request was aborted."), { name: "AbortError" })), { once: true }); }));
    const ctl = new AbortController();
    const p = settle(callLlm(base({ signal: ctl.signal }), { bedrockOk: () => false }));
    await new Promise((r) => setTimeout(r, 50));
    ctl.abort();
    expect(await p).toBeTruthy();
    expect(ledger().spent("anthropic", claudeModel(), 60_000)).toMatchObject({ requests: 1, tokens: GUESS });
  });
});
