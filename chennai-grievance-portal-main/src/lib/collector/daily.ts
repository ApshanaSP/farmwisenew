/**
 * Day-by-day and week-by-week counts behind the Briefing's small chart and the department summary: reported (by first report time) and
 * resolved (by closing time, the Collector's decisions included), in any mix of zone, taluk, department and category. "Resolved" is the
 * tile's rule (intel.ts kpiBlock: closed, status Resolved), so a day's bar and the tile count the same cases.
 *
 * The windows here are the charts' own (the last 7 calendar days, the last 12 whole weeks) and each chart says so in its heading: they do
 * not follow the console's period, only its other filters.
 */
import { RowDataPacket } from "mysql2";
import intelPool, { ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const EFF = effectiveSql(ops("collector_decisions"));
/** closed as Resolved, by the effective status (the Resolved tile's rule) */
export const DONE_SQL = () => `${EFF.open} = 0 AND ${EFF.status} = 'Resolved'`;

/** The console's filters other than the period. */
export interface PlaceScope { zone?: number | null; dept?: string | null; cat?: string | null; taluk?: string | null }

/** " AND ..." over incidents for the filters, with no time window ("" for the whole district). */
export function scopeFilters(s: PlaceScope, a = "i"): { sql: string; params: unknown[] } {
  const parts: string[] = [], params: unknown[] = [];
  if (s.zone) (parts.push(`${a}.zone_no = ?`), params.push(s.zone));
  if (s.dept) (parts.push(`${a}.lead_dept = ?`), params.push(s.dept));
  if (s.cat) (parts.push(`${a}.category_code = ?`), params.push(s.cat));
  if (s.taluk) (parts.push(`${a}.taluk_code = ?`), params.push(s.taluk));
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
}

const DAY_MS = 864e5;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);

/** The last `n` calendar days to `now` (an IST wall clock), oldest first; the last one is today, so far. Pure. */
export function lastDays(now: string, n: number): string[] {
  const t = utc(now);
  return Array.from({ length: n }, (_, k) => dayOf(t - (n - 1 - k) * DAY_MS));
}

/** The Mondays of the last `n` whole weeks (Monday to Sunday) before this week, oldest first. Pure. */
export function lastWeeks(now: string, n: number): string[] {
  const t = utc(now), monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: n }, (_, k) => dayOf(monday - (n - k) * 7 * DAY_MS));
}

/** The Monday of a day's week. Pure. */
export function mondayOf(day: string): string {
  const t = utc(day);
  return dayOf(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS);
}

export interface DayCount { day: string; reported: number; resolved: number }

/** Counts per day put on the days asked for; a day with none is 0, never left out. Pure. */
export function fillDays(days: string[], reported: Row[], resolved: Row[]): DayCount[] {
  const a = new Map(reported.map((r) => [String(r.d), Number(r.n)])), b = new Map(resolved.map((r) => [String(r.d), Number(r.n)]));
  return days.map((day) => ({ day, reported: a.get(day) ?? 0, resolved: b.get(day) ?? 0 }));
}

/** The same counts by whole week (key: its Monday). Pure. */
export function fillWeeks(weeks: string[], days: DayCount[]): DayCount[] {
  const out = new Map(weeks.map((w) => [w, { day: w, reported: 0, resolved: 0 }]));
  for (const d of days) {
    const w = out.get(mondayOf(d.day));
    if (w) (w.reported += d.reported, w.resolved += d.resolved);
  }
  return [...out.values()];
}

/** Reported and resolved per calendar day from `from` ("YYYY-MM-DD") to now. */
async function counts(s: PlaceScope, now: string, from: string): Promise<[Row[], Row[]]> {
  const f = scopeFilters(s);
  const start = `${from} 00:00:00`;
  return Promise.all([
    q(`SELECT DATE_FORMAT(i.first_reported_at, '%Y-%m-%d') AS d, COUNT(*) AS n FROM incidents i
       WHERE i.first_reported_at >= ? AND i.first_reported_at <= ?${f.sql} GROUP BY d`, [start, now, ...f.params]),
    q(`SELECT x.d, COUNT(*) AS n FROM (SELECT DATE_FORMAT(${EFF.closedAt}, '%Y-%m-%d') AS d FROM incidents i
       WHERE ${EFF.closedAt} >= ?${f.sql} AND ${DONE_SQL()}) x GROUP BY x.d`, [start, ...f.params])
  ]);
}

/** The last `days` calendar days (7 by default): reported and resolved each day. */
export async function dayByDay(s: PlaceScope, now: string, days = 7): Promise<DayCount[]> {
  const list = lastDays(now, days);
  const [a, b] = await counts(s, now, list[0]);
  return fillDays(list, a, b);
}

/** The last 7 days and the last `weeks` whole weeks in one read (the department summary shows both). */
export async function daysAndWeeks(s: PlaceScope, now: string, days = 7, weeks = 12): Promise<{ days: DayCount[]; weeks: DayCount[] }> {
  const d7 = lastDays(now, days), w12 = lastWeeks(now, weeks);
  const [a, b] = await counts(s, now, w12[0] < d7[0] ? w12[0] : d7[0]);
  const all = [...new Set([...a, ...b].map((r) => String(r.d)))];
  return { days: fillDays(d7, a, b), weeks: fillWeeks(w12, fillDays(all, a, b)) };
}
