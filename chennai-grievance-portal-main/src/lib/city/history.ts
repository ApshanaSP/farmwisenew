/**
 * v18 round 2 (24 Nov): live traffic, kept. TomTom serves only what is on the roads now; it keeps no history a site can read. The owner: "if I
 * ask which was mostly congested for the past 30 days, or a summary of very congested lanes for the past 4 days, it should retrieve it, so we
 * need the past traffic data also: store it somewhere". So the website reads TomTom's live traffic every 10 minutes (lib/scheduler.ts) and keeps:
 *   traffic_snaps  one row per reading: how many stretches were jammed, very congested, closed, flooded, with accidents, and by zone
 *   traffic_days   one row per road stretch per day: in how many readings it was jammed, very congested, closed or flooded, its worst and total
 *                  delay, its longest queue, when it was first and last seen that day
 * Both are durable tables of the AWS store (lib/aws/store.ts WEBSITE_TABLES; migrations/018 for MySQL): the PC that saves (AWS_STORE_SAVE=1) sends
 * them to AWS like every other durable row. Nothing is estimated: a stretch's figure is how many of the 10-minute readings saw it jammed.
 * History starts the day the recorder first ran; before that, a window's answer is the district's own traffic records (police traffic reports,
 * road accidents, road damage), which go back as far as the store's other records.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool, { withTransaction } from "@/lib/db";
import { MAX_HOURS } from "@/lib/period/read";
import { trafficKey } from "@/lib/rehearsal/traffic";
import { trafficNow, type TrafficSpot } from "./traffic";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await pool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

/** a reading every 10 minutes */
export const RECORD_EVERY_MS = 10 * 60_000;
/** the levels a reading keeps (light slow traffic is kept too: it is where a jam starts) */
const KEPT = new Set<TrafficSpot["level"]>(["very", "congested", "slow", "closed", "flood", "accident"]);

const istMinute = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ") + ":00";
/** one stretch, the same across readings: its road and its two ends (TomTom names them the same each time), else its place */
export function stretchKey(s: Pick<TrafficSpot, "road" | "from" | "to" | "lat" | "lon">): string {
  const ends = [s.from ?? "", s.to ?? ""].map((x) => x.toLowerCase().trim()).sort().join("|");
  const base = `${(s.road ?? "").toLowerCase().trim()}|${ends}`;
  return (base.replace(/\|/g, "") ? base : `@${s.lat.toFixed(3)},${s.lon.toFixed(3)}`).slice(0, 200);
}

declare global {
  // eslint-disable-next-line no-var
  var __diqTrafficRecordAt: number | undefined;
  // eslint-disable-next-line no-var
  var __diqTrafficPrunedDay: string | undefined;
}

/**
 * One reading of live traffic, kept (the scheduler calls it every minute; it reads at most every 10 minutes). Skips quietly when TomTom is not
 * set up or not reachable, and never keeps the same TomTom reading twice (its time is the snapshot's key).
 */
