// QA pass 4 chaos: the model path fails in every way. There is no base-URL override in the code (the providers' hosts are fixed),
// so the real gateway and ladder run against a fake global fetch. Each failure must end as null/honest, inside the deadline, never garbage.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/chaos-llm.test.ts
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WORLD, START } from "@/lib/thunai/fixture";
import { referenceWorld } from "@/lib/thunai/world";
import { finish, type AgentPlan } from "@/lib/thunai/agent";
import { fakeHands } from "@/lib/thunai/stagefake";

const S = z.object({ ok: z.boolean(), n: z.number() });
const ok = (content: string, status = 200) => new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status, headers: { "content-type": "application/json" } });
const json = (status: number, body: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...h } });
const asked: string[] = [];
const fake = (f: (init: RequestInit) => Promise<Response> | Response) => vi.stubGlobal("fetch", async (u: string, init: RequestInit) => { asked.push(String(u)); return f(init); });
const hang = (init: RequestInit) => new Promise<Response>((_, rej) => { init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); });
// the gateway keeps its cool-downs in module state: a fresh copy per test, or one 429 would make the rest vacuous
const run = async (budgetMs = 3000) => { vi.resetModules(); const { callLlm } = await import("@/lib/thunai/llm"); const { Ledger, MemoryStore } = await import("@/lib/thunai/ledger"); const t = Date.now(); const r = await callLlm({ name: "chaos", schema: S, system: "s".repeat(400), prompt: "give ok and n", maxOutputTokens: 100, user: "u", lane: "planner", until: Date.now() + budgetMs, hedge: false } as never, { ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false }); return { r, ms: Date.now() - t }; };

describe("QA pass 4 chaos: model failures", () => {
  beforeEach(() => {
    asked.length = 0;
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "chaos-")));
    vi.stubEnv("GROQ_API_KEY", "k1"); vi.stubEnv("GROQ_API_KEY_2", "k2"); vi.stubEnv("GROQ_API_KEY_3", "k3");
    vi.stubEnv("AI_PROVIDER", "groq"); vi.stubEnv("AI_FALLBACK_PROVIDER", "none"); vi.stubEnv("AI_FORCE_PROVIDER", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("CHAOS-LLM-1 every provider answers 429: null, fast, no garbage", async () => { fake(() => json(429, { error: { message: "Rate limit reached" } }, { "retry-after": "30" })); const { r, ms } = await run(); expect(r).toBeNull(); expect(ms).toBeLessThan(3500); expect(asked.filter((u) => /groq/.test(u)).length).toBeGreaterThan(0); });
  it("CHAOS-LLM-2 every provider answers 500: null", async () => { fake(() => json(500, { error: { message: "boom" } })); expect((await run()).r).toBeNull(); expect(asked.some((u) => /groq/.test(u))).toBe(true); });
  it("CHAOS-LLM-3 the provider hangs: null at the deadline, not later", async () => { fake(hang); const { r, ms } = await run(2500); expect(asked.some((u) => /groq/.test(u))).toBe(true); expect(r).toBeNull(); expect(ms).toBeLessThan(4500); });
  it("CHAOS-LLM-4 prose instead of JSON: null", async () => { fake(() => ok("Sorry, I cannot do that. The answer is about forty.")); expect((await run()).r).toBeNull(); expect(asked.some((u) => /groq/.test(u))).toBe(true); });
  it("CHAOS-LLM-5 truncated JSON: null", async () => { fake(() => ok('{"ok":tr')); expect((await run()).r).toBeNull(); });
  it("CHAOS-LLM-6 valid JSON, wrong shape: null", async () => { fake(() => ok('{"ok":"yes","n":"many"}')); expect((await run()).r).toBeNull(); });
  it("CHAOS-LLM-7 empty choices / empty content: null", async () => { fake(() => json(200, { id: "x", object: "chat.completion", created: 1, model: "m", choices: [], usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } })); expect((await run()).r).toBeNull(); fake(() => ok("")); expect((await run()).r).toBeNull(); });
  it("CHAOS-LLM-8 a non-JSON 200 body (HTML from a proxy): null", async () => { fake(() => new Response("<html>502 Bad Gateway</html>", { status: 200, headers: { "content-type": "text/html" } })); expect((await run()).r).toBeNull(); });
  it("CHAOS-LLM-9 the network is down (fetch throws): null", async () => { fake(() => { throw new TypeError("fetch failed"); }); expect((await run()).r).toBeNull(); });
  it("CHAOS-LLM-10 control: a good answer is returned", async () => { fake(() => ok('{"ok":true,"n":3}')); const { r } = await run(); expect(asked.some((u) => /groq/.test(u))).toBe(true); expect(r?.object).toEqual({ ok: true, n: 3 }); });
  it("CHAOS-LLM-11 JSON in a fence with trailing words still parses, or is null; never a wrong value", async () => { fake(() => ok('```json\n{"ok":true,"n":3}\n```\nHope that helps')); const { r } = await run(); if (r) expect(r.object).toEqual({ ok: true, n: 3 }); });
});

describe("QA pass 4 chaos: invented figures", () => {
  const world = { ...WORLD, ...referenceWorld(), depts: WORLD.depts };
  const run1 = { t0: Date.now(), rounds: 1, model: "mock", results: [], clock: Date.now, until: Date.now() + 5000 };
  const input = { text: "how many complaints are open in Adyar", state: { ...START, now: Date.now() }, ctx: { turns: [], notes: [], habits: {}, now: Date.now() }, stage: null };
  const said = async (line: string) => (await finish({ kind: "chat", lang: "en", reply: line, say: null, screen: null, steps: [], calls: [], options: [], stage: null } as unknown as AgentPlan, input, { world, hands: fakeHands(), llm: async () => { throw new Error("x"); } }, run1)).reply ?? null;
  it.each(["There are 4237 open complaints in Adyar.", "Adyar has 4,237 open complaints right now.", "About 83% of Adyar complaints are overdue.", "அடையாறில் 4237 புகார்கள் திறந்துள்ளன."])("CHAOS-FIG-1 a model reply with no tool result behind it never states a figure: %s", async (line) => {
    const r = await said(line);
    expect(r ?? "").not.toMatch(/4,?237|83\s?%/);
  });
});
