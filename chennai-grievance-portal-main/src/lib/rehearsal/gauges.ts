/**
 * Rain from every working CFM-DSS rain gauge in and around Chennai, not just IMD's four stations.
 *
 * Where the gauges are, and what they measured: the Chennai Flood Monitor (TN Water Resources Department's CFM-DSS) runs a
 * public GeoServer (the one its own map loads) at https://chennaifloodmonitor.tn.gov.in/geohorr/ChennaiDSS/ows. Two of its
 * layers answer plain WFS requests:
 *   ChennaiDSS:argsqllayer      every automatic rain gauge (ARG) with its id, name, agency, latitude, longitude and ward;
 *                               only id, name, agency, district, place, ward and "active" are read (the layer also carries
 *                               officers' names and phone numbers, which are never requested);
 *   ChennaiDSS:arg_transaction  each gauge's 15-minute rain (mm in the 15 minutes ending at combined_datetime, UTC).
 * Checked on 28 Nov 2026: 151 gauge places lie in Chennai district (TNDRRA, GCC, CMWSSB and IMD sites); 63 are active (the
 * same 63 the site's GetARGStationData lists for Chennai) and the 15-minute rain goes back before April 2026. The
 * site's own history endpoints (GetARGHistoricaldatafordashboard and the like) refuse programs (HTTP 403) and are not
 * called. A gauge's rain day is the IMD one: 08:30 IST that day to 08:30 the next.
 *
 * The cache (data/aws-cache/cfm-rain.json, written by scripts/fetch-cfm-rain.ts and topped up here at most every 3 hours)
 * keeps, for each rain day and gauge, whether the gauge reported (4 sample times a day) and its rain in each hour from
 * 08:30. Rain for a ward or a street is worked out from the gauges that reported (idw below). Pure parts are tested in
 * gauges.test.ts.
 */
import fs from "fs";
import path from "path";

export const GEO_WFS = "https://chennaifloodmonitor.tn.gov.in/geohorr/ChennaiDSS/ows";
export const GAUGE_SOURCE = "Chennai Flood Monitor (TN WRD CFM-DSS) automatic rain gauges";
export const CACHE_FILE = () => process.env.CFM_RAIN_FILE || path.join(process.cwd(), "data", "aws-cache", "cfm-rain.json");
/** gauges this far outside the wards still count (rain at the district's edge) */
export const EDGE_KM = 6;
/** inverse-distance weighting: power, nearest gauges used, farthest gauge used */
export const IDW_POWER = 2, IDW_NEAREST = 8, IDW_MAX_KM = 12;
/** a 15-minute reading above this is a gauge fault, not rain (Chennai's wettest 15 minutes on record are well below it) */
export const MAX_15MIN_MM = 60;
/** the four sample times (IST) that show a gauge was reporting on a day */
export const SAMPLE_TIMES = ["02:00", "08:00", "14:00", "20:00"];

/** a district average needs at least this many gauges reporting (the network has about 75): fewer cannot tell the district's rain */
export const MIN_GAUGES = 20;
/** IMD's "heavy rain" mark for one station in one day (mm), and the district average below which a day was not a heavy-rain day */
export const IMD_HEAVY_MM = 64.5, DRY_MEAN_MM = 15;

/**
 * The gauges that can be trusted for Chennai. The CFM layer places four Chengalpattu gauges (CGL... ids: Pavunjur, Palur, Karunguzhi,
 * Kavathur) at the exact coordinates of four Chennai gauges, and their readings disagree with them (Pavunjur 325 mm vs Kosapur 81 mm over
 * the same 90 days), so their points are wrong. Rule: a gauge whose id names another district (CGL Chengalpattu, KPM Kancheepuram,
 * TLR Tiruvallur) but falls inside the 200 wards is a mislocated point and is dropped; and of two gauges within 30 m of each other,
 * only the Chennai one (else the first by id) is kept. (Chennai's own gauges have CHN... or ARG... ids.)
 */
