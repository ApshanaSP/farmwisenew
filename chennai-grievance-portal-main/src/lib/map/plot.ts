/**
 * The land plotter's geometry (the map's "Measure and plot" tool): lengths and areas on the Earth's surface, the point-in-area test,
 * and the words for them in the units a Collectorate uses (metres, hectares, acres and cents: 1 acre = 100 cents = 4,046.86 m²).
 * Pure; points are { lat, lon } in degrees.
 */
export interface Pt { lat: number; lon: number }

const R = 6_378_137;
const rad = (d: number) => (d * Math.PI) / 180;

/** great-circle distance in metres */
export function dist(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** the length of a path in metres (closed: back to the first point too) */
export function pathLength(pts: Pt[], closed = false): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) m += dist(pts[pts.length - 1], pts[0]);
  return m;
}

/** the area of a ring on the sphere, in square metres (the spherical-excess formula Leaflet.draw and OpenLayers use) */
export function ringArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += rad(q.lon - p.lon) * (2 + Math.sin(rad(p.lat)) + Math.sin(rad(q.lat)));
  }
  return Math.abs((a * R * R) / 2);
}

/** is the point inside the ring (ray casting; fine at a district's scale) */
export function inside(p: Pt, ring: Pt[]): boolean {
  let x = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) x = !x;
  }
  return x;
}

/** the middle of a ring (the mean of its corners) */
export function centre(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lon: pts.reduce((s, p) => s + p.lon, 0) / n };
}

/** a circle that holds the whole ring, for Ask the Map's drawn area (radius 50 m to 5 km) */
export function enclosing(pts: Pt[]): { lat: number; lon: number; r: number } {
  const c = centre(pts);
  const r = Math.max(...pts.map((p) => dist(c, p)), 50);
  return { lat: Math.round(c.lat * 1e6) / 1e6, lon: Math.round(c.lon * 1e6) / 1e6, r: Math.round(Math.min(5000, r)) };
}

const n = (v: number, d = 0) => v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });

/** "850 m", "2.4 km" */
export function fmtLength(m: number): string {
  return m < 1000 ? `${n(m)} m` : `${n(m / 1000, m < 10_000 ? 2 : 1)} km`;
}

export const ACRE_M2 = 4046.8564224;
/** the area in the units that fit it: m² and cents for a plot, hectares and acres for a field, km² for a ward */
export function fmtArea(m2: number): { main: string; also: string } {
  const acres = m2 / ACRE_M2;
  if (m2 < 4000) return { main: `${n(m2)} m²`, also: `${n(acres * 100, 1)} cents` };
  if (m2 < 1_000_000) return { main: `${n(m2 / 10_000, 2)} ha`, also: `${n(acres, 2)} acres` };
  return { main: `${n(m2 / 1_000_000, 2)} km²`, also: `${n(m2 / 10_000, 0)} ha · ${n(acres, 0)} acres` };
}

/** the ring as GeoJSON (lon, lat order; closed), for a surveyor or another GIS */
export function toGeoJson(pts: Pt[], props: Record<string, unknown> = {}): string {
  const ring = pts.map((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
  if (ring.length) ring.push(ring[0]);
  return JSON.stringify({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } });
}
