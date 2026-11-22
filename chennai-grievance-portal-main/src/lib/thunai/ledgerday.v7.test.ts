import { afterEach, describe, expect, it } from "vitest";
import { Ledger, MemoryStore } from "./ledger";

/**
 * v7: Jarvis's own day cap on Claude (1.5M tokens, 500 requests) was set against Opus's prices; on Haiku 5.5 it stops Claude at under
 * US$0.10 of spend, far below the owner's ceiling (US$10 on 17 Nov). A run may raise it by flag; the default is unchanged and the spend
 * ceiling (claudebudget.ts) holds every call whatever the cap.
 */
describe("v7: the Claude day cap, raised by flag only", () => {
  const prev = { t: process.env.JARVIS_CLAUDE_DAY_TOKENS, r: process.env.JARVIS_CLAUDE_DAY_REQUESTS };
  afterEach(() => {
    if (prev.t == null) delete process.env.JARVIS_CLAUDE_DAY_TOKENS; else process.env.JARVIS_CLAUDE_DAY_TOKENS = prev.t;
    if (prev.r == null) delete process.env.JARVIS_CLAUDE_DAY_REQUESTS; else process.env.JARVIS_CLAUDE_DAY_REQUESTS = prev.r;
  });
  // 8.4M tokens over the day, the last an hour ago (no minute's cap in the way; v15: the default day is 8M)
  const spentDay = () => { let t = 1_000_000_000; const l = new Ledger(new MemoryStore(), () => t); for (let i = 0; i < 4; i++) { l.record("anthropic", "claude-haiku-5-5", { tokens: 2_100_000 }); t += 3_600_000; } return l; };
  it("the default holds: 8.4M tokens in a day leave no room", () => {
    delete process.env.JARVIS_CLAUDE_DAY_TOKENS;
    expect(spentDay().room("anthropic", "claude-haiku-5-5", { tokens: 3000 }).ok).toBe(false);
  });
  it("JARVIS_CLAUDE_DAY_TOKENS raises it, for Claude only", () => {
    process.env.JARVIS_CLAUDE_DAY_TOKENS = "9000000";
    process.env.JARVIS_CLAUDE_DAY_REQUESTS = "2000";
    const l = spentDay();
    expect(l.room("anthropic", "claude-haiku-5-5", { tokens: 3000 }).ok).toBe(true);
    expect(l.limit("anthropic", "claude-haiku-5-5")).toMatchObject({ tpd: 9_000_000, rpd: 2000 });
    expect(l.limit("groq", "qwen/qwen3.8-27b").tpd).toBe(200_000);
  });
  it("nonsense is ignored", () => {
    process.env.JARVIS_CLAUDE_DAY_TOKENS = "lots";
    expect(spentDay().limit("anthropic", "claude-haiku-5-5").tpd).toBe(8_000_000);
  });
});
