import { describe, expect, it } from "vitest";
import { distToLinesM, mergeRainStreets, satOf, wardPointsOf, type SatRain, type SatStreet } from "./satflood";

const sat = (key: string, lines: [number, number][][], floodedM = 100, how: "on" | "beside" = "on"): SatStreet => ({
  key, name: key.startsWith("n") ? `Street ${key}` : null, name_ta: null, near: null, ward: 5, edges: [1], how, floodedM, lengthM: 200, conf: "high",
  lat: lines[0][0][0], lon: lines[0][0][1], lines
});

describe("satellite and complaint streets in one list", () => {
  const reports = [
    { street: "n1|w5", lat: 13.0, lon: 80.2 },
    { street: "n1|w5", lat: 13.0001, lon: 80.2 },
    { street: "e77", lat: 13.05, lon: 80.25 },
    { street: "n9|w9", lat: 13.1, lon: 80.3 },
    { street: null, lat: 13.2, lon: 80.3 }
  ];
  it("marks a street 'both' by the same key or by a report next to the satellite water's road, and keeps the others apart", () => {
    const s = [
      sat("n1|w5", [[[13.0, 80.199], [13.0, 80.201]]]),
      // a lane the memory keys differently, 30 m from the e77 report
      sat("e900", [[[13.05027, 80.2495], [13.05027, 80.2505]]], 60),
      sat("n4|w7", [[[12.95, 80.22], [12.95, 80.23]]], 250, "beside")
    ];
    const m = mergeRainStreets(reports, s);
    // water only BESIDE a road (n4|w7) is not a flooded street: it stays out of the list
    expect(m.map((x) => [x.key, x.source, x.reports])).toEqual([
      ["n1|w5", "both", 2], ["e77", "both", 1], ["n9|w9", "complaint", 1]
    ]);
    expect(m[1].sat?.floodedM).toBe(60);
  });
  it("lists complaint streets only when there is no satellite picture", () => {
    expect(mergeRainStreets(reports, null).map((x) => x.source)).toEqual(["complaint", "complaint", "complaint"]);
    expect(mergeRainStreets([], null)).toEqual([]);
  });
  it("does not join a report farther than the limit", () => {
    const m = mergeRainStreets([{ street: "e77", lat: 13.05, lon: 80.25 }], [sat("e900", [[[13.052, 80.249], [13.052, 80.251]]])]);
    expect(m.map((x) => x.source)).toEqual(["complaint", "satellite"]);
  });
  it("measures metres to a line", () => {
    expect(distToLinesM(13.0009, 80.2, [[[13.0, 80.19], [13.0, 80.21]]])).toBeCloseTo(99.5, 0);
    expect(distToLinesM(13.0, 80.2, [])).toBe(Infinity);
  });
});

describe("the satellite record for the map", () => {
  it("turns map pieces into boxes and keeps a missing pass honest", () => {
    const r: SatRain = { id: "rain-x", start: "2026-11-08", end: "2026-11-08", status: "pass", pass: { at: "2026-11-09 06:01", satellite: "Sentinel-1D", scenes: ["s1"], daysAfterEnd: 0.3 },
      reference: { dates: ["2026-10-28 06:01"], scenes: ["r1"] }, waterKm2: 1.3, highKm2: 0.6, roadKm: 0, besideKm: 0.8, coveredShare: 1,
      extent: [{ c: "high", r: [[13.1, 80.2], [13.1, 80.21], [13.09, 80.21], [13.09, 80.2]] }] };
    const s = satOf(r)!;
    expect(s.boxes).toEqual([[13.09, 80.2, 13.1, 80.21, 2]]);
    expect(s.pass).toEqual({ at: "2026-11-09 06:01", satellite: "Sentinel-1D", daysAfterEnd: 0.3, scenes: ["s1"] });
    expect(s.besideKm).toBe(0.8);
    const none = satOf({ id: "rain-y", start: "2026-10-17", end: "2026-10-18", status: "no-pass", note: "No pass", nearest: { before: "2026-10-16 06:01", after: "2026-10-28 06:01" } })!;
    expect(none).toMatchObject({ status: "no-pass", pass: null, boxes: [], waterKm2: null, nearest: { before: "2026-10-16 06:01" } });
    expect(satOf(undefined)).toBeNull();
  });
  it("finds a ward's centre and area", () => {
    const [w] = wardPointsOf([{ wardNo: 3, rings: [[[80.2, 13.0], [80.21, 13.0], [80.21, 13.01], [80.2, 13.01], [80.2, 13.0]]] }]);
    expect(w.ward).toBe(3);
    expect(w.lat).toBeCloseTo(13.005, 6);
    expect(w.lon).toBeCloseTo(80.205, 6);
    expect(w.areaKm2).toBeCloseTo(1.0844 * 1.1057, 2);
  });
});