const OTHER_DISTRICT_ID = /^(CGL|KPM|TLR|RNP|VLR)/i;
export function trustedGauges<T extends { id: string; lat: number; lon: number; inChennai: boolean }>(gauges: T[]): T[] {
  const chn = (g: T) => !OTHER_DISTRICT_ID.test(g.id);
  const kept = gauges.filter((g) => chn(g) || !g.inChennai).sort((a, b) => Number(chn(b)) - Number(chn(a)) || a.id.localeCompare(b.id));
  const out: T[] = [];
  for (const g of kept) {
    if (out.some((o) => Math.abs(o.lat - g.lat) < 0.0003 && Math.abs(o.lon - g.lon) < 0.0003)) continue;
    out.push(g);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface RainGauge {
  /** the gauge's id at CFM-DSS (argid), e.g. CHN10Z128W33 */
  id: string;
  name: string;
  lat: number;
  lon: number;
  ward: number | null;
  agency: string;
  district: string;
  /** inside the Corporation's 200 wards (Chennai district) */
  inChennai: boolean;
}

/** one gauge on one rain day: sample times seen (0-4) and rain per hour from 08:30 (hour k = 08:30 + k h), only hours with rain */
export interface GaugeDay { p: number; h?: Record<string, number> }

export interface RainCache {
  version: 1;
  source: string;
  url: string;
  fetchedAt: string;
  gauges: RainGauge[];
  /** rain day "YYYY-MM-DD" (08:30 that day to 08:30 the next) -> gauge id -> its day; a day in `days` with no entry for a gauge: it did not report */
  rain: Record<string, Record<string, GaugeDay>>;
  /** rain days read so far */
  days: string[];
  /** readings dropped as gauge faults */
  dropped: number;
}

// ---------------------------------------------------------------- pure parts --

const RAD = Math.PI / 180;
export const kmBetween = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((aLon - bLon) * 111.32 * Math.cos(((aLat + bLat) / 2) * RAD), (aLat - bLat) * 110.574);

export interface GaugeValue { id: string; lat: number; lon: number; mm: number }

/**
 * Rain at a point by inverse-distance weighting: the nearest IDW_NEAREST gauges within IDW_MAX_KM, each weighted by
 * 1 / distance^IDW_POWER; a gauge within 50 m gives its own value. Null when no gauge is near enough.
 */
export function idw(values: GaugeValue[], lat: number, lon: number, o: { power?: number; nearest?: number; maxKm?: number } = {}): { mm: number; n: number; nearestKm: number } | null {
  const power = o.power ?? IDW_POWER, nearest = o.nearest ?? IDW_NEAREST, maxKm = o.maxKm ?? IDW_MAX_KM;
  const near = values.map((v) => ({ v, d: kmBetween(lat, lon, v.lat, v.lon) })).filter((x) => x.d <= maxKm).sort((a, b) => a.d - b.d || a.v.id.localeCompare(b.v.id)).slice(0, nearest);
  if (!near.length) return null;
  if (near[0].d < 0.05) return { mm: near[0].v.mm, n: 1, nearestKm: near[0].d };
  let w = 0, s = 0;
  for (const x of near) { const k = 1 / x.d ** power; w += k; s += k * x.v.mm; }
  return { mm: s / w, n: near.length, nearestKm: near[0].d };
}

/** rain days from a day to a day, inclusive */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** the rain day running now (it starts at 08:30 IST) */
export const currentRainDay = (ms = Date.now()) => new Date(ms + 330 * 60_000 - 510 * 60_000).toISOString().slice(0, 10);

/** The rain days a rain covers: from the day before its first day (08:30) to 08:30 the day after its last, so both ways of naming a rain day are inside. */
export const rainWindow = (start: string, end: string) => dayRange(addDays(start, -1), end);

export interface RainTotals {
  /** gauges that reported on most of the window's days */
  gauges: { id: string; name: string; lat: number; lon: number; ward: number | null; inChennai: boolean; mm: number; peakMm: number; peakAt: string | null }[];
  /** the window's days that are in the cache */
  daysRead: number;
  daysWanted: number;
}

/**
 * Each gauge's rain over the window (rain days), with its wettest hour. A gauge counts when it reported (3 or 4 of the 4
 * sample times) on at least three quarters of the window's days that were read; a gauge that was off is left out, never
 * read as dry.
 */
export function rainTotals(c: Pick<RainCache, "gauges" | "rain" | "days">, days: string[]): RainTotals {
  const read = days.filter((d) => c.days.includes(d));
  const out: RainTotals["gauges"] = [];
  if (!read.length) return { gauges: out, daysRead: 0, daysWanted: days.length };
  for (const g of trustedGauges(c.gauges)) {
    let on = 0, mm = 0, peakMm = 0, peakAt: string | null = null;
    for (const d of read) {
      const x = c.rain[d]?.[g.id];
      if (!x || x.p < 3) continue;
      on++;
      for (const [k, v] of Object.entries(x.h ?? {})) {
        mm += v;
        if (v > peakMm) {
          peakMm = v;
          const t = new Date(Date.parse(d + "T08:30:00Z") + Number(k) * 3_600_000).toISOString();
          peakAt = `${t.slice(0, 10)} ${t.slice(11, 16)}`;
        }
      }
    }
    // a gauge counts only when it reported on EVERY day read: a missed day is unknown rain, never 0 mm
    if (on < read.length) continue;
    out.push({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, ward: g.ward, inChennai: g.inChennai, mm: Math.round(mm * 10) / 10, peakMm: Math.round(peakMm * 10) / 10, peakAt });
  }
  return { gauges: out, daysRead: read.length, daysWanted: days.length };
}

export interface WardPoint { ward: number; lat: number; lon: number; areaKm2: number }

export interface RainSummary {
  source: string;
  /** gauges used, and of them inside the wards */
  gauges: number;
  inChennai: number;
  /** the district's rain: wards' rain weighted by their area (mm); null when fewer than MIN_GAUGES reported (`few`) */
  mean: number | null;
  /** too few gauges reported to give a district figure (the September gap: 5-6 of about 75) */
  few: boolean;
  /**
   * enough gauges reported and they show NO heavy rain: the district average under DRY_MEAN_MM and no gauge at IMD's heavy-rain mark
   * (64.5 mm in the day). Such a day came from the pipeline's day list, not from the gauges, and is labelled so on screen.
   */
  dry: boolean;
  wettest: { id: string; name: string; mm: number } | null;
  /** the most rain in one hour at any gauge (mm), when and where */
  peak: { id: string; name: string; mm: number; at: string } | null;
  /** each ward's rain (mm, one decimal) */
  wards: { ward: number; mm: number }[];
  window: { from: string; to: string; daysRead: number; daysWanted: number };
  method: string;
}

export const IDW_METHOD = `Each ward's rain is worked out at its centre by inverse-distance weighting of the gauges that reported: the nearest ${IDW_NEAREST} gauges within ${IDW_MAX_KM} km, each weighted by one over the distance squared. The district figure is the wards' rain weighted by ward area. A rain counts from 08:30 the day before its first day to 08:30 the day after its last.`;

/** a rain's rain over the district from the gauges (null when the cache has none of its days) */
export function rainSummary(c: Pick<RainCache, "gauges" | "rain" | "days">, start: string, end: string, wards: WardPoint[], minGauges = MIN_GAUGES): RainSummary | null {
  const days = rainWindow(start, end);
  const t = rainTotals(c, days);
  if (!t.daysRead || !t.gauges.length) return null;
  const vals: GaugeValue[] = t.gauges.map((g) => ({ id: g.id, lat: g.lat, lon: g.lon, mm: g.mm }));
  const wardMm: { ward: number; mm: number }[] = [];
  let sw = 0, s = 0;
  for (const w of wards) {
    const r = idw(vals, w.lat, w.lon);
    if (!r) continue;
    wardMm.push({ ward: w.ward, mm: Math.round(r.mm * 10) / 10 });
    sw += w.areaKm2; s += w.areaKm2 * r.mm;
  }
  const wet = t.gauges.reduce<RainTotals["gauges"][number] | null>((m, g) => (!m || g.mm > m.mm || (g.mm === m.mm && g.id < m.id) ? g : m), null);
  const pk = t.gauges.filter((g) => g.peakAt).reduce<RainTotals["gauges"][number] | null>((m, g) => (!m || g.peakMm > m.peakMm ? g : m), null);
  const few = t.gauges.length < minGauges;
  const mean = sw && !few ? Math.round((s / sw) * 10) / 10 : null;
  const dry = mean != null && mean < DRY_MEAN_MM && (wet?.mm ?? 0) < IMD_HEAVY_MM;
  return {
    source: GAUGE_SOURCE, gauges: t.gauges.length, inChennai: t.gauges.filter((g) => g.inChennai).length,
    mean, few, dry,
    wettest: wet ? { id: wet.id, name: wet.name, mm: wet.mm } : null,
    peak: pk && pk.peakAt ? { id: pk.id, name: pk.name, mm: pk.peakMm, at: pk.peakAt } : null,
    wards: few ? [] : wardMm.sort((a, b) => a.ward - b.ward), window: { from: days[0], to: addDays(days[days.length - 1], 1), daysRead: t.daysRead, daysWanted: t.daysWanted },
    method: IDW_METHOD
  };
}

/** 15-minute readings (UTC end time) -> rain days with hourly totals from 08:30 IST; faults above MAX_15MIN_MM are dropped */
export function bucketReadings(rows: { id: string; at: string; mm: number }[]): { rain: Record<string, Record<string, Record<string, number>>>; dropped: number } {
  const rain: Record<string, Record<string, Record<string, number>>> = {};
  const seen = new Set<string>();
  let dropped = 0;
  for (const r of rows) {
    const k = `${r.id}|${r.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!(r.mm > 0)) continue;
    if (r.mm > MAX_15MIN_MM) { dropped++; continue; }
    // the 15 minutes ending at `at`: their start, in IST, minus 08:30, gives the rain day and the hour from 08:30
    const start = Date.parse(r.at) - 15 * 60_000 + 330 * 60_000 - 510 * 60_000;
    const day = new Date(start).toISOString().slice(0, 10);
    const hour = Math.floor((start - Date.parse(day + "T00:00:00Z")) / 3_600_000);
    const d = (rain[day] ??= {});
    const g = (d[r.id] ??= {});
    g[hour] = Math.round(((g[hour] ?? 0) + r.mm) * 100) / 100;
  }
  return { rain, dropped };
}

/** sample-time readings (UTC) -> rain day -> gauge -> sample times seen */
export function presenceOf(rows: { id: string; at: string }[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.id}|${r.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const day = new Date(Date.parse(r.at) + 330 * 60_000 - 510 * 60_000).toISOString().slice(0, 10);
    const d = (out[day] ??= {});
    d[r.id] = (d[r.id] ?? 0) + 1;
  }
  return out;
}

/** merges freshly read days into the cache (a day read again replaces the old one) */
export function mergeDays(c: RainCache, days: string[], presence: Record<string, Record<string, number>>, rain: Record<string, Record<string, Record<string, number>>>, dropped: number): RainCache {
  const out: RainCache = { ...c, rain: { ...c.rain }, days: [...new Set([...c.days, ...days])].sort(), dropped: (c.dropped ?? 0) + dropped };
  for (const d of days) {
    const day: Record<string, GaugeDay> = {};
    for (const [id, p] of Object.entries(presence[d] ?? {})) day[id] = { p: Math.min(4, p) };
    for (const [id, h] of Object.entries(rain[d] ?? {})) day[id] = { p: day[id]?.p ?? 0, h };
    out.rain[d] = day;
  }
  return out;
}

// ---------------------------------------------------------------- reading the gauges --

const UA = "DistrictIQ/1.0 (Chennai Collector dashboard; reads the Chennai Flood Monitor's public rain gauge layer)";

async function wfs(type: string, cql: string | null, props: string, extra: Record<string, string> = {}): Promise<{ features: { properties: Record<string, any> }[]; numberMatched?: number }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: type, outputFormat: "application/json", propertyName: props, ...extra });
  if (cql) q.set("CQL_FILTER", cql);
  const r = await fetch(`${GEO_WFS}?${q}`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`CFM-DSS GeoServer: HTTP ${r.status}`);
  const t = await r.text();
  if (!t.startsWith("{")) throw new Error(`CFM-DSS GeoServer: ${t.replace(/\s+/g, " ").slice(0, 200)}`);
  return JSON.parse(t);
}

/** every page of a query, 10,000 rows a page, a second apart */
async function wfsAll(type: string, cql: string, props: string): Promise<Record<string, any>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let start = 0; ; start += 10_000) {
    const j = await wfs(type, cql, props, { count: "10000", startIndex: String(start), sortBy: "objectid" });
    out.push(...j.features.map((f) => f.properties));
    if (j.features.length < 10_000) return out;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * The active gauges in and near Chennai, with their places (inside: a test against the 200 ward polygons). `inWards` is the
 * caller's point-in-wards test; `near` keeps gauges up to EDGE_KM outside.
 */
export async function readGauges(inWards: (lat: number, lon: number) => boolean, nearWards: (lat: number, lon: number) => number): Promise<RainGauge[]> {
  const j = await wfs("ChennaiDSS:argsqllayer", "isactive=true", "argid,stationname,agency,district,latitude,longitude,ward");
  const out: RainGauge[] = [];
  const seen = new Set<string>();
  for (const f of j.features) {
    const p = f.properties;
    const lat = Number(p.latitude), lon = Number(p.longitude);
    if (!p.argid || !Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(p.argid)) continue;
    const inside = inWards(lat, lon);
    if (!inside && nearWards(lat, lon) > EDGE_KM) continue;
    seen.add(p.argid);
    out.push({ id: String(p.argid), name: String(p.stationname ?? p.argid).trim(), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5,
      ward: inside && p.ward != null ? Number(p.ward) : null, agency: String(p.agency ?? ""), district: String(p.district ?? ""), inChennai: inside });
  }
  return trustedGauges(out);
}

/** reads rain days [from .. to] for the gauges: their rain (readings above 0) and whether they reported (the sample times) */
export async function readDays(gauges: RainGauge[], from: string, to: string): Promise<{ days: string[]; presence: Record<string, Record<string, number>>; rain: Record<string, Record<string, Record<string, number>>>; dropped: number }> {
  const ids = gauges.map((g) => `'${g.id.replace(/'/g, "")}'`).join(",");
  // rain day D runs from 08:30 IST (03:00 UTC) on D; a reading is stamped with the end of its 15 minutes
  const t0 = `${from}T03:00:00Z`, t1 = `${addDays(to, 1)}T03:00:00Z`;
  const when = `combined_datetime>'${t0}' AND combined_datetime<='${t1}' AND argid IN (${ids})`;
  const wet = await wfsAll("ChennaiDSS:arg_transaction", `rainfall>0 AND ${when}`, "argid,rainfall,combined_datetime");
  await new Promise((r) => setTimeout(r, 1000));
  const seen = await wfsAll("ChennaiDSS:arg_transaction", `time_of_measurement IN (${SAMPLE_TIMES.map((x) => `'${x}'`).join(",")}) AND ${when}`, "argid,combined_datetime");
  const b = bucketReadings(wet.map((x) => ({ id: String(x.argid), at: String(x.combined_datetime), mm: Number(x.rainfall) })));
  return { days: dayRange(from, to), presence: presenceOf(seen.map((x) => ({ id: String(x.argid), at: String(x.combined_datetime) }))), rain: b.rain, dropped: b.dropped };
}

export function readCache(): RainCache | null {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE(), "utf8"));
    return j?.version === 1 && Array.isArray(j.gauges) ? (j as RainCache) : null;
  } catch { return null; }
}

