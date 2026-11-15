import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { schemaText } from "@/lib/ai/gateway";
import { Ledger, MemoryStore } from "./ledger";
import { estimate, ladder } from "./llm";

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
  it("Opus only by explicit env, never first by default; no key: the ladder is what it always was", () => {
    vi.stubEnv("JARVIS_PLANNER_LEAD", "");
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "claude-opus-5-5");
    expect(order()[0]).toBe("anthropic/claude-opus-5-5");
    vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
    expect(ladder(2000, l(), false, false).map((r) => r.provider)).toEqual(["groq", "groq", "groq", "gemini"]);
  });
});
