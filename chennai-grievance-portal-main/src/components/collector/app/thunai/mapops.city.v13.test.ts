/**
 * v13 (21 Nov review of v12's city routing), the browser's map operations: Thunai's explicit "no city answer" is no longer read as the
 * Live traffic view still open (finding 0 4); Rain & flooding already open moves to its tab with Jarvis's Stage out of the way (1 6); and
 * "show me in the map" after a city answer reopens its spot, or leaves the view as it is when it is already on it (1 7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Console } from "../CollectorApp";
import { cityShownBy, consoleMapDeps, mapSnap10, resetMapOps, runMapCmd, type MapLine, type MapOpsDeps } from "./mapops";

const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." };
const spot = (id: string, level: string, delayMin: number, lengthM: number, lat: number, lon: number) => ({ id, level, kind: "Jam", label: "Queuing traffic", name: `Road ${id}`, road: null, from: null, to: null,
  delayMin, delayS: delayMin * 60, lengthM, magnitude: 3, path: [[lat, lon], [lat + 0.001, lon]], lat, lon, ward: null, zone: 9, zoneName: "Teynampet", owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
// the stretch the last answer was on (the 12-min one, a new id in this read) and a worse one since
const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:45:00.000Z", why: null, source: "TomTom",
  counts: { total: 2, jams: 2, very: 2, congested: 0, slow: 0, closed: 0, flooded: 0, accidents: 0, works: 0, action: 2, clusters: 0 },
  spots: [spot("very12-b", "very", 12, 800, 13.0602, 80.2501), spot("very30", "very", 30, 900, 13.1, 80.27)], clusters: [], zones: [], window: { from: "", to: "" }
};

function deps(o: { current?: { spot: string | null; cluster: string | null; tab: "repeat" | null } | null; rainOpen?: boolean } = {}) {
  const calls = { open: [] as unknown[], points: [] as unknown[], cleared: 0, bridge: [] as unknown[] };
  const d: MapOpsDeps = {
    lang: "en", settled: async () => undefined,
    map: () => ({ ask: async () => null, setGrown: () => undefined } as never), openMap: () => undefined,
    fetch: vi.fn(async () => new Response(JSON.stringify(TRAFFIC), { status: 200 })) as unknown as typeof fetch,
    traffic: { open: (x) => calls.open.push(x), current: () => o.current ?? null }, point: (p) => calls.points.push(p),
    clearStage: () => { calls.cleared++; },
    rain: { isOpen: () => !!o.rainOpen, open: () => undefined },
    bridge: (op, args) => { calls.bridge.push({ op, args }); return { ok: true, state: {} } as never; }
  };
  return { d, calls };
}
const run = (c: Parameters<typeof runMapCmd>[0], d: MapOpsDeps) => runMapCmd(c, d) as Promise<MapLine | null>;

beforeEach(() => resetMapOps());

describe("v13 finding 0 4: Thunai's null is 'not a city answer'", () => {
  it("an explicit null is kept with the Live traffic view open; nothing passed gets the fallbacks", () => {
    expect(mapSnap10(null, { trafficOpen: true, lastCity: null }).lastCity).toBeNull();
    expect(mapSnap10(null, { rainOpen: true, lastCity: null }).lastCity).toBeNull();
    expect(mapSnap10(null, { trafficOpen: true }).lastCity).toBe("traffic");
    expect(mapSnap10(null, { lastCity: { topic: "flood", rain: "latest" } }).lastCity).toEqual({ topic: "flood", rain: "latest" });
  });
});

describe("v13 finding 1 6: Rain & flooding already open moves with the Stage out of the way", () => {
  it("'show me in the map' after the flooded roads: the Stage cleared, then the flooding tab", async () => {
    const { d, calls } = deps({ rainOpen: true });
    const l = await run({ op: "city", topic: "flood", focus: null, rain: null }, d);
    expect(calls.cleared).toBe(1);
    expect(calls.bridge).toEqual([{ op: "rain", args: { tab: "flooding" } }]);
    expect(l?.en).toBe("The Flooding tab.");
  });
});

describe("v13 finding 1 7: the last answer's spot, found again; the view not remounted when it is on it", () => {
  it("the spot the answer was on, by where it was (TomTom's new id), not the worse jam since", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "very12", lat: 13.06, lon: 80.25 } }, d);
    expect(calls.open).toEqual([{ spot: "very12-b", lat: 13.0602, lon: 80.2501 }]);
    expect(l?.en).toMatch(/^Road very12-b \(Teynampet\) is the most congested now/);
  });
  it("the view already on that spot: no new open (no remount), the Stage out of the way, the line said again", async () => {
    const { d, calls } = deps({ current: { spot: "very12-b", cluster: null, tab: null } });
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "very12-b", lat: 13.0602, lon: 80.2501 } }, d);
    expect(calls.open).toEqual([]);
    expect(calls.cleared).toBe(1);
    expect(calls.points).toEqual([{ label: "Road very12-b", lat: 13.0602, lon: 80.2501 }]);
    expect(l?.en).toMatch(/is the most congested now/);
  });
  it("the plain view already open stays as it is; another spot opens afresh", async () => {
    const a = deps({ current: { spot: null, cluster: null, tab: null } });
    await run({ op: "city", topic: "traffic", focus: null, rain: null }, a.d);
    expect(a.calls.open).toEqual([]);
    const b = deps({ current: { spot: "elsewhere", cluster: null, tab: null } });
    await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, b.d);
    expect(b.calls.open).toEqual([{ spot: "very30", lat: 13.1, lon: 80.27 }]);
  });
  it("cityShownBy keeps what a city op showed; the console's deps say what the view is on", () => {
    expect(cityShownBy({ op: "city", topic: "traffic", focus: "worst-jam", rain: null, spot: { id: "x", lat: 1, lon: 2 } })).toEqual({ topic: "traffic", focus: "worst-jam", rain: null, spot: "x", lat: 1, lon: 2 });
    expect(cityShownBy({ op: "ask" })).toBeNull();
    const c = { trafficView: { open: { seq: 3, spot: "s1", cluster: null, tab: null }, close: vi.fn(), esc: { current: null } }, depts: [] } as unknown as Console;
    expect(consoleMapDeps(() => ({ c }), { lang: "en" }).traffic!.current!()).toEqual({ spot: "s1", cluster: null, tab: null });
    const none = { depts: [] } as unknown as Console;
    expect(consoleMapDeps(() => ({ c: none }), { lang: "en" }).traffic!.current!()).toBeNull();
  });
});
