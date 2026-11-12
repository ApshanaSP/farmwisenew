/**
 * Turns a filed petition or online complaint into a real case. The officer and Collector consoles read the build's incidents, and the
 * pipeline that makes them never sees what the website saves on the AWS store (it reads complaints from MySQL), so without this a new
 * filing reaches nobody. A case is added at once when it is filed (addCaseLive), and again to each new build as it loads (websiteCases),
 * from the durable store. A filing the pipeline already holds (same complaint number) is left alone.
 */
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import intelPool from "@/lib/collector/db";
import { DEPT_CONFIG, codeForPortalDept } from "@/lib/officer/departments";
import { bumpDataEpoch } from "@/lib/collector/epoch";

type Row = Record<string, any>;
export interface Db { all(sql: string, params?: unknown[]): Promise<Row[]>; run(sql: string, params?: unknown[]): Promise<void> }

export interface CaseInput {
  code: string;
  filedAt: string;
  dueAt: string;
  hoursToAct: number;
  dept: string;
  category: string;
  title: string;
  text: string;
  lang: string;
  ward: number;
  /** street and area, never the door number: this text is shown in lists */
  place: string;
  urgent: boolean;
  /** mobile number or account, as a one-way hash: lets the console group one person's reports */
  reporter: string | null;
  channel: "manu" | "citizen_grievance";
  recurrence: number;
}

export const caseIdFor = (code: string): string => `INC-W-${code}`;
const eventIdFor = (code: string): string => `GRV-${code}`;
export const reporterHash = (v: string | number | null | undefined): string | null =>
  v == null || v === "" ? null : createHash("sha256").update(`reporter:${v}`).digest("hex").slice(0, 16);

/** A steady small offset inside the ward, so a ward's petitions do not stack on one point. */
function spread(code: string): [number, number] {
  const h = createHash("sha256").update(code).digest();
  return [((h[0] / 255) - 0.5) * 0.004, ((h[1] / 255) - 0.5) * 0.004];
}

async function columns(db: Db, table: string): Promise<Set<string>> {
  return new Set((await db.all(`SELECT name FROM pragma_table_info('${table}')`)).map((r) => String(r.name)));
}

async function insert(db: Db, table: string, row: Row, cols: Set<string>): Promise<void> {
  const names = Object.keys(row).filter((c) => cols.has(c));
  await db.run(`INSERT INTO ${table} (${names.map((c) => `\`${c}\``).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, names.map((c) => row[c] ?? null));
}

async function known(db: Db, code: string): Promise<boolean> {
  return (await db.all(`SELECT 1 AS x FROM events WHERE event_id = ? OR (source = 'grievance' AND source_record_id = ?) LIMIT 1`, [eventIdFor(code), code])).length > 0;
}

/** The event, its membership of the case, and the first line of its timeline. */
async function addReport(db: Db, incidentId: string, c: CaseInput, where: { lat: number | null; lon: number | null; zone: number | null; taluk: string | null }, sev: string, family: string): Promise<void> {
  const eventId = eventIdFor(c.code);
  const deep = `/track?code=${encodeURIComponent(c.code)}`;
  await insert(db, "events", {
    event_id: eventId, source: "grievance", source_record_id: c.code, deep_link: deep, is_synthetic: 0, is_overlay: 0, occurred_at: c.filedAt, reported_at: c.filedAt,
    time_precision: "filed_time", title: c.title, text: c.text, lang: c.lang, junk_flag: 0, category_src: "Petition", category_code: c.category, category_family: family, category_conf: 0.9,
    category_method: "ai:petition", dept_src: DEPT_CONFIG[c.dept]?.portalName ?? c.dept, lead_dept: c.dept, support_depts: "", is_actionable: 1, lat: where.lat, lon: where.lon, loc_precision_m: 500,
    place_text: c.place, ward_no: c.ward, zone_no: where.zone, taluk_code: where.taluk, geo_level: "ward", geo_method: "petition", geo_conf: 0.7, in_district: 1, severity_level: sev,
    status_src: "Complaint Filed", status_std: "Open", status_at: c.filedAt, channel: c.channel, reporter_hash: c.reporter, source_reliability: 1, incident_id: incidentId, link_method: "website"
  }, await columns(db, "events"));
  await insert(db, "incident_members", {
    incident_id: incidentId, event_id: eventId, source: "grievance", source_record_id: c.code, channel: c.channel, reported_at: c.filedAt, link_method: "website",
    severity_level: sev, status_std: "Open", deep_link: deep, title: c.title, is_overlay: 0, role: "corroboration"
  }, await columns(db, "incident_members"));
  await insert(db, "incident_timeline", {
    event_id: eventId, at: c.filedAt, step: "First report", status_std: "Open",
    actor: c.channel === "manu" ? "Collector's office" : "Citizen",
    note: c.channel === "manu" ? "Manu (paper petition) received and checked at the Collector's office." : "Complaint registered by citizen.",
    source: "grievance", incident_id: incidentId
  }, await columns(db, "incident_timeline"));
}