export async function recordTraffic(now = Date.now()): Promise<{ kept: boolean; spots: number; why?: string }> {
  if (!trafficKey()) return { kept: false, spots: 0, why: "no key" };
  // (v18 round 2's review: only the copy that saves to AWS records; any other copy reads the history the saving PC keeps, so two recorders'
  // readings are never mixed, and their rows never clash on the unique keys when the store loads)
  if (process.env.DATA_BACKEND === "aws" && !(await import("@/lib/aws/store")).savesToAws()) return { kept: false, spots: 0, why: "this copy does not save" };
  if (global.__diqTrafficRecordAt && now - global.__diqTrafficRecordAt < RECORD_EVERY_MS - 15_000) return { kept: false, spots: 0, why: "too soon" };
  global.__diqTrafficRecordAt = now;
  const t = await trafficNow();
  if (!t.enabled || !t.at) return { kept: false, spots: 0, why: t.why ?? "not read" };
  const at = istMinute(Date.parse(t.at));
  const day = at.slice(0, 10);
  const spots = t.spots.filter((s) => KEPT.has(s.level));
  const zones: Record<string, number> = {};
  for (const s of spots) if (s.zone != null && (s.level === "very" || s.level === "congested" || s.level === "slow")) zones[s.zone] = (zones[s.zone] ?? 0) + 1;
  return withTransaction(async (conn) => {
  const [ins] = await conn.query<ResultSetHeader>(
    `INSERT IGNORE INTO traffic_snaps (at, spots, jams, very, congested, slow, closed, flooded, accidents, works, delay_min, zones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [at, t.counts.total, t.counts.jams, t.counts.very, t.counts.congested, t.counts.slow, t.counts.closed, t.counts.flooded, t.counts.accidents, t.counts.works,
      Math.round(t.spots.reduce((a, s) => a + (s.delayMin ?? 0), 0)), JSON.stringify(zones)]);
  // the same TomTom reading again (it is cached five minutes): kept once
  if (!ins?.affectedRows) return { kept: false, spots: 0, why: "same reading" };
  // one stretch once per reading (TomTom can give a stretch in two directions)
  const by = new Map<string, TrafficSpot>();
  for (const s of spots) { const k = stretchKey(s); const had = by.get(k); if (!had || (s.delayS ?? 0) > (had.delayS ?? 0)) by.set(k, s); }
  const keys = [...by.keys()];
  const have = new Map<string, Row>();
  for (let i = 0; i < keys.length; i += 200) {
    const part = keys.slice(i, i + 200);
    const [got] = await conn.query<RowDataPacket[]>(`SELECT * FROM traffic_days WHERE day = ? AND stretch IN (?)`, [day, part]);
    for (const r of got as unknown as Row[]) have.set(String(r.stretch), r);
  }
  for (const [k, s] of by) {
    const d = Math.max(0, Math.round(s.delayS ?? (s.delayMin ?? 0) * 60));
    const flags = { very: Number(s.level === "very"), closed: Number(s.level === "closed"), flooded: Number(s.level === "flood"), accidents: Number(s.level === "accident") };
    const jam = Number(s.level === "very" || s.level === "congested" || s.level === "slow");
    const r = have.get(k);
    if (r) {
      await conn.query(`UPDATE traffic_days SET seen = seen + ?, very = very + ?, closed = closed + ?, flooded = flooded + ?, accidents = accidents + ?, sum_delay_s = sum_delay_s + ?,
          max_delay_s = ?, max_len_m = ?, last_at = ?, worst = ? WHERE id = ?`,
        [jam, flags.very, flags.closed, flags.flooded, flags.accidents, d, Math.max(n(r.max_delay_s), d), Math.max(n(r.max_len_m), n(s.lengthM)), at, worse(String(r.worst ?? ""), s.level), r.id]);
    } else {
      await conn.query(`INSERT IGNORE INTO traffic_days (day, stretch, name, road, zone, zone_name, ward, lat, lon, seen, very, closed, flooded, accidents, max_delay_s, sum_delay_s, max_len_m, first_at, last_at, worst)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [day, k, s.name.slice(0, 200), s.road, s.zone, s.zoneName, s.ward, s.lat, s.lon, jam, flags.very, flags.closed, flags.flooded, flags.accidents, d, d, s.lengthM ?? null, at, at, s.level]);
    }
  }
  // (the review: kept for the days the records keep, and a little more; older rows can never be asked for)
  if (global.__diqTrafficPrunedDay !== day) {
    global.__diqTrafficPrunedDay = day;
    const cut = new Date(Date.parse(`${day}T00:00:00Z`) - (MAX_HOURS / 24 + 14) * 864e5).toISOString().slice(0, 10);
    await conn.query(`DELETE FROM traffic_days WHERE day < ?`, [cut]);
    await conn.query(`DELETE FROM traffic_snaps WHERE at < ?`, [`${cut} 00:00:00`]);
  }
  return { kept: true, spots: by.size };
  });
}
const RANK = ["flood", "accident", "very", "closed", "congested", "slow"];
const worse = (a: string, b: string) => (RANK.indexOf(a) >= 0 && (RANK.indexOf(b) < 0 || RANK.indexOf(a) <= RANK.indexOf(b)) ? a : b);

