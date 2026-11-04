/**
 * Builds the metro and suburban rail layer for Rain → Metro from ChennaiGTFS (github.com/ungalsoththu/ChennaiGTFS,
 * ODbL; CMRL and Southern Railway suburban feeds mirrored from CUMTA's transit data portal). Run on request:
 *
 *   node scripts/build-transit-layer.mjs            (downloads the two small zips, ~300 KB)
 *   node scripts/build-transit-layer.mjs <cmrl.zip> <srr.zip>
 *
 * Writes data/layers/transit.json: stations (name, kind, lines, entrances, trains an hour on a weekday morning) and
 * lines (CMRL's own track shapes; suburban lines joined station to station, as the feed has no shapes).
 * The CMRL calendar ended in 2021: the layer is the network and its frequency, not a live timetable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "layers", "transit.json");
const BASE = "https://raw.githubusercontent.com/ungalsoththu/ChennaiGTFS/main/data";
// the district and its edges (the suburban lines run to Tambaram, Avadi, Ennore)
const BOX = { s: 12.82, n: 13.27, w: 80.05, e: 80.36 };
const inBox = (lat, lon) => lat >= BOX.s && lat <= BOX.n && lon >= BOX.w && lon <= BOX.e;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

async function zipOf(arg, name) {
  if (arg) return new Uint8Array(fs.readFileSync(arg));
  const r = await fetch(`${BASE}/${name}`, { headers: { "User-Agent": "DistrictIQ-transit-build/1.0" } });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** a GTFS file as rows of objects (quoted fields with commas handled) */
function csv(files, name) {
  const f = files[name];
  if (!f) return [];
  const text = strFromU8(f).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(head.map((h, i) => [h, v[i] ?? ""])); });
}

const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const MORNING = [8 * 60, 10 * 60];
const title = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bDr\.?m\.?g\.?/i, "Dr. M.G.").replace(/\bJn\.?$/i, "Junction").replace(/\s+/g, " ").trim();
const LINE_NAME = { "000092": "Blue Line", "00A700": "Green Line" };

function cmrl(files) {
  const stops = csv(files, "stops.txt"), routes = csv(files, "routes.txt"), trips = csv(files, "trips.txt"), times = csv(files, "stop_times.txt"), shapes = csv(files, "shapes.txt");
  const stationOf = new Map(), stations = new Map();
  for (const s of stops) {
    const id = s.parent_station || s.stop_id;
    stationOf.set(s.stop_id, id);
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const st = stations.get(id) ?? stations.set(id, { id: `cmrl:${id}`, name: title(s.stop_name), kind: "metro", entrances: [], lines: new Set(), trips: new Set() }).get(id);
    st.entrances.push([r5(lat), r5(lon)]);
  }
  const route = new Map(routes.map((r) => [r.route_id, r]));
  const trip = new Map(trips.map((t) => [t.trip_id, t]));
  for (const t of times) {
    const tr = trip.get(t.trip_id);
    const st = stations.get(stationOf.get(t.stop_id));
    if (!tr || !st) continue;
    const color = route.get(tr.route_id)?.route_color ?? "";
    // through services (Central to the Airport over both lines) carry no colour of their own: not a line
    if (LINE_NAME[color]) st.lines.add(LINE_NAME[color]);
    const m = mins(t.departure_time || t.arrival_time);
    if (tr.service_id === "WD" && m >= MORNING[0] && m < MORNING[1]) st.trips.add(t.trip_id);
  }
  // one track shape per line: its longest
  const byShape = new Map();
  for (const p of shapes) (byShape.get(p.shape_id) ?? byShape.set(p.shape_id, []).get(p.shape_id)).push(p);
  const best = new Map();
  for (const t of trips) {
    const pts = byShape.get(t.shape_id);
    const color = route.get(t.route_id)?.route_color ?? "";
    if (!pts || !LINE_NAME[color]) continue;
    if (!best.has(color) || best.get(color).length < pts.length) best.set(color, pts);
  }
  const lines = [...best.entries()].map(([color, pts]) => ({
    id: `cmrl:${color}`, name: LINE_NAME[color] ?? "Metro", kind: "metro", color: `#${color}`,
    path: pts.sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence)).map((p) => [r5(Number(p.shape_pt_lat)), r5(Number(p.shape_pt_lon))])
  }));
  return { stations: [...stations.values()], lines };
}

