/**
 * Shortest drive times on the road network (graph.ts): Dijkstra from one or many starting junctions, and A* for one
 * route. A road state says how each piece behaves in the rain: factor 1 = normal speed, 0.3 = slow (water on the road),
 * 0 = closed. Speeds are typical for an emergency vehicle in Chennai without traffic (glossary: our assumption); one-way
 * rules are ignored for emergency vehicles unless asked. Pure, no allocation per step beyond the heap.
 */
import { MAIN_CLASS_MAX, otherEnd, type RoadGraph } from "./graph";

/** km/h by road class (motorway … living_street) */
export const SPEED_KMH = [40, 40, 35, 30, 25, 18, 18, 10];
const MAX_MPS = 40 / 3.6;

export interface RoadState {
  /** per piece: 1 normal, (0, 1) slower, 0 closed; omitted = all normal */
  factor?: Float32Array;
  /** keep one-way rules (default false: emergency vehicles may use both directions) */
  oneway?: boolean;
}

/** seconds to drive piece e in a road state; Infinity when closed */
export function edgeSec(g: RoadGraph, e: number, s?: RoadState): number {
  const f = s?.factor ? s.factor[e] : 1;
  if (!(f > 0)) return Infinity;
  return g.len[e] / ((SPEED_KMH[g.cls[e]] ?? 18) / 3.6) / f;
}
/** may piece e be driven starting from node u */
const allowed = (g: RoadGraph, e: number, u: number, s?: RoadState) =>
  !s?.oneway || g.oneway[e] === 0 || (g.oneway[e] === 1 ? g.from[e] === u : g.to[e] === u);

/** min-heap of (key, value) pairs; stale entries are skipped by the caller */
class Heap {
  k: Float64Array = new Float64Array(1024);
  v: Int32Array = new Int32Array(1024);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const k = new Float64Array(this.size * 2), v = new Int32Array(this.size * 2);
      k.set(this.k); v.set(this.v); this.k = k; this.v = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  /** removes the smallest; returns its value (its key is in `top`) */
  top = 0;
  pop(): number {
    const val = this.v[0];
    this.top = this.k[0];
    const lk = this.k[--this.size], lv = this.v[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lk) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = lk; this.v[i] = lv;
    return val;
  }
}

export interface Reach {
  /** seconds from the nearest source; Infinity = not reached */
  sec: Float64Array;
  /** the piece used to arrive at each node (-1 = a source or not reached) */
  via: Int32Array;
  /** the source each node was reached from (index into the sources list), -1 = not reached */
  src: Int32Array;
}

/**
 * Drive times from every source at once (multi-source Dijkstra): each node gets the time from its nearest source.
 * Stops at maxSec (nodes beyond stay Infinity).
 */
export function dijkstra(g: RoadGraph, sources: number[], s?: RoadState, maxSec = Infinity): Reach {
  const sec = new Float64Array(g.n).fill(Infinity), via = new Int32Array(g.n).fill(-1), src = new Int32Array(g.n).fill(-1);
  const h = new Heap();
  sources.forEach((u, i) => { if (u >= 0 && u < g.n && sec[u] > 0) { sec[u] = 0; src[u] = i; h.push(0, u); } });
  while (h.size) {
    const u = h.pop(), d = h.top;
    if (d > sec[u]) continue;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
      const e = g.adjEdge[k];
      if (!allowed(g, e, u, s)) continue;
      const t = d + edgeSec(g, e, s);
      if (t > maxSec) continue;
      const v = otherEnd(g, e, u);
      if (t < sec[v]) { sec[v] = t; via[v] = e; src[v] = src[u]; h.push(t, v); }
    }
  }
  return { sec, via, src };
}

/** the pieces and nodes from the reached node back to its source */
export function backtrack(g: RoadGraph, r: Reach, target: number): { edges: number[]; nodes: number[] } {
  const edges: number[] = [], nodes = [target];
  let u = target, guard = g.n;
  while (r.via[u] >= 0 && guard-- > 0) { const e = r.via[u]; edges.push(e); u = otherEnd(g, e, u); nodes.push(u); }
  return { edges: edges.reverse(), nodes: nodes.reverse() };
}

export interface Route { sec: number; m: number; edges: number[]; nodes: number[] }

/** The fastest route from a to b (A* with a straight-line bound); null when b cannot be reached. */
export function route(g: RoadGraph, a: number, b: number, s?: RoadState): Route | null {
  if (a < 0 || b < 0) return null;
  if (a === b) return { sec: 0, m: 0, edges: [], nodes: [a] };
  const sec = new Float64Array(g.n).fill(Infinity), via = new Int32Array(g.n).fill(-1);
  const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;
  const hEst = (u: number) => Math.hypot((g.lon[u] - g.lon[b]) * KX, (g.lat[u] - g.lat[b]) * KY) / MAX_MPS;
  const h = new Heap();
  sec[a] = 0;
  h.push(hEst(a), a);
  while (h.size) {
    const u = h.pop();
    if (u === b) break;
    const d = sec[u];
    if (h.top - hEst(u) > d + 1e-6) continue;
    for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) {
      const e = g.adjEdge[k];
      if (!allowed(g, e, u, s)) continue;
      const t = d + edgeSec(g, e, s);
      const v = otherEnd(g, e, u);
      if (t < sec[v]) { sec[v] = t; via[v] = e; h.push(t + hEst(v), v); }
    }
  }
  if (!Number.isFinite(sec[b])) return null;
  const p = backtrack(g, { sec, via, src: new Int32Array(0) }, b);
  return { sec: sec[b], m: p.edges.reduce((x, e) => x + g.len[e], 0), edges: p.edges, nodes: p.nodes };
}

/** the street names a route uses, in order, each once ("Jones Road → Anna Salai") */
export function routeNames(g: RoadGraph, edges: number[], max = 4): string[] {
  const out: string[] = [];
  let run = -2, runLen = 0;
  const flush = () => { if (run >= 0 && runLen >= 80 && !out.includes(g.names[run])) out.push(g.names[run]); };
  for (const e of edges) {
    if (g.name[e] !== run) { flush(); run = g.name[e]; runLen = 0; }
    runLen += g.len[e];
  }
  flush();
  return out.slice(0, max);
}

/** a node on a main road (trunk / primary / secondary) */
export function isMainNode(g: RoadGraph, u: number): boolean {
  for (let k = g.adjStart[u]; k < g.adjStart[u + 1]; k++) if (g.cls[g.adjEdge[k]] <= MAIN_CLASS_MAX) return true;
  return false;
}
