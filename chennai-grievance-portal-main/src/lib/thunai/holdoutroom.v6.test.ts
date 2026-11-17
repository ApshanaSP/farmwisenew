/**
 * v6 (defect): the live-60 runner (HOLDOUT=planner2) checked only the three Groq planners' day before it started, so with Groq's day spent
 * it refused a run that Haiku 5.5 would lead (the owner, 17 Nov: "do with claude, don't spend more than 5 dollars"). The room a live
 * holdout run counts on is Claude's day when Haiku leads the planner, else the Groq planners' tokens left. Counts only; no model is asked.
 */
import { describe, expect, it } from "vitest";
import { Ledger, MemoryStore } from "./ledger";
import { GROQ_PLANNERS, runRoom } from "./holdoutroom";

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
  it("Claude's requests left count too, at about 3K tokens a request", () => {
    const l = new Ledger(new MemoryStore());
    l.record("anthropic", "claude-haiku-5-5", { tokens: 1000, requests: 490 });
    expect(runRoom(l, { leads: true, model: "claude-haiku-5-5" })).toEqual({ who: "anthropic", left: 10 * 3000 });
  });
});
