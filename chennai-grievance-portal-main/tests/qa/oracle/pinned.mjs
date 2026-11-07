// QA pass 4: the independent oracle over the pinned snapshot. No app code is imported: every figure is worked out here from the raw
// tables in data/aws-cache/qa/pinned/tables and the durable rows in data/aws-cache/qa/pinned/rows.seeded.json.gz.
//
// Three layers, so a difference can always be named row by row:
//   raw        the incidents table as the pipeline built it
//   overlaid   raw, plus the Collector's decisions and the department routings (durable rows)
//   effective  overlaid, minus or changed by what the app's build hooks did (lib/collector/derive.ts). The hooks are app rules, so they are
//              not re-implemented here: the list of rows they touched is read from docs/qa/pass4/evidence/same-number-hooks.json, written by
//              tests/qa/pass4/same-number-hooks.test.ts. With no such file, effective is the same as overlaid.
//
// Definitions follow the glossary (src/lib/reference/metrics.ts) and the SQL of intel.ts and insights.ts, but each is written out below by hand.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { APP_ROOT, fmtWall, loadTable, wallMs } from "./load.mjs";

export const PIN_DIR = path.join(APP_ROOT, "data", "aws-cache", "qa", "pinned");
export const PIN_TABLES = path.join(PIN_DIR, "tables");
export const HOOKS_FILE = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "same-number-hooks.json");
export const HOURS = { daily: 24, weekly: 168, monthly: 720, quarterly: 2160 };
export const FROZEN_WALL = "2026-11-06 12:00:00"; // the frozen clock, IST
export const SEVERITIES = ["Severe", "High", "Medium", "Low"];

const isTrue = (v) => v === true || v === 1 || v === "1";
const num = (v) => Number(v ?? 0) || 0;
const pinTable = (name) => loadTable(name, PIN_TABLES).objects();

/**
 * The durable rows the app lays on top: decisions, routings, officer steps. From the pinned rows, or, given a file, from one running server's own
 * local copy (read-only), for a run that made decisions on that server.
 */
export function durableRows(file = null) {
  if (file) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const all = (t) => { try { return db.prepare(`SELECT * FROM "${t}"`).all(); } catch { return []; } };
      return { decisions: all("collector_decisions"), assignments: all("dept_assignments"), steps: all("officer_steps") };
    } finally { db.close(); }
  }
  const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "rows.seeded.json.gz"))).toString("utf8"));
  const r = doc.rows ?? {};
  return { decisions: r.collector_decisions ?? [], assignments: r.dept_assignments ?? [], steps: r.officer_steps ?? [] };
}

/** The store's as-of time, and "now" as the console works it out: the later of the as-of and the clock (intel.ts asOf). */
export function snapshotAsOf() {
  const m = pinTable("metrics").find((r) => r.metric === "as_of");
  let v = m?.value;
  try { v = JSON.parse(v); } catch { /* plain */ }
  return String(v).slice(0, 19).replace("T", " ");
}
export const consoleNow = (clock = FROZEN_WALL) => { const a = snapshotAsOf(); return a > clock ? a : clock; };

// RC-26 (lane d): the latest decision WITH an effect decides; "Verify and close" closes, a note and an escalate have none (the same table as effective.ts)
const EFFECT = { resolve: { open: false, status: "Resolved" }, verify: { open: false, status: "Resolved" }, reject: { open: false, status: "Rejected" }, reopen: { open: true, status: "Open" } };

function shape(r) {
  return {
    id: String(r.incident_id), t: wallMs(r.first_reported_at), tText: r.first_reported_at, zone: r.zone_no == null ? null : Number(r.zone_no), zoneName: r.zone_name ?? null, ward: r.ward_no == null ? null : Number(r.ward_no),
    taluk: r.taluk_code ?? null, dept: r.lead_dept ?? null, cat: r.category_code ?? null, catLabel: r.category_label ?? null, rawOpen: isTrue(r.is_open), status: r.status_std ?? null, sev: r.severity_level ?? null,
    breached: isTrue(r.sla_breached), due: wallMs(r.sla_due_at), dueText: r.sla_due_at ?? null, closed: wallMs(r.closed_at), updated: wallMs(r.last_update_at), sources: num(r.source_count), mediaOnly: isTrue(r.media_only),
    complaints: num(r.citizen_complaints), members: num(r.member_count), dead: num(r.dead), injured: num(r.injured), awaiting: isTrue(r.awaiting_collector), verified: isTrue(r.verified),
    lat: r.lat, lon: r.lon, prec: r.loc_precision_m, place: r.place_text ?? null, group: String(r.incident_id)
  };
}

