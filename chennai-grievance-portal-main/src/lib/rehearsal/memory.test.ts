import { describe, expect, it } from "vitest";
import { indexGraph, makeGraph } from "./graph";
import { buildMemory, openAt, rainEvents, rainOf, rehearsalFactor, streetLabel, TIER_LIKELY, TIER_POSSIBLE, type FloodInc } from "./memory";
import { judge, rainReports, replayAsOf } from "./replay";

// a straight street of 10 pieces, 100 m each, running east along lat 13.0 ("Lake View Road", ward 5),
// with an unnamed lane going north from its middle
const D = 100 / 107900;
const street = () => {
  const lat: number[] = [], lon: number[] = [];
  for (let k = 0; k <= 10; k++) { lat.push(13); lon.push(80.2 + k * D); }
  lat.push(13 + 100 / 110574); lon.push(80.2 + 5 * D); // node 11: north of node 5
  const from = [...Array(10).keys(), 5], to = [...Array(10).keys()].map((k) => k + 1).concat(11);
  return makeGraph({ lat, lon, from, to, len: from.map(() => 100), cls: from.map(() => 6), name: [...Array(10).fill(0), -1], ward: from.map(() => 5), names: ["Lake View Road"] });
};
let n = 0;
const inc = (over: Partial<FloodInc>): FloodInc => ({
  id: `I${++n}`, cat: "FLOOD_WATERLOGGING", lat: 13 + 5 / 110574, lon: 80.2 + 2.5 * D, prec: 30, first: "2026-08-10 10:00:00", closed: null, open: false,
  ward: 5, dept: "GCC-SWD", title: "Water stagnation", place: "Lake View Road", priority: 50, breached: false, status: "Open", ...over
});
const RAINS = rainEvents([
  { day: "2026-07-18", source: "pipeline" }, { day: "2026-08-09", source: "pipeline" }, { day: "2026-08-10", source: "imd", mm: 64 },
  { day: "2026-09-19", source: "pipeline" }, { day: "2026-10-21", source: "imd", mm: 129 }
]);

describe("rain events", () => {
  it("joins consecutive days and keeps each source and the most rain", () => {
    expect(RAINS.map((r) => `${r.start}..${r.end}`)).toEqual(["2026-07-18..2026-07-18", "2026-08-09..2026-08-10", "2026-09-19..2026-09-19", "2026-10-21..2026-10-21"]);
    expect(RAINS[1].sources.sort()).toEqual(["imd", "pipeline"]);
    expect(RAINS[1].maxMm).toBe(64);
  });
  it("puts a report up to two days after the last rain day in that rain", () => {
    expect(rainOf(RAINS, "2026-08-12 23:00:00")).toBe(1);
    expect(rainOf(RAINS, "2026-08-13 00:10:00")).toBe(-1);
    expect(rainOf(RAINS, "2026-07-17 23:59:00")).toBe(-1);
  });
});

/** small, fixed thresholds for hand-made streets (the real defaults are calibrated on the real data) */
const T = { rSpot: 80, rExact: 80, rNear: 150, likelyRains: 2, possibleRains: 1, likelyKm: 0, possibleKm: 0 };

