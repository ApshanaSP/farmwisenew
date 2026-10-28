import { describe, expect, it } from "vitest";
import {
  GridIndex, bboxOf, circlePolygon, distToLineM, distToSegmentM, expandBboxM, fmtDistance, haversineM, pointInPolygon, robustBounds, roughKm,
  type LatLon, type Pair
} from "./geom";

/** Vincenty's inverse formula on the WGS84 ellipsoid: an independent oracle for the haversine distance. */
function vincentyM(a: LatLon, b: LatLon): number {
  const A = 6378137, f = 1 / 298.257223563, B = A * (1 - f), rad = Math.PI / 180;
  const L = (b.lon - a.lon) * rad, U1 = Math.atan((1 - f) * Math.tan(a.lat * rad)), U2 = Math.atan((1 - f) * Math.tan(b.lat * rad));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev = 0, sS = 0, cS = 0, sig = 0, c2a = 0, c2sm = 0;
  for (let i = 0; i < 200 && Math.abs(lam - prev) > 1e-12; i++) {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    cS = sU1 * sU2 + cU1 * cU2 * cl;
    sig = Math.atan2(sS, cS);
    const sa = (cU1 * cU2 * sl) / sS;
    c2a = 1 - sa * sa;
    c2sm = c2a ? cS - (2 * sU1 * sU2) / c2a : 0;
    const C = (f / 16) * c2a * (4 + f * (4 - 3 * c2a));
    prev = lam;
    lam = L + (1 - C) * f * sa * (sig + C * sS * (c2sm + C * cS * (-1 + 2 * c2sm * c2sm)));
  }
  const u2 = (c2a * (A * A - B * B)) / (B * B);
  const AA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), BB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const ds = BB * sS * (c2sm + (BB / 4) * (cS * (-1 + 2 * c2sm * c2sm) - (BB / 6) * c2sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2sm * c2sm)));
  return B * AA * (sig - ds);
}

const P = {
  marinaLighthouse: { lat: 13.0397, lon: 80.2793 }, central: { lat: 13.0827, lon: 80.2752 }, airport: { lat: 12.9941, lon: 80.1709 },
  koyambedu: { lat: 13.0694, lon: 80.1948 }, tambaram: { lat: 12.9249, lon: 80.1 }, ennore: { lat: 13.2146, lon: 80.3203 }, guindy: { lat: 13.0067, lon: 80.2206 }
};

describe("haversineM", () => {
  it.each([
    ["Marina lighthouse to Chennai Central", P.marinaLighthouse, P.central],
    ["Central to the airport", P.central, P.airport],
    ["Koyambedu to Tambaram", P.koyambedu, P.tambaram],
    ["Ennore to Guindy", P.ennore, P.guindy],
    ["Airport to Ennore", P.airport, P.ennore]
  ])("%s is within 0.6 %% of the ellipsoid", (_n, a, b) => {
    // a sphere is up to 0.56 % long north-south at Chennai's latitude (the meridian's radius there is 6,336 km, not 6,371)
    const h = haversineM(a, b), v = vincentyM(a, b);
    expect(Math.abs(h - v) / v).toBeLessThan(0.006);
  });
  it("is zero for one point and symmetric", () => {
    expect(haversineM(P.central, P.central)).toBe(0);
    expect(haversineM(P.central, P.airport)).toBeCloseTo(haversineM(P.airport, P.central), 6);
  });
  it("roughKm keeps the console's old formula", () => {
    expect(roughKm(13, 80, 13.01, 80)).toBeCloseTo(1.112, 6);
  });
});

describe("pointInPolygon", () => {
  const sq = (s: number, w: number, n: number, e: number): Pair[] => [[s, w], [s, e], [n, e], [n, w], [s, w]];
  const outer = sq(13, 80, 13.1, 80.1), hole = sq(13.04, 80.04, 13.06, 80.06);
  it("inside, outside and inside a hole", () => {
    expect(pointInPolygon({ lat: 13.02, lon: 80.02 }, [outer])).toBe(true);
    expect(pointInPolygon({ lat: 13.2, lon: 80.02 }, [outer])).toBe(false);
    expect(pointInPolygon({ lat: 13.05, lon: 80.05 }, [outer, hole])).toBe(false);
    expect(pointInPolygon({ lat: 13.03, lon: 80.05 }, [outer, hole])).toBe(true);
  });
  it("multipolygons: either part counts", () => {
    const far = sq(13.3, 80.3, 13.4, 80.4);
    expect(pointInPolygon({ lat: 13.35, lon: 80.35 }, [[outer], [far]])).toBe(true);
    expect(pointInPolygon({ lat: 13.2, lon: 80.2 }, [[outer], [far]])).toBe(false);
  });
  it("an empty polygon contains nothing", () => expect(pointInPolygon({ lat: 13, lon: 80 }, [])).toBe(false));
});

