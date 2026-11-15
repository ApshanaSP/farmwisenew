/**
 * v4 defect 2: the hedge defeated Claude-first. hedgeAfter gave 3.5 s to a rung with no answers of its own, Claude's p50 is about
 * 3.9 s, so about half of the early Claude turns were hedged into Groq; and only the winner's time was kept, so Claude's p95 was
 * read low. These tests run on a fake clock.
 */
import fs from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import * as llm from "./llm";
import { callLlm } from "./llm";
import { Ledger, MemoryStore, resetLedger } from "./ledger";

const S = z.object({ ok: z.boolean() });
const fresh = () => new Ledger(new MemoryStore());
const CLAUDE = "claude-haiku-5-5"; // v5 A6: Jarvis's default Claude model is Haiku 5.5 (was Opus 5.5)
const base = (over = {}) => ({ name: "t", system: "s", prompt: "p", schema: S, maxOutputTokens: 100, user: "u", lane: "planner" as const, until: Date.now() + 8000, ...over });

/** a scripted model per id: how long it takes (on the fake clock), whether it fails; when each was asked */
function script(s: Record<string, { ms?: number; fail?: boolean; path?: string; cacheRead?: number }>) {
  const asked: { model: string; at: number }[] = [], aborted: { model: string; at: number }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    const m = c.only!.models[0];
    asked.push({ model: m, at: Date.now() });
    const x = s[m] ?? {};
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, x.ms ?? 5);
      c.abortSignal?.addEventListener("abort", () => { clearTimeout(t); aborted.push({ model: m, at: Date.now() }); rej(new DOMException("aborted", "AbortError")); }, { once: true });
    });
    if (x.fail) throw new Error("429");
    return { object: { ok: true } as U, info: { step: c.name, provider: c.only!.provider, model: m, ms: x.ms ?? 5, inputTokens: 100, outputTokens: 20, attempts: 1, path: x.path, cacheReadTokens: x.cacheRead, cacheWriteTokens: 0 } as never };
  };
  return { generate: generate as never, asked, aborted };
}

