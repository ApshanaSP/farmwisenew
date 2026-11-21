import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { v10Front, type BrowserCtx10 } from "./browser10";
import { mapCommand10, type MapCtx10 } from "./map10";

// v12 (21 Nov): the owner's map sentences of the 06:33-06:42 session, and the camera by voice (the owner on 20 Nov)
const closed: MapCtx10 = { open: false, hasAnswer: false, lang: "en" };
const cmd = (s: string, c: Partial<MapCtx10> = {}) => mapCommand10(s, { ...closed, ...c });

describe("map10: the city on the map is the city view, never an Ask the Map question", () => {
  it.each([
    ["Okay, show me live traffic in map.", { op: "city", topic: "traffic", focus: null, rain: null }],
    ["Show me live traffic in the map.", { op: "city", topic: "traffic", focus: null, rain: null }],
    ["Zoom in the map to the most congested area.", { op: "city", topic: "traffic", focus: "worst-jam", rain: null }],
    ["take me to the worst jam", { op: "city", topic: "traffic", focus: "worst-jam", rain: null }],
    ["Go to the show me the roads. which was flooded in. Rain. In the last range.", { op: "city", topic: "flood", focus: null, rain: "latest" }],
    ["What are the flooded streets in the last rain?", { op: "city", topic: "flood", focus: null, rain: "latest" }],
    ["show the jams that keep coming back on the map", { op: "city", topic: "traffic", focus: "repeat", rain: null }]
  ])("%s", (said, want) => expect(cmd(said)).toEqual(want));

  it("'Okay, now tell me, show me in the map.' maps the last city answer; with none, nothing is asked of the map (06:38, 34 s)", () => {
    expect(cmd("Okay, now tell me, show me in the map.", { lastCity: "traffic" })).toEqual({ op: "city", topic: "traffic", focus: null, rain: null });
    expect(cmd("Okay, now tell me, show me in the map.")).toBeNull();
    expect(cmd("Okay, now tell me, show me in the map.", { open: true })).toBeNull();
  });
  it("a city question that names no map and no past rain is the server's city screen", () => {
    expect(cmd("Where are the flooded roads?")).toBeNull();
    expect(cmd("Show me live traffic.")).toBeNull();
  });
  it("an ask keeps its content and loses the words of talking", () => {
    expect(cmd("show me garbage complaints in the map")).toMatchObject({ op: "ask", question: "garbage complaints" });
    expect(cmd("okay now show me the open flooding complaints on the map")).toMatchObject({ op: "ask", question: "the open flooding complaints" });
    expect(cmd("show me on the map")).toEqual({ op: "ask", question: null });
  });
  it("the tour, a visit plan and Rain's own words keep their grammar", () => {
    expect(cmd("give me a tour of the flooded places")?.op).toBe("tour");
    expect(cmd("Plan my visit to the worst flooded spots tomorrow morning")?.op).toBe("visit");
    expect(cmd("replay the last rain")).toMatchObject({ op: "rain", rain: "latest" });
  });
});

describe("map10: the camera by voice", () => {
  it.each([
    ["zoom out", { op: "zoom", zoom: "out" }],
    ["zoom out a bit", { op: "zoom", zoom: "out" }],
    ["zoom in a little more", { op: "zoom", zoom: "in" }],
    ["Zoom into the roads so that I can see the roads.", { op: "zoom", zoom: "in" }],
    ["Zoom into the roads.", { op: "zoom", zoom: "in" }],
    ["zoom to Adyar", { op: "zoom", place: "Adyar" }]
  ])("%s", (said, want) => expect(cmd(said)).toEqual(want));
  it("a road the console cannot place is asked of the map, which resolves roads", () => {
    const c = cmd("Zoom into Nerkundram Pathai Ashok Nagar Second Avenue Road.");
    expect(c?.op).toBe("ask");
    expect(c?.question).toMatch(/^what is happening around nerkundram pathai ashok nagar second avenue road/);
  });
  it("'zoom in' alone and 'zoom to it' stay the console's own zoom (the open incident, the last place)", () => {
    expect(cmd("zoom in")).toBeNull();
    expect(cmd("zoom to it")).toBeNull();
  });
});

describe("v10Front: the map lane takes the owner's flood sentence before any other lane", () => {
  const world = { ...WORLD, ...referenceWorld() };
  const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
  const c: BrowserCtx10 = { stage: null, news: { items: [] }, state, world, listenLang: "en", heardLang: "en", v7: true, lex: [], askMap: { open: false, hasAnswer: false } };
  it("'Go to the show me the roads. which was flooded in. Rain. In the last range.' is Rain & flooding on the last rain", () => {
    const f = v10Front("Go to the show me the roads. which was flooded in. Rain. In the last range.", c);
    expect(f.lane).toMatchObject({ lane: "map", cmd: { op: "city", topic: "flood", rain: "latest" } });
  });
  it("'Okay, now tell me, show me in the map.' after the traffic is the traffic on the map", () => {
    const f = v10Front("Okay, now tell me, show me in the map.", { ...c, askMap: { open: false, hasAnswer: false, lastCity: "traffic" } });
    expect(f.lane).toMatchObject({ lane: "map", cmd: { op: "city", topic: "traffic" } });
  });
});
