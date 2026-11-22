/**
 * v12 (21 Nov): the city views and the map's camera, run by Jarvis (mapops.ts): "zoom to the most congested area" opens the Live traffic view
 * on the most congested stretch (never an accident or water first), points the HUD at it and says code's own line; "the flooded roads in the
 * last rain" opens Rain & flooding on that rain; "zoom out" presses the map's own button.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapCmd } from "@/lib/thunai/v10/map10";
import type { Console } from "../CollectorApp";
import { consoleMapDeps, mapSnap10, resetMapOps, runMapCmd, type MapLine, type MapOpsDeps } from "./mapops";

const owner = { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." };
const spot = (id: string, level: string, delayMin: number, lengthM: number, lat: number, lon: number) => ({ id, level, kind: "Jam", label: "Queuing traffic", name: `Road ${id}`, road: null, from: null, to: null,
  delayMin, delayS: delayMin * 60, lengthM, magnitude: 3, path: [[lat, lon], [lat + 0.001, lon]], lat, lon, ward: null, zone: 9, zoneName: "Teynampet", owner,
  repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 });
const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:30:00.000Z", why: null, source: "TomTom",
  counts: { total: 3, jams: 2, very: 1, congested: 1, slow: 0, closed: 0, flooded: 0, accidents: 1, works: 0, action: 3, clusters: 1 },
  // an accident with no delay sorts first by score; the very congested 12-min stretch is the most congested
  spots: [spot("acc", "accident", 0, 100, 13.01, 80.2), spot("very12", "very", 12, 800, 13.06, 80.25), spot("cong20", "congested", 20, 2000, 13.1, 80.27)],
  clusters: [{ id: "tc-1", name: "Poonamallee High Road", zone: 8, zoneName: "Anna Nagar", ward: null, lat: 13.08, lon: 80.21, spots: ["cong20"], level: "congested", delayMin: 20,
    reports: [{ id: "INC-1", title: "x", cat: "TRAFFIC_OBSTRUCTION", catLabel: "Traffic", at: "2026-11-01", open: true, dept: "POL-GCP", m: 50 }], news: [], open: 1, owner, why: "" }],
  zones: [], window: { from: "", to: "" }
};
const RAINS = { rains: [
  { id: "rain-2026-11-02", start: "2026-11-02 05:00:00", end: "2026-11-02 20:00:00", maxMm: 40, sources: [], reports: [] },
  { id: "rain-2026-10-21", start: "2026-10-21 06:00:00", end: "2026-10-22 06:00:00", maxMm: 120, sources: [], reports: [{ street: "s1" }, { street: "s1" }, { street: "s2" }] }
] };

function deps(o: { traffic?: unknown; rainOpen?: boolean } = {}) {
  const calls = { open: [] as unknown[], points: [] as unknown[], rehearsal: [] as unknown[], zoom: [] as string[], fly: [] as unknown[], overview: 0, asked: [] as string[] };
  const d: MapOpsDeps = {
    lang: "en", settled: async () => undefined,
    map: () => ({ ask: async (q: string) => { calls.asked.push(q); return null; }, setGrown: () => undefined } as never), openMap: () => undefined,
    fetch: vi.fn(async (u: string | URL | Request) => new Response(JSON.stringify(String(u).includes("/api/traffic") ? (o.traffic ?? TRAFFIC) : RAINS), { status: 200 })) as unknown as typeof fetch,
    traffic: { open: (x) => calls.open.push(x) }, point: (p) => calls.points.push(p), rehearsal: (x) => calls.rehearsal.push(x),
    rain: { isOpen: () => !!o.rainOpen, open: () => calls.rehearsal.push("all") },
    camera: { zoom: (dir) => { calls.zoom.push(dir); return true; }, flyTo: (p) => { calls.fly.push(p); return true; } },
    place: (name) => (name === "Adyar" ? { lat: 13.0, lon: 80.25 } : null),
    toOverview: () => { calls.overview++; }, rainsApi: () => "/api/rehearsal/rains"
  };
  return { d, calls };
}
const run = (c: MapCmd, d: MapOpsDeps) => runMapCmd(c, d) as Promise<MapLine | null>;
const gated = (l: MapLine | null) => { for (const n of l?.en.match(/\d+(?:\.\d+)?/g) ?? []) expect(l?.allowed?.has(String(Number(n))) || l?.allowed?.has(n), `${n} in "${l?.en}"`).toBe(true); };

beforeEach(() => resetMapOps());

describe("the city op: Live traffic on the spot asked for", () => {
  it("the most congested stretch: the very congested 12-min one, not the accident; the view on it, the reticle on it, its own line", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, d);
    expect(calls.open).toEqual([{ spot: "very12", lat: 13.06, lon: 80.25 }]);
    expect(calls.points).toEqual([{ label: "Road very12", lat: 13.06, lon: 80.25 }]);
    expect(l?.en).toMatch(/^Road very12 \(Teynampet\) is the most congested now: very congested, about 12 min delay over 800 m\./);
    gated(l);
  });
  it("the trouble spot that keeps coming back: its tab, its card, its line", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: "repeat", rain: null }, d);
    expect(calls.open).toEqual([{ cluster: "tc-1", tab: "repeat", lat: 13.08, lon: 80.21 }]);
    expect(l?.en).toMatch(/^Poonamallee High Road \(Anna Nagar\) keeps coming back: 1 report near it/);
    gated(l);
  });
  it("no focus: the view, and the counts said by code", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "traffic", focus: null, rain: null }, d);
    expect(calls.open).toEqual([{}]);
    expect(l?.en).toMatch(/^Live traffic is on the map: 1 very congested, 1 congested; 1 trouble spot keeps coming back/);
    gated(l);
  });
  it("TomTom off: the view opens and Jarvis says why", async () => {
    const { d, calls } = deps({ traffic: { ...TRAFFIC, enabled: false, spots: [], clusters: [] } });
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, d);
    expect(calls.open).toEqual([{ tab: null }]);
    expect(l?.en).toMatch(/TomTom key/);
  });
});

describe("the city op: Rain & flooding on the rain asked for", () => {
  it("the last heavy rain with reports, as the view opens it, said with its date and its reports", async () => {
    const { d, calls } = deps();
    const l = await run({ op: "city", topic: "flood", focus: null, rain: "latest" }, d);
    expect(calls.rehearsal).toEqual([{ replay: null, manual: false, stop: "check" }]);
    expect(l?.en).toBe("The last heavy rain, 21 October 2026, is on the map: 3 flooding reports on 2 streets.");
    gated(l);
  });
  it("the flood streets with no rain named: Rain & flooding as it opens", async () => {
    const { d, calls } = deps();
    await run({ op: "city", topic: "flood", focus: null, rain: null }, d);
    expect(calls.rehearsal).toEqual(["all"]);
  });
});

describe("the zoom op: the map's own camera", () => {
  it("in and out press the map's buttons, on the Overview", async () => {
    const { d, calls } = deps();
    expect((await run({ op: "zoom", zoom: "out" }, d))?.en).toBe("Zoomed out.");
    expect(calls.zoom).toEqual(["out"]);
    expect(calls.overview).toBe(1);
  });
  it("a zone the console places is flown to; anything else is asked of the map", async () => {
    const { d, calls } = deps();
    expect((await run({ op: "zoom", place: "Adyar" }, d))?.en).toBe("Adyar on the map.");
    expect(calls.fly).toEqual([{ label: "Adyar", lat: 13.0, lon: 80.25 }]);
    await run({ op: "zoom", place: "Kolathur" }, d);
    expect(calls.asked).toEqual(["what is happening in Kolathur"]);
  });
});

describe("the console's pieces", () => {
  it("the Live traffic view opens through openCity on the spot, with Jarvis's screen out of the way", () => {
    const openCity = vi.fn(), clearStage = vi.fn();
    const c = { openCity, closeAll: vi.fn(), setAsk: vi.fn(), depts: [] } as unknown as Console;
    const d = consoleMapDeps(() => ({ c }), { lang: "en", clearStage });
    d.traffic!.open({ spot: "very12", lat: 13.06, lon: 80.25 });
    expect(clearStage).toHaveBeenCalled();
    expect(openCity).toHaveBeenCalledWith({ kind: "traffic", spot: "very12", cluster: null, tab: null, lat: 13.06, lon: 80.25 });
  });
  it("the map's state says the part of the city last shown", () => {
    expect(mapSnap10(null, { lastCity: "traffic" }).lastCity).toBe("traffic");
    expect(mapSnap10(null, { trafficOpen: true }).lastCity).toBe("traffic");
    expect(mapSnap10(null, { rainOpen: true }).lastCity).toBe("flood");
    expect(mapSnap10(null, {}).lastCity).toBeNull();
  });
});
