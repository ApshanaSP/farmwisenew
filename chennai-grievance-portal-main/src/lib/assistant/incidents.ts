/**
 * Incident retrieval for the assistant: the incidents themselves (never category counts in their place), one incident
 * in full, incidents like a selected one nearby, and the actions on record. Read-only, parameterised SQL over the
 * store; the ranking is the pipeline's explainable priority score. Text comes from the store: the pipeline's
 * number-checked AI summary when it exists, else the rule-based summary.
 */
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { explain, incident as incidentFull, periodWindow, PERIODS, type Period } from "@/lib/collector/intel";
import { categories } from "@/lib/collector/nlp";
import type { ActionItem, EvidenceItem, IncidentDetail, IncidentItem, TimelineStep } from "@/lib/assistant/answer";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}
const num = (v: unknown) => Number(v ?? 0);

export interface IncidentFilters {
  period: Period;
  zone?: number | null;
  taluk?: string | null;
  dept?: string | null;
  /** categories (a topic may cover several) */
  cats?: string[] | null;
  sev?: "Severe" | "High" | null;
  openOnly?: boolean;
}

const COLS = `i.incident_id AS id, i.title, i.category_label AS type, i.category_code AS cat, i.lead_dept AS dept, dp.name AS dept_name,
  i.zone_no AS zone, i.zone_name, i.ward_no AS ward, i.place_text AS loc, tk.name AS taluk_name, i.severity_level AS sev, i.status_std AS status,
  i.is_open AS open, i.citizen_complaints AS complaints, i.source_count, i.sources, i.member_count, i.outlet_count, i.media_only,
  i.priority_score AS priority, i.sla_breached AS breached, i.severity_reasons, i.priority_reasons, i.attention_reason, i.dead, i.injured,
  i.lat, i.lon, i.summary, i.ai_summary, i.ai_attention, i.ai_next_step, i.verified,
  DATE_FORMAT(i.first_reported_at, '%Y-%m-%d %H:%i:%s') AS t, DATE_FORMAT(i.sla_due_at, '%Y-%m-%d %H:%i:%s') AS due,
  DATE_FORMAT(i.closed_at, '%Y-%m-%d %H:%i:%s') AS closed_at`;
const FROM = `FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept LEFT JOIN ref_taluks tk ON tk.taluk_code = i.taluk_code`;

function where(f: IncidentFilters, now: string, hours?: number, off = 0) {
  const w = periodWindow(f.period, now, "i.first_reported_at", off, hours);
  const parts = [w.sql], params: unknown[] = [...w.params];
  if (f.zone) (parts.push("i.zone_no = ?"), params.push(f.zone));
  if (f.taluk) (parts.push("i.taluk_code = ?"), params.push(f.taluk));
  if (f.dept) (parts.push("i.lead_dept = ?"), params.push(f.dept));
  if (f.cats?.length) (parts.push("i.category_code IN (?)"), params.push(f.cats));
  if (f.sev === "Severe") parts.push("i.severity_level = 'Severe'");
  if (f.sev === "High") parts.push("i.severity_level IN ('Severe', 'High')");
  if (f.openOnly) parts.push("i.is_open = 1");
  return { sql: parts.join(" AND "), params };
}

const SOURCE_LABEL: Record<string, string> = { news: "News report", police: "Police record", grievance: "Citizen complaint", pwd: "PWD record",
  hospital: "Hospital report", imd: "IMD warning", cpcb: "Air-quality reading", cfm: "Flood monitoring" };

/**
 * Why an incident ranks high, in plain words, from the pipeline's priority reasons and attention flags (every reason,
 * not only the ones that put it on the Collector's list). Nothing is added that the record does not say.
 */
