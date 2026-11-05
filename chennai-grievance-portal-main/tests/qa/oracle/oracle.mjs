// Independent QA oracle: recomputes the Collector console's headline figures straight from the cached store
// snapshot, with no app code. Definitions mirror src/lib/collector/intel.ts and insights.ts, but every count is
// computed here from raw rows.
//
//   node tests/qa/oracle/oracle.mjs [--now "YYYY-MM-DD HH:MM:SS" | --now wall] [--out path]
//
// "now" defaults to the snapshot's metrics.as_of (reproducible). The live console uses max(as_of, IST wall clock)
// (intel.ts:76-84), so pass --now wall, or the console's own as-of, when comparing against a running app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ROOT, listTables, loadTable, wallMs, fmtWall } from "./load.mjs";

export const PERIODS = { daily: 24, weekly: 168, monthly: 720, quarterly: 2160 }; // intel.ts:35-40 (hours)
export const OPEN_STATUSES = ["Open", "Under review", "Assigned", "In progress", "Awaiting verification"]; // intel.ts:65

export function snapshotAsOf() {
  const m = loadTable("metrics").objects().find((r) => r.metric === "as_of");
  if (!m) return null;
  let v = m.value;
  try { v = JSON.parse(v); } catch {}
  return String(v).slice(0, 19).replace("T", " ");
}
export function resolveNow(arg) {
  const asOf = snapshotAsOf();
  if (!arg) return asOf;
  if (arg === "wall") {
    const clock = fmtWall(Date.now() + 330 * 60_000);
    return asOf && asOf > clock ? asOf : clock; // intel.ts:80-81
  }
  return String(arg).slice(0, 19).replace("T", " ");
}

const num = (v) => Number(v ?? 0) || 0;
const isTrue = (v) => v === true || v === 1 || v === "1";

/** One incident row reduced to what the figures need. */
function prep(r) {
  return {
    id: r.incident_id, t: wallMs(r.first_reported_at), zone: r.zone_no == null ? null : Number(r.zone_no),
    dept: r.lead_dept ?? null, open: isTrue(r.is_open), sev: r.severity_level, breached: isTrue(r.sla_breached),
    sources: num(r.source_count), mediaOnly: isTrue(r.media_only), complaints: num(r.citizen_complaints)
  };
}

export function figures(list) {
  const f = { reported: 0, open: 0, severe: 0, severe_open: 0, overdue: 0, multi_source: 0, news_only: 0, news_only_open: 0,
    complaints: 0, complaints_open: 0 };
  for (const i of list) {
    f.reported++;
    if (i.open) f.open++;
    if (i.sev === "Severe") { f.severe++; if (i.open) f.severe_open++; }
    if (i.open && i.breached) f.overdue++;
    if (i.sources > 1) f.multi_source++;
    if (i.mediaOnly) { f.news_only++; if (i.open) f.news_only_open++; }
    f.complaints += i.complaints;
    if (i.open) f.complaints_open += i.complaints;
  }
  return f;
}
const sumFig = (rows) => rows.reduce((a, f) => { for (const k in f) a[k] = (a[k] ?? 0) + f[k]; return a; }, {});
const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => ({ figure: k, total: a[k], parts: b[k] }));

/** Incidents in a period window: first_reported_at in (now - h, now] (intel.ts:107-110, 119-121). */
export function inWindow(list, period, nowMs, offset = 0) {
  const h = PERIODS[period] * 3600_000;
  const lo = nowMs - h * (offset + 1), hi = nowMs - h * offset;
  return list.filter((i) => i.t != null && i.t > lo && i.t <= hi);
}