export interface TrafficHistory {
  /** the first reading ever kept (IST), or null: nothing recorded yet */
  since: string | null;
  /** the readings on the window's days (whole days: a stretch is kept by the day, so its count and this one are over the same days) */
  readings: number;
  /** the whole days counted, IST (the window's first and last day) */
  dayFrom: string; dayTo: string;
  first: string | null; last: string | null;
  /** per day: readings, and the jams, very congested and closed stretches on average in a reading */
  days: { d: string; readings: number; jams: number; very: number; closed: number; peak: number; peakAt: string | null }[];
  /** the busiest reading in the window */
  peak: { at: string; jams: number; very: number } | null;
  /** stretches, most often jammed first */
  stretches: { stretch: string; name: string; road: string | null; zone: number | null; zoneName: string | null; lat: number | null; lon: number | null;
    seen: number; very: number; closed: number; flooded: number; accidents: number; maxDelayS: number; sumDelayS: number; maxLenM: number; days: number }[];
  /** zones: jammed sightings, very congested ones, and how many stretches */
  zones: { zone: number; name: string; seen: number; very: number; stretches: number }[];
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
/**
 * The recorded traffic of a window (IST bounds, from inclusive, to exclusive), for one zone or the district, over the whole days it touches:
 * a stretch's figures are kept by the day, so the readings are counted over the same days, and "jammed in N of the M readings" holds.
 */
export async function trafficHistory(from: string, to: string, zone: number | null): Promise<TrafficHistory> {
  // (the window's last day: a window that ends at midnight ends the day before, so "on 1 October" never counts 2 October's day rows)
  const dayFrom = from.slice(0, 10);
  const dayTo = to.slice(11, 19) === "00:00:00" ? new Date(Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) : to.slice(0, 10);
  const zf = zone ? " AND zone = ?" : "";
  const [sinceRow, snaps, rows] = await Promise.all([
    q(`SELECT MIN(at) AS a FROM traffic_snaps`).catch(() => [] as Row[]),
    q(`SELECT at, jams, very, closed, zones FROM traffic_snaps WHERE at >= ? AND at < ? ORDER BY at`, [`${dayFrom} 00:00:00`, `${nextDay(dayTo)} 00:00:00`]).catch(() => [] as Row[]),
    // whole days that touch the window (a stretch's day row is not split by the hour)
    q(`SELECT stretch, MAX(name) AS name, MAX(road) AS road, MAX(zone) AS zone, MAX(zone_name) AS zone_name, AVG(lat) AS lat, AVG(lon) AS lon, SUM(seen) AS seen, SUM(very) AS very,
        SUM(closed) AS closed, SUM(flooded) AS flooded, SUM(accidents) AS accidents, MAX(max_delay_s) AS max_delay_s, SUM(sum_delay_s) AS sum_delay_s, MAX(max_len_m) AS max_len_m, COUNT(*) AS days
      FROM traffic_days WHERE day >= ? AND day <= ?${zf} GROUP BY stretch`, zone ? [dayFrom, dayTo, zone] : [dayFrom, dayTo]).catch(() => [] as Row[])
  ]);
  const zoneJams = (r: Row) => { if (!zone) return n(r.jams); try { return n((JSON.parse(String(r.zones ?? "{}")) as Record<string, number>)[zone]); } catch { return 0; } };
  const byDay = new Map<string, { readings: number; jams: number; very: number; closed: number; peak: number; peakAt: string | null }>();
  let peak: TrafficHistory["peak"] = null;
  for (const r of snaps) {
    const d = String(r.at).slice(0, 10);
    const x = byDay.get(d) ?? byDay.set(d, { readings: 0, jams: 0, very: 0, closed: 0, peak: 0, peakAt: null }).get(d)!;
    const j = zoneJams(r);
    x.readings++; x.jams += j; x.very += zone ? 0 : n(r.very); x.closed += zone ? 0 : n(r.closed);
    if (j > x.peak) { x.peak = j; x.peakAt = String(r.at); }
    if (!peak || j > peak.jams) peak = { at: String(r.at), jams: j, very: zone ? 0 : n(r.very) };
  }
  const days = [...byDay.entries()].map(([d, x]) => ({ d, readings: x.readings, jams: Math.round((x.jams / x.readings) * 10) / 10, very: Math.round((x.very / x.readings) * 10) / 10,
    closed: Math.round((x.closed / x.readings) * 10) / 10, peak: x.peak, peakAt: x.peakAt }));
  const stretches = rows.map((r) => ({ stretch: String(r.stretch), name: String(r.name ?? r.stretch), road: r.road ? String(r.road) : null, zone: r.zone == null ? null : n(r.zone),
    zoneName: r.zone_name ? String(r.zone_name) : null, lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon), seen: n(r.seen), very: n(r.very),
    closed: n(r.closed), flooded: n(r.flooded), accidents: n(r.accidents), maxDelayS: n(r.max_delay_s), sumDelayS: n(r.sum_delay_s), maxLenM: n(r.max_len_m), days: n(r.days) }))
    .filter((s) => s.seen + s.closed + s.flooded + s.accidents > 0)
    .sort((a, b) => b.seen - a.seen || b.very - a.very || b.sumDelayS - a.sumDelayS);
  const zm = new Map<number, { zone: number; name: string; seen: number; very: number; stretches: number }>();
  for (const s of stretches) if (s.zone != null) {
    const z = zm.get(s.zone) ?? zm.set(s.zone, { zone: s.zone, name: s.zoneName ?? `Zone ${s.zone}`, seen: 0, very: 0, stretches: 0 }).get(s.zone)!;
    z.seen += s.seen; z.very += s.very; z.stretches++;
  }
  return { since: sinceRow[0]?.a ? String(sinceRow[0].a) : null, readings: snaps.length, dayFrom, dayTo, first: snaps[0] ? String(snaps[0].at) : null, last: snaps.at(-1) ? String(snaps.at(-1)!.at) : null,
    days, peak, stretches, zones: [...zm.values()].sort((a, b) => b.seen - a.seen) };
}