export function reasonsOf(r: Row): string[] {
  const out: string[] = [];
  const add = (s: string) => { if (!out.includes(s)) out.push(s); };
  if (num(r.dead)) add(`${num(r.dead)} ${num(r.dead) === 1 ? "death" : "deaths"} reported`);
  if (num(r.injured)) add(`${num(r.injured)} injured`);
  const pr = String(r.priority_reasons ?? "").split(";").slice(1).map((s) => s.trim().toLowerCase()).filter(Boolean);
  let m: RegExpMatchArray | null;
  for (const p of pr) {
    if ((m = p.match(/^reported by (\d+) sources/))) add(`Reported by ${m[1]} sources`);
    else if ((m = p.match(/^(\d+) citizen complaints/))) add(`${m[1]} citizen complaints`);
    else if ((m = p.match(/^(resolution|response) over twice the (\d+) h target/))) add(`${m[1] === "response" ? "No response" : "Still open"} at more than twice its ${m[2]}-hour deadline`);
    else if ((m = p.match(/^(resolution|response) past the (\d+) h target/))) add(`Past its ${m[2]}-hour ${m[1]} deadline`);
    else if (p === "not yet verified by an officer") add("Not yet confirmed by an officer on the ground");
    else if ((m = p.match(/^(\d+) new reports in 24 h/))) add(`${m[1]} new reports in the last 24 hours`);
    else if (p.startsWith("affects ")) add(`Affects ${p.slice(8).replace(/_/g, " ")}`);
    else if ((m = p.match(/^covered by (\d+) news outlets/))) add(`Covered by ${m[1]} news outlets`);
    else if (p.startsWith("in the news but not")) add("In the news, but no department has a record of it");
    else if (p === "linked to a rain event") add("Linked to a rain event");
    else if ((m = p.match(/^(\d+) similar incidents here in (\d+) days/))) add(`${m[1]} similar incidents at this place in ${m[2]} days`);
  }
  if (/several departments/i.test(String(r.attention_reason ?? ""))) add("Needs several departments to act together");
  if (!out.length) add(`${r.sev} severity`);
  return out.slice(0, 5);
}

/** What happened, 1-2 sentences: the pipeline's AI summary (number-checked) when it exists, else the rule summary with its facts. */
function summaryOf(r: Row): { text: string; ai: boolean } {
  if (r.ai_summary) return { text: String(r.ai_summary), ai: true };
  const w = explain(r);
  return { text: `${w.summary}${w.facts.length ? ` ${w.facts.join(" · ")}.` : ""}`, ai: false };
}

async function evidenceFor(ids: string[]): Promise<Map<string, EvidenceItem[]>> {
  const out = new Map<string, EvidenceItem[]>();
  if (!ids.length) return out;
  const rows = await q(
    `SELECT * FROM (SELECT m.incident_id AS id, m.source, m.title, DATE_FORMAT(m.reported_at, '%Y-%m-%d %H:%i:%s') AS t, d.url, d.publisher,
            ROW_NUMBER() OVER (PARTITION BY m.incident_id ORDER BY m.reported_at) AS rn
     FROM incident_members m LEFT JOIN documents d ON d.event_id = m.event_id WHERE m.incident_id IN (?)) x WHERE rn <= 6`, [ids]);
  for (const r of rows) {
    const list = out.get(r.id) ?? out.set(r.id, []).get(r.id)!;
    // a citizen's complaint text and identity stay in the console: its title only
    list.push({ kind: r.source, label: SOURCE_LABEL[r.source] ?? r.source, title: r.title ?? null, publisher: r.publisher ?? null, url: r.url ?? null, t: r.t ?? null });
  }
  return out;
}

export function itemOf(r: Row, ev: EvidenceItem[] = []): IncidentItem {
  const s = summaryOf(r);
  return {
    incidentId: String(r.id), title: String(r.title || r.type), summary: s.text, aiWritten: s.ai, category: String(r.type ?? ""),
    location: r.loc ?? null, ward: r.ward == null ? null : Number(r.ward), zone: r.zone_name ?? null, taluk: r.taluk_name ?? null,
    occurredAt: r.t ?? null, severity: String(r.sev ?? ""), priorityScore: r.priority == null ? null : Math.round(Number(r.priority) * 10) / 10,
    priorityReasons: reasonsOf(r), status: String(r.status ?? ""), department: r.dept_name ?? r.dept ?? null,
    sourceCount: num(r.source_count), newsOutletCount: num(r.outlet_count), citizenComplaintCount: num(r.complaints), dead: num(r.dead), injured: num(r.injured),
    lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon), evidence: ev
  };
}

const WIDER: Period[] = ["daily", "weekly", "monthly", "quarterly"];

/**
 * The top `n` incidents for the filters, by the pipeline's priority score (open ones first) or newest first. When the
 * period holds fewer than `n`, the window widens one step at a time (said on the card), so "top 3" shows three.
 */
export async function rankedIncidents(f: IncidentFilters, now: string, n: number, order: "priority" | "recent" = "priority") {
  const by = order === "priority" ? "i.is_open DESC, i.priority_score DESC, i.first_reported_at DESC" : "i.first_reported_at DESC";
  let period = f.period, rows: Row[] = [], total = 0;
  for (let k = WIDER.indexOf(f.period); k < WIDER.length; k++) {
    period = WIDER[Math.max(0, k)];
    const w = where({ ...f, period }, now);
    [rows, [{ total }]] = await Promise.all([q(`SELECT ${COLS} ${FROM} WHERE ${w.sql} ORDER BY ${by} LIMIT ?`, [...w.params, n]),
      q<{ total: number }>(`SELECT COUNT(*) AS total FROM incidents i WHERE ${w.sql}`, w.params)]);
    if (rows.length >= n || order === "recent") break;
  }
  const ev = await evidenceFor(rows.map((r) => String(r.id)));
  return { items: rows.map((r) => itemOf(r, ev.get(String(r.id)) ?? [])), total: num(total), period, widened: period !== f.period };
}

