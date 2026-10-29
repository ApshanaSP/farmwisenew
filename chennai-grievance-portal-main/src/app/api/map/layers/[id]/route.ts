import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { shiftWall } from "@/lib/map/execute";
import { NEWS_PIN_LEVEL, type CondPlace, type NewsDoc, type World } from "@/lib/map/types";
import { world } from "@/lib/map/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The layers the map's Layers menu can switch on (roads stay on the server: only an answer's own road is sent). */
const TOGGLEABLE = new Set(["schools", "colleges", "hospitals", "fire_stations", "police", "water_bodies", "waterways", "rail_metro", "lakes_store", "gauges"]);

const NEWS_DAYS = 30;
/**
 * News reports of the last 30 days about incidents in the district: a pin only where the article names a locality;
 * articles placed only at taluk, zone or district level are counted (`unplaced`), never pinned at a guessed spot.
 */
function newsLayer(docs: NewsDoc[], now: string, lockDept: string | null) {
  const from = shiftWall(now, -24 * NEWS_DAYS);
  const recent = docs.filter((d) => d.at > from && d.at <= now && (!lockDept || d.dept === lockDept));
  const placed = recent.filter((d) => d.level === NEWS_PIN_LEVEL && d.lat != null && d.lon != null);
  return {
    id: "news", kind: "point", days: NEWS_DAYS, unplaced: recent.length - placed.length,
    meta: { id: "news", name_en: "News reports", name_ta: "செய்திகள்", kind: "point", source: "District news feed", licence: "Publisher's own", attribution: "Headlines link to each publisher", as_of: recent[0]?.at ?? null, count: placed.length },
    features: placed.map((d) => ({ id: d.id, name: d.title_en || d.title, lat: d.lat, lon: d.lon, kind: d.cat ?? "news", url: d.url, sub: `${d.outlet} · ${d.at.slice(0, 10)}${d.place ? ` · ${d.place}` : ""}`, inc: d.inc }))
  };
}

