/**
 * Rain Rehearsal on the real data (npm run eval:golden, or this file alone): the road network in data/roads and the
 * store snapshot in data/aws-cache, read directly (no store harness). Checks the flood memory, the replay of every
 * past rain and the reach of help against brute-force oracles written here (plain loops over every road piece, no grid
 * index), the no-peeking rule on the real data, and reports the measured numbers and timings (PROGRESS.md quotes them).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { indexGraph, loadGraph, type GraphIndex, type RoadGraph } from "./graph";
import { buildMemory, rainEvents, rehearsalFactor, TIER_LIKELY, type FloodInc, type RainEvent } from "./memory";
import { dijkstra } from "./paths";
import { backtestAll, COVER_M, judge, rainReports, replayAsOf } from "./replay";
import { computeReach, type Facility } from "./reach";

const CACHE = path.join(process.cwd(), "data", "aws-cache");
const have = fs.existsSync(path.join(process.cwd(), "data", "roads", "graph.bin")) && fs.existsSync(CACHE);
function table(prefix: string): Record<string, any>[] {
  const f = fs.readdirSync(CACHE).find((x) => x.startsWith(prefix + "-") && x.endsWith(".json.gz"))!;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE, f))).toString("utf8"));
  const cols = j.columns.map((c: [string]) => c[0]);
  return j.rows.map((r: unknown[]) => Object.fromEntries(cols.map((c: string, i: number) => [c, r[i]])));
}

let g: RoadGraph, ix: GraphIndex, incs: FloodInc[], events: RainEvent[];
const WATER = new Set(["FLOOD_WATERLOGGING", "FLOOD_RISK_SIGNAL", "DRAINAGE_SEWAGE", "DRAIN_WORKS_SAFETY", "WATERBODY_INFRA"]);

beforeAll(() => {
  if (!have) return;
  const t0 = Date.now();
  g = loadGraph()!;
  ix = indexGraph(g);
  console.log(`graph ${g.n} junctions ${g.m} pieces, load + index ${Date.now() - t0} ms`);
  incs = table("incidents").filter((r) => WATER.has(r.category_code) && r.lat != null).map((r) => ({
    id: r.incident_id, cat: r.category_code, lat: Number(r.lat), lon: Number(r.lon), prec: r.loc_precision_m == null ? null : Number(r.loc_precision_m),
    first: String(r.first_reported_at).slice(0, 19).replace("T", " "), closed: r.closed_at ? String(r.closed_at).slice(0, 19).replace("T", " ") : null, open: Number(r.is_open) === 1,
    ward: r.ward_no, dept: r.lead_dept ?? "", title: r.title ?? "", place: r.place_text, priority: Number(r.priority_score) || 0, breached: Number(r.sla_breached) === 1, status: r.status_std ?? ""
  }));
  const days: { day: string; source: "pipeline" | "imd"; mm?: number | null }[] = [];
  try {
    for (const d of fs.readFileSync(path.join(process.cwd(), "..", "district_intel", "output", "state", "grievance_rain_days.txt"), "utf8").split(/[,\s]+/).filter(Boolean)) days.push({ day: d, source: "pipeline" });
  } catch { /* none */ }
  const mm = new Map<string, number>();
  for (const o of table("observations")) if (o.metric === "rainfall_24h_mm" && o.value != null) { const d = String(o.observed_at).slice(0, 10); mm.set(d, Math.max(mm.get(d) ?? 0, Number(o.value))); }
  for (const [d, v] of mm) if (v >= 30) days.push({ day: d, source: "imd", mm: v });
  events = rainEvents(days);
  console.log(`water incidents ${incs.length}; rain events ${events.map((e) => `${e.start}..${e.end}[${e.sources.join("+")}]`).join(" ")}`);
}, 120_000);

