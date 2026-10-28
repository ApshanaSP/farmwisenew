/**
 * Ask the Map's geometry: distances, point-in-polygon, distance to a line, bounds, a grid index for "within" and
 * "nearest", and distance words. Pure (no database, no Leaflet), so every rule is unit-tested and shared by the server
 * and the map. Points are { lat, lon } in degrees; rings and lines are [lat, lon] pairs, as mapGeo() hands them out.
 */

export interface LatLon { lat: number; lon: number }
export type Pair = [number, number]; // [lat, lon]
export interface Bbox { s: number; w: number; n: number; e: number }

const R = 6371008.8; // mean Earth radius, metres
const RAD = Math.PI / 180;
/** Chennai's latitude, for the local flat projection used by line distances (error < 0.5 % within 50 km). */
export const CHENNAI_LAT = 13.0827;
export const M_PER_DEG_LAT = (Math.PI * R) / 180; // one degree on the haversine sphere, so the flat and great-circle distances agree
export const mPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos(lat * RAD);

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dp = (b.lat - a.lat) * RAD, dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The console's rough distance in km (flat, 111.2 km a degree): what the gazetteer, threads and location review used
 * before this module, kept exactly so their results do not move.
 */
export function roughKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  return Math.hypot((aLat - bLat) * 111.2, (aLon - bLon) * 111.2 * Math.cos((aLat * Math.PI) / 180));
}

// ------------------------------------------------------------ polygons --

/** Ray casting on one ring of [lat, lon] pairs. */
function inRing(p: LatLon, ring: Pair[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Inside a polygon given as rings (the first is the outline, the rest holes), or a multipolygon given as a list of
 * such polygons. A point on a hole's inside is outside.
 */
export function pointInPolygon(p: LatLon, rings: Pair[][] | Pair[][][]): boolean {
  if (!rings.length) return false;
  const polys = (Array.isArray(rings[0][0][0]) ? rings : [rings]) as Pair[][][];
  for (const poly of polys) {
    if (!poly.length || !inRing(p, poly[0])) continue;
    if (!poly.slice(1).some((h) => inRing(p, h))) return true;
  }
  return false;
}

// --------------------------------------------------------------- lines --

/** Flat metres around a reference latitude: x east, y north. */
function project(p: LatLon, lat0: number): [number, number] {
  return [p.lon * mPerDegLon(lat0), p.lat * M_PER_DEG_LAT];
}

/** Distance in metres from p to the segment a-b (a local flat projection at p's latitude). */
export function distToSegmentM(p: LatLon, a: LatLon, b: LatLon): number {
  const [px, py] = project(p, p.lat), [ax, ay] = project(a, p.lat), [bx, by] = project(b, p.lat);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Nearest distance in metres from p to a line (or several), with the nearest point on it. */
export function distToLineM(p: LatLon, line: Pair[] | Pair[][]): { m: number; at: LatLon | null } {
  const parts = (line.length && Array.isArray(line[0][0]) ? line : [line]) as Pair[][];
  let best = Infinity, at: LatLon | null = null;
  const k = mPerDegLon(p.lat);
  for (const l of parts) {
    for (let i = 1; i < l.length; i++) {
      const a = { lat: l[i - 1][0], lon: l[i - 1][1] }, b = { lat: l[i][0], lon: l[i][1] };
      const d = distToSegmentM(p, a, b);
      if (d < best) {
        best = d;
        const ax = a.lon * k, ay = a.lat * M_PER_DEG_LAT, dx = b.lon * k - ax, dy = b.lat * M_PER_DEG_LAT - ay, len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.lon * k - ax) * dx + (p.lat * M_PER_DEG_LAT - ay) * dy) / len2));
        at = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
      }
    }
    if (l.length === 1) {
      const d = haversineM(p, { lat: l[0][0], lon: l[0][1] });
      if (d < best) { best = d; at = { lat: l[0][0], lon: l[0][1] }; }
    }
  }
  return { m: best, at };
}

/** Line length in metres. */
export function lineLengthM(line: Pair[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversineM({ lat: line[i - 1][0], lon: line[i - 1][1] }, { lat: line[i][0], lon: line[i][1] });
  return s;
}

/**
 * A corridor around a line, as polygons for the map: each segment becomes a rectangle with round-ish ends (an octagon
 * at each vertex). Drawn only; membership is decided by distToLineM, so the drawing never changes a count.
 */
export function corridorPolygons(line: Pair[], meters: number): Pair[][] {
  const out: Pair[][] = [];
  const k = mPerDegLon(line[0]?.[0] ?? CHENNAI_LAT);
  const off = (lat: number, lon: number, ex: number, ny: number): Pair => [lat + ny / M_PER_DEG_LAT, lon + ex / k];
  for (let i = 1; i < line.length; i++) {
    const [la, lo] = line[i - 1], [lb, lb2] = line[i];
    const dx = (lb2 - lo) * k, dy = (lb - la) * M_PER_DEG_LAT, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * meters, ny = (dx / len) * meters;
    out.push([off(la, lo, nx, ny), off(lb, lb2, nx, ny), off(lb, lb2, -nx, -ny), off(la, lo, -nx, -ny)]);
  }
  for (const [la, lo] of line) out.push(circlePolygon({ lat: la, lon: lo }, meters, 8));
  return out;
}

// ------------------------------------------------------------- bounds --

export function bboxOf(points: LatLon[]): Bbox | null {
  if (!points.length) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) {
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lon < w) w = p.lon;
    if (p.lon > e) e = p.lon;
  }
  return { s, w, n, e };
}

