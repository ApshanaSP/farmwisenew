/**
 * How each resolved case was resolved, for the Resolved lists (the Collector's Resolved tile, the officer's Verified tab / Resolved tile):
 * the department's completion report (its remark, its photos and who sent it), who approved the close (the Collector, or the department
 * itself), and when. A case closed with no report from a console is described from the pipeline's own record (its "Resolved" step).
 *
 * Also the Collector's Resolved list itself (`resolvedList`): the same cases the tile counts (closed in the window, effective status
 * Resolved: intel.ts kpiBlock), one row per incident, the ones with a completion report first, newest closing first.
 */
import intelPool, { CLUSTER, TITLE, ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";
import { asOf, scopeWhere, wordsWhere } from "@/lib/collector/intel";
import { PLACE_FILTERS, type PlaceFilter } from "@/lib/collector/mapplace";
import type { Period } from "@/lib/period/day";
import { CLOSED_BY_DEPARTMENT, scrubCitizenDetails } from "@/lib/collector/scrub";
import { photoUrl } from "@/lib/officer/photos";

type Row = Record<string, any>;

async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query(sql, params);
  return r as unknown as T[];
}
const fmt = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

export interface Resolution {
  /** the completion report's photos (URLs through the access-checked photo route), first one the thumbnail */
  photos: string[];
  /** the officer's remark (for the Collector, without a citizen's name, phone or address: scrub.ts), or the pipeline record's note */
  remark: string | null;
  /** who sent the report (the officer's account, or the field officer on record) */
  by: string | null;
  /** when the report was sent */
  sentAt: string | null;
  /** who approved the close: the Collector, the department itself, or (no console decision) the department's own records */
  approvedBy: "collector" | "department" | "records";
  /** when it was closed (the closing decision, or the record's Resolved step) */
  closedAt: string | null;
  /** true when the report came from a console (a completion report), false when the remark is the pipeline record's note */
  report: boolean;
}

/** The resolution of each of these incidents that has one (a report, a closing decision or a Resolved record). */
export async function resolutionsFor(ids: string[], opts: { forCollector?: boolean } = {}): Promise<Record<string, Resolution>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const [reports, decisions, records] = await Promise.all([
    q(`SELECT report_id, incident_id, remarks, photo_dir, photos, sent_by, ${fmt("sent_at")} AS t FROM ${ops("officer_reports")}
       WHERE incident_id IN (?) ORDER BY sent_at, report_id`, [uniq]).catch(() => [] as Row[]),
    q(`SELECT incident_id, decision, decided_role, ${fmt("decided_at")} AS t FROM ${ops("collector_decisions")}
       WHERE incident_id IN (?) AND decision IN ('verify', 'resolve', 'reopen', 'reject') ORDER BY decision_id`, [uniq]).catch(() => [] as Row[]),
    q(`SELECT incident_id, ${fmt("at")} AS t, note, actor FROM incident_timeline WHERE incident_id IN (?) AND step = 'Resolved' ORDER BY at`, [uniq]).catch(() => [] as Row[])
  ]);
  const last = <T extends Row>(rows: T[]) => { const m = new Map<string, T>(); for (const r of rows) m.set(String(r.incident_id), r); return m; };
  const rep = last(reports), dec = last(decisions), rec = last(records);
  const out: Record<string, Resolution> = {};
  for (const id of uniq) {
    const r = rep.get(id), d = dec.get(id), t = rec.get(id);
    // a reopen as the latest decision: the case is open again, nothing is resolved
    if (d?.decision === "reopen" || d?.decision === "reject") continue;
    if (!r && !d && !t) continue;
    let names: string[] = [];
    try { names = r ? (Array.isArray(r.photos) ? r.photos : JSON.parse(String(r.photos || "[]"))).map(String) : []; } catch { names = []; }
    const remark = r ? String(r.remarks ?? "") : t?.note ? String(t.note) : null;
    out[id] = {
      photos: r ? names.map((n) => photoUrl(String(r.photo_dir), n)) : [],
      remark: remark == null ? null : opts.forCollector ? scrubCitizenDetails(remark) : remark,
      by: r ? String(r.sent_by ?? "") || null : t?.actor ? String(t.actor) : null,
      sentAt: r ? String(r.t) : null,
      approvedBy: d ? (d.decided_role === "department_officer" ? "department" : "collector") : "records",
      closedAt: d ? String(d.t) : t ? String(t.t) : null,
      report: !!r
    };
  }
  return out;
}

