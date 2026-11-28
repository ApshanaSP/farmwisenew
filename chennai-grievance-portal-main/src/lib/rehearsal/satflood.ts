/**
 * What the Rain view adds to each past rain, beside its flooding complaints:
 *   rain     how much rain fell, from every CFM-DSS gauge that reported (gauges.ts), per ward and over the district;
 *   sat      open flood water seen by Sentinel-1 radar on the first pass within 2 days of the rain, laid on the roads
 *            (scripts/sat_flood.py writes data/aws-cache/sat-flood.json; the file says how, and what radar cannot see).
 * Flooded streets of a rain are then one list, each with where it is known from: "complaint" (a flooding report stood on
 * it), "satellite" (water on it in the radar picture), or "both". Complaints stay the main record: no satellite water on a
 * street never means it stayed dry. Pure parts are tested in satflood.test.ts.
 */
import fs from "fs";
import path from "path";
import { loadWardDataset } from "@/lib/wards";
import type { PastRain } from "./types";
import { gaugeCache, rainSummary, topUpGauges, trustedGauges, GAUGE_SOURCE, IDW_METHOD, type RainSummary, type WardPoint } from "./gauges";

export const SAT_FILE = () => process.env.SAT_FLOOD_FILE || path.join(process.cwd(), "data", "aws-cache", "sat-flood.json");
/** a flooding report this close to a street under satellite water makes the street "both" */
export const BOTH_M = 100;

export interface SatStreet {
  key: string; name: string | null; name_ta: string | null; near: string | null; ward: number; edges: number[];
  /** "on": water on the road itself; "beside": water within about 45 m of it (an open plot or lake edge by the road) */
  how: "on" | "beside";
  floodedM: number; lengthM: number; conf: "high" | "medium"; lat: number; lon: number; lines: [number, number][][];
}
export interface SatRain {
  id: string; start: string; end: string;
  status: "pass" | "no-pass" | "light-rain" | "no-reference";
  note?: string;
  nearest?: { before: string | null; after: string | null };
  pass?: { at: string; satellite?: string; orbit?: string; relativeOrbit?: number; scenes: string[]; hoursAfterStart?: number; daysAfterEnd?: number };
  reference?: { dates: string[]; scenes: string[] };
  thresholdDb?: number; coveredShare?: number; waterKm2?: number; highKm2?: number; roadKm?: number; besideKm?: number;
  wards?: { ward: number; km2: number }[];
  streets?: SatStreet[];
  extent?: { c: "high" | "medium"; r: [number, number][] }[];
  gaugeRain?: { gauges: number; medianMm: number; maxMm: number } | null;
  /** v2: every satellite picture of the rain (radar and clear-enough optical), each with what it saw; the rain's water is their union */
  looks?: SatLook[];
}
export interface SatLook {
  kind: "radar" | "optical"; satellite: string; at: string; daysAfterEnd: number; hoursAfterStart?: number;
  /** share of the wards the picture saw (radar: covered; optical: clear of cloud, shadow and haze) */
  clearShare: number; cloudPct?: number; waterKm2: number; highKm2: number; roadKm?: number; scenes: string[];
}
export interface SatFile {
  version: 1; builtAt: string; graphHash: string | null;
  source: { name: string; catalogue: string; licence: string; permanentWater: string; roads: string };
  method: { text: string; [k: string]: unknown };
  caveats: string[];
  rains: SatRain[];
}

declare global {
  // eslint-disable-next-line no-var
  var __satFlood: { mtime: number; v: SatFile | null } | undefined;
}

export function readSatFlood(): SatFile | null {
  let mtime = 0;
  try { mtime = fs.statSync(SAT_FILE()).mtimeMs; } catch { return null; }
  if (global.__satFlood?.mtime === mtime) return global.__satFlood.v;
  let v: SatFile | null = null;
  try { const j = JSON.parse(fs.readFileSync(SAT_FILE(), "utf8")); v = j?.version === 1 && Array.isArray(j.rains) ? j : null; } catch { v = null; }
  global.__satFlood = { mtime, v };
  return v;
}

// ---------------------------------------------------------------- pure parts --

