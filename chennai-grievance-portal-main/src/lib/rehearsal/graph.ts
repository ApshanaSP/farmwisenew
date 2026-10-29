/**
 * Rain Rehearsal's road network: junctions and the road pieces between them, from OpenStreetMap
 * (scripts/build-road-graph.mjs writes data/roads/graph.bin). Typed arrays, so 200,000 road pieces load in a few
 * milliseconds and the shortest-path code (paths.ts) runs over plain numbers. makeGraph() builds the same shape from
 * hand-made arrays for the unit tests; loadGraph() reads the file once per server process.
 * Positions are [lat, lon]; distances in metres.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface GraphParts {
  lat: Float32Array | number[];
  lon: Float32Array | number[];
  from: Uint32Array | number[];
  to: Uint32Array | number[];
  len: Float32Array | number[];
  cls: Uint8Array | number[];
  oneway?: Int8Array | number[];
  name?: Int32Array | number[];
  ward?: Uint16Array | number[];
  water?: Uint16Array | number[];
  /** shape points per edge: shape[2k], shape[2k+1] = lat, lon; shapeStart has m + 1 entries */
  shapeStart?: Uint32Array | number[];
  shape?: Float32Array | number[];
  names?: string[];
  namesTa?: (string | null)[];
  classes?: string[];
  meta?: Record<string, unknown>;
}

export interface RoadGraph {
  n: number;
  m: number;
  lat: Float32Array;
  lon: Float32Array;
  from: Uint32Array;
  to: Uint32Array;
  len: Float32Array;
  cls: Uint8Array;
  /** 1 = only from -> to, -1 = only to -> from, 0 = both */
  oneway: Int8Array;
  /** index into names, -1 = no name */
  name: Int32Array;
  /** ward of the piece's midpoint, 0 = outside the district */
  ward: Uint16Array;
  /** metres from the midpoint to the nearest canal, river or lake (capped at 1,000) */
  water: Uint16Array;
  shapeStart: Uint32Array;
  shape: Float32Array;
  names: string[];
  namesTa: (string | null)[];
  classes: string[];
  meta: Record<string, unknown>;
  /** ground height of each piece (m) and how much lower (-) or higher than the roads within 500 m; empty when not built */
  elev: Float32Array;
  relElev: Float32Array;
  /** CSR adjacency: the pieces touching node u are adjEdge[adjStart[u] .. adjStart[u + 1]) */
  adjStart: Uint32Array;
  adjEdge: Uint32Array;
  /** identifies this network (cache keys) */
  hash: string;
}

export const CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"];
/** classes counted as main roads (diversions, "nearest main road") */
export const MAIN_CLASS_MAX = 3;

export function makeGraph(p: GraphParts): RoadGraph {
  const n = p.lat.length, m = p.from.length;
  const from = Uint32Array.from(p.from), to = Uint32Array.from(p.to);
  const deg = new Uint32Array(n + 1);
  for (let e = 0; e < m; e++) { deg[from[e] + 1]++; deg[to[e] + 1]++; }
  for (let u = 0; u < n; u++) deg[u + 1] += deg[u];
  const adjStart = deg.slice();
  const fill = adjStart.slice(0, n);
  const adjEdge = new Uint32Array(2 * m);
  for (let e = 0; e < m; e++) { adjEdge[fill[from[e]]++] = e; adjEdge[fill[to[e]]++] = e; }
  const lat = Float32Array.from(p.lat), lon = Float32Array.from(p.lon);
  let shapeStart: Uint32Array, shape: Float32Array;
  if (p.shapeStart && p.shape) { shapeStart = Uint32Array.from(p.shapeStart); shape = Float32Array.from(p.shape); }
  else {
    // straight pieces: the two ends
    shapeStart = new Uint32Array(m + 1);
    shape = new Float32Array(4 * m);
    for (let e = 0; e < m; e++) { shapeStart[e] = 2 * e; shape.set([lat[from[e]], lon[from[e]], lat[to[e]], lon[to[e]]], 4 * e); }
    shapeStart[m] = 2 * m;
  }
  const g: RoadGraph = {
    n, m, lat, lon, from, to, len: Float32Array.from(p.len), cls: Uint8Array.from(p.cls),
    oneway: p.oneway ? Int8Array.from(p.oneway) : new Int8Array(m), name: p.name ? Int32Array.from(p.name) : new Int32Array(m).fill(-1),
    ward: p.ward ? Uint16Array.from(p.ward) : new Uint16Array(m), water: p.water ? Uint16Array.from(p.water) : new Uint16Array(m).fill(1000),
    shapeStart, shape, names: p.names ?? [], namesTa: p.namesTa ?? [], classes: p.classes ?? CLASSES, meta: p.meta ?? {}, adjStart, adjEdge, hash: "",
    elev: new Float32Array(0), relElev: new Float32Array(0)
  };
  g.hash = crypto.createHash("sha1").update(Buffer.from(g.from.buffer)).update(Buffer.from(g.len.buffer)).digest("hex").slice(0, 12);
  return g;
}

