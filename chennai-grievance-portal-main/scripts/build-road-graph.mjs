/**
 * Builds Rain Rehearsal's routable road network from OpenStreetMap, once. The drawing layer data/layers/roads.geojson
 * joins roads by name and has no shared junctions, so it cannot be routed; this keeps every drivable way with its node
 * ids, so two roads that meet share a junction. One polite run against the public Overpass API: the district box plus
 * 3 km in 3 x 3 tiles, with a pause between them; downloaded tiles are kept in a cache folder, so a re-run is offline.
 *
 *   data/roads/graph.bin        junctions, road pieces between junctions (length, class, one-way, name, ward, distance
 *                               to water), simplified shapes; typed arrays behind a small JSON header (lib/rehearsal/graph.ts)
 *   data/roads/graph-meta.json  counts, OSM base time, query, licence (ODbL)
 *
 * Drivable = motorway to living_street and their links, not private, no service roads (parking aisles and driveways
 * would double the file; a hospital inside a campus is reached from the nearest road junction). Only the largest
 * connected network is kept: pieces cut off by the box edge are dropped and counted.
 * Re-run only on request. Run from the portal folder: node scripts/build-road-graph.mjs [--offline]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "roads");
const CACHE = process.env.ROAD_GRAPH_CACHE || path.join(os.tmpdir(), "diq-road-graph");
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const UA = "DistrictIQ-road-graph/1.0 (Team Initiators, hackathon prototype)";
const MARGIN_M = 3000;
const PAUSE_MS = 8000;
const TILES = 3;
const OFFLINE = process.argv.includes("--offline");
const SIMPLIFY_M = 2;
const WATER_FAR_M = 1000;

/** road classes in order of importance; a link road takes its parent's class */
const CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"];
const HW_RE = "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$";

// ------------------------------------------------------------------ wards --

const wards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "boundaries", "gcc-wards.geojson"), "utf8")).features.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const xs = polys.flatMap((p) => p[0].map((c) => c[0])), ys = polys.flatMap((p) => p[0].map((c) => c[1]));
  return { ward: f.properties.ward_no, polys, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});
const box = wards.reduce((b, w) => [Math.min(b[0], w.b[0]), Math.min(b[1], w.b[1]), Math.max(b[2], w.b[2]), Math.max(b[3], w.b[3])], [180, 90, -180, -90]);
const dLat = MARGIN_M / 111320, dLon = MARGIN_M / (111320 * Math.cos((((box[1] + box[3]) / 2) * Math.PI) / 180));
const S = box[1] - dLat, W = box[0] - dLon, N = box[3] + dLat, E = box[2] + dLon;

function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function wardAt(lon, lat) {
  for (const w of wards) {
    if (lon < w.b[0] || lon > w.b[2] || lat < w.b[1] || lat > w.b[3]) continue;
    for (const p of w.polys) if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return w.ward;
  }
  return 0;
}

// --------------------------------------------------------------- overpass --

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function overpass(body) {
  const q = `[out:json][timeout:300];\n${body}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (r.ok) {
      const json = await r.json();
      // a timeout or out-of-memory on the server still answers 200, with a remark and no (or partial) elements
      if (/error|timed out|out of memory/i.test(String(json.remark ?? ""))) throw new Error(`Overpass: ${json.remark}`);
      return { q, json };
    }
    // 429/502/504: the public server is busy; back off (30 s, 1, 2, 4, 8 min) and try again, six times in all
    if (attempt >= 6 || ![429, 502, 503, 504].includes(r.status)) throw new Error(`Overpass HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    console.log(`  busy (HTTP ${r.status}), trying again in ${30 * 2 ** (attempt - 1)} s`);
    await sleep(30000 * 2 ** (attempt - 1));
  }
}
const tileQuery = (s, w, n, e) =>
  `way["highway"~"${HW_RE}"]["access"!~"^(private|no)$"]["motor_vehicle"!~"^(private|no)$"]["area"!="yes"](${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})->.w;\n.w out body qt;\nnode(w.w);\nout skel qt;`;

