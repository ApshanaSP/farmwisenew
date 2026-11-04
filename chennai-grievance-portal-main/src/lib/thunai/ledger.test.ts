import { describe, expect, it } from "vitest";
import { bareModel, Ledger, MemoryStore } from "./ledger";

function fresh(start = 1_000_000_000) {
  let t = start;
  const l = new Ledger(new MemoryStore(), () => t);
  return { l, at: (ms: number) => { t = start + ms; } };
}

describe("the capacity ledger", () => {
  it("keys by organisation and model: the #2 and #3 pooled keys spend one allowance", () => {
    const { l } = fresh();
    expect(bareModel("qwen/qwen3.8-27b#3")).toBe("qwen/qwen3.8-27b");
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 3000 });
    l.record("groq", "qwen/qwen3.8-27b#2", { tokens: 3000 });
    l.record("groq", "qwen/qwen3.8-27b#3", { tokens: 1500 });
    expect(l.spent("groq", "qwen/qwen3.8-27b", 60_000).tokens).toBe(7500);
    expect(l.room("groq", "qwen/qwen3.8-27b", { tokens: 1000 })).toMatchObject({ ok: false, why: "tpm" });
    expect(l.room("groq", "qwen/qwen3.8-27b", { tokens: 400 }).ok).toBe(true);
  });
  it("a minute's budget comes back after a minute; the day's does not", () => {
    const { l, at } = fresh();
    l.record("groq", "openai/gpt-oss-20b", { tokens: 7900 });
    expect(l.room("groq", "openai/gpt-oss-20b", { tokens: 500 }).why).toBe("tpm");
    at(61_000);
    expect(l.room("groq", "openai/gpt-oss-20b", { tokens: 500 }).ok).toBe(true);
    expect(l.spent("groq", "openai/gpt-oss-20b", 86_400_000).tokens).toBe(7900);
  });
  it("whisper bills at least 10 s per request, whatever the clip's length", () => {
    const { l } = fresh();
    l.record("groq", "whisper-large-v3-turbo", { audioS: 1.2, lane: "ambient" });
    expect(l.spent("groq", "whisper-large-v3-turbo", 60_000).audioS).toBe(10);
    l.record("groq", "whisper-large-v3-turbo", { audioS: 14, lane: "named" });
    expect(l.spent("groq", "whisper-large-v3-turbo", 60_000).audioS).toBe(24);
    expect(l.spent("groq", "whisper-large-v3-turbo", 60_000, "ambient").requests).toBe(1);
  });
  it("audio-seconds an hour cap: about 12 requests a minute at the minimum", () => {
    const { l, at } = fresh();
    for (let i = 0; i < 719; i++) { at(i * 5000); l.record("groq", "whisper-large-v3", { audioS: 1 }); }
    at(719 * 5000);
    expect(l.room("groq", "whisper-large-v3", { audioS: 1 })).toMatchObject({ ok: true });
    l.record("groq", "whisper-large-v3", { audioS: 1 });
    expect(l.room("groq", "whisper-large-v3", { audioS: 1 }).why).toBe("ash");
  });
  it("a 429 cools the model whatever the table says, and only for the time given", () => {
    const { l, at } = fresh();
    l.cool("gemini", "gemini-3.5-flash-lite", 30_000);
    expect(l.room("gemini", "gemini-3.5-flash-lite").why).toBe("cooling");
    at(31_000);
    expect(l.room("gemini", "gemini-3.5-flash-lite").ok).toBe(true);
  });
  it("frac is what would be left of the tightest minute budget (a hedge needs 40 %)", () => {
    const { l } = fresh();
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 2000 });
    const r = l.room("groq", "qwen/qwen3.8-27b", { tokens: 2000 });
    expect(r.frac).toBeCloseTo(0.5, 2);
    expect(l.room("groq", "qwen/qwen3.8-27b", { tokens: 4000 }).frac).toBeLessThan(0.4);
  });
  it("a model not in the table is not limited, and the report groups by org, model and lane", () => {
    const { l } = fresh();
    expect(l.room("groq", "something/else", { tokens: 999_999 }).ok).toBe(true);
    l.record("groq", "qwen/qwen3.8-27b", { tokens: 100, lane: "planner" });
    l.record("groq", "qwen/qwen3.8-27b#2", { tokens: 200, lane: "planner" });
    const [line] = l.report();
    expect(line).toMatchObject({ org: "groq", model: "qwen/qwen3.8-27b", tokens: 300, lane: "planner", n: 2 });
  });
});