export function writeCache(c: RainCache): void {
  const f = CACHE_FILE();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c));
  fs.renameSync(tmp, f);
}

export const emptyCache = (gauges: RainGauge[]): RainCache => ({ version: 1, source: GAUGE_SOURCE, url: GEO_WFS, fetchedAt: new Date().toISOString(), gauges, rain: {}, days: [], dropped: 0 });

// ---------------------------------------------------------------- in the app --

declare global {
  // eslint-disable-next-line no-var
  var __cfmRain: { at: number; c: RainCache | null; mtime: number; topping: Promise<void> | null } | undefined;
}

/** how often the app reads the last days again (rain days already over do not change; today's grows) */
export const TOP_UP_MS = 3 * 3_600_000;

/** the gauge cache, read from disk when it changes */
export function gaugeCache(): RainCache | null {
  let mtime = 0;
  try { mtime = fs.statSync(CACHE_FILE()).mtimeMs; } catch { return null; }
  const g = global.__cfmRain;
  if (g && g.mtime === mtime) return g.c;
  const c = readCache();
  global.__cfmRain = { at: g?.at ?? 0, c, mtime, topping: g?.topping ?? null };
  return c;
}

/**
 * In the background, at most every TOP_UP_MS: reads the rain days from the newest one in the cache (at most the last 10)
 * to today again, so a rain that has just ended is in the record within hours. Never throws; a failed read leaves the cache.
 * Off with CFM_RAIN_TOPUP=0 (tests) and when there is no cache to top up (the backfill script makes it).
 */
export function topUpGauges(): void {
  if (process.env.CFM_RAIN_TOPUP === "0" || process.env.VITEST) return;
  const c = gaugeCache();
  const g = global.__cfmRain;
  if (!c || !g || g.topping || Date.now() - g.at < TOP_UP_MS) return;
  g.at = Date.now();
  const today = currentRainDay();
  const last = c.days.filter((d) => d <= today).at(-1) ?? addDays(today, -10);
  const from = [addDays(last, -1), addDays(today, -10)].sort().at(-1)!;
  g.topping = readDays(c.gauges, from, today)
    .then((r) => { writeCache({ ...mergeDays(c, r.days, r.presence, r.rain, r.dropped), fetchedAt: new Date().toISOString() }); })
    .catch((e) => { console.warn("cfm rain top-up:", (e as Error).message); })
    .finally(() => { if (global.__cfmRain) global.__cfmRain.topping = null; });
}
