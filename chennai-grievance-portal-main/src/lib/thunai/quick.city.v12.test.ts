import { describe, expect, it } from "vitest";
import { START, WORLD } from "./fixture";
import { catIn, cityQuick, quickScreen } from "./quick";
import { understand } from "./understand";

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\s+/g, " ").trim()} `;

// v12 (21 Nov): the owner's sentences of the 06:33-06:42 session reach the city screen with its focus and rain, never a category list
describe("the fast lane opens the city screen with its focus and its rain", () => {
  it.each([
    ["Okay, show me live traffic in map.", { q: "traffic", focus: null, rain: null }],
    ["Show me live traffic.", { q: "traffic", focus: null, rain: null }],
    ["Show me the details about the most congested road.", { q: "traffic", focus: "worst-jam", rain: null }],
    ["Show me the most congested traffic now.", { q: "traffic", focus: "worst-jam", rain: null }],
    ["Tell me details about the repeating traffic.", { q: "traffic", focus: "repeat", rain: null }],
    ["Zoom in the map to the most congested area.", { q: "traffic", focus: "worst-jam", rain: null }],
    ["Where are the flooded roads?", { q: "flood", focus: null, rain: null }],
    ["What are the flooded streets in the last rain?", { q: "flood", focus: null, rain: "latest" }],
    ["Which roads flooded in the last rain?", { q: "flood", focus: null, rain: "latest" }],
    ["Go to the show me the roads. which was flooded in. Rain. In the last range.", { q: "flood", focus: null, rain: "latest" }],
    ["how is the traffic now?", { q: "traffic", focus: null, rain: null }]
  ])("%s", (said, want) => {
    const q = quickScreen(said, WORLD, { analysis: true });
    expect(q?.recipe).toBe("city");
    expect({ q: q?.slots.q, focus: q?.slots.focus, rain: q?.slots.rain }).toEqual(want);
  });

  it("'show me in the map' after a city answer is that answer on the map; without one it reads nothing", () => {
    expect(quickScreen("Okay, now tell me, show me in the map.", WORLD, { lastCity: "traffic" })?.slots).toMatchObject({ q: "traffic" });
    expect(cityQuick("Okay, now tell me, show me in the map.", WORLD)).toBeNull();
  });

  it("a flood or traffic sentence is never a Roads & potholes or traffic-complaints list", () => {
    for (const s of ["Where are the flooded roads?", "Which roads flooded in the last rain?", "Show me the details about the most congested road.", "Okay, show me live traffic in map."]) {
      for (const o of [{}, { noBail: true }, { analysis: true }]) {
        const q = quickScreen(s, WORLD, o);
        expect(q?.slots.cat ?? null, `${s} ${JSON.stringify(o)}`).not.toBe("ROAD_DAMAGE");
        expect(q?.slots.cat ?? null, `${s} ${JSON.stringify(o)}`).not.toBe("TRAFFIC_OBSTRUCTION");
      }
    }
  });

  it("leaves to their own lanes the news, a brief, a dashboard, two requests at once, and complaints", () => {
    for (const s of ["morning briefing on rain and traffic", "make me a traffic dashboard", "show me the traffic and then the flooded streets", "traffic obstruction complaints in zone 9",
      "news about the traffic on Anna Salai", "anything unusual in the traffic this week"]) expect(quickScreen(s, WORLD, { analysis: true })?.recipe ?? null, s).not.toBe("city");
    // a flood complaint is a list of flood complaints (with "flooded" now a word of the category)
    expect(quickScreen("flooded road complaints in Adyar", WORLD)?.slots).toMatchObject({ cat: "FLOOD_WATERLOGGING", zones: [13] });
  });
});

describe("catIn: a broad word is never a category on its own reading", () => {
  it("loses to a more specific word wherever it stands", () => {
    expect(catIn(norm("Where are the flooded roads?"))).toBe("FLOOD_WATERLOGGING");
    expect(catIn(norm("road water logging complaints"))).toBe("FLOOD_WATERLOGGING");
    expect(catIn(norm("road damage complaints in Adyar"))).toBe("ROAD_DAMAGE");
    expect(catIn(norm("water supply complaints"))).toBe("WATER_SUPPLY");
  });
  it("makes no category of a sentence that asks to see the city on the ground", () => {
    expect(catIn(norm("Show me the details about the most congested road."))).toBeNull();
    expect(catIn(norm("Okay, show me live traffic in map."))).toBeNull();
  });
  it("strict (the fast lane's lists, the planner's hint): only beside a word for the records", () => {
    expect(catIn(norm("show the roads in Adyar"), { strict: true })).toBeNull();
    expect(catIn(norm("show the roads in Adyar"))).toBe("ROAD_DAMAGE");
    expect(catIn(norm("road complaints in Adyar"), { strict: true })).toBe("ROAD_DAMAGE");
    expect(catIn(norm("water problems in Adyar"), { strict: true })).toBe("WATER_SUPPLY");
  });
});

describe("understand: the city on the ground is never a filter", () => {
  it.each(["Okay, show me live traffic in map.", "Show me the details about the most congested road.", "Where are the flooded roads?", "What are the flooded streets in the last rain?"])(
    "%s is handed on", (s) => expect(understand(s, START, WORLD).kind).not.toBe("do"));
  it("a flooded-road complaint filter is the flooding, never Roads & potholes", () => {
    const u = understand("only flooded road complaints", START, WORLD);
    expect(u.kind).toBe("do");
    expect(u.kind === "do" && u.steps.find((x) => x.a === "view")).toMatchObject({ view: { cat: "FLOOD_WATERLOGGING" } });
  });
});
