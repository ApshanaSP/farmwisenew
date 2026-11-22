/**
 * v13 (21 Nov review of v12's city routing), the map lane: the city op takes only the city view's sentences (finding 0 8: a nearness to a
 * kind of place, reports, power or trains with no rain, the flood streets with a place named are Ask the Map's), and "show me in the map"
 * after a city answer carries that answer's spot (1 7). The owner's map sentences stay the city op.
 */
import { describe, expect, it } from "vitest";
import { START, WORLD } from "../fixture";
import { v10Front, type BrowserCtx10 } from "./browser10";
import { mapCommand10, type MapCtx10 } from "./map10";

const closed: MapCtx10 = { open: false, hasAnswer: false, lang: "en" };
const cmd = (s: string, c: Partial<MapCtx10> = {}) => mapCommand10(s, { ...closed, ...c });

describe("v13: the owner's map sentences are the city op", () => {
  it.each([
    ["Zoom in the map to the most congested area", { op: "city", topic: "traffic", focus: "worst-jam", rain: null }],
    ["Show me live traffic in the map", { op: "city", topic: "traffic", focus: null, rain: null }],
    ["What are the flooded streets in the last rain?", { op: "city", topic: "flood", focus: null, rain: "latest" }],
    ["Go to the map, show live traffic and zoom to the worst jam", { op: "city", topic: "traffic", focus: "worst-jam", rain: null }],
    ["which wards lose power in heavy rain on the map", { op: "city", topic: "power", focus: null, rain: null }]
  ])("%s", (said, want) => expect(cmd(said)).toEqual(want));
  it("the questions that name no map are the server's city screen", () => {
    expect(cmd("Where are the flooded roads?")).toBeNull();
    expect(cmd("Show me the most congested traffic now")).toBeNull();
  });
  it("v10Front sends the zoom sentence to the map lane", () => {
    const c = { stage: null, state: START, world: WORLD, listenLang: "en", askMap: closed } as unknown as BrowserCtx10;
    expect(v10Front("Zoom in the map to the most congested area", c)?.lane).toMatchObject({ lane: "map", cmd: { op: "city", focus: "worst-jam" } });
  });
});

describe("v13 finding 0 8: Ask the Map keeps its questions that only hold a city word", () => {
  it("power cuts on the map are the map's question, not the heavy-rain power tab", () => {
    expect(cmd("Show me power cuts on the map")?.op).toBe("ask");
  });
  it("a nearness to a kind of place is the map's", () => {
    expect(cmd("Show traffic jams near schools on the map")?.op).not.toBe("city");
  });
  it("the reports are the map's", () => {
    expect(cmd("Show flooded road reports on the map")?.op).not.toBe("city");
  });
  it("the flood streets with a place named are that place's flooding", () => {
    expect(cmd("Show the flooded streets in Velachery on the map")?.op).not.toBe("city");
  });
});

describe("v13 finding 1 7: 'show me in the map' carries the last answer's spot", () => {
  it("after the most congested road: its focus and its spot", () => {
    const last = { topic: "traffic" as const, focus: "worst-jam" as const, rain: null, spot: "tt-very-12", lat: 13.06, lon: 80.25 };
    expect(cmd("Okay, now tell me, show me in the map", { lastCity: last })).toEqual({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "tt-very-12", lat: 13.06, lon: 80.25 } });
  });
  it("after the last rain's streets: that rain", () => {
    expect(cmd("show it on the map", { lastCity: { topic: "flood", rain: "latest" } })).toEqual({ op: "city", topic: "flood", focus: null, rain: "latest" });
  });
  it("with the city screen still open in place, v10Front sends it to the map lane (before the Stage's own lanes)", () => {
    const doc = { v: 1, id: "st-x", recipe: "city", title: "Most congested now: Anna Salai", takeaway: null, say: { en: "x", ta: "x" }, scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null },
      slots: { q: "traffic", focus: "worst-jam" }, sources: [], asOf: null, notes: [], lang: "en",
      blocks: [{ kind: "MapView", id: "spot", title: "x", points: [{ n: 1, id: "tt-very-12", lat: 13.06, lon: 80.25, label: "Anna Salai", sev: null, value: null, hot: true }] }] };
    const last = { topic: "traffic" as const, focus: "worst-jam" as const, rain: null, spot: "tt-very-12", lat: 13.06, lon: 80.25 };
    const c = { stage: doc, state: START, world: WORLD, listenLang: "en", askMap: { ...closed, lastCity: last } } as unknown as BrowserCtx10;
    expect(v10Front("Okay, now tell me, show me in the map", c)?.lane).toMatchObject({ lane: "map", cmd: { op: "city", topic: "traffic", focus: "worst-jam", spot: { id: "tt-very-12" } } });
  });
  it("a topic alone, as v12's callers pass it, still works; nothing last, nothing asked", () => {
    expect(cmd("Okay, now tell me, show me in the map", { lastCity: "traffic" })).toEqual({ op: "city", topic: "traffic", focus: null, rain: null });
    expect(cmd("Okay, now tell me, show me in the map", { lastCity: null })).toBeNull();
  });
});
