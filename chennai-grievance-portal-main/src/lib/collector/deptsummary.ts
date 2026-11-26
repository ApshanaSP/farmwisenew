/**
 * One department at a glance: the pop-up a click on a department opens (26 Nov 2026), and what the assistant reads about a department.
 * Who runs it, the period's figures, seven charts, its most important open cases, the news about its work and what it owes.
 *
 * Every figure is the dashboard's own: the tiles come from kpiBlock and snapCommon with the department as the filter, so they equal the
 * Overview when "Show only this department" is on; open is OPEN_NOW, past deadline is pastDueSql, resolved is by closing time, My tasks is
 * awaitingCheck. The period, zone, taluk and category are applied to everything, except the charts that say their own window in their
 * heading: the last 7 days, the last 12 weeks, and the open cases by age (any date).
 *
 * The caller decides which department may be read: the Collector's route reads any; an officer's caller must pass only its own.
 */
import { RowDataPacket } from "mysql2";
import intelPool, { TITLE, ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";
import { OPEN_NOW, asOf, awaitingCheck, contactsFor, explain, kpiBlock, newsStories, periodInfo, scopeWhere, snapCommon, type Period } from "@/lib/collector/intel";
import { closedLateSql, closedOnTimeSql, isPastDeadline } from "@/lib/reference/metrics";
import { DONE_SQL, daysAndWeeks, scopeFilters } from "@/lib/collector/daily";
import { ageBuckets, average, deptSentences, followupWords, median } from "@/lib/collector/deptwords";
import { followupDept } from "@/lib/collector/followupdept";
import { categories } from "@/lib/collector/nlp";
import { dataKey, keptRead, type Kept } from "@/lib/collector/datakey";
import { syncEpoch } from "@/lib/collector/epoch";
import { orEmpty } from "@/lib/fallback";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const n = (v: unknown) => Number(v ?? 0);
const EFF = effectiveSql(ops("collector_decisions"));
const SEV_ORDER = "FIELD(i.severity_level, 'Severe', 'High', 'Medium', 'Low')";
const SEVS = ["Severe", "High", "Medium", "Low"] as const;

/** the console's other filters (the department is the one the summary is of) */
export interface DeptFilters { zone?: number | null; taluk?: string | null; cat?: string | null }

declare global {
  // eslint-disable-next-line no-var
  var __diqDeptSummary: Map<string, Kept<Awaited<ReturnType<typeof fresh>>>> | undefined;
}
const cache = (globalThis.__diqDeptSummary ??= new Map());

/** A department's summary for the period and the other filters; null when the code is no department. */
export async function deptSummary(code: string, period: Period, f: DeptFilters = {}) {
  syncEpoch(cache);
  const key = JSON.stringify([code, period, f.zone ?? null, f.taluk ?? null, f.cat ?? null, await dataKey()]);
  return structuredClone(await keptRead(cache, key, () => fresh(code, period, f), { max: 80 }));
}
export type DeptSummary = NonNullable<Awaited<ReturnType<typeof deptSummary>>>;

async function fresh(code: string, period: Period, f: DeptFilters) {
  const now = await asOf();
  const [dept] = await q(`SELECT code, name, org, head, route FROM ref_departments WHERE code = ?`, [code]);
  if (!dept) return null;
  const zone = f.zone ?? null, taluk = f.taluk ?? null, cat = f.cat ?? null;
  const s = { period, zone, dept: code, cat, taluk };
  const w = scopeWhere(s, now), pw = scopeWhere({ ...s, offset: 1 }, now), cw = scopeWhere(s, now, true);
  const any = scopeFilters({ zone, dept: code, cat, taluk });
  const place = scopeFilters({ zone, cat, taluk });
  const done = DONE_SQL();
  const areaCol = zone ? "i.ward_no" : "i.zone_no";

  const [kpi, common, check, totals, series, sev, ages, kinds, kindsPrev, areas, closing, spans, cases, contacts, names, stories, follow, tasks] = await Promise.all([
    kpiBlock(s, now),
    snapCommon(s, now),
    awaitingCheck(s, now),
    q(`SELECT SUM(COALESCE(i.dead, 0)) AS dead, SUM(COALESCE(i.injured, 0)) AS injured, SUM(i.citizen_complaints) AS complaints FROM incidents i WHERE ${w.sql}`, w.params),
    daysAndWeeks({ zone, dept: code, cat, taluk }, now, 7, 12),
    q(`SELECT i.severity_level AS sev, COUNT(*) AS n, SUM(${OPEN_NOW}) AS open FROM incidents i WHERE ${w.sql} GROUP BY i.severity_level`, w.params),
    // every open case whatever its date: on a day's window all of them would be "0–3 days"
    q(`SELECT DATEDIFF(?, i.first_reported_at) AS d, COUNT(*) AS n FROM incidents i WHERE ${OPEN_NOW} AND i.first_reported_at <= ?${any.sql} GROUP BY d`, [now, now, ...any.params]),
    q(`SELECT i.category_code AS cat, i.category_label AS label, COUNT(*) AS n, SUM(${OPEN_NOW}) AS open FROM incidents i WHERE ${w.sql}
       GROUP BY i.category_code, i.category_label ORDER BY n DESC LIMIT 6`, w.params),
    q(`SELECT i.category_code AS cat, COUNT(*) AS n FROM incidents i WHERE ${pw.sql} GROUP BY i.category_code`, pw.params),
    q(`SELECT ${areaCol} AS k, ${zone ? "NULL" : "i.zone_name"} AS name, COUNT(*) AS n, SUM(${OPEN_NOW}) AS open FROM incidents i WHERE ${w.sql} AND ${areaCol} IS NOT NULL
       GROUP BY ${areaCol}${zone ? "" : ", i.zone_name"} ORDER BY n DESC LIMIT 6`, w.params),
    q(`SELECT COUNT(*) AS n, SUM(${closedOnTimeSql(EFF.closedAt)}) AS on_time, SUM(${closedLateSql(EFF.closedAt)}) AS late FROM incidents i WHERE ${cw.sql} AND ${done}`, cw.params),
    q(`SELECT TIMESTAMPDIFF(MINUTE, i.first_reported_at, ${EFF.closedAt}) AS m FROM incidents i WHERE ${cw.sql} AND ${done} AND ${EFF.closedAt} >= i.first_reported_at LIMIT 8000`, cw.params),
    q(`SELECT i.incident_id AS id, ${TITLE} AS title, i.category_label AS type, i.place_text AS loc, i.zone_name, i.severity_level AS sev, ${EFF.status} AS status, ${EFF.open} AS open,
              i.citizen_complaints AS complaints, i.dead, i.injured, i.sla_breached AS breached, DATE_FORMAT(i.sla_due_at, '%Y-%m-%d %H:%i:%s') AS sla_due, i.severity_reasons, i.priority_reasons,
              i.attention_reason, i.ai_summary, i.ai_attention, i.ai_next_step, DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t
       FROM incidents i WHERE ${w.sql} AND ${OPEN_NOW} ORDER BY ${SEV_ORDER}, COALESCE(i.dead, 0) DESC, i.priority_score DESC LIMIT 5`, w.params),
    contactsFor(code, null),
    Promise.all([
      zone ? q(`SELECT zone_name AS name FROM ref_wards WHERE zone_no = ? LIMIT 1`, [zone]) : Promise.resolve([] as Row[]),
      taluk ? q(`SELECT name FROM ref_taluks WHERE taluk_code = ?`, [taluk]) : Promise.resolve([] as Row[])
    ]).then(([z, t]) => ({ zone: z[0]?.name ? String(z[0].name) : null, taluk: t[0]?.name ? String(t[0].name) : null })),
    newsStories(period, now).catch(orEmpty("deptsummary:news")) as Promise<Awaited<ReturnType<typeof newsStories>>>,
    // instructions the Collector sent whose reply is still awaited
    q(`SELECT f.followup_id AS id, f.incident_id, f.summary, DATE_FORMAT(f.due_date, '%Y-%m-%d') AS due, ${TITLE} AS title, i.lead_dept AS dept, ${EFF.open} AS open,
              i.zone_no AS zone, i.taluk_code AS taluk, i.category_code AS cat
       FROM ${ops("followups")} f LEFT JOIN incidents i ON i.incident_id = f.incident_id WHERE f.status = 'pending' ORDER BY f.due_date LIMIT 600`).catch(orEmpty("deptsummary:followups")),
    // the steps this department owes on open cases (the pipeline's action list), due in the last 3 days or still to come
    q(`SELECT a.text, a.owner, a.status, DATE_FORMAT(a.due_at, '%Y-%m-%d %H:%i:%s') AS due, i.incident_id AS id, ${TITLE} AS title FROM actions a JOIN incidents i ON i.incident_id = a.incident_id
       WHERE ${OPEN_NOW} AND a.dept_code = ?${place.sql} AND a.status NOT IN ('Done', 'Verified') AND a.due_at >= (? - INTERVAL 3 DAY) ORDER BY a.due_at LIMIT 5`, [code, ...place.params, now]).catch(orEmpty("deptsummary:actions"))
  ]);

  const cur = kpi.cur as Record<string, number>, prev = kpi.prev as Record<string, number>;
  const T = totals[0] ?? {}, C = closing[0] ?? {};
  const resolved = n(cur.resolved), onTime = n(C.on_time), late = n(C.late);
  const minutes = spans.map((r) => Number(r.m)).filter((m) => Number.isFinite(m) && m >= 0);
  const kindPrev = new Map(kindsPrev.map((r) => [String(r.cat), n(r.n)]));
  const catLabel = cat ? categories().find((c) => c.code === cat)?.label ?? cat : null;

  // the news about its work: stories linked to its incidents in these filters, and (with no area chosen) unlinked ones of a kind it leads
  const leads = new Set(categories().filter((c) => c.lead === code && c.code !== "OTHER").map((c) => c.code));
  const linkedIds = [...new Set(stories.map((x) => x.incident).filter(Boolean))] as string[];
  const mine = linkedIds.length
    ? new Set((await q(`SELECT i.incident_id AS id FROM incidents i WHERE i.incident_id IN (?)${any.sql}`, [linkedIds, ...any.params]).catch(orEmpty("deptsummary:linked"))).map((r) => String(r.id)))
    : new Set<string>();
  const news = stories.filter((x) => (x.incident ? mine.has(x.incident) : !zone && !taluk && !!x.desk?.cat && leads.has(x.desk.cat) && (!cat || x.desk.cat === cat)))
    .sort((a, b) => Number(b.desk?.v === "act") - Number(a.desk?.v === "act") || b.outletNames.length - a.outletNames.length || String(b.t).localeCompare(String(a.t)));

  const today = now.slice(0, 10);
  const owed = follow.filter((r) => (followupDept(r.summary) ?? r.dept) === code)
    // a case that has since closed asks for nothing more; under a filter, only a case known to be in it
    .filter((r) => (r.incident_id ? Number(r.open) === 1 : true) && (!zone || n(r.zone) === zone) && (!taluk || r.taluk === taluk) && (!cat || r.cat === cat))
    .map((r) => ({ id: n(r.id), incident: r.incident_id ? String(r.incident_id) : null, text: followupWords(r.summary), title: r.title ? String(r.title) : null,
      due: r.due ? String(r.due) : null, late: !!r.due && String(r.due) < today }));

  const areaRows = areas.map((r) => ({ key: n(r.k), name: zone ? `Ward ${r.k}` : String(r.name ?? `Zone ${r.k}`), n: n(r.n), open: n(r.open) }));
  const kindRows = kinds.map((r) => ({ cat: String(r.cat), label: String(r.label), n: n(r.n), open: n(r.open), prev: kindPrev.get(String(r.cat)) ?? 0 }));
  const where = [names.zone, names.taluk ? `${names.taluk} taluk` : null, catLabel].filter(Boolean).join(", ") || null;
  const med = median(minutes);

  return {
    code, name: String(dept.name ?? code), org: (dept.org as string | null) ?? null, head: (dept.head as string | null) ?? null, route: (dept.route as string | null) ?? null,
    now, period, periodInfo: periodInfo(period, now),
    /** what else the figures are filtered by, in words; null for the whole district */
    where, filters: { zone, taluk, cat }, areaKind: zone ? "ward" as const : "zone" as const,
    contacts: contacts.filter((c) => c.dept_code === code).slice(0, 3),
    figures: {
      reported: n(cur.reported), prevReported: n(prev.reported), open: n(cur.ongoing), prevOpen: n(prev.ongoing), urgent: n(cur.urgent), overdue: common.overdue,
      severe: n(cur.severe), prevSevere: n(prev.severe), severeOpen: n(cur.severe_open), resolved, prevResolved: n(prev.resolved),
      complaints: n(T.complaints), openComplaints: n(cur.complaints), deaths: n(T.dead), injured: n(T.injured), awaiting: check.n, leftToDepts: check.leftToDepts,
      medianMinutes: med, avgMinutes: average(minutes), newsOnly: common.newsOnly
    },
    days: series.days, weeks: series.weeks,
    severity: SEVS.map((k) => { const r = sev.find((x) => x.sev === k); return { sev: k, n: n(r?.n), open: n(r?.open) }; }),
    ages: ageBuckets(ages as { d: unknown; n: unknown }[]),
    kinds: kindRows, areas: areaRows,
    /** closed as resolved in the period: in time, late, or with no deadline on record; and what is open now against its deadline */
    deadline: { onTime, late, none: Math.max(0, resolved - onTime - late), openIn: Math.max(0, n(cur.ongoing) - common.overdue), openPast: common.overdue },
    cases: cases.map((r) => ({ id: String(r.id), title: String(r.title || r.type), type: String(r.type), loc: (r.loc as string | null) ?? null, zone: (r.zone_name as string | null) ?? null,
      sev: String(r.sev), status: String(r.status), complaints: n(r.complaints), dead: n(r.dead), overdue: isPastDeadline(r, now), t: String(r.t), why: explain(r).attention[0] ?? null })),
    news: news.slice(0, 4), newsTotal: news.length,
    followUps: owed.slice(0, 5), followUpsTotal: owed.length, followUpsLate: owed.filter((x) => x.late).length,
    tasks: tasks.map((r) => ({ id: String(r.id), title: String(r.title ?? ""), text: String(r.text ?? ""), owner: (r.owner as string | null) ?? null, due: String(r.due ?? ""), late: !!r.due && String(r.due) < now })),
    summary: deptSentences({ name: String(dept.name ?? code), period, now, where, reported: n(cur.reported), prevReported: n(prev.reported), open: n(cur.ongoing), overdue: common.overdue,
      severeOpen: n(cur.severe_open), resolved, onTime, timed: onTime + late, deaths: n(T.dead), medianMinutes: med, kinds: kindRows, areas: areaRows })
  };
}