/** A new case for this filing. Returns its id, or null when the pipeline already has the filing. */
export async function addCase(db: Db, c: CaseInput): Promise<string | null> {
  if (await known(db, c.code)) return null;
  const [w] = await db.all(`SELECT zone_no, zone_name, taluk_code, centroid_lat, centroid_lon FROM ref_wards WHERE ward_no = ?`, [c.ward]);
  const [cat] = (await db.all(`SELECT category_code, label, family FROM ref_categories WHERE category_code = ?`, [c.category]))
    .concat(await db.all(`SELECT category_code, label, family FROM ref_categories WHERE category_code = 'OTHER'`));
  const [dLat, dLon] = spread(c.code);
  const lat = w?.centroid_lat != null ? Number(w.centroid_lat) + dLat : null, lon = w?.centroid_lon != null ? Number(w.centroid_lon) + dLon : null;
  const id = caseIdFor(c.code);
  const sev = c.urgent ? "High" : "Medium";
  const category = cat?.category_code ?? "OTHER";
  const channelWord = c.channel === "manu" ? "Manu (paper petition)" : "Online complaint";
  await insert(db, "incidents", {
    incident_id: id, category_code: category, category_label: cat?.label ?? "Other", family: cat?.family ?? "OTHER", lead_dept: c.dept, depts_involved: c.dept, support_depts: "", needs_coordination: 0,
    first_reported_at: c.filedAt, occurred_at_est: c.filedAt, last_update_at: c.filedAt, ward_no: c.ward, zone_no: w?.zone_no ?? null, zone_name: w?.zone_name ?? null, taluk_code: w?.taluk_code ?? null,
    lat, lon, loc_precision_m: 500, place_text: c.place, spread_m: 0, member_count: 1, sources: "grievance", source_count: 1, channels: c.channel, citizen_complaints: 1, police_reports: 0, outlet_count: 0,
    has_official_record: 1, media_only: 0, is_synthetic_any: 0, is_overlay_any: 0, status_std: "Open", verified: 0, is_open: 1, severity_score: c.urgent ? 75 : 40, severity_level: sev,
    severity_reasons: c.urgent ? "Describes an immediate hazard" : "", dead: 0, injured: 0, vulnerable: "", weather_related: 0,
    officer: w?.zone_name ? `Zonal Officer, ${w.zone_name}` : "", reliability: 1, confidence: 0.9, needs_review: 0, review_reason: "", sla_hours: c.hoursToAct, sla_due_at: c.dueAt, hours_open: 0, sla_basis: "resolution",
    sla_ratio: 0, sla_breached: 0, growth_24h: 0, recurrence_90d: c.recurrence, rain_coupled: 0, priority_score: c.urgent ? 90 : 45 + Math.min(c.recurrence, 4) * 8,
    priority_reasons: [c.urgent ? "Urgent" : channelWord, c.recurrence ? `written about ${c.recurrence} time${c.recurrence === 1 ? "" : "s"} before` : ""].filter(Boolean).join("; "),
    awaiting_collector: 0, attention_reason: c.urgent ? "Urgent petition given at the Collector's office" : "", attention_flag: c.urgent ? 1 : 0, title: c.title, headline: c.title,
    summary: `${channelWord} about ${c.title.replace(/\.$/, "")}. ${c.place}, Ward ${c.ward}. Filed ${c.filedAt.slice(0, 10)}.`, action_total: 0, action_done: 0
  }, await columns(db, "incidents"));
  await addReport(db, id, c, { lat, lon, zone: w?.zone_no ?? null, taluk: w?.taluk_code ?? null }, sev, cat?.family ?? "OTHER");
  return id;
}

/** This filing as one more report in an existing case. False when that case is not in this build. */
export async function attachToCase(db: Db, incidentId: string, c: CaseInput): Promise<boolean> {
  const [i] = await db.all(`SELECT incident_id, lat, lon, zone_no, taluk_code, severity_level, family, channels FROM incidents WHERE incident_id = ?`, [incidentId]);
  if (!i) return false;
  if (await known(db, c.code)) return true;
  await addReport(db, incidentId, c, { lat: i.lat, lon: i.lon, zone: i.zone_no, taluk: i.taluk_code }, String(i.severity_level ?? "Medium"), String(i.family ?? "OTHER"));
  const channels = [...new Set([...String(i.channels ?? "").split("|").filter(Boolean), c.channel])].sort().join("|");
  await db.run(`UPDATE incidents SET member_count = COALESCE(member_count, 0) + 1, citizen_complaints = COALESCE(citizen_complaints, 0) + 1, channels = ?, last_update_at = ?,
    recurrence_90d = COALESCE(recurrence_90d, 0) + 1 ${c.urgent ? ", attention_flag = 1, attention_reason = 'Urgent petition given at the Collector''s office', priority_score = 90" : ""} WHERE incident_id = ?`, [channels, c.filedAt, incidentId]);
  return true;
}

const live: Db = {
  all: async (sql, params = []) => (await intelPool.query(sql, params))[0] as unknown as Row[],
  run: async (sql, params = []) => { await intelPool.query(sql, params); }
};