// ---------------------------------------------------------------- helpers --

const RAD = Math.PI / 180;
function hav(aLat, aLon, bLat, bLon) {
  const dp = (bLat - aLat) * RAD, dl = (bLon - aLon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}
const KX = 111320 * Math.cos(13.05 * RAD), KY = 110574;
/** distance in metres from p to segment a-b, all [lat, lon], on a flat local projection (fine at city scale) */
function segDist(p, a, b) {
  const px = p[1] * KX, py = p[0] * KY, ax = a[1] * KX, ay = a[0] * KY, bx = b[1] * KX, by = b[0] * KY;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Douglas-Peucker on [lat, lon] points, keeping both ends */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, bi = -1;
    for (let k = i + 1; k < j; k++) { const d = segDist(pts[k], pts[i], pts[j]); if (d > best) { best = d; bi = k; } }
    if (best > tol) { keep[bi] = 1; stack.push([i, bi], [bi, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
/** the point half-way along a line */
function midpoint(pts, len) {
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = hav(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    if (acc + d >= len / 2) { const t = d ? (len / 2 - acc) / d : 0; return [pts[k - 1][0] + t * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1])]; }
    acc += d;
  }
  return pts[pts.length - 1];
}

// ------------------------------------------------------------------ fetch --

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const ways = new Map();
const nodes = new Map();
let osmBase = null;
const queries = [];
const t0 = Date.now();
let downloaded = 0;
for (let i = 0; i < TILES; i++) {
  for (let j = 0; j < TILES; j++) {
    const s = S + ((N - S) * i) / TILES, n = S + ((N - S) * (i + 1)) / TILES, w = W + ((E - W) * j) / TILES, e = W + ((E - W) * (j + 1)) / TILES;
    const file = path.join(CACHE, `tile-${i}-${j}.json`);
    const body = tileQuery(s, w, n, e);
    queries.push(body);
    let json;
    if (fs.existsSync(file)) json = JSON.parse(fs.readFileSync(file, "utf8"));
    else {
      if (OFFLINE) throw new Error(`--offline but tile ${i},${j} is not cached in ${CACHE}`);
      if (downloaded++) await sleep(PAUSE_MS);
      console.log(`tile ${i},${j}: downloading`);
      json = (await overpass(body)).json;
      fs.writeFileSync(file, JSON.stringify(json));
    }
    osmBase = json.osm3s?.timestamp_osm_base ?? osmBase;
    let nw = 0, nn = 0;
    for (const el of json.elements) {
      if (el.type === "way") { if (!ways.has(el.id)) { ways.set(el.id, el); nw++; } }
      else if (el.type === "node") { if (!nodes.has(el.id)) { nodes.set(el.id, [el.lat, el.lon]); nn++; } }
    }
    console.log(`tile ${i},${j}: ${nw} new ways, ${nn} new nodes`);
  }
}
console.log(`${ways.size} ways, ${nodes.size} nodes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// -------------------------------------------------------------- junctions --

const use = new Map();
for (const w of ways.values()) {
  w.nodes.forEach((id, k) => use.set(id, (use.get(id) ?? 0) + (k === 0 || k === w.nodes.length - 1 ? 2 : 1)));
}
const isJunction = (id) => (use.get(id) ?? 0) >= 2;

const names = [], namesTa = [], nameIdx = new Map();
const nameOf = (t) => {
  const n = (t.name ?? t["name:en"] ?? "").trim();
  if (!n) return -1;
  if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); namesTa.push(t["name:ta"] ?? null); }
  return nameIdx.get(n);
};
const classOf = (hw) => CLASSES.indexOf(hw.replace(/_link$/, ""));

const raw = [];
let missing = 0;
for (const w of ways.values()) {
  const t = w.tags ?? {};
  const cls = classOf(t.highway ?? "");
  if (cls < 0) continue;
  const ow = t.oneway === "yes" || t.oneway === "1" || t.oneway === "true" || t.junction === "roundabout" || t.highway === "motorway" ? 1 : t.oneway === "-1" || t.oneway === "reverse" ? -1 : 0;
  const nm = nameOf(t);
  let cur = [];
  let start = null;
  for (let k = 0; k < w.nodes.length; k++) {
    const id = w.nodes[k];
    const p = nodes.get(id);
    if (!p) { missing++; cur = []; start = null; continue; }
    if (start === null) { start = id; cur = [p]; continue; }
    cur.push(p);
    if (isJunction(id) || k === w.nodes.length - 1) {
      if (id !== start) raw.push({ a: start, b: id, pts: cur, cls, ow, nm });
      start = id;
      cur = [p];
    }
  }
}

// ---------------------------------------------- keep the largest network --

const parent = new Map();
const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); let y = x; while (parent.get(y) !== r) { const nx = parent.get(y); parent.set(y, r); y = nx; } return r; };
for (const r of raw) { if (!parent.has(r.a)) parent.set(r.a, r.a); if (!parent.has(r.b)) parent.set(r.b, r.b); const ra = find(r.a), rb = find(r.b); if (ra !== rb) parent.set(ra, rb); }
const size = new Map();
for (const x of parent.keys()) size.set(find(x), (size.get(find(x)) ?? 0) + 1);
const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0];
const kept = raw.filter((r) => find(r.a) === main);
console.log(`${raw.length} road pieces; kept ${kept.length} in the main network (${raw.length - kept.length} cut off by the box edge or private gaps dropped); ${missing} missing node refs`);

// ------------------------------------------------------------ water index --

const waterSegs = [];
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "layers", f), "utf8")).features; } catch { return []; } };
for (const f of read("waterways.geojson")) for (const l of f.geometry.coordinates) for (let k = 1; k < l.length; k++) waterSegs.push([[l[k - 1][1], l[k - 1][0]], [l[k][1], l[k][0]]]);
const waterPolys = [];
for (const f of read("water_bodies.geojson")) for (const poly of f.geometry.coordinates) {
  waterPolys.push(poly);
  for (const ring of poly) for (let k = 1; k < ring.length; k++) waterSegs.push([[ring[k - 1][1], ring[k - 1][0]], [ring[k][1], ring[k][0]]]);
}
const CELL = 250;
const cellKey = (lat, lon) => `${Math.floor((lat * KY) / CELL)}:${Math.floor((lon * KX) / CELL)}`;
const grid = new Map();
for (const sgm of waterSegs) {
  const [a, b] = sgm;
  const y0 = Math.floor((Math.min(a[0], b[0]) * KY) / CELL), y1 = Math.floor((Math.max(a[0], b[0]) * KY) / CELL);
  const x0 = Math.floor((Math.min(a[1], b[1]) * KX) / CELL), x1 = Math.floor((Math.max(a[1], b[1]) * KX) / CELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = `${y}:${x}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(sgm); }
}
function waterDist(p) {
  for (const poly of waterPolys) if (inRing(p[1], p[0], poly[0]) && !poly.slice(1).some((h) => inRing(p[1], p[0], h))) return 0;
  const cy = Math.floor((p[0] * KY) / CELL), cx = Math.floor((p[1] * KX) / CELL), R = Math.ceil(WATER_FAR_M / CELL);
  let best = WATER_FAR_M;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) for (const [a, b] of grid.get(`${y}:${x}`) ?? []) best = Math.min(best, segDist(p, a, b));
  return Math.round(best);
}

// ------------------------------------------------------------------ pack --

const idx = new Map();
const lat = [], lon = [];
const nodeIdx = (id) => { if (!idx.has(id)) { idx.set(id, lat.length); const p = nodes.get(id); lat.push(p[0]); lon.push(p[1]); } return idx.get(id); };
const M = kept.length;
const from = new Uint32Array(M), to = new Uint32Array(M), len = new Float32Array(M), cls = new Uint8Array(M), oneway = new Int8Array(M), name = new Int32Array(M),
  ward = new Uint16Array(M), water = new Uint16Array(M), shapeStart = new Uint32Array(M + 1);
const shape = [];
let inDistrict = 0;
kept.forEach((r, e) => {
  from[e] = nodeIdx(r.a); to[e] = nodeIdx(r.b);
  let L = 0;
  for (let k = 1; k < r.pts.length; k++) L += hav(r.pts[k - 1][0], r.pts[k - 1][1], r.pts[k][0], r.pts[k][1]);
  len[e] = L; cls[e] = r.cls; oneway[e] = r.ow; name[e] = r.nm;
  const mid = midpoint(r.pts, L);
  ward[e] = wardAt(mid[1], mid[0]);
  if (ward[e]) inDistrict++;
  water[e] = waterDist(mid);
  shapeStart[e] = shape.length / 2;
  for (const p of simplify(r.pts, SIMPLIFY_M)) shape.push(p[0], p[1]);
  if (e % 50000 === 0) console.log(`  packed ${e} / ${M}`);
});
shapeStart[M] = shape.length / 2;

const arrays = {
  lat: new Float32Array(lat), lon: new Float32Array(lon), from, to, len, cls, oneway, name, ward, water, shapeStart, shape: new Float32Array(shape)
};
const header = {
  magic: "DIQ-ROADS", version: 1, nodes: lat.length, edges: M, shape_points: shape.length / 2, classes: CLASSES, names, names_ta: namesTa, arrays: [],
  meta: { source: "OpenStreetMap", licence: "ODbL 1.0", attribution: "© OpenStreetMap contributors", osm_base: osmBase, built_at: new Date().toISOString(),
    bbox: { s: S, w: W, n: N, e: E }, tiles: TILES * TILES, ways: ways.size, in_district_edges: inDistrict, dropped_pieces: raw.length - kept.length, simplify_m: SIMPLIFY_M, query: queries[0] }
};
const TYPES = { Float32Array: "f32", Uint32Array: "u32", Int32Array: "i32", Uint16Array: "u16", Uint8Array: "u8", Int8Array: "i8" };
let off = 0;
for (const [k, a] of Object.entries(arrays)) { header.arrays.push({ name: k, type: TYPES[a.constructor.name], offset: off, length: a.length }); off += Math.ceil(a.byteLength / 8) * 8; }
const hjson = Buffer.from(JSON.stringify(header), "utf8");
const pre = 8 + 4 + hjson.length;
const base = Math.ceil(pre / 8) * 8;
const buf = Buffer.alloc(base + off);
buf.write("DIQROAD1", 0, "latin1");
buf.writeUInt32LE(hjson.length, 8);
hjson.copy(buf, 12);
for (const [k, a] of Object.entries(arrays)) {
  const h = header.arrays.find((x) => x.name === k);
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(buf, base + h.offset);
}
fs.writeFileSync(path.join(OUT, "graph.bin"), buf);
const meta = { ...header.meta, nodes: lat.length, edges: M, shape_points: shape.length / 2, names: names.length, bytes: buf.length,
  km: Math.round([...len].reduce((s, x) => s + x, 0) / 1000), by_class: Object.fromEntries(CLASSES.map((c, k) => [c, cls.reduce((s, x) => s + (x === k ? 1 : 0), 0)])) };
fs.writeFileSync(path.join(OUT, "graph-meta.json"), JSON.stringify(meta, null, 1));
console.log(`graph.bin: ${lat.length} junctions, ${M} road pieces (${inDistrict} in the district), ${meta.km} km, ${(buf.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
