import { describe, expect, it } from "vitest";
import { cityAsk, lastCityOf } from "./intent";

// v12 (21 Nov): the owner's own sentences from the 06:33-06:42 session, word for word as the speech-to-text wrote them, and the ones the root
// cause report probed; then sentences that belong to other lanes and must read nothing here
describe("cityAsk: the owner's sentences open the city views", () => {
  it.each([
    ["Okay, show me live traffic in map.", { topic: "traffic", focus: null, map: true, rain: null }],
    ["Show me live traffic in the map.", { topic: "traffic", focus: null, map: true, rain: null }],
    ["Show me live traffic.", { topic: "traffic", focus: null, map: false, rain: null }],
    ["Show me the details about the most congested road.", { topic: "traffic", focus: "worst-jam", map: false, rain: null }],
    ["Show me the most congested traffic now.", { topic: "traffic", focus: "worst-jam", map: false, rain: null }],
    ["Tell me details about the repeating traffic.", { topic: "traffic", focus: "repeat", map: false, rain: null }],
    ["Zoom in the map to the most congested area.", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["Zoom the map to the most congested road.", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["take me to the worst jam", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["where do jams keep coming back?", { topic: "traffic", focus: "repeat", map: false, rain: null }],
    ["Where are the flooded roads?", { topic: "flood", focus: null, map: false, rain: null }],
    ["What are the flooded streets in the last rain?", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["Which roads flooded in the last rain?", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["Go to the show me the roads. which was flooded in. Rain. In the last range.", { topic: "flood", focus: null, map: true, rain: "latest" }],
    ["Show the streets that flooded on 21 October", { topic: "flood", focus: null, map: false, rain: "rain-2026-10-21" }],
    ["show the flood-prone areas", { topic: "flood", focus: null, map: false, rain: null }],
    ["Where did water stand on the roads in the previous rain?", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["roads where water stood in the last rein", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["போன பெரிய மழையில எந்த தெருவுல தண்ணி நின்னுச்சு", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["how is the traffic now?", { topic: "traffic", focus: null, map: false, rain: null }],
    ["which roads are congested", { topic: "traffic", focus: null, map: false, rain: null }],
    ["traffic romba jaasthi enga map la", { topic: "traffic", focus: "worst-jam", map: true, rain: null }]
  ])("%s", (said, want) => expect(cityAsk(said)).toEqual(want));

  it("'show me in the map' maps the last answer when one was the city's, and reads nothing without one", () => {
    expect(cityAsk("Okay, now tell me, show me in the map.", { last: "traffic" })).toEqual({ topic: "traffic", focus: null, map: true, rain: null });
    expect(cityAsk("show it on the map", { last: "flood" })).toEqual({ topic: "flood", focus: null, map: true, rain: null });
    expect(cityAsk("Okay, now tell me, show me in the map.")).toBeNull();
    expect(cityAsk("show it on the map", { last: null })).toBeNull();
  });
});

describe("cityAsk: other lanes' sentences read nothing", () => {
  it.each([
    "flooding complaints in Adyar", "traffic obstruction complaints in zone 9", "road damage complaints in Adyar", "show the latest rain news",
    "will it rain tomorrow", "zoom in", "show Teynampet on the map", "Plan my visit to the worst flooded spots tomorrow morning",
    "give me a tour of the flooded places", "replay the last rain", "show severe cases on the map", "open the map",
    "show me the flooding in Velachery", "road accidents this month", "morning briefing on rain and traffic", "make me a traffic dashboard",
    "turn on the schools layer", "news about the traffic diversion on Anna Salai", "how many flooded road complaints this week"
  ])("%s", (said) => expect(cityAsk(said)).toBeNull());

  it("a forecast of flood streets stays the flood streets' (cityTopic's reading), with no past rain", () => {
    expect(cityAsk("which streets will flood tomorrow")).toEqual({ topic: "flood", focus: null, map: false, rain: null });
  });
  it("a page named after 'go to' is no camera move", () => {
    expect(cityAsk("go to trends and show the traffic")?.map).toBe(false);
  });
});

describe("lastCityOf: what the last answer showed", () => {
  it("is the open screen's when it is a city screen, else the last turn's", () => {
    expect(lastCityOf({ recipe: "city", slots: { q: "traffic" } }, [])).toBe("traffic");
    expect(lastCityOf(null, [{ recipe: "city", slots: { q: "flood" } }])).toBe("flood");
    expect(lastCityOf(null, [{ recipe: "city", slots: { q: "traffic" } }, { recipe: "cases", slots: {} }])).toBeNull();
    expect(lastCityOf({ recipe: "cases", slots: {} }, [{ recipe: "city", slots: { q: "traffic" } }])).toBeNull();
    expect(lastCityOf(null, [{ recipe: null }, { recipe: "city", slots: { q: "nonsense" } }])).toBe("all");
  });
});