/**
 * Puts a filing into the build being served. Only the AWS store needs this: on MySQL the pipeline reads the complaint itself. A failure
 * is logged and the filing stands; the next build picks it up from the durable store.
 */
export async function addCaseLive(c: CaseInput, attachTo?: string | null): Promise<string> {
  const id = attachTo ?? caseIdFor(c.code);
  if (process.env.DATA_BACKEND !== "aws") return id;
  try {
    // a new or bigger case changes the figures: the caches that hold a read start again (pass 4's RC-35; QA pass 5, P5-015)
    if (attachTo && (await attachToCase(live, attachTo, c))) { bumpDataEpoch(); return attachTo; }
    await addCase(live, c);
    bumpDataEpoch();
    return caseIdFor(c.code);
  } catch (e) {
    console.warn(`[manu] case for ${c.code} not added to the current build: ${(e as Error).message}`);
    return id;
  }
}

/** The usual kind of case for an online complaint, from its department. */
const ONLINE_CATEGORY: Record<string, string> = {
  "GCC-SWM": "SOLID_WASTE", "GCC-SWD": "FLOOD_WATERLOGGING", "GCC-ENG": "ROAD_DAMAGE", "GCC-ELE": "STREETLIGHT_ELECTRICAL", "GCC-HLT": "VECTOR_DISEASE", "GCC-PRK": "TREES_PARKS", "GCC-BRG": "PUBLIC_WORKS", "GCC-BLD": "CIVIC_FACILITIES"
};
const ONLINE_HOURS = 120;

/** An online complaint's case, from its row. */
export function onlineCase(c: Row, deptName: string | null): CaseInput {
  const dept = codeForPortalDept(deptName) ?? "GCC-GAD";
  const at = String(c.created_at).replace("T", " ").slice(0, 19);
  const due = new Date(Date.parse(`${at.replace(" ", "T")}Z`) + ONLINE_HOURS * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
  return {
    code: String(c.complaint_code), filedAt: at, dueAt: due, hoursToAct: ONLINE_HOURS, dept, category: ONLINE_CATEGORY[dept] ?? "ADMIN_SERVICES", title: String(c.title), text: String(c.description ?? c.title),
    lang: /[஀-௿]/.test(String(c.description ?? "")) ? "ta" : "en", ward: Number(c.ward_number), place: String(c.specific_location || c.street_address || `Ward ${c.ward_number}`).slice(0, 200), urgent: false,
    reporter: reporterHash(c.mobile_number || c.user_id), channel: "citizen_grievance", recurrence: 0
  };
}

export function petitionCase(p: Row): CaseInput {
  return {
    code: String(p.complaint_code), filedAt: String(p.filed_at).replace("T", " ").slice(0, 19), dueAt: String(p.due_at).replace("T", " ").slice(0, 19),
    hoursToAct: Math.max(1, Math.round((Date.parse(`${String(p.due_at).replace(" ", "T")}Z`) - Date.parse(`${String(p.filed_at).replace(" ", "T")}Z`)) / 3_600_000)),
    dept: String(p.dept_code), category: String(p.category_code || "OTHER"), title: String(p.problem), text: [p.problem, p.request].filter(Boolean).join(" "), lang: String(p.language || "en"),
    ward: Number(p.ward_number), place: String(p.area || `Ward ${p.ward_number}`).slice(0, 200), urgent: Number(p.urgent) === 1, reporter: reporterHash(p.mobile), channel: "manu", recurrence: 0
  };
}

/** Build step (derive.ts): every filing the website holds goes into each new build. */
export async function websiteCases(db: DatabaseSync): Promise<void> {
  const wrap: Db = {
    all: async (sql, params = []) => db.prepare(sql).all(...(params as never[])) as Row[],
    run: async (sql, params = []) => { db.prepare(sql).run(...(params as never[])); }
  };
  const has = async (t: string) => (await wrap.all(`SELECT name FROM pragma_table_info('${t}')`)).length > 0;
  if (!(await has("incidents")) || !(await has("events")) || !(await has("ref_wards"))) return;
  let added = 0;
  if (await has("petitions")) {
    for (const p of await wrap.all(`SELECT * FROM petitions WHERE status = 'filed' AND complaint_code IS NOT NULL ORDER BY filed_at, id`)) {
      const c = petitionCase(p);
      if (Number(p.attached) === 1 && p.incident_id && (await attachToCase(wrap, String(p.incident_id), c))) { added++; continue; }
      if (await addCase(wrap, c)) added++;
    }
  }
  if (await has("complaints")) {
    const petition = (await has("petitions")) ? "AND c.complaint_code NOT IN (SELECT complaint_code FROM petitions WHERE complaint_code IS NOT NULL)" : "";
    for (const r of await wrap.all(`SELECT c.*, d.name AS dept_name FROM complaints c LEFT JOIN departments d ON d.id = c.department_id
        WHERE COALESCE(c.is_synthetic, 0) = 0 AND c.user_id IS NOT NULL ${petition} ORDER BY c.created_at`))
      if (await addCase(wrap, onlineCase(r, r.dept_name ?? null))) added++;
  }
  if (added) console.log(`[manu] ${added} website filings added to this build`);
}