export function expandBboxM(b: Bbox, meters: number): Bbox {
  const dLat = meters / M_PER_DEG_LAT, dLon = meters / mPerDegLon((b.s + b.n) / 2);
  return { s: b.s - dLat, w: b.w - dLon, n: b.n + dLat, e: b.e + dLon };
}

export const inBbox = (p: LatLon, b: Bbox) => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e;

/** A circle as a polygon of `steps` points, for drawing and for "inside a drawn circle" on the map. */
export function circlePolygon(center: LatLon, meters: number, steps = 64): Pair[] {
  const out: Pair[] = [];
  const k = mPerDegLon(center.lat);
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    out.push([center.lat + (Math.sin(a) * meters) / M_PER_DEG_LAT, center.lon + (Math.cos(a) * meters) / k]);
  }
  return out;
}

/**
 * The bounds of the middle `keep` share of the points by latitude and by longitude, so one far-off report does not
 * zoom the camera out to the whole district. With fewer than 5 points every point counts.
 */
export function robustBounds(points: LatLon[], keep = 0.9): { box: Bbox | null; outside: number } {
  if (points.length < 5) return { box: bboxOf(points), outside: 0 };
  const lats = points.map((p) => p.lat).sort((a, b) => a - b), lons = points.map((p) => p.lon).sort((a, b) => a - b);
  const cut = (1 - keep) / 2;
  const lo = Math.floor(cut * (points.length - 1)), hi = Math.ceil((1 - cut) * (points.length - 1));
  const box = { s: lats[lo], n: lats[hi], w: lons[lo], e: lons[hi] };
  return { box, outside: points.filter((p) => !inBbox(p, box)).length };
}

// --------------------------------------------------------------- index --

/**
 * A 250 m grid over points: "within" and "nearest" look only at the cells near a point, so a question over 27,000
 * incidents and 650 schools takes milliseconds. Distances are still exact (haversine) for every candidate.
 */
export class GridIndex<T extends LatLon> {
  private cells = new Map<string, T[]>();
  private readonly dLat: number;
  private readonly dLon: number;
  constructor(readonly items: readonly T[], readonly cellM = 250) {
    this.dLat = cellM / M_PER_DEG_LAT;
    this.dLon = cellM / mPerDegLon(CHENNAI_LAT);
    for (const it of items) {
      const k = this.key(it.lat, it.lon);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(it);
    }
  }
  private key(lat: number, lon: number) { return `${Math.floor(lat / this.dLat)},${Math.floor(lon / this.dLon)}`; }

  /** Every item within `meters` of p, nearest first, with its distance. */
  within(p: LatLon, meters: number): { item: T; m: number }[] {
    const out: { item: T; m: number }[] = [];
    const rLat = Math.ceil(meters / this.cellM) + 1, rLon = Math.ceil(meters / (this.cellM * Math.cos(p.lat * RAD) / Math.cos(CHENNAI_LAT * RAD))) + 1;
    const cy = Math.floor(p.lat / this.dLat), cx = Math.floor(p.lon / this.dLon);
    for (let y = cy - rLat; y <= cy + rLat; y++)
      for (let x = cx - rLon; x <= cx + rLon; x++)
        for (const it of this.cells.get(`${y},${x}`) ?? []) {
          const m = haversineM(p, it);
          if (m <= meters) out.push({ item: it, m });
        }
    return out.sort((a, b) => a.m - b.m);
  }

  /** The k nearest items to p (searching outwards ring by ring, up to maxM), nearest first. */
  nearest(p: LatLon, k = 1, maxM = 60_000): { item: T; m: number }[] {
    if (!this.items.length) return [];
    // grid rings up to 4 km; past that a plain scan is cheaper than visiting thousands of empty cells
    for (let r = this.cellM; r <= Math.min(4000, maxM); r *= 2) {
      const found = this.within(p, r);
      if (found.length >= k) return found.slice(0, k);
    }
    return this.items.map((item) => ({ item, m: haversineM(p, item) })).filter((x) => x.m <= maxM).sort((a, b) => a.m - b.m).slice(0, k);
  }
}

// -------------------------------------------------------------- words --

/** "40 m", "420 m" (to 10 m under 1 km), "3.4 km"; Tamil uses மீ / கி.மீ. */
export function fmtDistance(m: number, lang: "en" | "ta" | "tanglish" = "en"): string {
  if (!Number.isFinite(m)) return lang === "ta" ? "தெரியவில்லை" : "unknown";
  const ta = lang === "ta";
  if (m < 100) return `${Math.round(m)} ${ta ? "மீ" : "m"}`;
  if (m < 1000) {
    const r = Math.round(m / 10) * 10;
    return r >= 1000 ? (ta ? "1 கி.மீ" : "1 km") : `${r} ${ta ? "மீ" : "m"}`;
  }
  const km = Math.round(m / 100) / 10;
  return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} ${ta ? "கி.மீ" : "km"}`;
}
