/**
 * Rain's other tabs: what a heavy rain does besides flooding, rain by rain (the same rains as Flooding: memory.ts
 * rainEvents, a report counts for a rain from its first day to two days after its last, replay.ts rainWindow). Each tab
 * is a list of places (roads, wards, lines), and for every rain what happened at each one in one short line, so the
 * panel reads like Flooding: click a rain, see the places it hit, click a place, see what happened there.
 *
 *   traffic  roads where traffic jammed in rain: police traffic-obstruction reports, road accidents and road-damage
 *            complaints in rain windows, placed on the road they stood on (the road network, graph.ts); main roads that
 *            flooded in that rain (the same flood memory as Flooding: water on the road stops traffic); road underpasses
 *            (OpenStreetMap) with water or traffic reports at them; traffic news of rain days. The reports behind a road
 *            stay on its card ("where this comes from"), not on the map. Live traffic on top with a TomTom key (traffic.ts).
 *   power    wards that lose power in rain, and for how long. Rain-day outages per ward are published nowhere, so the
 *            hours come from a generated outage log seeded on the wards' own streetlight and electrical-hazard complaints
 *            of that rain (sources: kind "generated"; the panel does not label it, the team says so when presenting);
 *            planned shutdown notices as the press prints them and outage news are real.
 *   metro    the metro lines (ChennaiGTFS: CMRL) and the suburban lines (Southern Railway, grouped into Beach–Tambaram,
 *            MRTS, Central–Avadi and Beach–Ennore): how late trains ran and which stations closed in each rain. Delays
 *            and closures are not published either: generated, seeded on the flood streets at each station's entrances
 *            in that rain; disruption news of rain days is real.
 *
 * Computed once per store build and hour (as the flood memory), read-only. Never a forecast: a record of past rains.
 */
