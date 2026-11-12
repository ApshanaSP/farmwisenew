// QA pass 4: the skeptic's direct queries. No oracle, no grader: gunzip the pinned tables and count by hand, so a grade can be checked against something other than itself.
// The only thing shared with the oracle is the list of rows the app's build hooks took out or changed (evidence/same-number-hooks.json), since those are app rules.
//   import { raw, inc, count, select, rolling, whole } from "./grader-skeptic-query.mjs"
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..", "..");
const PIN = path.join(APP, "data", "aws-cache", "qa", "pinned");

export function raw(name) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN, "tables", `${name}.json.gz`))).toString("utf8"));
  const cols = j.columns.map((c) => c[0]);
  return j.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

export const seeded = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN, "rows.seeded.json.gz"))).toString("utf8")).rows ?? {};
const hooks = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "docs", "qa", "pass4", "evidence", "same-number-hooks.json"), "utf8"));
export const removed = new Set(hooks.removed.map((x) => String(x.id)));
export const hookChanges = hooks.changed;

const wall = (s) => (s == null ? null : Date.parse(`${String(s).slice(0, 19).replace(" ", "T")}Z`));
const truthy = (v) => v === true || v === 1 || v === "1";

const latest = new Map();
for (const d of [...(seeded.collector_decisions ?? [])].sort((a, b) => Number(a.decision_id) - Number(b.decision_id))) if (d.decision !== "note") latest.set(String(d.incident_id), d.decision);
const routed = new Set((seeded.dept_assignments ?? []).map((a) => String(a.incident_id)));

const asOf = (() => { let v = raw("metrics").find((m) => m.metric === "as_of")?.value; try { v = JSON.parse(v); } catch { /* plain */ } return String(v).slice(0, 19).replace("T", " "); })();
export const NOW_TEXT = asOf > "2026-11-06 12:00:00" ? asOf : "2026-11-06 12:00:00";
export const NOW = wall(NOW_TEXT);

const changeOf = new Map();
for (const c of hooks.changed) { const k = String(c.id); if (!changeOf.has(k)) changeOf.set(k, []); changeOf.get(k).push(c); }

export const inc = raw("incidents").filter((r) => !removed.has(String(r.incident_id))).map((r0) => {
  const r = { ...r0 };
  for (const c of changeOf.get(String(r0.incident_id)) ?? []) for (const [k, v] of Object.entries(c)) if (k !== "id" && k !== "hook" && Array.isArray(v)) r[k] = v[1];
  const d = latest.get(String(r.incident_id));
  const open = d === "resolve" || d === "reject" ? false : d === "reopen" ? true : truthy(r.is_open);
  return { ...r, id: String(r.incident_id), t: wall(r.first_reported_at), open, routed: routed.has(String(r.incident_id)), breached: truthy(r.sla_breached), status: d === "resolve" ? "Resolved" : d === "reject" ? "Rejected" : d === "reopen" ? "Open" : r.status_std, decision: d ?? null };
});

const H = 3600_000;
export const rolling = (h, k = 0) => ({ lo: NOW - h * H * (k + 1), hi: NOW - h * H * k });
export const whole = { lo: -Infinity, hi: NOW };
export function select(f = {}, w = whole) {
  return inc.filter((r) => r.t != null && r.t > w.lo && r.t <= w.hi && (f.zone == null || Number(r.zone_no) === f.zone) && (f.dept == null || r.lead_dept === f.dept) && (f.cat == null || r.category_code === f.cat) && (f.sev == null || r.severity_level === f.sev) && (f.open == null || r.open === f.open));
}
export const count = (f, w) => select(f, w).length;
