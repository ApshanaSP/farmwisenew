/**
 * Test support: the real road network and the store snapshot's water incidents and rain days, read straight from
 * data/roads and data/aws-cache (no store). Used by the golden tests and the calibration run; never by the app.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { indexGraph, loadGraph, type GraphIndex, type RoadGraph } from "./graph";
import { rainEvents, type FloodInc, type RainEvent } from "./memory";

const CACHE = () => path.join(process.cwd(), "data", "aws-cache");
export const haveRealData = () => fs.existsSync(path.join(process.cwd(), "data", "roads", "graph.bin")) && fs.existsSync(CACHE());

export function cacheTable(prefix: string): Record<string, any>[] {
  const f = fs.readdirSync(CACHE()).find((x) => x.startsWith(prefix + "-") && x.endsWith(".json.gz"))!;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE(), f))).toString("utf8"));
  const cols = j.columns.map((c: [string]) => c[0]);
  return j.rows.map((r: unknown[]) => Object.fromEntries(cols.map((c: string, i: number) => [c, r[i]])));
}

const WATER = new Set(["FLOOD_WATERLOGGING", "FLOOD_RISK_SIGNAL", "DRAINAGE_SEWAGE", "DRAIN_WORKS_SAFETY", "WATERBODY_INFRA"]);
const t19 = (v: unknown) => (v ? String(v).slice(0, 19).replace("T", " ") : null);

export function realData(): { g: RoadGraph; ix: GraphIndex; incs: FloodInc[]; events: RainEvent[] } {
  const g = loadGraph()!;
  const ix = indexGraph(g);
  const incs: FloodInc[] = cacheTable("incidents").filter((r) => WATER.has(r.category_code) && r.lat != null).map((r) => ({
    id: r.incident_id, cat: r.category_code, lat: Number(r.lat), lon: Number(r.lon), prec: r.loc_precision_m == null ? null : Number(r.loc_precision_m),
    first: t19(r.first_reported_at)!, closed: t19(r.closed_at), open: Number(r.is_open) === 1, ward: r.ward_no, dept: r.lead_dept ?? "", title: r.title ?? "",
    place: r.place_text, priority: Number(r.priority_score) || 0, breached: Number(r.sla_breached) === 1, status: r.status_std ?? ""
  }));
  const days: { day: string; source: "pipeline" | "imd"; mm?: number | null }[] = [];
  try {
    for (const d of fs.readFileSync(path.join(process.cwd(), "..", "district_intel", "output", "state", "grievance_rain_days.txt"), "utf8").split(/[,\s]+/).filter(Boolean)) days.push({ day: d, source: "pipeline" });
  } catch { /* none */ }
  const mm = new Map<string, number>();
  for (const o of cacheTable("observations")) if (o.metric === "rainfall_24h_mm" && o.value != null) { const d = String(o.observed_at).slice(0, 10); mm.set(d, Math.max(mm.get(d) ?? 0, Number(o.value))); }
  for (const [d, v] of mm) if (v >= 30) days.push({ day: d, source: "imd", mm: v });
  return { g, ix, incs, events: rainEvents(days) };
}