const FIELD_OF_COLUMN = { zone_no: "zone", zone_name: "zoneName", ward_no: "ward", taluk_code: "taluk", lead_dept: "dept", category_code: "cat", severity_level: "sev", status_std: "status", citizen_complaints: "complaints",
  place_text: "place", source_count: "sources", member_count: "members", dead: "dead", injured: "injured" };

/** Layers the Collector's latest decision (not a note) and the routing on a row: the same rule as the app's EFF, written out here. */
function overlay(row, latest, routed) {
  const d = latest.get(row.id);
  const e = d ? EFFECT[d] : null;
  return { ...row, decision: d ?? null, open: e ? e.open : row.rawOpen, effStatus: e ? e.status : row.status, routed: routed.has(row.id) };
}

export function loadOracle({ clock = FROZEN_WALL, hooksFile = HOOKS_FILE, durableFile = null } = {}) {
  const now = consoleNow(clock), nowMs = wallMs(now);
  const durable = durableRows(durableFile);
  const latest = new Map();
  for (const d of [...durable.decisions].sort((a, b) => Number(a.decision_id) - Number(b.decision_id))) if (EFFECT[d.decision]) latest.set(String(d.incident_id), d.decision);
  const routed = new Set(durable.assignments.map((a) => String(a.incident_id)));
  const rawRows = pinTable("incidents").map(shape);
  const overlaid = rawRows.map((r) => overlay(r, latest, routed));
  const hooks = fs.existsSync(hooksFile) ? JSON.parse(fs.readFileSync(hooksFile, "utf8")) : { removed: [], changed: [], clusters: {} };
  const removedBy = new Map(hooks.removed.map((x) => [String(x.id), x.hook]));
  const changes = new Map();
  for (const c of hooks.changed) { const k = String(c.id); if (!changes.has(k)) changes.set(k, []); changes.get(k).push(c); }
  const clusters = new Map(Object.entries(hooks.clusters ?? {}));
  const effective = overlaid.filter((r) => !removedBy.has(r.id)).map((r0) => {
    const r = { ...r0, group: clusters.get(r0.id) ?? r0.id };
    for (const c of changes.get(r0.id) ?? []) for (const [col, v] of Object.entries(c)) {
      if (col === "id" || col === "hook" || !Array.isArray(v)) continue;
      const after = v[1];
      if (col === "first_reported_at") { r.t = wallMs(after); r.tText = after; }
      else if (col === "last_update_at") r.updated = wallMs(after);
      else if (col === "lat" || col === "lon" || col === "loc_precision_m") r[col === "loc_precision_m" ? "prec" : col] = after;
      else if (FIELD_OF_COLUMN[col]) r[FIELD_OF_COLUMN[col]] = col === "zone_no" || col === "ward_no" ? (after == null ? null : Number(after)) : col === "dead" || col === "injured" ? num(after) : after;
    }
    return r;
  });
  return new Oracle({ now, nowMs, raw: overlaid.map((r) => ({ ...r, open: r.rawOpen, effStatus: r.status, routed: false, decision: null })), overlaid, effective, removedBy, changes, durable, latest, routed, hooks });
}

// ------------------------------------------------------------------ the figures, one definition each --

