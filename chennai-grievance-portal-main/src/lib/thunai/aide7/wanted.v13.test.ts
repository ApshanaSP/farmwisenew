/**
 * v13 (21 Nov review, finding 1 8): no city screen gets the aide. Its say is code's own line from the shared city data; the aide's writer and
 * gap search made "Where are the flooded roads?" (a question, so the aide ran) take up to 8 s with the outlet feeds, past the client deadline.
 */
import { describe, expect, it } from "vitest";
import type { AgentResult } from "../agent";
import { aideWanted } from "./index";

const screen = (recipe: string, slots: Record<string, unknown>): AgentResult => ({ kind: "do", lang: "en", reply: null, steps: [], stageOp: null, say: "x", options: [], rounds: 0, calls: [], model: null, ms: 0,
  stage: { recipe, slots } } as unknown as AgentResult);

describe("aideWanted: never for a city screen", () => {
  it.each([
    [{ q: "flood", focus: null, rain: null }, "Where are the flooded roads?"],
    [{ q: "traffic", focus: null, rain: null }, "What's the traffic like?"],
    [{ q: "power", focus: null, rain: null }, "மழை வந்தா கரண்ட் எங்க போகும்?"],
    [{ q: "traffic", focus: "worst-jam", rain: null }, "Show me the most congested traffic now"]
  ])("%o", (slots, said) => expect(aideWanted(screen("city", slots), said, "quick", true)).toBe(false));
  it("another screen asked as a question is still the aide's", () => {
    expect(aideWanted(screen("cases", { zones: [13] }), "What is happening in Adyar?", "quick", true)).toBe(true);
  });
});