const RAD = Math.PI / 180;
const KX = 111320 * Math.cos(13.05 * RAD), KY = 110574;
/** metres from a point to a polyline (flat projection, fine within the city) */
export function distToLinesM(lat: number, lon: number, lines: [number, number][][]): number {
  let best = Infinity;
  const px = lon * KX, py = lat * KY;
  for (const l of lines) for (let k = 0; k + 1 < l.length; k++) {
    const ax = l[k][1] * KX, ay = l[k][0] * KY, bx = l[k + 1][1] * KX, by = l[k + 1][0] * KY;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

export type StreetSource = "complaint" | "satellite" | "both";
export interface RainStreet {
  /** the flood memory's street key for a complaint street; the satellite street's key otherwise (the same key when they are the same street) */
  key: string;
  source: StreetSource;
  /** flooding reports on it in this rain */
  reports: number;
  /** the satellite street, when water was seen on it */
  sat: { name: string | null; near: string | null; ward: number; how: "on" | "beside"; floodedM: number; conf: "high" | "medium"; lat: number; lon: number; lines: [number, number][][] } | null;
}

/**
 * One list of a rain's flooded streets: complaint streets (from the reports' street keys), satellite streets, and "both"
 * where a satellite street has the same key or a report of the street lies within BOTH_M of the satellite water's road.
 * Order: both first, then complaint streets by reports, then satellite streets by flooded length.
 */
export function mergeRainStreets(reports: { street: string | null; lat: number; lon: number }[], sat: SatStreet[] | null | undefined, bothM = BOTH_M): RainStreet[] {
  const byKey = new Map<string, { n: number; pts: [number, number][] }>();
  for (const r of reports) {
    if (!r.street) continue;
    const x = byKey.get(r.street) ?? byKey.set(r.street, { n: 0, pts: [] }).get(r.street)!;
    x.n++; x.pts.push([r.lat, r.lon]);
  }
  // only water ON the road makes a satellite street flooded: "beside" (water within about 45 m: a lake edge or an open plot) is context
  // for the radar summary, never a flooded street, and never makes a complaint street "both"
  sat = (sat ?? []).filter((s) => (s.how ?? "on") === "on");
  const slim = (s: SatStreet): RainStreet["sat"] => ({ name: s.name, near: s.near, ward: s.ward, how: s.how ?? "on", floodedM: s.floodedM, conf: s.conf, lat: s.lat, lon: s.lon, lines: s.lines });
  const out: RainStreet[] = [];
  const usedSat = new Set<string>();
  for (const [key, x] of byKey) {
    const same = (sat ?? []).find((s) => s.key === key) ?? (sat ?? []).find((s) => !usedSat.has(s.key) && x.pts.some(([la, lo]) => distToLinesM(la, lo, s.lines) <= bothM));
    if (same) usedSat.add(same.key);
    out.push({ key, source: same ? "both" : "complaint", reports: x.n, sat: same ? slim(same) : null });
  }
  for (const s of sat ?? []) if (!usedSat.has(s.key) && !byKey.has(s.key)) out.push({ key: s.key, source: "satellite", reports: 0, sat: slim(s) });
  const rank = { both: 0, complaint: 1, satellite: 2 } as const;
  return out.sort((a, b) => rank[a.source] - rank[b.source] || b.reports - a.reports || (b.sat?.floodedM ?? 0) - (a.sat?.floodedM ?? 0) || a.key.localeCompare(b.key));
}

/** ward centres (area-weighted centroid of the outer ring) and areas, from the ward polygons ([lng, lat] rings) */
export function wardPointsOf(features: { wardNo: number; rings: number[][][] }[]): WardPoint[] {
  return features.map((f) => {
    const ring = f.rings[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i];
      const c = x0 * y1 - x1 * y0;
      a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    a /= 2;
    const lon = a ? cx / (6 * a) : ring[0][0], lat = a ? cy / (6 * a) : ring[0][1];
    return { ward: f.wardNo, lat, lon, areaKm2: Math.abs(a) * (KX / 1000) * (KY / 1000) };
  });
}

// ---------------------------------------------------------------- for the rains API --

/** the satellite side of one rain, as the Rain view needs it (extent as boxes [south, west, north, east, 1 medium | 2 high]) */
export interface RainSat {
  status: SatRain["status"];
  note: string | null;
  pass: { at: string; satellite: string | null; daysAfterEnd: number | null; scenes: string[] } | null;
  reference: string[];
  nearest: { before: string | null; after: string | null } | null;
  waterKm2: number | null; highKm2: number | null; roadKm: number | null; besideKm: number | null; coveredShare: number | null;
  boxes: [number, number, number, number, 1 | 2][];
  /** roads with water only BESIDE them (lake edge, open plot): context for the radar line, not flooded streets */
  beside: { name: string | null; ward: number }[];
  /** the radar's water/land threshold hit its clamp: no clear split, so the water area is uncertain */
  clamped: boolean;
  /** each picture of the rain, oldest first */
  looks: { kind: "radar" | "optical"; satellite: string; at: string; daysAfterEnd: number; clearShare: number; cloudPct: number | null; waterKm2: number; roadKm: number | null }[];
}

export function satOf(r: SatRain | undefined): RainSat | null {
  if (!r) return null;
  // a pass skipped as "light rain" on a handful of gauges (the September gap) is not evidence of light rain: say what is known
  const thin = r.status === "light-rain" && (r.gaugeRain?.gauges ?? 0) < 20;
  const note = thin
    ? `Only ${r.gaugeRain?.gauges ?? 0} of about 75 CFM-DSS gauges reported for this rain, too few to tell how much fell; the radar pass${r.pass?.at ? ` of ${r.pass.at.slice(0, 10)}` : ""} was not compared.`
    : r.note ?? null;
  return {
    status: r.status, note,
    pass: r.pass ? { at: r.pass.at, satellite: r.pass.satellite ?? null, daysAfterEnd: r.pass.daysAfterEnd ?? null, scenes: r.pass.scenes } : null,
    reference: r.reference?.dates ?? [], nearest: r.nearest ?? null,
    waterKm2: r.waterKm2 ?? null, highKm2: r.highKm2 ?? null, roadKm: r.roadKm ?? null, besideKm: r.besideKm ?? null, coveredShare: r.coveredShare ?? null,
    boxes: (r.extent ?? []).map((x): [number, number, number, number, 1 | 2] => [x.r[2][0], x.r[0][1], x.r[0][0], x.r[1][1], x.c === "high" ? 2 : 1]),
    beside: (r.streets ?? []).filter((x) => x.how === "beside").map((x) => ({ name: x.name, ward: x.ward })),
    clamped: r.thresholdDb != null && r.thresholdDb <= -14,
    looks: (r.looks ?? (r.status === "pass" && r.pass ? [{ kind: "radar" as const, satellite: r.pass.satellite ?? "Sentinel-1", at: r.pass.at, daysAfterEnd: r.pass.daysAfterEnd ?? 0,
      clearShare: r.coveredShare ?? 1, waterKm2: r.waterKm2 ?? 0, highKm2: r.highKm2 ?? 0, roadKm: r.roadKm, scenes: r.pass.scenes }] : []))
      .map((l) => ({ kind: l.kind, satellite: l.satellite, at: l.at, daysAfterEnd: l.daysAfterEnd, clearShare: l.clearShare, cloudPct: l.cloudPct ?? null,
        waterKm2: l.waterKm2, roadKm: l.roadKm ?? null }))
  };
}

export type RainWithData = PastRain & { rain: RainSummary | null; sat: RainSat | null; streets: RainStreet[] };
export interface RainsPayload {
  asOf: string;
  rains: RainWithData[];
  gauges: { source: string; count: number; inChennai: number; fetchedAt: string; method: string } | null;
  satellite: { name: string; catalogue: string; licence: string; builtAt: string; method: string; caveats: string[] } | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __rainWards: WardPoint[] | undefined;
  // eslint-disable-next-line no-var
  var __rainsPayload: { v: object; c: object | null; s: object | null; out: RainsPayload } | undefined;
}
const wardPoints = (): WardPoint[] => {
  if (global.__rainWards) return global.__rainWards;
  const ds = loadWardDataset();
  return (global.__rainWards = ds.available ? wardPointsOf(ds.features) : []);
};

/** pastRains() with each rain's gauge rain, its satellite water and its merged street list */
export function withRainData(v: { asOf: string; rains: PastRain[] }): RainsPayload {
  topUpGauges();
  const c = gaugeCache();
  const sat = readSatFlood();
  // the same past rains and the same two files: the same answer (pastRains keeps its result for the hour)
  const m = global.__rainsPayload;
  if (m && m.v === v && m.c === c && m.s === sat) return m.out;
  const wp = c ? wardPoints() : [];
  const satBy = new Map((sat?.rains ?? []).map((r) => [r.id, r]));
  const out: RainsPayload = {
    asOf: v.asOf,
    rains: v.rains.map((r) => {
      const s = satBy.get(r.id);
      return { ...r, rain: c ? rainSummary(c, r.start, r.end, wp) : null, sat: satOf(s), streets: mergeRainStreets(r.reports, s?.status === "pass" ? s.streets : null) };
    }),
    gauges: c ? (() => { const g = trustedGauges(c.gauges); return { source: GAUGE_SOURCE, count: g.length, inChennai: g.filter((x) => x.inChennai).length, fetchedAt: c.fetchedAt, method: IDW_METHOD }; })() : null,
    satellite: sat ? { name: sat.source.name, catalogue: sat.source.catalogue, licence: sat.source.licence, builtAt: sat.builtAt, method: sat.method.text, caveats: sat.caveats } : null
  };
  global.__rainsPayload = { v, c, s: sat, out };
  return out;
}
