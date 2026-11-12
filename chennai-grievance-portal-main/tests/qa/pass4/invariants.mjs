// QA pass 4: data invariants. Loads the pinned snapshot directly into an in-memory node:sqlite database, with no app code and
// none of the app's build steps, and runs named SQL checks. So a failure here is a fact about the stored data. Whether the app
// shows it wrongly is judged separately (tests/qa/pass4/invariants-app.test.ts, which also reruns these checks after the app's build steps).
//
//   node tests/qa/pass4/invariants.mjs              runs every check, writes docs/qa/pass4/evidence/invariants.json and .md
//   node tests/qa/pass4/invariants.mjs --freeze     also rewrites tests/qa/pass4/invariants.guard.json (only when a check is added on purpose)
//
// Every check's SQL returns one row per problem, with the problem's id in a column called `id`. A check passes when it returns
// no rows. Examples are ids only: no text from a record is ever copied out, so no personal data reaches the evidence.
// Accounts: `users`, `user_profiles` and `sources` are loaded without their private columns, and `password_resets` not at all.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, "..", "..", "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
export const PIN_DIR = path.join(APP_ROOT, "data", "aws-cache", "qa", "pinned");
export const GUARD_FILE = path.join(here, "invariants.guard.json");
export const EVIDENCE_JSON = path.join(REPO_ROOT, "docs", "qa", "pass4", "evidence", "invariants.json");
export const EVIDENCE_AFTER_BUILD = path.join(REPO_ROOT, "docs", "qa", "pass4", "evidence", "invariants-after-build.json");
const EVIDENCE_MD = path.join(REPO_ROOT, "docs", "qa", "pass4", "evidence", "invariants.md");

const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
const KIND = { text: "TEXT COLLATE NOCASE", int: "INTEGER", bool: "INTEGER", float: "REAL", date: "TEXT", datetime: "TEXT" }; // as the app's store.ts does
const PRIVATE_COLUMN = /pass|hash|secret|token|cookie|otp|aadhaar|encrypted|session(?!_expires|_id)|mobile|phone_number|email|date_of_birth|first_name|last_name|door_no|alternate/i;
const KEEP_PRIVATE = { complaints: true }; // the personal-data checks need the complaint's own contact columns; they never leave the database
const SKIP_TABLES = new Set(["password_resets"]);
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const val = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const readGz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, f))).toString("utf8"));
const istStamp = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

// ------------------------------------------------------------ text rules --