describe("distances to lines", () => {
  /** dense haversine sampling of the segment: the oracle */
  const sampled = (p: LatLon, a: LatLon, b: LatLon) => {
    let best = Infinity;
    for (let i = 0; i <= 20000; i++) {
      const t = i / 20000;
      best = Math.min(best, haversineM(p, { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }));
    }
    return best;
  };
  it.each([
    [{ lat: 13.06, lon: 80.25 }, P.marinaLighthouse, P.central],
    [{ lat: 13.0, lon: 80.3 }, P.guindy, P.airport],
    [{ lat: 13.1, lon: 80.1 }, P.koyambedu, P.tambaram],
    [{ lat: 13.2, lon: 80.25 }, P.central, P.ennore]
  ])("segment distance within 0.5 %% of haversine sampling (%#)", (p, a, b) => {
    const d = distToSegmentM(p, a, b), o = sampled(p, a, b);
    expect(Math.abs(d - o)).toBeLessThan(Math.max(1, o * 0.005));
  });
  it("a point past the end measures to the end", () => {
    const d = distToSegmentM({ lat: 13.2, lon: 80.2752 }, P.marinaLighthouse, P.central);
    expect(Math.abs(d - haversineM({ lat: 13.2, lon: 80.2752 }, P.central)) / d).toBeLessThan(0.005);
  });
  it("a multi-part line takes its nearest part and says where", () => {
    const line: Pair[][] = [[[13, 80], [13, 80.01]], [[13.05, 80], [13.05, 80.01]]];
    const r = distToLineM({ lat: 13.049, lon: 80.005 }, line);
    expect(r.m).toBeGreaterThan(100);
    expect(r.m).toBeLessThan(125);
    expect(r.at!.lat).toBeCloseTo(13.05, 6);
  });
});

describe("bounds", () => {
  it("bbox, expand and circle", () => {
    const b = bboxOf([P.central, P.airport])!;
    expect(b).toEqual({ s: 12.9941, w: 80.1709, n: 13.0827, e: 80.2752 });
    const e = expandBboxM(b, 1000);
    expect(haversineM({ lat: b.s, lon: b.w }, { lat: e.s, lon: b.w })).toBeCloseTo(1000, -1);
    const c = circlePolygon(P.central, 500, 32);
    expect(c).toHaveLength(32);
    for (const [lat, lon] of c) expect(Math.abs(haversineM(P.central, { lat, lon }) - 500)).toBeLessThan(3);
  });
  it("robustBounds ignores one far-off point", () => {
    const pts: LatLon[] = Array.from({ length: 40 }, (_, i) => ({ lat: 13.04 + (i % 7) * 0.001, lon: 80.24 + (i % 5) * 0.001 }));
    pts.push({ lat: 13.23, lon: 80.32 });
    const r = robustBounds(pts, 0.9);
    expect(r.box!.n).toBeLessThan(13.05);
    expect(r.outside).toBe(1);
  });
  it("robustBounds with few points keeps them all", () => {
    expect(robustBounds([P.central, P.ennore], 0.9)).toEqual({ box: bboxOf([P.central, P.ennore]), outside: 0 });
  });
});

describe("GridIndex", () => {
  // a seeded scatter over the district
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = Array.from({ length: 3000 }, (_, i) => ({ id: i, lat: 12.9 + rnd() * 0.3, lon: 80.1 + rnd() * 0.25 }));
  const idx = new GridIndex(pts);
  it("within equals a brute-force scan", () => {
    for (const [p, m] of [[P.central, 300], [P.guindy, 1200], [P.koyambedu, 75], [{ lat: 12.95, lon: 80.12 }, 5000]] as const) {
      const got = idx.within(p, m).map((x) => x.item.id).sort((a, b) => a - b);
      const want = pts.filter((q) => haversineM(p, q) <= m).map((q) => q.id).sort((a, b) => a - b);
      expect(got).toEqual(want);
    }
  });
  it("nearest equals a brute-force scan, near and far", () => {
    for (const p of [P.central, P.tambaram, { lat: 13.6, lon: 80.6 }]) {
      const got = idx.nearest(p, 5).map((x) => x.item.id);
      const want = [...pts].sort((a, b) => haversineM(p, a) - haversineM(p, b)).slice(0, 5).map((q) => q.id);
      expect(got).toEqual(want);
    }
  });
  it("an empty index finds nothing", () => expect(new GridIndex([]).nearest(P.central, 3)).toEqual([]));
});

describe("fmtDistance", () => {
  it.each([[40, "40 m", "40 மீ"], [423, "420 m", "420 மீ"], [996, "1 km", "1 கி.மீ"], [3420, "3.4 km", "3.4 கி.மீ"], [12000, "12 km", "12 கி.மீ"]])(
    "%d m", (m, en, ta) => {
      expect(fmtDistance(m)).toBe(en);
      expect(fmtDistance(m, "ta")).toBe(ta);
    });
});