function suburban(files) {
  const stops = csv(files, "stops.txt"), routes = csv(files, "routes.txt"), trips = csv(files, "trips.txt"), times = csv(files, "stop_times.txt");
  const stations = new Map(), stationOf = new Map();
  for (const s of stops) {
    const id = s.parent_station || s.stop_id;
    stationOf.set(s.stop_id, id);
    if (s.parent_station) continue;
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stations.set(id, { id: `srr:${id}`, code: id, name: title(s.stop_name), kind: "suburban", entrances: [[r5(lat), r5(lon)]], lines: new Set(), trips: new Set() });
  }
  const route = new Map(routes.map((r) => [r.route_id, r]));
  const trip = new Map(trips.map((t) => [t.trip_id, t]));
  const seqs = new Map();
  for (const t of times) {
    const tr = trip.get(t.trip_id);
    const id = stationOf.get(t.stop_id) ?? t.stop_id;
    const st = stations.get(id);
    if (!tr || !st) continue;
    const m = mins(t.departure_time || t.arrival_time);
    if (/^service_11111/.test(tr.service_id) && m >= MORNING[0] && m < MORNING[1]) st.trips.add(t.trip_id);
    (seqs.get(t.trip_id) ?? seqs.set(t.trip_id, []).get(t.trip_id)).push([Number(t.stop_sequence), id]);
  }
  // the corridors: each route's longest station sequence, the same sequence once, the longest first
  const corridors = new Map();
  for (const [tid, s] of seqs) {
    const tr = trip.get(tid);
    const order = s.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const name = route.get(tr.route_id)?.route_long_name ?? tr.route_id;
    const key = [order[0], order[order.length - 1]].sort().join("|");
    if (!corridors.has(key) || corridors.get(key).order.length < order.length) corridors.set(key, { name, order });
  }
  for (const c of corridors.values()) for (const id of c.order) stations.get(id)?.lines.add("Suburban");
  const lines = [...corridors.values()].sort((a, b) => b.order.length - a.order.length).slice(0, 8).map((c, k) => ({
    id: `srr:${k}`, name: `Suburban ${c.name.replace(/-/g, "–")}`, kind: "suburban", color: "#7C3AED",
    path: c.order.map((id) => stations.get(id)?.entrances[0]).filter(Boolean)
  }));
  return { stations: [...stations.values()], lines };
}

async function main() {
  const [a, b] = process.argv.slice(2);
  const m = cmrl(unzipSync(await zipOf(a, "cmrl-gtfs.zip")));
  const s = suburban(unzipSync(await zipOf(b, "srr-gtfs.zip")));
  const near = (st) => st.entrances.some(([lat, lon]) => inBox(lat, lon));
  const stations = [...m.stations, ...s.stations].filter(near).map((st) => {
    const lat = st.entrances.reduce((x, e) => x + e[0], 0) / st.entrances.length, lon = st.entrances.reduce((x, e) => x + e[1], 0) / st.entrances.length;
    return { id: st.id, name: st.name, kind: st.kind, lat: r5(lat), lon: r5(lon), lines: [...st.lines].sort(), trainsPerHour: Math.round(st.trips.size / 2), entrances: st.kind === "metro" ? st.entrances : undefined };
  }).sort((x, y) => x.id.localeCompare(y.id));
  const lines = [...m.lines, ...s.lines].map((l) => ({ ...l, path: l.path.filter(([lat, lon]) => inBox(lat, lon)) })).filter((l) => l.path.length > 1);
  const meta = {
    source: "ChennaiGTFS (github.com/ungalsoththu/ChennaiGTFS): CMRL and Southern Railway suburban feeds mirrored from CUMTA",
    licence: "ODbL / PDDL: attribute UngalSoththu / ChennaiGTFS; the source files remain the agencies'",
    built_at: new Date().toISOString(),
    note: "Trains an hour are counted between 8 and 10 a.m. on a weekday. CMRL's calendar ended in 2021: this is the network and its frequency, not a live timetable."
  };
  fs.writeFileSync(OUT, JSON.stringify({ meta, stations, lines }));
  console.log(`transit: ${stations.filter((x) => x.kind === "metro").length} metro and ${stations.filter((x) => x.kind === "suburban").length} suburban stations, ${lines.length} lines -> ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
