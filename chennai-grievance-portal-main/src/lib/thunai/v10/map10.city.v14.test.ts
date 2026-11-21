/**
 * v14 (21 Nov review 13 of the v13 city routing), the map lane (map10.ts):
 *   - routing 0: a zone said with live traffic is carried ("the worst jam in Adyar" opened and named Teynampet's jam); a camera move to a zone
 *     with no jam or worst said is that zone's live traffic, not the district's worst jam;
 *   - routing 5: "show me in the map" after a zone's answer keeps the zone;
 *   - routing 9: "zoom there", "take me there", "zoom to that road" after the most congested answer go back to that spot;
 *   - routing 10: "hide the live traffic", "turn off the traffic view" put the view away;
 *   - scenarios 4: "show its complaints on the map" is the open screen's subject, or not the map's question at all.
 */
import { describe, expect, it } from "vitest";
import { START, WORLD } from "../fixture";
import { v10Front, type BrowserCtx10 } from "./browser10";
import { mapCommand10, type MapCtx10 } from "./map10";

const closed: MapCtx10 = { open: false, hasAnswer: false, lang: "en" };
const cmd = (s: string, c: Partial<MapCtx10> = {}) => mapCommand10(s, { ...closed, ...c });

describe("v14 routing 0: the zone of a live traffic sentence", () => {
  it.each([
    ["Zoom to the worst jam in Adyar", { op: "city", topic: "traffic", focus: "worst-jam", rain: null, zone: 13 }],
    ["Show the most congested road in Adyar on the map", { op: "city", topic: "traffic", focus: "worst-jam", rain: null, zone: 13 }],
    // (a camera move to a zone with no jam or worst said: the zone's live traffic)
    ["Show live traffic and zoom to Adyar", { op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }],
    ["Take me to Adyar traffic", { op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }],
    ["Focus on the traffic in Adyar", { op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }],
    ["Show me the traffic in Adyar on the map", { op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }],
    ["Show the repeating traffic in Teynampet on the map", { op: "city", topic: "traffic", focus: "repeat", rain: null, zone: 9 }]
  ])("%s", (said, want) => expect(cmd(said)).toEqual(want));
  it("no zone said: the district, as before (the owner's sentences unchanged)", () => {
    expect(cmd("Zoom in the map to the most congested area")).toEqual({ op: "city", topic: "traffic", focus: "worst-jam", rain: null });
    expect(cmd("Go to the map, show live traffic and zoom to the worst jam")).toEqual({ op: "city", topic: "traffic", focus: "worst-jam", rain: null });
    expect(cmd("Show me live traffic in the map")).toEqual({ op: "city", topic: "traffic", focus: null, rain: null });
  });
  it("a locality the console places in a zone is that zone (the fixture's places)", () => {
    const place = WORLD.places.find((p) => p.zone != null && p.name.length >= 5 && !/\s/.test(p.name));
    if (!place) return;
    expect(cmd(`Show live traffic in ${place.name} on the map`, { world: WORLD })).toMatchObject({ op: "city", topic: "traffic", zone: place.zone });
  });
});

describe("v14 routing 5: 'show me in the map' after a zone's answer keeps the zone", () => {
  it("the zone, with the spot when there was one", () => {
    expect(cmd("Okay, now tell me, show me in the map", { lastCity: { topic: "traffic", focus: null, zone: 13 } })).toEqual({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 });
    const last = { topic: "traffic" as const, focus: "worst-jam" as const, spot: "adyar-10", lat: 13, lon: 80.256, zone: 13 };
    expect(cmd("show it on the map", { lastCity: last })).toEqual({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "adyar-10", lat: 13, lon: 80.256 }, zone: 13 });
  });
});

describe("v14 scenarios 0: 'show it on the map' after the power-in-rain answer is that answer's", () => {
  it("power and trains last: their Rain tab, though no rain is said again; 'power cuts on the map' alone is still the map's question", () => {
    expect(cmd("Show it on the map", { lastCity: { topic: "power" }, rainOpen: true })).toEqual({ op: "city", topic: "power", focus: null, rain: null });
    expect(cmd("Okay, now tell me, show me in the map", { lastCity: { topic: "metro" } })).toEqual({ op: "city", topic: "metro", focus: null, rain: null });
    expect(cmd("Show me power cuts on the map", { lastCity: { topic: "power" } })?.op).toBe("ask");
  });
});