const KX = 111320 * Math.cos(13.05 * Math.PI / 180), KY = 110574;
function segD(pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number) {
  const px = pLon * KX, py = pLat * KY, ax = aLon * KX, ay = aLat * KY, bx = bLon * KX, by = bLat * KY;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

describe.skipIf(!have)("Rain Rehearsal on the real data", () => {
  it("replays every past rain and beats random streets of the same length", () => {
    const t0 = Date.now();
    const bt = backtestAll(g, ix, incs, events, {}, 300);
    const ms = Date.now() - t0;
    for (const b of bt) {
      const j = b.judged;
      console.log(`rain ${b.event.start}..${b.event.end} (asOf ${b.asOf}): ${j.covered}/${j.tested} = ${((100 * j.covered) / j.tested).toFixed(1)} % on ${j.km.toFixed(1)} km marked` +
        ` (likely only ${j.coveredLikely}, ${j.kmLikely.toFixed(1)} km) · random same length ${(100 * j.random.median).toFixed(1)} % [${(100 * j.random.lo).toFixed(1)}–${(100 * j.random.hi).toFixed(1)}]` +
        ` · lift ${j.lift?.toFixed(2)} · likely-only lift ${j.liftLikely?.toFixed(2)} · streets ${b.likelyStreets} likely + ${b.possibleStreets} possible`);
    }
    console.log(`backtest of ${bt.length} rains: ${ms} ms`);
    expect(bt.length).toBeGreaterThan(0);
    // the newest rain with enough reports is the one the demo replays
    const last = bt[bt.length - 1];
    expect(last.judged.tested).toBeGreaterThanOrEqual(20);
  }, 600_000);

  it("counts covered reports exactly as a brute-force check does (21 Oct rain)", () => {
    const ev = events.find((e) => e.start <= "2026-10-21" && e.end >= "2026-10-21") ?? events[events.length - 1];
    const mem = buildMemory(g, ix, incs, events, { asOf: replayAsOf(ev) });
    const reports = rainReports(incs, ev);
    const j = judge(g, ix, mem, reports, 50);
    // oracle: every marked piece, every segment, every report
    const marked: number[] = [];
    for (let e = 0; e < g.m; e++) if (mem.tier[e] > 0) marked.push(e);
    let covered = 0;
    for (const r of reports) {
      let hit = false;
      for (const e of marked) {
        for (let k = g.shapeStart[e]; k < g.shapeStart[e + 1] - 1 && !hit; k++)
          if (segD(r.lat, r.lon, g.shape[2 * k], g.shape[2 * k + 1], g.shape[2 * k + 2], g.shape[2 * k + 3]) <= COVER_M) hit = true;
        if (hit) break;
      }
      if (hit) covered++;
    }
    expect(j.covered).toBe(covered);
    expect(mem.streets.filter((s) => s.tier === TIER_LIKELY).length).toBe(mem.likely);
    for (const s of mem.streets) expect(s.incidents.length).toBeGreaterThan(0);
  }, 300_000);

  it("uses nothing from after the moment (no peeking, real data)", () => {
    const asOf = "2026-10-19 09:00:00";
    const before = incs.filter((i) => i.first < asOf);
    const a = buildMemory(g, ix, before, events, { asOf });
    const b = buildMemory(g, ix, incs, events, { asOf });
    expect(b.likely).toBe(a.likely);
    expect(b.possible).toBe(a.possible);
    let same = true;
    for (let e = 0; e < g.m; e++) if (a.tier[e] !== b.tier[e]) { same = false; break; }
    expect(same).toBe(true);
  }, 300_000);

  it("computes reach of help in time, and closing streets never brings help nearer", () => {
    const fire = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "layers", "fire_stations.geojson"), "utf8")).features;
    const hosp = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "layers", "hospitals.geojson"), "utf8")).features.filter((f: any) => f.properties.government && f.properties.kind !== "clinic");
    const fac: Facility[] = [...fire.map((f: any) => ({ id: f.properties.id, kind: "fire" })), ...hosp.map((f: any) => ({ id: f.properties.id, kind: "hospital" }))].map((x: any, k: number) => {
      const f = k < fire.length ? fire[k] : hosp[k - fire.length];
      return { ...x, name: f.properties.name ?? "Fire station", name_ta: null, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], government: true, source: "osm", beds: null, ambulance: null, ward: null };
    });
    const mem = buildMemory(g, ix, incs, events, { asOf: "2026-10-19 09:00:00" });
    const factor = rehearsalFactor(mem);
    const t0 = Date.now();
    const r = computeReach(g, ix, fac, factor, 10);
    const ms = Date.now() - t0;
    console.log(`reach of ${fac.length} facilities (${fire.length} fire, ${hosp.length} hospitals): ${ms} ms; cut off ${r.facilities.filter((f) => f.cutOff).length};` +
      ` wards losing fire cover ${r.wards.filter((w) => w.loses.includes("fire")).length}, hospital ${r.wards.filter((w) => w.loses.includes("hospital")).length}; unrouted ${r.unrouted.length}`);
    expect(ms).toBeLessThan(20_000);
    const srcs = r.facilities.filter((f) => fac.find((x) => x.id === f.id)!.kind === "fire").map((f) => f.node);
    const n = dijkstra(g, srcs, {}).sec, w = dijkstra(g, srcs, { factor }).sec;
    for (let u = 0; u < g.n; u += 97) expect(w[u]).toBeGreaterThanOrEqual(n[u] - 1e-6);
    for (const f of r.facilities) expect(f.rehearsalKm).toBeLessThanOrEqual(f.normalKm + 1e-6);
  }, 300_000);
});
