import { describe, expect, it } from "vitest";
import { countAsked } from "./askcount";
import { cityAsk, cityRank } from "./city/intent";

// 23 Nov 2026: the owner's own sentences from the morning session (data/thunai/audit.jsonl) and the cases they asked for
describe("countAsked", () => {
  it.each([
    ["Top three congested road in Chennai currently right now tell me.", 3],
    ["Tell me about the. Top three most congested roads today. In live traffic.", 3],
    ["Tell me the three congested ones which are congested in Anna Nagar.", 3],
    ["open top three cases", 3],
    ["show me the top 3 severe cases", 3],
    ["first five overdue cases in Adyar", 5],
    ["முதல் மூன்று சம்பவங்கள்", 3],
    ["டாப் 3 சாலைகள்", 3],
    ["top moonu cases", 3]
  ])("%s -> %d", (t, n) => expect(countAsked(t)).toBe(n));
  it.each([
    "what is the most congested road",
    "12 students dead in a bus accident",
    "class 12 student died",
    "complaints in zone 9 roads",
    "ward 12 cases",
    "12th standard student missing"
  ])("no count in %s", (t) => expect(countAsked(t)).toBeNull());
});

describe("cityRank", () => {
  it("top three most congested roads", () => expect(cityAsk("Tell me about the. Top three most congested roads today. In live traffic.")).toMatchObject({ topic: "traffic", focus: null, rank: { n: 3, order: "most", by: "road" } }));
  it("top three congested road (no 'most')", () => expect(cityAsk("Top three congested road in Chennai currently right now tell me.")?.rank).toEqual({ n: 3, order: "most", by: "road" }));
  it("which areas have the highest congestion", () => expect(cityAsk("Which areas has highest traffic congestion?")?.rank).toEqual({ n: 3, order: "most", by: "area" }));
  it("which areas least traffic congestion", () => expect(cityAsk("Which areas least traffic congestion?")?.rank).toEqual({ n: 3, order: "least", by: "area" }));
  it("the least congested road", () => expect(cityAsk("What is the least congested road?")?.rank).toEqual({ n: 3, order: "least", by: "road" }));
  it("three congested ones in Anna Nagar", () => expect(cityAsk("Tell me the three congested ones which are congested in Anna Nagar.")?.rank).toEqual({ n: 3, order: "most", by: "road" }));
  it("the single most congested road stays one spot", () => { const a = cityAsk("what is the most congested road now"); expect(a?.focus).toBe("worst-jam"); expect(a?.rank).toBeUndefined(); });
  it("is an area congested: the zone's picture, no ranking", () => expect(cityRank("Is Anna Nagar area congested now?")).toBeNull());
  it("more than 10 min delay is not 'least'", () => expect(cityRank("which roads have more than 10 min delay")).toBeNull());
});
