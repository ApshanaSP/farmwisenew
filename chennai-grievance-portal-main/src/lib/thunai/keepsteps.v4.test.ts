/**
 * Review (Phase 7, Numbers 3, server part): the text of a model's remember, remind or saveWorkspace step is said back in the Level B confirm
 * ("Shall I remember ...?") with no number gate, so a figure the model wrote there was said as Jarvis's. checkStep now drops such a step
 * unless every figure in its text is the Collector's own (requestOk, the same rule as a clarify option's request).
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { checkPlan, type AiPlan } from "./plan";

const NOW = Date.parse("2026-11-14T10:00:00+05:30");
const plan = (steps: Record<string, unknown>[]) => ({ kind: "do", lang: "en", reply: null, steps, options: [] }) as unknown as AiPlan;
const kept = (steps: Record<string, unknown>[], heard: string) => { const c = checkPlan(plan(steps), WORLD, heard, NOW); return c.kind === "do" ? c.steps.map((s) => s.a) : []; };

describe("a step whose text is said back in the confirm carries no figure of the model's", () => {
  it("remember, remind and saveWorkspace with a figure the Collector never said are dropped", () => {
    expect(kept([{ action: "remember", text: "300 deaths in Adyar" }], "remember the Adyar flood")).toEqual([]);
    expect(kept([{ action: "remember", text: "deaths-300 in Adyar" }], "remember the Adyar flood")).toEqual([]);
    expect(kept([{ action: "remind", text: "check the 40 pumps", when: "2026-11-14T17:00" }], "remind me to check the pumps at five")).toEqual([]);
    expect(kept([{ action: "saveWorkspace", text: "Top 5 flood zones" }], "save this workspace as my flood board")).toEqual([]);
  });
  it("the Collector's own figures, and text with none, are kept", () => {
    expect(kept([{ action: "remember", text: "300 deaths in Adyar" }], "remember 300 deaths in Adyar")).toEqual(["remember"]);
    expect(kept([{ action: "remember", text: "Adyar comes first" }], "remember that Adyar comes first")).toEqual(["remember"]);
    expect(kept([{ action: "remind", text: "check the pumps", when: "2026-11-14T17:00" }], "remind me to check the pumps at five")).toEqual(["remind"]);
    expect(kept([{ action: "saveWorkspace", text: "Zone 13 flood board" }], "save this workspace as zone 13 flood board")).toEqual(["workspace"]);
  });
});
