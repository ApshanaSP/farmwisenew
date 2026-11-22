/**
 * v14 (21 Nov review 13 of the v13 city screens in place), cityopen.ts, the pure parts Thunai.tsx reads:
 *   - routing 5: a zone's live traffic opens the Live traffic view on that zone;
 *   - scenarios 8: a view already open on the same thing is not opened again (Rain moves in place);
 *   - routing 1: close, back, full screen, table and "details" said about the in-place screen;
 *   - scenarios 0 / routing 8: which turns keep the last city answer;
 *   - scenarios 4: the open screen's subject, for "show its complaints on the map".
 */
import { describe, expect, it } from "vitest";
import { cityBridgeArgs, cityOpenOf, cityViewMove, inPlaceCommand, keepsLastCity, screenSubject, VIEW_CLOSED } from "./cityopen";
import { localStageCommand } from "@/lib/thunai/stagelocal";
import { smallTalk } from "@/lib/thunai/v11/smalltalk";

describe("v14 routing 5: a zone's live traffic opens on that zone", () => {
  it("one zone: the view's zone filter; none, two or a bogus one: the district, as before", () => {
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", zones: [13] }, blocks: [] })?.detail).toEqual({ kind: "traffic", zone: 13 });
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", zones: [] }, blocks: [] })?.detail).toEqual({ kind: "traffic" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", zones: [9, 13] }, blocks: [] })?.detail).toEqual({ kind: "traffic" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", zones: ["13"] }, blocks: [] })?.detail).toEqual({ kind: "traffic" });
    expect(cityOpenOf({ recipe: "city", slots: { q: "traffic", zones: [99] }, blocks: [] })?.detail).toEqual({ kind: "traffic" });
  });
  it("the zone's worst jam: its spot and its zone; the whole city never takes a zone", () => {
    const doc = { recipe: "city", slots: { q: "traffic", zones: [13], focus: "worst-jam" }, blocks: [{ kind: "MapView", id: "spot", points: [{ id: "adyar-10", lat: 13, lon: 80.256, label: "LB Road" }] }] };
    expect(cityOpenOf(doc)?.detail).toEqual({ kind: "traffic", spot: "adyar-10", lat: 13, lon: 80.256, zone: 13 });
    expect(cityOpenOf({ recipe: "city", slots: { q: "all", zones: [13] }, blocks: [] })?.detail).toEqual({ kind: "traffic" });
  });
});

describe("v14 scenarios 8: the view already open is not remounted", () => {
  const ov = (o: Partial<Parameters<typeof cityViewMove>[1]>) => ({ page: "overview", traffic: null, rain: null, ...o });
  it("Live traffic on the same spot (or the same plain view, zone, tab): same; another spot, zone or page: open afresh", () => {
    expect(cityViewMove({ kind: "traffic", spot: "tt-very-12", lat: 13.06, lon: 80.25 }, ov({ traffic: { spot: "tt-very-12", cluster: null, tab: null } }))).toBe("same");
    expect(cityViewMove({ kind: "traffic" }, ov({ traffic: { spot: null, cluster: null, tab: null } }))).toBe("same");
    expect(cityViewMove({ kind: "traffic", zone: 13 }, ov({ traffic: { spot: null, zone: 13 } }))).toBe("same");
    expect(cityViewMove({ kind: "traffic", tab: "repeat" }, ov({ traffic: { spot: null, tab: "repeat" } }))).toBe("same");
    expect(cityViewMove({ kind: "traffic", spot: "a" }, ov({ traffic: { spot: "b" } }))).toBe("open");
    expect(cityViewMove({ kind: "traffic", zone: 13 }, ov({ traffic: { spot: null } }))).toBe("open");
    expect(cityViewMove({ kind: "traffic" }, ov({}))).toBe("open");
    expect(cityViewMove({ kind: "traffic", spot: "a" }, ov({ page: "trends", traffic: { spot: "a" } }))).toBe("open");
  });
  it("Rain & flooding open: moved in place to the tab and the rain (every rain when none); closed: opened", () => {
    expect(cityViewMove({ kind: "rain", lens: "flood" }, ov({ rain: { rain: null } }))).toBe("bridge");
    expect(cityViewMove({ kind: "rain", lens: "flood", replay: "latest" }, ov({ rain: { rain: "rain-2026-10-21", lens: undefined } }))).toBe("bridge");
    expect(cityViewMove({ kind: "rain", lens: "power" }, ov({}))).toBe("open");
    expect(cityViewMove({ kind: "rain", lens: "power" }, ov({ page: "trends", rain: { rain: null } }))).toBe("open");
    expect(cityBridgeArgs({ kind: "rain", lens: "flood" })).toEqual({ tab: "flooding", rain: "all" });
    expect(cityBridgeArgs({ kind: "rain", lens: "flood", replay: "latest" })).toEqual({ tab: "flooding", rain: "latest" });
    expect(cityBridgeArgs({ kind: "rain", lens: "power" })).toEqual({ tab: "power", rain: "all" });
  });
});

