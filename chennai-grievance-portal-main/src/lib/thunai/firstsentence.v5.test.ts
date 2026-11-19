import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { fakeHands } from "./stagefake";
import { chunks } from "./chunker";
import { clearCaches, planRound, RoundBody } from "./round";
import { spokenSentences } from "./streamturn";
import { referenceWorld } from "./world";

// E4 (v5 Phase 5): is the first spoken sentence of a planner turn built by code from the screen, before any model text is used?
const world = { ...WORLD, ...referenceWorld() };
const body = (text: string) => RoundBody.parse({ turnId: "e4-first", round: 0, text, turns: [], lastText: null, stage: null, direct: null,
  state: { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false } });
const screen = (recipe: string, o: Record<string, unknown> = {}) => ({ recipe, period: "weekly", zones: [13], dept: null, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: null, n: null, item: null, id: null, name: null, what: null, sort: null, metricId: null, ...o });

describe("E4: the planner turn's first spoken sentence is code's, from the built screen", () => {
  it("the model's reply (with a figure of its own) is not what is said: the screen's own say is, and it passes the number gate", async () => {
    clearCaches();
    // an invented sentence the rules leave to the planner, and a plan whose reply carries a made-up figure
    const plan = { kind: "do", lang: "en", reply: "There are 4712 waterlogging cases right now.", options: [], screen: screen("cases", { cat: "FLOOD_WATERLOGGING" }), calls: [], done: true };
    const o = await planRound(body("um the flooding thing near the river side, how bad is it looking"), world, fakeHands(), "u", undefined, undefined, {
      llm: { generate: async () => ({ object: plan as never, info: { step: "x", provider: "groq", model: "m", ms: 5, inputTokens: 1, outputTokens: 1, attempts: 1 } }) }
    });
    const r = o.result!;
    expect(r.stage?.recipe).toBe("cases");
    const said = spokenSentences(r, world);
    expect(said.length).toBeGreaterThan(0);
    // sentence 1 is the first chunk of the screen's code-built say, and nothing of the model's reply is spoken
    expect(said[0].text).toBe(chunks(r.stage!.say.en)[0]);
    expect(said.map((s) => s.text).join(" ")).not.toContain("4712");
  });
});
