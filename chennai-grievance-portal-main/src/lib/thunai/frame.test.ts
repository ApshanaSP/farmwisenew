import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { resolveFrame, type FrameInput } from "./frame";
import type { StageContext } from "./stage";

const cases: StageContext = { recipe: "cases", title: "Severe in Royapuram", focus: null, slots: { sev: "Severe", zones: [5], period: "daily" }, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3"] }] };
const f = (text: string, o: Partial<FrameInput> = {}) => resolveFrame({ text, stage: null, turns: [], lastPlace: null, lastText: null, world: WORLD, ...o });

describe("follow-ups, resolved in code before anything else", () => {
  it("and in Adyar? keeps the screen, changes the place", () => {
    expect(f("and in Adyar?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [13], sev: "Severe" } });
    expect(f("அடையாறில்?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [13] } });
    expect(f("Adyar la?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [13] } });
  });
  it("same for Ambattur, and a correction after a cancel: no, Anna Nagar", () => {
    expect(f("same for Ambattur", { stage: cases })).toMatchObject({ kind: "screen", slots: { zones: [7] } });
    // the question was cut off before any screen: the frame is the sentence said
    expect(f("no, Anna Nagar", { lastText: "show the severe cases in Royapuram" })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [8], sev: "Severe" } });
  });
  it("why? asks the reason for what is on screen", () => {
    expect(f("why?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "why", slots: { zones: [5] } });
    expect(f("ஏன்?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "why" });
    expect(f("yen?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "why" });
  });
  it("the second one opens the second item", () => {
    expect(f("the second one", { stage: cases })).toMatchObject({ kind: "stageOp", op: "open", n: 2 });
    expect(f("இரண்டாவது", { stage: cases })).toMatchObject({ kind: "stageOp", op: "open", n: 2 });
    expect(f("the ninth one", { stage: cases })).toEqual({ kind: "none" });
  });
  it("compare with last month, compare with a place", () => {
    expect(f("compare with last month", { stage: cases })).toMatchObject({ kind: "screen", recipe: "why", slots: { zones: [5], period: "monthly" } });
    expect(f("compare with Perungudi", { stage: cases })).toMatchObject({ kind: "screen", recipe: "compare", slots: { zones: [5, 14] } });
  });
  it("only severe, make it monthly, a new topic, as a table", () => {
    const news: StageContext = { ...cases, recipe: "cases", slots: { zones: [13], period: "daily" } };
    expect(f("only severe", { stage: news })).toMatchObject({ kind: "screen", slots: { sev: "Severe", zones: [13] } });
    expect(f("make it monthly", { stage: cases })).toMatchObject({ kind: "screen", slots: { period: "monthly" } });
    expect(f("what about flooding?", { stage: cases })).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", zones: [5] } });
    expect(f("as a table", { stage: cases })).toMatchObject({ kind: "stageOp", op: "view", text: "table" });
  });
  it("a full new request is not a follow-up, and with nothing to follow nothing happens", () => {
    expect(f("show the severe cases in Adyar", { stage: cases })).toEqual({ kind: "none" });
    expect(f("and in Adyar?")).toEqual({ kind: "none" });
    expect(f("why?")).toEqual({ kind: "none" });
  });
});