/** The decision note an officer's own close writes ("Closed by the department: ...") read as its remark, for a close with no report row. */
export const closeNoteRemark = (note: unknown): string | null =>
  typeof note === "string" && note.startsWith(CLOSED_BY_DEPARTMENT) ? note.slice(CLOSED_BY_DEPARTMENT.length).trim() || null : null;

export interface ResolvedFilter {
  period: Period;
  zone: number | null;
  dept: string | null;
  sev: string | null;
  cat?: string | null;
  taluk?: string | null;
  place?: PlaceFilter | null;
  complaints?: boolean;
  q: string | null;
  page: number;
}

/** rows per page (the Collector's list pages by 12) */
export const RESOLVED_PER = 12;

/**
 * The Collector's Resolved list: incidents closed in the period (by when they closed, as the tile counts them: intel.ts kpiBlock, PB-214)
 * whose effective status is Resolved, in the console's zone / department / category / taluk, one row per incident (the tile counts
 * incidents). Cases closed with a completion report (photo and remark) come first, then the newest closing. Each row has its resolution.
 */
export async function resolvedList(f: ResolvedFilter) {
  const now = await asOf();
  const EFF = effectiveSql(ops("collector_decisions"));
  const w = scopeWhere({ period: f.period, zone: f.zone, dept: f.dept, cat: f.cat ?? null, taluk: f.taluk ?? null }, now, true);
  const where = [w.sql, `${EFF.open} = 0 AND ${EFF.status} = 'Resolved'`];
  const params: unknown[] = [...w.params];
  if (f.sev) (where.push("i.severity_level = ?"), params.push(f.sev));
  if (f.place) where.push(PLACE_FILTERS[f.place]);
  if (f.complaints) where.push("i.citizen_complaints > 0");
  if (f.q) { const s = wordsWhere(f.q); where.push(s.sql); params.push(...s.params); }
  const W = where.join(" AND ");
  // "report first" means a report WITH a photo: a close with remarks only writes a report row with photos '[]', which would otherwise
  // rank among the photo cases with a blank placeholder
  const hasReport = `EXISTS (SELECT 1 FROM ${ops("officer_reports")} r WHERE r.incident_id = i.incident_id AND r.photos IS NOT NULL AND r.photos <> '[]' AND r.photos <> '')`;
  const [rows, [tot]] = await Promise.all([
    q(`SELECT i.incident_id AS id, ${TITLE} AS title, i.category_label AS type, i.category_code AS cat_code, i.lead_dept AS dept, dp.name AS dept_name,
              i.zone_no AS zone, i.zone_name, i.ward_no AS ward, i.place_text AS loc, i.severity_level AS sev, ${EFF.status} AS status,
              ${fmt("i.first_reported_at")} AS t, ${fmt(EFF.closedAt)} AS closed, i.citizen_complaints AS complaints, i.sources, i.channels,
              ${fmt("i.sla_due_at")} AS sla_due, ${CLUSTER} AS grp, ${hasReport} AS has_report
       FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept
       WHERE ${W} ORDER BY has_report DESC, ${EFF.closedAt} DESC, i.incident_id LIMIT ${RESOLVED_PER} OFFSET ?`, [...params, Math.max(0, f.page) * RESOLVED_PER]),
    q(`SELECT COUNT(*) AS n, COALESCE(SUM(i.citizen_complaints), 0) AS c, SUM(${hasReport}) AS reported FROM incidents i WHERE ${W}`, params)
  ]);
  const res = await resolutionsFor(rows.map((r) => String(r.id)), { forCollector: true });
  const n = Number(tot?.n ?? 0);
  return {
    rows: rows.map((r): Row => ({ ...r, has_report: Number(r.has_report) === 1, complaints: Number(r.complaints ?? 0), resolution: res[String(r.id)] ?? null })),
    /** one row per incident, so the rows, the incidents and the tile agree */
    total: n, incidents: n, complaints: Number(tot?.c ?? 0),
    /** how many of them were closed with a completion report from a console */
    withReport: Number(tot?.reported ?? 0),
    resolvedList: true as const
  };
}