const FILE = () => process.env.ROAD_GRAPH_FILE || path.join(process.cwd(), "data", "roads", "graph.bin");

declare global {
  // eslint-disable-next-line no-var
  var __roadGraph: { mtime: number; g: RoadGraph } | null | undefined;
}

/** The district's road network, read once per process (and again if the file is rebuilt); null if it was never built. */
export function loadGraph(): RoadGraph | null {
  let mtime = 0;
  try { mtime = fs.statSync(FILE()).mtimeMs; } catch { return null; }
  // a rebuilt elevation file counts too
  try { mtime += fs.statSync(path.join(path.dirname(FILE()), "elevation.bin")).mtimeMs / 1e6; } catch { /* not built */ }
  if (global.__roadGraph && global.__roadGraph.mtime === mtime) return global.__roadGraph.g;
  const buf = fs.readFileSync(FILE());
  if (buf.toString("latin1", 0, 8) !== "DIQROAD1") throw new Error("data/roads/graph.bin is not a road graph file");
  const hlen = buf.readUInt32LE(8);
  const header = JSON.parse(buf.toString("utf8", 12, 12 + hlen));
  const base = Math.ceil((12 + hlen) / 8) * 8;
  // copy into an aligned buffer so every typed array can view it directly
  const ab = new ArrayBuffer(buf.length - base);
  new Uint8Array(ab).set(buf.subarray(base));
  const CTOR: Record<string, any> = { f32: Float32Array, u32: Uint32Array, i32: Int32Array, u16: Uint16Array, u8: Uint8Array, i8: Int8Array };
  const a: Record<string, any> = {};
  for (const x of header.arrays) a[x.name] = new CTOR[x.type](ab, x.offset, x.length);
  const g = makeGraph({ ...a, names: header.names, namesTa: header.names_ta, classes: header.classes, meta: header.meta } as GraphParts);
  // ground height (scripts/build-elevation.mjs), when built for this same graph
  try {
    const eb = fs.readFileSync(path.join(path.dirname(FILE()), "elevation.bin"));
    if (eb.toString("latin1", 0, 8) === "DIQELEV1") {
      const eh = JSON.parse(eb.toString("utf8", 12, 12 + eb.readUInt32LE(8)));
      const eBase = Math.ceil((12 + eb.readUInt32LE(8)) / 8) * 8;
      if (eh.edges === g.m) {
        const ea = new ArrayBuffer(8 * g.m);
        new Uint8Array(ea).set(eb.subarray(eBase, eBase + 8 * g.m));
        g.elev = new Float32Array(ea, 0, g.m);
        g.relElev = new Float32Array(ea, 4 * g.m, g.m);
        g.meta = { ...g.meta, elevation: { source: eh.source, attribution: eh.attribution, built_at: eh.built_at } };
      }
    }
  } catch { /* no elevation file */ }
  global.__roadGraph = { mtime, g };
  return g;
}

/** the other end of piece e from node u */
export const otherEnd = (g: RoadGraph, e: number, u: number) => (g.from[e] === u ? g.to[e] : g.from[e]);

/** a piece's shape as [lat, lon] pairs, rounded to ~1 m */
export function edgeShape(g: RoadGraph, e: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = g.shapeStart[e]; k < g.shapeStart[e + 1]; k++) out.push([Math.round(g.shape[2 * k] * 1e5) / 1e5, Math.round(g.shape[2 * k + 1] * 1e5) / 1e5]);
  return out;
}

export const edgeName = (g: RoadGraph, e: number): string | null => (g.name[e] >= 0 ? g.names[g.name[e]] : null);
export const edgeNameTa = (g: RoadGraph, e: number): string | null => (g.name[e] >= 0 ? g.namesTa[g.name[e]] ?? null : null);

