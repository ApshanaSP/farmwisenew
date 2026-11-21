/**
 * v12 (21 Nov, stale-and-double RC5 and understanding RC13): the map's operations go with the voice turn's own signal. A newer sentence
 * stops a map question still in flight (useMapAsk takes the signal), and an operation whose turn has ended opens nothing, points at nothing
 * and says nothing after its next wait. A camera move or a city view on a spot waits for the Overview's map to be drawn (whenMapReady).
 * Stand-ins only: no console, no map.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapCmd } from "@/lib/thunai/v10/map10";
import type { Console } from "../CollectorApp";
import { consoleMapDeps, resetMapOps, runMapCmd, whenMapReady, type MapLine, type MapOpsDeps } from "./mapops";

const TRAFFIC = {
  enabled: true, at: "2026-11-21T06:30:00.000Z", why: null, source: "TomTom",
  counts: { total: 1, jams: 1, very: 1, congested: 0, slow: 0, closed: 0, flooded: 0, accidents: 0, works: 0, action: 1, clusters: 0 },
  spots: [{ id: "v1", level: "very", kind: "Jam", label: "Queuing traffic", name: "Road v1", road: null, from: null, to: null, delayMin: 9, delayS: 540, lengthM: 600, magnitude: 3,
    path: [[13.06, 80.25], [13.061, 80.25]], lat: 13.06, lon: 80.25, ward: null, zone: 9, zoneName: "Teynampet",
    owner: { dept: "POL-GCP", name: "Greater Chennai Traffic Police", ta: "சென்னை போக்குவரத்துக் காவல்", why: "A jam." }, repeat: { n: 0, open: 0, reports: [], news: [], cats: [] }, action: true, why: "", score: 0 }],
  clusters: [], zones: [], window: { from: "", to: "" }
};

function deps(o: { signal?: AbortSignal; mapReady?: () => Promise<void>; onAsk?: (q: string, sig: AbortSignal | null | undefined) => void } = {}) {
  const calls = { open: [] as unknown[], points: [] as unknown[], zoom: [] as string[], asked: [] as { q: string; signal: boolean }[] };
  const m = {
    grown: true, resp: null, turns: [], setGrown: () => undefined,
    ask: vi.fn(async (q: string, opts?: { signal?: AbortSignal | null }) => { calls.asked.push({ q, signal: !!opts?.signal }); o.onAsk?.(q, opts?.signal); return null; })
  };
  const d: MapOpsDeps = {
    lang: "en", settled: async () => undefined, signal: o.signal, mapReady: o.mapReady,
    map: () => m as never, openMap: () => undefined,
    fetch: vi.fn(async () => new Response(JSON.stringify(TRAFFIC), { status: 200 })) as unknown as typeof fetch,
    traffic: { open: (x) => calls.open.push(x) }, point: (p) => calls.points.push(p),
    camera: { zoom: (dir) => { calls.zoom.push(dir); return true; }, flyTo: () => true },
    place: () => null, toOverview: () => undefined
  };
  return { d, calls, m };
}
const run = (c: MapCmd, d: MapOpsDeps) => runMapCmd(c, d) as Promise<MapLine | null>;

beforeEach(() => resetMapOps());
afterEach(() => { vi.unstubAllGlobals(); });

describe("the turn's signal", () => {
  it("a map question is asked with the turn's signal; with none (the dev harness, the panel) it is asked as before, one argument", async () => {
    const ac = new AbortController();
    const a = deps({ signal: ac.signal });
    await run({ op: "ask", question: "open flooding in Adyar" }, a.d);
    expect(a.calls.asked).toEqual([{ q: "open flooding in Adyar", signal: true }]);
    const b = deps();
    await run({ op: "ask", question: "open flooding in Adyar" }, b.d);
    expect(b.m.ask.mock.calls[0]).toEqual(["open flooding in Adyar"]);
  });

  it("a question a newer sentence stopped says nothing", async () => {
    const ac = new AbortController();
    const { d } = deps({ signal: ac.signal, onAsk: () => ac.abort() });
    expect(await run({ op: "ask", question: "garbage near schools" }, d)).toBeNull();
  });

  it("live traffic read after the turn ended: nothing opens, nothing is pointed at, nothing is said", async () => {
    const ac = new AbortController();
    const { d, calls } = deps({ signal: ac.signal });
    d.fetch = vi.fn(async () => { ac.abort(); return new Response(JSON.stringify(TRAFFIC), { status: 200 }); }) as unknown as typeof fetch;
    expect(await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, d)).toBeNull();
    expect(calls.open).toEqual([]);
    expect(calls.points).toEqual([]);
  });

  it("the worst jam: the view opens at once, the reticle goes on it once the map is drawn, and the line is said", async () => {
    const order: string[] = [];
    const { d, calls } = deps({ mapReady: async () => { order.push("ready"); } });
    const open = d.traffic!.open;
    d.traffic = { open: (x) => { order.push("open"); open(x); } };
    const point = d.point!;
    d.point = (p) => { order.push("point"); point(p); };
    const l = await run({ op: "city", topic: "traffic", focus: "worst-jam", rain: null }, d);
    expect(order).toEqual(["open", "ready", "point"]);
    expect(calls.points).toEqual([{ label: "Road v1", lat: 13.06, lon: 80.25 }]);
    expect(l?.en).toMatch(/^Road v1 \(Teynampet\) is the most congested now/);
  });

  it("a zoom waits for the map before it presses the map's button; a turn that ended meanwhile presses nothing", async () => {
    const order: string[] = [];
    const a = deps({ mapReady: async () => { order.push("ready"); } });
    a.d.camera = { zoom: (dir) => { order.push(`zoom ${dir}`); return true; }, flyTo: () => true };
    expect((await run({ op: "zoom", zoom: "in" }, a.d))?.en).toBe("Zoomed in.");
    expect(order).toEqual(["ready", "zoom in"]);
    const ac = new AbortController();
    const b = deps({ signal: ac.signal, mapReady: async () => { ac.abort(); } });
    expect(await run({ op: "zoom", zoom: "in" }, b.d)).toBeNull();
    expect(b.calls.zoom).toEqual([]);
  });

  it("the console's pieces carry the turn's signal and a map-ready wait", () => {
    const ac = new AbortController();
    const c = { depts: [] } as unknown as Console;
    const d = consoleMapDeps(() => ({ c }), { lang: "en", signal: ac.signal });
    expect(d.signal).toBe(ac.signal);
    expect(typeof d.mapReady).toBe("function");
  });
});

describe("whenMapReady", () => {
  it("with no page (the server, a test) it resolves at once", async () => {
    await expect(whenMapReady(1500)).resolves.toBeUndefined();
  });

  it("resolves as soon as Leaflet's container is in the map card, at most after the wait, and at once when the turn ends", async () => {
    let drawn = false;
    vi.stubGlobal("document", { querySelector: (s: string) => (s === ".a-map .leaflet-container" && drawn ? {} : null) });
    const t0 = Date.now();
    setTimeout(() => { drawn = true; }, 120);
    await whenMapReady(1500);
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(100);
    expect(ms).toBeLessThan(1000);
    drawn = false;
    const t1 = Date.now();
    await whenMapReady(200);
    expect(Date.now() - t1).toBeGreaterThanOrEqual(180);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 60);
    const t2 = Date.now();
    await whenMapReady(1500, ac.signal);
    expect(Date.now() - t2).toBeLessThan(800);
  });
});
