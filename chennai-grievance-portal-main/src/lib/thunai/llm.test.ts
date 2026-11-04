import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { callLlm, ladder } from "./llm";
import { Ledger, MemoryStore } from "./ledger";

const S = z.object({ ok: z.boolean() });
const fresh = () => new Ledger(new MemoryStore());
const base = (over = {}) => ({ name: "t", system: "s", prompt: "p", schema: S, maxOutputTokens: 100, user: "u", lane: "planner" as const, until: Date.now() + 8000, bedrockOk: () => false, ...over });
const sleep = (ms: number, sig?: AbortSignal) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); sig?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }); });

function answers(script: Record<string, { ms?: number; fail?: boolean }>) {
  const asked: string[] = [], aborted: string[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    const m = c.only!.models[0];
    asked.push(m);
    const s = script[m] ?? {};
    await sleep(s.ms ?? 5, c.abortSignal).catch((e) => { aborted.push(m); throw e; });
    if (s.fail) throw new Error("429");
    return { object: { ok: true } as U, info: { step: c.name, provider: c.only!.provider, model: m, ms: s.ms ?? 5, inputTokens: 100, outputTokens: 20, attempts: 1 } };
  };
  return { generate: generate as never, asked, aborted };
}

describe("the ladder", () => {
  it("goes Groq with the most budget first, then the next, then flash-lite", () => {
    const l = fresh();
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 7500 });
    const r = ladder(500, l);
    expect(r[r.length - 1]).toEqual({ provider: "gemini", model: "gemini-3.5-flash-lite" });
    expect(r[r.length - 2].model).toBe("qwen/qwen3.8-27b");
    expect(r[0].provider).toBe("groq");
  });
  it("a model out of its minute or cooling is not a rung; Bedrock only when its keys work", () => {
    const l = fresh();
    l.record("groq", "openai/gpt-oss-120b", { tokens: 7900 });
    l.cool("groq", "openai/gpt-oss-20b", 60_000);
    expect(ladder(500, l).map((x) => x.model)).toEqual(["qwen/qwen3.8-27b", "gemini-3.5-flash-lite"]);
    expect(ladder(500, l, true).some((x) => x.provider === "bedrock")).toBe(true);
  });
  it("qwen comes first while the minute has room for this call and a margin, and gives way when it has not", () => {
    const l = fresh();
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 6000 });
    expect(ladder(1000, l)[0].model).toBe("qwen/qwen3.8-27b");
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 1000 });
    expect(ladder(1000, l)[0].model).not.toBe("qwen/qwen3.8-27b");
  });
  it("never includes gemini-3.8-flash", () => {
    expect(ladder(100, fresh()).some((x) => x.model.includes("3.8-flash"))).toBe(false);
  });
});

describe("calling a model", () => {
  it("walks down when a model refuses, logging each hop", async () => {
    const a = answers({ "qwen/qwen3.8-27b": { fail: true }, "openai/gpt-oss-20b": { fail: true }, "openai/gpt-oss-120b": { fail: true } });
    const r = await callLlm(base({ hedge: false }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false });
    expect(r?.model).toBe("gemini-3.5-flash-lite");
    expect(r?.hops.filter((h) => h.includes("failed")).length).toBe(3);
    expect(a.asked.length).toBe(4);
  });
  it("with every provider down it answers null, inside the deadline: the caller's rules speak", async () => {
    const a = answers({ "qwen/qwen3.8-27b": { fail: true }, "openai/gpt-oss-20b": { fail: true }, "openai/gpt-oss-120b": { fail: true }, "gemini-3.5-flash-lite": { fail: true } });
    const t0 = Date.now();
    expect(await callLlm(base({ hedge: false }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(8000);
  });
  it("a rung that fails at once goes to the next at once, with the hedge on: it does not wait out the hedge's timer", async () => {
    const a = answers({ "qwen/qwen3.8-27b": { fail: true }, "openai/gpt-oss-20b": { fail: true }, "openai/gpt-oss-120b": { fail: true } });
    const t0 = Date.now();
    const r = await callLlm(base(), { generate: a.generate, ledger: fresh(), bedrockOk: () => false });
    expect(r?.model).toBe("gemini-3.5-flash-lite");
    expect(r?.hedged).toBe(false);
    expect(a.asked.length).toBe(4);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("the turn's deadline stops a rung that hangs", async () => {
    const hung = { ms: 6000 };
    const a = answers({ "qwen/qwen3.8-27b": hung, "openai/gpt-oss-20b": hung, "openai/gpt-oss-120b": hung, "gemini-3.5-flash-lite": hung });
    const t0 = Date.now();
    expect(await callLlm(base({ hedge: false, until: Date.now() + 150 }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false })).toBeNull();
    expect(a.aborted.length).toBe(1);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("hedges at the model's p95 and aborts the loser", async () => {
    const a = answers({ "qwen/qwen3.8-27b": { ms: 6000 }, "openai/gpt-oss-20b": { ms: 10 }, "openai/gpt-oss-120b": { ms: 6000 } });
    const r = await callLlm(base(), { generate: a.generate, ledger: fresh(), bedrockOk: () => false });
    expect(r?.hedged).toBe(true);
    expect(r?.hops.some((h) => h.startsWith("hedge:"))).toBe(true);
    expect(a.aborted.length).toBe(1);
  }, 10_000);
  it("no hedge with under 40 % of a minute's budget on the hedge's model", async () => {
    const l = fresh();
    for (const m of ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]) l.record("groq", m, { tokens: 6000 });
    const a = answers({ "qwen/qwen3.8-27b": { ms: 3800 } });
    const r = await callLlm(base(), { generate: a.generate, ledger: l, bedrockOk: () => false });
    expect(r?.hedged).toBe(false);
    expect(a.asked).toEqual(["qwen/qwen3.8-27b"]);
  }, 10_000);
  it("an aborted turn stops at once and is not an answer", async () => {
    const ctl = new AbortController();
    const a = answers({ "qwen/qwen3.8-27b": { ms: 3000 } });
    const p = callLlm(base({ signal: ctl.signal, hedge: false }), { generate: a.generate, ledger: fresh(), bedrockOk: () => false });
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toThrow();
    expect(a.aborted).toEqual(["qwen/qwen3.8-27b"]);
  });
});
