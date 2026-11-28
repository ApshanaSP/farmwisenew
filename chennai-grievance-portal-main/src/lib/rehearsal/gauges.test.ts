import { describe, expect, it } from "vitest";
import { bucketReadings, currentRainDay, idw, kmBetween, mergeDays, presenceOf, rainSummary, rainTotals, rainWindow, emptyCache, trustedGauges, type RainGauge } from "./gauges";

const G = (id: string, lat: number, lon: number, inChennai = true): RainGauge => ({ id, name: id, lat, lon, ward: null, agency: "TNDRRA", district: "Chennai", inChennai });

describe("inverse-distance weighting", () => {
  it("gives a gauge's own value at the gauge", () => {
    const r = idw([{ id: "a", lat: 13.05, lon: 80.25, mm: 42 }, { id: "b", lat: 13.1, lon: 80.25, mm: 0 }], 13.05, 80.25);
    expect(r).toEqual({ mm: 42, n: 1, nearestKm: 0 });
  });
  it("averages two gauges at the same distance, and leans to the nearer one", () => {
    const two = [{ id: "a", lat: 13.0, lon: 80.2, mm: 10 }, { id: "b", lat: 13.02, lon: 80.2, mm: 30 }];
    expect(idw(two, 13.01, 80.2)!.mm).toBeCloseTo(20, 6);
    // a quarter of the way from a to b: weights 1/d^2 -> 9:1
    expect(idw(two, 13.005, 80.2)!.mm).toBeCloseTo((10 * 9 + 30 * 1) / 10, 6);
  });
  it("uses only gauges within the distance and the nearest few", () => {
    const far = [{ id: "a", lat: 13.3, lon: 80.2, mm: 50 }];
    expect(idw(far, 13.0, 80.2)).toBeNull();
    const many = Array.from({ length: 12 }, (_, k) => ({ id: `g${k}`, lat: 13 + 0.001 * (k + 1), lon: 80.2, mm: k < 8 ? 10 : 1000 }));
    expect(idw(many, 13, 80.2)!.mm).toBeCloseTo(10, 6);
    expect(idw(many, 13, 80.2)!.n).toBe(8);
  });
  it("measures distance in km", () => {
    expect(kmBetween(13, 80.2, 13.1, 80.2)).toBeCloseTo(11.06, 1);
  });
});

describe("15-minute readings to rain days", () => {
  it("puts a reading in the IMD rain day (08:30 to 08:30 IST) and the hour from 08:30", () => {
    // the 15 minutes ending 08:30 IST on 27 Nov (03:00 UTC) belong to the rain day of 26 Nov, its last hour;
    // those ending 08:45 IST to 27 Nov, its first hour
    const b = bucketReadings([
      { id: "g", at: "2026-11-27T03:00:00Z", mm: 19.2 },
      { id: "g", at: "2026-11-27T02:45:00Z", mm: 2.4 },
      { id: "g", at: "2026-11-27T03:15:00Z", mm: 3.2 },
      { id: "g", at: "2026-11-27T03:15:00Z", mm: 3.2 },
      { id: "g", at: "2026-11-27T04:00:00Z", mm: 0 },
      { id: "g", at: "2026-11-27T05:00:00Z", mm: 95 }
    ]);
    expect(b.rain["2026-11-26"].g).toEqual({ 23: 21.6 });
    expect(b.rain["2026-11-27"].g).toEqual({ 0: 3.2 });
    expect(b.dropped).toBe(1);
  });
  it("counts the sample times a gauge reported per rain day", () => {
    const p = presenceOf([
      { id: "g", at: "2026-11-26T20:30:00Z" }, // 02:00 IST 27 Nov -> rain day 26 Nov
      { id: "g", at: "2026-11-27T02:30:00Z" }, // 08:00 IST 27 Nov -> rain day 26 Nov
      { id: "g", at: "2026-11-27T08:30:00Z" }, // 14:00 IST -> rain day 27 Nov
      { id: "g", at: "2026-11-27T08:30:00Z" }
    ]);
    expect(p).toEqual({ "2026-11-26": { g: 2 }, "2026-11-27": { g: 1 } });
  });
  it("names the rain day running now and a rain's window", () => {
    expect(currentRainDay(Date.parse("2026-11-28T02:00:00Z"))).toBe("2026-11-27"); // 07:30 IST
    expect(currentRainDay(Date.parse("2026-11-28T03:30:00Z"))).toBe("2026-11-28"); // 09:00 IST
    expect(rainWindow("2026-11-08", "2026-11-09")).toEqual(["2026-11-07", "2026-11-08", "2026-11-09"]);
  });
});