/** name -> { what: in words; test: is the row counted; sum: the column added up (else rows are counted) } */
export const DEFS = {
  reported: { what: "every incident in the scope", test: () => true },
  open: { what: "open, with the Collector's decisions on top (news complaints routed to a department still count)", test: (r) => r.open },
  ongoing: { what: "open and not routed to a department (the Ongoing tile, the glossary's 'Still open')", test: (r) => r.open && !r.routed },
  resolved: { what: "closed as Resolved, with decisions on top", test: (r) => !r.open && r.effStatus === "Resolved" },
  severe: { what: "rated Severe, open or closed", test: (r) => r.sev === "Severe" },
  severe_open: { what: "rated Severe and open", test: (r) => r.sev === "Severe" && r.open },
  high: { what: "rated High, open or closed", test: (r) => r.sev === "High" },
  high_open: { what: "rated High and open", test: (r) => r.sev === "High" && r.open },
  serious_open: { what: "Severe or High and open", test: (r) => r.open && (r.sev === "Severe" || r.sev === "High") },
  serious_all: { what: "Severe or High, open or closed", test: (r) => r.sev === "Severe" || r.sev === "High" },
  urgent: { what: "Severe or High, open and not routed", test: (r) => r.open && !r.routed && (r.sev === "Severe" || r.sev === "High") },
  // RC-34 (lane d): past deadline is ONE rule: the store's flag, or the due time gone by the console's now (the case page already said so)
  overdue_store_flag: { what: "open with the store's own past-deadline flag, alone (the pipeline's flag, OPEN-7: it misses open incidents whose due time has gone)", test: (r) => r.open && r.breached },
  overdue_flag: { what: "open and past its deadline: the store's flag or the due time gone (routed ones count)", test: (r, o) => r.open && (r.breached || (r.due != null && r.due <= o.nowMs)) },
  overdue: { what: "open and past its deadline (the flag or the due time gone), not routed (the glossary's 'Past deadline, still open')", test: (r, o) => r.open && (r.breached || (r.due != null && r.due <= o.nowMs)) && !r.routed },
  overdue_due: { what: "open and its due time has passed by the console's now, whatever the store's flag says", test: (r, o) => r.open && r.due != null && r.due <= o.nowMs },
  news_only: { what: "seen only in the news, open or closed", test: (r) => r.mediaOnly },
  news_only_open: { what: "seen only in the news and open", test: (r) => r.mediaOnly && r.open },
  multi: { what: "from more than one source", test: (r) => r.sources > 1 },
  complaints_all: { what: "citizen complaints added up, open or closed", sum: "complaints" },
  complaints_open: { what: "citizen complaints added up, open incidents only", sum: "complaints", test: (r) => r.open },
  complaints_ongoing: { what: "citizen complaints added up, open and not routed", sum: "complaints", test: (r) => r.open && !r.routed },
  complaint_inc: { what: "open incidents with at least one citizen complaint", test: (r) => r.open && r.complaints > 0 },
  deaths: { what: "people who died, added up", sum: "dead" },
  injured: { what: "people injured, added up", sum: "injured" },
  awaiting_flag: { what: "open and flagged awaiting the Collector", test: (r) => r.open && r.awaiting },
  awaiting_sum: { what: "open incidents flagged awaiting the Collector (any severity)", test: (r) => r.awaiting },
  verified_open: { what: "open and verified", test: (r) => r.open && r.verified },
  pinnable: { what: "located closely enough to pin on a map", test: (r) => r.lat != null && num(r.prec) <= 2000 },
  unlocated: { what: "no point, or too coarse to pin", test: (r) => !(r.lat != null && num(r.prec) <= 2000) },
  has_point: { what: "has a map point", test: (r) => r.lat != null && r.lon != null },
};

export class Oracle {
  constructor(a) { Object.assign(this, a); this.layers = { raw: a.raw, overlaid: a.overlaid, effective: a.effective }; }

  /** The rows of a scope: { period | hours, offset, zone ("none" = no zone), dept, cat, taluk }. first_reported_at in (now - h, now]. */
  rows(scope, layer = "effective") {
    const h = (scope.hours ?? HOURS[scope.period]) * 3600_000, k = scope.offset ?? 0;
    const lo = this.nowMs - h * (k + 1), hi = this.nowMs - h * k;
    return this.layers[layer].filter((r) => r.t != null && r.t > lo && r.t <= hi
      && (scope.zone == null || (scope.zone === "none" ? r.zone == null : r.zone === Number(scope.zone)))
      && (scope.dept == null || r.dept === scope.dept) && (scope.cat == null || r.cat === scope.cat) && (scope.taluk == null || r.taluk === scope.taluk));
  }
  /** One definition over a list of rows: { value, ids }. A sum's ids are the rows it adds up. */
  apply(defName, rows) {
    const d = DEFS[defName];
    if (!d) throw new Error(`no such definition: ${defName}`);
    const kept = rows.filter((r) => !d.test || d.test(r, this));
    return { value: d.sum ? kept.reduce((a, r) => a + num(r[d.sum]), 0) : kept.length, ids: kept.map((r) => r.id) };
  }
  // RC-29 (lane d): "resolved" in a window is closed in the window (by its closing time), on every surface, as Ask District IQ counts it
  value(defName, scope, layer = "effective") { return defName === "resolved" && layer === "effective" ? this.resolvedByClose(scope).length : this.apply(defName, this.rows(scope, layer)).value; }
  ids(defName, scope, layer = "effective") { return defName === "resolved" && layer === "effective" ? this.resolvedByClose(scope).map((r) => r.id) : this.apply(defName, this.rows(scope, layer)).ids; }

