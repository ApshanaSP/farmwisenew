/**
 * v18 (24 Nov): Jarvis's reads over any window (server only). Every read takes the window's own IST bounds (when.ts windowOf), so "the last 2
 * days", "20 November" and "15 to 20 November" are counted over exactly those hours, against the window of the same length just before.
 *
 * What a summary of a place, a department or a kind of problem rests on, read in parallel from the store the console reads: the incidents
 * (totals, kinds, zones, departments, localities, day by day, the highest-priority cases, their points), the news that names the place or the
 * kind, air quality and rain at the stations, lake storage, the IMD warning, vegetable prices at the area's market, and live traffic. Read
 * only, parameterised SQL; no figure here comes from a model.
 */
import { deskSkips } from "@/lib/collector/deskbook";
import type { RowDataPacket } from "mysql2";
import intelPool, { TITLE, ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";
import { OPEN_NOW, asOf } from "@/lib/collector/intel";
import { pastDueSql } from "@/lib/reference/metrics";
import { CHENNAI_MARKETS } from "@/lib/collector/sources";
import { runTool } from "@/lib/assistant/tools";
import type { Win } from "./when";
import type { TrafficHistory } from "@/lib/city/history";
import type { OgdOutcome } from "@/lib/collector/ogdprices";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const EFF = effectiveSql(ops("collector_decisions"));
const OPEN = OPEN_NOW;
/** the locality of a place ("12th Main Road, Anna Nagar (W)" -> "Anna Nagar"), as queries.ts reads it */
export const LOCALITY = `NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.place_text, ' (', 1), ',', -1)), '')`;

export interface WinScope {
  zone: number | null;
  /** two to four zones together ("Adyar and Anna Nagar") */
  zones?: number[] | null;
  /** a locality inside the district ("Velachery"): the incidents whose place names it */
  place: string | null;
  /** v18 round 2: the place is a locality as the "By locality" ranking counts it (the last part of the place), matched exactly */
  exact?: boolean;
  dept: string | null;
  cats: string[] | null;
  sev: "Severe" | "High" | null;
  taluk: string | null;
  status: "open" | "overdue" | "resolved" | null;
}

function where(s: WinScope, from: string, to: string, now: string, rolling = false, endIncl = false) {
  // v18 round 2: a count back from now is counted as the console counts its windows (intel.ts periodWindow: after its start, up to now), so a
  // summary's figure and the console's tile for the same window are the same number
  const f = filters(s, now);
  // (the window before a rolling one ends where this one starts, that second included: kpiBlock counts it there, "<= now - h")
  return { sql: [...(rolling ? ["i.first_reported_at > ?", endIncl ? "i.first_reported_at <= ?" : "i.first_reported_at < ?"] : ["i.first_reported_at >= ?", "i.first_reported_at < ?"]), ...f.parts].join(" AND "), params: [from, to, ...f.params] };
}
/** the scope's own filters (place, department, kinds, severity, status), without any window */
function filters(s: WinScope, now: string): { parts: string[]; params: unknown[] } {
  const parts: string[] = [], params: unknown[] = [];
  if (s.zone) (parts.push("i.zone_no = ?"), params.push(s.zone));
  else if (s.zones?.length) (parts.push("i.zone_no IN (?)"), params.push(s.zones));
  if (s.place && s.exact) (parts.push(`LOWER(${LOCALITY}) = ?`), params.push(s.place.toLowerCase().trim()));
  else if (s.place) (parts.push("(LOWER(COALESCE(i.place_text, '')) LIKE ? OR LOWER(COALESCE(i.title, '')) LIKE ?)"), params.push(`%${s.place.toLowerCase().replace(/[%_]/g, "")}%`, `%${s.place.toLowerCase().replace(/[%_]/g, "")}%`));
  if (s.taluk) (parts.push("i.taluk_code = ?"), params.push(s.taluk));
  if (s.dept) (parts.push("i.lead_dept = ?"), params.push(s.dept));
  if (s.cats?.length) (parts.push("i.category_code IN (?)"), params.push(s.cats));
  if (s.sev === "Severe") parts.push("i.severity_level = 'Severe'");
  if (s.sev === "High") parts.push("i.severity_level IN ('Severe', 'High')");
  if (s.status === "open" || s.status === "overdue") parts.push(`${OPEN} = 1`);
  if (s.status === "overdue") parts.push(pastDueSql(now));
  if (s.status === "resolved") parts.push(`${EFF.open} = 0 AND ${EFF.status} = 'Resolved'`);
  return { parts, params };
}

/**
 * v18 round 2: the incidents closed in the window, by when they closed (the console's "Resolved" tile, intel.ts kpiBlock): the current rolling
 * window has no upper bound, so a decision made since the last refresh counts, as on the tile. The same place, department and kind filters.
 */
function closedWhere(s: WinScope, w: Pick<Win, "from" | "to" | "rolling" | "partial">, now: string) {
  const { parts, params } = filters({ ...s, status: null }, now);
  const win = w.rolling && w.partial ? [`${EFF.closedAt} > ?`] : [`${EFF.closedAt} >= ?`, `${EFF.closedAt} < ?`];
  return { sql: [...win, ...parts, `${EFF.open} = 0`, `${EFF.status} = 'Resolved'`].join(" AND "), params: [...(w.rolling && w.partial ? [w.from] : [w.from, w.to]), ...params] };
}

export interface WinIncidents {
  n: number; prev: number; severe: number; prevSevere: number; open: number; overdue: number; resolved: number; dead: number; injured: number; complaints: number; rain: number;
  kinds: { cat: string; label: string; n: number; prev: number; severe: number; open: number }[];
  zones: { zone: number; name: string; n: number; prev: number; severe: number; open: number; overdue: number }[];
  depts: { code: string; name: string; n: number; open: number; overdue: number; severe: number }[];
  places: { place: string; zone: number | null; n: number; open: number; severe: number }[];
  /** per day (per hour for a window of two days or less), oldest first */
  buckets: { at: string; n: number; severe: number }[];
  byHour: boolean;
  top: Row[];
  points: { id: string; lat: number; lon: number; sev: string | null; title: string }[];
}

/** Everything about the incidents of a window, in one parallel read. */
export async function winIncidents(w: Win, s: WinScope, nTop = 8): Promise<WinIncidents> {
  const now = await asOf();
  // "Resolved": closed in the window, by when it closed, as the console's tile counts it (intel.ts kpiBlock), whatever day it was reported
  const closedW = closedWhere(s, w, now);
  // (the resolved list a tile opens is those same incidents, so the list and the tile are one number)
  const resolvedList = s.status === "resolved";
  const cur = resolvedList ? closedW : where(s, w.from, w.to, now, w.rolling);
  const pre = resolvedList ? closedWhere(s, { ...w, from: w.prev.from, to: w.prev.to, partial: false }, now) : where(s, w.prev.from, w.prev.to, now, w.rolling, true);
  const byHour = w.hours <= 48;
  const bucket = byHour ? "DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:00')" : "DATE_FORMAT(i.first_reported_at, '%Y-%m-%d')";
  const [[t], [tp], kinds, kindsPrev, zones, zonesPrev, depts, places, buckets, top, points, [closed]] = await Promise.all([
    // (complaints: the citizen complaints on incidents still open, the console's "Open citizen complaints" tile)
    q(`SELECT COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe, COALESCE(SUM(${OPEN}), 0) AS open,
         COALESCE(SUM(${OPEN} = 1 AND ${pastDueSql(now)}), 0) AS overdue,
         COALESCE(SUM(i.dead), 0) AS dead, COALESCE(SUM(i.injured), 0) AS injured, COALESCE(SUM(CASE WHEN ${OPEN} = 1 THEN COALESCE(i.citizen_complaints, 0) ELSE 0 END), 0) AS complaints,
         COALESCE(SUM(i.rain_coupled = 1), 0) AS rain FROM incidents i WHERE ${cur.sql}`, cur.params),
    q(`SELECT COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe FROM incidents i WHERE ${pre.sql}`, pre.params),
    q(`SELECT i.category_code AS cat, MIN(i.category_label) AS label, COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe, COALESCE(SUM(${OPEN}), 0) AS open
       FROM incidents i WHERE ${cur.sql} GROUP BY i.category_code ORDER BY n DESC LIMIT 12`, cur.params),
    q(`SELECT i.category_code AS cat, COUNT(*) AS n FROM incidents i WHERE ${pre.sql} GROUP BY i.category_code`, pre.params),
    q(`SELECT i.zone_no AS zone, MIN(i.zone_name) AS name, COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe, COALESCE(SUM(${OPEN}), 0) AS open,
         COALESCE(SUM(${OPEN} = 1 AND ${pastDueSql(now)}), 0) AS overdue
       FROM incidents i WHERE ${cur.sql} AND i.zone_no IS NOT NULL GROUP BY i.zone_no ORDER BY n DESC`, cur.params),
    q(`SELECT i.zone_no AS zone, COUNT(*) AS n FROM incidents i WHERE ${pre.sql} AND i.zone_no IS NOT NULL GROUP BY i.zone_no`, pre.params),
    q(`SELECT i.lead_dept AS code, MIN(COALESCE(dp.name, i.lead_dept)) AS name, COUNT(*) AS n, COALESCE(SUM(${OPEN}), 0) AS open,
         COALESCE(SUM(${OPEN} = 1 AND ${pastDueSql(now)}), 0) AS overdue, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe
       FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept WHERE ${cur.sql} AND i.lead_dept IS NOT NULL GROUP BY i.lead_dept ORDER BY n DESC LIMIT 40`, cur.params),
    q(`SELECT k AS place, MIN(zone) AS zone, COUNT(*) AS n, COALESCE(SUM(op), 0) AS open, COALESCE(SUM(sv), 0) AS severe FROM (
         SELECT ${LOCALITY} AS k, i.zone_no AS zone, ${OPEN} AS op, (i.severity_level = 'Severe') AS sv FROM incidents i WHERE ${cur.sql}) x
       WHERE k IS NOT NULL AND LOWER(k) NOT IN ('chennai', 'chennai city', 'chennai district', 'greater chennai', 'tamil nadu', 'tamilnadu', 'india')
         AND LOWER(k) NOT LIKE '%chennai -%' AND LOWER(k) NOT LIKE '%tnpcb%' AND LOWER(k) NOT LIKE '%cpcb%'
       GROUP BY k ORDER BY n DESC LIMIT 10`, cur.params),
    q(`SELECT ${bucket} AS at, COUNT(*) AS n, COALESCE(SUM(i.severity_level = 'Severe'), 0) AS severe FROM incidents i WHERE ${cur.sql} GROUP BY at ORDER BY at`, cur.params),
    q(`SELECT i.incident_id AS id, ${TITLE} AS title, i.category_label AS type, i.category_code AS cat, i.lead_dept AS dept, dp.name AS dept_name, i.zone_no AS zone, i.zone_name,
         i.ward_no AS ward, i.place_text AS loc, i.severity_level AS sev, ${EFF.status} AS status, ${OPEN} AS open, i.citizen_complaints AS complaints, i.sla_breached AS breached,
         i.priority_score AS priority, i.priority_reasons, i.attention_reason, i.dead, i.injured, i.lat, i.lon,
         DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t, ${pastDueSql(now)} AS late
       FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept WHERE ${cur.sql}
       ORDER BY ${OPEN} DESC, i.priority_score DESC, i.first_reported_at DESC LIMIT ?`, [...cur.params, nTop]),
    q(`SELECT i.incident_id AS id, i.lat, i.lon, i.severity_level AS sev, ${TITLE} AS title FROM incidents i WHERE ${cur.sql} AND i.lat IS NOT NULL AND i.lon IS NOT NULL
       ORDER BY i.priority_score DESC LIMIT 150`, cur.params),
    q(`SELECT COUNT(*) AS resolved FROM incidents i WHERE ${closedW.sql}`, closedW.params)
  ]);
  const kp = new Map(kindsPrev.map((r) => [String(r.cat), n(r.n)]));
  const zp = new Map(zonesPrev.map((r) => [n(r.zone), n(r.n)]));
  return {
    n: n(t?.n), prev: n(tp?.n), severe: n(t?.severe), prevSevere: n(tp?.severe), open: n(t?.open), overdue: n(t?.overdue), resolved: n(closed?.resolved),
    dead: n(t?.dead), injured: n(t?.injured), complaints: n(t?.complaints), rain: n(t?.rain),
    kinds: kinds.map((r) => ({ cat: String(r.cat), label: String(r.label ?? r.cat), n: n(r.n), prev: kp.get(String(r.cat)) ?? 0, severe: n(r.severe), open: n(r.open) })),
    zones: zones.map((r) => ({ zone: n(r.zone), name: String(r.name ?? `Zone ${r.zone}`), n: n(r.n), prev: zp.get(n(r.zone)) ?? 0, severe: n(r.severe), open: n(r.open), overdue: n(r.overdue) })),
    depts: depts.map((r) => ({ code: String(r.code), name: String(r.name ?? r.code), n: n(r.n), open: n(r.open), overdue: n(r.overdue), severe: n(r.severe) })),
    places: places.map((r) => ({ place: String(r.place), zone: r.zone == null ? null : n(r.zone), n: n(r.n), open: n(r.open), severe: n(r.severe) })),
    buckets: buckets.map((r) => ({ at: String(r.at), n: n(r.n), severe: n(r.severe) })), byHour,
    top: top.map((r) => ({ ...r, open: n(r.open) === 1, overdue: n(r.late) === 1 && n(r.open) === 1 })),
    points: points.map((r) => ({ id: String(r.id), lat: Number(r.lat), lon: Number(r.lon), sev: r.sev ?? null, title: String(r.title ?? "") })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  };
}

// ------------------------------------------------------------------ news --

export interface WinNewsAsk {
  /** words that name the place (any of them in the headline or the place): an area's summary */
  words: string[];
  /** the kinds asked about (a kind's summary): news filed under them */
  cats: string[] | null;
  /** a department's summary: news about its incidents */
  dept: string | null;
  /** v19: words that must also be in the report (any of them, as a word): "news on chain snatching in Adyar" */
  also?: string[];
  /** v19: several departments' incidents */
  depts?: string[] | null;
  /** v19: by time, not the most telling first */
  newest?: boolean;
  /** v19: the oldest first */
  oldest?: boolean;
}
/** a word as a word, with its plural and tense endings ("dmk" in "AIADMK" is not it); a Tamil word anywhere */
const hasWord = (text: string, w: string): boolean => (/[^\x00-\x7f]/.test(w) ? text.includes(w.toLowerCase()) : new RegExp(`(?<![a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|ed|ing|'s${/e$/i.test(w) ? "|d" : ""})?(?![a-z0-9])`).test(text));
export interface WinNews { rows: Row[]; total: number }

/** The news of a window that names the place, the kind or the department's incidents; one story once (its newest report), newest first. */
export async function winNews(w: Win, a: WinNewsAsk, nOut = 10): Promise<WinNews> {
  const params: unknown[] = [w.from, w.to];
  let extra = "";
  if (a.cats?.length && !a.words.length) { extra += " AND d.category_code IN (?)"; params.push(a.cats); }
  if (!a.dept && a.depts?.length) { extra += " AND d.linked_incident_id IN (SELECT i.incident_id FROM incidents i WHERE i.lead_dept IN (?))"; params.push(a.depts); }
  if (a.dept) { extra += " AND d.linked_incident_id IN (SELECT i.incident_id FROM incidents i WHERE i.lead_dept = ?)"; params.push(a.dept); }
  const rows = await q(`SELECT d.doc_id AS id, d.title, d.title_en, d.summary, d.publisher, d.url, d.place_text AS loc, d.places, d.category_code AS cat, d.story_id AS story,
      d.linked_incident_id AS incident, d.is_incident, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i') AS t, d.outlet_count
    FROM documents d WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.published_at >= ? AND d.published_at < ?${extra}
    ORDER BY d.published_at DESC LIMIT 5000`, params);
  // (a short name, "ECR", "OMR", is read as a whole word; with no name usable at all nothing is about the place)
  const words = a.words.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 3);
  if (a.words.length && !words.length) return { rows: [], total: 0 };
  const low = (x: unknown) => ` ${String(x ?? "").toLowerCase()} `;
  const named = (x: unknown, word: string) => (word.length < 5 && /^[a-z0-9 .]+$/.test(word) ? hasWord(low(x), word) : low(x).includes(word));
  // how strongly a report is about the place: named in its headline, else its place, else only somewhere in the article (its places list)
  const strength = (r: Row): number => {
    if (!words.length) return 1;
    if (words.some((x) => named(r.title, x) || named(r.title_en, x))) return 3;
    if (words.some((x) => named(r.loc, x))) return 2;
    return words.some((x) => named(r.places, x)) ? 1 : 0;
  };
  const kindOk = (r: Row) => !a.cats?.length || !a.words.length || a.cats.includes(String(r.cat ?? ""));
  const seen = new Set<string>();
  const kept: (Row & { score: number })[] = [];
  for (const r of rows) {
    const s = strength(r);
    // (24 Nov: what the news desk left out, newsdesk.ts, is not in a summary either)
    if (!s || !kindOk(r) || deskSkips(r.title, r.title_en)) continue;
    if (a.also?.length) { const text = `${r.title ?? ""} ${r.title_en ?? ""} ${r.summary ?? ""}`.toLowerCase(); if (!a.also.some((x) => x.split(/\s+/).every((t) => hasWord(text, t)))) continue; }
    const key = r.story ? `s:${r.story}` : `d:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // a report about an incident, or about the place in its headline, before one that only mentions it; newest first within each
    kept.push({ ...r, score: s * 2 + (r.incident || Number(r.is_incident) === 1 ? 2 : 0) });
  }
  const out = [...kept].sort((x, y) => (a.oldest ? String(x.t).localeCompare(String(y.t)) : (a.newest ? 0 : y.score - x.score) || String(y.t).localeCompare(String(x.t)))).slice(0, nOut);
  return { rows: out, total: kept.length };
}

// ------------------------------------------------------------------ readings --

export type WinMetric = "aqi" | "rainfall_24h_mm" | "lake_pct_full" | "temp_max_c" | "humidity_pct";
export interface WinReading { id: string; name: string; zone: number | null; lat: number | null; lon: number | null; avg: number; max: number; min: number; first: number; last: number; lastAt: string; count: number; inWindow: boolean }

let zoneCentres: Promise<Map<number, { lat: number; lon: number }>> | null = null;
/** each zone's centre, as the mean of its wards' centres (ref_wards) */
function centres() {
  zoneCentres ??= q(`SELECT zone_no AS zone, AVG(centroid_lat) AS lat, AVG(centroid_lon) AS lon FROM ref_wards WHERE zone_no IS NOT NULL GROUP BY zone_no`)
    .then((rows) => new Map(rows.map((r) => [n(r.zone), { lat: Number(r.lat), lon: Number(r.lon) }])))
    .catch(() => { zoneCentres = null; return new Map(); });
  return zoneCentres;
}
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371, dLa = ((b.lat - a.lat) * Math.PI) / 180, dLo = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/**
 * A measure at each station over the window: its average, highest, lowest, first and last reading. A station with no reading inside the
 * window gives its latest reading before the window's end (inWindow false, so the screen says when it was taken). With a zone, the stations
 * in it, else the nearest one (and how far), first.
 */
export async function winReadings(metric: WinMetric, w: Win, zone: number | null): Promise<{ rows: WinReading[]; nearest: { id: string; km: number } | null; held?: { from: string; to: string } | null }> {
  // v18 round 2: the first and last reading held for the measure, so a day before or after them is said to be so
  const heldP = q(`SELECT DATE_FORMAT(MIN(observed_at), '%Y-%m-%d') AS a, DATE_FORMAT(MAX(observed_at), '%Y-%m-%d') AS b FROM observations WHERE metric = ?`, [metric]).then((r) => (r[0]?.a ? { from: String(r[0].a), to: String(r[0].b) } : null)).catch(() => null);
  const [inside, before] = await Promise.all([
    q(`SELECT place_id AS id, place_name AS name, zone_no AS zone, lat, lon, value, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i') AS t FROM observations
       WHERE metric = ? AND observed_at >= ? AND observed_at < ? ORDER BY observed_at`, [metric, w.from, w.to]),
    q(`SELECT place_id AS id, place_name AS name, zone_no AS zone, lat, lon, value, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i') AS t FROM observations
       WHERE metric = ? AND observed_at < ? AND observed_at >= ? ORDER BY observed_at`, [metric, w.from, new Date(Date.parse(`${w.from.replace(" ", "T")}+05:30`) - 14 * 864e5 + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ")])
  ]);
  const by = new Map<string, WinReading>();
  for (const r of inside) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    const k = String(r.id);
    const x = by.get(k);
    if (!x) by.set(k, { id: k, name: String(r.name ?? k), zone: r.zone == null ? null : n(r.zone), lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon),
      avg: v, max: v, min: v, first: v, last: v, lastAt: String(r.t), count: 1, inWindow: true });
    else { x.avg = (x.avg * x.count + v) / (x.count + 1); x.count++; x.max = Math.max(x.max, v); x.min = Math.min(x.min, v); x.last = v; x.lastAt = String(r.t); }
  }
  for (const r of before) {
    const k = String(r.id), v = Number(r.value);
    if (by.has(k) && by.get(k)!.inWindow) continue;
    if (!Number.isFinite(v)) continue;
    by.set(k, { id: k, name: String(r.name ?? k), zone: r.zone == null ? null : n(r.zone), lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon),
      avg: v, max: v, min: v, first: v, last: v, lastAt: String(r.t), count: 1, inWindow: false });
  }
  const rows = [...by.values()].map((x) => ({ ...x, avg: Math.round(x.avg * 10) / 10 }));
  const held = await heldP;
  if (!zone) return { rows: rows.sort((a, b) => b.avg - a.avg), nearest: null, held };
  const c = (await centres()).get(zone);
  const dist = (x: WinReading) => (c && x.lat != null && x.lon != null ? km(c, { lat: x.lat, lon: x.lon }) : 999);
  rows.sort((a, b) => Number(b.zone === zone) - Number(a.zone === zone) || dist(a) - dist(b));
  const first = rows[0];
  return { rows, nearest: first && first.zone !== zone && c ? { id: first.id, km: Math.round(dist(first) * 10) / 10 } : null, held };
}

/** The highest IMD warning level in force during the window (0 green to 3 red), with its words. */
export async function winWarning(w: Win): Promise<{ level: number; t: string; text: string | null } | null> {
  const [r] = await q(`SELECT value, DATE_FORMAT(observed_at, '%Y-%m-%d %H:%i') AS t, detail FROM observations WHERE metric = 'imd_warning_level' AND observed_at >= ? AND observed_at < ?
    ORDER BY value DESC, observed_at DESC LIMIT 1`, [w.from, w.to]);
  return r ? { level: n(r.value), t: String(r.t), text: r.detail ?? null } : null;
}

// ------------------------------------------------------------------ prices --

export interface WinPrice { commodity: string; perKg: number; firstPerKg: number; lo: number | null; hi: number | null; markets: number; date: string; firstDate: string }
export interface WinPrices { market: string | null;
  /** every item reported (staples first): a caller shows as many as it has room for */
  rows: WinPrice[]; latest: string | null; inWindow: boolean;
  /** v18 round 2: the first and last day any report is kept for (this market, or every Chennai market) */
  held: { from: string; to: string } | null;
  /** a day read from data.gov.in for this answer came back with Chennai rows; a data.gov.in key is set */
  fetched: boolean; keyed: boolean;
  /**
   * v18 round 3: what data.gov.in gave for this answer, day by day (null when it was not asked: no key, or a caller that does not wait for
   * it). `none` also holds the window's days it answered with none in the last 3 hours; `capped`: more days were missing than one answer asks.
   */
  ogd?: (OgdOutcome & { capped: boolean }) | null }

/** the vegetables a household watches first, in this order; the rest by how many markets report them */
const STAPLES = ["tomato", "onion", "potato", "brinjal", "beans", "carrot", "cabbage", "lady finger", "bhindi", "green chilli", "drumstick", "banana", "cauliflower", "beetroot", "coconut"];
/** v18 round 3: the most missing days one answer asks data.gov.in for, and how long it waits for them */
const OGD_DAYS = 7, OGD_WAIT_MS = 2500;

/**
 * Vegetable prices at the area's market (the Uzhavar Sandhai in its zone: Anna Nagar, K.K. Nagar, Nanganallur, Ambattur) or across the
 * Chennai markets, over the window: each item's latest modal price a kilo and its price at the window's start. Markets report to AGMARKNET a
 * few days late, so a window with no report gives the latest report before its end (inWindow false: the screen says the date).
 * `opts.fetch` false: no day is read from data.gov.in (the summary, which must not wait on it).
 */
export async function winPrices(w: Win, zone: number | null, named: string | null = null, opts: { fetch?: boolean } = {}): Promise<WinPrices> {
  // v18 round 2: a market named in the words ("K.K. Nagar market", "Medavakkam"), else the one in the zone asked about, else every Chennai market
  const market = (named ? CHENNAI_MARKETS.find((m) => m.key.toLowerCase().replace(/[^a-z]/g, "") === named.toLowerCase().replace(/[^a-z]/g, ""))?.key : null)
    ?? (zone ? CHENNAI_MARKETS.find((m) => m.zone === zone)?.key ?? null : null);
  const day = (t: string) => t.slice(0, 10);
  // the window ends before its "to" ("on 1 October" is 1 Oct 00:00 to 2 Oct 00:00): its last day is the day before a midnight end, so a
  // later report is never shown under the day asked (the browser drive of 24 Nov showed 2 Oct tomato prices under "1 Oct")
  const endMs = Date.parse(`${w.to.replace(" ", "T")}+05:30`) - 1000;
  const lastDay = day(new Date(endMs + 330 * 60_000).toISOString());
  const read = (from: string, to: string) => q(`SELECT DATE_FORMAT(date, '%Y-%m-%d') AS d, market, commodity, AVG(modal_price) AS price, MIN(min_price) AS lo, MAX(max_price) AS hi
    FROM ${ops("mandi_market_prices")} WHERE date >= ? AND date <= ?${market ? " AND market = ?" : ""} GROUP BY date, market, commodity ORDER BY date`,
    market ? [from, to, market] : [from, to]).catch(() => [] as Row[]);
  // v18 round 2: a day not kept yet is read from data.gov.in when its key is set (at most a week of days), then counted as kept.
  // v18 round 3: the answer waits 2.5 s at most (the read goes on in the background, kept for the next question), and says what really came back
  const { ogdKey, ogdReadDays, ogdEmptyDays, missingDays } = await import("@/lib/collector/ogdprices");
  let ogd: WinPrices["ogd"] = null;
  if (ogdKey() && opts.fetch !== false) {
    const toDay = day(new Date(Math.min(endMs, Date.now()) + 330 * 60_000).toISOString());
    const miss = await missingDays(day(w.from), toDay, OGD_DAYS + 1).catch(() => [] as string[]);
    const got = miss.length ? await ogdReadDays(miss.slice(0, OGD_DAYS), OGD_WAIT_MS) : null;
    // (a day it answered with none in the last 3 hours is not asked again, but it is still a day it had none for)
    const none = [...new Set([...(got?.none ?? []), ...(day(w.from) <= toDay ? ogdEmptyDays(day(w.from), toDay) : [])])].sort().reverse();
    ogd = { tried: got?.tried ?? [], none, failed: got?.failed ?? [], late: got?.late ?? [], error: got?.error ?? null, fetched: !!got?.fetched, capped: miss.length > OGD_DAYS };
  }
  const fetched = !!ogd?.fetched;
  const [heldRow] = await q(`SELECT DATE_FORMAT(MIN(date), '%Y-%m-%d') AS a, DATE_FORMAT(MAX(date), '%Y-%m-%d') AS b FROM ${ops("mandi_market_prices")}${market ? " WHERE market = ?" : ""}`, market ? [market] : []).catch(() => [] as Row[]);
  const held = heldRow?.a ? { from: String(heldRow.a), to: String(heldRow.b) } : null;
  let rows = await read(day(w.from), lastDay);
  let inWindow = rows.length > 0;
  if (!rows.length) {
    const [last] = await q(`SELECT DATE_FORMAT(MAX(date), '%Y-%m-%d') AS d FROM ${ops("mandi_market_prices")} WHERE date <= ?${market ? " AND market = ?" : ""}`, market ? [lastDay, market] : [lastDay]).catch(() => [] as Row[]);
    if (last?.d) { rows = await read(String(last.d), String(last.d)); inWindow = false; }
  }
  const by = new Map<string, Row[]>();
  for (const r of rows) (by.get(String(r.commodity)) ?? by.set(String(r.commodity), []).get(String(r.commodity))!).push(r);
  const out: WinPrice[] = [];
  for (const [commodity, rs] of by) {
    const dates = [...new Set(rs.map((r) => String(r.d)))].sort();
    const at = (d: string) => { const xs = rs.filter((r) => r.d === d); return xs.reduce((s, r) => s + n(r.price), 0) / Math.max(1, xs.length); };
    const last = dates.at(-1)!, first = dates[0];
    const lastRows = rs.filter((r) => r.d === last);
    // v18 round 3: a market with no low or high price (NULL) is left out of the range, never read as ₹0
    const given = (k: "lo" | "hi") => lastRows.map((r) => r[k]).filter((v) => v != null && v !== "" && Number.isFinite(Number(v))).map(Number);
    const los = given("lo"), his = given("hi");
    out.push({ commodity, perKg: Math.round(at(last)) / 100, firstPerKg: Math.round(at(first)) / 100, date: last, firstDate: first, markets: new Set(lastRows.map((r) => r.market)).size,
      lo: los.length ? Math.min(...los) / 100 : null, hi: his.length ? Math.max(...his) / 100 : null });
  }
  const rank = (c: string) => { const i = STAPLES.findIndex((s) => c.toLowerCase().includes(s)); return i < 0 ? 99 : i; };
  out.sort((a, b) => rank(a.commodity) - rank(b.commodity) || b.markets - a.markets || a.commodity.localeCompare(b.commodity));
  const latest = out.reduce((a, r) => (r.date > a ? r.date : a), "") || null;
  // v18 round 3: every item, so one the Collector names is found however far down the list it is (each screen shows its own first twelve)
  return { market, rows: out, latest, inWindow, held, fetched, keyed: !!ogdKey(), ogd };
}

// ------------------------------------------------------------------ live --

export interface WinTraffic { say: string; rows: Row[]; headline: string | null }

/** Live traffic in the zone (or the city) now, from the city layer (lib/city: TomTom and the district's own traffic reports). Live only. */
export async function winTraffic(zone: number | null, ms = 2500): Promise<WinTraffic | null> {
  const got = runTool("city_now", { topic: "traffic", zone }).then((r) => {
    const d = (r.data ?? {}) as Row;
    const say = String((d.say as Row | undefined)?.en ?? d.headline ?? "").trim();
    return { say, rows: (Array.isArray(d.rows) ? d.rows : []) as Row[], headline: d.headline ? String(d.headline) : null };
  }).catch(() => null);
  return Promise.race([got, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** v18 round 2: live traffic as the website recorded it over the window (lib/city/history.ts) */
export async function winTrafficHistory(w: Win, zone: number | null): Promise<TrafficHistory> {
  const { trafficHistory } = await import("@/lib/city/history");
  return trafficHistory(w.from, w.to, zone);
}

export interface WinHands {
  now: () => Promise<string>;
  incidents: typeof winIncidents;
  news: typeof winNews;
  readings: typeof winReadings;
  warning: typeof winWarning;
  prices: typeof winPrices;
  traffic: typeof winTraffic;
  /** v18 round 2: recorded traffic over the window (absent in a test's hands: the screen says it cannot read it) */
  trafficHistory?: typeof winTrafficHistory;
}

/** The v18 reads for a user. An officer's console is locked to the department: the lock is applied to every incident read. */
export function winHands(lockDept: string | null): WinHands {
  return {
    now: () => asOf(),
    incidents: (w, s, nTop) => winIncidents(w, lockDept ? { ...s, dept: lockDept } : s, nTop),
    news: (w, a, nOut) => winNews(w, lockDept ? { ...a, dept: lockDept } : a, nOut),
    readings: winReadings, warning: winWarning, prices: winPrices, traffic: winTraffic, trafficHistory: winTrafficHistory
  };
}