describe("a rain's totals and its wards", () => {
  const gauges = [G("a", 13.0, 80.2), G("b", 13.02, 80.2), G("off", 13.01, 80.25), G("edge", 13.04, 80.1, false)];
  let c = emptyCache(gauges);
  c = mergeDays(c, ["2026-11-07", "2026-11-08"],
    { "2026-11-07": { a: 4, b: 4, off: 1, edge: 4 }, "2026-11-08": { a: 4, b: 3, off: 0, edge: 4 } },
    { "2026-11-07": { a: { 20: 12 }, b: { 21: 30 }, off: { 1: 99 } }, "2026-11-08": { a: { 0: 8 }, edge: { 2: 5 } } }, 0);

  it("leaves out a gauge that did not report, and finds the wettest hour", () => {
    const t = rainTotals(c, rainWindow("2026-11-08", "2026-11-08"));
    expect(t.daysRead).toBe(2);
    expect(t.gauges.map((g) => g.id).sort()).toEqual(["a", "b", "edge"]);
    const a = t.gauges.find((g) => g.id === "a")!;
    expect(a.mm).toBe(20);
    expect(a.peakMm).toBe(12);
    expect(a.peakAt).toBe("2026-11-08 04:30"); // hour 20 from 08:30 on 7 Nov
  });
  it("gives no district figure when too few gauges reported (the September gap)", () => {
    const s = rainSummary(c, "2026-11-08", "2026-11-08", [{ ward: 1, lat: 13.0, lon: 80.2, areaKm2: 1 }])!;
    expect(s.few).toBe(true);
    expect(s.mean).toBeNull();
    expect(s.wards).toEqual([]);
  });
  it("drops a gauge of another district placed inside the wards, and one of two gauges at the same point", () => {
    const xs = trustedGauges([G("CHN02Z017W7", 13.1, 80.2), G("CGLCHYLAT10", 13.1, 80.2), G("CGLOUT1", 12.7, 80.0, false), G("ARG7", 13.05, 80.25), G("CHN9", 13.05, 80.25)]);
    expect(xs.map((g) => g.id)).toEqual(["ARG7", "CGLOUT1", "CHN02Z017W7"]);
  });
  it("a gauge that missed a day of the window is left out, never counted as 0 mm that day", () => {
    let d = emptyCache([G("a", 13, 80.2), G("b", 13.02, 80.2)]);
    d = mergeDays(d, ["2026-10-21", "2026-10-22"], { "2026-10-21": { a: 4, b: 4 }, "2026-10-22": { a: 4, b: 0 } }, { "2026-10-21": { a: { 1: 10 }, b: { 1: 40 } }, "2026-10-22": { a: { 1: 5 } } }, 0);
    expect(rainTotals(d, ["2026-10-21", "2026-10-22"]).gauges.map((g) => g.id)).toEqual(["a"]);
  });
  it("works out ward rain by distance and the district by ward area", () => {
    const s = rainSummary(c, "2026-11-08", "2026-11-08", [{ ward: 1, lat: 13.0, lon: 80.2, areaKm2: 1 }, { ward: 2, lat: 13.02, lon: 80.2, areaKm2: 3 }], 1)!;
    expect(s.gauges).toBe(3);
    expect(s.inChennai).toBe(2);
    expect(s.wards).toEqual([{ ward: 1, mm: 20 }, { ward: 2, mm: 30 }]);
    expect(s.mean).toBeCloseTo((20 * 1 + 30 * 3) / 4, 1);
    expect(s.wettest).toEqual({ id: "b", name: "b", mm: 30 });
    expect(s.peak).toMatchObject({ id: "b", mm: 30 });
    expect(s.window).toEqual({ from: "2026-11-07", to: "2026-11-09", daysRead: 2, daysWanted: 2 });
  });
  it("is null when none of the rain's days were read", () => {
    expect(rainSummary(c, "2026-07-18", "2026-07-18", [{ ward: 1, lat: 13, lon: 80.2, areaKm2: 1 }])).toBeNull();
  });
});