/** v19 (25 Nov): jammed stretches on average in a reading, by the hour of the day (IST), over a window's whole days */
export async function trafficByHour(from: string, to: string, zone: number | null): Promise<{ hour: number; readings: number; jams: number }[]> {
  const dayTo = to.slice(11, 19) === "00:00:00" ? new Date(Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) : to.slice(0, 10);
  const snaps = await q(`SELECT at, jams, zones FROM traffic_snaps WHERE at >= ? AND at < ?`, [`${from.slice(0, 10)} 00:00:00`, `${nextDay(dayTo)} 00:00:00`]).catch(() => [] as Row[]);
  const by = new Map<number, { readings: number; jams: number }>();
  for (const r of snaps) {
    const h = Number(String(r.at).slice(11, 13));
    if (!Number.isInteger(h)) continue;
    let j = n(r.jams);
    if (zone) { try { j = n((JSON.parse(String(r.zones ?? "{}")) as Record<string, number>)[zone]); } catch { j = 0; } }
    const x = by.get(h) ?? by.set(h, { readings: 0, jams: 0 }).get(h)!;
    x.readings++; x.jams += j;
  }
  return [...by.entries()].map(([hour, x]) => ({ hour, readings: x.readings, jams: Math.round((x.jams / x.readings) * 10) / 10 })).sort((a, b) => a.hour - b.hour);
}