describe("flood memory", () => {
  const g = street();
  const ix = indexGraph(g, 60);

  it("marks a street that flooded in two rains as likely, one rain as possible", () => {
    const incs = [inc({ first: "2026-07-18 09:00:00" }), inc({ first: "2026-08-10 09:00:00" }), inc({ lon: 80.2 + 8.5 * D, first: "2026-09-19 12:00:00" })];
    const m = buildMemory(g, ix, incs, RAINS, { ...T, asOf: "2026-10-01 09:00:00" });
    expect(m.tier[2]).toBe(TIER_LIKELY);
    expect(m.tier[8]).toBe(TIER_POSSIBLE);
    expect(m.tier[5]).toBe(0);
    const s = m.streets.find((x) => x.name === "Lake View Road")!;
    expect(s.tier).toBe(TIER_LIKELY);
    // the street as a whole flooded in three rains (two at one spot, one further east)
    expect(s.rains).toBe(3);
    expect(s.incidents.length).toBe(3);
    // every marked street has a complaint behind it
    for (const st of m.streets) expect(st.incidents.length).toBeGreaterThan(0);
  });

  it("uses nothing from after asOf (no peeking)", () => {
    const past = [inc({ first: "2026-07-18 09:00:00" })];
    const future = [inc({ first: "2026-10-21 09:00:00" }), inc({ first: "2026-10-22 09:00:00", lon: 80.2 + 7.5 * D })];
    const a = buildMemory(g, ix, past, RAINS, { ...T, asOf: "2026-10-19 09:00:00" });
    const b = buildMemory(g, ix, [...past, ...future], RAINS, { ...T, asOf: "2026-10-19 09:00:00" });
    expect([...b.tier]).toEqual([...a.tier]);
    expect([...b.score]).toEqual([...a.score]);
    expect(b.events.map((e) => e.id)).toEqual(a.events.map((e) => e.id));
  });

  it("ignores complaints placed worse than 300 m and categories that are not water", () => {
    const m = buildMemory(g, ix, [inc({ prec: 800, first: "2026-07-18 09:00:00" }), inc({ cat: "STREETLIGHT_ELECTRICAL", first: "2026-08-10 09:00:00" })], RAINS, { ...T, asOf: "2026-10-01 09:00:00" });
    expect(m.streets.length).toBe(0);
  });

  it("never marks a street from water outside rains alone", () => {
    const dry = (d: string) => inc({ first: `2026-06-0${d} 09:00:00`, cat: "DRAINAGE_SEWAGE" });
    expect(buildMemory(g, ix, [dry("1"), dry("2"), dry("3"), dry("4")], RAINS, { ...T, asOf: "2026-10-01 09:00:00" }).streets.length).toBe(0);
  });

  it("counts a rain for every piece within the flood spot, but marks only the pieces complained about", () => {
    // two rains 250 m apart along the street: with a 300 m spot both count for both places
    const incs = [inc({ first: "2026-07-18 09:00:00", lon: 80.2 + 1.5 * D }), inc({ first: "2026-08-10 09:00:00", lon: 80.2 + 4 * D })];
    const m = buildMemory(g, ix, incs, RAINS, { ...T, rSpot: 300, asOf: "2026-10-01 09:00:00" });
    expect(m.tier[1]).toBe(TIER_LIKELY);
    expect(m.tier[9]).toBe(0);
  });

  it("marks a fixed length of the worst streets when asked (likely first)", () => {
    const incs = [inc({ first: "2026-07-18 09:00:00" }), inc({ first: "2026-08-10 09:00:00" }), inc({ first: "2026-09-19 09:00:00" }),
      inc({ lon: 80.2 + 8.5 * D, first: "2026-09-19 12:00:00" })];
    const m = buildMemory(g, ix, incs, RAINS, { ...T, likelyKm: 0.1, possibleKm: 0.1, asOf: "2026-10-01 09:00:00" });
    expect(m.tier[2]).toBe(TIER_LIKELY);
    // the next 100 m go to the highest-scoring other piece
    expect([...m.tier].filter((t) => t === TIER_LIKELY).length).toBe(1);
    expect([...m.tier].filter((t) => t === TIER_POSSIBLE).length).toBe(1);
  });

  it("names an unnamed lane after the street it leads off", () => {
    const m = buildMemory(g, ix, [inc({ lat: 13 + 60 / 110574, lon: 80.2 + 5 * D + 2 / 107900, first: "2026-08-10 09:00:00" })], RAINS, { ...T, asOf: "2026-10-01 09:00:00" });
    const lane = m.streets.find((s) => !s.name);
    expect(lane).toBeTruthy();
    expect(streetLabel(lane!)).toBe("A lane off Lake View Road");
  });

  it("closes likely pieces and slows possible ones", () => {
    const m = buildMemory(g, ix, [inc({ first: "2026-07-18 09:00:00" }), inc({ first: "2026-08-10 09:00:00" }), inc({ lon: 80.2 + 8.5 * D, first: "2026-09-19 12:00:00" })], RAINS, { ...T, asOf: "2026-10-01 09:00:00" });
    const f = rehearsalFactor(m);
    expect(f[2]).toBe(0);
    expect(f[8]).toBeCloseTo(0.3);
    expect(f[5]).toBe(1);
  });
});

describe("open at a moment", () => {
  it("uses the closing time for a replay and the live status for today", () => {
    const i = inc({ first: "2026-10-01 09:00:00", closed: "2026-10-20 10:00:00", open: false });
    expect(openAt(i, "2026-10-19 09:00:00", false)).toBe(true);
    expect(openAt(i, "2026-10-21 09:00:00", false)).toBe(false);
    expect(openAt(i, "2026-10-21 09:00:00", true)).toBe(false);
    expect(openAt(inc({ first: "2026-10-25 09:00:00", open: true }), "2026-10-21 09:00:00", false)).toBe(false);
  });
});

describe("judging a rain", () => {
  it("counts reports on marked streets and compares with random streets of the same length", () => {
    const g = street();
    const ix = indexGraph(g, 60);
    const past = [inc({ first: "2026-07-18 09:00:00" }), inc({ first: "2026-08-10 09:00:00" })];
    const ev = RAINS[3];
    const mem = buildMemory(g, ix, past, RAINS, { ...T, asOf: replayAsOf(ev) });
    const reports = rainReports([...past, inc({ first: "2026-10-21 11:00:00" }), inc({ first: "2026-10-22 08:00:00", lat: 14, lon: 81 })], ev);
    expect(reports.length).toBe(2);
    const j = judge(g, ix, mem, reports, 50);
    expect(j.covered).toBe(1);
    expect(j.reports.find((r) => r.covered)).toBeTruthy();
    expect(j.random.draws).toBe(50);
  });
});