export function compute(now) {
  const nowMs = wallMs(now);
  const inc = loadTable("incidents").objects().map(prep);
  const zoneNos = [...new Set(loadTable("ref_wards").objects().map((w) => Number(w.zone_no)))].sort((a, b) => a - b); // intel.ts:787
  const zoneName = Object.fromEntries(loadTable("ref_zones").objects().map((z) => [Number(z.zone_no), z.zone_name]));
  const deptRef = new Set(loadTable("ref_departments").objects().map((d) => d.code));
  const deptCodes = [...new Set(inc.map((i) => i.dept))].sort((a, b) => String(a).localeCompare(String(b)));

  const periods = {}, sums = {};
  for (const p of Object.keys(PERIODS)) {
    const w = inWindow(inc, p, nowMs);
    const district = figures(w);
    const zones = {};
    for (const z of zoneNos) zones[z] = { name: zoneName[z] ?? null, ...figures(w.filter((i) => i.zone === z)) };
    const noZone = figures(w.filter((i) => i.zone == null));
    const strayZone = w.filter((i) => i.zone != null && !zoneNos.includes(i.zone));
    const depts = {};
    for (const d of deptCodes) depts[d ?? "(none)"] = { known: d != null && deptRef.has(d), ...figures(w.filter((i) => i.dept === d)) };
    const zoneSum = sumFig([...Object.values(zones).map(({ name, ...f }) => f), noZone]);
    const deptSum = sumFig(Object.values(depts).map(({ known, ...f }) => f));
    periods[p] = { window: { from_exclusive: fmtWall(nowMs - PERIODS[p] * 3600_000), to_inclusive: now }, district,
      previous: figures(inWindow(inc, p, nowMs, 1)), zones, no_zone: noZone, depts };
    sums[p] = {
      zones_plus_no_zone_vs_district: diff(district, zoneSum),
      zone_not_in_ref_wards: strayZone.length,
      depts_vs_district: diff(district, deptSum),
      lead_dept_null: w.filter((i) => i.dept == null).length,
      lead_dept_not_in_ref_departments: deptCodes.filter((d) => d != null && !deptRef.has(d))
        .map((d) => ({ code: d, n: w.filter((i) => i.dept === d).length })).filter((x) => x.n)
    };
  }
  return { now, nowMs, inc, periods, sums };
}

// --------------------------------------------------------------- integrity --

const capped = (out) => { for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = { n: out[k].length, examples: out[k].slice(0, 5) }; return out; };

function membersCheck() {
  const incRows = loadTable("incidents").objects();
  const mem = loadTable("incident_members").objects();
  const ev = loadTable("events").objects();
  const byInc = new Map(), evSeen = new Map();
  for (const m of mem) {
    if (!byInc.has(m.incident_id)) byInc.set(m.incident_id, []);
    byInc.get(m.incident_id).push(m);
    evSeen.set(m.event_id, (evSeen.get(m.event_id) ?? 0) + 1);
  }
  const incIds = new Map();
  for (const r of incRows) incIds.set(r.incident_id, (incIds.get(r.incident_id) ?? 0) + 1);
  const evIds = new Map();
  for (const e of ev) evIds.set(e.event_id, (evIds.get(e.event_id) ?? 0) + 1);
  const out = {
    incidents: incRows.length, members: mem.length, events: ev.length,
    duplicate_incident_ids: [...incIds].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n })),
    duplicate_event_ids: [...evIds].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n })),
    events_in_more_than_one_incident: [...evSeen].filter(([, n]) => n > 1).map(([id, n]) => ({ event_id: id, n })),
    member_rows_without_incident: mem.filter((m) => !incIds.has(m.incident_id)).map((m) => m.incident_id),
    incidents_without_members: incRows.filter((r) => !byInc.has(r.incident_id)).map((r) => r.incident_id),
    member_events_not_in_events: mem.filter((m) => !evIds.has(m.event_id)).map((m) => m.event_id),
    events_not_in_any_incident: ev.filter((e) => !evSeen.has(e.event_id)).map((e) => e.event_id),
    member_count_mismatch: [], source_count_mismatch: [], complaints_vs_grievance_members: [],
    first_reported_not_min_member: [], media_only_with_non_news_source: []
  };
  for (const r of incRows) {
    const ms = byInc.get(r.incident_id) ?? [];
    if (num(r.member_count) !== ms.length) out.member_count_mismatch.push({ id: r.incident_id, member_count: r.member_count, members: ms.length });
    const srcs = new Set(ms.map((m) => m.source));
    if (num(r.source_count) !== srcs.size) out.source_count_mismatch.push({ id: r.incident_id, source_count: r.source_count, distinct: [...srcs] });
    const g = ms.filter((m) => m.source === "grievance").length;
    if (num(r.citizen_complaints) !== g) out.complaints_vs_grievance_members.push({ id: r.incident_id, citizen_complaints: r.citizen_complaints, grievance_members: g });
    const mts = ms.map((m) => wallMs(m.reported_at)).filter((x) => x != null);
    const fr = wallMs(r.first_reported_at);
    if (mts.length && fr !== Math.min(...mts)) out.first_reported_not_min_member.push({ id: r.incident_id, first_reported_at: r.first_reported_at, min_member: fmtWall(Math.min(...mts)) });
    if (isTrue(r.media_only) && [...srcs].some((s) => s !== "news")) out.media_only_with_non_news_source.push({ id: r.incident_id, sources: [...srcs] });
  }
  return capped(out);
}