  /** Groups of the same problem in the same area (the app's cluster_id), counted once. */
  groups(defName, scope) { return new Set(this.apply(defName, this.rows(scope)).ids.map((id) => this.groupOf(id))).size; }
  groupOf(id) { return (this._byId ??= new Map(this.effective.map((r) => [r.id, r]))).get(id)?.group ?? id; }
  row(id) { return (this._byId ??= new Map(this.effective.map((r) => [r.id, r]))).get(id) ?? null; }
  rawRow(id) { return (this._rawById ??= new Map(this.raw.map((r) => [r.id, r]))).get(id) ?? null; }

  /** The severity panel: open, not routed, one per group under its most severe level. */
  severityGroups(scope) {
    const by = new Map();
    for (const r of this.rows(scope)) {
      if (!(r.open && !r.routed)) continue;
      const cur = by.get(r.group);
      if (!cur || SEVERITIES.indexOf(r.sev) < SEVERITIES.indexOf(cur.sev)) by.set(r.group, r);
    }
    const out = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    for (const r of by.values()) out[r.sev] = (out[r.sev] ?? 0) + 1;
    return out;
  }

  /** The department officer's stage of a row (the same rule as officer/data.ts STAGE_SQL, written out). */
  stageOf(r, dept) {
    const steps = this.durable.steps.filter((s) => String(s.incident_id) === r.id && s.dept_code === dept)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)) || Number(a.step_id) - Number(b.step_id));
    const os = steps[steps.length - 1] ?? null;
    const decs = this.durable.decisions.filter((d) => String(d.incident_id) === r.id && ["verify", "reopen", "resolve", "reject"].includes(d.decision))
      .sort((a, b) => String(a.decided_at).localeCompare(String(b.decided_at)) || Number(a.decision_id) - Number(b.decision_id));
    const cd = decs[decs.length - 1] ?? null;
    if (cd && (!os || String(cd.decided_at) >= String(os.at))) return cd.decision === "reopen" ? "action" : cd.decision === "reject" ? "closed" : "verified";
    if (os?.step === "close") return "verified";
    if (os?.step === "send") return "sent";
    if (os?.step === "action") return "action";
    if (os?.step === "approve") return "approved";
    if (r.status === "Open" || r.status === "Under review") return "new";
    if (r.status === "Assigned") return "approved";
    if (r.status === "In progress") return "action";
    if (r.status === "Awaiting verification") return "sent";
    if (r.status === "Resolved") return "verified";
    return "closed";
  }
  officerRows(dept, scope) { return this.rows({ ...scope, dept }).map((r) => ({ ...r, stage: this.stageOf(r, dept) })).filter((r) => r.stage !== "closed"); }

  /** My Tasks (intel.ts awaitingCheck): closed work updated in the period on severe incidents, plus officers' reports; left to departments = the rest. One per group. */
  awaitingCheck(scope) {
    const h = HOURS[scope.period] * 3600_000, lo = this.nowMs - h, hi = this.nowMs;
    const inScope = (r) => (scope.zone == null || r.zone === Number(scope.zone)) && (scope.dept == null || r.dept === scope.dept) && (scope.cat == null || r.cat === scope.cat) && (scope.taluk == null || r.taluk === scope.taluk);
    const CLOSING = ["verify", "reject", "resolve", "reopen"];
    const decidedIds = new Set(this.durable.decisions.filter((d) => CLOSING.includes(d.decision)).map((d) => String(d.incident_id)));
    const sentIds = new Set();
    const byInc = new Map();
    for (const s of this.durable.steps) { const k = String(s.incident_id); if (!byInc.has(k)) byInc.set(k, []); byInc.get(k).push(s); }
    for (const [id, l] of byInc) {
      const last = l.sort((a, b) => String(a.at).localeCompare(String(b.at)) || Number(a.step_id) - Number(b.step_id)).at(-1);
      if (last.step !== "send") continue;
      if (this.durable.decisions.some((d) => String(d.incident_id) === id && ["verify", "reject", "resolve", "reopen"].includes(d.decision) && String(d.decided_at) >= String(last.at))) continue;
      sentIds.add(id);
    }
    const n = new Set(), left = new Set(), nIds = [], leftIds = [];
    for (const r of this.effective) {
      if (!inScope(r)) continue;
      const core = r.updated != null && r.updated > lo && r.updated <= hi && r.rawOpen && r.awaiting && r.complaints > 0 && !decidedIds.has(r.id);
      const sent = r.rawOpen && r.sev === "Severe" && sentIds.has(r.id);
      if ((core && r.sev === "Severe") || sent) { n.add(r.group); nIds.push(r.id); }
      else if (core) { left.add(r.group); leftIds.push(r.id); }
    }
    return { n: n.size, left: left.size, nIds, leftIds };
  }

  // ---- figures with no period, or a window of their own ---------------------------------------------------------------

  /** Open rows at any date in an area. upToNow keeps only rows dated up to the console's now (a few store rows are dated later: OPEN-11). */
  openAnyDate({ zone = null, dept = null, upToNow = false } = {}) {
    return this.effective.filter((r) => r.open && (zone == null || r.zone === Number(zone)) && (dept == null || r.dept === dept) && (!upToNow || (r.t != null && r.t <= this.nowMs)));
  }
  /** The backlog card and tool: every open row at any date, grouped by department, departments with 5 or more only. */
  backlog(zone = null) {
    const by = new Map();
    for (const r of this.openAnyDate({ zone })) { if (r.dept == null) continue; const c = by.get(r.dept) ?? { n: 0, overdue: 0, ids: [] }; c.n++; if (r.breached || (r.due != null && r.due <= this.nowMs)) c.overdue++; c.ids.push(r.id); by.set(r.dept, c); }
    for (const [k, v] of by) if (v.n < 5) by.delete(k);
    return by;
  }
  /** Closed as resolved with its closing time in the window, whenever it was reported (the Briefing's good news, resolution_times). */
  resolvedByClose(scope) {
    const h = (scope.hours ?? HOURS[scope.period]) * 3600_000, k = scope.offset ?? 0, lo = this.nowMs - h * (k + 1), hi = this.nowMs - h * k;
    return this.effective.filter((r) => !r.open && r.effStatus === "Resolved" && r.closed != null && r.closed > lo && r.closed <= hi && r.t != null && r.closed >= r.t
      && (scope.zone == null || r.zone === Number(scope.zone)) && (scope.dept == null || r.dept === scope.dept));
  }
  /** resolution_times: the same, by department, departments with 3 or more only. */
  resolutionByDept(scope) {
    const by = new Map();
    for (const r of this.resolvedByClose(scope)) { if (r.dept == null) continue; const c = by.get(r.dept) ?? { n: 0, ids: [] }; c.n++; c.ids.push(r.id); by.set(r.dept, c); }
    for (const [k, v] of by) if (v.n < 3) by.delete(k);
    return by;
  }
  /** Rows in one whole calendar stretch (a week or a month), no rolling window: what a chart of "complete weeks" means. */
  inStretch(fromWall, toWall, scope = {}) {
    const lo = wallMs(fromWall), hi = wallMs(toWall);
    return this.effective.filter((r) => r.t != null && r.t >= lo && r.t < hi && (scope.zone == null || r.zone === Number(scope.zone)) && (scope.dept == null || r.dept === scope.dept) && (scope.cat == null || r.cat === scope.cat));
  }
  /** The district snapshot's "critical": severe and open at any date, not yet verified or still awaiting the Collector, no closing decision. No period. */
  critical() {
    const decided = new Set(this.durable.decisions.filter((d) => ["verify", "reject", "resolve"].includes(d.decision)).map((d) => String(d.incident_id)));
    return this.effective.filter((r) => r.open && r.sev === "Severe" && (!r.verified || r.awaiting) && !decided.has(r.id));
  }

  /** Why a row is in one layer and not the next: which hook took it out, what it changed, or which durable row moved it. */
  explainRow(id) {
    const raw = this.rawRow(id), eff = this.row(id);
    const out = { id };
    if (raw) Object.assign(out, { reported: raw.tText, dept: raw.dept, zone_raw: raw.zone, status_raw: raw.status, is_open_raw: raw.rawOpen, sev: raw.sev, media_only: raw.mediaOnly });
    if (this.removedBy.has(id)) out.hook_removed = this.removedBy.get(id);
    if (this.latest.has(id)) out.decision = this.latest.get(id);
    if (this.routed.has(id)) out.routed = true;
    const ch = this.changes.get(id);
    if (ch) out.hook_changed = ch.map((c) => ({ hook: c.hook, fields: Object.keys(c).filter((k) => k !== "id" && k !== "hook") }));
    if (eff && raw && eff.zone !== raw.zone) out.zone_effective = eff.zone;
    return out;
  }
}

export { fmtWall, wallMs };