/** The live feeds as layers: the latest reading at each place, said in words ("98.5 % full · 17 Oct"). */
const LIVE = new Set(["live_rain", "live_lakes", "live_air", "live_hospitals", "live_works"]);
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-IN");
function liveLayer(id: string, conds: NonNullable<World["conds"]>) {
  const at = (p: CondPlace) => (p.at ? ` · ${p.at.slice(0, 10)}` : "");
  const feats = id === "live_works"
    ? conds.works.map((x) => ({ id: x.id, name: x.title, lat: x.lat, lon: x.lon, kind: (x.gap ?? 0) < -10 ? "late" : "ok",
        value: x.progress != null ? `${Math.round(x.progress)} %` : x.status,
        sub: `${x.status.replace(/_/g, " ")}${x.progress != null ? ` · ${Math.round(x.progress)} % done` : ""}${(x.gap ?? 0) < -10 ? ` · ${Math.round(-(x.gap ?? 0))} points behind plan` : ""}${x.target ? ` · due ${x.target}` : ""}` }))
    : conds.places.filter((p) => p.kind === { live_rain: "rain", live_lakes: "lake", live_air: "air", live_hospitals: "hospital" }[id]).map((p) => {
        const m = p.m;
        const [value, sub, kind] =
          id === "live_rain" ? [m.rainfall_24h_mm ? `${n1(m.rainfall_24h_mm.v)} mm` : "–", `${m.rainfall_24h_mm ? `${n1(m.rainfall_24h_mm.v)} mm rain in 24 h` : "no rain reading"}${m.temp_max_c ? ` · max ${n1(m.temp_max_c.v)} °C` : ""}${at(p)}`, (m.rainfall_24h_mm?.v ?? 0) >= 64.5 ? "high" : "ok"]
          : id === "live_lakes" ? [m.lake_pct_full ? `${Math.round(m.lake_pct_full.v)} %` : "–", `${m.lake_pct_full ? `${n1(m.lake_pct_full.v)} % full` : ""}${m.lake_outflow_cusec ? ` · outflow ${n1(m.lake_outflow_cusec.v)} cusec` : ""}${at(p)}`, (m.lake_pct_full?.v ?? 0) >= 90 ? "high" : "ok"]
          : id === "live_air" ? [m.aqi ? `${Math.round(m.aqi.v)}` : "–", `AQI ${m.aqi ? Math.round(m.aqi.v) : "–"}${m.aqi?.detail ? ` (${m.aqi.detail})` : ""}${at(p)}`, (m.aqi?.v ?? 0) > 100 ? "high" : "ok"]
          : [m.bed_occupancy_pct ? `${Math.round(m.bed_occupancy_pct.v)} %` : "–", `beds ${m.bed_occupancy_pct ? n1(m.bed_occupancy_pct.v) : "–"} % occupied${m.emergency_cases ? ` · ${Math.round(m.emergency_cases.v)} emergencies` : ""}${m.medicine_status && m.medicine_status.v < 2 ? " · medicines short" : ""}${at(p)}`, (m.bed_occupancy_pct?.v ?? 0) >= 90 ? "high" : "ok"];
        return { id: p.id, name: p.name, lat: p.lat, lon: p.lon, kind, value, sub };
      });
  const names: Record<string, [string, string, string]> = {
    live_rain: ["Rain (IMD stations)", "மழை", "India Meteorological Department"], live_lakes: ["Lake levels", "ஏரி நீர்மட்டம்", "PWD lake readings"],
    live_air: ["Air quality", "காற்றுத் தரம்", "CPCB / TNPCB"], live_hospitals: ["Government hospitals: beds", "அரசு மருத்துவமனைகள்", "Hospital MIS"],
    live_works: ["PWD works under way", "பொதுப்பணிகள்", "PWD works register"]
  };
  const [en, ta, source] = names[id];
  return { id, kind: "point", meta: { id, name_en: en, name_ta: ta, kind: "point", source, licence: "Government data", attribution: source, as_of: null, count: feats.length }, features: feats };
}

/** One facility or water layer, inside the district box (+3 km), with an ETag so the browser re-uses it. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  if (!TOGGLEABLE.has(params.id) && params.id !== "news" && !LIVE.has(params.id)) return NextResponse.json({ error: "No such layer." }, { status: 404 });
  const { world: w } = await world();
  const id = params.id;
  const body = id === "news" ? newsLayer(w.news ?? [], w.now, s.role === "department_officer" ? s.lockDept : null)
    : LIVE.has(id) ? liveLayer(id, w.conds ?? { places: [], works: [] })
    : id === "water_bodies"
    ? { id, kind: "polygon", meta: w.meta[id] ?? null, features: w.water.map((f) => ({ id: f.id, name: f.name, name_ta: f.name_ta, kind: f.kind, polys: f.polys, in_district: f.in_district })) }
    : id === "waterways"
      ? { id, kind: "line", meta: w.meta[id] ?? null, features: w.lines.waterways.map((l) => ({ id: l.id, name: l.name, name_ta: l.name_ta, kind: l.kind, lines: l.lines, in_district: l.in_district })) }
      : { id, kind: "point", meta: w.meta[id] ?? null, features: ((w.points as Record<string, { id: string; name: string | null; name_ta: string | null; lat: number; lon: number; kind: string; government?: boolean; in_district: boolean }[]>)[id] ?? [])
        .map((p) => ({ id: p.id, name: p.name, name_ta: p.name_ta, lat: p.lat, lon: p.lon, kind: p.kind, government: !!p.government, in_district: p.in_district })) };
  const json = JSON.stringify(body);
  const etag = `"${crypto.createHash("sha1").update(json).digest("hex").slice(0, 20)}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  return new NextResponse(json, { headers: { "content-type": "application/json", ETag: etag, "cache-control": "private, max-age=600" } });
}
