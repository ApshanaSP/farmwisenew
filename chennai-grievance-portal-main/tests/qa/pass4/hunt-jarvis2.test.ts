// QA pass 4, hunter jarvis2: Jarvis understanding and multi-turn state, through the browser's real path (grader/client-sim.ts), no model.
// Each test is a bug still open (it.fails). The fixer turns it into it(...).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { browserWorld, ClientSim } from "./grader/client-sim";

let world: Awaited<ReturnType<typeof browserWorld>>["world"];
let list: string[];
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T06:30:00.000Z"));
  ({ world, list } = await browserWorld());
});
const run = async (...turns: string[]) => {
  const sim = new ClientSim(world, {}, list);
  const outs = [];
  for (const t of turns) outs.push(await sim.handle(t));
  return { sim, outs, last: outs[outs.length - 1] };
};

describe("jarvis2 hunt", () => {
  it.fails("jarvis2-1 Tamil 'மண்டலம் 5' keeps the zone in the severe-cases screen", async () => {
    const { last } = await run("மண்டலம் 5 கடுமையான புகார்கள் காட்டு");
    expect(last.stage?.title ?? "").toContain("ராயபுரம்");
  });
  it.fails("jarvis2-2 'zone five' (a number word) keeps the zone", async () => {
    const { last } = await run("show severe complaints in zone five");
    expect(last.stage?.title ?? "").toContain("Royapuram");
  });
  it.fails("jarvis2-3 'open the one in Pallikaranai' does not open the first case", async () => {
    const { outs } = await run("show severe complaints", "open the one in Pallikaranai");
    const t = (outs[1].stage?.title ?? "") + " " + outs[1].said;
    expect(t).toMatch(/Pallikaranai/);
  });
  it.fails("jarvis2-4 'open the sixteenth one' on a list of 8 says there is no such case", async () => {
    const { outs } = await run("show severe complaints", "open the sixteenth one");
    expect(outs[1].stage?.recipe).not.toBe("case");
  });
  it.fails("jarvis2-5 'open the last one' opens the last case on the screen without a model", async () => {
    const { outs } = await run("show severe complaints", "open the last one");
    expect(outs[1].path).toContain("stage-local");
  });
  it.fails("jarvis2-6 Tamil 'ஒன்றாவது திற' (open the first) works without a model", async () => {
    const { outs } = await run("show severe complaints", "ஒன்றாவது திற");
    expect(outs[1].path).toContain("stage-local");
  });
  it.fails("jarvis2-7 Tamil 'ஞாபகம் வச்சுக்கோ' (keep in mind) asks to remember, not to open zone 5", async () => {
    const { last } = await run("மண்டலம் 5 முக்கியம்னு ஞாபகம் வச்சுக்கோ");
    expect(last.steps.some((s) => s.a === "view")).toBe(false);
    expect(last.kind).toBe("clarify");
  });
  it("jarvis2-8 'don't forget zone 5 is my priority' asks to remember, not to open zone 5", async () => {
    const { last } = await run("don't forget zone 5 is my priority");
    expect(last.steps.some((s) => s.a === "view")).toBe(false);
  });
  it.fails("jarvis2-9 'draft it' with a case open on the Stage drafts that case", async () => {
    const { last } = await run("show severe complaints", "open the third one", "draft it");
    expect(last.kind).not.toBe("clarify");
    expect(last.drafted.length).toBe(1);
  });
  it.fails("jarvis2-10 'and the previous one again' after two zones goes back to the earlier zone", async () => {
    const { sim } = await run("zone 5", "also zone 6", "and the previous one again");
    expect(sim.zone).toBe(5);
    expect(sim.incident).toBeNull();
  });
  it.fails("jarvis2-11 'zone 5 and zone 6 compare' does not silently drop zone 5", async () => {
    const { last } = await run("zone 5 and zone 6 compare");
    const shown = last.steps.map((s) => JSON.stringify(s)).join(" ") + (last.stage?.title ?? "");
    expect(shown.includes("5") && shown.includes("6")).toBe(true);
  });
});