function datesCheck(nowMs) {
  const r = loadTable("incidents").objects();
  const before = (a, b) => { const x = wallMs(a), y = wallMs(b); return x != null && y != null && x < y; };
  const pick = (rows, idCol, pred, cols) => {
    const l = rows.filter(pred);
    return { n: l.length, examples: l.slice(0, 5).map((i) => Object.fromEntries([[idCol, i[idCol]], ...cols.map((c) => [c, i[c]])])) };
  };
  const I = (pred, cols) => pick(r, "incident_id", pred, cols);
  const zn = Object.fromEntries(loadTable("ref_zones").objects().map((z) => [Number(z.zone_no), z.zone_name]));
  const out = {
    incidents: {
      first_reported_in_future: I((i) => wallMs(i.first_reported_at) > nowMs, ["first_reported_at"]),
      closed_before_reported: I((i) => before(i.closed_at, i.first_reported_at), ["first_reported_at", "closed_at"]),
      verified_before_reported: I((i) => before(i.verified_at, i.first_reported_at), ["first_reported_at", "verified_at"]),
      last_update_before_reported: I((i) => before(i.last_update_at, i.first_reported_at), ["first_reported_at", "last_update_at"]),
      deadline_before_reported: I((i) => before(i.sla_due_at, i.first_reported_at), ["first_reported_at", "sla_due_at"]),
      occurred_after_reported: I((i) => before(i.first_reported_at, i.occurred_at_est), ["occurred_at_est", "first_reported_at"]),
      closed_in_future: I((i) => wallMs(i.closed_at) > nowMs, ["closed_at"]),
      open_but_closed_at_set: I((i) => isTrue(i.is_open) && !!i.closed_at, ["status_std", "closed_at"]),
      closed_without_closed_at: I((i) => !isTrue(i.is_open) && !i.closed_at, ["status_std"]),
      is_open_disagrees_with_status: I((i) => isTrue(i.is_open) !== OPEN_STATUSES.includes(i.status_std), ["status_std", "is_open"]),
      open_past_due_not_flagged: I((i) => isTrue(i.is_open) && i.sla_due_at && wallMs(i.sla_due_at) <= nowMs && !isTrue(i.sla_breached), ["first_reported_at", "sla_due_at", "sla_breached"]),
      open_flagged_but_not_yet_due: I((i) => isTrue(i.is_open) && isTrue(i.sla_breached) && i.sla_due_at && wallMs(i.sla_due_at) > nowMs, ["first_reported_at", "sla_due_at", "sla_breached"]),
      zone_name_disagrees_with_ref_zones: I((i) => i.zone_no != null && zn[Number(i.zone_no)] && zn[Number(i.zone_no)] !== i.zone_name, ["zone_no", "zone_name"])
    }
  };
  const e = loadTable("events").objects();
  const E = (pred, cols) => pick(e, "event_id", pred, cols);
  out.events = {
    reported_in_future: E((x) => wallMs(x.reported_at) > nowMs, ["reported_at"]),
    closed_before_reported: E((x) => before(x.closed_at, x.reported_at), ["reported_at", "closed_at"]),
    occurred_after_reported: E((x) => before(x.reported_at, x.occurred_at), ["occurred_at", "reported_at"])
  };
  const a = loadTable("actions").objects();
  const A = (pred, cols) => pick(a, "action_id", pred, cols);
  out.actions = {
    completed_before_assigned: A((x) => before(x.completed_at, x.assigned_at), ["assigned_at", "completed_at"]),
    due_before_assigned: A((x) => before(x.due_at, x.assigned_at), ["assigned_at", "due_at"]),
    verified_before_completed: A((x) => before(x.verified_at, x.completed_at), ["completed_at", "verified_at"])
  };
  return out;
}

