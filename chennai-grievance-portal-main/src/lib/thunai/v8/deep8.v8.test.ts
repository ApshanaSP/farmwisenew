import { afterEach, describe, expect, it } from "vitest";
import { Ledger, MemoryStore } from "../ledger";
import { ladder } from "../llm";
import { deepModel, deepTurn, escalate } from "./deep8";

describe("v8: which planner turns get the deep model", () => {
  afterEach(() => { delete process.env.JARVIS_DEEP_MODEL; delete process.env.JARVIS_UNDERSTAND; });
  it("Sonnet 5.5 by default; off by JARVIS_DEEP_MODEL=off or JARVIS_UNDERSTAND=v7", () => {
    expect(deepModel()).toBe("claude-sonnet-5-5");
    process.env.JARVIS_DEEP_MODEL = "off"; expect(deepModel()).toBeNull();
    delete process.env.JARVIS_DEEP_MODEL; process.env.JARVIS_UNDERSTAND = "v7"; expect(deepModel()).toBeNull();
  });
  it("hard or unclear turns: analysis, long, many parts, an unbound reference with a screen behind it", () => {
    expect(deepTurn("why is Adyar worse than Anna Nagar", { analysis: true, context: false })).toBe(true);
    expect(deepTurn("show me the severe cases in Adyar and then compare them with last month's numbers", { analysis: false, context: false })).toBe(true);
    expect(deepTurn("what about that one", { analysis: false, context: true })).toBe(true);
    expect(deepTurn("show the map", { analysis: false, context: true })).toBe(false);
    expect(deepTurn("open the news", { analysis: false, context: false })).toBe(false);
  });
  it("a fast plan that is no answer goes once more to the deep model; a greeting does not", () => {
    expect(escalate("clarify", "the thing")).toBe(true);
    expect(escalate("other", "x")).toBe(true);
    expect(escalate("chat", "what about it")).toBe(true);
    expect(escalate("chat", "hello Jarvis")).toBe(false);
    expect(escalate("do", "show")).toBe(false);
  });
});

describe("v8: the ladder puts the deep model first on a deep turn", () => {
  afterEach(() => { delete process.env.JARVIS_DEEP_MODEL; delete process.env.JARVIS_CLAUDE_MODEL; });
  const l = () => new Ledger(new MemoryStore());
  it("a deep turn: Sonnet, then the usual ladder (Haiku leading)", () => {
    const r = ladder(2000, l(), false, true, true);
    expect(r[0]).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(r[1]).toEqual({ provider: "anthropic", model: "claude-haiku-5-5" });
  });
  it("an ordinary turn: Haiku leads, no Sonnet rung", () => {
    const r = ladder(2000, l(), false, true, false);
    expect(r[0].model).toBe("claude-haiku-5-5");
    expect(r.some((x) => x.model === "claude-sonnet-5-5")).toBe(false);
  });
  it("no Claude key: no deep rung", () => expect(ladder(2000, l(), false, false, true).some((x) => x.provider === "anthropic")).toBe(false));
  it("the owner's finals: JARVIS_CLAUDE_MODEL=claude-sonnet-5-5 leads every turn", () => {
    process.env.JARVIS_CLAUDE_MODEL = "claude-sonnet-5-5";
    expect(ladder(2000, l(), false, true, false)[0]).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
  });
});
