/**
 * Builds Ask the Map's World on the server: the store's incidents, wards, facilities and hotspots (fixed queries, never
 * built from a plan), the OpenStreetMap layers in data/layers, and the resolver's place list. The heavy part is cached
 * for the life of a store build; the Collector's decisions (which close or reopen incidents) are laid on top at every
 * question, with the same rule as the console (effective.ts), so a resolved incident leaves the map at once.
 */
import fs from "fs";
import path from "path";
import type { RowDataPacket } from "mysql2";
import intelPool, { TITLE, ops } from "@/lib/collector/db";
import { asOf, exportMeta } from "@/lib/collector/intel";
import { mapGeo } from "@/lib/collector/geo";
import { categories, enRe, gazetteerEntries, taRe } from "@/lib/collector/nlp";
import { isPinnable } from "@/lib/collector/mapplace";
import { effectiveStatus } from "@/lib/collector/effective";
import { bboxOf, haversineM, lineLengthM, type Bbox, type Pair } from "./geom";
import { normText } from "./execute";
import type { Entry, ResolverData } from "./resolve";
import { CAT_TA } from "./words";
import type { CondPlace, Hotspot, Inc, LayerMeta, LineFeat, LineLayer, NewsDoc, PointFeat, PointLayer, PolyFeat, Sev, WardGeo, Work, World } from "./types";

type Row = Record<string, any>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as Row[];
}

interface Base {
  key: string;
  incidents: Inc[];
  world: Omit<World, "now" | "incidents">;
  resolver: ResolverData;
}
declare global {
  // eslint-disable-next-line no-var
  var __askMapBase: { at: number; key: string; base: Promise<Base> } | undefined;
}

const LAYER_DIR = () => path.join(process.cwd(), "data", "layers");
/** raised when the way the world is built changes, so a running server rebuilds it */
const WORLD_VERSION = 7;

/** The OSM layer files' meta (counts, as-of, licence); empty when the layers were never built. */
export function osmMeta(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(path.join(LAYER_DIR(), "meta.json"), "utf8")).layers ?? {}; } catch { return {}; }
}
function readLayer(id: string): any[] {
  try { return JSON.parse(fs.readFileSync(path.join(LAYER_DIR(), `${id}.geojson`), "utf8")).features ?? []; } catch { return []; }
}

/** Store build key: a new build (or a reload) rebuilds the cached world. */
async function buildKey(): Promise<string> {
  const m = await exportMeta().catch(() => ({} as Record<string, string>));
  // a re-built layer set (npm run layers:build) counts as a new build too
  let layers = 0;
  try { layers = fs.statSync(path.join(LAYER_DIR(), "meta.json")).mtimeMs; } catch { /* no layers yet */ }
  return `${m.build_id ?? m.exported_at ?? "local"}|${layers}|${WORLD_VERSION}`;
}

const SEV_OK = new Set(["Severe", "High", "Medium", "Low"]);