let dir = "";
const rows = () => (fs.existsSync(path.join(dir, "telemetry.ndjson")) ? fs.readFileSync(path.join(dir, "telemetry.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) : []);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-llm4-"));
  vi.stubEnv("THUNAI_DIR", dir);
  (llm as unknown as { resetLatency?: () => void }).resetLatency?.();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

/** run a call to the end on the fake clock */
async function run<T>(p: Promise<T>, ms = 9000): Promise<T> {
  let out: T | undefined, err: unknown, settled = false;
  p.then((v) => { out = v; settled = true; }, (e) => { err = e; settled = true; });
  for (let t = 0; t < ms && !settled; t += 50) await vi.advanceTimersByTimeAsync(50);
  if (err) throw err;
  return out as T;
}

describe("v4 defect 2: the hedge waits for the rung's own record", () => {
  it("Claude with no answers of its own is not hedged at 3.5 s: a 4 s answer is Claude's", async () => {
    const a = script({ [CLAUDE]: { ms: 4000 }, "qwen/qwen3.8-27b": { ms: 10 }, "openai/gpt-oss-20b": { ms: 10 } });
    const r = await run(callLlm(base(), { generate: a.generate, ledger: fresh(), bedrockOk: () => false, claudeOk: () => true }));
    expect(r?.model).toBe(CLAUDE);
    expect(r?.hedged).toBe(false);
    expect(a.asked.map((x) => x.model)).toEqual([CLAUDE]);
  });

  it("Claude's default before its own 8 answers is at least 6 s; Groq's own record does not lend Claude a shorter one", async () => {
    // eight quick Groq answers first: Groq's record, not Claude's
    for (let i = 0; i < 8; i++) {
      const q = script({ "qwen/qwen3.8-27b": { ms: 100 } });
      await run(callLlm(base(), { generate: q.generate, ledger: fresh(), bedrockOk: () => false }));
    }
    const hedgeAfter = (llm as unknown as { hedgeAfter: (p: string, m: string) => number }).hedgeAfter;
    expect(hedgeAfter("anthropic", CLAUDE)).toBeGreaterThanOrEqual(6000);
    const t0 = Date.now();
    const a = script({ [CLAUDE]: { ms: 7600 }, "qwen/qwen3.8-27b": { ms: 300 } });
    const r = await run(callLlm(base({ until: t0 + 8000 }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false, claudeOk: () => true }));
    const hedge = a.asked.find((x) => x.model !== CLAUDE)!;
    expect(hedge.at - t0).toBeGreaterThanOrEqual(6000);
    expect(r?.hedged).toBe(true);
    expect(r?.model).toBe("qwen/qwen3.8-27b");
  });

  it("the loser's time is kept as aborted, apart from completed answers, and logged with aborted: true", async () => {
    const t0 = Date.now();
    const a = script({ [CLAUDE]: { ms: 7900 }, "qwen/qwen3.8-27b": { ms: 400 } });
    await run(callLlm(base({ until: t0 + 8000 }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false, claudeOk: () => true }));
    const stats = (llm as unknown as { latencyStats: (p: string, m: string) => { done: number[]; aborted: number[] } }).latencyStats("anthropic", CLAUDE);
    expect(stats.done).toEqual([]);
    expect(stats.aborted.length).toBe(1);
    expect(stats.aborted[0]).toBeGreaterThanOrEqual(6400);
    const lost = rows().find((x) => x.event === "llm" && x.model === CLAUDE);
    expect(lost).toMatchObject({ aborted: true, ok: false });
    expect(rows().find((x) => x.event === "hedge")).toMatchObject({ winner: "hedge", into: "groq/qwen/qwen3.8-27b" });
  });

  it("an aborted time counts in the p95 as a lower bound: seven 4 s answers and one loser at 7 s give a 7 s hedge", async () => {
    const l = llm as unknown as { observeDone: (p: string, m: string, ms: number) => void; observeAborted: (p: string, m: string, ms: number) => void; hedgeAfter: (p: string, m: string) => number; latencyStats: (p: string, m: string) => { p95: number; censored: boolean } };
    for (let i = 0; i < 7; i++) l.observeDone("anthropic", CLAUDE, 4000);
    expect(l.hedgeAfter("anthropic", CLAUDE)).toBeGreaterThanOrEqual(6000);
    l.observeAborted("anthropic", CLAUDE, 7000);
    expect(l.hedgeAfter("anthropic", CLAUDE)).toBe(7000);
    expect(l.latencyStats("anthropic", CLAUDE)).toMatchObject({ p95: 7000, censored: true });
  });

  it("hedges only into Groq: a slow Groq rung with only flash-lite after it is not hedged", async () => {
    const l = fresh();
    // the other Groq models are out of their minute, so the rung after qwen is flash-lite
    for (const m of ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]) l.record("groq", m, { tokens: 8000 });
    expect(llm.ladder(41, l).map((x) => x.model)).toEqual(["qwen/qwen3.8-27b", "gemini-3.5-flash-lite"]);
    const a = script({ "qwen/qwen3.8-27b": { ms: 5000 }, "gemini-3.5-flash-lite": { ms: 10 } });
    const r = await run(callLlm(base(), { generate: a.generate, ledger: l, bedrockOk: () => false }));
    expect(a.asked.map((x) => x.model)).toEqual(["qwen/qwen3.8-27b"]);
    expect(r?.hedged).toBe(false);
  });

  it("never into a Groq model under 40 % of its minute: Claude answers alone", async () => {
    const l = fresh();
    for (const m of ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]) l.record("groq", m, { tokens: 5200 });
    const a = script({ [CLAUDE]: { ms: 6500 } });
    const r = await run(callLlm(base(), { generate: a.generate, ledger: l, bedrockOk: () => false, claudeOk: () => true }));
    expect(a.asked.map((x) => x.model)).toEqual([CLAUDE]);
    expect(r?.model).toBe(CLAUDE);
  });

  it("the llm telemetry carries the path and the cache reads of a Claude call", async () => {
    const a = script({ [CLAUDE]: { ms: 900, path: "format", cacheRead: 1234 } });
    await run(callLlm(base(), { generate: a.generate, ledger: fresh(), bedrockOk: () => false, claudeOk: () => true }));
    expect(rows().find((x) => x.event === "llm" && x.ok === true)).toMatchObject({ model: CLAUDE, path: "format", cacheRead: 1234, hedged: false });
  });
});

describe("a refused Claude key (401)", () => {
  afterEach(() => { global.__claude = undefined; global.__claudeRefused = undefined; resetLedger(); });

  it("costs one refused call, never waits on a hedge, and later turns go straight to the next rung", async () => {
    vi.useRealTimers();
    for (const k of ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4", "GROQ_API_KEY_5", "GEMINI_API_KEY", "AI_FORCE_PROVIDER"]) vi.stubEnv(k, "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-refused");
    resetLedger();
    let calls = 0;
    const refuse = async () => { calls++; throw new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid x-api-key", new Headers()); };
    global.__claude = { key: "sk-test-refused", client: { beta: { messages: { create: refuse } } } as never };
    const t0 = Date.now();
    const first = await callLlm(base({ until: Date.now() + 8000 }), { bedrockOk: () => false });
    expect(first).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(calls).toBe(1);
    const second = await callLlm(base({ until: Date.now() + 8000 }), { bedrockOk: () => false });
    expect(second).toBeNull();
    expect(calls).toBe(1);
  });
});
