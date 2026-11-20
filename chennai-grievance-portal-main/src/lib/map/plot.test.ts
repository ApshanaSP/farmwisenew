import { describe, expect, it } from "vitest";
import { centre, dist, enclosing, fmtArea, fmtLength, inside, pathLength, ringArea, toGeoJson } from "./plot";
import { pickShot, releaseOf, srcDate, waybackTiles } from "./imagery";

// a square about 100 m on a side near Ripon Building (13.0827 N, 80.2707 E)
const dLat = 100 / 111_320, dLon = 100 / (111_320 * Math.cos((13.0827 * Math.PI) / 180));
const sq = [
  { lat: 13.0827, lon: 80.2707 }, { lat: 13.0827 + dLat, lon: 80.2707 },
  { lat: 13.0827 + dLat, lon: 80.2707 + dLon }, { lat: 13.0827, lon: 80.2707 + dLon }
];

describe("the land plotter", () => {
  it("measures a 100 m square as about one hectare and 400 m round", () => {
    expect(ringArea(sq)).toBeGreaterThan(9_900);
    expect(ringArea(sq)).toBeLessThan(10_100);
    expect(pathLength(sq, true)).toBeGreaterThan(395);
    expect(pathLength(sq, true)).toBeLessThan(405);
    expect(dist(sq[0], sq[1])).toBeGreaterThan(99);
  });
  it("needs three corners for an area", () => expect(ringArea(sq.slice(0, 2))).toBe(0));
  it("knows what is inside", () => {
    expect(inside(centre(sq), sq)).toBe(true);
    expect(inside({ lat: 13.09, lon: 80.28 }, sq)).toBe(false);
  });
  it("says areas in the Collectorate's units", () => {
    expect(fmtArea(1000)).toEqual({ main: "1,000 m²", also: "24.7 cents" });
    expect(fmtArea(10_000).main).toBe("1.00 ha");
    expect(fmtArea(10_000).also).toBe("2.47 acres");
    expect(fmtArea(2_500_000).main).toBe("2.50 km²");
    expect(fmtLength(850)).toBe("850 m");
    expect(fmtLength(2400)).toBe("2.40 km");
  });
  it("gives Ask the Map a circle that holds the area, within its limits", () => {
    const c = enclosing(sq);
    expect(c.r).toBeGreaterThanOrEqual(70);
    expect(c.r).toBeLessThanOrEqual(75);
    expect(enclosing([{ lat: 13, lon: 80.1 }, { lat: 13.2, lon: 80.3 }]).r).toBe(5000);
  });
  it("writes a closed GeoJSON polygon in lon, lat order", () => {
    const g = JSON.parse(toGeoJson(sq, { name: "plot" }));
    expect(g.geometry.coordinates[0]).toHaveLength(5);
    expect(g.geometry.coordinates[0][0]).toEqual([80.2707, 13.0827]);
  });
});

describe("then and now imagery", () => {
  it("reads the photo's date and the sharpest layer at a street zoom", () => {
    expect(srcDate("20130301")).toBe("2013-03-01");
    expect(srcDate(null)).toBeNull();
    const s = pickShot(2016, [
      { attributes: { SRC_DATE: "20150101", SRC_RES: "15", MinMapLevel: "0", MaxMapLevel: "12", SRC_DESC: "Landsat" } },
      { attributes: { SRC_DATE: "20160303", SRC_RES: "0.5", MinMapLevel: "14", MaxMapLevel: "17", SRC_DESC: "WV02", NICE_DESC: "Maxar" } }
    ]);
    expect(s).toEqual({ year: 2016, date: "2016-03-03", sensor: "WV02", resM: 0.5, provider: "Maxar" });
    expect(pickShot(2016, []).date).toBeNull();
  });
  it("knows one version a year and its tiles", () => {
    expect(releaseOf(2014)?.release).toBe(5844);
    expect(releaseOf(1999)).toBeNull();
    expect(waybackTiles(5844)).toContain("/tile/5844/{z}/{y}/{x}");
  });
});
