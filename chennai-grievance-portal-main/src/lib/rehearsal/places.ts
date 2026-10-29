/**
 * What the rehearsal map shows beside the flood streets: CHOKE POINTS (drain and flooding complaints still open on or
 * near a flood street: fix these first), DRY SCHOOLS (schools away from likely flood streets, still reachable from a
 * hospital on rehearsal roads: possible relief centres, never "the" relief centres, which are GCC's), and the wards
 * along a river downstream of a reservoir that is releasing water. Pure.
 */
import { edgesNear, flatDistM, nearestNode, type GraphIndex, type RoadGraph } from "./graph";
import { CHOKE_CATS, openAt, TIER_LIKELY, type FloodInc, type Memory } from "./memory";
import type { LineFeat, PointFeat } from "@/lib/map/types";

/** a complaint this close to a flood street is on it */
export const CHOKE_M = 100;
/** a school this close to a likely flood street is not dry */
export const DRY_M = 150;
/** … and must be within this distance of one, to matter for it */
export const DRY_NEAR_M = 2500;
/** minutes from a hospital on rehearsal roads */
export const DRY_HOSPITAL_MIN = 15;
/** wards within this distance of a releasing river */
export const RIBBON_M = 500;

export interface Choke {
  id: string;
  cat: string;
  title: string;
  place: string | null;
  lat: number;
  lon: number;
  dept: string;
  ward: number | null;
  /** the flood street it is on (Street.key) and its tier */
  street: string;
  tier: 1 | 2;
  priority: number;
  ageDays: number;
  breached: boolean;
}

export function chokes(g: RoadGraph, ix: GraphIndex, mem: Memory, all: FloodInc[], live: boolean): Choke[] {
  const streetOf = new Map<number, { key: string; tier: 1 | 2 }>();
  for (const s of mem.streets) for (const e of s.edges) streetOf.set(e, { key: s.key, tier: s.tier });
  const out: Choke[] = [];
  for (const i of all) {
    if (!CHOKE_CATS.has(i.cat) || !openAt(i, mem.asOf, live) || i.prec == null || i.prec > 300) continue;
    const hit = edgesNear(g, ix, i.lat, i.lon, CHOKE_M).find((x) => streetOf.has(x.e));
    if (!hit) continue;
    const s = streetOf.get(hit.e)!;
    out.push({ id: i.id, cat: i.cat, title: i.title, place: i.place, lat: i.lat, lon: i.lon, dept: i.dept, ward: i.ward, street: s.key, tier: s.tier,
      priority: i.priority, ageDays: Math.max(0, Math.round((Date.parse(mem.asOf.replace(" ", "T") + "Z") - Date.parse(i.first.replace(" ", "T") + "Z")) / 86_400_000)), breached: i.breached });
  }
  return out.sort((a, b) => b.tier - a.tier || Number(b.breached) - Number(a.breached) || b.priority - a.priority || b.ageDays - a.ageDays || a.id.localeCompare(b.id));
}

export interface DrySchool {
  id: string;
  name: string;
  name_ta: string | null;
  lat: number;
  lon: number;
  ward: number | null;
  government: boolean;
  /** metres to the nearest likely flood street */
  floodM: number;
  /** minutes from the nearest hospital on rehearsal roads */
  hospitalMin: number;
}

const GOVT = /\b(corporation|government|govt|panchayat|municipal|adi dravidar|chennai high|chennai middle|chennai primary|gcc)\b|அரசு|மாநகராட்சி/i;

export function drySchools(g: RoadGraph, ix: GraphIndex, mem: Memory, schools: PointFeat[], hospSecRain: Float64Array, max = 30): DrySchool[] {
  // points along likely streets, for "how far is the nearest flood street"
  const likely: [number, number][] = [];
  for (let e = 0; e < g.m; e++) if (mem.tier[e] === TIER_LIKELY) {
    for (let k = g.shapeStart[e]; k < g.shapeStart[e + 1]; k++) likely.push([g.shape[2 * k], g.shape[2 * k + 1]]);
  }
  if (!likely.length) return [];
  const out: DrySchool[] = [];
  for (const s of schools) {
    if (!s.name || !s.in_district) continue;
    if (edgesNear(g, ix, s.lat, s.lon, DRY_M).some((x) => mem.tier[x.e] === TIER_LIKELY)) continue;
    let floodM = Infinity;
    for (const [la, lo] of likely) { const d = flatDistM(s.lat, s.lon, la, lo); if (d < floodM) floodM = d; }
    if (floodM > DRY_NEAR_M) continue;
    const u = nearestNode(g, ix, s.lat, s.lon, 300);
    if (u < 0 || !(hospSecRain[u] <= DRY_HOSPITAL_MIN * 60)) continue;
    out.push({ id: s.id, name: s.name, name_ta: s.name_ta, lat: s.lat, lon: s.lon, ward: s.ward, government: s.government === true || GOVT.test(s.name),
      floodM: Math.round(floodM), hospitalMin: Math.round((hospSecRain[u] / 60) * 10) / 10 });
  }
  // government schools first, then the ones nearest the flood streets they would serve
  return out.sort((a, b) => Number(b.government) - Number(a.government) || a.floodM - b.floodM || a.id.localeCompare(b.id)).slice(0, max);
}

/** reservoir → the river it releases into */
export const RELEASE_RIVER: Record<string, RegExp> = { "TNCH-07-T0726": /adyar/i, RD001: /kosasthal|kortalaiyar|puzhal|redhills surplus/i };

/** wards within RIBBON_M of a river's course in the district, and the river's lines */
export function ribbon(g: RoadGraph, river: LineFeat[]): { wards: number[]; lines: [number, number][][] } {
  const segs: [number, number, number, number][] = [];
  for (const l of river) for (const line of l.lines) for (let k = 1; k < line.length; k++) segs.push([line[k - 1][0], line[k - 1][1], line[k][0], line[k][1]]);
  if (!segs.length) return { wards: [], lines: [] };
  const wards = new Set<number>();
  // a ward is on the ribbon if one of its road pieces lies within RIBBON_M of the river (cheap: piece midpoints)
  for (let e = 0; e < g.m; e++) {
    if (!g.ward[e] || wards.has(g.ward[e]) || g.water[e] > RIBBON_M) continue;
    const mid = Math.floor((g.shapeStart[e] + g.shapeStart[e + 1] - 1) / 2);
    const la = g.shape[2 * mid], lo = g.shape[2 * mid + 1];
    for (const [a, b, c, d] of segs) {
      if (Math.abs(la - a) > 0.02 && Math.abs(la - c) > 0.02) continue;
      if (segDist(la, lo, a, b, c, d) <= RIBBON_M) { wards.add(g.ward[e]); break; }
    }
  }
  return { wards: [...wards].sort((a, b) => a - b), lines: river.flatMap((l) => l.lines) };
}
const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;
function segDist(pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number) {
  const px = pLon * KX, py = pLat * KY, ax = aLon * KX, ay = aLat * KY, bx = bLon * KX, by = bLat * KY;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
