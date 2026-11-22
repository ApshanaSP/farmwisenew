/**
 * v12 (21 Nov, routing RC5 and RC7): the city screen on one spot ("the most congested road", "the repeating traffic") or one past rain ("the
 * flooded streets in the last rain") says code's own line for it, every figure the spot's or the rain's own; the aide does not rewrite it
 * from the district's facts (3.5 s on the 06:40 "repeating traffic" turn). The plain city screen is the aide's as before when asked as a question.
 */
import { describe, expect, it } from "vitest";
import type { AgentResult } from "../agent";
import { aideWanted } from "./index";

const city = (slots: Record<string, unknown>): AgentResult => ({ kind: "do", lang: "en", reply: null, steps: [], stageOp: null, say: "x", options: [], rounds: 0, calls: [], model: null, ms: 0,
  stage: { recipe: "city", slots } } as unknown as AgentResult);

describe("aideWanted for the city screen", () => {
  it("a spot or a past rain: never the aide's", () => {
    expect(aideWanted(city({ q: "traffic", focus: "worst-jam" }), "What is the most congested road?", "quick", true)).toBe(false);
    expect(aideWanted(city({ q: "traffic", focus: "repeat" }), "Tell me details about the repeating traffic.", "quick", true)).toBe(false);
    expect(aideWanted(city({ q: "flood", rain: "latest" }), "What are the flooded streets in the last rain?", "quick", true)).toBe(false);
  });
  // v13 (21 Nov review, finding 1 8): changed from true. Every city screen says code's own line now, the plain one too (wanted.v13.test.ts)
  it("the plain city screen asked as a question: code's own line too (v13)", () => {
    expect(aideWanted(city({ q: "traffic", focus: null, rain: null }), "How is the traffic now?", "quick", true)).toBe(false);
  });
});
