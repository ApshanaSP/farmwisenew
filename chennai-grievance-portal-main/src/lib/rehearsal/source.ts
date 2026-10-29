/**
 * Rain Rehearsal's inputs, read on the server with fixed queries: water-related incidents (with their closing time, so
 * a replay knows what was open at that moment), rain days (the district pipeline's heavy-rain days and IMD station
 * rainfall), IMD's district warnings, CFM-DSS river gauges and reservoir releases, and the newest CFM bulletin list.
 * The collectors' own files are read only where the store has nothing (gate discharge, bulletins); every item keeps its
 * source and time. Cached for the life of a store build.
 */
import fs from "fs";
import path from "path";
import type { RowDataPacket } from "mysql2";
import intelPool, { TITLE } from "@/lib/collector/db";
import { exportMeta } from "@/lib/collector/intel";
import { FLOOD_W, CHOKE_CATS, type FloodInc } from "./memory";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as Row[];
}

/** IMD's district warning for one day: 0 green … 3 red, with IMD's words */
export interface Warning { at: string; level: number; text: string }
export interface Gauge { id: string; name: string; lat: number | null; lon: number | null; at: string; level: number; warning: number | null; danger: number | null; quality: string; detail: string | null }
export interface Release { id: string; name: string; at: string; discharge: number; inflow: number | null; unit: string; prev: number | null }
export interface Bulletin { id: string; title: string; date: string; kind: "street" | "rain" | "lake" | "river" | "observed" | "other" }
export interface RainDay { day: string; source: "pipeline" | "imd"; mm: number | null }

export interface Sources {
  key: string;
  incidents: FloodInc[];
  rainDays: RainDay[];
  warnings: Warning[];
  gauges: Gauge[];
  releases: Release[];
  bulletins: Bulletin[];
  lakes: LakeSeries[];
  /** where each list came from, for the method panel */
  notes: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __rehearsalSources: { key: string; p: Promise<Sources> } | undefined;
}

const COLLECTORS = () => path.join(process.cwd(), "..");
const WATER_CATS = [...new Set([...Object.keys(FLOOD_W), ...CHOKE_CATS])];

export async function rehearsalSources(): Promise<Sources> {
  const m = await exportMeta().catch(() => ({} as Record<string, string>));
  const key = `${m.build_id ?? m.exported_at ?? "local"}`;
  const g = global.__rehearsalSources;
  if (g && g.key === key) return g.p;
  const p = load(key);
  global.__rehearsalSources = { key, p };
  p.catch(() => { if (global.__rehearsalSources?.p === p) global.__rehearsalSources = undefined; });
  return p;
}