/** Latest date in each table: max over every date/datetime column, and how many values lie after `now`. */
function latestDates(nowMs) {
  const out = {};
  for (const { table } of listTables()) {
    let t;
    try { t = loadTable(table); } catch { continue; }
    const cols = t.columns.filter((c) => /date|time/i.test(t.kinds[c]));
    if (!cols.length) { out[table] = { rows: t.rows.length, latest: null, columns: {} }; continue; }
    const per = {};
    let best = null;
    for (const c of cols) {
      const i = t.idx[c];
      let mx = null, future = 0;
      for (const r of t.rows) { const v = wallMs(r[i]); if (v == null) continue; if (mx == null || v > mx) mx = v; if (v > nowMs) future++; }
      if (mx != null) per[c] = { max: fmtWall(mx), after_now: future };
      if (mx != null && (best == null || mx > best)) best = mx;
    }
    out[table] = { rows: t.rows.length, latest: best == null ? null : fmtWall(best), columns: per };
  }
  return out;
}

/** The pipeline's own precomputed kpis (offset 0) against this oracle, for the same window end. */
function kpisCheck(inc) {
  const k = loadTable("kpis").objects().filter((r) => !isTrue(r.offset));
  const out = [];
  for (const r of k) {
    if (!(r.period in PERIODS)) continue;
    let w = inWindow(inc, r.period, wallMs(r.window_end));
    if (r.zone_no != null) w = w.filter((i) => i.zone === Number(r.zone_no));
    const f = figures(w);
    const pairs = { incidents: f.reported, severe_incidents: f.severe, open_incidents: f.open, complaints_filed: f.complaints,
      complaints_open: f.complaints_open, sla_breached_open: f.overdue, multi_source_incidents: f.multi_source, media_only: f.news_only };
    for (const [col, mine] of Object.entries(pairs)) if (num(r[col]) !== mine)
      out.push({ period: r.period, zone: r.zone_no, window_end: r.window_end, column: col, kpis_table: num(r[col]), oracle: mine });
  }
  const byColumn = {};
  for (const m of out) byColumn[m.column] = (byColumn[m.column] ?? 0) + 1;
  return { rows_checked: k.length, mismatches: out.length, by_column: byColumn, examples: out.slice(0, 40) };
}

function dailyCountsCheck() {
  const dc = loadTable("daily_counts").objects();
  const ev = loadTable("events").objects();
  const a = {}, b = {};
  for (const r of dc) a[r.source] = (a[r.source] ?? 0) + num(r.count);
  for (const e of ev) b[e.source] = (b[e.source] ?? 0) + 1;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((s) => ({ source: s, daily_counts_total: a[s] ?? 0, events_total: b[s] ?? 0 }));
}

function main() {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const now = resolveNow(get("--now"));
  const outPath = path.resolve(get("--out") ?? path.join(APP_ROOT, "..", "docs", "qa", "evidence", "oracle.json"));
  const { nowMs, inc, periods, sums } = compute(now);
  const report = {
    generated_at: new Date().toISOString(), now, snapshot_as_of: snapshotAsOf(),
    notes: [
      "Store-level figures use is_open as stored. The console overlays Collector decisions (EFF, intel.ts:162) and drops news complaints routed to a department (ROUTED, intel.ts:573) from 'overdue' (intel.ts:1015); neither ops table is in the snapshot, so the two agree only while no decisions/assignments exist.",
      "complaints = SUM(citizen_complaints) over all reported (insights.ts:119); complaints_open = over open only (KPI tile, intel.ts:707).",
      "news_only = SUM(media_only) (insights.ts:120); news_only_open = open AND media_only (snapshot, intel.ts:1016)."
    ],
    periods, sums, members: membersCheck(), dates: datesCheck(nowMs), latest_dates: latestDates(nowMs),
    kpis_table_vs_oracle: kpisCheck(inc), daily_counts_vs_events: dailyCountsCheck()
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`now=${now} (snapshot as_of ${report.snapshot_as_of}) -> ${outPath}`);
  for (const [p, v] of Object.entries(periods)) console.log(p.padEnd(9), JSON.stringify(v.district));
  for (const [p, s] of Object.entries(sums)) console.log(`sums ${p}:`, JSON.stringify(s));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