// ------------------------------------------------------------ spatial index --

const RAD = Math.PI / 180;
const KX = 111320 * Math.cos(13.05 * RAD), KY = 110574;

/** metres from p to the segment a-b (flat local projection: fine within a city) */
export function segDistM(pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  const px = pLon * KX, py = pLat * KY, ax = aLon * KX, ay = aLat * KY, bx = bLon * KX, by = bLat * KY;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export const flatDistM = (aLat: number, aLon: number, bLat: number, bLon: number) => Math.hypot((aLon - bLon) * KX, (aLat - bLat) * KY);

/** Grid of road pieces and junctions, for "which pieces lie within 80 m of this complaint" and "nearest junction". */
export interface GraphIndex {
  cell: number;
  edges: Map<number, number[]>;
  nodes: Map<number, number[]>;
}
const key = (y: number, x: number) => y * 100000 + x;

export function indexGraph(g: RoadGraph, cell = 120): GraphIndex {
  const edges = new Map<number, number[]>(), nodes = new Map<number, number[]>();
  for (let e = 0; e < g.m; e++) {
    const seen = new Set<number>();
    for (let k = g.shapeStart[e]; k < g.shapeStart[e + 1] - 1; k++) {
      const aLat = g.shape[2 * k], aLon = g.shape[2 * k + 1], bLat = g.shape[2 * k + 2], bLon = g.shape[2 * k + 3];
      const y0 = Math.floor((Math.min(aLat, bLat) * KY) / cell), y1 = Math.floor((Math.max(aLat, bLat) * KY) / cell);
      const x0 = Math.floor((Math.min(aLon, bLon) * KX) / cell), x1 = Math.floor((Math.max(aLon, bLon) * KX) / cell);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const k2 = key(y, x);
        if (seen.has(k2)) continue;
        seen.add(k2);
        (edges.get(k2) ?? edges.set(k2, []).get(k2)!).push(e);
      }
    }
  }
  for (let u = 0; u < g.n; u++) {
    const k2 = key(Math.floor((g.lat[u] * KY) / cell), Math.floor((g.lon[u] * KX) / cell));
    (nodes.get(k2) ?? nodes.set(k2, []).get(k2)!).push(u);
  }
  return { cell, edges, nodes };
}

/** metres from a point to piece e */
export function edgeDistM(g: RoadGraph, e: number, lat: number, lon: number): number {
  let best = Infinity;
  for (let k = g.shapeStart[e]; k < g.shapeStart[e + 1] - 1; k++)
    best = Math.min(best, segDistM(lat, lon, g.shape[2 * k], g.shape[2 * k + 1], g.shape[2 * k + 2], g.shape[2 * k + 3]));
  return best;
}

/** road pieces within r metres of a point, nearest first */
export function edgesNear(g: RoadGraph, ix: GraphIndex, lat: number, lon: number, r: number): { e: number; d: number }[] {
  const cy = Math.floor((lat * KY) / ix.cell), cx = Math.floor((lon * KX) / ix.cell), R = Math.ceil(r / ix.cell);
  const out: { e: number; d: number }[] = [];
  const seen = new Set<number>();
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) for (const e of ix.edges.get(key(y, x)) ?? []) {
    if (seen.has(e)) continue;
    seen.add(e);
    const d = edgeDistM(g, e, lat, lon);
    if (d <= r) out.push({ e, d });
  }
  return out.sort((a, b) => a.d - b.d || a.e - b.e);
}

/** the nearest junction within maxM metres (optionally only those `ok` accepts), or -1 */
export function nearestNode(g: RoadGraph, ix: GraphIndex, lat: number, lon: number, maxM: number, ok?: (u: number) => boolean): number {
  const cy = Math.floor((lat * KY) / ix.cell), cx = Math.floor((lon * KX) / ix.cell), R = Math.ceil(maxM / ix.cell);
  let best = -1, bd = maxM;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) for (const u of ix.nodes.get(key(y, x)) ?? []) {
    if (ok && !ok(u)) continue;
    const d = flatDistM(lat, lon, g.lat[u], g.lon[u]);
    if (d < bd || (d === bd && u < best)) { bd = d; best = u; }
  }
  return best;
}
