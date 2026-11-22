/**
 * v14 (21 Nov review 13 of the v13 city screens in place), the browser's map operations (mapops.ts):
 *   - routing 0: a zone's question is answered from that zone's jams ("the worst jam in Adyar" named Teynampet's 30-minute jam);
 *   - scenarios 7: a city op says what it opened (the jam it picked, with where it is), so "show me in the map" finds that jam again;
 *   - routing 8 / scenarios 0: every map op writes the last city answer (cityAfterMap);
 *   - routing 10: "hide the live traffic" closes the view and says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Console } from "../CollectorApp";
import { cityAfterMap, cityShownBy, consoleMapDeps, mapSnap10, resetMapOps, runMapCmd, type MapLine, type MapOpsDeps } from "./mapops";

const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "x", why: "A jam." };
const spot = (id: string, level: string, delayMin: number, zone: number, zoneName: string, name: string, lat: number, lon: number) => ({ id, level, kind: "Jam", label: "Queuing traffic", name, road: null, from: null, to: null,
  delayMin, delayS: delayMin * 60, lengthM: 900, magnitude: 3, path: [[lat, lon], [lat + 0.001, lon]], lat, lon, ward: null, zone, zoneName, owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
const cluster = (id: string, zone: number, zoneName: string, name: string, lat: number, lon: number) => ({ id, name, zone, zoneName, ward: null, lat, lon, spots: [], level: "congested", delayMin: 5,
  reports: [{ id: "r1" }, { id: "r2" }], open: 1, owner, why: "x" });
// the reviewers' probe p5: LB Road in Adyar (zone 13, 10 min) and Anna Salai in Teynampet (zone 9, 30 min)
const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:45:00.000Z", why: null, source: "TomTom",
  counts: { total: 3, jams: 3, very: 2, congested: 1, slow: 0, closed: 0, flooded: 0, accidents: 0, works: 0, action: 3, clusters: 1 },
  spots: [spot("adyar-10", "very", 10, 13, "Adyar", "LB Road, Adyar", 13.0, 80.256), spot("teyn-30", "very", 30, 9, "Teynampet", "Anna Salai, Teynampet", 13.04, 80.25),
    spot("adyar-c", "congested", 4, 13, "Adyar", "Sardar Patel Road", 13.01, 80.24)],
  clusters: [cluster("tc-teyn", 9, "Teynampet", "Cathedral Road", 13.05, 80.25)],
  zones: [{ zone: 9, name: "Teynampet", jams: 1, very: 1, delayMin: 30 }, { zone: 13, name: "Adyar", jams: 2, very: 1, delayMin: 10 }], window: { from: "", to: "" }
};

function deps(o: { current?: { spot: string | null; cluster: string | null; tab: "repeat" | null; zone?: number | null } | null } = {}) {
  const calls = { open: [] as unknown[], points: [] as unknown[], cleared: 0, closed: 0 };
  const d: MapOpsDeps = {
    lang: "en", settled: async () => undefined,
    map: () => ({ ask: async () => null, setGrown: () => undefined } as never), openMap: () => undefined,
    fetch: vi.fn(async () => new Response(JSON.stringify(TRAFFIC), { status: 200 })) as unknown as typeof fetch,
    traffic: { open: (x) => calls.open.push(x), current: () => o.current ?? null, close: () => { calls.closed++; } }, point: (p) => calls.points.push(p),
    clearStage: () => { calls.cleared++; },
    rain: { isOpen: () => false, open: () => undefined }, bridge: () => ({ ok: true, state: {} }) as never
  };
  return { d, calls };
}
const run = (c: Parameters<typeof runMapCmd>[0], d: MapOpsDeps) => runMapCmd(c, d) as Promise<MapLine | null>;
beforeEach(() => resetMapOps());

describe("v14 routing 0: the zone's own jams", () => {
  it("the worst jam in Adyar is Adyar's (LB Road), the view on Adyar's filter; never Teynampet's 30-minute jam", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, zone: 13 }, d);
    expect(calls.open).toEqual([{ spot: "adyar-10", lat: 13.0, lon: 80.256, zone: 13 }]);
    expect(l?.en).toMatch(/^LB Road, Adyar \(Adyar\) is the most congested now/);
    expect(l?.en).not.toMatch(/Teynampet|30 min/);
  });
  it("a zone's plain live traffic: its own counts, the view on its filter", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }, d);
    expect(calls.open).toEqual([{ zone: 13 }]);
    expect(l?.en).toBe("Live traffic in Adyar is on the map: 1 very congested, 1 congested. Say zoom to the worst jam.");
  });
  it("no jam or trouble spot in the zone: said so for that zone, never another zone's", async () => {
    const a = deps();
    expect((await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, zone: 1 }, a.d))?.en).toBe("No road in Thiruvottiyur is congested right now.");
    const b = deps();
    expect((await run({ op: "city", topic: "traffic", focus: "repeat", rain: null, zone: 13 }, b.d))?.en).toMatch(/^No live jam in Adyar stands where reports keep coming back/);
    expect(b.calls.open).toEqual([{ cluster: null, tab: "repeat", lat: null, lon: null, zone: 13 }]);
  });
  it("no zone: the district's worst, as before", async () => {
    const { d, calls } = deps();
    await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, d);
    expect(calls.open).toEqual([{ spot: "teyn-30", lat: 13.04, lon: 80.25 }]);
  });
  it("the view already on the zone is not remounted; on another zone it opens afresh", async () => {
    const a = deps({ current: { spot: null, cluster: null, tab: null, zone: 13 } });
    await run({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }, a.d);
    expect(a.calls.open).toEqual([]);
    expect(a.calls.cleared).toBe(1);
    const b = deps({ current: { spot: null, cluster: null, tab: null } });
    await run({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }, b.d);
    expect(b.calls.open).toEqual([{ zone: 13 }]);
  });
});

describe("v14 scenarios 7: what a city op opened", () => {
  it("the jam it picked, with where it is, so the next 'show me in the map' finds that one again", async () => {
    const { d } = deps();
    const cmd = { op: "city" as const, topic: "traffic" as const, focus: "worst-jam" as const, rain: null };
    const l = await run(cmd, d);
    expect(l?.shown).toEqual({ topic: "traffic", focus: "worst-jam", rain: null, spot: "teyn-30", lat: 13.04, lon: 80.25 });
    expect(cityAfterMap(cmd, l, null)).toEqual(l?.shown);
  });
  it("a zone's trouble spot and plain view say their zone", async () => {
    const { d } = deps();
    expect((await run({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 }, d))?.shown).toEqual({ topic: "traffic", focus: null, rain: null, spot: null, lat: null, lon: null, zone: 13 });
    const r = await run({ op: "city", topic: "traffic", focus: "repeat", rain: null, zone: 9 }, deps().d);
    expect(r?.shown).toMatchObject({ focus: "repeat", spot: "tc-teyn", zone: 9 });
  });
});

describe("v14 routing 8, scenarios 0: every map op writes the last city answer", () => {
  const prev = { topic: "traffic" as const, focus: "worst-jam" as const, spot: "teyn-30", lat: 13.04, lon: 80.25 };
  it("a camera move keeps the one before; an Ask the Map answer, a layer, a close put it away", () => {
    expect(cityAfterMap({ op: "zoom", zoom: "in" }, null, prev)).toBe(prev);
    expect(cityAfterMap({ op: "ask", question: "garbage near schools" }, null, prev)).toBeNull();
    expect(cityAfterMap({ op: "circle", question: "x" }, null, prev)).toBeNull();
    expect(cityAfterMap({ op: "layer", layer: "schools" }, null, prev)).toBeNull();
    expect(cityAfterMap({ op: "city", topic: "traffic", act: "close" }, null, prev)).toBeNull();
    expect(cityAfterMap({ op: "rain", act: "close" }, null, prev)).toBeNull();
  });
  it("a Rain op is its tab's part of the city (Rain's traffic tab is not Live traffic)", () => {
    expect(cityAfterMap({ op: "rain", act: "open", tab: "flooding" }, null, prev)).toEqual({ topic: "flood", focus: null, rain: null });
    expect(cityAfterMap({ op: "rain", act: "open", rain: "latest" }, null, prev)).toEqual({ topic: "flood", focus: null, rain: "latest" });
    expect(cityAfterMap({ op: "rain", act: "open", tab: "power" }, null, prev)).toEqual({ topic: "power", focus: null, rain: null });
    expect(cityAfterMap({ op: "rain", act: "open", tab: "traffic" }, null, prev)).toBeNull();
  });
  it("a city op with no line (the flood streets' tab) still says what it asked for, with its zone", () => {
    expect(cityAfterMap({ op: "city", topic: "flood", focus: null, rain: "latest" }, null, null)).toEqual({ topic: "flood", focus: null, rain: "latest", spot: null, lat: null, lon: null });
    expect(cityShownBy({ op: "city", topic: "traffic", focus: null, rain: null, zone: 13 })).toMatchObject({ zone: 13 });
  });
});

describe("v14 routing 10: the Live traffic view put away", () => {
  it("open: closed, and said; closed already: said plainly", async () => {
    const a = deps({ current: { spot: null, cluster: null, tab: null } });
    expect((await run({ op: "city", topic: "traffic", act: "close" }, a.d))?.en).toBe("Live traffic is closed.");
    expect(a.calls.closed).toBe(1);
    expect(a.calls.open).toEqual([]);
    const b = deps();
    expect((await run({ op: "city", topic: "traffic", act: "close" }, b.d))?.en).toBe("Live traffic isn't open.");
  });
  it("the console's deps: close puts the view away with Jarvis's Stage; the zone goes to the view; current says it, and nothing off the Overview", () => {
    const close = vi.fn(), openCity = vi.fn(), clearStage = vi.fn();
    const c = { page: "overview", trafficView: { open: { seq: 2, spot: null, cluster: null, tab: null, zone: 13 }, close, esc: { current: null } }, openCity, depts: [] } as unknown as Console;
    const dd = consoleMapDeps(() => ({ c }), { lang: "en", clearStage });
    dd.traffic!.close!();
    expect(close).toHaveBeenCalled();
    expect(clearStage).toHaveBeenCalled();
    expect(dd.traffic!.current!()).toEqual({ spot: null, cluster: null, tab: null, zone: 13 });
    dd.traffic!.open({ zone: 13 });
    expect(openCity).toHaveBeenCalledWith(expect.objectContaining({ kind: "traffic", zone: 13 }));
    const off = { ...c, page: "trends" } as unknown as Console;
    expect(consoleMapDeps(() => ({ c: off }), { lang: "en" }).traffic!.current!()).toBeNull();
  });
  it("the map's state says the view is open, and carries the console's places and the screen's subject", () => {
    expect(mapSnap10(null, { trafficOpen: true, lastCity: null }).trafficOpen).toBe(true);
    expect(mapSnap10(null, { world: { zones: [], places: [] }, subject: { place: "Adyar", what: null } })).toMatchObject({ world: { zones: [] }, subject: { place: "Adyar" } });
    expect(mapSnap10(null, {}).trafficOpen).toBeUndefined();
  });
});
