import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { schemaText, type JsonCall, type JsonResult } from "@/lib/ai/gateway";
import { Ledger, MemoryStore } from "./ledger";
import { callLlm, estimate, GROQ_MODELS, ladder } from "./llm";

// A2 (a): the provider's prompt_tokens on the grid's first calls were far above estimate(), which left the schema out
describe("A2: the estimate counts the schema the provider is sent", () => {
  it("estimate() of a call with a schema is at least the tokens of system + prompt + schema", () => {
    const schema = z.object({ kind: z.enum(["do", "clarify", "chat"]), reply: z.string().nullable(), zones: z.array(z.number().int()).max(4) });
    const system = "s".repeat(3500), prompt = "p".repeat(350), js = schemaText(schema);
    expect(js.length).toBeGreaterThan(100);
    expect(estimate(system, prompt, 0, schema)).toBeGreaterThanOrEqual(Math.ceil((system.length + prompt.length + js.length) / 3.5));
    expect(estimate(system, prompt, 500, schema)).toBeGreaterThanOrEqual(Math.ceil((system.length + prompt.length + js.length) / 3.5) + 200);
  });
  it("without a schema it is what it was", () => {
    expect(estimate("s".repeat(350), "p".repeat(35), 500)).toBe(110 + 200);
  });
});

// A6 (a): Haiku leads when the key works (JARVIS_PLANNER_LEAD=haiku, the default); JARVIS_PLANNER_LEAD=groq puts Groq first
describe("A6: the planner's lead", () => {
  afterEach(() => vi.unstubAllEnvs());
  const l = () => new Ledger(new MemoryStore());
  const order = () => ladder(2000, l(), false, true).map((r) => `${r.provider}/${r.model}`);
  it("haiku (default): claude-haiku-5-5, then the Groq ladder, then flash-lite", () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
    vi.stubEnv("JARVIS_PLANNER_LEAD", "");
    const o = order();
    expect(o[0]).toBe("anthropic/claude-haiku-5-5");
    expect(o.slice(1, 4).every((x) => x.startsWith("groq/"))).toBe(true);
    expect(o[4]).toBe("gemini/gemini-3.5-flash-lite");
  });
  it("groq: the Groq ladder first, Haiku after Groq, then flash-lite", () => {
    vi.stubEnv("JARVIS_PLANNER_LEAD", "groq");
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
    const o = order();
    expect(o.slice(0, 3).every((x) => x.startsWith("groq/"))).toBe(true);
    expect(o[3]).toBe("anthropic/claude-haiku-5-5");
    expect(o[4]).toBe("gemini/gemini-3.5-flash-lite");
  });
  it("no key: the ladder is what it always was", () => {
    vi.stubEnv("JARVIS_PLANNER_LEAD", "");
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
    expect(ladder(2000, l(), false, false).map((r) => r.provider)).toEqual(["groq", "groq", "groq", "gemini"]);
  });
  // review planner-quota-6, brief 3.1: "Take claude-opus-5-5 off the first rung in every case; keep it selectable by env"
  it("Opus is never on the first rung: named by JARVIS_CLAUDE_MODEL it is a rung, after the Groq ladder, whatever JARVIS_PLANNER_LEAD says", () => {
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "claude-opus-5-5");
    for (const lead of ["", "haiku", "groq"]) {
      vi.stubEnv("JARVIS_PLANNER_LEAD", lead);
      const o = order();
      expect(o.slice(0, 3).every((x) => x.startsWith("groq/"))).toBe(true);
      expect(o[3]).toBe("anthropic/claude-opus-5-5");
      expect(o[4]).toBe("gemini/gemini-3.5-flash-lite");
    }
  });
});

// review planner-quota-8 (A2): a call Jarvis stopped (cancelled, a lost hedge, the deadline) is recorded at its estimated input, and
// that estimate leaves the schema out while estimate() counts it
describe("A2: a stopped call is recorded with the schema counted, as estimate() counts it", () => {
  it("a turn cancelled mid-call records its rung at (system + prompt + schema) / 3.5 tokens", async () => {
    const led = new Ledger(new MemoryStore());
    const schema = z.object({ kind: z.enum(["do", "clarify", "chat"]), reply: z.string().nullable(), zones: z.array(z.number().int()).max(4), note: z.string().nullable() });
    const system = "s".repeat(700), prompt = "p".repeat(70);
    const generate = <U,>(c: JsonCall<U>) => new Promise<JsonResult<U>>((_, rej) => { c.abortSignal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); });
    const ctl = new AbortController();
    const p = callLlm({ name: "t", system, prompt, schema, maxOutputTokens: 100, user: "u", lane: "planner", until: Date.now() + 8000, signal: ctl.signal, hedge: false },
      { generate: generate as never, ledger: led, bedrockOk: () => false });
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toThrow();
    const recorded = GROQ_MODELS.map((m) => led.spent("groq", m, 60_000));
    expect(recorded.reduce((a, s) => a + s.requests, 0)).toBe(1);
    expect(recorded.reduce((a, s) => a + s.tokens, 0)).toBe(Math.ceil((system.length + prompt.length + schemaText(schema).length) / 3.5));
  });
});
