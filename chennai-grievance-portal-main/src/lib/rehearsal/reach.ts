/**
 * Reach of help: how far each hospital and fire station can drive in T_HELP minutes, on normal roads and on rehearsal
 * roads (likely flood streets closed, possible ones slow: memory.ts), which wards lose quick help, which facilities are
 * cut off, and each cut-off facility's way out to a main road. Shortest paths on OpenStreetMap roads (paths.ts) with
 * typical speeds and no traffic: it shows which roads matter, not exact minutes. Pure.
 */
import { flatDistM, nearestNode, type GraphIndex, type RoadGraph } from "./graph";
import { dijkstra, isMainNode, route, routeNames, type RoadState } from "./paths";

/** minutes counted as "quick help" (glossary: our assumption, not a government norm) */
export const T_HELP_MIN = 10;
export const T_HELP_CHOICES = [5, 10, 15];
/** a facility further than this from any road junction is not routed */
export const SNAP_M = 400;
/** a facility is cut off when its rehearsal reach is below this share of its normal reach */
export const CUT_SHARE = 0.5;

export interface Facility {
  id: string;
  kind: "hospital" | "fire";
  name: string;
  name_ta: string | null;
  lat: number;
  lon: number;
  government: boolean;
  source: "osm" | "store";
  beds: { total: number | null; occupied: number | null; pct: number | null } | null;
  ambulance: boolean | null;
  ward: number | null;
}

export interface Detour {
  /** the main road it leads to */
  to: string | null;
  normal: { sec: number; names: string[]; edges: number[] } | null;
  rehearsal: { sec: number; names: string[]; edges: number[] } | null;
}

export interface FacilityReach {
  id: string;
  node: number;
  /** km of road reached within T_HELP */
  normalKm: number;
  rehearsalKm: number;
  /** wards reached (any road of the ward within T_HELP) */
  normalWards: number;
  rehearsalWards: number;
  cutOff: boolean;
  /** why: "its own road floods" or "reach falls by 62 %" */
  why: string | null;
  detour: Detour | null;
}

export interface WardHelp {
  ward: number;
  /** median minutes from the nearest fire station / hospital over the ward's junctions; null = not reached */
  fire: { normal: number | null; rehearsal: number | null };
  hospital: { normal: number | null; rehearsal: number | null };
  loses: ("fire" | "hospital")[];
}

export interface ReachResult {
  tHelpMin: number;
  facilities: FacilityReach[];
  wards: WardHelp[];
  /** facilities too far from any road to route */
  unrouted: string[];
  /** seconds from the nearest hospital / fire station on rehearsal roads, per junction (for dry schools, wards) */
  hospRain: Float64Array;
  fireRain: Float64Array;
}

/** the ward of each junction: the ward of its first road piece inside the district (0 = outside) */
export function nodeWards(g: RoadGraph): Uint16Array {
  const w = new Uint16Array(g.n);
  for (let u = 0; u < g.n; u++) for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) { const x = g.ward[g.adjEdge[k]]; if (x) { w[u] = x; break; } }
  return w;
}

function reachedKm(g: RoadGraph, sec: Float64Array, t: number): number {
  let m = 0;
  for (let e = 0; e < g.m; e++) if (sec[g.from[e]] <= t && sec[g.to[e]] <= t) m += g.len[e];
  return m / 1000;
}
function reachedWards(g: RoadGraph, sec: Float64Array, t: number, nw: Uint16Array): number {
  const s = new Set<number>();
  for (let u = 0; u < g.n; u++) if (sec[u] <= t && nw[u]) s.add(nw[u]);
  return s.size;
}
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** the junction a facility is reached from: the nearest one with an open road (in the normal state any road) */
export function snapFacility(g: RoadGraph, ix: GraphIndex, f: Pick<Facility, "lat" | "lon">): number {
  return nearestNode(g, ix, f.lat, f.lon, SNAP_M);
}

