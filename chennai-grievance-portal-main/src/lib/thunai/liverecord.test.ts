import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptEvent } from "@/lib/ai/gateway";
import type { LlmCallEvent } from "./llm";
import { groqOnly, liveSummary, turnRecord } from "./liverecord";

const att = (o: Partial<AttemptEvent>): AttemptEvent => ({ name: "t", provider: "groq", model: "m1", outcome: "ok", ms: 10, ...o });
const call = (o: Partial<LlmCallEvent>): LlmCallEvent => ({ name: "t", lane: "planner", ladder: ["groq/m1", "groq/m2"], hops: [], model: "m1", ms: 10, tokens: 0, ...o });

describe("the per-turn record (6.2)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sums the provider's own token counts, cached included, and keeps the ladder order", () => {
    const r = turnRecord([att({ inputTokens: 900, outputTokens: 40, cachedTokens: 512 }), att({ inputTokens: 100, outputTokens: 10 })], [call({})], 1234);
    expect(r).toMatchObject({ model_used: "m1", rate_limited: false, fell_back: false, json_validate_failed: false, prompt_tokens: 1000, completion_tokens: 50, cached_tokens: 512, ms: 1234, ladder_order: ["groq/m1", "groq/m2"], attempts: 2 });
  });

  it("marks a 429, a strict-mode 400 and a fall to another rung", () => {
    const r = turnRecord([att({ outcome: "rate_limited", status: 429 }), att({ model: "m2", outcome: "draft_used" })], [call({ model: "m2", hops: ["groq/m1:failed", "groq/m2"] })], 5);
    expect(r).toMatchObject({ model_used: "m2", rate_limited: true, fell_back: true, json_validate_failed: true });
  });

  it("a live run cannot reach Claude: the key is gone from its process and the lead is Groq", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
    groqOnly();
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(process.env.JARVIS_PLANNER_LEAD).toBe("groq");
  });

  it("v6: only JARVIS_LIVE_CLAUDE=1 (the owner's allowance, 17 Nov: 'do with claude', US$5) keeps the key and the lead", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
    vi.stubEnv("JARVIS_PLANNER_LEAD", "");
    vi.stubEnv("JARVIS_LIVE_CLAUDE", "1");
    groqOnly();
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-test-not-real");
    expect(process.env.JARVIS_PLANNER_LEAD).toBe("");
    for (const v of ["", "0", "yes", "true"]) {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
      vi.stubEnv("JARVIS_LIVE_CLAUDE", v);
      groqOnly();
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });
});

describe("the live summary (6.2)", () => {
  it("labels any 429 a capacity failure and prints clean and all-turn scores apart, per model", () => {
    const rec = (model: string, rl = false) => turnRecord(rl ? [att({ outcome: "rate_limited" })] : [], [call({ model })], 1, model);
    const s = liveSummary([{ ok: true, rec: rec("m1") }, { ok: false, rec: rec("m2") }, { ok: true, rec: rec("m1", true) }, { ok: false, capacity: true, rec: null }]);
    expect(s.label).toMatch(/CAPACITY FAILURE/);
    expect(s.capacityFailures).toBe(2);
    expect(s.allTurns).toMatchObject({ k: 1, n: 4 });
    expect(s.cleanTurns).toMatchObject({ k: 1, n: 2 });
    expect(Object.keys(s.byModel).sort()).toEqual(["m1", "m2", "none"]);
  });
  it("a run with no 429 and no capacity failure is clean", () => {
    expect(liveSummary([{ ok: true, rec: turnRecord([], [call({})], 1) }]).label).toBe("clean");
  });
});