describe("v14 routing 9: a camera move to the thing just shown", () => {
  const last = { topic: "traffic" as const, focus: "worst-jam" as const, rain: null, spot: "tt-very-12", lat: 13.06, lon: 80.25 };
  it.each(["zoom to that road", "zoom into that road", "zoom to that spot", "zoom there", "zoom to it", "take me there", "fly there", "zoom in there", "go there"])("%s: that spot", (s) => {
    expect(cmd(s, { lastCity: last })).toEqual({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "tt-very-12", lat: 13.06, lon: 80.25 } });
  });
  it("a zone's live traffic with no spot: the camera to the zone; no city answer: the console's own zoom, never an Ask the Map question", () => {
    expect(cmd("zoom there", { lastCity: { topic: "traffic", zone: 13 } })).toEqual({ op: "zoom", place: "Adyar" });
    expect(cmd("zoom to that road")).toBeNull();
    expect(cmd("zoom there")).toBeNull();
    expect(cmd("zoom there", { lastCity: { topic: "flood", rain: "latest" } })).toBeNull();
    // (a place is still a place)
    expect(cmd("zoom to Adyar")).toEqual({ op: "zoom", place: "Adyar" });
  });
});

describe("v14 routing 10: putting the Live traffic view away", () => {
  it.each(["Hide the live traffic", "Turn off the traffic view", "hide traffic", "switch off live traffic", "close the traffic view", "close live traffic", "turn the live traffic off"])("%s", (s) => {
    expect(cmd(s, { trafficOpen: true })).toEqual({ op: "city", topic: "traffic", act: "close" });
  });
  it("a request to see after it, the records, a filter, or Rain's own traffic tab are not it", () => {
    expect(cmd("close this and show me live traffic")?.act).not.toBe("close");
    expect(cmd("hide the traffic complaints")).not.toEqual({ op: "city", topic: "traffic", act: "close" });
    expect(cmd("remove the traffic filter")).not.toEqual({ op: "city", topic: "traffic", act: "close" });
    expect(cmd("close the traffic tab", { rainOpen: true })).not.toEqual({ op: "city", topic: "traffic", act: "close" });
  });
  it("Rain & flooding open: 'hide rain and flooding' closes it", () => {
    expect(cmd("hide rain and flooding", { rainOpen: true })).toEqual({ op: "rain", act: "close" });
  });
  it("v10Front sends it to the map lane, before the rules could read a traffic-complaints filter in it", () => {
    const c = { stage: null, state: START, world: WORLD, listenLang: "en", source: "typed", askMap: { ...closed, trafficOpen: true } } as unknown as BrowserCtx10;
    expect(v10Front("Hide the live traffic", c)?.lane).toMatchObject({ lane: "map", cmd: { op: "city", act: "close" } });
  });
});

describe("v14 scenarios 4: 'its complaints' on the map", () => {
  it("the open screen's zone or kind is asked", () => {
    expect(cmd("Show its complaints on the map", { subject: { place: "Adyar", what: null } })).toMatchObject({ op: "ask", question: "complaints in Adyar" });
    expect(cmd("Show their cases on the map", { subject: { place: null, what: "Flooding & waterlogging" } })).toMatchObject({ op: "ask" });
    expect(cmd("Show their cases on the map", { subject: { place: null, what: "Flooding & waterlogging" } })?.question).toMatch(/^flooding .*cases$/i);
  });
  it("with no subject known it is not the map's question (it asked the map 'its complaints')", () => {
    for (const s of ["Show its complaints on the map", "put their complaints on the map", "show that zone's complaints on the map", "show its cases on the map"]) expect(cmd(s), s).toBeNull();
    // (a real question is still asked)
    expect(cmd("Show garbage complaints near schools on the map")?.op).toBe("circle");
  });
});