import fs from "fs";
import path from "path";
import type { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { world } from "@/lib/map/world";
import { pointInPolygon } from "@/lib/map/geom";
import type { World } from "@/lib/map/types";
import { edgeName, edgeShape, edgesNear, flatDistM, MAIN_CLASS_MAX, type RoadGraph, type GraphIndex } from "./graph";
import { impactInputs } from "./engine";
import { rainWindow } from "./replay";
import type { RainEvent } from "./memory";
import type { Line } from "./types";

export type Lens = "traffic" | "power" | "metro";
export const LENSES: Lens[] = ["traffic", "power", "metro"];

export type Source = "police" | "citizen" | "news" | "flood";
/** a record behind a place: a report, a news article, or the flood record (a road card's "where this comes from") */
export interface ImpactReport {
  id: string;
  lat: number;
  lon: number;
  title: string;
  /** IST "YYYY-MM-DD HH:MM:SS" */
  at: string;
  source: Source;
  /** what it says, in two or three words ("road accident", "water on the road") */
  what: string | null;
  url: string | null;
  outlet: string | null;
  /** the road, ward or line it belongs to */
  item: string | null;
  /** the rain it came in (null: outside every rain) */
  rain: string | null;
  place: string | null;
  /** the incident behind it, to open in the console */
  incident: string | null;
}
/** what one rain did at a place */
export interface RainHit {
  /** 1 a little … 3 badly */
  level: 1 | 2 | 3;
  /** one short line: "Water on the road · 2 accidents", "Power off about 4 h", "Trains about 20 min late" */
  why: string;
  /** Power: hours off; Metro: minutes late */
  hours?: number;
  minutes?: number;
  /** Metro: stations closed in that rain, and the station to use instead */
  closed?: { name: string; lat: number; lon: number; hours: number; use: string | null }[];
}
export interface ImpactItem {
  key: string;
  kind: "road" | "underpass" | "area" | "line";
  label: string;
  sub: string;
  lat: number;
  lon: number;
  /** a road's lines */
  lines?: Line[];
  /** a ward's outline */
  rings?: [number, number][][];
  /** a rail line's path and colour */
  path?: [number, number][];
  color?: string;
  /** the rains it was hit in, oldest first */
  rains: string[];
  byRain: Record<string, RainHit>;
  /** 0 faint … 3 strong, from how many rains hit it */
  level: 0 | 1 | 2 | 3;
  /** short plain facts for its card */
  facts: string[];
  /** what to do before the next rain, and who */
  jobs: { who: string; en: string }[];
  /** records behind it */
  reports: number;
  ward: number | null;
  zone: number | null;
}
export interface ImpactData {
  lens: Lens;
  asOf: string;
  /** every rain, with how many places it hit */
  rains: { id: string; start: string; end: string; maxMm: number | null; hit: number }[];
  items: ImpactItem[];
  /** the records behind the places (Traffic: reports and news; Power and Metro: news only) */
  reports: ImpactReport[];
  /** the three numbers at the top */
  kpis: { n: string; label: string }[];
  /** one-line findings, each from the numbers above */
  insights: string[];
  /** where each part came from, and how much ("generated": the demo's outage and delay logs) */
  sources: { label: string; n: number; kind: "real" | "open" | "generated" | "live"; note: string }[];
  /** "N times as many on a rain day": reports a day in rain windows against other days */
  lift: { rainPerDay: number; otherPerDay: number; times: number | null } | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __rainImpacts: Map<string, Promise<ImpactData>> | undefined;
}

/** raised when the way the tabs are built changes, so a running server builds them again */
const IMPACTS_VERSION = 5;

export async function impacts(lens: Lens): Promise<ImpactData> {
  const inp = await impactInputs();
  const k = `${lens}|${inp.key}|${IMPACTS_VERSION}`;
  const cache = (global.__rainImpacts ??= new Map());
  const hit = cache.get(k);
  if (hit) return hit;
  if (cache.size > 12) cache.clear();
  const p = build(lens, inp);
  cache.set(k, p);
  p.catch(() => { if (cache.get(k) === p) cache.delete(k); });
  return p;
}

type Inputs = Awaited<ReturnType<typeof impactInputs>>;

async function build(lens: Lens, inp: Inputs): Promise<ImpactData> {
  const docs = await rainDocs();
  if (lens === "traffic") return traffic(inp, docs);
  if (lens === "power") return power(inp, docs, (await world()).resolver.entries);
  return metro(inp, docs);
}

// ------------------------------------------------------------------ shared --

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtDay = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
/** the rain a moment belongs to (its window), or null */
function rainOf(events: RainEvent[]): (at: string) => string | null {
  const ws = events.map((e) => ({ id: e.id, ...rainWindow(e) }));
  return (at) => ws.find((w) => at >= w.from && at <= w.to)?.id ?? null;
}
/** days inside some rain window, and the others, over the record's span: for "N times as many on a rain day" */
function liftOf(ats: string[], events: RainEvent[], now: string): ImpactData["lift"] {
  if (!ats.length) return null;
  const first = ats.reduce((a, b) => (a < b ? a : b)).slice(0, 10), last = now.slice(0, 10);
  const rainDays = new Set<string>();
  for (const e of events) {
    const w = rainWindow(e);
    for (let d = w.from.slice(0, 10); d <= w.to.slice(0, 10); d = new Date(Date.parse(d + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10)) if (d >= first && d <= last) rainDays.add(d);
  }
  const span = Math.round((Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86_400_000) + 1;
  const other = Math.max(1, span - rainDays.size);
  const inRain = ats.filter((a) => rainDays.has(a.slice(0, 10))).length;
  const rainPerDay = rainDays.size ? inRain / rainDays.size : 0, otherPerDay = (ats.length - inRain) / other;
  return { rainPerDay: Math.round(rainPerDay * 10) / 10, otherPerDay: Math.round(otherPerDay * 10) / 10, times: otherPerDay > 0 ? Math.round((rainPerDay / otherPerDay) * 10) / 10 : null };
}
const wardInfo = (w: World, ward: number | null) => {
  const x = ward == null ? null : w.wards.find((y) => y.ward === ward);
  return x ? { ward: x.ward, zone: x.zone, sub: `Ward ${x.ward} · ${x.zoneName}` } : { ward: null, zone: null, sub: "Outside the Corporation's wards" };
};
function wardAt(w: World, lat: number, lon: number): number | null {
  for (const x of w.wards) {
    if (lat < x.bbox.s || lat > x.bbox.n || lon < x.bbox.w || lon > x.bbox.e) continue;
    if (pointInPolygon({ lat, lon }, x.rings)) return x.ward;
  }
  return null;
}
const levelOf = (rains: number): 0 | 1 | 2 | 3 => (rains >= 4 ? 3 : rains >= 2 ? 2 : rains === 1 ? 1 : 0);
/** a small seeded generator, so the generated logs are the same on every load */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
/** the nearest named place (OpenStreetMap) to a point, within 2.5 km */
function nearPlaceOf(w: World) {
  const places = w.points.osm_places.filter((p) => p.name);
  return (lat: number, lon: number) => places.reduce<{ n: string | null; d: number }>((m, p) => { const d = flatDistM(lat, lon, p.lat, p.lon); return d < m.d ? { n: p.name, d } : m; }, { n: null, d: 2500 }).n;
}
/** every rain with how many places it hit */
function rainsOf(events: RainEvent[], items: ImpactItem[]): ImpactData["rains"] {
  return events.map((e) => ({ id: e.id, start: e.start, end: e.end, maxMm: e.maxMm, hit: items.filter((x) => x.byRain[e.id]).length }));
}
const sortItems = (items: ImpactItem[]) => items.sort((a, b) => b.level - a.level || b.rains.length - a.rains.length || b.reports - a.reports || a.label.localeCompare(b.label));
/** "A, B and C" */
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface Doc { id: string; title: string; summary: string; body: string; url: string | null; outlet: string; at: string; lat: number | null; lon: number | null; level: string | null; place: string | null }

/** the district's news about traffic, power and trains (titles in English or Tamil), with the first part of the text */
async function rainDocs(): Promise<Doc[]> {
  const words = ["traffic", "subway", "congest", "diversion", "snarl", "power", "electric", "outage", "shutdown", "tangedco", "tnpdcl", "transformer",
    "metro", "train", "mrts", "suburban", "போக்குவரத்து", "சுரங்கப்பாதை", "மின்", "ரயில்", "மெட்ரோ"];
  try {
    const [rows] = await intelPool.query<RowDataPacket[]>(
      `SELECT doc_id AS id, COALESCE(title_en, title) AS title, title AS title_raw, summary, SUBSTR(body, 1, 6000) AS body, url, publisher AS outlet,
              DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS at, lat, lon, geo_level AS level, place_text AS place
       FROM documents WHERE is_district = 1 AND published_at IS NOT NULL AND (${words.map(() => "LOWER(COALESCE(title_en, title)) LIKE ? OR title LIKE ?").join(" OR ")})`,
      words.flatMap((x) => [`%${x}%`, `%${x}%`]));
    return rows.map((r) => ({ id: String(r.id), title: String(r.title ?? r.title_raw ?? ""), summary: String(r.summary ?? ""), body: String(r.body ?? ""), url: r.url ? String(r.url) : null,
      outlet: String(r.outlet ?? ""), at: String(r.at), lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon), level: r.level ? String(r.level) : null, place: r.place ? String(r.place) : null }));
  } catch (e) {
    console.warn("[rain impacts] news not read:", (e as Error).message);
    return [];
  }
}
/** a news report placed on the map only where the article names a locality */
const placed = (d: Doc) => d.level === "locality" && d.lat != null && d.lon != null;

// ----------------------------------------------------------------- traffic --

const TRAFFIC_CATS = new Set(["TRAFFIC_OBSTRUCTION", "ROAD_ACCIDENT", "ROAD_DAMAGE"]);
const TRAFFIC_NEWS = /traffic|congest|snarl|gridlock|diversion|divert|subway|underpass|stranded|crawl|jam\b|bumper|போக்குவரத்து|சுரங்கப்பாதை|நெரிசல்/i;
/** a report's kind in a few words, one and many */
const CAT_WORD: Record<string, [string, string]> = { TRAFFIC_OBSTRUCTION: ["road blocked", "road blocked"], ROAD_ACCIDENT: ["accident", "accidents"], ROAD_DAMAGE: ["road broken", "road broken"] };

function roadOf(g: RoadGraph, ix: GraphIndex, lat: number, lon: number): { name: string; e: number; main: boolean } | null {
  const near = edgesNear(g, ix, lat, lon, 120).sort((a, b) => a.d - b.d);
  for (const x of near) { const n = edgeName(g, x.e); if (n) return { name: n, e: x.e, main: g.cls[x.e] <= MAIN_CLASS_MAX }; }
  return null;
}
/** a main road is one road across the city (Anna Salai); a street is one per ward ("2nd Street" is in many wards) */
const roadKey = (r: { name: string; main: boolean }, ward: number | null) => `road:${r.name.toLowerCase()}${r.main ? "" : `|w${ward ?? "-"}`}`;

/** "Water on the road · 2 accidents · road blocked" */
function trafficWhy(cats: Map<string, number>, water: boolean, news: number): string {
  const parts = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => { const w = CAT_WORD[c] ?? [c, c]; return n === 1 || w[0] === w[1] ? w[0] : `${n} ${w[1]}`; });
  const s = [...(water ? ["water on the road"] : []), ...parts, ...(news ? ["in the news"] : [])].join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function traffic(inp: Inputs, docs: Doc[]): ImpactData {
  const { g, ix, w, events, now } = inp;
  const inRain = rainOf(events);
  const idOfStart = new Map(events.map((e) => [e.start, e.id]));
  const incs = w.incidents.filter((i) => TRAFFIC_CATS.has(i.cat) && i.pinnable && (i.prec == null || i.prec <= 300));
  const reports: ImpactReport[] = [];
  type Road = { name: string; main: boolean; edges: Set<number>; reps: ImpactReport[]; cats: Map<string, Map<string, number>>; wards: Map<number, number> };
  const byRoad = new Map<string, Road>();
  for (const i of incs) {
    const rain = inRain(i.first);
    if (!rain) continue;
    const road = roadOf(g, ix, i.lat, i.lon);
    if (!road) continue;
    const key = roadKey(road, i.ward);
    const rep: ImpactReport = { id: i.id, lat: r5(i.lat), lon: r5(i.lon), title: i.title, at: i.first, source: i.citizen > 0 ? "citizen" : "police", what: CAT_WORD[i.cat]?.[0] ?? null,
      url: null, outlet: null, item: key, rain, place: i.place, incident: i.id };
    const r = byRoad.get(key) ?? byRoad.set(key, { name: road.main ? road.name : `${road.name}${i.ward != null ? `, Ward ${i.ward}` : ""}`, main: road.main, edges: new Set(), reps: [], cats: new Map(), wards: new Map() }).get(key)!;
    for (const x of edgesNear(g, ix, i.lat, i.lon, 250)) if (edgeName(g, x.e) === road.name) r.edges.add(x.e);
    r.reps.push(rep);
    const c = r.cats.get(rain) ?? r.cats.set(rain, new Map()).get(rain)!;
    c.set(i.cat, (c.get(i.cat) ?? 0) + 1);
    if (i.ward != null) r.wards.set(i.ward, (r.wards.get(i.ward) ?? 0) + 1);
  }
  // main roads that flooded: water on a main road stops its traffic, in each rain it stood there
  const floodMain = inp.streets.filter((s) => s.main && s.name && s.rains >= 1);
  const floodsOf = (name: string) => floodMain.filter((s) => name.toLowerCase().startsWith(s.name!.toLowerCase()));
  // traffic news of rain days: on the road it stands on (a locality it names), or a main road its title names
  const news = docs.filter((d) => TRAFFIC_NEWS.test(d.title) && inRain(d.at));
  const newsBy = new Map<string, Doc[]>();
  const mains = [...byRoad.entries()].filter(([, r]) => r.main && r.name.length >= 8);
  for (const d of news) {
    let key: string | null = null;
    if (placed(d)) { const road = roadOf(g, ix, d.lat!, d.lon!); const k = road ? roadKey(road, wardAt(w, d.lat!, d.lon!)) : null; if (k && byRoad.has(k)) key = k; }
    if (!key) key = mains.find(([, r]) => new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(d.title))?.[0] ?? null;
    if (key) newsBy.set(key, [...(newsBy.get(key) ?? []), d]);
  }

  const items: ImpactItem[] = [];
  const usedFlood = new Set<string>();
  for (const [key, r] of byRoad) {
    const floods = r.main ? floodsOf(r.name) : [];
    // a road with one report in all the rains, and no water on it, is a dot, not a road that jams
    if (r.reps.length < 2 && !floods.length) continue;
    for (const s of floods) usedFlood.add(s.key);
    const wetRains = new Set(floods.flatMap((s) => s.rainDates.map((d) => idOfStart.get(d)).filter((x): x is string => !!x)));
    const nws = newsBy.get(key) ?? [];
    const rains = [...new Set([...r.cats.keys(), ...wetRains, ...nws.map((d) => inRain(d.at)!)])].sort();
    const byRain: Record<string, RainHit> = {};
    for (const id of rains) {
      const cats = r.cats.get(id) ?? new Map<string, number>();
      const n = [...cats.values()].reduce((a, b) => a + b, 0) + (wetRains.has(id) ? 2 : 0);
      const nn = nws.filter((d) => inRain(d.at) === id).length;
      byRain[id] = { level: n >= 3 ? 3 : n === 2 || nn ? 2 : 1, why: trafficWhy(cats, wetRains.has(id), nn) };
    }
    const ward = [...r.wards.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? floods[0]?.ward ?? null;
    const wi = wardInfo(w, ward);
    const lines = [...[...r.edges].map((e) => edgeShape(g, e)), ...floods.flatMap((s) => s.edges.map((e) => edgeShape(g, e)))];
    const at = r.reps[0] ?? { lat: r5(floods[0].lat), lon: r5(floods[0].lon) };
    const kinds = new Map<string, number>();
    for (const m of r.cats.values()) for (const [c, n] of m) kinds.set(c, (kinds.get(c) ?? 0) + n);
    const wetN = wetRains.size;
    // one flood record a rain (a long road is several flood streets)
    for (const id of wetRains) { const s = floods.find((f) => f.rainDates.includes(events.find((e) => e.id === id)!.start))!; reports.push({ id: `flood:${key}:${id}`, lat: r5(s.lat), lon: r5(s.lon), title: `Water stood on ${r.name}`, at: `${events.find((e) => e.id === id)!.start} 00:00:00`, source: "flood", what: "water on the road", url: null, outlet: null, item: key, rain: id, place: s.label, incident: null }); }
    reports.push(...r.reps);
    for (const d of nws) reports.push({ id: `doc:${d.id}`, lat: r5(d.lat ?? at.lat), lon: r5(d.lon ?? at.lon), title: d.title, at: d.at, source: "news", what: "news", url: d.url, outlet: d.outlet, item: key, rain: inRain(d.at), place: d.place, incident: null });
    items.push({
      key, kind: "road", label: r.name, sub: wi.sub, lat: at.lat, lon: at.lon, lines, rains, byRain, reports: r.reps.length + wetN + nws.length, level: levelOf(rains.length), ward: wi.ward, zone: wi.zone,
      facts: [
        ...(wetN ? [`Water stands on it in heavy rain (${plural(wetN, "rain")}): traffic stops while it does`] : []),
        ...(kinds.size ? [`In rains: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${n === 1 ? CAT_WORD[c]?.[0] ?? c : CAT_WORD[c]?.[1] ?? c}`).join(", ")}`] : []),
        ...(nws.length ? [`In the news on rain days: ${plural(nws.length, "article")}`] : [])
      ],
      jobs: [{ who: "Greater Chennai Traffic Police", en: `A diversion ready for ${r.name} before the next heavy rain` },
        ...(wetN ? [{ who: "GCC Storm Water Drains", en: `Clear the drains along ${r.name} so water does not stand` }] : []),
        ...(kinds.get("ROAD_DAMAGE") ? [{ who: "GCC Roads", en: `Patch the broken stretches of ${r.name}` }] : [])]
    });
  }
  // main roads that flood in two or more rains with no traffic report of their own: traffic stops there when they do
  for (const s of floodMain) {
    if (usedFlood.has(s.key) || s.rains < 2) continue;
    const wi = wardInfo(w, s.ward);
    const rains = s.rainDates.map((d) => idOfStart.get(d)).filter((x): x is string => !!x).sort();
    if (!rains.length) continue;
    const key = `flood:${s.key}`;
    for (const id of rains) reports.push({ id: `flood:${s.key}:${id}`, lat: r5(s.lat), lon: r5(s.lon), title: `Water stood on ${s.label}`, at: `${events.find((e) => e.id === id)!.start} 00:00:00`, source: "flood", what: "water on the road", url: null, outlet: null, item: key, rain: id, place: s.label, incident: null });
    items.push({
      key, kind: "road", label: s.label, sub: wi.sub, lat: r5(s.lat), lon: r5(s.lon), lines: s.edges.map((e) => edgeShape(g, e)), rains, reports: rains.length,
      byRain: Object.fromEntries(rains.map((id) => [id, { level: 2, why: "Water on the road" } as RainHit])), level: levelOf(rains.length), ward: wi.ward, zone: wi.zone,
      facts: [`A main road where water stands in heavy rain (${plural(rains.length, "rain")}): traffic stops while it does`],
      jobs: [{ who: "Greater Chennai Traffic Police", en: `A diversion ready for ${s.label}` }, { who: "GCC Storm Water Drains", en: `Clear the drains along ${s.label}` }]
    });
  }
  // road underpasses: water or traffic reports within 150 m of one, rain by rain
  const ups = readLayer("underpasses");
  const water = inp.incidents.filter((i) => i.cat === "FLOOD_WATERLOGGING" && i.prec != null && i.prec <= 300);
  const nearPlace = nearPlaceOf(w);
  const trafficReps = [...byRoad.values()].flatMap((r) => r.reps);
  for (const f of ups) {
    if (!f.properties.in_district) continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const label = f.properties.name || `Underpass near ${nearPlace(lat, lon) ?? "the railway"}`;
    const wet = water.filter((i) => flatDistM(lat, lon, i.lat, i.lon) <= 150).map((i) => ({ i, rain: inRain(i.first) })).filter((x) => x.rain);
    const jam = trafficReps.filter((r) => flatDistM(lat, lon, r.lat, r.lon) <= 150);
    const rains = [...new Set([...wet.map((x) => x.rain!), ...jam.map((x) => x.rain!)])].sort();
    if (!rains.length) continue;
    const key = `up:${f.properties.id}`;
    const wi = wardInfo(w, f.properties.ward ?? null);
    for (const x of wet) reports.push({ id: x.i.id, lat: r5(x.i.lat), lon: r5(x.i.lon), title: x.i.title, at: x.i.first, source: "citizen", what: "water in the underpass", url: null, outlet: null, item: key, rain: x.rain, place: x.i.place, incident: x.i.id });
    const byRain: Record<string, RainHit> = {};
    for (const id of rains) {
      const wn = wet.filter((x) => x.rain === id).length, jn = jam.filter((x) => x.rain === id).length;
      byRain[id] = { level: wn ? 3 : jn >= 2 ? 2 : 1, why: [wn ? "Water in the underpass: closed to traffic" : null, jn ? (jn === 1 ? "traffic report" : `${jn} traffic reports`) : null].filter(Boolean).join(" · ") };
    }
    items.push({
      key, kind: "underpass", label, sub: wi.sub, lat, lon, rains, byRain, reports: wet.length + jam.length, level: levelOf(rains.length), ward: wi.ward, zone: wi.zone,
      facts: [`A road under the railway: water stood in it in ${plural(new Set(wet.map((x) => x.rain)).size, "rain")}; traffic reports in ${plural(new Set(jam.map((x) => x.rain)).size, "rain")}`],
      jobs: [{ who: "GCC Storm Water Drains", en: `A pump at ${label} before the rain, and close it to traffic once water stands` }, { who: "Greater Chennai Traffic Police", en: `Signs for the way around ${label}` }]
    });
  }
  sortItems(items);
  const rains = rainsOf(events, items);
  const lift = liftOf(incs.map((i) => i.first), events, now);
  const perRain = Math.round(avg(rains.map((r) => r.hit)));
  const top = items.filter((x) => x.kind === "road").slice(0, 3);
  const wetShare = (() => { const all = items.flatMap((x) => Object.values(x.byRain)); return all.length ? Math.round((100 * all.filter((h) => /water/i.test(h.why)).length) / all.length) : 0; })();
  const upsHit = items.filter((x) => x.kind === "underpass");
  return {
    lens: "traffic", asOf: now, rains, items, reports,
    kpis: [{ n: perRain.toLocaleString("en-IN"), label: "roads jam in a typical heavy rain" }, { n: items.filter((x) => x.rains.length >= 3).length.toLocaleString("en-IN"), label: "roads jam in 3 or more rains" },
      { n: lift?.times && lift.times > 1 ? `${lift.times}×` : `${wetShare} %`, label: lift?.times && lift.times > 1 ? "as many traffic reports on a rain day" : "of jams have water on the road" }],
    insights: [
      `In a heavy rain, traffic jams on about ${plural(perRain, "road")}${wetShare ? `; on ${wetShare} % of them, water on the road is the reason` : ""}.`,
      top.length ? `The roads that jam in the most rains: ${and(top.map((x) => `${x.label} (${x.rains.length} of ${events.length})`))}.` : null,
      upsHit.length ? `${plural(upsHit.length, "underpass", "underpasses")} fill with water or jam in rain: ${and(upsHit.slice(0, 3).map((x) => x.label))}.` : null
    ].filter((x): x is string => !!x),
    sources: [
      { label: "Police traffic reports, road accidents and road-damage complaints in rains", n: trafficReps.length, kind: "generated", note: "Generated police and complaint records in the district store (test data), placed on the road to 300 m" },
      { label: "Main roads where water stood (the flood record)", n: floodMain.length, kind: "real", note: "The same record as Flooding" },
      { label: "Traffic news of rain days", n: news.length, kind: "real", note: `${[...newsBy.values()].reduce((a, x) => a + x.length, 0)} name a road on this list` },
      { label: "Road underpasses", n: ups.filter((f) => f.properties.in_district).length, kind: "open", note: "OpenStreetMap" }
    ],
    lift
  };
}

// ------------------------------------------------------------------- power --

const POWER_CATS = new Set(["STREETLIGHT_ELECTRICAL"]);
const PLANNED = /power (cut|shutdown|outage)|shutdown|maintenance|மின் ?தடை|மின்தடை|power supply will|areas? (affected|list)/i;
const UNPLANNED = /outage|without power|no power|power failure|blackout|tripp|transformer (blast|burst|fire|explo)|snapped|live wire|electrocut|current (cut|shock)|மின் ?வெட்டு|மின்சாரம் தாக்கி/i;
const POWERISH = /power|electric|tangedco|tnpdcl|tneb|transformer|மின்/i;

interface PlaceEntry { kind: string; name_en: string; lat: number | null; lon: number | null; res: RegExp[]; primary?: number }

function power(inp: Inputs, docs: Doc[], entries: PlaceEntry[]): ImpactData {
  const { w, events, now } = inp;
  const inRain = rainOf(events);
  const incs = w.incidents.filter((i) => POWER_CATS.has(i.cat) && i.pinnable && (i.prec == null || i.prec <= 300));
  type Ward = { complaints: Map<string, number>; planned: Map<string, Set<string>>; news: Doc[] };
  const byWard = new Map<number, Ward>();
  const W = (ward: number) => byWard.get(ward) ?? byWard.set(ward, { complaints: new Map(), planned: new Map(), news: [] }).get(ward)!;
  // streetlight-out and electrical-hazard complaints of each rain, by ward: what the outage log is seeded on
  let inRainN = 0;
  for (const i of incs) {
    const rain = inRain(i.first);
    if (!rain || i.ward == null) continue;
    inRainN++;
    const c = W(i.ward).complaints;
    c.set(rain, (c.get(rain) ?? 0) + 1);
  }
  // outage news, in the ward of the locality it names
  const outages = docs.filter((d) => UNPLANNED.test(d.title) && POWERISH.test(d.title + " " + d.summary) && !PLANNED.test(d.title));
  for (const d of outages) {
    if (!placed(d)) continue;
    const ward = wardAt(w, d.lat!, d.lon!);
    if (ward != null) W(ward).news.push(d);
  }
  // planned shutdown notices: every locality a notice names (the map's own place names), the last 90 days
  const since = new Date(Date.parse(now.replace(" ", "T") + "Z") - 90 * 86_400_000).toISOString().slice(0, 10);
  const notices = docs.filter((d) => PLANNED.test(d.title) && POWERISH.test(d.title) && d.at.slice(0, 10) >= since);
  const locs = entries.filter((e) => (e.kind === "locality" || e.kind === "osm_place") && e.lat != null && e.lon != null && e.name_en.length >= 4);
  const firstWord = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean)[0] ?? "";
  const seenDay = new Set<string>();
  const namedAreas = new Map<string, number>();
  for (const d of notices) {
    const text = `${d.title}\n${d.summary}\n${d.body}`;
    const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
    const day = d.at.slice(0, 10);
    for (const e of locs) {
      if (!words.has(firstWord(e.name_en))) continue;
      const own = e.res.slice(0, e.primary ?? e.res.length);
      if (!own.some((re) => re.test(text))) continue;
      // the same place in two articles about one day's shutdown counts once
      const k = `${e.name_en}|${day}`;
      if (seenDay.has(k)) continue;
      seenDay.add(k);
      namedAreas.set(e.name_en, (namedAreas.get(e.name_en) ?? 0) + 1);
      const ward = wardAt(w, e.lat!, e.lon!);
      if (ward != null) { const s = W(ward).planned.get(e.name_en) ?? new Set<string>(); s.add(day); W(ward).planned.set(e.name_en, s); }
    }
  }
  // the outage log (generated, see the header): a ward with complaints in a rain lost power in it, for longer the more
  // complaints came in; a ward often in planned cuts now and then too
  const outage = new Map<number, Map<string, number>>();
  for (const ev of events) {
    for (const [ward, v] of [...byWard.entries()].sort((a, b) => a[0] - b[0])) {
      const rnd = seeded(`power|${ev.id}|${ward}`);
      const n = v.complaints.get(ev.id) ?? 0;
      const cuts = new Set([...v.planned.values()].flatMap((s) => [...s])).size;
      const p = n >= 2 ? 1 : n === 1 ? 0.7 : cuts >= 3 ? 0.15 : 0;
      if (!p || rnd() > p) continue;
      const h = Math.max(1, Math.min(10, Math.round(1 + 1.3 * n + rnd() * 3)));
      (outage.get(ward) ?? outage.set(ward, new Map()).get(ward)!).set(ev.id, h);
    }
  }
  const nearPlace = nearPlaceOf(w);
  const items: ImpactItem[] = [];
  const reports: ImpactReport[] = [];
  for (const [ward, v] of byWard) {
    const wd = w.wards.find((x) => x.ward === ward);
    if (!wd) continue;
    const off = outage.get(ward) ?? new Map<string, number>();
    const rains = [...off.keys()].sort();
    const planned = [...v.planned.entries()].map(([name, days]) => ({ name, n: days.size })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const cuts = new Set([...v.planned.values()].flatMap((s) => [...s])).size;
    if (!rains.length && cuts < 3) continue;
    const area = planned.length ? planned.slice(0, 2).map((p) => p.name).join(", ") : nearPlace(wd.lat, wd.lon);
    const label = `Ward ${ward}${area ? ` · ${area}` : ""}`;
    const byRain: Record<string, RainHit> = {};
    for (const [id, h] of off) byRain[id] = { level: h >= 5 ? 3 : h >= 3 ? 2 : 1, why: `Power off about ${h} h`, hours: h };
    const hrs = [...off.values()];
    const worst = [...off.entries()].sort((a, b) => b[1] - a[1])[0];
    const worstEv = worst ? events.find((e) => e.id === worst[0]) : null;
    for (const d of v.news) reports.push({ id: `doc:${d.id}`, lat: r5(d.lat!), lon: r5(d.lon!), title: d.title, at: d.at, source: "news", what: "news", url: d.url, outlet: d.outlet, item: `ward:${ward}`, rain: inRain(d.at), place: d.place, incident: null });
    items.push({
      key: `ward:${ward}`, kind: "area", label, sub: `${wd.zoneName} zone`, lat: wd.lat, lon: wd.lon, rings: wd.rings as [number, number][][],
      rains, byRain, reports: v.news.length, level: Math.max(levelOf(rains.length), cuts >= 3 ? 1 : 0) as 0 | 1 | 2 | 3, ward, zone: wd.zone,
      facts: [
        ...(rains.length ? [`Power went off in ${rains.length} of ${events.length} heavy rains, about ${Math.round(avg(hrs))} h each time${worst && worstEv ? `; the longest ${worst[1]} h (${fmtDay(worstEv.start)})` : ""}`] : []),
        ...(cuts ? [`Also in planned power cuts on ${plural(cuts, "day")} in the last 90 days${planned.length ? `: ${planned.slice(0, 4).map((p) => p.name).join(", ")}` : ""}`] : []),
        ...(v.news.length ? [`Power-outage news: ${plural(v.news.length, "article")}`] : [])
      ],
      jobs: [{ who: "TNPDCL (electricity)", en: `Check transformers and feeder pillars on low ground in Ward ${ward}` },
        { who: "GCC Parks", en: `Trim trees near overhead lines in Ward ${ward}` },
        ...(rains.length >= 4 ? [{ who: "TNPDCL (electricity)", en: `A standby crew for Ward ${ward} while the rain lasts` }] : [])]
    });
  }
  sortItems(items);
  const rainList = rainsOf(events, items);
  const lift = liftOf(incs.map((i) => i.first), events, now);
  const perRain = Math.round(avg(rainList.map((r) => r.hit)));
  const allHrs = [...outage.values()].flatMap((m) => [...m.values()]);
  const avgH = Math.round(avg(allHrs) * 10) / 10;
  const often = [...namedAreas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const top = items.filter((x) => x.rains.length).slice(0, 3);
  return {
    lens: "power", asOf: now, rains: rainList, items, reports,
    kpis: [{ n: perRain.toLocaleString("en-IN"), label: "wards lose power in a typical heavy rain" }, { n: `${avgH} h`, label: "without power, on average" },
      { n: items.filter((x) => x.rains.length >= 3).length.toLocaleString("en-IN"), label: "wards lose power in 3 or more rains" }],
    insights: [
      `In a heavy rain, power goes off in about ${plural(perRain, "ward")}, for about ${avgH} hours.`,
      top.length ? `The wards that lose power in the most rains: ${and(top.map((x) => `${x.label} (${x.rains.length} of ${events.length})`))}.` : null,
      often.length ? `Named most often in planned power cuts (90 days): ${and(often.map(([n, k]) => `${n} (${k})`))}.` : null,
      lift?.times && lift.times > 1 ? `Electrical faults are reported ${lift.times}× as often on a rain day.` : null
    ].filter((x): x is string => !!x),
    sources: [
      { label: "Streetlight-out and electrical-hazard complaints in rains (what the outage log is seeded on)", n: inRainN, kind: "real", note: "District store (citizen grievances)" },
      { label: "Rain-day outage log by ward", n: allHrs.length, kind: "generated", note: "Generated for the demo: rain-day outages per ward are not published" },
      { label: "Planned shutdown notices (90 days)", n: notices.length, kind: "real", note: `${namedAreas.size} localities named; the press's copy of TNPDCL's notices` },
      { label: "Outage news", n: outages.length, kind: "real", note: `${outages.filter(placed).length} name a locality` }
    ],
    lift
  };
}

// ------------------------------------------------------------------- metro --

const DISRUPT = /suspend|halt|delay|disrupt|stuck|stranded|waterlog|flood|derail|snag|cancel|affected|stopped|breakdown|technical|late|நிறுத்த|பாதிப்பு|தாமத|ரத்து/i;
const TRAIN = /\bmetro\b|cmrl|mrts|suburban|electric train|emu|local train|மெட்ரோ|மின்சார ரயில்|புறநகர் ரயில்/i;

interface Station { id: string; name: string; kind: "metro" | "suburban"; lat: number; lon: number; lines: string[]; trainsPerHour: number; entrances?: [number, number][] }
interface Transit { meta: Record<string, string>; stations: Station[]; lines: { id: string; name: string; kind: string; color: string; path: [number, number][] }[] }

/** the lines as the Collector knows them: the two metro lines, and the suburban network as its four corridors */
const SUBURBAN: { id: string; name: string; color: string; who: string; news: RegExp; stations: string[] }[] = [
  { id: "sub:south", name: "Suburban: Beach – Tambaram", color: "#7C3AED", who: "Southern Railway", news: /beach.{0,4}tambaram|tambaram|chengalpattu|guindy|egmore|mambalam/i,
    stations: ["Chennai Beach Junction", "Chennai Fort", "Chennai Park", "Chennai Egmore", "Chennai Chetpat", "Nungambakkam", "Kodambakkam", "Mambalam", "Saidapet", "Guindy", "St. Thomas Mount",
      "Palavantangal", "Minambakkam", "Tirusulam", "Pallavaram", "Chromepet", "Tambaram Sanatorium", "Tambaram", "Perungalattur", "Vandalur", "Urappakkam", "Guduvancheri"] },
  { id: "sub:mrts", name: "MRTS: Beach – Velachery", color: "#D97706", who: "Southern Railway", news: /mrts|velachery|thiruvanmiyur|tiruvanmiyur|mylapore|light house/i,
    stations: ["Chennai Beach Junction", "Chennai Fort", "Chennai Park Town", "Chintadaripet", "Chepauk", "Tiruvallikeni", "Light House", "Mundakakanni Amman Koil", "Thirumayilai", "Mandaveli",
      "Greenways Road", "Kotturpuram", "Kasturba Nagar", "Indra Nagar", "Tiruvanmiyur", "Taramani", "Perungudi", "Velachery"] },
  { id: "sub:west", name: "Suburban: Central – Avadi", color: "#DB2777", who: "Southern Railway", news: /arakkonam|tiruvallur|thiruvallur|avadi|ambattur|perambur|villivakkam|central.{0,12}(arakkonam|tiruvallur)/i,
    stations: ["Chennai Central Suburban", "Basin Bridge Junction", "Vyasarpadi Jeeva", "Perambur", "Perambur Carriage Works", "Perambur Loco Works", "Villivakkam", "Korattur", "Pattaravakkam",
      "Ambattur", "Tirumullaivayil", "Annanur", "Avadi", "Hindu College", "Pattabiram"] },
  { id: "sub:north", name: "Suburban: Beach – Ennore", color: "#0D9488", who: "Southern Railway", news: /gummidipoondi|ennore|ponneri|tiruvottiyur|thiruvottiyur|royapuram|washermanpet/i,
    stations: ["Chennai Beach Junction", "Royapuram", "Washermanpet", "Korukkupet", "Tondiarpet", "Voc Nagar", "Tiruvottiyur", "Wimco Nagar", "Kathivakkam", "Ennore", "Attipattu Pudu Nagar",
      "Attippattu", "Nandiyampakkam"] }
];
const METRO_NEWS: Record<string, RegExp> = { "Blue Line": /blue line|airport|wimco|washermenpet|tiruvottiyur|thiruvottiyur|saidapet|teynampet|anna salai|alandur/i,
  "Green Line": /green line|koyambedu|cmbt|vadapalani|anna nagar|ashok nagar|st\.? ?thomas mount|egmore/i };
const METRO_COLOR: Record<string, string> = { "Blue Line": "#1D4ED8", "Green Line": "#16A34A" };

const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
/** not train news: Metro Water, the metro's construction, news round-ups */
const NOT_TRAIN = /metro ?water|metrowater|phase[\s‑-]*(2|ii)|works|latest news|travel time/i;
/** the station names as people say them */
const nice = (n: string) => n.replace(/Puratchi Thalaivar Dr\. ?M\.?G\.?Ramachandran Central( Metro)?/i, "Central Metro").replace(/Puratchi Thalaivi Dr\.? ?J\.? ?Jayalalithaa Cmbt( Metro)?/i, "CMBT Metro")
  .replace(/Arignar Anna Alandur/i, "Alandur").replace(/^St\.Thomas Mount$/, "St. Thomas Mount Metro").replace(/Chennai Central Suburban/, "Chennai Central");

function metro(inp: Inputs, docs: Doc[]): ImpactData {
  const { w, events, now } = inp;
  const inRain = rainOf(events);
  const idOfStart = new Map(events.map((e) => [e.start, e.id]));
  const t = readTransit();
  const stations = t?.stations ?? [];
  // the lines: each with its stations in order and its path
  type L = { key: string; name: string; color: string; who: string; news: RegExp; kind: "metro" | "suburban"; st: Station[]; path: [number, number][] };
  const lines: L[] = [];
  for (const l of t?.lines ?? []) {
    if (l.kind !== "metro") continue;
    // stations in the order the line runs: by the nearest point of its path
    const at = (s: Station) => l.path.reduce((m, p, i) => { const d = flatDistM(s.lat, s.lon, p[0], p[1]); return d < m.d ? { i, d } : m; }, { i: 0, d: Infinity }).i;
    const st = stations.filter((s) => s.lines.includes(l.name)).map((s) => ({ s, i: at(s) })).sort((a, b) => a.i - b.i).map((x) => x.s);
    if (st.length) lines.push({ key: `line:${l.id}`, name: l.name, color: METRO_COLOR[l.name] ?? l.color, who: "CMRL (Metro)", news: METRO_NEWS[l.name] ?? /$^/, kind: "metro", st, path: l.path });
  }
  for (const c of SUBURBAN) {
    const st = c.stations.map((n) => stations.find((s) => s.kind === "suburban" && s.name === n)).filter((s): s is Station => !!s);
    if (st.length < 2) continue;
    // stations in order from the terminus out (each corridor runs out of the city from its first station)
    const o = st[0];
    st.sort((a, b) => flatDistM(o.lat, o.lon, a.lat, a.lon) - flatDistM(o.lat, o.lon, b.lat, b.lon));
    lines.push({ key: `line:${c.id}`, name: c.name, color: c.color, who: c.who, news: c.news, kind: "suburban", st, path: st.map((s) => [s.lat, s.lon]) });
  }
  // the rains each station had water at an entrance: a flood street within 250 m flooded in that rain, or a
  // waterlogging report within 250 m came in it
  const water = inp.incidents.filter((i) => i.cat === "FLOOD_WATERLOGGING" && i.prec != null && i.prec <= 300);
  const wetOf = new Map<string, { rains: Set<string>; street: string | null; often: number }>();
  for (const s of stations) {
    const pts = s.entrances?.length ? s.entrances : [[s.lat, s.lon] as [number, number]];
    const near = (lat: number, lon: number) => pts.some(([la, lo]) => flatDistM(la, lo, lat, lon) <= 250);
    const sts = inp.streets.filter((f) => near(f.lat, f.lon)).sort((a, b) => b.rains - a.rains);
    const rains = new Set<string>([...sts.flatMap((f) => f.rainDates.map((d) => idOfStart.get(d)).filter((x): x is string => !!x)),
      ...water.filter((i) => near(i.lat, i.lon)).map((i) => inRain(i.first)).filter((x): x is string => !!x)]);
    wetOf.set(s.id, { rains, street: sts[0]?.label ?? null, often: rains.size });
  }
  // disruption news of rain days, on the lines it names (news naming no line: every line of its kind)
  const news = docs.filter((d) => TRAIN.test(d.title) && !NOT_TRAIN.test(d.title) && DISRUPT.test(d.title + " " + d.summary.slice(0, 400)) && inRain(d.at));
  const named = (d: Doc) => lines.filter((l) => l.news.test(`${d.title} ${d.summary.slice(0, 400)}`));
  const isMetro = (d: Doc) => /\bmetro\b|cmrl|மெட்ரோ/i.test(d.title);
  const reports: ImpactReport[] = [];
  const items: ImpactItem[] = [];
  let closures = 0;
  for (const l of lines) {
    const byRain: Record<string, RainHit> = {};
    const lineNews = news.filter((d) => { const n = named(d); return n.length ? n.includes(l) : (l.kind === "metro") === isMetro(d); });
    for (const ev of events) {
      // the delay and closure log (generated, see the header): late in proportion to the stations with water at them;
      // the metro (elevated and underground) far less than the suburban trains on the ground
      const rnd = seeded(`metro|${l.key}|${ev.id}`);
      const wet = l.st.filter((s) => wetOf.get(s.id)?.rains.has(ev.id));
      const k0 = l.kind === "metro" ? 0.5 : 1;
      const minutes = wet.length >= 2 ? round5(k0 * (5 + 4 * Math.min(wet.length, 5) + rnd() * 6))
        : (wet.length === 1 || rnd() < 0.25) && rnd() < k0 ? 5 : 0;
      const closed: NonNullable<RainHit["closed"]> = [];
      for (const s of [...wet].sort((a, b) => (wetOf.get(b.id)?.often ?? 0) - (wetOf.get(a.id)?.often ?? 0))) {
        if (closed.length >= (l.kind === "metro" ? 1 : 2) || (wetOf.get(s.id)?.often ?? 0) < 4 || rnd() > 0.3) continue;
        const k = l.st.indexOf(s);
        const use = [l.st[k - 1], l.st[k + 1]].filter((o): o is Station => !!o && !wet.includes(o))
          .sort((a, b) => flatDistM(s.lat, s.lon, a.lat, a.lon) - flatDistM(s.lat, s.lon, b.lat, b.lon))[0];
        closed.push({ name: nice(s.name), lat: s.lat, lon: s.lon, hours: 1 + Math.floor(rnd() * 3), use: use ? nice(use.name) : null });
      }
      const nn = lineNews.filter((d) => inRain(d.at) === ev.id).length;
      if (minutes < 5 && !closed.length && !nn) continue;
      closures += closed.length;
      const why = [minutes >= 5 ? `Trains about ${minutes} min late` : "Disruption in the news",
        ...closed.map((c) => `${c.name} closed ~${c.hours} h${c.use ? `: use ${c.use}` : ""}`)].join(" · ");
      byRain[ev.id] = { level: minutes >= 25 || closed.length >= 2 ? 3 : minutes >= 15 || closed.length ? 2 : 1, why, minutes, closed };
    }
    for (const d of lineNews) reports.push({ id: `doc:${d.id}:${l.key}`, lat: l.st[0].lat, lon: l.st[0].lon, title: d.title, at: d.at, source: "news", what: "news", url: d.url, outlet: d.outlet, item: l.key, rain: inRain(d.at), place: l.name, incident: null });
    const rains = Object.keys(byRain).sort();
    const mins = Object.values(byRain).map((h) => h.minutes ?? 0).filter((m) => m >= 5);
    const worst = Object.entries(byRain).sort((a, b) => (b[1].minutes ?? 0) - (a[1].minutes ?? 0))[0];
    const worstEv = worst ? events.find((e) => e.id === worst[0]) : null;
    // the stations closed in past rains, most often first, and where to send people
    const shut = new Map<string, { n: number; use: string | null }>();
    for (const h of Object.values(byRain)) for (const c of h.closed ?? []) shut.set(c.name, { n: (shut.get(c.name)?.n ?? 0) + 1, use: c.use });
    const shutList = [...shut.entries()].sort((a, b) => b[1].n - a[1].n);
    const wetSt = l.st.filter((s) => (wetOf.get(s.id)?.often ?? 0) >= 3).sort((a, b) => (wetOf.get(b.id)?.often ?? 0) - (wetOf.get(a.id)?.often ?? 0));
    const mid = l.st[Math.floor(l.st.length / 2)];
    items.push({
      key: l.key, kind: "line", label: l.name, sub: `${l.kind === "metro" ? "Chennai Metro" : "Southern Railway"} · ${plural(l.st.length, "station")} · ${nice(l.st[0].name).replace(/ Metro$/, "")} – ${nice(l.st[l.st.length - 1].name).replace(/ Metro$/, "")}`,
      lat: mid.lat, lon: mid.lon, path: l.path, color: l.color, rains, byRain, reports: lineNews.length, level: levelOf(rains.length), ward: null, zone: null,
      facts: [
        ...(mins.length ? [`Late in ${rains.length} of ${events.length} heavy rains, about ${Math.round(avg(mins))} min each time${worst && worstEv && worst[1].minutes ? `; the worst ${worst[1].minutes} min (${fmtDay(worstEv.start)})` : ""}`] : []),
        ...(shutList.length ? [`Stations closed in past rains: ${shutList.slice(0, 3).map(([n, x]) => `${n} (${plural(x.n, "rain")})${x.use ? `, use ${x.use}` : ""}`).join("; ")}`] : []),
        ...(lineNews.length ? [`Disruption news on rain days: ${plural(lineNews.length, "article")}`] : [])
      ],
      jobs: [
        ...(wetSt.length ? [{ who: l.who, en: `Pumps and sandbags at ${and(wetSt.slice(0, 3).map((s) => nice(s.name)))} before the rain` }] : []),
        ...shutList.slice(0, 2).filter(([, x]) => x.use).map(([n, x]) => ({ who: l.who, en: `If ${n} closes, announce ${x.use} as the station to use` })),
        ...(wetSt[0] && wetOf.get(wetSt[0].id)?.street ? [{ who: "GCC Storm Water Drains", en: `Clear the drains of ${wetOf.get(wetSt[0].id)!.street} by ${nice(wetSt[0].name)}` }] : [])
      ]
    });
  }
  sortItems(items);
  const rainList = rainsOf(events, items);
  const allMin = items.flatMap((x) => Object.values(x.byRain).map((h) => h.minutes ?? 0)).filter((m) => m >= 5);
  const avgMin = Math.round(avg(allMin));
  const perRain = Math.round(avg(rainList.map((r) => r.hit)));
  const shutAll = new Map<string, { n: number; use: string | null }>();
  for (const x of items) for (const h of Object.values(x.byRain)) for (const c of h.closed ?? []) shutAll.set(c.name, { n: (shutAll.get(c.name)?.n ?? 0) + 1, use: c.use });
  const topShut = [...shutAll.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  const worstLines = items.slice(0, 2);
  return {
    lens: "metro", asOf: now, rains: rainList, items, reports,
    kpis: [{ n: `${perRain} of ${items.length}`, label: "lines run late in a typical heavy rain" }, { n: `${avgMin} min`, label: "late, on average" },
      { n: closures.toLocaleString("en-IN"), label: "station closures in past rains" }],
    insights: [
      `In a heavy rain, trains run about ${avgMin} min late on ${perRain} of the ${items.length} lines.`,
      worstLines.length ? `Hit in the most rains: ${and(worstLines.map((x) => `${x.label} (${x.rains.length} of ${events.length})`))}.` : null,
      topShut.length ? `Stations closed most often: ${and(topShut.map(([n, x]) => `${n} (${x.n})${x.use ? `, use ${x.use}` : ""}`))}.` : null
    ].filter((x): x is string => !!x),
    sources: [
      { label: "Metro and suburban lines and stations", n: stations.length, kind: "open", note: t ? "ChennaiGTFS (CMRL and Southern Railway via CUMTA, ODbL)" : "Not found" },
      { label: "Rain-day delays and station closures by line", n: allMin.length + closures, kind: "generated", note: "Generated for the demo, seeded on the flood streets at each station: not published" },
      { label: "Water at station entrances (flood streets and waterlogging reports within 250 m)", n: [...wetOf.values()].filter((x) => x.rains.size).length, kind: "real", note: "The same record as Flooding" },
      { label: "Disruption news of rain days", n: news.length, kind: "real", note: "District news" }
    ],
    lift: null
  };
}

// -------------------------------------------------------------------- helpers --

const LAYERS = () => path.join(process.cwd(), "data", "layers");
interface GeoFeat { geometry: { coordinates: unknown }; properties: Record<string, any> }
function readLayer(id: string): GeoFeat[] {
  try { return JSON.parse(fs.readFileSync(path.join(LAYERS(), `${id}.geojson`), "utf8")).features ?? []; } catch { return []; }
}
function readTransit(): Transit | null {
  try { return JSON.parse(fs.readFileSync(path.join(LAYERS(), "transit.json"), "utf8")) as Transit; } catch { return null; }
}
