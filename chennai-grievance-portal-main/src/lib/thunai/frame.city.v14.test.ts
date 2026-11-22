/**
 * v14 (21 Nov review of v13: routing 4 and 11, scenarios 1): a follow-up said after an in-place city screen. A city screen reads no severity,
 * period or span, and only live traffic reads a zone, so "only severe", "this week instead", "What about Adyar?" and "In Adyar zone" rebuilt
 * the same screen with the same line, and "why?" gave the week's reasons for every complaint. Now: a zone is that zone's traffic, its
 * flooding complaints, its rain gauge or its whole picture, and for power and trains a line that says they are kept for the whole district;
 * a severity or a period is that part's complaints; "why?" and comparisons are the planner's.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { resolveFrame } from "./frame";
import { planRound, RoundBody, type RoundBodyT } from "./round";
import { stageContext, type StageDocT } from "./stage";
import { fakeHands } from "./stagefake";
import { Ledger, MemoryStore } from "./ledger";

const docOf = (q: string, extra: Record<string, unknown> = {}): StageDocT => ({
  v: 1, id: `st-${q}`, recipe: "city", title: q === "traffic" ? "Live traffic now" : q === "flood" ? "Streets that flood" : q === "power" ? "Power in heavy rain" : `City ${q}`,
  takeaway: null, say: { en: "x", ta: "x" }, scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null },
  slots: { q, zones: [], focus: null, rain: null, ...extra }, sources: [], asOf: null, notes: [], lang: "en",
  blocks: [{ kind: "Answer", id: "say", title: "x", text: "x", facts: [] }, { kind: "Ranking", id: "places", title: "The places", unit: null, method: "", order: "top", items: [
    { key: "r0", label: "Anna Salai", value: 12, rank: 1, sub: null, zone: null, lat: 13.06, lon: 80.25, action: "none" }, { key: "r1", label: "OMR", value: 9, rank: 2, sub: null, zone: null, lat: 12.9, lon: 80.22, action: "none" }] }]
} as unknown as StageDocT);
const after = (said: string, q: string, extra: Record<string, unknown> = {}) => {
  const doc = docOf(q, extra);
  return resolveFrame({ text: said, stage: stageContext(doc) as never, turns: [{ heard: "x", did: "showed a city screen", recipe: "city", slots: doc.slots, result: "x" }] as never, lastPlace: null, lastText: null, world: WORLD, now: Date.now() });
};

describe("v14 scenarios 1 and routing 4: a zone after a city screen", () => {
  it.each(["In Adyar zone", "What about Adyar?", "and in Adyar?", "same for Adyar"])("after the flood streets, %s: Adyar's flooding complaints", (said) => {
    expect(after(said, "flood")).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", zones: [13] } });
  });
  it("after the last rain's flooded streets too (never the district's rain again under Adyar's name)", () => {
    expect(after("What about Adyar?", "flood", { rain: "latest" })).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", zones: [13] } });
  });
  it("after live traffic: that zone's live traffic, keeping the worst-jam focus", () => {
    expect(after("What about Adyar?", "traffic")).toEqual({ kind: "screen", recipe: "city", slots: { q: "traffic", zones: [13], focus: null, rain: null, fresh: true }, why: "new-place" });
    expect(after("and in Teynampet?", "traffic", { focus: "worst-jam" })).toMatchObject({ kind: "screen", recipe: "city", slots: { q: "traffic", zones: [9], focus: "worst-jam" } });
  });
  it("after power or trains in heavy rain: a line that says they are kept for the whole district, never the district screen again", () => {
    const p = after("What about Adyar?", "power");
    expect(p.kind).toBe("reply");
    if (p.kind === "reply") { expect(p.why).toBe("city-zone"); expect(p.text.en).toMatch(/whole district/); expect(p.text.ta).toMatch(/மண்டல/); }
    expect(after("In Adyar zone", "metro")).toMatchObject({ kind: "reply", why: "city-zone" });
  });
  it("after the rain now and the city now: the zone's rain gauge and its whole picture", () => {
    expect(after("What about Adyar?", "rain")).toMatchObject({ kind: "screen", recipe: "readings", slots: { metric: "rain", zones: [13] } });
    expect(after("What about Adyar?", "all")).toMatchObject({ kind: "screen", recipe: "situation", slots: { zones: [13] } });
  });
  it("a kind named with the zone is that kind's complaints there; a part of the city named is the city lanes'", () => {
    expect(after("and the flooding in Adyar?", "traffic")).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", zones: [13] } });
    expect(after("and the traffic in Adyar?", "flood")).toEqual({ kind: "none" });
  });
});

describe("v14 routing 11: a severity, a period and 'why?' after a city screen", () => {
  it("'only severe' and 'this week instead' are that part's complaints, not the same screen again", () => {
    expect(after("only severe", "traffic", { focus: "worst-jam" })).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "TRAFFIC_OBSTRUCTION", sev: "Severe" } });
    expect(after("only severe", "flood")).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", sev: "Severe" } });
    expect(after("this week instead", "traffic")).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "TRAFFIC_OBSTRUCTION", period: "weekly" } });
    expect(after("make it monthly", "flood")).toMatchObject({ kind: "screen", recipe: "cases", slots: { cat: "FLOOD_WATERLOGGING", period: "monthly" } });
  });
  it("power and trains have no complaints of their own: the planner's", () => {
    expect(after("only severe", "power")).toEqual({ kind: "none" });
    expect(after("this week instead", "metro")).toEqual({ kind: "none" });
  });
  it("'why?' and a comparison are the planner's, never the week's reasons for every complaint", () => {
    for (const q of ["traffic", "flood", "power"]) {
      expect(after("why?", q)).toEqual({ kind: "none" });
      expect(after("compare with last month", q)).toEqual({ kind: "none" });
    }
  });
  it("never a city screen with a slot its data does not read", () => {
    for (const said of ["only severe", "this week instead", "What about Adyar?", "In Adyar zone", "why?"]) for (const q of ["flood", "power", "metro"]) {
      const f = after(said, q);
      if (f.kind === "screen" && f.recipe === "city") throw new Error(`${said} after ${q}: a city screen ${JSON.stringify(f.slots)}`);
    }
  });
  it("'as a table' is still the open screen's view, and 'show me in the map' is the fast lane's", () => {
    expect(after("show it as a table", "traffic")).toMatchObject({ kind: "stageOp", op: "view", text: "table" });
    expect(after("Okay, now tell me, show me in the map", "flood")).toEqual({ kind: "none" });
  });
});

describe("v14 scenarios 1, on the server: 'In Adyar zone' after the flood streets", () => {
  const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
  const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
  const noModel = { llm: { generate: (async () => { throw new Error("the planner was asked"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false } };
  it("the frame's cases screen for Adyar's flooding, with no planner; after power, the district line", async () => {
    const turns = [{ heard: "Where are the flooded roads?", did: "showed a screen", recipe: "city" as const, slots: { q: "flood" } }];
    const r = await planRound(body("In Adyar zone", { turns }), WORLD, fakeHands(), "u", undefined, undefined, noModel);
    expect(r.lane).toBe("frame");
    expect(r.result?.stage?.recipe).toBe("cases");
    expect(r.result?.stage?.slots).toMatchObject({ cat: "FLOOD_WATERLOGGING", zones: [13] });
    const p = await planRound(body("What about Adyar?", { turns: [{ heard: "Which areas lose power in heavy rain?", did: "showed a screen", recipe: "city" as const, slots: { q: "power" } }] }), WORLD, fakeHands(), "u", undefined, undefined, noModel);
    expect(p.lane).toBe("frame");
    expect(p.result?.reply ?? p.result?.say).toMatch(/whole district/);
  });
});
