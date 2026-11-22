/**
 * v14 (21 Nov, review findings 0-6 and scenarios 3): while someone is on the console, the rain engine answers from its last settled base
 * and the last hour's memory, marks the rebuild due, and builds it only when refreshRain is called (the keep-warm's quiet moment). The
 * graph, the sources and the memory are test doubles: the point is which computations run when.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ now: "2026-11-21 10:15:00", srcKey: "build-1", mem: 0, reach: 0, index: 0 }));

vi.mock("@/lib/collector/intel", () => ({ asOf: async () => h.now }));
vi.mock("@/lib/map/world", () => ({
  world: async () => ({
    world: { dataAsOf: "2026-11-21", points: { hospitals: [], osm_places: [], fire_stations: [], schools: [] }, conds: { places: [] }, wards: [], depts: new Map() },
    resolver: { entries: [] }
  })
}));
vi.mock("./graph", () => ({
  loadGraph: () => ({ hash: "g1", elev: [], len: [], cls: [], n: 0, m: 0, meta: {} }),
  indexGraph: () => { h.index++; return {}; },
  edgesNear: () => [], flatDistM: () => 0, edgeShape: () => [], MAIN_CLASS_MAX: 3, CLASSES: []
}));
vi.mock("./memory", () => ({
  buildMemory: (_g: unknown, _ix: unknown, _inc: unknown, _ev: unknown, o: { asOf: string }) => { h.mem++; return { asOf: o.asOf, streets: [], likely: 0, possible: 0, used: 0, events: [] }; },
  rainEvents: () => [], rehearsalFactor: () => new Float32Array(0), streetLabel: () => ""
}));
vi.mock("./reach", () => ({
  computeReach: () => { h.reach++; return { wards: [], facilities: [], hospRain: [], unrouted: [] }; },
  mergeHospitals: () => [], nodeWards: () => [], T_HELP_MIN: 10
}));
vi.mock("./source", () => ({ rehearsalSources: async () => ({ key: h.srcKey, rainDays: [], incidents: [], lakes: [], gauges: [], releases: [], bulletins: [], notes: [] }), lakesAt: () => [] }));
vi.mock("./replay", () => ({ rainReports: () => [], backtestAll: () => [], COVER_M: 60, judge: () => null, rainWindow: () => null, replayAsOf: () => "" }));

import { deferRainRebuild, pastRains, rainRebuildDue, refreshRain } from "./engine";

beforeEach(() => {
  Object.assign(h, { now: "2026-11-21 10:15:00", srcKey: "build-1", mem: 0, reach: 0, index: 0 });
  globalThis.__rehearsalBase = undefined; globalThis.__rehearsalMoments = undefined; globalThis.__rehearsalPast = undefined;
  globalThis.__rehearsalDue = undefined; globalThis.__rehearsalForce = undefined;
});
afterEach(() => deferRainRebuild(null));

describe("v14: the hour's rain rebuild waits for a quiet moment while someone is on the console", () => {
  it("no one on the console: the new hour is built at once, as before", async () => {
    expect((await pastRains()).asOf).toBe("2026-11-21 10:00:00");
    h.now = "2026-11-21 11:05:00";
    expect((await pastRains()).asOf).toBe("2026-11-21 11:00:00");
    expect(h.mem).toBe(2);
    expect(rainRebuildDue()).toBe(false);
  });

  it("someone on the console: the last hour's memory answers at once, the rebuild is due, and refreshRain builds it", async () => {
    await pastRains();
    deferRainRebuild(() => true);
    h.now = "2026-11-21 11:05:00";
    const r = await pastRains();
    expect(r.asOf).toBe("2026-11-21 10:00:00"); // the last hour's, honestly labelled
    expect(h.mem).toBe(1); // nothing built on the question's path
    expect(rainRebuildDue()).toBe(true);
    expect(await refreshRain()).toBe(true);
    expect(h.mem).toBe(2);
    expect((await pastRains()).asOf).toBe("2026-11-21 11:00:00"); // the rebuilt one is read once it is in
    expect(rainRebuildDue()).toBe(false);
    expect(await refreshRain()).toBe(false); // nothing due: nothing done
  });

  it("a new build while someone is on the console: the settled base answers until the rebuild; then the new base", async () => {
    await pastRains();
    expect(h.index).toBe(1);
    deferRainRebuild(() => true);
    h.srcKey = "build-2";
    await pastRains();
    expect(h.index).toBe(1); // the new build's base is not built on the question's path
    expect(rainRebuildDue()).toBe(true);
    await refreshRain();
    expect(h.index).toBe(2);
  });

  it("nothing to stand in (a cold server): built at once even while someone is on the console", async () => {
    deferRainRebuild(() => true);
    expect((await pastRains()).asOf).toBe("2026-11-21 10:00:00");
    expect(h.mem).toBe(1);
  });
});