describe("v14 routing 1: commands said about the in-place screen", () => {
  const ip = (s: string) => inPlaceCommand(s, localStageCommand(s));
  it("close, done: the view and the card close; go back: one level back, else close", () => {
    for (const s of ["close", "close it", "Close this", "done"]) expect(ip(s), s).toBe("close");
    expect(ip("go back")).toBe("back");
  });
  it("full screen, expand it, details, show details, open the details, open it: the Stage opens on it", () => {
    for (const s of ["full screen", "expand it", "details", "Show details.", "show me the details", "open the details", "open it", "விவரங்கள்"]) expect(ip(s), s).toBe("details");
  });
  it("show it as a table: the Stage opens on it as a table; the map view and anything else: not these", () => {
    expect(ip("show it as a table")).toBe("view");
    expect(inPlaceCommand("show it on the map", { op: "view", view: "map" })).toBeNull();
    for (const s of ["next", "show me live traffic", "what about power"]) expect(ip(s), s).toBeNull();
  });
  it("what is said when a view is closed", () => {
    expect(VIEW_CLOSED.traffic.en).toBe("Live traffic is closed.");
    expect(VIEW_CLOSED.rain.en).toBe("Rain and flooding is closed.");
  });
});

describe("v14 scenarios 0, routing 8: the last city answer belongs to the last answer", () => {
  const keeps = (heard: string, did: string, doc: { recipe?: string } | null = null) => keepsLastCity(heard, did, doc, (s) => !!smallTalk(s));
  it("a city screen, a command on it, a camera move, small talk, a map op still at work and a turn that answered nothing keep it", () => {
    expect(keeps("Show me the most congested traffic now", "showed a city screen", { recipe: "city" })).toBe(true);
    expect(keeps("close", "on the Stage: close", { recipe: "city" })).toBe(true);
    expect(keeps("zoom in a bit", "Ask the Map: zoom")).toBe(true);
    expect(keeps("zoom in", "Zoom in")).toBe(true);
    expect(keeps("thanks", "answered in words")).toBe(true);
    expect(keeps("show me live traffic", "Ask the Map: city (still working)")).toBe(true);
    expect(keeps("what is happening", "took too long: nothing was answered")).toBe(true);
  });
  it("words, another screen, the news, an Ask the Map answer, a Rain op, console steps put it away", () => {
    expect(keeps("What about power if it rains tonight?", "answered in words")).toBe(false);
    expect(keeps("How many complaints are open in Adyar?", "showed a cases screen", { recipe: "cases" })).toBe(false);
    expect(keeps("any news on the cyclone", "read the news report and other outlets' coverage aloud, with links")).toBe(false);
    expect(keeps("Show garbage complaints near schools on the map", "Ask the Map: ask")).toBe(false);
    expect(keeps("Show me the flood prone streets", "Ask the Map: rain")).toBe(false);
    expect(keeps("go to trends", "Trends")).toBe(false);
    expect(keeps("refused", "refused")).toBe(false);
  });
});

describe("v14 scenarios 4: the open screen's subject", () => {
  it("its zone and its kind of complaint; the whole district: none", () => {
    expect(screenSubject({ scope: { zone: 13, cat: null } })).toEqual({ place: "Adyar", what: null });
    expect(screenSubject({ scope: { zone: null, cat: "FLOOD_WATERLOGGING" } })?.what).toMatch(/flood/i);
    expect(screenSubject({ scope: { zone: null, cat: null } })).toBeNull();
    expect(screenSubject(null)).toBeNull();
    expect(screenSubject({ scope: { zone: 42 as number, cat: "NOPE" } })).toBeNull();
  });
});
