/**
 * v6 (defect): the live-60 runner (HOLDOUT=planner2) checked only the three Groq planners' day before it started, so with Groq's day spent
 * it refused a run that Haiku 5.5 would lead (the owner, 17 Nov: "do with claude, don't spend more than 5 dollars"). The room a live
 * holdout run counts on is Claude's day when Haiku leads the planner, else the Groq planners' tokens left. Counts only; no model is asked.
 */
import { describe, expect, it } from "vitest";
import { Ledger, MemoryStore } from "./ledger";
import { GROQ_PLANNERS, claudeLeadsPlanner, runRoom, waitForRoom } from "./holdoutroom";

const groqSpent = () => {
  const l = new Ledger(new MemoryStore());
  for (const m of GROQ_PLANNERS) l.record("groq", m, { tokens: 200_000 });
  return l;
};

describe("v6: a live holdout run's room", () => {
  it("Groq's day spent and Haiku leading: the room is Claude's, so the run is not refused", () => {
    const r = runRoom(groqSpent(), { leads: true, model: "claude-haiku-5-5" });
    expect(r.who).toBe("anthropic");
    expect(r.left).toBeGreaterThan(60 * 3 * 3000);
  });
  it("Haiku not leading (no key, the ceiling reached, JARVIS_PLANNER_LEAD=groq): what the three Groq planners have left", () => {
    expect(runRoom(groqSpent(), { leads: false, model: "claude-haiku-5-5" })).toEqual({ who: "groq", left: 0 });
    expect(runRoom(new Ledger(new MemoryStore()), { leads: false, model: "claude-haiku-5-5" })).toEqual({ who: "groq", left: 600_000 });
  });
  // v6 (defect): the first Claude-led live30 (17 Nov 19:32) fired five wide planner calls (about 8K tokens each) in a few seconds; the
  // ledger's minute window (50K tokens for Claude) then had no room, the ladder offered only a cooled flash-lite, and the runner, which
  // waits only after a turn that made a call, ran the other items in the same minute: 21 of 30 turns no model, no 429 from anyone.
  it("waitForRoom: an item waits until the lead's minute window has room for it, on the ledger's own clock", async () => {
    let now = 1_000_000;
    const l = new Ledger(new MemoryStore(), () => now);
    l.record("anthropic", "claude-haiku-5-5", { tokens: 395_000 }); // (v15: the minute is 400K tokens now, ledger.ts)
    const sleep = async (ms: number) => { now += ms; };
    const waited = await waitForRoom(l, { who: "anthropic", model: "claude-haiku-5-5" }, 30_000, { sleep, stepMs: 2000, maxMs: 120_000 });
    expect(waited).toBeGreaterThanOrEqual(60_000);
    expect(waited).toBeLessThan(64_000);
    expect(l.room("anthropic", "claude-haiku-5-5", { tokens: 30_000 }).ok).toBe(true);
    // room at once: no wait
    expect(await waitForRoom(l, { who: "anthropic", model: "claude-haiku-5-5" }, 30_000, { sleep })).toBe(0);
  });
  it("waitForRoom: gives up after maxMs (-1), and on Groq any one planner with room is enough", async () => {
    let now = 5_000_000;
    const l = new Ledger(new MemoryStore(), () => now);
    const sleep = async (ms: number) => { now += ms; };
    l.record("anthropic", "claude-haiku-5-5", { tokens: 399_000 });
    expect(await waitForRoom(l, { who: "anthropic", model: "claude-haiku-5-5" }, 30_000, { sleep, stepMs: 2000, maxMs: 10_000 })).toBe(-1);
    for (const m of GROQ_PLANNERS.slice(1)) l.record("groq", m, { tokens: 8_000 });
    expect(await waitForRoom(l, { who: "groq", model: "" }, 5_000, { sleep })).toBe(0);
  });
  it("Claude's requests left count too, at about 3K tokens a request", () => {
    const l = new Ledger(new MemoryStore());
    l.record("anthropic", "claude-haiku-5-5", { tokens: 1000, requests: 1990 }); // (v15: 2,000 requests a day, ledger.ts)
    expect(runRoom(l, { leads: true, model: "claude-haiku-5-5" })).toEqual({ who: "anthropic", left: 10 * 3000 });
  });
});

describe("v8 (19 Nov): the live-60 runner's room follows the ladder's own rule for who leads", () => {
  it("Sonnet 5.5 leads under v8 (the finals), as llm.ts ladder() lets it", () => expect(claudeLeadsPlanner({ configured: true, lead: "haiku", model: "claude-sonnet-5-5", v8: true })).toBe(true));
  it("Haiku leads as before", () => expect(claudeLeadsPlanner({ configured: true, lead: "haiku", model: "claude-haiku-5-5", v8: false })).toBe(true));
  it("not Sonnet under v7's rule, never Opus, never with the lead set to Groq or no key", () => {
    expect(claudeLeadsPlanner({ configured: true, lead: "haiku", model: "claude-sonnet-5-5", v8: false })).toBe(false);
    expect(claudeLeadsPlanner({ configured: true, lead: "haiku", model: "claude-opus-5-5", v8: true })).toBe(false);
    expect(claudeLeadsPlanner({ configured: true, lead: "groq", model: "claude-haiku-5-5", v8: true })).toBe(false);
    expect(claudeLeadsPlanner({ configured: false, lead: "haiku", model: "claude-haiku-5-5", v8: true })).toBe(false);
  });
});