async function loadBase(key: string): Promise<Base> {
  const [incRows, wardRows, facRows, hotRows, geo, asOfRows, newsRows, sigRows, workRows] = await Promise.all([
    q(`SELECT i.incident_id AS id, i.category_code AS cat, i.family, i.lead_dept AS dept, i.ward_no AS ward, i.zone_no AS zone, i.taluk_code AS taluk,
              i.lat, i.lon, i.loc_precision_m AS prec, i.place_text AS place, i.status_std AS status, i.is_open AS open, i.severity_level AS sev,
              i.priority_score AS priority, i.priority_reasons AS reasons, DATE_FORMAT(i.sla_due_at, '%Y-%m-%d %H:%i:%s') AS sla_due, i.sla_breached AS breached,
              DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS first, ${TITLE} AS title, i.citizen_complaints AS citizen, i.source_count AS sources,
              i.hotspot_id AS hotspot, i.vulnerable AS tags, i.outlet_count AS outlets
       FROM incidents i WHERE i.lat IS NOT NULL AND i.lon IS NOT NULL`),
    q(`SELECT ward_no, zone_no, zone_name, taluk_code, centroid_lat, centroid_lon, adjacent_wards, gi_star_z_30d FROM ref_wards ORDER BY ward_no`),
    q(`SELECT facility_id, type, name, lat, lon, in_district FROM ref_facilities WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY facility_id`),
    q(`SELECT hotspot_id, category_code, incidents, incidents_30d, open, lat, lon, wards, top_place FROM hotspots ORDER BY hotspot_id`),
    mapGeo(),
    q(`SELECT JSON_UNQUOTE(value) AS v FROM metrics WHERE metric = 'as_of'`).catch(() => [] as Row[]),
    // news articles about incidents in the district (public reporting: headline, outlet, link; no personal data)
    q(`SELECT doc_id, title, title_en, url, publisher, publisher_domain, DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS at, category_code, department, lat, lon, geo_level,
              place_text, linked_incident_id
       FROM documents WHERE is_district = 1 AND is_incident = 1 ORDER BY published_at DESC, doc_id`).catch(() => [] as Row[]),
    // live feeds with a place: the latest reading per place and metric, and PWD works with a site
    q(`SELECT metric, place_id, place_name, lat, lon, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i:%s') AS at, value, unit, zscore, anomaly, detail, days_to_full, source
       FROM observation_signals WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY place_id, metric`).catch(() => [] as Row[]),
    q(`SELECT work_id, work_title, work_type, asset_name, latitude, longitude, status, physical_progress_pct, progress_gap_pct,
              DATE_FORMAT(target_date, '%Y-%m-%d') AS target, office
       FROM pwd_works WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status <> 'completed' ORDER BY work_id`).catch(() => [] as Row[])
  ]);
  const incidents: Inc[] = incRows.map((r) => ({
    id: String(r.id), cat: String(r.cat ?? "OTHER"), family: String(r.family ?? "OTHER"), dept: String(r.dept ?? ""),
    ward: r.ward == null ? null : Number(r.ward), zone: r.zone == null ? null : Number(r.zone), taluk: r.taluk ?? null,
    lat: Number(r.lat), lon: Number(r.lon), prec: r.prec == null || r.prec === "" ? null : Number(r.prec), pinnable: isPinnable(r.lat, r.prec),
    place: r.place ?? null, status: String(r.status ?? ""), open: Number(r.open) === 1, sev: (SEV_OK.has(r.sev) ? r.sev : "Low") as Sev,
    priority: Number(r.priority) || 0, reasons: r.reasons ?? null, slaDue: r.sla_due ?? null, breached: Number(r.breached) === 1,
    first: String(r.first ?? ""), title: String(r.title ?? "Incident"), citizen: Number(r.citizen) || 0, sources: Number(r.sources) || 0, hotspot: r.hotspot ?? null,
    tags: r.tags ? String(r.tags) : null, outlets: Number(r.outlets) || 0
  }));
  const news: NewsDoc[] = newsRows.map((d) => ({
    id: String(d.doc_id), title: String(d.title ?? ""), title_en: d.title_en ? String(d.title_en) : null, url: /^https?:\/\//i.test(String(d.url ?? "")) ? String(d.url) : null,
    outlet: String(d.publisher ?? d.publisher_domain ?? "News"), at: String(d.at ?? ""), cat: d.category_code ?? null, dept: d.department ?? null,
    lat: d.lat == null ? null : Number(d.lat), lon: d.lon == null ? null : Number(d.lon), level: String(d.geo_level ?? "district"), place: d.place_text ?? null,
    inc: d.linked_incident_id ?? null
  }));
  const conds = condsOf(sigRows, workRows);

  const wardInfo = new Map(wardRows.map((w) => [Number(w.ward_no), w]));
  const wards: WardGeo[] = geo.wards.map((g) => {
    const w = wardInfo.get(g.ward);
    const pts = g.rings.flat().map(([lat, lon]) => ({ lat, lon }));
    return {
      ward: g.ward, zone: g.zone, zoneName: String(w?.zone_name ?? ""), taluk: g.taluk, rings: g.rings as Pair[][], bbox: bboxOf(pts)!,
      lat: Number(w?.centroid_lat ?? pts[0]?.lat), lon: Number(w?.centroid_lon ?? pts[0]?.lon),
      adj: String(w?.adjacent_wards ?? "").split("|").filter(Boolean).map(Number), gi30: w?.gi_star_z_30d == null ? null : Number(w.gi_star_z_30d)
    };
  });
  const district = wards.reduce<Bbox>((b, w) => ({ s: Math.min(b.s, w.bbox.s), w: Math.min(b.w, w.bbox.w), n: Math.max(b.n, w.bbox.n), e: Math.max(b.e, w.bbox.e) }),
    { s: 90, w: 180, n: -90, e: -180 });

  // ---- store facilities
  const STORE_KIND: Record<string, PointLayer> = {
    police_station: "police", lake: "lakes_store", river_gauge: "gauges", weather_station: "gauges", air_quality_station: "gauges",
    canal: "pwd_assets", drain: "pwd_assets", river_stretch: "pwd_assets", bund: "pwd_assets", sluice: "pwd_assets", bridge: "pwd_assets", gate_site: "pwd_assets"
  };
  const points = { schools: [], colleges: [], hospitals: [], fire_stations: [], police: [], rail_metro: [], osm_places: [], lakes_store: [], gauges: [], pwd_assets: [] } as Record<PointLayer, PointFeat[]>;
  for (const f of facRows) {
    const layer = STORE_KIND[String(f.type)];
    if (!layer) continue;
    points[layer].push({ id: `fac:${f.facility_id}`, layer, name: f.name ?? null, name_ta: null, lat: Number(f.lat), lon: Number(f.lon), kind: String(f.type),
      in_district: Number(f.in_district) === 1, ward: null });
  }
  // ---- OpenStreetMap points
  for (const layer of ["schools", "colleges", "hospitals", "fire_stations", "rail_metro", "osm_places"] as const) {
    for (const f of readLayer(layer)) {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      points[layer].push({ id: p.id, layer, name: p.name ?? null, name_ta: p.name_ta ?? null, alt: p.alt, lat, lon, kind: p.kind, government: p.government === true,
        in_district: !!p.in_district, ward: p.ward ?? null });
    }
  }
  // ---- roads and waterways: one feature per name where the pieces lie within 1.5 km of each other
  const lines = { roads: mergeLines(readLayer("roads"), "roads"), waterways: mergeLines(readLayer("waterways"), "waterways") } as Record<LineLayer, LineFeat[]>;
  const water: PolyFeat[] = readLayer("water_bodies").map((f) => {
    const polys = (f.geometry.coordinates as number[][][][]).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [lat, lon] as Pair)));
    const p = f.properties;
    return { id: p.id, layer: "water_bodies" as const, name: p.name ?? null, name_ta: p.name_ta ?? null, kind: p.kind, polys,
      bbox: bboxOf(polys.flat(2).map(([lat, lon]) => ({ lat, lon })))!, lat: p.center[1], lon: p.center[0], area_ha: p.area_ha, in_district: !!p.in_district, ward: p.ward ?? null };
  });

  const hotspots: Hotspot[] = hotRows.map((h) => ({ id: String(h.hotspot_id), cat: String(h.category_code), lat: Number(h.lat), lon: Number(h.lon), incidents: Number(h.incidents),
    incidents30: Number(h.incidents_30d), open: Number(h.open), wards: String(h.wards ?? "").split("|").filter(Boolean).map(Number), place: h.top_place ?? null }));

  const om = osmMeta();
  const meta: Record<string, LayerMeta> = {};
  const store = (id: string, n: string, ta: string, count: number): LayerMeta => ({ id: id as LayerMeta["id"], name_en: n, name_ta: ta, kind: "point", source: "District store",
    licence: "Government data", attribution: "District intelligence store", as_of: null, count });
  meta.police = store("police", "Police stations", "காவல் நிலையங்கள்", points.police.length);
  meta.lakes_store = store("lakes_store", "PWD lakes", "பொதுப்பணித்துறை ஏரிகள்", points.lakes_store.length);
  meta.gauges = store("gauges", "Gauges and stations", "அளவீட்டு நிலையங்கள்", points.gauges.length);
  meta.pwd_assets = store("pwd_assets", "PWD water works (points)", "பொதுப்பணி நீர்க் கட்டமைப்புகள்", points.pwd_assets.length);
  for (const id of ["schools", "colleges", "hospitals", "fire_stations", "rail_metro", "osm_places", "roads", "waterways", "water_bodies"]) {
    const m = om[id];
    if (m) meta[id] = { id: id as LayerMeta["id"], name_en: m.name_en, name_ta: m.name_ta, kind: m.kind, source: "OpenStreetMap", licence: m.licence, attribution: m.attribution,
      as_of: m.as_of, count: id === "roads" ? lines.roads.length : id === "waterways" ? lines.waterways.length : m.count };
  }

  const cats = new Map(categories().map((c) => [c.code, { label: c.label, label_ta: CAT_TA[c.code] ?? null, family: c.family, lead: c.lead }]));
  const deptRows = await q(`SELECT code, name FROM ref_departments`).catch(() => [] as Row[]);
  const depts = new Map(deptRows.map((d) => [String(d.code), { name: String(d.name) }]));
  const taluks = geo.taluks.map((t) => ({ ...t, name_ta: null as string | null }));

  const resolver = await resolverData(points, lines, water);
  const nameTa = new Map(resolver.entries.filter((e) => e.kind === "taluk").map((e) => [e.ref.slice(6), e.name_ta]));
  for (const t of taluks) t.name_ta = nameTa.get(t.code) ?? null;
  const dataAsOf = asOfRows[0]?.v ? String(asOfRows[0].v).slice(0, 19).replace("T", " ") : "";
  return {
    key, incidents, resolver,
    world: { dataAsOf, news, conds, points, lines, water, wards, zones: geo.zones.map((z) => ({ zone: z.zone, name: z.name, lat: z.lat, lon: z.lon })), taluks, hotspots, meta, cats, depts, district }
  };
}

