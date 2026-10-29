/**
 * After the rain: every predicted street marked STILL FLOODED (a flooding report within 60 m during the rain) or NO
 * FLOODING REPORTED, and every report further than COVER_M from all predicted streets marked MISSED (it joins the
 * memory by itself, since the memory is built from reports). The same distance the proof uses (replay.ts), so the
 * report card and the lift agree. "No flooding reported" never claims the jobs caused it. Pure.
 */
import { edgesNear, type GraphIndex, type RoadGraph } from "./graph";
import type { FloodInc, Memory } from "./memory";
import { COVER_M } from "./replay";

export const FLOODED_M = 60;

export interface StreetCheck { key: string; flooded: boolean; reports: number }
export interface ReportPoint { id: string; lat: number; lon: number; first: string; title: string; place: string | null; street: string | null; missed: boolean }
export interface RainCheck {
  reports: ReportPoint[];
  streets: StreetCheck[];
  /** counts for the report card */
  onPredicted: number;
  missed: number;
  flooded: number;
  quiet: number;
}

export function checkRain(g: RoadGraph, ix: GraphIndex, mem: Memory, reports: FloodInc[]): RainCheck {
  const streetOf = new Map<number, string>();
  for (const s of mem.streets) for (const e of s.edges) if (mem.tier[e] > 0) streetOf.set(e, s.key);
  const hitsBy = new Map<string, number>();
  const pts: ReportPoint[] = [];
  for (const r of reports) {
    const near = edgesNear(g, ix, r.lat, r.lon, COVER_M).filter((x) => streetOf.has(x.e));
    const on = near.find((x) => x.d <= FLOODED_M);
    if (on) hitsBy.set(streetOf.get(on.e)!, (hitsBy.get(streetOf.get(on.e)!) ?? 0) + 1);
    pts.push({ id: r.id, lat: r.lat, lon: r.lon, first: r.first, title: r.title, place: r.place, street: near[0] ? streetOf.get(near[0].e)! : null, missed: near.length === 0 });
  }
  const streets = mem.streets.map((s) => ({ key: s.key, flooded: (hitsBy.get(s.key) ?? 0) > 0, reports: hitsBy.get(s.key) ?? 0 }));
  pts.sort((a, b) => a.first.localeCompare(b.first) || a.id.localeCompare(b.id));
  return {
    reports: pts, streets, onPredicted: pts.filter((p) => !p.missed).length, missed: pts.filter((p) => p.missed).length,
    flooded: streets.filter((s) => s.flooded).length, quiet: streets.filter((s) => !s.flooded).length
  };
}