export function computeReach(g: RoadGraph, ix: GraphIndex, facilities: Facility[], factor: Float32Array, tHelpMin = T_HELP_MIN): ReachResult {
  const T = tHelpMin * 60;
  const normal: RoadState = {}, rain: RoadState = { factor };
  const nw = nodeWards(g);
  const out: FacilityReach[] = [];
  const unrouted: string[] = [];
  const nodes = new Map<string, number>();
  for (const f of facilities) {
    const u = snapFacility(g, ix, f);
    if (u < 0) { unrouted.push(f.id); continue; }
    nodes.set(f.id, u);
    const a = dijkstra(g, [u], normal, T * 1.5), b = dijkstra(g, [u], rain, T * 1.5);
    const nKm = reachedKm(g, a.sec, T), rKm = reachedKm(g, b.sec, T);
    // its own road: every piece at its junction is closed
    let ownClosed = true;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) if (factor[g.adjEdge[k]] > 0) { ownClosed = false; break; }
    const share = nKm > 0 ? rKm / nKm : 1;
    const cutOff = ownClosed || share < CUT_SHARE;
    let detour: Detour | null = null;
    if (cutOff || share < 0.85) {
      // the way out to the nearest main road, normal vs rehearsal
      let best = -1;
      for (let v = 0; v < g.n; v++) if (a.sec[v] <= T && isMainNode(g, v) && (best < 0 || a.sec[v] < a.sec[best])) best = v;
      if (best >= 0) {
        const rn = route(g, u, best, normal);
        // in the rain: the nearest main-road junction still reachable
        let bestR = -1;
        for (let v = 0; v < g.n; v++) if (Number.isFinite(b.sec[v]) && isMainNode(g, v) && (bestR < 0 || b.sec[v] < b.sec[bestR])) bestR = v;
        const rr = bestR >= 0 ? route(g, u, bestR, rain) : null;
        const toName = (v: number) => { for (let k = g.adjStart[v]; k < g.adjStart[v + 1]; k++) { const e = g.adjEdge[k]; if (g.cls[e] <= 3 && g.name[e] >= 0) return g.names[g.name[e]]; } return null; };
        detour = {
          to: toName(bestR >= 0 ? bestR : best),
          normal: rn ? { sec: Math.round(rn.sec), names: routeNames(g, rn.edges), edges: rn.edges } : null,
          rehearsal: rr ? { sec: Math.round(rr.sec), names: routeNames(g, rr.edges), edges: rr.edges } : null
        };
      }
    }
    out.push({
      id: f.id, node: u, normalKm: Math.round(nKm * 10) / 10, rehearsalKm: Math.round(rKm * 10) / 10,
      normalWards: reachedWards(g, a.sec, T, nw), rehearsalWards: reachedWards(g, b.sec, T, nw), cutOff,
      why: ownClosed ? "own-road" : cutOff ? "reach" : null, detour
    });
  }
  // ---- quick help by ward: time from the nearest facility of each kind
  const byKind = (kind: Facility["kind"]) => facilities.filter((f) => f.kind === kind && nodes.has(f.id)).map((f) => nodes.get(f.id)!);
  const fireN = dijkstra(g, byKind("fire"), normal), fireR = dijkstra(g, byKind("fire"), rain);
  const hospN = dijkstra(g, byKind("hospital"), normal), hospR = dijkstra(g, byKind("hospital"), rain);
  const per = new Map<number, number[]>();
  for (let u = 0; u < g.n; u++) if (nw[u]) (per.get(nw[u]) ?? per.set(nw[u], []).get(nw[u])!).push(u);
  const mins = (r: Float64Array, us: number[]) => {
    const reached = us.map((u) => r[u]).filter(Number.isFinite);
    // a ward counts as reached when most of its junctions are
    if (reached.length < us.length / 2) return null;
    return Math.round((median(us.map((u) => r[u]))! / 60) * 10) / 10;
  };
  const wards: WardHelp[] = [];
  for (const [ward, us] of [...per.entries()].sort((a, b) => a[0] - b[0])) {
    const fire = { normal: mins(fireN.sec, us), rehearsal: mins(fireR.sec, us) };
    const hospital = { normal: mins(hospN.sec, us), rehearsal: mins(hospR.sec, us) };
    const lose = (x: { normal: number | null; rehearsal: number | null }) => x.normal != null && x.normal <= tHelpMin && (x.rehearsal == null || x.rehearsal > tHelpMin);
    wards.push({ ward, fire, hospital, loses: [...(lose(fire) ? ["fire" as const] : []), ...(lose(hospital) ? ["hospital" as const] : [])] });
  }
  return { tHelpMin, facilities: out, wards, unrouted, hospRain: hospR.sec, fireRain: fireR.sec };
}

/** the road pieces a facility reaches within T in both states, for the map (normal-only pieces are "lost") */
export function facilityReachEdges(g: RoadGraph, node: number, factor: Float32Array, tHelpMin = T_HELP_MIN): { kept: number[]; lost: number[] } {
  const T = tHelpMin * 60;
  const a = dijkstra(g, [node], {}, T), b = dijkstra(g, [node], { factor }, T);
  const kept: number[] = [], lost: number[] = [];
  for (let e = 0; e < g.m; e++) {
    if (!(a.sec[g.from[e]] <= T && a.sec[g.to[e]] <= T)) continue;
    if (b.sec[g.from[e]] <= T && b.sec[g.to[e]] <= T && factor[e] > 0) kept.push(e); else lost.push(e);
  }
  return { kept, lost };
}

/** joins OSM government hospitals with the store's hospitals (beds, ambulance) when they are within 300 m */
export function mergeHospitals(osm: Facility[], store: Facility[]): Facility[] {
  const out = [...osm];
  for (const s of store) {
    const i = out.findIndex((o) => flatDistM(o.lat, o.lon, s.lat, s.lon) <= 300);
    if (i >= 0) out[i] = { ...out[i], name: s.name, beds: s.beds, ambulance: s.ambulance, source: "store", id: s.id };
    else out.push(s);
  }
  return out;
}
