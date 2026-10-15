/**
 * Chennai's 200 GCC wards and 15 zone outlines for the console's satellite map,
 * read once from the intelligence store and cached for the life of the server.
 */
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";

type Ring = number[][];

function rings(geom: any): Ring[] {
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  if (geom.type === "LineString") return [geom.coordinates];
  if (geom.type === "MultiLineString") return geom.coordinates;
  return [];
}

// ------------------------------------------------------------ lat/lon --

export interface MapGeo {
  /** rings as [lat, lon] pairs, simplified to ~10 m */
  wards: { ward: number; zone: number; taluk: string | null; rings: [number, number][][] }[];
  zones: { zone: number; name: string; lat: number; lon: number; lines: [number, number][][] }[];
  /** revenue taluks: no boundary is supplied, so the map colours each ward by its taluk */
  taluks: { code: string; name: string; lat: number; lon: number }[];
}

declare global {
  // eslint-disable-next-line no-var
  var __collectorGeoV6: MapGeo | undefined;
}

/** ~10 m: invisible at the console's zoom levels, and the map payload drops by more than half. */
const TOLERANCE = 0.00009;

/** Douglas-Peucker on [lat, lon] points; keeps the first and last point of every ring. */
export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ay, ax] = pts[a], [by, bx] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, best = tol;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = pts[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Joins segments that share an end point into longer lines (in any order or direction), so they can be simplified. */
export function chain(lines: Ring[]): Ring[] {
  const key = (p: number[]) => p[0] + "," + p[1];
  const segs = lines.filter((l) => l.length > 1).map((l) => [...l]);
  const used = new Uint8Array(segs.length);
  const at = new Map<string, number[]>();
  segs.forEach((l, i) => { for (const p of [l[0], l[l.length - 1]]) at.set(key(p), [...(at.get(key(p)) ?? []), i]); });
  const next = (p: number[]) => (at.get(key(p)) ?? []).find((i) => !used[i]);
  const out: Ring[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = segs[i];
    for (const grow of ["end", "start"] as const) {
      for (;;) {
        const tip = grow === "end" ? line[line.length - 1] : line[0];
        const j = next(tip);
        if (j === undefined) break;
        used[j] = 1;
        const s = key(segs[j][0]) === key(tip) ? segs[j] : [...segs[j]].reverse();
        if (grow === "end") line.push(...s.slice(1)); else line.unshift(...s.reverse().slice(0, -1));
      }
    }
    out.push(line);
  }
  return out;
}

/** Ward polygons and zone outlines for Leaflet, cached for the life of the server. */
export async function mapGeo(): Promise<MapGeo> {
  if (global.__collectorGeoV6) return global.__collectorGeoV6;
  const [wardRows] = await intelPool.query<RowDataPacket[]>(
    `SELECT ward_no, zone_no, zone_name, taluk_code, centroid_lat, centroid_lon, geometry FROM ref_wards ORDER BY ward_no`
  );
  const [zoneRows] = await intelPool.query<RowDataPacket[]>(`SELECT zone_no, zone_name, outline FROM ref_zones`);
  const [talukRows] = await intelPool.query<RowDataPacket[]>(`SELECT taluk_code, name, lat, lon FROM ref_taluks WHERE in_district = 1`);
  const parse = (g: any) => (typeof g === "string" ? JSON.parse(g) : g);
  const thin = (r: Ring): [number, number][] =>
    simplify(r.map(([lon, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5] as [number, number]), TOLERANCE);
  const zc = new Map<number, { name: string; lat: number[]; lon: number[] }>();
  for (const w of wardRows) {
    const z = zc.get(w.zone_no) ?? { name: String(w.zone_name), lat: [], lon: [] };
    z.lat.push(Number(w.centroid_lat));
    z.lon.push(Number(w.centroid_lon));
    zc.set(w.zone_no, z);
  }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const outline = new Map(zoneRows.map((z) => [z.zone_no, parse(z.outline)]));
  const geo: MapGeo = {
    wards: wardRows.map((w) => ({ ward: w.ward_no, zone: w.zone_no, taluk: w.taluk_code ?? null, rings: rings(parse(w.geometry)).map(thin) })),
    zones: [...zc.entries()].sort((a, b) => a[0] - b[0]).map(([zone, z]) => ({
      zone, name: z.name, lat: avg(z.lat), lon: avg(z.lon), lines: chain(rings(outline.get(zone))).map(thin)
    })),
    taluks: talukRows.map((t) => ({ code: t.taluk_code, name: t.name, lat: Number(t.lat), lon: Number(t.lon) }))
  };
  global.__collectorGeoV6 = geo;
  return geo;
}