const PHONE = /(?<![\w.\/-])(?:(?:\+?91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-])/;  // an Indian mobile number, not digits inside a code or a link; 044 landlines are offices and helplines
const AADHAAR = /(?<![\w.\/+-])[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}(?![\w-])|(?<![\w.\/+-])[2-9]\d{11}(?![\w-])/; // the + keeps a +91 helpline out
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F�]/;      // tabs and line breaks are allowed
const TAMIL = /[஀-௿]/;
const TAMIL_LATIN_MIX = /[஀-௿][a-zA-Z]{1,3}[஀-௿]/;              // Latin letters in the middle of a Tamil word: a garbled model answer
const MOJIBAKE = /Ã[\u0080-¿]|â€|à®|à¯/;
const HTML_LEFT = /<\/?(p|div|br|span|a|img|strong|em|ul|li|table|script|style)\b[^>]*>|&(amp|nbsp|lt|gt|quot|#\d+);/i;

function dateKey(x) {
  if (x == null) return null;
  const m = String(x).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  if (t.getUTCMonth() !== +mo - 1 || t.getUTCDate() !== +d || +h > 23 || +mi > 59 || +s > 59) return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function tamilShare(x) {
  const t = String(x ?? "");
  const ta = (t.match(/[஀-௿]/g) || []).length, la = (t.match(/[A-Za-z]/g) || []).length;
  return ta + la ? ta / (ta + la) : 0;
}

// --------------------------------------------------------------- geometry --

function wardShapes(db) {
  const W = new Map();
  for (const r of db.prepare("SELECT ward_no, geometry, centroid_lat, centroid_lon FROM ref_wards").all()) {
    let polys = [];
    try { const g = JSON.parse(r.geometry); polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]; } catch { /* a ward with no shape fails ward_shape_missing */ }
    let box = [99, 99, -99, -99];
    for (const p of polys) for (const ring of p) for (const [x, y] of ring) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
    W.set(Number(r.ward_no), { polys, box, lat: r.centroid_lat, lon: r.centroid_lon });
  }
  return W;
}
const inRing = (x, y, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

function registerFunctions(db) {
  const bool = (name, fn) => db.function(name, { deterministic: true }, (x) => (x == null ? 0 : fn(String(x)) ? 1 : 0));
  bool("has_personal_data", (x) => PHONE.test(x) || AADHAAR.test(x) || EMAIL.test(x));
  bool("has_phone", (x) => PHONE.test(x));
  bool("has_aadhaar", (x) => AADHAAR.test(x));
  bool("has_email", (x) => EMAIL.test(x));
  bool("has_control_chars", (x) => CONTROL.test(x));
  bool("has_tamil", (x) => TAMIL.test(x));
  bool("tamil_latin_mix", (x) => TAMIL_LATIN_MIX.test(x));
  bool("has_mojibake", (x) => MOJIBAKE.test(x));
  bool("has_html_left", (x) => HTML_LEFT.test(x));
  db.function("bad_date", { deterministic: true }, (x) => (x == null ? 0 : dateKey(x) ? 0 : 1));
  db.function("date_key", { deterministic: true }, (x) => dateKey(x));
  db.function("tamil_share", { deterministic: true }, (x) => (x == null ? null : tamilShare(x)));
  let W = null;
  const shapes = () => (W ??= wardShapes(db));
  db.function("in_own_ward", { deterministic: true }, (w, la, lo) => {
    if (w == null || la == null || lo == null) return null;
    const a = shapes().get(Number(w));
    if (!a || lo < a.box[0] || lo > a.box[2] || la < a.box[1] || la > a.box[3]) return 0;
    return a.polys.some((p) => inRing(lo, la, p[0]) && !p.slice(1).some((h) => inRing(lo, la, h))) ? 1 : 0;
  });
  db.function("km_from_ward_centre", { deterministic: true }, (w, la, lo) => {
    const a = shapes().get(Number(w));
    if (!a || la == null || lo == null) return null;
    const t = Math.PI / 180;
    return 6371 * Math.hypot((lo - a.lon) * t * Math.cos(((la + a.lat) / 2) * t), (la - a.lat) * t);
  });
}

// ---------------------------------------------------------------- loading --

/** The pinned snapshot in an in-memory database with no constraints, so a duplicate key is a finding and not a load error. */
export function openPinned() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;");
  registerFunctions(db);
  const info = JSON.parse(fs.readFileSync(path.join(PIN_DIR, "info.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(PIN_DIR, "manifest.json"), "utf8"));
  const tables = {}; // name -> { kind: pipeline|durable, key: [...], dates: [...] }
  db.exec("BEGIN");
  const put = (t, cols, rows) => {
    db.exec(`CREATE TABLE ${q(t)} (${cols.map(([c, ty]) => `${q(c)} ${ty}`).join(", ")})`);
    if (!rows.length) return;
    const ins = db.prepare(`INSERT INTO ${q(t)} VALUES (${cols.map(() => "?").join(", ")})`);
    for (const r of rows) ins.run(...r);
  };
  for (const f of fs.readdirSync(path.join(PIN_DIR, "tables")).sort()) {
    const d = readGz(path.join("tables", f));
    put(d.table, d.columns.map(([c, k]) => [c, KIND[k] ?? "TEXT"]), d.rows.map((r) => r.map(val)));
    tables[d.table] = { kind: "pipeline", key: manifest.keys[d.table] ?? null, dates: d.columns.filter(([, k]) => k === "date" || k === "datetime").map(([c]) => c) };
  }
  const scratch = new DatabaseSync(":memory:");
  const rowsFile = fs.existsSync(path.join(PIN_DIR, "rows.seeded.json.gz")) ? "rows.seeded.json.gz" : "rows.json.gz";
  const durableAsOf = istStamp(Date.parse(info.pinned_at)); // from the snapshot's own record, so the answer does not change with the file's date
  for (const [f, kind] of [["reference.json.gz", "reference"], [rowsFile, "durable"]]) {
    const doc = readGz(f);
    for (const [t, s] of Object.entries(doc.schema)) {
      if (SKIP_TABLES.has(t) || tables[t]) continue;
      scratch.exec(s.ddl.find((x) => /^CREATE TABLE/i.test(x)));
      const info2 = scratch.prepare(`SELECT name, type FROM pragma_table_info(${`'${t}'`})`).all();
      const cols = info2.filter((c) => KEEP_PRIVATE[t] || (s.key ?? []).includes(c.name) || !PRIVATE_COLUMN.test(c.name))
        .map((c) => [c.name, /^(int|real|num)/i.test(c.type) ? c.type : /text|char|clob/i.test(c.type) ? (/_at$|date$/.test(c.name) ? "TEXT" : "TEXT COLLATE NOCASE") : c.type || "TEXT"]);
      const rows = (doc.rows[t] ?? []).map((r) => cols.map(([c]) => val(r[c])));
      put(t, cols, rows);
      tables[t] = { kind, key: s.key ?? null, dates: cols.map(([c]) => c).filter((c) => /(_at|_on|_date|_datetime)$|^(date|at|week_start)$/.test(c)) };
    }
  }
  for (const [t, cs] of Object.entries(manifest.indexes)) for (const c of cs) if (tables[t]) db.exec(`CREATE INDEX ${q(`ix_${t}_${c}`)} ON ${q(t)} (${q(c)})`);
  for (const [t, c] of [["incidents", "incident_id"], ["incidents", "hotspot_id"], ["events", "event_id"], ["actions", "action_id"], ["actions", "event_id"], ["documents", "doc_id"], ["documents", "linked_incident_id"], ["documents", "event_id"], ["documents", "url"],
    ["complaint_status_history", "complaint_id"], ["complaints", "complaint_code"], ["complaints", "id"], ["departments", "id"], ["complaint_types", "id"], ["complaint_subtypes", "id"], ["gcc_areas", "id"], ["gcc_localities", "id"], ["gcc_streets", "id"],
    ["zone_wards", "ward_number"], ["ref_wards", "ward_no"], ["ref_departments", "code"], ["ref_categories", "category_code"], ["ref_taluks", "taluk_code"], ["ref_zones", "zone_no"], ["hotspots", "hotspot_id"]])
    db.exec(`CREATE INDEX ${q(`iy_${t}_${c}`)} ON ${q(t)} (${q(c)})`);
  db.exec("COMMIT");
  db.exec("ANALYZE");
  scratch.close();
  const asOf = String(JSON.parse(db.prepare(`SELECT value FROM metrics WHERE metric = 'as_of'`).get().value)).slice(0, 19);
  return { db, info, tables, builtAt: info.built_at, asOf, durableAsOf, rowsFile };
}

/** Replaces a table's rows, keeping its columns (for rerunning the checks on what the real store holds after the app's build steps). */
export function replaceTable(db, t, rows) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r) => r.name);
  db.exec("BEGIN");
  db.exec(`DELETE FROM ${q(t)}`);
  if (rows.length) {
    const present = cols.filter((c) => c in rows[0]);
    const ins = db.prepare(`INSERT INTO ${q(t)} (${present.map(q).join(", ")}) VALUES (${present.map(() => "?").join(", ")})`);
    for (const r of rows) ins.run(...present.map((c) => (typeof r[c] === "bigint" ? Number(r[c]) : val(r[c]))));
  }
  db.exec("COMMIT");
}

// ----------------------------------------------------------------- checks --

const PIPE = "pipeline issue", APP = "app issue";
const SEVERITIES = `('Severe', 'High', 'Medium', 'Low')`;
const CLOSED = `('Resolved', 'Rejected', 'Lapsed')`;
const OPEN_ST = `('Open', 'Assigned', 'In progress', 'Under review', 'Awaiting verification')`;
const LAT = [12.8, 13.3], LON = [80.05, 80.4]; // Greater Chennai with a margin; the ward shapes reach 12.84 to 13.24 and 80.13 to 80.33
const outOfBounds = (la, lo) => `(${la} IS NOT NULL AND (${la} < ${LAT[0]} OR ${la} > ${LAT[1]} OR ${lo} < ${LON[0]} OR ${lo} > ${LON[1]}))`;
/** Dates that may rightly be after the build: deadlines, targets and forecasts. */
const FUTURE_OK = new Set(["sla_due_at", "next_action_due", "due_at", "target_date", "valid_from", "due_date", "session_expires_at", "send_after", "alerts.date"]);

/** Fields a person can read on a screen, in an answer, or in a mail. */
const SHOWN = {
  incidents: ["title", "summary", "ai_summary", "ai_summary_ta", "ai_attention", "ai_next_step", "place_text", "severity_reasons", "priority_reasons", "attention_reason"],
  events: ["title", "text", "place_text"], incident_members: ["title"],
  documents: ["title", "title_en", "summary", "ai_place", "place_text", "body"],
  alerts: ["title", "message", "explanation", "place"], gaps: ["title", "suggested_action"], actions: ["text", "evidence"], incident_timeline: ["note"],
  complaints: ["title", "description", "specific_location", "remarks"], complaint_status_history: ["remarks"],
  briefings: ["markdown", "ai_summary", "ai_summary_ta"], briefing_notes: ["text_en", "text_ta"], briefing_archive: ["markdown"],
  review_queue: ["suggestion", "reason", "evidence"], source_items: ["title", "body"], hotspots: ["top_place"], pwd_works: ["work_title"],
  officer_reports: ["remarks"], outbound_emails: ["subject", "body"], followups: ["summary"]
};

const idExpr = (s, t) => (s.tables[t].key?.length ? s.tables[t].key.map((k) => `COALESCE(CAST(${q(k)} AS TEXT), '')`).join(` || '|' || `) : "CAST(rowid AS TEXT)");

const kpiId = `k.period || '|' || k."offset" || '|' || COALESCE(CAST(k.zone_no AS INTEGER), 'all')`;
const inKpi = (a, col) => `${a}.${col} > k.window_start AND ${a}.${col} <= k.window_end AND (k.zone_no IS NULL OR ${a}.zone_no = k.zone_no)`;
const kpiVsIncidents = (field, expr) => `SELECT ${kpiId} AS id FROM kpis k WHERE COALESCE(k.${field}, 0) <> COALESCE((SELECT ${expr} FROM incidents i WHERE ${inKpi("i", "first_reported_at")}), 0)`;

const metricIs = (id, metric, jpath, sql) => `SELECT '${id}' AS id WHERE COALESCE((SELECT json_extract(value, '${jpath}') FROM metrics WHERE metric = '${metric}'), -1) <> (${sql})`;

/** All the checks, for this snapshot's dates. */
export function buildChecks(s) {
  const { builtAt: BUILT, asOf: AS_OF, durableAsOf } = s;
  const c = [];
  const add = (group, name, what, sql, o = {}) => c.push({ group, name, what, sql: sql.replace(/\s+/g, " ").trim(), on_fail: o.on_fail ?? PIPE, ...(o.finding ? { finding: o.finding } : {}), ...(o.open ? { open: o.open } : {}), ...(o.note ? { note: o.note } : {}) });

  // ------------------------------------------------ closed after opened --
  const G1 = "time order";
  add(G1, "incident_closed_before_first_report", "An incident closed before it was first reported.", `SELECT incident_id AS id FROM incidents WHERE closed_at < first_reported_at`);
  add(G1, "incident_verified_before_first_report", "An incident verified before it was first reported.", `SELECT incident_id AS id FROM incidents WHERE verified_at < first_reported_at`);
  add(G1, "incident_verified_after_closed", "An incident verified after it was closed.", `SELECT incident_id AS id FROM incidents WHERE verified_at > closed_at`);
  add(G1, "incident_last_update_before_first_report", "Last update earlier than the first report.", `SELECT incident_id AS id FROM incidents WHERE last_update_at < first_reported_at`);
  add(G1, "incident_closed_after_last_update", "Closed later than its own last update, so the last update is not the last thing that happened.", `SELECT incident_id AS id FROM incidents WHERE closed_at > last_update_at`, { finding: "INV-16" });
  add(G1, "timeline_step_after_last_update", "A timeline step later than the incident's last update.", `SELECT t.event_id || '|' || t.step AS id FROM incident_timeline t JOIN incidents i USING (incident_id) WHERE t.at > i.last_update_at`, { finding: "INV-16" });
  add(G1, "incident_due_before_first_report", "A deadline earlier than the first report.", `SELECT incident_id AS id FROM incidents WHERE sla_due_at < first_reported_at`);
  add(G1, "incident_first_report_not_earliest_member", "First report differs from the earliest of its reports.", `SELECT i.incident_id AS id FROM incidents i WHERE i.first_reported_at <> (SELECT MIN(m.reported_at) FROM incident_members m WHERE m.incident_id = i.incident_id)`);
  add(G1, "event_closed_before_reported", "A report closed before it was made.", `SELECT event_id AS id FROM events WHERE closed_at < reported_at`);
  add(G1, "event_first_action_before_reported", "First action before the report was made.", `SELECT event_id AS id FROM events WHERE first_action_at < reported_at`);
  add(G1, "event_status_before_reported", "Status time before the report was made.", `SELECT event_id AS id FROM events WHERE status_at < reported_at`);
  add(G1, "event_occurred_after_reported", "Something reported before it happened: a forecast stored as a happening.", `SELECT event_id AS id FROM events WHERE occurred_at > reported_at`, { finding: "INV-9", open: "OPEN-11" });
  add(G1, "action_completed_before_assigned", "An action finished before it was assigned.", `SELECT action_id AS id FROM actions WHERE completed_at < assigned_at`);
  add(G1, "action_verified_before_completed", "An action verified before it was finished.", `SELECT action_id AS id FROM actions WHERE verified_at < completed_at`);
  add(G1, "action_due_before_assigned", "An action due before it was assigned.", `SELECT action_id AS id FROM actions WHERE due_at < assigned_at`);
  add(G1, "action_assigned_before_report", "An action assigned before its report was made.", `SELECT a.action_id AS id FROM actions a JOIN events e USING (event_id) WHERE a.assigned_at < e.reported_at`);
  add(G1, "timeline_before_first_report", "A timeline step before the incident's first report.", `SELECT t.event_id || '|' || t.step AS id FROM incident_timeline t JOIN incidents i USING (incident_id) WHERE t.at < i.first_reported_at`);
  add(G1, "timeline_before_own_report", "A timeline step before its own report.", `SELECT t.event_id || '|' || t.step AS id FROM incident_timeline t JOIN events e USING (event_id) WHERE t.at < e.reported_at`);
  add(G1, "complaint_updated_before_created", "A complaint updated before it was filed.", `SELECT id FROM complaints WHERE updated_at < created_at`);
  add(G1, "history_before_complaint", "A status change before the complaint was filed.", `SELECT h.id AS id FROM complaint_status_history h JOIN complaints c ON c.id = h.complaint_id WHERE h.created_at < c.created_at`);
  add(G1, "history_after_complaint_update", "A status change later than the complaint's last update.", `SELECT c.id AS id FROM complaints c WHERE c.updated_at < (SELECT MAX(h.created_at) FROM complaint_status_history h WHERE h.complaint_id = c.id)`);
  add(G1, "history_steps_out_of_order", "A complaint's steps run backwards.", `SELECT id FROM (SELECT id, r, LAG(r) OVER (PARTITION BY complaint_id ORDER BY created_at, id) AS prev FROM (SELECT id, complaint_id, created_at, CASE status WHEN 'Complaint Filed' THEN 1 WHEN 'Pending Approval' THEN 2 WHEN 'Approved by Department Officer' THEN 3 WHEN 'In Progress' THEN 4 WHEN 'Completed - Pending Collector Verification' THEN 5 WHEN 'Verified by Collector' THEN 6 WHEN 'Rejected' THEN 7 ELSE 0 END AS r FROM complaint_status_history)) WHERE prev IS NOT NULL AND r < prev`);
  add(G1, "pwd_completed_before_start", "A work finished before it started.", `SELECT work_id AS id FROM pwd_works WHERE completion_date < start_date`);
  add(G1, "pwd_target_before_start", "A work's target before its start.", `SELECT work_id AS id FROM pwd_works WHERE target_date < start_date`);
  add(G1, "police_report_before_incident", "A police report made before the incident it reports.", `SELECT report_id AS id FROM police_incident_reports WHERE reported_datetime < incident_datetime`);
  add(G1, "police_closed_before_reported", "A police report closed before it was made.", `SELECT report_id AS id FROM police_incident_reports WHERE closed_datetime < reported_datetime`);
  add(G1, "hotspot_last_seen_before_first_seen", "A hotspot last seen before it was first seen.", `SELECT hotspot_id AS id FROM hotspots WHERE last_seen < first_seen`);
  add(G1, "forecast_valid_before_issue_day", "A forecast for a day before it was issued.", `SELECT location_id || '|' || issued_at AS id FROM forecasts WHERE date(valid_from) < date(issued_at)`);

  // --------------------------------------------------- status and flags --
  const G2 = "status and flags";
  add(G2, "incident_status_unknown", "A status outside the known list.", `SELECT incident_id AS id FROM incidents WHERE status_std IS NULL OR status_std NOT IN ${CLOSED.slice(0, -1)}, ${OPEN_ST.slice(1)}`);
  add(G2, "incident_open_flag_with_closed_status", "is_open is 1 but the status says closed.", `SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND status_std IN ${CLOSED}`);
  add(G2, "incident_closed_flag_with_open_status", "is_open is 0 but the status says open.", `SELECT incident_id AS id FROM incidents WHERE is_open = 0 AND status_std NOT IN ${CLOSED}`);
  add(G2, "incident_resolved_or_rejected_without_closed_at", "Resolved or Rejected with no close time.", `SELECT incident_id AS id FROM incidents WHERE status_std IN ('Resolved', 'Rejected') AND closed_at IS NULL`);
  add(G2, "incident_lapsed_without_closed_at", "Lapsed (closed by age) with no close time.", `SELECT incident_id AS id FROM incidents WHERE status_std = 'Lapsed' AND closed_at IS NULL`, { finding: "INV-10", open: "OPEN-11" });
  add(G2, "incident_open_with_closed_at", "Open with a close time.", `SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND closed_at IS NOT NULL`);
  add(G2, "incident_open_all_reports_closed", "Open although all its reports are closed.", `SELECT i.incident_id AS id FROM incidents i WHERE i.is_open = 1 AND NOT EXISTS (SELECT 1 FROM events e WHERE e.incident_id = i.incident_id AND e.status_std NOT IN ('Resolved', 'Rejected'))`);
  add(G2, "incident_resolved_with_open_report", "Resolved or Rejected while one of its reports is still open.", `SELECT i.incident_id AS id FROM incidents i WHERE i.status_std IN ('Resolved', 'Rejected') AND EXISTS (SELECT 1 FROM events e WHERE e.incident_id = i.incident_id AND e.status_std NOT IN ('Resolved', 'Rejected'))`, { finding: "INV-16" });
  add(G2, "incident_without_deadline", "An incident with no deadline.", `SELECT incident_id AS id FROM incidents WHERE sla_due_at IS NULL OR sla_hours IS NULL`);
  add(G2, "incident_due_is_not_report_plus_hours", "Deadline is not first report plus the allowed hours.", `SELECT incident_id AS id FROM incidents WHERE ABS((julianday(sla_due_at) - julianday(first_reported_at)) * 24 - sla_hours) > 0.02`);
  add(G2, "incident_breached_before_due", "Open and marked past deadline, but the deadline has not come.", `SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND sla_breached = 1 AND sla_due_at >= '${AS_OF}'`);
  add(G2, "incident_closed_on_time_marked_breached", "Closed before its deadline but marked past deadline.", `SELECT incident_id AS id FROM incidents WHERE closed_at IS NOT NULL AND closed_at <= sla_due_at AND sla_breached = 1`);
  add(G2, "incident_open_past_due_not_breached", "Open, past its due time, and not marked past deadline.", `SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}'`, { finding: "INV-7", open: "OPEN-7", note: "The pipeline judges a 'response' deadline on the first action only, so an incident stays not-breached for months." });
  add(G2, "incident_closed_after_due_not_breached", "Closed after its due time and not marked past deadline.", `SELECT incident_id AS id FROM incidents WHERE closed_at > sla_due_at AND sla_breached = 0`, { finding: "INV-7", open: "OPEN-7" });
  add(G2, "case_page_says_missed_but_tile_does_not_count", "The case page says the deadline is missed; the Past deadline tile, list and briefing do not count the same incident.", `SELECT incident_id AS id FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}'`, { on_fail: APP, finding: "INV-4", open: "OPEN-7" });
  add(G2, "resolved_said_within_deadline_but_closed_late", "Counted as closed within the deadline by the app's on-time figures, though closed after the due time.", `SELECT incident_id AS id FROM incidents WHERE status_std = 'Resolved' AND closed_at > sla_due_at AND COALESCE(sla_breached, 0) = 0`, { on_fail: APP, finding: "INV-3" });
  add(G2, "sla_flag_is_the_pipeline_rule", "sla_breached is not simply sla_ratio above 1. (It is, so OPEN-7 is the rule itself and not stray rows.)", `SELECT incident_id AS id FROM incidents WHERE sla_breached <> (sla_ratio > 1)`);
  add(G2, "incident_verified_flag_without_time", "verified and verified_at disagree.", `SELECT incident_id AS id FROM incidents WHERE (verified = 1) <> (verified_at IS NOT NULL)`);
  add(G2, "incident_news_only_with_official_record", "News-only flag on an incident with a complaint, a police report or a record.", `SELECT incident_id AS id FROM incidents WHERE media_only = 1 AND (citizen_complaints > 0 OR police_reports > 0 OR has_official_record = 1)`);
  add(G2, "incident_news_source_not_flagged", "Only news sources, but no news-only flag.", `SELECT incident_id AS id FROM incidents WHERE media_only = 0 AND sources = 'news'`);
  add(G2, "incident_awaiting_collector_but_closed", "Waiting for the Collector although closed.", `SELECT incident_id AS id FROM incidents WHERE awaiting_collector = 1 AND is_open = 0`);
  add(G2, "incident_attention_but_closed", "Needs attention although closed.", `SELECT incident_id AS id FROM incidents WHERE attention_flag = 1 AND is_open = 0`);
  add(G2, "incident_attention_flag_vs_reason", "Attention flag and reason disagree.", `SELECT incident_id AS id FROM incidents WHERE (attention_flag = 1) <> (COALESCE(attention_reason, '') <> '')`);
  add(G2, "incident_review_flag_vs_reason", "Review flag and reason disagree.", `SELECT incident_id AS id FROM incidents WHERE (needs_review = 1) <> (COALESCE(review_reason, '') <> '')`);
  add(G2, "incident_coordination_with_one_department", "Needs coordination with only one department.", `SELECT incident_id AS id FROM incidents WHERE needs_coordination = 1 AND instr(depts_involved, '|') = 0`);
  add(G2, "incident_lead_not_among_departments", "The lead department is not among those involved.", `SELECT incident_id AS id FROM incidents WHERE instr('|' || depts_involved || '|', '|' || lead_dept || '|') = 0`);
  add(G2, "incident_severity_score_vs_level", "Severity level does not fit the score bands.", `SELECT incident_id AS id FROM incidents WHERE NOT ((severity_level = 'Severe' AND severity_score >= 70) OR (severity_level = 'High' AND severity_score >= 50 AND severity_score < 70) OR (severity_level = 'Medium' AND severity_score >= 30 AND severity_score < 50) OR (severity_level = 'Low' AND severity_score < 30))`);
  add(G2, "incident_severity_below_worst_report", "An incident rated lower than its worst report.", `SELECT i.incident_id AS id FROM incidents i WHERE (SELECT MAX(e.severity_score) FROM events e WHERE e.incident_id = i.incident_id) > i.severity_score`);
  add(G2, "incident_hours_open_negative", "Open for less than no time: reported after the build.", `SELECT incident_id AS id FROM incidents WHERE hours_open < 0`, { finding: "INV-9", open: "OPEN-11" });
  add(G2, "incident_hours_open_vs_dates", "hours_open does not match the dates.", `SELECT incident_id AS id FROM incidents WHERE (closed_at IS NOT NULL AND ABS((julianday(closed_at) - julianday(first_reported_at)) * 24 - hours_open) > 0.2) OR (is_open = 1 AND ABS((julianday('${AS_OF}') - julianday(first_reported_at)) * 24 - hours_open) > 0.2)`);
  add(G2, "incident_hours_to_first_action_negative", "First action before the report.", `SELECT incident_id AS id FROM incidents WHERE hours_to_first_action < 0`);
  add(G2, "incident_negative_counts", "A negative number of deaths, injured or people affected.", `SELECT incident_id AS id FROM incidents WHERE dead < 0 OR injured < 0 OR persons_affected < 0 OR member_count < 1`);
  add(G2, "incident_scores_out_of_range", "Reliability or confidence outside 0 to 1, or a negative priority.", `SELECT incident_id AS id FROM incidents WHERE reliability < 0 OR reliability > 1 OR confidence < 0 OR confidence > 1 OR priority_score < 0`);
  add(G2, "event_resolved_without_closed_at", "A Resolved or Rejected report with no close time.", `SELECT event_id AS id FROM events WHERE status_std IN ('Resolved', 'Rejected') AND closed_at IS NULL`);
  add(G2, "event_in_progress_with_closed_at", "A report still In progress with a close time.", `SELECT event_id AS id FROM events WHERE status_std NOT IN ('Resolved', 'Rejected') AND closed_at IS NOT NULL`, { finding: "INV-16" });
  add(G2, "event_outside_district_but_in_a_zone", "Marked outside the district but given a zone.", `SELECT event_id AS id FROM events WHERE in_district = 0 AND zone_no IS NOT NULL`, { finding: "INV-16" });
  add(G2, "member_differs_from_event", "An incident_members row disagrees with its own report.", `SELECT m.event_id AS id FROM incident_members m JOIN events e USING (event_id) WHERE m.status_std IS NOT e.status_std OR m.severity_level IS NOT e.severity_level OR m.title IS NOT e.title OR m.reported_at IS NOT e.reported_at OR m.source IS NOT e.source`);
  add(G2, "action_done_more_than_total", "More actions done than exist.", `SELECT incident_id AS id FROM incidents WHERE action_done > action_total`);
  add(G2, "action_done_without_completed_at", "An action Done with no finish time.", `SELECT action_id AS id FROM actions WHERE status IN ('Done', 'Verified') AND completed_at IS NULL`);
  add(G2, "action_finished_but_status_in_progress", "An action with finish and check times but still In progress.", `SELECT action_id AS id FROM actions WHERE status NOT IN ('Done', 'Verified') AND (completed_at IS NOT NULL OR verified_at IS NOT NULL)`, { finding: "INV-16" });
  add(G2, "action_open_on_closed_incident", "A step still In progress or not started on a closed incident.", `SELECT a.action_id AS id FROM actions a JOIN incidents i USING (incident_id) WHERE i.is_open = 0 AND a.status NOT IN ('Done', 'Verified')`, { finding: "INV-16" });
  add(G2, "complaint_status_vs_last_history", "A complaint's status differs from its last history step.", `SELECT c.id AS id FROM complaints c WHERE c.status <> (SELECT h.status FROM complaint_status_history h WHERE h.complaint_id = c.id ORDER BY h.created_at DESC, h.id DESC LIMIT 1)`);
  add(G2, "complaint_rejected_stage_vs_status", "Rejected stage and Rejected status disagree.", `SELECT id FROM complaints WHERE (status = 'Rejected') <> (rejected_stage IS NOT NULL)`);
  add(G2, "pwd_completed_status_vs_date", "A work's status and completion date or progress disagree.", `SELECT work_id AS id FROM pwd_works WHERE (status = 'completed') <> (completion_date IS NOT NULL) OR (status = 'completed' AND physical_progress_pct <> 100) OR physical_progress_pct < 0 OR physical_progress_pct > 100`);

  // ---------------------------------------------------- wards and zones --
  const G3 = "wards inside zones";
  add(G3, "ward_list_is_not_1_to_200", "Ward numbers missing from zone_wards, or outside 1 to 200.", `WITH RECURSIVE n(w) AS (SELECT 1 UNION ALL SELECT w + 1 FROM n WHERE w < 200) SELECT CAST(w AS TEXT) AS id FROM n WHERE w NOT IN (SELECT ward_number FROM zone_wards) UNION ALL SELECT CAST(ward_number AS TEXT) FROM zone_wards WHERE ward_number NOT BETWEEN 1 AND 200`);
  add(G3, "ref_ward_zone_vs_zone_wards", "The two ward tables put a ward in different zones.", `SELECT CAST(w.ward_no AS TEXT) AS id FROM ref_wards w LEFT JOIN zone_wards z ON z.ward_number = w.ward_no WHERE z.zone_id IS NOT w.zone_no`);
  add(G3, "zone_wards_not_in_ref_wards", "A durable ward with no pipeline ward.", `SELECT CAST(ward_number AS TEXT) AS id FROM zone_wards WHERE ward_number NOT IN (SELECT ward_no FROM ref_wards)`);
  add(G3, "ref_ward_zone_name", "A ward's zone name differs from the zone's name.", `SELECT CAST(w.ward_no AS TEXT) AS id FROM ref_wards w LEFT JOIN ref_zones z ON z.zone_no = w.zone_no WHERE w.zone_name IS NOT z.zone_name`);
  add(G3, "durable_zone_name", "The durable zone name differs from the pipeline's.", `SELECT CAST(z.zone_number AS TEXT) AS id FROM zones z LEFT JOIN ref_zones r ON r.zone_no = z.zone_number WHERE z.zone_name IS NOT r.zone_name`);
  add(G3, "ward_outside_own_zone_range", "A ward outside its own zone's ward_start to ward_end.", `SELECT CAST(zw.ward_number AS TEXT) AS id FROM zone_wards zw JOIN zones z ON z.zone_number = zw.zone_id WHERE zw.ward_number NOT BETWEEN z.ward_start AND z.ward_end`);
  add(G3, "zone_range_contains_other_zones_ward", "A zone's ward_start to ward_end holds wards of another zone. The profile form and its server check use this range as if it were exact.", `SELECT z.zone_number || '|' || zw.ward_number AS id FROM zone_wards zw JOIN zones z ON zw.ward_number BETWEEN z.ward_start AND z.ward_end WHERE zw.zone_id <> z.zone_number`, { on_fail: APP, finding: "INV-6" });
  add(G3, "user_profile_ward_in_other_zone", "A saved profile whose ward belongs to another zone.", `SELECT CAST(p.id AS TEXT) AS id FROM user_profiles p JOIN zone_wards z ON z.ward_number = p.ward_number WHERE p.zone_id <> z.zone_id`, { on_fail: APP, finding: "INV-6" });
  const wardZone = (name, t, id, w, z) => add(G3, name, `${t}: the ward does not belong to the zone.`, `SELECT CAST(a.${id} AS TEXT) AS id FROM ${t} a JOIN zone_wards zw ON zw.ward_number = a.${w} WHERE a.${z} IS NOT zw.zone_id`);
  wardZone("incident_ward_vs_zone", "incidents", "incident_id", "ward_no", "zone_no");
  wardZone("event_ward_vs_zone", "events", "event_id", "ward_no", "zone_no");
  wardZone("complaint_ward_vs_zone", "complaints", "id", "ward_number", "zone_id");
  wardZone("observation_ward_vs_zone", "observations", "metric || '|' || a.place_id", "ward_no", "zone_no");
  wardZone("source_item_ward_vs_zone", "source_items", "item_id", "ward_no", "zone_no");
  add(G3, "ward_unknown", "A ward number that does not exist.", `SELECT 'incidents:' || incident_id AS id FROM incidents WHERE ward_no IS NOT NULL AND ward_no NOT IN (SELECT ward_number FROM zone_wards) UNION ALL SELECT 'events:' || event_id FROM events WHERE ward_no IS NOT NULL AND ward_no NOT IN (SELECT ward_number FROM zone_wards) UNION ALL SELECT 'complaints:' || id FROM complaints WHERE ward_number NOT IN (SELECT ward_number FROM zone_wards) UNION ALL SELECT 'area_wards:' || area_id FROM area_wards WHERE ward_number NOT IN (SELECT ward_number FROM zone_wards)`);
  add(G3, "incident_zone_name", "An incident's zone name differs from the zone's.", `SELECT i.incident_id AS id FROM incidents i JOIN ref_zones z USING (zone_no) WHERE i.zone_name IS NOT z.zone_name`);
  add(G3, "gap_ward_vs_zone_name", "A news gap's ward is in another zone.", `SELECT g.incident_id AS id FROM gaps g JOIN ref_wards w ON w.ward_no = g.ward_no WHERE g.zone_name IS NOT w.zone_name`);
  add(G3, "incident_zone_without_ward", "A zone with no ward, or a ward with no zone.", `SELECT incident_id AS id FROM incidents WHERE (zone_no IS NULL) <> (ward_no IS NULL)`);
  add(G3, "ward_shape_missing", "A ward with no usable shape.", `SELECT CAST(ward_no AS TEXT) AS id FROM ref_wards WHERE geometry IS NULL OR json_valid(geometry) = 0`);
  add(G3, "incident_pin_outside_own_ward", "An incident's pin is outside its own ward's shape.", `SELECT incident_id AS id FROM incidents WHERE ward_no IS NOT NULL AND in_own_ward(ward_no, lat, lon) = 0`, { finding: "INV-19" });
  add(G3, "incident_pin_over_5km_from_ward_centre", "An incident's pin is more than 5 km from its ward's centre.", `SELECT incident_id AS id FROM incidents WHERE ward_no IS NOT NULL AND km_from_ward_centre(ward_no, lat, lon) > 5`, { finding: "INV-19" });
  add(G3, "complaint_map_ward_pin_outside", "A complaint whose ward was set from the map has its pin outside that ward.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE ward_source = 'map_boundary' AND latitude IS NOT NULL AND in_own_ward(ward_number, latitude, longitude) = 0`);

  // ---------------------------------------- departments and categories --
  const G4 = "departments and categories";
  const dept = (name, t, id, col) => add(G4, name, `${t}.${col} is not a known department.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NOT NULL AND ${col} <> '' AND ${col} NOT IN (SELECT code FROM ref_departments)`);
  const cat = (name, t, id, col = "category_code") => add(G4, name, `${t}.${col} is not a known category.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NOT NULL AND ${col} <> '' AND ${col} NOT IN (SELECT category_code FROM ref_categories)`);
  add(G4, "incident_department_missing", "An incident with no lead department.", `SELECT incident_id AS id FROM incidents WHERE lead_dept IS NULL OR lead_dept = ''`);
  add(G4, "incident_category_missing", "An incident with no category.", `SELECT incident_id AS id FROM incidents WHERE category_code IS NULL OR category_code = ''`);
  dept("incident_department_unknown", "incidents", "incident_id", "lead_dept");
  cat("incident_category_unknown", "incidents", "incident_id");
  add(G4, "incident_category_label_or_family", "An incident's category label or family differs from the category's.", `SELECT i.incident_id AS id FROM incidents i JOIN ref_categories c USING (category_code) WHERE i.category_label IS NOT c.label OR i.family IS NOT c.family`);
  add(G4, "incident_involved_department_unknown", "A department in depts_involved or support_depts is unknown.", `SELECT i.incident_id AS id FROM incidents i, json_each('["' || replace(COALESCE(i.depts_involved, '') || '|' || COALESCE(i.support_depts, ''), '|', '","') || '"]') j WHERE j.value <> '' AND j.value NOT IN (SELECT code FROM ref_departments)`);
  dept("event_department_unknown", "events", "event_id", "lead_dept");
  cat("event_category_unknown", "events", "event_id");
  dept("document_department_unknown", "documents", "doc_id", "department");
  cat("document_category_unknown", "documents", "doc_id");
  dept("action_department_unknown", "actions", "action_id", "dept_code");
  add(G4, "action_office_unknown", "An action's office is not a known office.", `SELECT action_id AS id FROM actions WHERE office_id IS NOT NULL AND office_id <> '' AND office_id NOT IN (SELECT office_id FROM ref_offices)`);
  add(G4, "complaint_department_unknown", "A complaint's department does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE department_id NOT IN (SELECT id FROM departments)`);
  add(G4, "complaint_type_unknown", "A complaint's type does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE complaint_type_id IS NOT NULL AND complaint_type_id NOT IN (SELECT id FROM complaint_types)`);
  add(G4, "complaint_subtype_unknown", "A complaint's subtype does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE complaint_subtype_id IS NOT NULL AND complaint_subtype_id NOT IN (SELECT id FROM complaint_subtypes)`);
  add(G4, "complaint_subtype_other_department", "A complaint's subtype belongs to another department.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c JOIN complaint_subtypes t ON t.id = c.complaint_subtype_id WHERE t.department_id IS NOT NULL AND t.department_id <> c.department_id`);
  add(G4, "complaint_place_ids_unknown", "A complaint's area, locality or street does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE (gcc_area_id IS NOT NULL AND gcc_area_id NOT IN (SELECT id FROM gcc_areas)) OR (gcc_locality_id IS NOT NULL AND gcc_locality_id NOT IN (SELECT id FROM gcc_localities)) OR (gcc_street_id IS NOT NULL AND gcc_street_id NOT IN (SELECT id FROM gcc_streets))`);
  add(G4, "complaint_subtype_category_unknown", "A complaint subtype's category does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaint_subtypes WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM complaint_categories)`);
  add(G4, "durable_department_not_in_ref_departments", "A portal department with no matching ref_departments row (by source_names).", `SELECT CAST(id AS TEXT) AS id FROM departments WHERE name NOT IN (SELECT source_names FROM ref_departments)`);
  add(G4, "complaint_department_not_in_ref_departments", "A complaint whose department has no ref_departments row.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c LEFT JOIN departments d ON d.id = c.department_id LEFT JOIN ref_departments r ON r.source_names = d.name WHERE r.code IS NULL`);
  add(G4, "real_complaint_department_differs_from_its_report", "A real complaint's department differs from its report's lead department.", `SELECT c.complaint_code AS id FROM complaints c JOIN events e ON e.event_id = 'GRV-' || c.complaint_code JOIN departments d ON d.id = c.department_id LEFT JOIN ref_departments r ON r.source_names = d.name WHERE r.code IS NOT e.lead_dept`);
  add(G4, "real_complaint_place_differs_from_its_report", "A real complaint's zone or ward differs from its report's.", `SELECT c.complaint_code AS id FROM complaints c JOIN events e ON e.event_id = 'GRV-' || c.complaint_code WHERE c.zone_id IS NOT e.zone_no OR c.ward_number IS NOT e.ward_no`);
  add(G4, "complaint_report_category_not_in_ref_categories", "A complaint's report has a category outside ref_categories. (The complaints table has no category column of its own; the category comes through its report.)", `SELECT c.complaint_code AS id FROM complaints c JOIN events e ON e.event_id = 'GRV-' || c.complaint_code WHERE e.category_code IS NULL OR e.category_code NOT IN (SELECT category_code FROM ref_categories)`);
  add(G4, "police_report_taluk_unknown", "A police report's taluk does not exist.", `SELECT report_id AS id FROM police_incident_reports WHERE taluk_code IS NOT NULL AND taluk_code NOT IN (SELECT taluk_code FROM ref_taluks)`);
  add(G4, "action_department_missing", "An action with no department.", `SELECT action_id AS id FROM actions WHERE dept_code IS NULL OR dept_code = ''`);
  add(G4, "complaint_types_department_unknown", "A complaint type's department does not exist.", `SELECT CAST(id AS TEXT) AS id FROM complaint_types WHERE department_id NOT IN (SELECT id FROM departments)`);
  cat("daily_count_category_unknown", "daily_counts", "date || '|' || zone_no || '|' || category_code");
  cat("alert_category_unknown", "alerts", "alert_id");
  cat("gap_category_unknown", "gaps", "incident_id");
  dept("gap_department_unknown", "gaps", "incident_id", "lead_dept");
  cat("hotspot_category_unknown", "hotspots", "hotspot_id");
  cat("anomaly_category_unknown", "anomalies", "date || '|' || category_code");
  cat("source_item_category_unknown", "source_items", "item_id");
  dept("source_item_department_unknown", "source_items", "item_id", "dept_code");
  dept("category_lead_department_unknown", "ref_categories", "category_code", "lead_dept");
  dept("office_department_unknown", "ref_offices", "office_id", "dept_code");
  dept("contact_department_unknown", "official_contacts", "contact_id", "dept_code");
  dept("assignment_department_unknown", "dept_assignments", "incident_id", "dept_code");
  dept("action_update_department_unknown", "action_updates", "update_id", "dept_code");
  add(G4, "taluk_unknown", "A taluk code that does not exist.", `SELECT 'incidents:' || incident_id AS id FROM incidents WHERE taluk_code IS NOT NULL AND taluk_code NOT IN (SELECT taluk_code FROM ref_taluks) UNION ALL SELECT 'events:' || event_id FROM events WHERE taluk_code IS NOT NULL AND taluk_code NOT IN (SELECT taluk_code FROM ref_taluks) UNION ALL SELECT 'wards:' || ward_no FROM ref_wards WHERE taluk_code IS NOT NULL AND taluk_code NOT IN (SELECT taluk_code FROM ref_taluks)`);

  // ---------------------------------------------------------- duplicates --
  const G5 = "duplicates";
  for (const [t, meta] of Object.entries(s.tables)) {
    if (!meta.key?.length) continue;
    const k = idExpr(s, t);
    add(G5, `duplicate_key:${t}`, `The same key twice in ${t}.`, `SELECT ${k} AS id FROM ${q(t)} GROUP BY ${k} HAVING COUNT(*) > 1`);
  }
  add(G5, "duplicate_key:daily_counts", "The same day, zone, category and source twice.", `SELECT date || '|' || COALESCE(zone_no, '') || '|' || category_code || '|' || source AS id FROM daily_counts GROUP BY date, zone_no, category_code, source HAVING COUNT(*) > 1`);
  add(G5, "duplicate_key:kpis", "The same period and zone twice.", `SELECT period || '|' || "offset" || '|' || COALESCE(zone_no, '') AS id FROM kpis GROUP BY period, "offset", zone_no HAVING COUNT(*) > 1`);
  add(G5, "duplicate_event_source_record", "The same source record twice.", `SELECT source || '|' || source_record_id AS id FROM events GROUP BY source, source_record_id HAVING COUNT(*) > 1`);
  add(G5, "duplicate_complaint_code", "The same complaint number twice.", `SELECT complaint_code AS id FROM complaints GROUP BY complaint_code HAVING COUNT(*) > 1`);
  add(G5, "duplicate_complaint_same_text_person_day", "The same complaint text from the same number on one day.", `SELECT MIN(id) AS id FROM complaints WHERE mobile_number IS NOT NULL GROUP BY description, mobile_number, substr(created_at, 1, 10) HAVING COUNT(*) > 1`);
  add(G5, "duplicate_history_step", "The same status step twice at one time.", `SELECT complaint_id || '|' || status AS id FROM complaint_status_history GROUP BY complaint_id, status, stage, created_at HAVING COUNT(*) > 1`);
  add(G5, "duplicate_timeline_step", "The same timeline step twice.", `SELECT event_id || '|' || step AS id FROM incident_timeline GROUP BY event_id, at, step, note HAVING COUNT(*) > 1`);
  add(G5, "duplicate_document_article_id", "The same article id stored as two documents.", `SELECT article_id AS id FROM documents WHERE article_id IS NOT NULL GROUP BY article_id HAVING COUNT(*) > 1`);
  add(G5, "duplicate_news_article_url", "The same news article URL stored as more than one document.", `SELECT MIN(doc_id) AS id FROM documents WHERE source_kind = 'news' AND url IS NOT NULL GROUP BY url HAVING COUNT(*) > 1`, { finding: "INV-14" });
  add(G5, "duplicate_news_title_publisher_day", "The same headline from the same publisher on one day, more than once.", `SELECT MIN(doc_id) AS id FROM documents WHERE source_kind = 'news' GROUP BY title, publisher, substr(published_at, 1, 10) HAVING COUNT(*) > 1`, { finding: "INV-14" });
  add(G5, "duplicate_news_url_in_one_incident", "One incident lists the same article URL twice.", `SELECT linked_incident_id AS id FROM documents WHERE linked_incident_id IS NOT NULL GROUP BY linked_incident_id, url HAVING COUNT(*) > 1`, { finding: "INV-14" });
  add(G5, "outlet_count_is_not_publishers", "outlet_count counts articles: it differs from the distinct publishers of the incident's articles.", `SELECT i.incident_id AS id FROM incidents i WHERE i.outlet_count > 0 AND i.outlet_count <> (SELECT COUNT(DISTINCT d.publisher) FROM documents d WHERE d.linked_incident_id = i.incident_id)`, { finding: "INV-14" });
  add(G5, "duplicate_event_same_text_time_place", "Two reports with the same title, text, time and place.", `SELECT MIN(event_id) AS id FROM events GROUP BY title, text, reported_at, place_text HAVING COUNT(*) > 1`, { finding: "INV-14" });
  add(G5, "duplicate_action_same_incident_text_dept", "The same step for one department twice in one incident.", `SELECT MIN(action_id) AS id FROM actions GROUP BY incident_id, text, dept_code HAVING COUNT(*) > 1`, { finding: "INV-15" });
  add(G5, "duplicate_incident_same_title_time_place", "Two incidents with the same title, time and place.", `SELECT MIN(incident_id) AS id FROM incidents GROUP BY title, first_reported_at, place_text HAVING COUNT(*) > 1`, { finding: "INV-14" });

  // -------------------------------------------------------------- dates --
  const G6 = "impossible dates";
  for (const [t, meta] of Object.entries(s.tables)) {
    if (!meta.dates.length) continue;
    const rows = s.db.prepare(`SELECT COUNT(*) AS n FROM ${q(t)}`).get().n;
    if (!rows) continue;
    const k = idExpr(s, t);
    const each = (test, cols = meta.dates) => cols.map((col) => `SELECT ${k} || ':${col}' AS id FROM ${q(t)} WHERE ${test(q(col))}`).join(" UNION ALL ");
    const onFail = meta.kind === "pipeline" ? PIPE : APP;
    add(G6, `date_invalid:${t}`, `A date in ${t} that is not a real date.`, each((c) => `bad_date(${c}) = 1`), { on_fail: onFail });
    add(G6, `date_before_2000:${t}`, `A date in ${t} before the year 2000.`, each((c) => `date_key(${c}) < '2000-01-01'`), { on_fail: onFail });
    const fut = meta.dates.filter((col) => !FUTURE_OK.has(col) && !FUTURE_OK.has(`${t}.${col}`));
    if (fut.length) {
      const limit = meta.kind === "pipeline" ? BUILT : durableAsOf;
      const o = { on_fail: onFail };
      if (["events", "incidents", "incident_members", "observations"].includes(t)) Object.assign(o, { finding: "INV-9", open: "OPEN-11" });
      add(G6, `date_future:${t}`, `A date in ${t} after the moment the data was made (${limit}).`, each((c) => `date_key(${c}) > '${limit}'`, fut), o);
    }
  }
  add(G6, "alert_future_date_not_a_warning", "An alert dated after the build that is not a weather warning.", `SELECT alert_id AS id FROM alerts WHERE date > '${BUILT.slice(0, 10)}' AND type <> 'weather_warning'`);
  add(G6, "document_fetched_before_published", "An article fetched before it was published.", `SELECT doc_id AS id FROM documents WHERE published_at > fetched_at`);
  add(G6, "source_item_fetched_before_published", "A source item fetched before it was published.", `SELECT item_id AS id FROM source_items WHERE published_at > fetched_at`);
  add(G6, "news_event_before_its_article", "A news report dated before its article was published.", `SELECT e.event_id AS id FROM events e JOIN documents d ON d.event_id = e.event_id WHERE e.reported_at < d.published_at`);
  add(G6, "article_before_its_incident", "A linked article published before the incident's first report.", `SELECT d.doc_id AS id FROM documents d JOIN incidents i ON i.incident_id = d.linked_incident_id WHERE d.published_at < i.first_reported_at`);
  add(G6, "source_newest_after_last_success", "A source's newest record is later than its last good fetch.", `SELECT source AS id FROM source_health WHERE newest_record_at > last_success_at`);
  add(G6, "event_newer_than_source_says", "A report later than the newest record its own source says it has: the source could not have known it.", `SELECT e.event_id AS id FROM events e JOIN source_health h ON h.source = e.source WHERE e.reported_at > h.newest_record_at`, { finding: "INV-9", open: "OPEN-11" });
  add(G6, "reading_newer_than_source_says", "A reading later than the newest record its own source says it has.", `SELECT o.metric || '|' || o.place_id || '|' || o.observed_at AS id FROM observations o JOIN source_health h ON h.source = o.source WHERE o.observed_at > h.newest_record_at`, { finding: "INV-9", open: "OPEN-11" });
  add(G6, "real_complaint_report_before_filing", "A report dated over a minute before its real complaint was filed.", `SELECT c.complaint_code AS id FROM complaints c JOIN events e ON e.event_id = 'GRV-' || c.complaint_code WHERE (julianday(c.created_at) - julianday(e.reported_at)) * 1440 > 1`);
  add(G6, "complaint_before_account", "A complaint filed before its account existed.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c JOIN users u ON u.id = c.user_id WHERE c.created_at < u.created_at`);
  add(G6, "note_written_before_its_data", "A briefing note written before the data it describes.", `SELECT section || '|' || item_key AS id FROM briefing_notes WHERE written_at < as_of`);
  add(G6, "incident_id_date_differs_from_first_report", "The date inside an incident's id differs from its first report.", `SELECT incident_id AS id FROM incidents WHERE substr(incident_id, 5, 8) <> replace(substr(first_reported_at, 1, 10), '-', '')`, { finding: "INV-20" });

  // ------------------------------------------------------- totals across --
  const G7 = "totals across tables";
  const memberCount = (name, col, where, what) => add(G7, name, what, `SELECT i.incident_id AS id FROM incidents i WHERE COALESCE(i.${col}, 0) <> (SELECT COUNT(*) FROM incident_members m WHERE m.incident_id = i.incident_id${where})`);
  memberCount("incident_member_count", "member_count", "", "member_count differs from the rows in incident_members.");
  memberCount("incident_citizen_complaints", "citizen_complaints", " AND m.source = 'grievance'", "citizen_complaints differs from its complaint rows.");
  memberCount("incident_police_reports", "police_reports", " AND m.source = 'police'", "police_reports differs from its police rows.");
  memberCount("incident_outlet_count_vs_news_rows", "outlet_count", " AND m.source = 'news'", "outlet_count differs from its news rows.");
  add(G7, "incident_source_count", "source_count differs from the distinct sources.", `SELECT i.incident_id AS id FROM incidents i WHERE i.source_count <> (SELECT COUNT(DISTINCT m.source) FROM incident_members m WHERE m.incident_id = i.incident_id)`);
  add(G7, "member_rows_vs_events", "An event with no member row, or a member row with another incident.", `SELECT e.event_id AS id FROM events e LEFT JOIN incident_members m ON m.event_id = e.event_id WHERE m.incident_id IS NOT e.incident_id`);
  add(G7, "event_in_two_incidents", "One report in two incidents.", `SELECT event_id AS id FROM incident_members GROUP BY event_id HAVING COUNT(*) > 1`);
  add(G7, "incident_dead_vs_reports", "Deaths differ from the most any of its reports gave.", `SELECT i.incident_id AS id FROM incidents i WHERE COALESCE(i.dead, 0) <> (SELECT COALESCE(MAX(e.dead), 0) FROM events e WHERE e.incident_id = i.incident_id)`);
  add(G7, "incident_injured_vs_reports", "Injured differ from the most any of its reports gave.", `SELECT i.incident_id AS id FROM incidents i WHERE COALESCE(i.injured, 0) <> (SELECT COALESCE(MAX(e.injured), 0) FROM events e WHERE e.incident_id = i.incident_id)`);
  add(G7, "incident_action_total", "action_total differs from its actions.", `SELECT i.incident_id AS id FROM incidents i WHERE COALESCE(i.action_total, 0) <> (SELECT COUNT(*) FROM actions a WHERE a.incident_id = i.incident_id)`);
  add(G7, "incident_action_done", "action_done differs from its finished actions.", `SELECT i.incident_id AS id FROM incidents i WHERE COALESCE(i.action_done, 0) <> (SELECT COUNT(*) FROM actions a WHERE a.incident_id = i.incident_id AND a.status = 'Done')`);
  add(G7, "incident_only_junk_reports", "An incident whose every report the pipeline itself flags as unusable text (\"ok\", \"testing\", random letters).", `SELECT i.incident_id AS id FROM incidents i WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.incident_id = i.incident_id AND COALESCE(e.junk_flag, 0) = 0)`, { finding: "INV-13" });
  add(G7, "daily_counts_miss_junk_complaints", "A report left out of daily_counts because it is flagged junk.", `SELECT event_id AS id FROM events WHERE junk_flag = 1`, { finding: "INV-11", open: "OPEN-11" });
  add(G7, "daily_counts_miss_imd_and_cpcb", "A report left out of daily_counts because its source is IMD or CPCB.", `SELECT event_id AS id FROM events WHERE source IN ('imd', 'cpcb')`, { finding: "INV-11", open: "OPEN-11" });
  const evKeys = `SELECT substr(reported_at, 1, 10) AS d, zone_no AS z, category_code AS c, source AS s, COUNT(*) AS n FROM events WHERE source NOT IN ('imd', 'cpcb') AND COALESCE(junk_flag, 0) = 0 GROUP BY 1, 2, 3, 4`;
  add(G7, "daily_counts_vs_events_after_those_rules", "Once junk, IMD and CPCB are set aside, each day, zone, category and source agrees with events.", `SELECT ev.d || '|' || COALESCE(ev.z, '') || '|' || ev.c || '|' || ev.s AS id FROM (${evKeys}) ev LEFT JOIN daily_counts k ON k.date = ev.d AND k.zone_no IS ev.z AND k.category_code = ev.c AND k.source = ev.s WHERE k.count IS NOT ev.n UNION ALL SELECT k.date || '|' || COALESCE(k.zone_no, '') || '|' || k.category_code || '|' || k.source FROM daily_counts k LEFT JOIN (${evKeys}) ev ON k.date = ev.d AND k.zone_no IS ev.z AND k.category_code = ev.c AND k.source = ev.s WHERE ev.n IS NULL`);
  add(G7, "kpis_incidents", "kpis.incidents against incidents.", kpiVsIncidents("incidents", "COUNT(*)"));
  add(G7, "kpis_severe", "kpis.severe_incidents against incidents.", kpiVsIncidents("severe_incidents", "SUM(i.severity_level = 'Severe')"));
  add(G7, "kpis_high", "kpis.high_incidents against incidents.", kpiVsIncidents("high_incidents", "SUM(i.severity_level = 'High')"));
  add(G7, "kpis_open", "kpis.open_incidents against incidents.", kpiVsIncidents("open_incidents", "SUM(i.is_open)"));
  add(G7, "kpis_past_deadline_open", "kpis.sla_breached_open against incidents.", kpiVsIncidents("sla_breached_open", "SUM(i.is_open = 1 AND i.sla_breached = 1)"));
  add(G7, "kpis_multi_source", "kpis.multi_source_incidents against incidents.", kpiVsIncidents("multi_source_incidents", "SUM(i.source_count > 1)"));
  add(G7, "kpis_news_only", "kpis.media_only against incidents.", kpiVsIncidents("media_only", "SUM(i.media_only)"));
  add(G7, "kpis_resolved_vs_closed_in_window", "kpis.resolved equals every incident closed in the window.", `SELECT ${kpiId} AS id FROM kpis k WHERE COALESCE(k.resolved, 0) <> (SELECT COUNT(*) FROM incidents i WHERE ${inKpi("i", "closed_at")})`);
  add(G7, "kpis_resolved_counts_rejected", "kpis.resolved also counts Rejected incidents: it differs from those truly Resolved.", `SELECT ${kpiId} AS id FROM kpis k WHERE COALESCE(k.resolved, 0) <> (SELECT COUNT(*) FROM incidents i WHERE i.status_std = 'Resolved' AND ${inKpi("i", "closed_at")})`, { finding: "INV-8", open: "OPEN-8" });
  add(G7, "kpis_complaints_filed_vs_events", "kpis.complaints_filed equals complaints by their own filing time.", `SELECT ${kpiId} AS id FROM kpis k WHERE COALESCE(k.complaints_filed, 0) <> (SELECT COUNT(*) FROM events e WHERE e.source = 'grievance' AND ${inKpi("e", "reported_at")})`);
  add(G7, "kpis_complaints_open_vs_events", "kpis.complaints_open equals those complaints not yet closed.", `SELECT ${kpiId} AS id FROM kpis k WHERE COALESCE(k.complaints_open, 0) <> (SELECT COUNT(*) FROM events e WHERE e.source = 'grievance' AND e.closed_at IS NULL AND ${inKpi("e", "reported_at")})`);
  add(G7, "kpis_complaints_filed_vs_console_rule", "kpis.complaints_filed against the console's rule (complaints on incidents first reported in the window).", kpiVsIncidents("complaints_filed", "SUM(i.citizen_complaints)"), { finding: "INV-8", open: "OPEN-8" });
  add(G7, "kpis_complaints_open_vs_console_rule", "kpis.complaints_open against the console's Open complaints tile rule.", kpiVsIncidents("complaints_open", "SUM(CASE WHEN i.is_open = 1 THEN i.citizen_complaints ELSE 0 END)"), { finding: "INV-8", open: "OPEN-8" });
  add(G7, "kpis_median_first_action", "kpis.median_hours_to_first_action against the median over incidents with a resolution deadline, the rule that reproduces it.", `WITH x AS (SELECT ${kpiId} AS id, k.median_hours_to_first_action AS m, i.hours_to_first_action AS h, ROW_NUMBER() OVER (PARTITION BY k.period, k."offset", k.zone_no ORDER BY i.hours_to_first_action) AS rn, COUNT(*) OVER (PARTITION BY k.period, k."offset", k.zone_no) AS n FROM kpis k JOIN incidents i ON ${inKpi("i", "first_reported_at")} WHERE i.sla_basis = 'resolution' AND i.hours_to_first_action IS NOT NULL) SELECT id FROM x WHERE rn IN ((n + 1) / 2, (n + 2) / 2) GROUP BY id HAVING ABS(AVG(h) - MAX(m)) > 0.11`);
  add(G7, "metrics_vs_raw_counts", "The pipeline's own metrics against counts of the rows.", [
    metricIs("linking.multi_source_incidents", "linking", "$.multi_source_incidents", `SELECT COUNT(*) FROM incidents WHERE source_count > 1`),
    metricIs("linking.linked_pairs", "linking", "$.linked_pairs", `SELECT COUNT(*) FROM link_pairs WHERE decision = 'linked'`),
    metricIs("linking.review_pairs", "linking", "$.review_pairs", `SELECT COUNT(*) FROM link_pairs WHERE decision = 'review'`),
    metricIs("news_gate.incident_articles", "news_gate", "$.incident_articles", `SELECT COUNT(*) FROM documents WHERE is_incident = 1`),
    metricIs("news_funnel.documents", "news_funnel", "$.documents", `SELECT COUNT(*) FROM documents WHERE source_kind = 'news'`),
    metricIs("news_funnel.stories", "news_funnel", "$.stories", `SELECT COUNT(DISTINCT story_id) FROM documents WHERE story_id IS NOT NULL`),
    metricIs("news_funnel.incident_events", "news_funnel", "$.incident_events", `SELECT COUNT(*) FROM events WHERE source = 'news'`),
    metricIs("news_funnel.with_full_text", "news_funnel", "$.with_full_text", `SELECT COUNT(*) FROM documents WHERE source_kind = 'news' AND body IS NOT NULL AND TRIM(body) <> ''`),
    metricIs("overlay.planted_records", "overlay", "$.planted_records", `SELECT COUNT(*) FROM events WHERE is_overlay = 1`),
    metricIs("overlay.by_source.grievance", "overlay", "$.by_source.grievance", `SELECT COUNT(*) FROM events WHERE is_overlay = 1 AND source = 'grievance'`),
    metricIs("overlay.by_source.police", "overlay", "$.by_source.police", `SELECT COUNT(*) FROM events WHERE is_overlay = 1 AND source = 'police'`),
    metricIs("overlay.by_source.pwd", "overlay", "$.by_source.pwd", `SELECT COUNT(*) FROM events WHERE is_overlay = 1 AND source = 'pwd'`),
    metricIs("wording.police.records", "wording", "$.police.records", `SELECT COUNT(*) FROM events WHERE source = 'police'`),
    metricIs("wording.pwd.records", "wording", "$.pwd.records", `SELECT COUNT(*) FROM events WHERE source = 'pwd'`),
    metricIs("wording.grievance.records", "wording", "$.grievance.records", `SELECT COUNT(*) FROM events WHERE source = 'grievance'`),
    metricIs("anomalies.total", "anomalies", "$.spikes", `SELECT COUNT(*) FROM anomalies WHERE kind = 'spike'`),
    metricIs("anomalies.slow_rises", "anomalies", "$.slow_rises", `SELECT COUNT(*) FROM anomalies WHERE kind = 'slow_rise'`),
    metricIs("priority_learning.decisions", "priority_learning", "$.decisions", `SELECT COUNT(*) FROM collector_decisions`),
    metricIs("briefing_unverified_numbers", "briefing_unverified_numbers", "$", `SELECT COALESCE(SUM(unverified_numbers), 0) FROM briefings`)
  ].join(" UNION ALL "));
  add(G7, "source_health_rows_vs_events", "source_health rows plus the planted records equal the events of that source.", `SELECT h.source AS id FROM source_health h WHERE h.source IN ('grievance', 'police', 'pwd', 'hospital') AND h.rows + (SELECT COUNT(*) FROM events e WHERE e.source = h.source AND e.is_overlay = 1) <> (SELECT COUNT(*) FROM events e WHERE e.source = h.source)`);
  add(G7, "data_quality_table_vs_rows", "The pipeline's own data_quality counts against the rows.", [
    ["not in the future", `SELECT COUNT(*) FROM events WHERE reported_at > '${BUILT}'`],
    ["closed not before reported", `SELECT COUNT(*) FROM events WHERE closed_at < reported_at`],
    ["inside the district", `SELECT COUNT(*) FROM events WHERE in_district = 0`],
    ["text usable", `SELECT COUNT(*) FROM events WHERE junk_flag = 1`]
  ].map(([chk, sql]) => `SELECT '${chk}' AS id WHERE (SELECT failing FROM data_quality WHERE "check" = '${chk}') <> (${sql})`).join(" UNION ALL "));
  add(G7, "data_quality_quarantine_not_applied", "The pipeline's hard rule says future reports are quarantined; they are still in incidents.", `SELECT e.event_id AS id FROM events e JOIN data_quality q ON q."check" = 'not in the future' AND q.action = 'quarantine' WHERE e.reported_at > '${BUILT}'`, { finding: "INV-9", open: "OPEN-11" });
  add(G7, "ward_incidents_30d", "ref_wards.incidents_30d against incidents.", `SELECT CAST(w.ward_no AS TEXT) AS id FROM ref_wards w WHERE w.incidents_30d <> (SELECT COUNT(*) FROM incidents i WHERE i.ward_no = w.ward_no AND julianday(i.first_reported_at) > julianday('${AS_OF}') - 30 AND i.first_reported_at <= '${AS_OF}')`);
  add(G7, "ward_open_incidents", "ref_wards.open_incidents against incidents.", `SELECT CAST(w.ward_no AS TEXT) AS id FROM ref_wards w WHERE w.open_incidents <> (SELECT COUNT(*) FROM incidents i WHERE i.ward_no = w.ward_no AND i.is_open = 1)`);
  add(G7, "ward_open_past_deadline", "ref_wards.open_past_deadline against incidents.", `SELECT CAST(w.ward_no AS TEXT) AS id FROM ref_wards w WHERE w.open_past_deadline <> (SELECT COUNT(*) FROM incidents i WHERE i.ward_no = w.ward_no AND i.is_open = 1 AND i.sla_breached = 1)`);
  add(G7, "hotspot_incidents", "A hotspot's counts against its incidents.", `SELECT h.hotspot_id AS id FROM hotspots h WHERE h.incidents <> (SELECT COUNT(*) FROM incidents i WHERE i.hotspot_id = h.hotspot_id) OR h.open <> (SELECT COUNT(*) FROM incidents i WHERE i.hotspot_id = h.hotspot_id AND i.is_open = 1) OR h.incidents_30d <> (SELECT COUNT(*) FROM incidents i WHERE i.hotspot_id = h.hotspot_id AND julianday(i.first_reported_at) > julianday('${AS_OF}') - 30 AND i.first_reported_at <= '${AS_OF}')`);
  add(G7, "gap_differs_from_incident", "A news gap's facts differ from its incident, or the incident is not news-only.", `SELECT g.incident_id AS id FROM gaps g JOIN incidents i USING (incident_id) WHERE i.media_only = 0 OR g.title IS NOT i.title OR g.severity_level IS NOT i.severity_level OR g.outlet_count IS NOT i.outlet_count OR g.priority_score IS NOT i.priority_score OR g.lead_dept IS NOT i.lead_dept OR g.category_code IS NOT i.category_code OR g.first_reported_at IS NOT i.first_reported_at`);
  add(G7, "signal_differs_from_observation", "A signal's value differs from its reading.", `SELECT s.metric || '|' || s.place_id AS id FROM observation_signals s WHERE s.value <> (SELECT o.value FROM observations o WHERE o.metric = s.metric AND o.place_id = s.place_id AND o.observed_at = s.observed_at LIMIT 1) OR NOT EXISTS (SELECT 1 FROM observations o WHERE o.metric = s.metric AND o.place_id = s.place_id)`);
  add(G7, "linked_pair_in_two_incidents", "A pair marked linked whose reports sit in different incidents.", `SELECT l.event_a || '~' || l.event_b AS id FROM link_pairs l JOIN events a ON a.event_id = l.event_a JOIN events b ON b.event_id = l.event_b WHERE l.decision = 'linked' AND a.incident_id <> b.incident_id`);
  const bkpi = ["incidents", "severe_incidents", "open_incidents", "resolved", "complaints_filed", "complaints_open", "sla_breached_open", "multi_source_incidents", "media_only"];
  add(G7, "briefing_figures_vs_kpis", "A briefing's fact pack against the kpis table.", bkpi.map((f) => `SELECT b.briefing_id || ':${f}' AS id FROM briefings b JOIN kpis k ON k.period = b.period AND k."offset" = 0 AND k.zone_no IS NULL WHERE CAST(json_extract(b.fact_pack, '$.kpi.${f}') AS REAL) <> k.${f}`).join(" UNION ALL "));
  add(G7, "briefing_incidents_vs_incidents", "A briefing's incident count against the incidents themselves.", `SELECT b.briefing_id AS id FROM briefings b JOIN kpis k ON k.period = b.period AND k."offset" = 0 AND k.zone_no IS NULL WHERE CAST(json_extract(b.fact_pack, '$.kpi.incidents') AS INTEGER) <> (SELECT COUNT(*) FROM incidents i WHERE i.first_reported_at > k.window_start AND i.first_reported_at <= k.window_end)`);
  add(G7, "briefing_text_vs_figures", "A briefing's text does not state its own incident count.", `SELECT b.briefing_id AS id FROM briefings b JOIN kpis k ON k.period = b.period AND k."offset" = 0 AND k.zone_no IS NULL WHERE instr(b.markdown, k.incidents || ' incidents') = 0`);
  add(G7, "briefing_attention_vs_incidents", "A briefing's attention item differs from the incident, or the incident is missing.", `SELECT b.briefing_id || ':' || json_extract(j.value, '$.id') AS id FROM briefings b, json_each(b.fact_pack, '$.attention') j LEFT JOIN incidents i ON i.incident_id = json_extract(j.value, '$.id') WHERE i.incident_id IS NULL OR json_extract(j.value, '$.severity') IS NOT i.severity_level OR json_extract(j.value, '$.status') IS NOT i.status_std OR json_extract(j.value, '$.ward') IS NOT i.ward_no OR json_extract(j.value, '$.zone') IS NOT i.zone_name`);
  add(G7, "briefing_attention_count", "attention_items differs from the items listed.", `SELECT briefing_id AS id FROM briefings WHERE attention_items <> json_array_length(fact_pack, '$.attention')`);
  add(G7, "briefing_as_of_vs_metric", "A briefing's as-of differs from the build's as-of.", `SELECT briefing_id AS id FROM briefings WHERE as_of <> '${AS_OF}'`);
  add(G7, "complaint_not_in_events", "A complaint in the portal's table that the console's reports do not have.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.event_id = 'GRV-' || c.complaint_code)`, { finding: "INV-17" });
  add(G7, "grievance_event_without_complaint", "A grievance report with no complaint in the portal's table.", `SELECT e.event_id AS id FROM events e WHERE e.source = 'grievance' AND e.event_id NOT IN (SELECT 'GRV-' || c.complaint_code FROM complaints c)`, { finding: "INV-17" });
  add(G7, "real_complaint_not_in_events", "A real (not synthetic) complaint missing from the console's reports.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c WHERE c.is_synthetic = 0 AND NOT EXISTS (SELECT 1 FROM events e WHERE e.event_id = 'GRV-' || c.complaint_code)`);
  add(G7, "report_link_points_to_localhost", "A report's link points to a developer's own machine.", `SELECT event_id AS id FROM events WHERE deep_link LIKE 'http://localhost%' OR deep_link LIKE 'http://127.%'`, { finding: "INV-17" });

  // ---------------------------------------------------------- orphan rows --
  const G8 = "orphan rows";
  const orphan = (name, t, id, col, parent, pcol, o) => add(G8, name, `${t}.${col} points at a ${parent} row that does not exist.`, `SELECT CAST(a.${id} AS TEXT) AS id FROM ${t} a WHERE a.${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.${pcol} = a.${col})`, o);
  orphan("orphan_member_without_incident", "incident_members", "event_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_member_without_event", "incident_members", "event_id", "event_id", "events", "event_id");
  orphan("orphan_event_without_incident", "events", "event_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_action_without_incident", "actions", "action_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_action_without_event", "actions", "action_id", "event_id", "events", "event_id");
  orphan("orphan_timeline_without_incident", "incident_timeline", "event_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_timeline_without_event", "incident_timeline", "event_id", "event_id", "events", "event_id");
  orphan("orphan_history_without_complaint", "complaint_status_history", "id", "complaint_id", "complaints", "id");
  orphan("orphan_document_without_incident", "documents", "doc_id", "linked_incident_id", "incidents", "incident_id");
  orphan("orphan_document_without_event", "documents", "doc_id", "event_id", "events", "event_id");
  orphan("orphan_gap_without_incident", "gaps", "incident_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_incident_without_hotspot", "incidents", "incident_id", "hotspot_id", "hotspots", "hotspot_id");
  orphan("orphan_link_pair_a", "link_pairs", "event_a", "event_a", "events", "event_id");
  orphan("orphan_link_pair_b", "link_pairs", "event_b", "event_b", "events", "event_id");
  orphan("orphan_action_update_incident", "action_updates", "update_id", "incident_id", "incidents", "incident_id");
  orphan("orphan_complaint_user", "complaints", "id", "user_id", "users", "id");
  add(G8, "null_parent_rows", "A member, action or timeline row with no incident at all.", `SELECT 'members:' || event_id AS id FROM incident_members WHERE incident_id IS NULL UNION ALL SELECT 'actions:' || action_id FROM actions WHERE incident_id IS NULL UNION ALL SELECT 'timeline:' || event_id FROM incident_timeline WHERE incident_id IS NULL UNION ALL SELECT 'events:' || event_id FROM events WHERE incident_id IS NULL`);
  add(G8, "incident_without_members", "An incident with no reports.", `SELECT i.incident_id AS id FROM incidents i WHERE NOT EXISTS (SELECT 1 FROM incident_members m WHERE m.incident_id = i.incident_id)`);
  add(G8, "complaint_without_history", "A complaint with no history.", `SELECT CAST(c.id AS TEXT) AS id FROM complaints c WHERE NOT EXISTS (SELECT 1 FROM complaint_status_history h WHERE h.complaint_id = c.id)`);
  add(G8, "alert_incident_missing", "An alert names an incident that does not exist.", `SELECT a.alert_id AS id FROM alerts a, json_each('["' || replace(a.incident_ids, '|', '","') || '"]') j WHERE a.incident_ids IS NOT NULL AND j.value NOT IN (SELECT incident_id FROM incidents)`);
  add(G8, "review_gap_incident_missing", "A review item names an incident that does not exist.", `SELECT review_id AS id FROM review_queue WHERE item_type = 'gap' AND item_id NOT IN (SELECT incident_id FROM incidents)`);
  const lost = { finding: "INV-12", note: "These rows are the Collector's and officers' own work. They name incident ids this build no longer has." };
  orphan("orphan_collector_decision", "collector_decisions", "decision_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_department_assignment", "dept_assignments", "incident_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_officer_report", "officer_reports", "report_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_officer_step", "officer_steps", "step_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_followup", "followups", "followup_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_outbound_email", "outbound_emails", "email_id", "incident_id", "incidents", "incident_id", lost);
  orphan("orphan_action_update_action", "action_updates", "update_id", "action_id", "actions", "action_id", lost);
  add(G8, "archived_briefing_incident_missing", "An incident named in an issued briefing (kept in the archive) that this build no longer has.", `SELECT DISTINCT id FROM (SELECT CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.id') END AS id FROM briefing_archive a, json_each(CASE WHEN json_valid(a.fact_pack) THEN a.fact_pack ELSE '{}' END, '$.attention') j) WHERE id IS NOT NULL AND id NOT IN (SELECT incident_id FROM incidents)`, lost);

  // ------------------------------------------------------- zones 1 to 15 --
  const G9 = "zones 1 to 15";
  for (const [t, col, id] of [["incidents", "zone_no", "incident_id"], ["events", "zone_no", "event_id"], ["complaints", "zone_id", "id"], ["daily_counts", "zone_no", "date"], ["kpis", "zone_no", "period"], ["observations", "zone_no", "metric"],
    ["alerts", "zone_no", "alert_id"], ["anomalies", "zone_no", "date"], ["ref_wards", "zone_no", "ward_no"], ["ref_zones", "zone_no", "zone_no"], ["zone_wards", "zone_id", "ward_number"], ["official_contacts", "zone_no", "contact_id"], ["source_items", "zone_no", "item_id"], ["user_profiles", "zone_id", "id"]])
    add(G9, `zone_out_of_range:${t}`, `${t}.${col} is outside 1 to 15.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NOT NULL AND (${col} < 1 OR ${col} > 15 OR ${col} <> CAST(${col} AS INTEGER))`);
  add(G9, "zones_are_exactly_15", "A zone number missing from the zone tables.", `WITH RECURSIVE n(z) AS (SELECT 1 UNION ALL SELECT z + 1 FROM n WHERE z < 15) SELECT CAST(z AS TEXT) AS id FROM n WHERE z NOT IN (SELECT zone_no FROM ref_zones) OR z NOT IN (SELECT zone_number FROM zones)`);

  // ------------------------------------------------------------ positions --
  const G10 = "latitude and longitude";
  for (const [t, la, lo, id] of [["incidents", "lat", "lon", "incident_id"], ["events", "lat", "lon", "event_id"], ["documents", "lat", "lon", "doc_id"], ["complaints", "latitude", "longitude", "id"], ["hotspots", "lat", "lon", "hotspot_id"],
    ["ref_wards", "centroid_lat", "centroid_lon", "ward_no"], ["ref_taluks", "lat", "lon", "taluk_code"], ["source_items", "lat", "lon", "item_id"]])
    add(G10, `position_outside_chennai:${t}`, `${t} has a position outside Chennai's bounds (lat ${LAT.join(" to ")}, lon ${LON.join(" to ")}).`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${outOfBounds(la, lo)}`);
  add(G10, "position_half_missing", "A latitude with no longitude, or the other way round.", `SELECT 'incidents:' || incident_id AS id FROM incidents WHERE (lat IS NULL) <> (lon IS NULL) UNION ALL SELECT 'events:' || event_id FROM events WHERE (lat IS NULL) <> (lon IS NULL) UNION ALL SELECT 'complaints:' || id FROM complaints WHERE (latitude IS NULL) <> (longitude IS NULL)`);
  add(G10, "position_outside_chennai:facilities_not_lakes", "A facility outside the bounds that is not one of the city's outlying reservoirs.", `SELECT facility_id AS id FROM ref_facilities WHERE ${outOfBounds("lat", "lon")} AND type <> 'lake'`);
  add(G10, "position_outside_chennai:observations_not_lakes", "A reading outside the bounds that is not from a lake.", `SELECT DISTINCT place_id AS id FROM observations WHERE ${outOfBounds("lat", "lon")} AND place_id NOT IN (SELECT facility_id FROM ref_facilities WHERE type = 'lake')`);
  add(G10, "position_outside_chennai:pwd_works_not_lakes", "A public work outside the bounds that is not at a lake.", `SELECT work_id AS id FROM pwd_works WHERE ${outOfBounds("latitude", "longitude")} AND asset_name NOT IN (SELECT name FROM ref_facilities WHERE type = 'lake')`);

  // ------------------------------------------------------------- severity --
  const G11 = "severity";
  for (const [t, col, id] of [["incidents", "severity_level", "incident_id"], ["events", "severity_level", "event_id"], ["incident_members", "severity_level", "event_id"], ["gaps", "severity_level", "incident_id"], ["alerts", "severity", "alert_id"]])
    add(G11, `severity_not_allowed:${t}`, `${t}.${col} is outside Severe, High, Medium, Low.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NULL OR ${col} NOT IN ${SEVERITIES}`);

  // ---------------------------------------------------------------- empty --
  const G12 = "empty text";
  for (const [t, col, id] of [["incidents", "title", "incident_id"], ["incidents", "summary", "incident_id"], ["events", "title", "event_id"], ["events", "text", "event_id"], ["incident_members", "title", "event_id"], ["documents", "title", "doc_id"], ["complaints", "title", "id"], ["complaints", "description", "id"],
    ["actions", "text", "action_id"], ["alerts", "title", "alert_id"], ["gaps", "title", "incident_id"], ["pwd_works", "work_title", "work_id"], ["ref_categories", "label", "category_code"], ["ref_departments", "name", "code"], ["ref_zones", "zone_name", "zone_no"], ["ref_taluks", "name", "taluk_code"]])
    add(G12, `empty:${t}.${col}`, `${t}.${col} is empty.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NULL OR TRIM(${col}) = ''`);
  add(G12, "incident_title_has_no_place", "An incident title of the form 'category –' with nothing after the dash.", `SELECT incident_id AS id FROM incidents WHERE title LIKE '%–' OR title LIKE '%– '`);

  // ---------------------------------------------------- shown text quality --
  const G13 = "control characters and broken text";
  const G14 = "personal data in shown text";
  for (const [t, cols] of Object.entries(SHOWN)) {
    const k = idExpr(s, t);
    for (const col of cols) {
      add(G13, `control_chars:${t}.${col}`, `${t}.${col} holds control characters or a replacement character.`, `SELECT ${k} AS id FROM ${q(t)} WHERE has_control_chars(${q(col)}) = 1`);
      const o = {};
      if (t === "documents" && ["title", "title_en", "summary"].includes(col)) Object.assign(o, { on_fail: APP, finding: "INV-2", note: "The search box shows this field as stored; Jarvis's path hides the same text." });
      if (t === "documents" && col === "body") Object.assign(o, { finding: "INV-22", note: "The publisher's own article text: mostly helplines, booking numbers and reporters' emails. Reported, not an app fault." });
      add(G14, `personal_data:${t}.${col}`, `${t}.${col} holds a mobile number, an Aadhaar-shaped number or an email.`, `SELECT ${k} AS id FROM ${q(t)} WHERE has_personal_data(${q(col)}) = 1`, o);
    }
  }
  const shownCols = Object.entries(SHOWN).flatMap(([t, cols]) => cols.map((col) => [t, col]));
  add(G14, "aadhaar_shaped_in_any_shown_field", "An Aadhaar-shaped number in any shown field.", shownCols.map(([t, col]) => `SELECT '${t}.${col}:' || ${idExpr(s, t)} AS id FROM ${q(t)} WHERE has_aadhaar(${q(col)}) = 1`).join(" UNION ALL "));
  add(G14, "citizen_contact_in_shown_complaint_text", "A phone number or email in a complaint's or report's own shown text.", `SELECT 'complaints:' || id AS id FROM complaints WHERE has_personal_data(title) = 1 OR has_personal_data(description) = 1 OR has_personal_data(specific_location) = 1 OR has_personal_data(remarks) = 1 UNION ALL SELECT 'events:' || event_id FROM events WHERE source = 'grievance' AND (has_personal_data(title) = 1 OR has_personal_data(text) = 1)`);
  add(G14, "reporter_hash_is_not_a_hash", "reporter_hash holds something other than a 16-letter hash.", `SELECT event_id AS id FROM events WHERE reporter_hash IS NOT NULL AND (length(reporter_hash) <> 16 OR reporter_hash GLOB '*[^0-9a-f]*')`);
  add(G14, "complainant_contact_in_own_text", "A complaint's text repeats the citizen's own number or email.", `SELECT CAST(id AS TEXT) AS id FROM complaints WHERE (mobile_number IS NOT NULL AND (instr(description, mobile_number) > 0 OR instr(title, mobile_number) > 0)) OR (email IS NOT NULL AND (instr(description, email) > 0 OR instr(title, email) > 0))`);
  add(G13, "document_body_mojibake", "An article's text has broken characters (wrong encoding).", `SELECT doc_id AS id FROM documents WHERE has_mojibake(body) = 1 OR has_mojibake(title) = 1`, { finding: "INV-21" });
  add(G13, "document_body_html_left", "An article's text still has HTML tags or codes in it.", `SELECT doc_id AS id FROM documents WHERE has_html_left(body) = 1 OR has_html_left(title) = 1`, { finding: "INV-21" });
  add(G13, "source_item_title_html_left", "A source item's title still has HTML tags or codes in it.", `SELECT item_id AS id FROM source_items WHERE has_html_left(title) = 1`, { finding: "INV-21" });
  add(G13, "incident_title_html_or_mojibake", "An incident or report title has HTML or broken characters.", `SELECT 'incidents:' || incident_id AS id FROM incidents WHERE has_html_left(title) = 1 OR has_mojibake(title) = 1 UNION ALL SELECT 'events:' || event_id FROM events WHERE has_html_left(title) = 1 OR has_mojibake(title) = 1`);

  // ---------------------------------------------------------------- Tamil --
  const G15 = "Tamil fields";
  for (const [t, col, id] of [["ref_taluks", "name_ta", "taluk_code"], ["incidents", "ai_summary_ta", "incident_id"], ["briefings", "ai_summary_ta", "briefing_id"], ["briefing_notes", "text_ta", "section || '|' || item_key"]])
    add(G15, `tamil_field_not_tamil:${t}.${col}`, `${t}.${col} is filled but is not mostly Tamil.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE ${col} IS NOT NULL AND tamil_share(${col}) < 0.7`);
  add(G15, "tamil_name_missing:ref_taluks", "A taluk with no Tamil name.", `SELECT taluk_code AS id FROM ref_taluks WHERE name_ta IS NULL OR TRIM(name_ta) = ''`);
  add(G15, "tamil_garbled_word:incidents.ai_summary_ta", "Latin letters in the middle of a Tamil word.", `SELECT incident_id AS id FROM incidents WHERE tamil_latin_mix(ai_summary_ta) = 1`);
  add(G15, "tamil_garbled_word:briefings.ai_summary_ta", "Latin letters in the middle of a Tamil word.", `SELECT briefing_id AS id FROM briefings WHERE tamil_latin_mix(ai_summary_ta) = 1`, { finding: "INV-18" });
  add(G15, "tamil_garbled_word:briefing_notes.text_ta", "Latin letters in the middle of a Tamil word.", `SELECT section || '|' || item_key AS id FROM briefing_notes WHERE tamil_latin_mix(text_ta) = 1`);
  add(G15, "tamil_missing:incidents.ai_summary_ta", "An English AI summary with no Tamil one.", `SELECT incident_id AS id FROM incidents WHERE ai_summary IS NOT NULL AND ai_summary_ta IS NULL`);
  add(G15, "tamil_missing:briefings.ai_summary_ta", "A briefing summary with no Tamil one.", `SELECT briefing_id AS id FROM briefings WHERE ai_summary IS NOT NULL AND (ai_summary_ta IS NULL OR TRIM(ai_summary_ta) = '')`);
  add(G15, "tamil_missing:briefing_notes.text_ta", "A briefing note with English but no Tamil.", `SELECT section || '|' || item_key AS id FROM briefing_notes WHERE text_en IS NOT NULL AND (text_ta IS NULL OR TRIM(text_ta) = '')`, { finding: "INV-18" });
  add(G15, "tamil_report_without_tamil:events", "A report marked Tamil with no Tamil in it.", `SELECT event_id AS id FROM events WHERE lang = 'ta' AND has_tamil(text) = 0 AND has_tamil(title) = 0`);
  add(G15, "tamil_article_without_tamil:documents", "An article marked Tamil with no Tamil in it.", `SELECT doc_id AS id FROM documents WHERE lang = 'ta' AND has_tamil(title) = 0 AND has_tamil(summary) = 0`);
  add(G15, "english_report_with_tamil:events", "A report marked English or Tanglish with Tamil letters.", `SELECT event_id AS id FROM events WHERE lang IN ('en', 'tanglish') AND (has_tamil(text) = 1 OR has_tamil(title) = 1)`);
  add(G15, "english_article_with_tamil_title:documents", "An article marked English with a Tamil headline.", `SELECT doc_id AS id FROM documents WHERE lang = 'en' AND has_tamil(title) = 1`, { finding: "INV-18" });
  add(G15, "english_title_holds_tamil:documents.title_en", "title_en, the English headline, still holds Tamil.", `SELECT doc_id AS id FROM documents WHERE has_tamil(title_en) = 1`, { finding: "INV-18" });
  for (const [t, col, id] of [["incidents", "ai_summary", "incident_id"], ["incidents", "ai_attention", "incident_id"], ["incidents", "ai_next_step", "incident_id"], ["incidents", "summary", "incident_id"], ["briefings", "ai_summary", "briefing_id"], ["briefing_notes", "text_en", "section || '|' || item_key"]])
    add(G15, `english_field_holds_tamil:${t}.${col}`, `${t}.${col}, an English field, holds Tamil.`, `SELECT CAST(${id} AS TEXT) AS id FROM ${t} WHERE has_tamil(${col}) = 1`);
  return c;
}

// ---------------------------------------------------------------- running --

export function runCheck(db, chk) {
  const t0 = Date.now();
  try {
    const count = db.prepare(`SELECT COUNT(*) AS n FROM (${chk.sql})`).get().n;
    const examples = count ? db.prepare(`SELECT id FROM (${chk.sql}) ORDER BY id LIMIT 10`).all().map((r) => String(r.id)) : [];
    return { ...chk, count, examples, verdict: count ? chk.on_fail : "pass", ms: Date.now() - t0 };
  } catch (e) {
    throw new Error(`check ${chk.name}: ${e.message}`);
  }
}

export function readGuard() {
  return fs.existsSync(GUARD_FILE) ? JSON.parse(fs.readFileSync(GUARD_FILE, "utf8")) : { build_id: null, passing: [], failing: [] };
}

// ------------------------------------------------------------ the numbers --

/** The numbers the report states for the known items, computed from the same snapshot. */
export function knownItems(s) {
  const { db, asOf: AS_OF, builtAt: BUILT } = s;
  const one = (sql) => Object.values(db.prepare(sql).get())[0];
  const kpi = {};
  for (const p of ["daily", "weekly", "monthly", "quarterly"]) {
    const w = `i.first_reported_at > k.window_start AND i.first_reported_at <= k.window_end`;
    kpi[p] = db.prepare(`SELECT k.complaints_filed AS filed, k.complaints_open AS open, k.resolved AS resolved,
      (SELECT SUM(i.citizen_complaints) FROM incidents i WHERE ${w}) AS console_filed,
      (SELECT SUM(CASE WHEN i.is_open = 1 THEN i.citizen_complaints ELSE 0 END) FROM incidents i WHERE ${w}) AS console_open,
      (SELECT COUNT(*) FROM incidents i WHERE i.status_std = 'Resolved' AND i.closed_at > k.window_start AND i.closed_at <= k.window_end) AS truly_resolved
      FROM kpis k WHERE k.period = ? AND k."offset" = 0 AND k.zone_no IS NULL`).get(p);
  }
  const incidentIds = new Set(db.prepare(`SELECT incident_id AS id FROM incidents`).all().map((r) => r.id));
  const WORK = ["collector_decisions", "dept_assignments", "officer_reports", "officer_steps", "followups", "outbound_emails"];
  const durable = {};
  for (const t of WORK) {
    const rows = db.prepare(`SELECT incident_id AS id FROM ${t}`).all();
    durable[t] = { rows: rows.length, gone: rows.filter((r) => r.id && !incidentIds.has(r.id)).length };
  }
  // the pipeline names an incident from the md5 of its first report (district_intel/dintel/linking.py, _new_id), so an old id can be traced to that report
  const byHash = new Map(db.prepare(`SELECT event_id, incident_id FROM events`).all().map((r) => [crypto.createHash("md5").update(r.event_id).digest("hex").slice(0, 6).toUpperCase(), r.incident_id]));
  const lost = WORK.flatMap((t) => db.prepare(`SELECT incident_id AS id FROM ${t}`).all().map((r) => r.id)).filter((id) => id && !incidentIds.has(id));
  return {
    open7: { past_due_not_breached: one(`SELECT COUNT(*) FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}'`),
      response_basis: one(`SELECT COUNT(*) FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}' AND sla_basis = 'response'`),
      resolution_basis: one(`SELECT COUNT(*) FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}' AND sla_basis = 'resolution'`),
      oldest_due: one(`SELECT MIN(sla_due_at) FROM incidents WHERE is_open = 1 AND sla_breached = 0 AND sla_due_at < '${AS_OF}'`),
      closed_late_not_breached: one(`SELECT COUNT(*) FROM incidents WHERE closed_at > sla_due_at AND sla_breached = 0`),
      open_breached: one(`SELECT COUNT(*) FROM incidents WHERE is_open = 1 AND sla_breached = 1`) },
    open8: kpi,
    open11: { future_incidents: one(`SELECT COUNT(*) FROM incidents WHERE first_reported_at > '${BUILT}'`), future_first_report: one(`SELECT MAX(first_reported_at) FROM incidents`),
      forecasts_as_happenings: one(`SELECT COUNT(*) FROM events WHERE occurred_at > reported_at`),
      quarantine_says: one(`SELECT failing FROM data_quality WHERE "check" = 'not in the future'`),
      lapsed_no_close: one(`SELECT COUNT(*) FROM incidents WHERE status_std = 'Lapsed' AND closed_at IS NULL`),
      grievance_events: one(`SELECT COUNT(*) FROM events WHERE source = 'grievance'`), grievance_daily: one(`SELECT SUM(count) FROM daily_counts WHERE source = 'grievance'`),
      imd_events: one(`SELECT COUNT(*) FROM events WHERE source = 'imd'`), cpcb_events: one(`SELECT COUNT(*) FROM events WHERE source = 'cpcb'`) },
    junk: { rows: one(`SELECT COUNT(*) FROM events WHERE junk_flag = 1`), open_only_junk: one(`SELECT COUNT(*) FROM incidents i WHERE i.is_open = 1 AND NOT EXISTS (SELECT 1 FROM events e WHERE e.incident_id = i.incident_id AND COALESCE(e.junk_flag, 0) = 0)`) },
    news: { urls_twice: one(`SELECT COUNT(*) FROM (SELECT url FROM documents WHERE source_kind = 'news' AND url IS NOT NULL GROUP BY url HAVING COUNT(*) > 1)`),
      rows_in_those: one(`SELECT SUM(n) FROM (SELECT COUNT(*) AS n FROM documents WHERE source_kind = 'news' AND url IS NOT NULL GROUP BY url HAVING COUNT(*) > 1)`) },
    personal_in_documents: { phone_title: one(`SELECT COUNT(*) FROM documents WHERE has_phone(title) = 1`), email_title: one(`SELECT COUNT(*) FROM documents WHERE has_email(title) = 1`),
      phone_body: one(`SELECT COUNT(*) FROM documents WHERE has_phone(body) = 1`), email_body: one(`SELECT COUNT(*) FROM documents WHERE has_email(body) = 1`), aadhaar_shaped: one(`SELECT COUNT(*) FROM documents WHERE has_aadhaar(title) = 1 OR has_aadhaar(summary) = 1 OR has_aadhaar(body) = 1`) },
    lost_work: { ...durable, old_ids: lost.length, old_ids_whose_first_report_is_now_in_another_incident: lost.filter((id) => byHash.has(id.split("-")[2])).length },
    tamil_notes: { all: one(`SELECT COUNT(*) FROM briefing_notes`), with_tamil: one(`SELECT COUNT(*) FROM briefing_notes WHERE text_ta IS NOT NULL AND TRIM(text_ta) <> ''`) }
  };
}

// ------------------------------------------------------------ the writing --

function writeMarkdown(results, s, k) {
  const by = (v) => results.filter((r) => r.verdict === v);
  const fails = results.filter((r) => r.verdict !== "pass");
  const groups = [...new Set(results.map((r) => r.group))];
  const n = (name) => { const c = results.find((r) => r.name === name)?.count; return c == null ? "?" : c.toLocaleString("en-IN"); };
  const f = (x) => Number(x).toLocaleString("en-IN");
  const row = (r) => `| \`${r.name}\` | ${r.count.toLocaleString("en-IN")} | ${r.verdict} | ${r.finding ?? ""}${r.open ? ` (${r.open})` : ""} | ${r.what} |`;
  const after = fs.existsSync(EVIDENCE_AFTER_BUILD) ? JSON.parse(fs.readFileSync(EVIDENCE_AFTER_BUILD, "utf8")) : null;
  const shown = (x) => (after?.changed ?? []).find((c) => c.name === x)?.after_build;
  const kpiLine = ["daily", "weekly", "monthly", "quarterly"].map((p) => `${p} ${f(k.open8[p].filed)} against ${f(k.open8[p].console_filed)} filed, ${f(k.open8[p].open)} against ${f(k.open8[p].console_open)} open`).join("; ");
  const work = k.lost_work;
  const md = `# QA pass 4: data invariants

These checks read the pinned snapshot directly (build \`${s.info.build_id}\`, as-of ${s.asOf}) into an in-memory database, with no app code and none of the app's build steps. So they say what is in the stored data. Each check is a SQL query that returns one row per problem. Examples in \`invariants.json\` are ids only, so no personal data is copied out.

Rerun: \`node tests/qa/pass4/invariants.mjs\`. Guard test (no server, about a minute): \`npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants.test.ts\`. The app's side, on the real code (about 3 minutes): \`npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/invariants-app.test.ts\`.

No model was called. Nothing here needs one. Nothing under \`src/\` was changed.

## Result

${results.length} checks: **${by("pass").length} pass**, **${by(PIPE).length} are pipeline issues**, **${by(APP).length} are app issues**.

"Pipeline issue" means the data from \`district_intel\` is wrong. That code is not in this repo, so it is reported and not patched. "App issue" means this repo's code shows the problem wrongly. Each app issue was proved by running the real code on the same snapshot (\`tests/qa/pass4/invariants-app.test.ts\`).

| Group | Checks | Pass | Pipeline | App |
|---|---|---|---|---|
${groups.map((g) => { const x = results.filter((r) => r.group === g); return `| ${g} | ${x.length} | ${x.filter((r) => r.verdict === "pass").length} | ${x.filter((r) => r.verdict === PIPE).length} | ${x.filter((r) => r.verdict === APP).length} |`; }).join("\n")}

The guard test also plants a bad row for 43 of the checks (in the in-memory copy, then rolled back) and requires the check to count it. So these checks can fail.

## The three known items, with today's numbers

**OPEN-7: confirmed, the number is now ${f(k.open7.past_due_not_breached)}** (the claim was 933, on an older build). Open incidents past their due time with \`sla_breached = 0\`. Of these ${f(k.open7.response_basis)} have a "response" deadline and ${f(k.open7.resolution_basis)} have a "resolution" deadline at exactly the limit. The oldest was due on ${k.open7.oldest_due}. The same rule also leaves ${f(k.open7.closed_late_not_breached)} closed incidents closed after their due time and not marked late. The cause is one rule: \`sla_breached\` is \`sla_ratio > 1\`, and for a "response" deadline the ratio uses the time to the first action (\`district_intel/dintel/incidents.py\` lines 125 to 129). The check \`sla_flag_is_the_pipeline_rule\` passes, so there are no stray rows. For scale: ${f(k.open7.open_breached)} open incidents are marked past deadline. The app's part is INV-3 and INV-4.

**OPEN-8: confirmed, and the cause is now known.** All the kpis columns match the incidents exactly on all 128 rows except two sets. (1) \`complaints_filed\` and \`complaints_open\` count complaints by their own filing time, and they match \`events\` on every row. The console sums complaints over incidents first reported in the window. So the two differ: ${kpiLine}. Neither sum is broken. They are two definitions. (2) \`kpis.resolved\` also counts Rejected incidents (daily ${f(k.open8.daily.resolved)} against ${f(k.open8.daily.truly_resolved)} truly Resolved). The claim of "132 against 123" was an older build. The app does not read this table, and \`catalog.ts\` keeps it from Ask District IQ, so nothing on screen shows these figures.

**OPEN-11: confirmed, all three parts updated.**
- Future times: **${f(k.open11.future_incidents)} IMD incidents**, not 4, have a first report of ${k.open11.future_first_report}, after the build at ${s.builtAt}, so \`hours_open\` is -1.1. ${f(k.open11.forecasts_as_happenings)} of them also have an "occurred" date of 7 to 10 November: forecasts stored as happenings. The pipeline's own \`data_quality\` table names ${f(k.open11.quarantine_says)} and says "quarantine", but they are still in \`incidents\`. The lists hide them, because they stop at the store's time; the incident's own answer says "-1 hours" (INV-5).
- Lapsed with no close time: **${f(k.open11.lapsed_no_close)}** in the stored data (the claim was 756). The app's build steps remove some news-only incidents, which leaves ${shown("incident_lapsed_without_closed_at") ?? "?"} on screen, where the case page shows the status "Lapsed" in place of a close time. The pipeline sets a close time only for Resolved and Rejected (\`incidents.py\` line 88).
- \`daily_counts\`: **${f(k.open11.grievance_events - k.open11.grievance_daily)} fewer grievance rows** than events (${f(k.open11.grievance_daily)} against ${f(k.open11.grievance_events)}), as claimed: these are the rows flagged junk (\`analytics.py\` line 29). New: IMD (${f(k.open11.imd_events)}) and CPCB (${f(k.open11.cpcb_events)}) are left out of \`daily_counts\` as well. Once those three are set aside, every day, zone, category and source agrees.

## What the app shows wrongly

These six were each proved on the real code. The rest of the failures are the pipeline's, and they are reported, not patched.

- **INV-3 (P0).** "Closed on time" and "Within deadline" read a flag that means something else for police incidents. Over 90 days Ask District IQ says 48% were within the deadline; 22% were closed by their due time. The police officer's tile says 77%; 8% were.
- **INV-4 (P1, OPEN-7).** 914 open incidents say "missed" on the case page, and the Past deadline tile and list do not count them.
- **INV-1 (P2).** A news result in the search box can open an incident the app's own build took out.
- **INV-2 (P2).** The search box shows a private person's home address and mobile number as a news headline. Jarvis's path hides the same text.
- **INV-6 (P2).** The profile form accepts a ward from another zone, because zone 14's range wraps around zone 13.
- **INV-5 (P3, OPEN-11).** A forecast stored as an incident is described as open for "-1 hours".

## What is good

Every incident, report, document, action and complaint has a known department and category. (The complaints table has no category column: its category comes through its report, and that is checked too.) No ward is in the wrong zone in any record. No zone is outside 1 to 15. No severity is outside the four allowed. No position is outside Chennai, except two real reservoirs outside the city, which are expected. No orphan members, actions, timeline or history rows. No empty titles. No control characters anywhere that is shown. No invalid date strings and none before 2000. No date earlier than its source could know, apart from the forecasts in OPEN-11: no article fetched before it was published, no news report dated before its article, no complaint's report before its filing, no police report before its incident. No personal data in incident titles, summaries, complaint titles, complaint text, report text or briefings. No Aadhaar-shaped number in any shown field. Incident counts, member counts, ward and hotspot totals and the briefing figures all add up.

## What fails

| Check | Count | Verdict | Finding | What it means |
|---|---|---|---|---|
${fails.map(row).join("\n")}

The findings, with what to do about each, are in \`docs/qa/pass4/findings/invariants.json\`.

## Personal data, in plain words

${f(k.personal_in_documents.phone_title)} news headlines hold a phone number and ${f(k.personal_in_documents.email_title)} hold an email. They are Dinamalar's home Golu listings: a private person's name, home address and mobile number used as the headline. They do not appear on the News page, but the search box finds them and shows them as stored (INV-2). Jarvis's path hides the same text.

Article bodies: ${f(k.personal_in_documents.phone_body)} hold a phone number and ${f(k.personal_in_documents.email_body)} an email. All the numbers were read with their digits masked. They are helplines, WhatsApp complaint numbers, restaurant bookings, book publishers and reporters' emails, with a few private organisers. This is the publisher's own text, so it is reported (INV-22) and not called an app fault. No citizen's number or email is in any complaint or report text. An earlier version of this check counted two "Aadhaar" hits: both were +91 helplines, and the pattern now leaves those out. The count is ${f(k.personal_in_documents.aadhaar_shaped)}.

## The Collector's and officers' own work

The durable tables hold work done on earlier builds, and it names incidents this build no longer has: ${work.collector_decisions.gone} of ${work.collector_decisions.rows} Collector decisions, ${work.dept_assignments.gone} of ${work.dept_assignments.rows} department assignments, ${work.officer_reports.gone} of ${work.officer_reports.rows} officer reports, ${work.officer_steps.gone} of ${work.officer_steps.rows} officer steps, ${work.followups.gone} of ${work.followups.rows} follow-ups and ${work.outbound_emails.gone} of ${work.outbound_emails.rows} emails. The pipeline names an incident from its first report. So ${work.old_ids_whose_first_report_is_now_in_another_incident} of these ${work.old_ids} old ids can be traced to a report that is still here, now inside an incident with another id. In the code read, these rows are looked up by incident id, so they simply do not appear: the work no longer shows on the case it was done for (INV-12). This was read in the code, not clicked through. All 6 emails are in sandbox mode, which points to testing; for the other rows the data cannot say. The rule matters more than the count.

## After the app's build steps

The stored data is what the pipeline made. The app then changes it (takes out some news, merges some). \`invariants-app.test.ts\` reruns every check on what the real store holds after that, and writes \`invariants-after-build.json\`. ${after ? `${after.changed.length} checks change. Most are expected or not shown: the app never reads \`kpis\`, the planner is told not to count from the ward statistics, and it reads only the briefing's summary sentences. One is a real fault: the build step \`newsMedia\` (\`derive.ts\` line 311) deletes incidents but leaves ${shown("orphan_document_without_incident")} articles, ${shown("orphan_event_without_incident")} reports, ${shown("orphan_action_without_incident")} actions and ${shown("orphan_timeline_without_incident")} timeline rows pointing at them, so a news result in the search box can open nothing (INV-1).` : "Not run yet."}

## Limits

- The main checks read the pipeline's stored tables. The rerun after the build steps replaces only the main tables (incidents, events, members, documents, actions, timeline, gaps, alerts).
- Bounds for Chennai are a box around the ward shapes with a margin. A pin in the wrong part of the city but inside the box only shows up in the ward-shape check.
- A mobile number is matched by pattern, so a 10-digit figure in news text can be counted, and an unusual layout can be missed. 044 landlines are not counted, because those seen are offices and helplines (one report quotes a public suicide helpline).
- Whether a number in an article is private or public was judged by reading a masked sample, not proved.
- INV-1 and INV-2 were proved at the function the page calls (\`search\`, \`incident\`), not by clicking in a browser. INV-4's "missed" is the rule in \`Detail.tsx\` line 130, compared with the data the page receives; the page itself was not rendered.
- The deadline rule (INV-3, INV-4) is an owner's call on what "on time" means for a "response" deadline. The tests hold the plain meaning of the words on the screen.
- A check that passes on this build says nothing about the next one. The guard test is frozen to this build, and goes red if the snapshot is pinned again: then rerun with \`--freeze\` on purpose, after reading what changed.
`;
  fs.writeFileSync(EVIDENCE_MD, md);
}


async function main() {
  const t0 = Date.now();
  const s = openPinned();
  const loaded = Date.now() - t0;
  const results = buildChecks(s).map((c) => runCheck(s.db, c));
  const counts = { checks: results.length, pass: 0, [PIPE]: 0, [APP]: 0 };
  for (const r of results) counts[r.verdict]++;
  const known = knownItems(s);
  fs.mkdirSync(path.dirname(EVIDENCE_JSON), { recursive: true });
  fs.writeFileSync(EVIDENCE_JSON, JSON.stringify({
    build_id: s.info.build_id, built_at: s.builtAt, as_of: s.asOf, snapshot_files: ["tables/*.json.gz", "reference.json.gz", s.rowsFile],
    note: "Loaded with no app code and none of the app's build steps. Examples are ids only.", counts, known_items: known,
    checks: results.map(({ group, name, what, sql, count, examples, verdict, finding, open, note }) => ({ group, name, what, sql, count, examples, verdict, ...(finding ? { finding } : {}), ...(open ? { open } : {}), ...(note ? { note } : {}) }))
  }, null, 1));
  writeMarkdown(results, s, known);
  if (process.argv.includes("--freeze")) fs.writeFileSync(GUARD_FILE, JSON.stringify({ build_id: s.info.build_id,
    passing: results.filter((r) => r.verdict === "pass").map((r) => r.name),
    failing: results.filter((r) => r.verdict !== "pass").map((r) => ({ name: r.name, finding: r.finding ?? null, open: r.open ?? null })) }, null, 1));
  const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.name} ${r.ms} ms`);
  console.log(JSON.stringify({ ...counts, load_ms: loaded, total_ms: Date.now() - t0, slowest: slow, failing: results.filter((r) => r.verdict !== "pass").map((r) => `${r.name}=${r.count}`) }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
