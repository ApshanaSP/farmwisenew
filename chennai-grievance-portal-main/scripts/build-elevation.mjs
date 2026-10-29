/**
 * Ground height for Rain Rehearsal: how high each road piece of data/roads/graph.bin lies, and how much lower or higher
 * it is than the roads around it (500 m). From AWS Terrain Tiles (open data, no key; terrarium PNG: height =
 * R x 256 + G + B / 256 - 32768 m; SRTM 30 m underneath in India, so a few metres of error: only the RELATIVE height is
 * used, as one hint among others, and only if replaying past rains shows it helps). One run, tiles kept in a cache
 * folder; re-run after the road graph is rebuilt.
 *
 *   data/roads/elevation.bin   per road piece: height (m), height minus the median of the roads within 500 m (m)
 *
 * Attribution: "Terrain Tiles accessed from https://registry.opendata.aws/terrain-tiles" (Mapzen / AWS; SRTM, NASA).
 * Run from the portal folder: node scripts/build-elevation.mjs [--offline]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "fast-png";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH = path.join(ROOT, "data", "roads", "graph.bin");
const OUT = path.join(ROOT, "data", "roads", "elevation.bin");
const CACHE = process.env.ELEVATION_CACHE || path.join(os.tmpdir(), "diq-elevation");
const Z = 13;
const URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const NEAR_M = 500;
const OFFLINE = process.argv.includes("--offline");

// ---------------------------------------------------------------- graph --
const buf = fs.readFileSync(GRAPH);
if (buf.toString("latin1", 0, 8) !== "DIQROAD1") throw new Error("not a road graph file");
const hlen = buf.readUInt32LE(8);
const header = JSON.parse(buf.toString("utf8", 12, 12 + hlen));
const base = Math.ceil((12 + hlen) / 8) * 8;
const ab = new ArrayBuffer(buf.length - base);
new Uint8Array(ab).set(buf.subarray(base));
const CTOR = { f32: Float32Array, u32: Uint32Array, i32: Int32Array, u16: Uint16Array, u8: Uint8Array, i8: Int8Array };
const a = {};
for (const x of header.arrays) a[x.name] = new CTOR[x.type](ab, x.offset, x.length);
const M = header.edges;
// each piece's midpoint (middle shape point)
const mLat = new Float64Array(M), mLon = new Float64Array(M);
for (let e = 0; e < M; e++) { const k = Math.floor((a.shapeStart[e] + a.shapeStart[e + 1] - 1) / 2); mLat[e] = a.shape[2 * k]; mLon[e] = a.shape[2 * k + 1]; }
let s = 90, w = 180, n = -90, east = -180;
for (let e = 0; e < M; e++) { s = Math.min(s, mLat[e]); n = Math.max(n, mLat[e]); w = Math.min(w, mLon[e]); east = Math.max(east, mLon[e]); }

// ---------------------------------------------------------------- tiles --
const tx = (lon) => ((lon + 180) / 360) * 2 ** Z;
const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;
const x0 = Math.floor(tx(w)), x1 = Math.floor(tx(east)), y0 = Math.floor(ty(n)), y1 = Math.floor(ty(s));
fs.mkdirSync(CACHE, { recursive: true });
const tiles = new Map();
let fetched = 0;
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const f = path.join(CACHE, `${Z}-${x}-${y}.png`);
  if (!fs.existsSync(f)) {
    if (OFFLINE) throw new Error(`--offline but ${f} is missing`);
    const r = await fetch(URL(Z, x, y));
    if (!r.ok) throw new Error(`tile ${Z}/${x}/${y}: HTTP ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    fetched++;
  }
  const img = decode(fs.readFileSync(f));
  const ch = img.channels;
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) h[i] = img.data[i * ch] * 256 + img.data[i * ch + 1] + img.data[i * ch + 2] / 256 - 32768;
  tiles.set(`${x}:${y}`, h);
}
console.log(`${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles (zoom ${Z}), ${fetched} downloaded`);

/** height at a point: bilinear inside the tile */
function heightAt(lat, lon) {
  const fx = tx(lon), fy = ty(lat);
  const X = Math.floor(fx), Y = Math.floor(fy);
  const t = tiles.get(`${X}:${Y}`);
  if (!t) return NaN;
  const px = Math.min(254.999, (fx - X) * 256 - 0.5), py = Math.min(254.999, (fy - Y) * 256 - 0.5);
  const i = Math.max(0, Math.floor(px)), j = Math.max(0, Math.floor(py)), u = Math.max(0, px - i), v = Math.max(0, py - j);
  const at = (ii, jj) => t[jj * 256 + ii];
  return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v;
}

// ---------------------------------------------------- height per piece --
const elev = new Float32Array(M), rel = new Float32Array(M);
for (let e = 0; e < M; e++) elev[e] = heightAt(mLat[e], mLon[e]);
// relative height: the piece minus the median of the pieces within NEAR_M (grid of 250 m cells)
const KX = 111320 * Math.cos((13.05 * Math.PI) / 180), KY = 110574, CELL = 250, R = Math.ceil(NEAR_M / CELL);
const grid = new Map();
for (let e = 0; e < M; e++) { const k = `${Math.floor((mLat[e] * KY) / CELL)}:${Math.floor((mLon[e] * KX) / CELL)}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(e); }
for (let e = 0; e < M; e++) {
  const cy = Math.floor((mLat[e] * KY) / CELL), cx = Math.floor((mLon[e] * KX) / CELL);
  const hs = [];
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) for (const f of grid.get(`${y}:${x}`) ?? []) {
    if (Math.hypot((mLon[f] - mLon[e]) * KX, (mLat[f] - mLat[e]) * KY) <= NEAR_M && Number.isFinite(elev[f])) hs.push(elev[f]);
  }
  hs.sort((p, q) => p - q);
  rel[e] = hs.length ? elev[e] - hs[Math.floor(hs.length / 2)] : 0;
}
const hjson = Buffer.from(JSON.stringify({ magic: "DIQ-ELEV", version: 1, edges: M, graph_built_at: header.meta?.built_at ?? null, zoom: Z, near_m: NEAR_M,
  source: "AWS Terrain Tiles (terrarium; SRTM 30 m in India)", attribution: "Terrain Tiles accessed from https://registry.opendata.aws/terrain-tiles", built_at: new Date().toISOString() }));
const pre = Math.ceil((12 + hjson.length) / 8) * 8;
const out = Buffer.alloc(pre + 8 * M);
out.write("DIQELEV1", 0, "latin1");
out.writeUInt32LE(hjson.length, 8);
hjson.copy(out, 12);
Buffer.from(elev.buffer).copy(out, pre);
Buffer.from(rel.buffer).copy(out, pre + 4 * M);
fs.writeFileSync(OUT, out);
const fin = [...elev].filter(Number.isFinite).sort((p, q) => p - q);
const low = [...rel].filter((x) => x <= -2).length;
console.log(`elevation.bin: ${M} pieces; height ${fin[0].toFixed(1)}..${fin[fin.length - 1].toFixed(1)} m (median ${fin[Math.floor(fin.length / 2)].toFixed(1)}); ${low} pieces 2 m or more below their surroundings; ${(out.length / 1e6).toFixed(1)} MB`);