async function load(key: string): Promise<Sources> {
  const notes: string[] = [];
  const marks = WATER_CATS.map(() => "?").join(", ");
  const [incRows, rainRows, warnRows, gaugeRows, facRows, lakeRows] = await Promise.all([
    q(`SELECT i.incident_id AS id, i.category_code AS cat, i.lat, i.lon, i.loc_precision_m AS prec, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS first,
              DATE_FORMAT(i.closed_at, '%Y-%m-%d %H:%i:%s') AS closed, i.ward_no AS ward, i.lead_dept AS dept, ${TITLE} AS title, i.place_text AS place,
              i.priority_score AS priority, i.sla_breached AS breached, i.status_std AS status, i.is_open AS open
       FROM incidents i WHERE i.lat IS NOT NULL AND i.lon IS NOT NULL AND i.category_code IN (${marks}) ORDER BY i.first_reported_at, i.incident_id`, WATER_CATS),
    q(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d') AS d, value, place_name FROM observations WHERE metric = 'rainfall_24h_mm' AND value IS NOT NULL ORDER BY observed_at`).catch(() => [] as Row[]),
    q(`SELECT DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS at, value, detail FROM observations WHERE metric = 'imd_warning_level' ORDER BY observed_at`).catch(() => [] as Row[]),
    q(`SELECT place_id, place_name, lat, lon, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS at, value, quality, detail FROM observations
       WHERE metric = 'gauge_level_m' ORDER BY observed_at`).catch(() => [] as Row[]),
    q(`SELECT facility_id, name, lat, lon FROM ref_facilities WHERE type = 'river_gauge'`).catch(() => [] as Row[]),
    q(`SELECT place_id, place_name, lat, lon, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS at, value FROM observations
       WHERE metric = 'lake_pct_full' AND value IS NOT NULL AND lat IS NOT NULL ORDER BY observed_at`).catch(() => [] as Row[])
  ]);
  const lakeHistory = new Map<string, LakeSeries>();
  for (const r of lakeRows) {
    const s = lakeHistory.get(String(r.place_id)) ?? lakeHistory.set(String(r.place_id), { id: String(r.place_id), name: String(r.place_name), lat: Number(r.lat), lon: Number(r.lon), at: [], pct: [] }).get(String(r.place_id))!;
    s.at.push(String(r.at)); s.pct.push(Number(r.value));
  }
  const incidents: FloodInc[] = incRows.map((r) => ({
    id: String(r.id), cat: String(r.cat), lat: Number(r.lat), lon: Number(r.lon), prec: r.prec == null || r.prec === "" ? null : Number(r.prec),
    first: String(r.first ?? ""), closed: r.closed ? String(r.closed) : null, open: Number(r.open) === 1,
    ward: r.ward == null ? null : Number(r.ward), dept: String(r.dept ?? ""), title: String(r.title ?? "Complaint"), place: r.place ?? null,
    priority: Number(r.priority) || 0, breached: Number(r.breached) === 1, status: String(r.status ?? "")
  }));

  // ---- rain days: the pipeline's heavy-rain days (what the grievance data was built around) and IMD station rainfall
  const rainDays: RainDay[] = [];
  try {
    const txt = fs.readFileSync(path.join(COLLECTORS(), "district_intel", "output", "state", "grievance_rain_days.txt"), "utf8");
    for (const d of txt.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) rainDays.push({ day: d, source: "pipeline", mm: null });
    notes.push("Heavy-rain days from the district pipeline (district_intel/output/state/grievance_rain_days.txt).");
  } catch { notes.push("The district pipeline's heavy-rain day list was not found; rain days come from IMD station rainfall only."); }
  const byDay = new Map<string, number>();
  for (const r of rainRows) byDay.set(String(r.d), Math.max(byDay.get(String(r.d)) ?? 0, Number(r.value)));
  for (const [d, mm] of byDay) if (mm >= HEAVY_MM) rainDays.push({ day: d, source: "imd", mm });
  for (const rd of rainDays) if (rd.source === "pipeline" && byDay.has(rd.day)) rd.mm = byDay.get(rd.day)!;
  if (byDay.size) notes.push(`IMD station rainfall ${[...byDay.keys()].sort()[0]} to ${[...byDay.keys()].sort().at(-1)} (a day with ${HEAVY_MM} mm or more at any Chennai station is a rain day).`);

  const warnings: Warning[] = warnRows.map((r) => ({ at: String(r.at), level: Math.max(0, Math.min(3, Math.round(Number(r.value) || 0))), text: String(r.detail ?? "") }));

  // ---- gauges: newest reading per point, placed from the reading or the store's facility list
  const fac = new Map(facRows.map((f) => [String(f.facility_id), f]));
  const latest = new Map<string, Row>();
  for (const r of gaugeRows) latest.set(String(r.place_id), r);
  const gauges: Gauge[] = [...latest.values()].map((r) => {
    const f = fac.get(String(r.place_id));
    const m = /warning\s+([\d.]+),\s*danger\s+([\d.]+)/i.exec(String(r.detail ?? ""));
    return {
      id: String(r.place_id), name: String(r.place_name), lat: r.lat != null ? Number(r.lat) : f?.lat != null ? Number(f.lat) : null,
      lon: r.lon != null ? Number(r.lon) : f?.lon != null ? Number(f.lon) : null, at: String(r.at), level: Number(r.value),
      warning: m ? Number(m[1]) : null, danger: m ? Number(m[2]) : null, quality: String(r.quality ?? ""), detail: r.detail ?? null
    };
  });

  // ---- reservoir discharge (gate operations) and the bulletin list: only in the CFM collector's files
  const releases: Release[] = [];
  try {
    const lines = fs.readFileSync(path.join(COLLECTORS(), "cfm_dss_collector", "data", "cfm_dss_gate_operations_chennai.csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
    const head = lines[0].split(",");
    const col = (k: string) => head.indexOf(k);
    const bySite = new Map<string, string[][]>();
    for (const l of lines.slice(1)) { const c = l.split(","); (bySite.get(c[col("gate_site_id")]) ?? bySite.set(c[col("gate_site_id")], []).get(c[col("gate_site_id")])!).push(c); }
    for (const [id, rows] of bySite) {
      const withQ = rows.filter((c) => c[col("discharge")] !== "").sort((a, b) => (a[col("observed_at")] < b[col("observed_at")] ? -1 : 1));
      const last = withQ.at(-1);
      if (!last) continue;
      releases.push({ id, name: last[col("gate_site_name")], at: last[col("observed_at")].slice(0, 19).replace("T", " "), discharge: Number(last[col("discharge")]),
        inflow: last[col("inflow")] === "" ? null : Number(last[col("inflow")]), unit: last[col("discharge_unit")] || "cusec",
        prev: withQ.length > 1 ? Number(withQ[withQ.length - 2][col("discharge")]) : null });
    }
    notes.push("Reservoir discharge from the Chennai Flood Monitor (CFM-DSS gate operations).");
  } catch { /* no CFM collector files here */ }
  const bulletins: Bulletin[] = [];
  try {
    const root = path.join(COLLECTORS(), "cfm_dss_collector", "data", "raw_cache");
    const days = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const d of days) {
      const f = fs.readdirSync(path.join(root, d)).filter((x) => x.endsWith("HomePage_GetBulletins.json")).sort().at(-1);
      if (!f) continue;
      const raw = JSON.parse(fs.readFileSync(path.join(root, d, f), "utf8"));
      let body = raw.body;
      while (typeof body === "string") body = JSON.parse(body);
      for (const b of body as Row[]) {
        const t = String(b.linktext ?? "").trim();
        const [dd, mm, yy] = String(b.date ?? "").split("/");
        bulletins.push({ id: String(b.sid), title: t, date: yy ? `${yy}-${mm}-${dd}` : "", kind: /street/i.test(t) ? "street" : /rainfall forecast/i.test(t) ? "rain" : /lake/i.test(t) ? "lake" : /river/i.test(t) ? "river" : /observed/i.test(t) ? "observed" : "other" });
      }
      break;
    }
  } catch { /* no bulletin list */ }
  return { key, incidents, rainDays, warnings, gauges, releases, bulletins, lakes: [...lakeHistory.values()], notes };
}

/** a lake's daily fill (% of full tank level) */
export interface LakeSeries { id: string; name: string; lat: number; lon: number; at: string[]; pct: number[] }

/** each lake's fill at asOf (newest reading before it) and its rise per day over the week before */
export function lakesAt(series: LakeSeries[], asOf: string): { id: string; name: string; lat: number; lon: number; pct: number; slope: number | null; at: string; daysToFull: number | null }[] {
  const out = [];
  for (const s of series) {
    let k = -1;
    for (let i = 0; i < s.at.length; i++) if (s.at[i] <= asOf) k = i; else break;
    if (k < 0) continue;
    const weekAgo = new Date(Date.parse(s.at[k].replace(" ", "T") + "Z") - 7 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    let j = k;
    while (j > 0 && s.at[j - 1] >= weekAgo) j--;
    const days = (Date.parse(s.at[k].replace(" ", "T") + "Z") - Date.parse(s.at[j].replace(" ", "T") + "Z")) / 86_400_000;
    const slope = days >= 1 ? (s.pct[k] - s.pct[j]) / days : null;
    out.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, pct: s.pct[k], slope: slope == null ? null : Math.round(slope * 100) / 100, at: s.at[k],
      daysToFull: slope && slope > 0 ? Math.round(((100 - s.pct[k]) / slope) * 10) / 10 : null });
  }
  return out;
}

/** a day with this much rain at any IMD station in Chennai is a heavy-rain day (glossary) */
export const HEAVY_MM = 30;
export const CFM_SITE = "https://chennaifloodmonitor.tn.gov.in/";
