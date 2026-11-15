import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { fakeHands } from "./stagefake";
import { clearCaches, planRound, RoundBody } from "./round";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld() };
const body = (text: string) => RoundBody.parse({ turnId: `t-${text.length}`, round: 0, text, turns: [], lastText: null, stage: null, direct: null,
  state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });

describe("the round's server stage times (v5 trace 6.4)", () => {
  it("a planner turn says when the call went, came back and the answer was built, in that order; timings only", async () => {
    clearCaches();
    const plan = { kind: "chat", lang: "en", reply: "Hello.", options: [], screen: null, calls: [], done: true };
    const o = await planRound(body("tell me something about the weather in a nice way please"), world, fakeHands(), "u", undefined, undefined, {
      llm: { generate: async () => ({ object: plan as never, info: { step: "x", provider: "groq", model: "m", ms: 5, inputTokens: 1, outputTokens: 1, attempts: 1 } }) }
    });
    const t = o.timing ?? {};
    expect(Object.keys(t).every((k) => ["plannerSent", "plannerBack", "toolsDone"].includes(k))).toBe(true);
    if (t.plannerSent != null) {
      expect(t.plannerSent).toBeLessThanOrEqual(t.plannerBack as number);
      expect(t.plannerBack).toBeLessThanOrEqual(t.toolsDone as number);
    }
    expect(typeof t.toolsDone).toBe("number");
  });
});