/** Given incidents in the given order (a follow-up on an earlier list: "make that a map"). */
export async function incidentsByIds(ids: string[]): Promise<IncidentItem[]> {
  if (!ids.length) return [];
  const rows = await q(`SELECT ${COLS} ${FROM} WHERE i.incident_id IN (?)`, [ids]);
  const ev = await evidenceFor(ids);
  const by = new Map(rows.map((r) => [String(r.id), r]));
  return ids.map((id) => by.get(id)).filter(Boolean).map((r) => itemOf(r!, ev.get(String(r!.id)) ?? []));
}

/** How many, with severe, open and deaths, against the period before. */
export async function countIncidents(f: IncidentFilters, now: string) {
  const w = where(f, now), p = where(f, now, undefined, 1);
  const [[a], [b]] = await Promise.all([
    q(`SELECT COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe, SUM(i.is_open) AS open, SUM(COALESCE(i.dead, 0)) AS dead FROM incidents i WHERE ${w.sql}`, w.params),
    q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${p.sql}`, p.params)]);
  return { n: num(a?.n), severe: num(a?.severe), open: num(a?.open), dead: num(a?.dead), prev: num(b?.n) };
}

/** Kinds of incident ranked by how many, against the period before. */
export async function categoryRanking(f: IncidentFilters, now: string, n: number) {
  const w = where(f, now), p = where(f, now, undefined, 1);
  const [rows, prev] = await Promise.all([
    q(`SELECT i.category_code AS cat, i.category_label AS label, COUNT(*) AS n, SUM(i.severity_level = 'Severe') AS severe
       FROM incidents i WHERE ${w.sql} GROUP BY 1, 2 ORDER BY n DESC LIMIT ?`, [...w.params, n]),
    q(`SELECT i.category_code AS cat, COUNT(*) AS n FROM incidents i WHERE ${p.sql} GROUP BY 1`, p.params)]);
  const before = new Map(prev.map((r) => [r.cat, num(r.n)]));
  return rows.map((r) => ({ cat: String(r.cat), label: String(r.label), n: num(r.n), severe: num(r.severe), prev: before.get(r.cat) ?? 0 }));
}

/** One incident in full: what happened, where, when, status, why, who, how it unfolded, and the evidence. */
export async function incidentDetail(id: string, focus: IncidentDetail["focus"] = "all"): Promise<IncidentDetail | null> {
  const [[r], full, steps] = await Promise.all([
    q(`SELECT ${COLS} ${FROM} WHERE i.incident_id = ?`, [id]),
    incidentFull(id),
    q(`SELECT DATE_FORMAT(at, '%Y-%m-%d %H:%i:%s') AS t, step, actor, note FROM incident_timeline WHERE incident_id = ? ORDER BY at LIMIT 30`, [id]).catch(() => [] as Row[])
  ]);
  if (!r || !full) return null;
  const why = explain(r);
  const reports = full.reports as Row[];
  const evidence: EvidenceItem[] = reports.slice(0, 12).map((x) => ({ kind: x.source, label: SOURCE_LABEL[x.source] ?? x.what ?? x.source,
    title: x.title ?? null, publisher: x.publisher ?? null, url: x.url ?? null, t: x.t ?? null }));
  // the incident's own timeline when the pipeline recorded one; else its linked reports in time order
  const timeline: TimelineStep[] = (steps.length ? steps.map((s) => ({ t: s.t, step: String(s.step), actor: s.actor ?? null, note: s.note ? String(s.note).slice(0, 160) : null }))
    : reports.map((x) => ({ t: x.t, step: x.first ? "First report" : x.what ?? "Report", actor: x.publisher ?? SOURCE_LABEL[x.source] ?? null, note: x.title ?? null })))
    .slice(0, 12);
  const base = itemOf(r, evidence);
  const sentences = [base.summary];
  // a second sentence from the record when the summary is the short rule line: how it was reported and where it stands
  if (!base.aiWritten) {
    // the report's own words (a headline, or a record's title) say what happened better than the category line
    const lead = reports.find((x) => x.first) ?? reports[0];
    if (lead?.title && String(lead.title).toLowerCase() !== String(r.title ?? "").toLowerCase() && !String(lead.title).startsWith(String(r.type)))
      sentences.push(`Reported${lead.publisher ? ` by ${lead.publisher}` : ""} as: “${String(lead.title).slice(0, 200)}”.`);
    else if (lead?.title && r.title && String(r.title) !== String(r.type) && !String(r.title).startsWith(String(r.type)))
      sentences.push(`Reported as: “${String(r.title).slice(0, 200)}”.`);
    const by = [...new Set(reports.map((x) => SOURCE_LABEL[x.source] ?? x.source))].slice(0, 3).join(", ").toLowerCase();
    sentences.push(`It was first reported ${r.t ? `on ${r.t.slice(0, 16)}` : ""}${by ? ` through ${by}` : ""}; it is ${String(r.status).toLowerCase()}${num(r.breached) ? " and past its deadline" : ""}.`);
  }
  return {
    ...base, whatHappened: sentences.join(" "), facts: why.facts, attention: why.needsYou ? why.attention : [], timeline,
    deadline: r.due ?? null, deadlineMissed: num(r.breached) === 1, closedAt: r.closed_at ?? null,
    officials: (full.contacts as Row[]).slice(0, 3).map((c) => ({ name: String(c.name), designation: c.designation ?? null, office: c.office ?? null })), focus
  };
}

/**
 * Incidents like a selected one: the same kind (else the same family), near it (within 2 km where it has a location,
 * else in its zone), within 60 days of it, closest first.
 */
export async function relatedIncidents(id: string, n = 5) {
  const [a] = await q(`SELECT ${COLS}, i.first_reported_at AS ts ${FROM} WHERE i.incident_id = ?`, [id]);
  if (!a) return null;
  const fam = categories().find((c) => c.code === a.cat);
  const family = fam?.family ? categories().filter((c) => c.family === fam.family).map((c) => c.code) : [a.cat];
  const km = 2;
  const near = a.lat != null && a.lon != null
    ? { sql: `111.32 * SQRT(POW(i.lat - ?, 2) + POW((i.lon - ?) * COS(RADIANS(?)), 2)) <= ?`, params: [a.lat, a.lon, a.lat, km] }
    : { sql: "i.zone_no = ?", params: [a.zone] };
  const dist = a.lat != null ? `111.32 * SQRT(POW(i.lat - ${Number(a.lat)}, 2) + POW((i.lon - ${Number(a.lon)}) * COS(RADIANS(${Number(a.lat)})), 2))` : "0";
  const run = (cats: string[]) => q(
    `SELECT ${COLS}, ROUND(${dist}, 2) AS km ${FROM}
     WHERE i.incident_id <> ? AND i.category_code IN (?) AND ${near.sql}
       AND i.first_reported_at BETWEEN (? - INTERVAL 60 DAY) AND (? + INTERVAL 60 DAY)
     ORDER BY km, i.first_reported_at DESC LIMIT ?`, [id, cats, ...near.params, a.ts, a.ts, n]);
  let rows = await run([a.cat]);
  let sameKind = true;
  if (rows.length < 2 && family.length > 1) { rows = await run(family); sameKind = false; }
  const ev = await evidenceFor(rows.map((r) => String(r.id)));
  return { anchor: itemOf(a), items: rows.map((r) => ({ ...itemOf(r, ev.get(String(r.id)) ?? []), km: r.km == null ? null : Number(r.km) })), km, sameKind,
    byZone: a.lat == null };
}

/** Actions on record for an incident: the department's open steps, the pipeline's AI next step, else the category's standard first step. */
export async function actionsFor(id: string): Promise<{ title: string; items: ActionItem[] } | null> {
  const [[r], steps] = await Promise.all([
    q(`SELECT ${COLS} ${FROM} WHERE i.incident_id = ?`, [id]),
    q(`SELECT text, owner, DATE_FORMAT(due_at, '%Y-%m-%d %H:%i:%s') AS due, status FROM actions WHERE incident_id = ? AND status NOT IN ('Done', 'Verified')
       ORDER BY sop_step IS NULL, sop_step, due_at LIMIT 6`, [id])]);
  if (!r) return null;
  const items: ActionItem[] = steps.map((s) => ({ text: String(s.text), owner: s.owner ?? null, due: s.due ?? null, from: "department action list" }));
  if (r.ai_next_step) items.unshift({ text: String(r.ai_next_step), owner: null, due: null, from: "AI, from this incident's records" });
  if (!items.length) {
    const c = categories().find((x) => x.code === r.cat);
    for (const p of (c?.playbook ?? []).slice(0, 3)) items.push({ text: p, owner: r.dept_name ?? null, due: null, from: "standard procedure for this category" });
  }
  return { title: String(r.title || r.type), items };
}

export const periodLabel = (p: Period) => PERIODS[p].label.toLowerCase();