/** What a place measures, from its metrics: lake levels make a lake, AQI an air station, bed figures a hospital ... */
function condKind(metrics: string[], source: string): CondPlace["kind"] | null {
  if (metrics.includes("imd_warning_level")) return "weather";
  if (metrics.some((m) => m.startsWith("lake_"))) return "lake";
  if (metrics.includes("aqi")) return "air";
  if (metrics.includes("reservoir_inflow_cusec")) return "reservoir";
  if (source === "hospital" || metrics.includes("bed_occupancy_pct")) return "hospital";
  if (metrics.some((m) => m.startsWith("rainfall") || m.startsWith("temp_") || m === "humidity_pct")) return "rain";
  return null;
}
/** The live feeds as places with their latest readings, and the PWD works still to finish. */
export function condsOf(sigRows: Row[], workRows: Row[]): { places: CondPlace[]; works: Work[] } {
  const byPlace = new Map<string, Row[]>();
  for (const r of sigRows) (byPlace.get(String(r.place_id)) ?? byPlace.set(String(r.place_id), []).get(String(r.place_id))!).push(r);
  const places: CondPlace[] = [];
  for (const [id, rs] of byPlace) {
    const kind = condKind(rs.map((r) => String(r.metric)), String(rs[0].source ?? ""));
    if (!kind) continue;
    const m: CondPlace["m"] = {};
    for (const r of rs) m[String(r.metric)] = { v: Number(r.value), unit: String(r.unit ?? ""), z: r.zscore == null ? null : Number(r.zscore), anomaly: Number(r.anomaly) === 1,
      detail: r.detail ? String(r.detail) : null, full: r.days_to_full == null ? null : Number(r.days_to_full) };
    places.push({ id, kind, name: String(rs[0].place_name ?? id), lat: Number(rs[0].lat), lon: Number(rs[0].lon), at: rs.map((r) => String(r.at ?? "")).sort().at(-1) ?? "",
      source: String(rs[0].source ?? ""), m });
  }
  const works: Work[] = workRows.map((r) => ({
    id: String(r.work_id), title: String(r.work_title ?? r.work_type ?? "PWD work"), type: String(r.work_type ?? ""), asset: r.asset_name ?? null,
    lat: Number(r.latitude), lon: Number(r.longitude), status: String(r.status ?? ""), progress: r.physical_progress_pct == null ? null : Number(r.physical_progress_pct),
    gap: r.progress_gap_pct == null ? null : Number(r.progress_gap_pct), target: r.target ?? null, office: r.office ?? null
  }));
  return { places, works };
}

