/**
 * v13 (21 Nov review of v12's city routing): the shared city reading no longer takes report, follow-up and owner questions about flooded
 * roads (finding 0 2), nor "close / hide / turn off the traffic view" (0 7); the Tamil-script "the current goes when it rains" is power (1 4);
 * and "show me in the map" after a city answer reopens that answer's focus, rain and spot (1 7). The owner's own sentences of 21 Nov stay
 * the city's.
 */
import { describe, expect, it } from "vitest";
import { cityAsk, cityLastOf, lastCitySlotsOf, refersToMap } from "./intent";
import { cityTopic } from "./topic";
import { rehearsalIntent } from "@/lib/rehearsal/intent";

describe("v13: the owner's sentences still open the city views", () => {
  it.each([
    ["Where are the flooded roads?", { topic: "flood", focus: null, map: false, rain: null }],
    ["What are the flooded streets in the last rain?", { topic: "flood", focus: null, map: false, rain: "latest" }],
    ["Zoom in the map to the most congested area", { topic: "traffic", focus: "worst-jam", map: true, rain: null }],
    ["Show me the most congested traffic now", { topic: "traffic", focus: "worst-jam", map: false, rain: null }],
    ["Show me live traffic in the map", { topic: "traffic", focus: null, map: true, rain: null }],
    ["Go to the map, show live traffic and zoom to the worst jam", { topic: "traffic", focus: "worst-jam", map: true, rain: null }]
  ])("%s", (said, want) => expect(cityAsk(said)).toEqual(want));
});

describe("v13 finding 0 2: the records, their follow-up and who handles them are not the flood streets", () => {
  it.each([
    "Any reports of flooded streets today?",
    "How many reports of waterlogged roads came in today?",
    "What is the update on the flooded subway in Velachery?",
    "Which department handles the flooded roads?",
    "Who is responsible for the flooded streets in Adyar?",
    "Show the flooded roads reported by citizens",
    "What did the papers say about the flooded subway?",
    "Which roads are flooded now?",
    "Show me the traffic issues reported this week",
    "How many traffic problems were reported this week?"
  ])("%s reads nothing", (said) => expect(cityAsk(said)).toBeNull());

  it("live traffic said with 'now' keeps a problems word; a past rain keeps a leading 'now'; a forecast keeps its day", () => {
    expect(cityAsk("Any traffic problems right now?")?.topic).toBe("traffic");
    expect(cityAsk("Now show the flooded streets in the last rain")).toMatchObject({ topic: "flood", rain: "latest" });
    expect(cityAsk("which streets will flood today")?.topic).toBe("flood");
  });
});

describe("v13 finding 0 7: putting a view away is no request to see it", () => {
  it.each(["Close the traffic view", "Hide live traffic", "Turn off the traffic view", "turn the traffic view off", "switch off live traffic", "okay close the rain and flooding view",
    "traffic view close pannu"])("%s reads nothing", (said) => expect(cityAsk(said)).toBeNull());
  it("opening it still is, and so is a request to see that follows the close", () => {
    expect(cityAsk("open the traffic view")?.topic).toBe("traffic");
    expect(cityAsk("show live traffic")?.topic).toBe("traffic");
    expect(cityAsk("close this and show me live traffic")?.topic).toBe("traffic");
  });
});

describe("v13 finding 1 4: the Tamil-script power-in-rain question", () => {
  it("is power for the city reading and for Rain's lens", () => {
    // (the owner's Tamil sentence: where does the current go when it rains)
    const said = "மழை வந்தா கரண்ட் எங்க போகும்?";
    expect(cityTopic(said)).toBe("power");
    expect(cityAsk(said)).toEqual({ topic: "power", focus: null, map: false, rain: null });
    expect(rehearsalIntent(said)?.lens).toBe("power");
  });
  it("other ways of saying it, and the old ones", () => {
    expect(cityTopic("கனமழையில கரண்ட் போயிடும்")).toBe("power");
    expect(cityTopic("மழையில மின்சாரம் துண்டிக்கப்படும் இடங்கள்")).toBe("power");
    expect(cityTopic("கரண்ட் இல்லை")).toBe("power");
    expect(cityTopic("மின் வெட்டு எங்கே")).toBe("power");
  });
});

describe("v13 finding 1 7: 'show me in the map' reopens the last city answer as it was", () => {
  const spotDoc = { recipe: "city", slots: { q: "traffic", focus: "worst-jam", rain: null },
    blocks: [{ kind: "Kpis", id: "spot-kpis" }, { kind: "MapView", id: "spot", points: [{ id: "tt-very-12", lat: 13.06, lon: 80.25, label: "Anna Salai" }] }] };
  it("lastCitySlotsOf keeps the focus, the rain and the spot of the open screen, or the slots of the last city turn", () => {
    expect(lastCitySlotsOf(spotDoc)).toEqual({ topic: "traffic", focus: "worst-jam", rain: null, spot: "tt-very-12", lat: 13.06, lon: 80.25 });
    expect(lastCitySlotsOf(null, [{ recipe: "city", slots: { q: "flood", rain: "latest" } }])).toEqual({ topic: "flood", focus: null, rain: "latest", spot: null, lat: null, lon: null });
    expect(lastCitySlotsOf({ recipe: "cases", slots: {} }, [{ recipe: "city", slots: { q: "traffic" } }])).toBeNull();
    expect(lastCitySlotsOf(null, [{ recipe: "city", slots: { q: "flood", rain: "javascript:x", focus: "bogus" } }])).toMatchObject({ rain: null, focus: null });
  });
  it("cityAsk's reference to the map carries the focus and the rain; a topic alone works as before", () => {
    expect(cityAsk("Okay, now tell me, show me in the map.", { last: lastCitySlotsOf(spotDoc) })).toEqual({ topic: "traffic", focus: "worst-jam", map: true, rain: null });
    expect(cityAsk("show it on the map", { last: { topic: "flood", rain: "latest" } })).toEqual({ topic: "flood", focus: null, map: true, rain: "latest" });
    expect(cityAsk("show it on the map", { last: "traffic" })).toEqual({ topic: "traffic", focus: null, map: true, rain: null });
    expect(cityAsk("show it on the map", { last: null })).toBeNull();
    expect(cityLastOf("flood")).toEqual({ topic: "flood" });
    expect(refersToMap("Okay, now tell me, show me in the map.")).toBe(true);
    expect(refersToMap("Show me live traffic in the map.")).toBe(false);
  });
});