/** Joins OSM line features of the same name whose pieces lie within 1.5 km of each other (gaps where a way has no name). */
const MAJOR = new Set(["motorway", "trunk", "primary", "secondary"]);
/** "Anna Salai (Mount Road)" -> "anna salai"; "Buckingham Kaalvaai" -> "buckingham canal": the name the pieces share. */
export function baseName(name: string): string {
  return normText(name.replace(/\(.*?\)/g, " ")).replace(/\b(kaalvaai|kalvai|kaalvai|kalvaai)\b/g, "canal").trim();
}
function mergeLines(feats: any[], layer: LineLayer): LineFeat[] {
  const byName = new Map<string, any[]>();
  for (const f of feats) {
    const b = baseName(String(f.properties.name ?? ""));
    if (!b) continue;
    // a main road and a residential street of the same name are different roads
    const k = `${MAJOR.has(f.properties.class) || layer === "waterways" ? "major" : "minor"}|${b}`;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(f);
  }
  const out: LineFeat[] = [];
  for (const [key, fs] of byName) {
    const k = key.split("|")[1] + (key.startsWith("minor") && byName.has(`major|${key.split("|")[1]}`) ? " street" : "");
    const parts = fs.map((f) => ({ f, lines: (f.geometry.coordinates as number[][][]).map((l) => l.map(([lon, lat]) => [lat, lon] as Pair)) }));
    const parent = parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const ends = parts.map((p) => p.lines.flatMap((l) => [l[0], l[l.length - 1]]));
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++)
        if (find(i) !== find(j) && ends[i].some((a) => ends[j].some((b) => haversineM({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) <= 1500))) parent[find(i)] = find(j);
    const groups = new Map<number, typeof parts>();
    parts.forEach((p, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(p));
    let n = 0;
    for (const g of [...groups.values()].sort((a, b) => b.reduce((s, p) => s + p.lines.length, 0) - a.reduce((s, p) => s + p.lines.length, 0))) {
      n++;
      const all = g.flatMap((p) => p.lines);
      // the longest piece names the road ("Anna Salai (Mount Road)", not a 50 m stub)
      const props = g.map((p) => p.f.properties).sort((a, b) => (b.length_m ?? 0) - (a.length_m ?? 0));
      out.push({
        id: `${layer === "roads" ? "road" : "water"}:${k.replace(/[^a-z0-9஀-௿]+/g, "-")}${groups.size > 1 ? `~${n}` : ""}`, layer, name: props[0].name,
        name_ta: props.map((p) => p.name_ta).find(Boolean) ?? null,
        alt: [...new Set(props.flatMap((p) => [p.name, ...(p.alt ?? [])]))].filter((a) => normText(a) !== normText(props[0].name)) as string[],
        kind: props[0].class ?? props[0].kind ?? layer, ref: props.map((p) => p.ref).find(Boolean) ?? null, lines: all,
        bbox: bboxOf(all.flat().map(([lat, lon]) => ({ lat, lon })))!, length_m: Math.round(all.reduce((s, l) => s + lineLengthM(l), 0)),
        wards: [...new Set(props.flatMap((p) => p.wards ?? []))].sort((a, b) => a - b) as number[], in_district: props.some((p) => p.in_district)
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Well-known short names for Chennai's main roads, which OSM may not carry as alt names. */
const ROAD_ALIASES: [string[], RegExp][] = [
  [["Mount Road", "அண்ணா சாலை", "Anna Salai"], /^anna salai$/],
  [["OMR", "Old Mahabalipuram Road", "IT Corridor", "IT Expressway"], /^(rajiv gandhi salai|old mahabalipuram road)$/],
  [["GST Road", "GST", "Grand Southern Trunk Road", "ஜிஎஸ்டி சாலை"], /^(grand southern trunk road|gst road)$/],
  [["ECR", "East Coast Road", "கிழக்கு கடற்கரை சாலை"], /^east coast road$/],
  [["Poonamallee High Road", "PH Road", "பூந்தமல்லி நெடுஞ்சாலை"], /^(poonamallee high road|periyar e ?v ?r (high road|salai)|e ?v ?r periyar salai)$/],
  [["100 Feet Road", "Inner Ring Road", "Jawaharlal Nehru Road"], /^(jawaharlal nehru (road|salai)|inner ring road|100 feet road)$/],
  [["Kamarajar Salai", "Beach Road", "காமராஜர் சாலை"], /^kamarajar salai$/],
  [["Arcot Road", "ஆற்காடு சாலை"], /^arcot road$/],
  [["Sardar Patel Road", "SP Road"], /^sardar patel road$/],
  [["Buckingham Canal", "Buckingham Kaalvaai", "பக்கிங்ஹாம் கால்வாய்"], /^buckingham canal$/],
  [["Adyar River", "அடையாறு ஆறு", "அடையாறு நதி"], /^adyar (river|aaru)$/],
  [["Cooum River", "Cooum", "கூவம்", "கூவம் ஆறு"], /^(cooum( river)?|கூவம் ஆறு)$/],
  [["Otteri Nullah", "ஓட்டேரி நல்லா"], /^otteri nul?lah?$/]
];

/** Everyday names for well-known stations and terminals, on the OSM feature of that name. */
const FACILITY_ALIASES: [RegExp, string[]][] = [
  [/^koyambedu mofussil bus terminal$/i, ["Koyambedu bus stand", "Koyambedu bus terminus", "CMBT", "Koyambedu bus stop", "கோயம்பேடு பேருந்து நிலையம்"]],
  [/^puratchi thalaivar dr\.? m\.? ?g\.? ?ramachandran central$/i, ["Chennai Central", "Central station", "Central railway station", "சென்ட்ரல் ரயில் நிலையம்"]],
  [/^chennai egmore$/i, ["Egmore station", "Egmore railway station", "எழும்பூர் ரயில் நிலையம்"]]
];
const LOCALITY_ALIASES: Record<string, string[]> = {
  "Marina Beach": ["Marina", "மெரினா"], "George Town": ["Georgetown"], Parrys: ["Parrys Corner", "Parry's Corner"], "K.K. Nagar": ["KK Nagar"]
};

async function resolverData(points: Record<PointLayer, PointFeat[]>, lines: Record<LineLayer, LineFeat[]>, water: PolyFeat[]): Promise<ResolverData> {
  const entries: Entry[] = [];
  const gaz = await gazetteerEntries().catch(() => []);
  const locNames = new Set<string>();
  const byName = new Map<string, Entry>();
  for (const g of gaz) {
    const kind = g.kind === "area" ? "locality" : g.kind;
    const ref = kind === "zone" ? `zone:${g.zone}` : kind === "taluk" ? `taluk:${g.taluk}` : `loc:${g.name}`;
    const k = `${kind}|${ref}`;
    const tamil = /[஀-௿]/.test(g.re.source);
    const e = byName.get(k);
    if (e) { e.res.push(g.re); continue; }
    const entry: Entry = { kind, ref, name_en: g.name, name_ta: null, lat: g.lat, lon: g.lon, res: [g.re] };
    if (tamil) entry.name_ta = null;
    byName.set(k, entry);
    entries.push(entry);
    if (kind === "locality") locNames.add(normText(g.name));
  }
  // Tamil names for gazetteer places, for the chips and answers (the patterns carry only stems)
  try {
    const ref = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gcc-reference", "intel-reference.json"), "utf8"));
    for (const p of ref.places ?? []) {
      const e = byName.get(`${p.kind === "locality" ? "locality" : p.kind}|${p.kind === "zone" ? `zone:${p.zone}` : p.kind === "locality" ? `loc:${p.name}` : ""}`);
      if (e && p.aliases_ta?.length) e.name_ta = p.aliases_ta[0];
    }
    for (const t of ref.taluks ?? []) { const e = byName.get(`taluk|taluk:${t.code}`); if (e && t.name_ta) e.name_ta = t.name_ta; }
  } catch { /* no Tamil names */ }

  for (const p of points.osm_places) {
    if (!p.name || locNames.has(normText(p.name)) || p.name.length < 4) continue;
    entries.push({ kind: "osm_place", ref: `osm:${p.id.slice(4)}`, name_en: p.name, name_ta: p.name_ta, lat: p.lat, lon: p.lon, layer: "osm_places",
      res: [enRe(p.name), ...(p.name_ta ? [taRe(p.name_ta)] : [])] });
  }
  const GENERIC = /^(hospital|school|clinic|college|police station|fire station|station|government school|corporation school|primary school)$/i;
  for (const layer of ["hospitals", "colleges", "fire_stations", "rail_metro", "police", "schools"] as const) {
    for (const p of points[layer]) {
      if (!p.name || p.name.length < 6 || GENERIC.test(p.name.trim())) continue;
      if (layer === "hospitals" && p.kind === "clinic" && !p.government) continue;
      const known = FACILITY_ALIASES.filter(([re]) => re.test(p.name!)).flatMap(([, a]) => a);
      const names = [p.name, ...(p.alt ?? []), ...known].filter((n) => n.length >= 4 && !GENERIC.test(n.trim()));
      entries.push({ kind: "facility", ref: p.id.startsWith("fac:") ? p.id : `osm:${p.id.slice(4)}`, name_en: known.length && !/[஀-௿]/.test(known[0]) ? known[0] : p.name,
        name_ta: p.name_ta ?? known.find((x) => /[஀-௿]/.test(x)) ?? null, lat: p.lat, lon: p.lon, layer,
        res: [...names.map((x) => (/[஀-௿]/.test(x) ? taRe(x) : enRe(x))), ...(p.name_ta ? [taRe(p.name_ta)] : [])] });
    }
  }
  // the short names people use for gazetteer places ("Marina" for Marina Beach)
  for (const [name, al] of Object.entries(LOCALITY_ALIASES)) {
    const e = byName.get(`locality|loc:${name}`);
    if (e) e.res.push(...al.map((x) => (/[஀-௿]/.test(x) ? taRe(x) : enRe(x))));
  }
  for (const layer of ["roads", "waterways"] as const) {
    for (const l of lines[layer]) {
      const b = baseName(l.name);
      // a bracketed second name ("Anna Salai (Mount Road)"), never a bare direction or qualifier ("(North)", "(Extension)")
      const inner = [...l.name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim())
        .filter((x) => x.length >= 6 && !/^(north|south|east|west|main|old|new|extn\.?|extension|part \w+|phase \w+|service road|upper|lower)$/i.test(x));
      const extra = ROAD_ALIASES.filter(([, re]) => re.test(b) || re.test(normText(l.name))).flatMap(([a]) => a);
      // the road's own names first: they outrank a name another road carries as an alternative
      const primary = [...new Set([l.name, l.name.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(), ...inner, ...extra, ...(l.name_ta ? [l.name_ta] : [])])]
        .filter((x) => x && x.length >= 3);
      const refs = (l.ref ?? "").split(";").map((s) => s.trim()).filter((s) => /^[A-Z]{2,4}[- ]?\d*$/i.test(s) && !/^(NH|SH|MDR|SHU)\d*$/i.test(s));
      const others = [...new Set([...l.alt, ...refs])].filter((x) => x && x.length >= 3 && !primary.includes(x));
      const names = [...primary, ...others];
      entries.push({ kind: layer === "roads" ? "road" : "waterway", ref: l.id, name_en: l.name, name_ta: l.name_ta ?? extra.find((x) => /[஀-௿]/.test(x)) ?? null,
        lat: null, lon: null, layer, res: names.map((x) => (/[஀-௿]/.test(x) ? taRe(x) : enRe(x))), primary: primary.length,
        weight: l.length_m * (MAJOR.has(l.kind) || layer === "waterways" ? 10 : 1) });
    }
  }
  for (const f of water) {
    if (!f.name || f.name.length < 5) continue;
    entries.push({ kind: "facility", ref: f.id.startsWith("osm:") ? f.id : `osm:${f.id}`, name_en: f.name, name_ta: f.name_ta, lat: f.lat, lon: f.lon, layer: "water_bodies",
      res: [enRe(f.name), ...(f.name_ta ? [taRe(f.name_ta)] : [])] });
  }
  const streets = new Map<string, string>();
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gcc-reference", "streets.json"), "utf8"));
    for (const x of s.streets ?? []) {
      const name = String(x.name ?? "").trim();
      if (name.length < 6) continue;
      const k = normText(name);
      if (!streets.has(k)) streets.set(k, name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()));
    }
  } catch { /* no street list */ }
  return { entries, streets };
}

/** The world for one question: the cached base with the Collector's latest decisions laid on top, and the console's "now". */
export async function world(): Promise<{ world: World; resolver: ResolverData }> {
  const key = await buildKey();
  const g = global.__askMapBase;
  if (!g || g.key !== key) global.__askMapBase = { at: Date.now(), key, base: loadBase(key) };
  let base: Base;
  try { base = await global.__askMapBase!.base; } catch (e) { global.__askMapBase = undefined; throw e; }
  const [now, decided, routedRows] = await Promise.all([
    asOf(),
    q(`SELECT incident_id, decision FROM ${ops("collector_decisions")} WHERE decision <> 'note' ORDER BY decision_id`).catch(() => [] as Row[]),
    q(`SELECT DISTINCT incident_id FROM ${ops("dept_assignments")}`).catch(() => [] as Row[])
  ]);
  const latest = new Map<string, string>();
  for (const d of decided) latest.set(String(d.incident_id), String(d.decision));
  const routed = new Set(routedRows.map((r) => String(r.incident_id)));
  const incidents = latest.size || routed.size
    ? base.incidents.map((i) => {
      const d = latest.get(i.id);
      const r = routed.has(i.id);
      if (!d && !r) return i;
      const e = d ? effectiveStatus(i.open ? 1 : 0, i.status, d) : { open: i.open ? 1 : 0, status: i.status };
      return { ...i, open: e.open === 1, status: e.status, routed: r };
    })
    : base.incidents;
  return { world: { ...base.world, now, incidents }, resolver: base.resolver };
}
