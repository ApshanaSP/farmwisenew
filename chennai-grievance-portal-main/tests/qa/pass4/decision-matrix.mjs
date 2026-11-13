// QA pass 4: the decision matrix. Applies each action (resolve, reject, reopen, verify, escalate, note, an officer's close and send) to a
// fresh real incident through the real route as the right role, reads every surface before and after, and records what moved.
//
//   node tests/qa/pass4/server.mjs start --port 3121 --frozen --ticking --instance decisions --env ASSISTANT_TOOLS_API=1 --env OFFICER_UPLOAD_DIR=data/aws-cache/qa/srv/decisions/uploads
//   node tests/qa/pass4/decision-matrix.mjs            (20 to 30 minutes: it waits for the caches after each action)
//   node tests/qa/pass4/server.mjs stop --port 3121
//
// Start from an empty instance folder (data/aws-cache/qa/srv/decisions): a second run on the same file sees its own decisions and stops.
// Every write stays in that instance's durable file. No model is called: the server has no model key. Passwords are read in code, never
// printed; the evidence holds ids, figures and statuses, no titles and no citizen's words.
//
// Writes docs/qa/pass4/evidence/decision-matrix.json and decision-matrix.md. A run under way keeps its partial results in data/aws-cache/qa/run, so a run that is cut off
// leaves the last whole evidence file alone. --report rewrites the table from the evidence. --after adds the checks of a second server (see afterRun).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { APP_ROOT, PIN_DIR } from "./lib/env.mjs";
import { accounts } from "../seed-local-users.mjs";

const PORT = Number(process.env.QA_DM_PORT || 3121);
const BASE = `http://127.0.0.1:${PORT}`;
const INSTANCE = process.env.QA_DM_INSTANCE || "decisions";
const DURABLE = path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", INSTANCE, "durable.sqlite");
const OUT = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "decision-matrix.json");
/** Kept while a run is under way, so a run that is cut off does not replace a whole evidence file with a part of one. */
const PARTIAL = path.join(APP_ROOT, "data", "aws-cache", "qa", "run", "decision-matrix.partial.json");
const SETTLE_MS = Number(process.env.QA_DM_SETTLE_MS || 65_000);
const PERIOD = "weekly";
const acc = Object.fromEntries(accounts().map((a) => [a.key, a]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ client --

let resets = 0;
const READ_POSTS = /assistant\/tools|assistant\/chat|map\/ask|thunai\/agent\/round/;
/** A socket the server closed while the machine is busy resets the call. A read is simply asked again; a write is never repeated, and the run stops instead. */
async function send(url, init) {
  for (let i = 0; ; i++) {
    try { return await fetch(url, init); } catch (e) {
      if (i >= 3 || (init.method !== "GET" && !READ_POSTS.test(url))) throw e;
      resets++;
      log("connection reset on a read, asking again:", url.replace(BASE, "").slice(0, 60));
      await sleep(1000 * (i + 1));
    }
  }
}

class Client {
  constructor(key) { this.key = key; this.jar = new Map(); }
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, url, { json, headers = {}, form } = {}) {
    const h = { ...headers };
    if (this.jar.size) h.cookie = this.cookie();
    let body;
    if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await send(BASE + url, { method, headers: h, body, redirect: "manual" });
    for (const s of r.headers.getSetCookie?.() ?? []) { const m = s.match(/^([^=]+)=([^;]*)/); if (m) { if (m[2]) this.jar.set(m[1], m[2]); else this.jar.delete(m[1]); } }
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json().catch(() => null) : await r.text();
    return { status: r.status, data, headers: r.headers };
  }
  get(u, o) { return this.req("GET", u, o); }
  post(u, json, o = {}) { return this.req("POST", u, { json, ...o }); }
  async login() {
    const a = acc[this.key];
    const r = await this.post("/api/auth/login", { email: a.email, password: a.password });
    if (r.status !== 200) throw new Error(`sign-in failed for ${this.key}: ${r.status}`);
    return this;
  }
  /** Repeats a call the server answered with 428, with the grant the account's own password earns. */
  async withGrant(call) {
    const r = await call({});
    if (r.status !== 428) return r;
    const c = r.data.confirm;
    const g = await this.post("/api/auth/confirm", { step: "check", action: c.action, scope: c.scope, summary: c.summary, method: "password", code: acc[this.key].password });
    if (g.status !== 200) return { status: g.status, data: g.data };
    return call({ "x-diq-grant": g.data.grant });
  }
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
function reportForm(step, remarks) {
  const f = new FormData();
  f.set("remarks", remarks); f.set("step", step);
  f.append("photos", new Blob([PNG], { type: "image/png" }), "done.png");
  return f;
}

// ---------------------------------------------------------------- snapshot --

function pinnedTable(name) {
  const x = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "tables", `${name}.json.gz`))).toString("utf8"));
  const cols = x.columns.map((c) => (Array.isArray(c) ? c[0] : String(c).split(",")[0]));
  return x.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}
const t19 = (s) => (s == null ? null : String(s).slice(0, 19).replace("T", " "));

// ----------------------------------------------------------------- the plan --

/** Each action gets a fresh incident of a department a test officer can read. Fixed ids: the snapshot is pinned. Why each one: `why`. */
const ACTIONS = [
  { action: "resolve", id: "INC-20261103-1D9CB6", officer: "officerB", why: "open, high, past its deadline, on the action list, in a hotspot" },
  { action: "resolve", label: "resolve (severe)", id: "INC-20261102-3B27A7", officer: "officerC", why: "open and severe: moves the severe figures" },
  { action: "reject", id: "INC-20261105-45E2DD", officer: "officerB", why: "open, high, new at the department" },
  { action: "reopen", id: "INC-20261103-0559E9", officer: "officerB", why: "the pipeline closed it as resolved; has a citizen's complaint" },
  { action: "reopen", label: "reopen (severe)", id: "INC-20261103-FB02F4", officer: "officerC", why: "the pipeline closed it; severe, so the action list should bring it back" },
  { action: "verify", id: "INC-20261105-0476D7", officer: "officerC", why: "severe (the route refuses others), three complaints" },
  { action: "escalate", id: "INC-20261104-EA19E3", officer: "officerA", why: "open, high, past its deadline" },
  { action: "note", id: "INC-20261103-8989A6", officer: "officerA", why: "open, high, awaiting verification" },
  { action: "officer_close", label: "officer close", id: "INC-20261102-8EC358", officer: "officerA", why: "not severe, in action, two complaints, in a hotspot" },
  { action: "officer_send", label: "officer send", id: "INC-20261103-53934E-1", officer: "officerC", why: "severe: goes to the Collector's My Tasks" }
];
/** officerC is moved to this department in the throwaway file only: no test officer's department has a severe open incident. */
const OFFICER_C_DEPT = "PWD-WRD";

const SURFACES = ["console_overview", "console_list", "incident_page", "map_pins", "alerts", "briefing", "trends", "officer_overview", "officer_grievances", "officer_insights",
  "citizen_tracker", "ask_tools", "jarvis", "search", "exports"];

// ---------------------------------------------------------------- what design says --

const stageOf = (status) => (["Open", "Under review"].includes(status) ? "new" : status === "Assigned" ? "approved" : status === "In progress" ? "action"
  : status === "Awaiting verification" ? "sent" : status === "Resolved" ? "verified" : "closed");
const OPEN_STAGES = ["new", "approved", "action", "sent"];

function effect(action, inc) {
  const pipe = { open: inc.pipeOpen, status: inc.pipeStatus };
  return ({
    resolve: { open: 0, status: "Resolved", decision: "resolve", verified: 1, stage: "verified", tracker: "Verified by Collector", checkedBy: "collector", decided: true, pageDec: 1 },
    reject: { open: 0, status: "Rejected", decision: "reject", verified: inc.ver, stage: "closed", tracker: "Rejected", rejected: "Collector", decided: true, pageDec: 1 },
    reopen: { open: 1, status: "Open", decision: "reopen", verified: inc.ver, stage: "action", returned: 1, tracker: "In Progress", pageDec: 1 },
    verify: { open: 0, status: "Resolved", decision: "verify", verified: 1, stage: "verified", tracker: "Verified by Collector", checkedBy: "collector", decided: true, pageDec: 1 },
    escalate: { ...pipe, decision: "escalate", escalated: 1, verified: inc.ver, stage: stageOf(inc.pipeStatus), pageDec: 1 },
    note: { ...pipe, decision: null, verified: inc.ver, stage: stageOf(inc.pipeStatus), pageDec: 1 },
    officer_close: { open: 0, status: "Resolved", decision: "resolve", verified: 1, stage: "verified", tracker: "Resolved by Department", checkedBy: "department", decided: true, pageDec: 1, report: 1 },
    officer_send: { ...pipe, decision: null, verified: inc.ver, stage: "sent", tracker: "Completed - Pending Collector Verification", report: 1, tasks: 1, pageDec: 0 }
  })[action];
}

function stageCounts(stage, inc, returned) {
  const open = OPEN_STAGES.includes(stage), serious = ["Severe", "High"].includes(inc.sev);
  return { new: +(stage === "new"), action: +(stage === "approved" || stage === "action"), sent: +(stage === "sent"), verified: +(stage === "verified"),
    returned: +(!!returned && (stage === "approved" || stage === "action")), serious: +(open && serious), overdue: +(open && !!inc.br), newSerious: +(stage === "new" && serious) };
}

/** metric -> what design says it does: { d } a change by d, { eq } a value after, nothing = stays as it was. */
function expected(action, inc) {
  const a = effect(action, inc), e = {};
  const dOpen = a.open - inc.pipeOpen;
  const dRes = (a.open === 0 && a.status === "Resolved" ? 1 : 0) - (inc.pipeOpen === 0 && inc.pipeStatus === "Resolved" ? 1 : 0);
  const serious = ["Severe", "High"].includes(inc.sev), severe = inc.sev === "Severe";
  const set = (s, k, v) => { e[`${s}|${k}`] = v; };
  const critical = (open, decided) => +(severe && open === 1 && (inc.ver === 0 || inc.aw === 1) && !decided);
  const dCrit = critical(a.open, a.decided) - critical(inc.pipeOpen, false);
  const unverified = (open, decided) => +(open === 1 && inc.ver === 0 && !decided);
  const verifiedList = (open) => +(open === 1 && inc.ver === 1);

  // console figures: effective.ts, intel.ts kpiBlock, snapCommon, zoneTable, deptNav
  set("console_overview", "kpi.ongoing", { d: dOpen });
  set("console_overview", "kpi.complaints", { d: dOpen * inc.cc });
  set("console_overview", "kpi.resolved", { d: dRes });
  set("console_overview", "kpi.severe_open", { d: severe ? dOpen : 0 });
  set("console_overview", "kpi.complaint_inc", { d: inc.cc > 0 ? dOpen : 0 });
  set("console_overview", "kpi.urgent", { d: serious ? dOpen : 0 });
  set("console_overview", "kpi.reported", { d: 0 });
  set("console_overview", "kpi.severe", { d: 0 });
  set("console_overview", "snapshot.serious", { d: serious ? dOpen : 0 });
  set("console_overview", "snapshot.overdue", { d: inc.br ? dOpen : 0 });
  set("console_overview", "snapshot.critical", { d: dCrit });
  set("console_overview", "tasks.count", { d: a.tasks ?? 0 });
  set("console_overview", "zone.open", { d: dOpen });
  set("console_overview", "zone.complaints", { d: dOpen * inc.cc });
  set("console_overview", "zone.n", { d: 0 });
  set("console_overview", "dept.open", { d: dOpen });
  set("console_overview", "dept.unverified", { d: inc.aw ? dOpen : 0 });
  set("console_overview", "severity.count", { d: dOpen });
  set("console_overview", "severityMix.open", { d: dOpen });

  // console list and page
  set("console_list", "open.incidents", { d: dOpen });
  set("console_list", "open.complaints", { d: dOpen * inc.cc });
  set("console_list", "scoped.incidents", { d: dOpen });
  set("console_list", "scoped.groups", { info: true });
  set("console_list", "overdue.incidents", { d: inc.br ? dOpen : 0 });
  set("console_list", "unverified.incidents", { d: unverified(a.open, a.decided) - unverified(inc.pipeOpen, false) });
  // intel.ts: the verified filter holds verified work that is still open, and what the Collector has just verified ("Verify and close" closes it, its row says verified)
  set("console_list", "verified.incidents", { d: (action === "verify" ? 1 : verifiedList(a.open)) - verifiedList(inc.pipeOpen) });
  set("console_list", "critical.incidents", { d: dCrit });
  set("console_list", "awaiting.incidents", { d: a.tasks ?? 0 });
  set("console_list", "id.open", { eq: a.open });
  set("console_list", "id.status", { eq: 1 });
  set("console_list", "row.status", { eq: a.status });
  set("console_list", "row.open", { eq: a.open });
  set("console_list", "row.decision", { eq: a.decision });
  set("console_list", "row.verified", { eq: a.verified });
  set("console_list", "row.escalated", { eq: a.escalated ?? null });
  set("incident_page", "page.status", { eq: a.status });
  set("incident_page", "page.open", { eq: a.open });
  set("incident_page", "page.verified", { eq: a.verified });
  set("incident_page", "page.decision", { eq: a.decision });
  set("incident_page", "page.escalated", { eq: a.escalated ?? null });
  set("incident_page", "page.decisions", { d: a.pageDec });
  set("incident_page", "page.deptReports", { d: a.report ?? 0 });
  set("incident_page", "page.needsYou", a.open === 0 ? { eq: false } : { info: true });

  // map pins
  set("map_pins", "console.pin.open", { eq: a.open });
  set("map_pins", "console.pin.status", { eq: a.status });
  set("map_pins", "console.total", { d: 0 });
  set("map_pins", "ask.total", { d: dOpen });
  set("map_pins", "officer.pin", { eq: OPEN_STAGES.includes(a.stage) });

  // alerts: the lane reads warnings, not incidents; the bell lists open severe and high incidents
  set("alerts", "lane.level", { d: 0 });
  set("alerts", "bell.has", { eq: serious && a.open === 1 });

  // briefing: insights.ts, briefbook.ts
  set("briefing", "stats.open", { d: dOpen });
  set("briefing", "stats.overdue", { d: inc.br ? dOpen : 0 });
  set("briefing", "stats.reported", { d: 0 });
  set("briefing", "stats.severe", { d: 0 });
  set("briefing", "dept.open", { d: dOpen });
  set("briefing", "dept.complaints", { d: dOpen * inc.cc });
  set("briefing", "dept.overdue", { d: inc.br ? dOpen : 0 });
  set("briefing", "dept.serious", { d: serious ? dOpen : 0 });
  set("briefing", "book.awaiting", { d: a.tasks ?? 0 });
  set("briefing", "book.resolved", { d: dRes });
  set("briefing", "book.item.status", { eq: a.status });
  set("briefing", "attention.status", { eq: a.open === 1 ? a.status : null });

  // trends: taluk ranking follows decisions; report counts do not
  set("trends", "taluk.open", { d: dOpen });
  set("trends", "taluk.severe", { d: severe ? dOpen : 0 });
  set("trends", "taluk.overdue", { d: inc.br ? dOpen : 0 });
  set("trends", "taluk.reported", { d: 0 });
  set("trends", "weekly.total", { d: 0 });
  set("trends", "hotspot.open", { d: dOpen });
  set("trends", "pattern.row.status", { eq: a.status });
  set("trends", "pattern.row.open", { eq: a.open });

  // officer: data.ts withStage
  const s0 = stageOf(inc.pipeStatus), c0 = stageCounts(s0, inc, false), c1 = stageCounts(a.stage, inc, a.returned);
  for (const k of Object.keys(c0)) { set("officer_overview", `counts.${k}`, { d: c1[k] - c0[k] }); }
  set("officer_overview", "board.ongoing", { d: dOpen });
  set("officer_overview", "board.resolved", { d: dRes });
  set("officer_overview", "board.complaints", { d: dOpen * inc.cc });
  set("officer_overview", "board.snapshot.open", { d: dOpen });
  set("officer_overview", "feedback.has", { eq: ["verify", "resolve", "reject", "reopen"].includes(action) });
  set("officer_grievances", "row.stage", { eq: a.stage === "closed" ? null : a.stage });
  set("officer_grievances", "detail.stage", { eq: a.stage });
  set("officer_grievances", "detail.returned", { eq: !!a.returned });
  set("officer_grievances", "detail.closedByDept", { eq: action === "officer_close" });
  set("officer_grievances", "detail.timeline", { d: action === "note" ? 0 : 1 });
  for (const k of ["new", "action", "sent", "verified"]) set("officer_grievances", `tab.${k}`, { d: c1[k] - c0[k] });
  set("officer_insights", "work.closed", { d: -dOpen });
  set("officer_insights", "work.pastDeadline", { d: inc.br ? dOpen : 0 });
  set("officer_insights", "work.checks.verified", { d: ["verify", "resolve"].includes(action) ? 1 : 0 });
  set("officer_insights", "work.checks.returned", { d: ["reopen", "reject"].includes(action) ? 1 : 0 });

  // citizen: complaint-progress.ts
  if (a.tracker) {
    set("citizen_tracker", "list.status", { eq: a.tracker });
    set("citizen_tracker", "detail.status", { eq: a.tracker });
    set("citizen_tracker", "stored.status", { eq: a.tracker });
    set("citizen_tracker", "history", { d: 1 });
    set("citizen_tracker", "detail.checkedBy", { eq: a.checkedBy ?? null });
    set("citizen_tracker", "detail.rejected_stage", { eq: a.rejected ?? null });
    set("citizen_tracker", "photos", { d: a.report ?? 0 });
  }

  // Ask District IQ: tools.ts "every number the assistant states is a number the console shows"
  set("ask_tools", "kpis.ongoing", { d: dOpen });
  set("ask_tools", "kpis.complaints", { d: dOpen * inc.cc });
  set("ask_tools", "kpis.resolved", { d: dRes });
  set("ask_tools", "zones.open", { d: dOpen });
  set("ask_tools", "zones.complaints", { d: dOpen * inc.cc });
  set("ask_tools", "departments.open", { d: dOpen });
  set("ask_tools", "severity.mixopen", { d: dOpen });
  set("ask_tools", "backlog.open", { d: dOpen });
  set("ask_tools", "backlog.overdue", { d: inc.br ? dOpen : 0 });
  set("ask_tools", "incidents.id.open", { eq: a.open });
  set("ask_tools", "detail.status", { eq: a.status });
  set("ask_tools", "detail.open", { eq: a.open === 1 });
  set("ask_tools", "search.status", { eq: a.status });
  set("ask_tools", "search.open", { eq: a.open === 1 });
  set("ask_tools", "search_records.status", { eq: a.status });
  set("ask_tools", "queue.count", { d: a.tasks ?? 0 });
  set("ask_tools", "briefing.open", { d: dOpen });
  set("ask_tools", "followups.open", { d: dOpen });
  set("ask_tools", "taluks.open", { d: dOpen });
  set("ask_tools", "chat.open", { d: dOpen });
  set("ask_tools", "chat.resolved", { d: dRes });

  // Jarvis: the spoken figure and the screen's figure come from the same tools
  set("jarvis", "compare.open", { d: dOpen });
  set("jarvis", "compare.spoken", { d: dOpen });
  set("jarvis", "cases.total", { d: dOpen });
  set("jarvis", "cases.spoken", { d: dOpen });
  set("jarvis", "brief.overdue", { d: inc.br ? dOpen : 0 });
  set("jarvis", "severe.total", { d: severe ? dOpen : 0 });
  set("jarvis", "severe.spoken", { d: severe ? dOpen : 0 });

  // search
  set("search", "console.status", { eq: a.status });
  set("search", "console.open", { eq: a.open });
  set("search", "zone.open", { d: dOpen });
  set("search", "total", { d: 0 });
  set("search", "officer.stage", { eq: a.stage === "closed" ? null : a.stage });

  // exports: intel.ts exportRows; the expected values that rest on explain() are filled in once the page is read
  if (a.open === 0) set("exports", "csv.has", { eq: false });
  set("exports", "map.rows", { d: dOpen });
  set("exports", "assistant.has", { eq: null });
  return e;
}

// ------------------------------------------------------------------ reading --

const num = (v) => (v == null ? null : Number(v));
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const firstNumber = (s) => { const m = String(s ?? "").match(/\d[\d,]*/); return m ? Number(m[0].replace(/,/g, "")) : null; };
let turnN = 0;

const session = {};
async function signIn() {
  for (const k of ["collector", "officerA", "officerB", "officerC", "citizenA", "citizenB"]) session[k] = await new Client(k).login();
  session.anon = new Client("anon");
}

const JSTATE = { page: "overview", period: PERIOD, zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0 };
const jarvis = (body) => session.collector.post("/api/collector/thunai/agent/round", { state: JSTATE, turnId: `dm${++turnN}`, round: 0, turns: [], ...body });

async function chat(message) {
  const r = await send(`${BASE}/api/collector/assistant/chat`, { method: "POST", headers: { cookie: session.collector.cookie(), "content-type": "application/json" },
    body: JSON.stringify({ message, inputMode: "text", language: "en", consoleScope: { period: PERIOD, zone: null, dept: null, cat: null, taluk: null } }) });
  const text = await r.text();
  for (const b of text.split("\n\n")) {
    if (!/^event: answer$/m.test(b)) continue;
    const d = JSON.parse(b.match(/^data: (.*)$/m)?.[1] ?? "null");
    return d?.card ?? d;
  }
  return null;
}

async function readSurfaces(inc, { withAssistantExport = false, withMapExport = false } = {}) {
  const m = {};
  const put = (s, k, v) => { m[`${s}|${k}`] = v === undefined ? null : v; };
  const col = session.collector;
  const P = `period=${PERIOD}`;

  // -- console overview, district
  const ov = (await col.get(`/api/collector/overview?${P}`)).data;
  for (const k of ["ongoing", "complaints", "resolved", "severe_open", "complaint_inc", "urgent", "reported", "severe"]) put("console_overview", `kpi.${k}`, num(ov.kpi.cur[k]));
  put("console_overview", "snapshot.serious", ov.snapshot.serious);
  put("console_overview", "snapshot.overdue", ov.snapshot.overdue);
  put("console_overview", "snapshot.critical", ov.snapshot.critical);
  put("console_overview", "tasks.count", ov.tasks.count);
  const zr = inc.zone ? ov.zoneTable.find((z) => Number(z.zone) === inc.zone) : ov.zoneUnassigned;
  put("console_overview", "zone.open", zr?.open);
  put("console_overview", "zone.complaints", zr?.complaints);
  put("console_overview", "zone.n", zr?.n);
  const dr = ov.deptNav.find((d) => d.code === inc.dept);
  put("console_overview", "dept.open", dr?.open);
  put("console_overview", "dept.unverified", dr?.unverified);
  put("console_overview", "severity.count", ov.severity.counts[inc.sev]);
  put("console_overview", "severityMix.open", ov.severityMix.find((x) => x.sev === inc.sev)?.open);

  // -- scoped overview: pins and bell (the scope keeps the incident inside the lists' limits)
  const ovd = (await col.get(`/api/collector/overview?${P}&dept=${inc.dept}${inc.zone ? `&zone=${inc.zone}` : ""}`)).data;
  const pin = ovd.map.pins.find((p) => p.id === inc.id);
  put("map_pins", "console.pin.open", pin ? Number(pin.open) : null);
  put("map_pins", "console.pin.status", pin?.status ?? null);
  put("map_pins", "console.total", ovd.map.total);
  put("alerts", "bell.has", ovd.bell.some((b) => b.id === inc.id));
  put("alerts", "bell.full", { info: ovd.bell.length >= 6 });

  // -- list
  const lst = async (q) => (await col.get(`/api/collector/list?${P}&${q}`)).data;
  const lo = await lst("status=open");
  put("console_list", "open.incidents", lo.incidents);
  put("console_list", "open.complaints", lo.complaints);
  for (const st of ["overdue", "unverified", "verified", "critical", "awaiting"]) put("console_list", `${st}.incidents`, (await lst(`status=${st}`)).incidents);
  const sc = await lst(`status=open&dept=${inc.dept}${inc.zone ? `&zone=${inc.zone}` : ""}`);
  put("console_list", "scoped.incidents", sc.incidents);
  put("console_list", "scoped.groups", sc.total);
  const idq = `q=${encodeURIComponent(inc.id)}`;
  put("console_list", "id.open", (await lst(`status=open&${idq}`)).incidents);
  const lr = (await lst(idq)).rows?.find((r) => r.id === inc.id);
  put("console_list", "row.status", lr?.status);
  put("console_list", "row.open", lr ? Number(lr.open) : null);
  put("console_list", "row.decision", lr?.decision ?? null);
  put("console_list", "row.verified", lr ? Number(lr.verified) : null);
  put("console_list", "row.escalated", lr?.escalated ?? null);
  if (inc.afterStatus) put("console_list", "id.status", (await lst(`status=${encodeURIComponent(inc.afterStatus)}&${idq}`)).incidents);

  // -- the incident's page
  const pg = (await col.get(`/api/collector/incidents/${inc.id}`)).data;
  const pi = pg.incident;
  put("incident_page", "page.status", pi.status);
  put("incident_page", "page.open", Number(pi.open));
  put("incident_page", "page.verified", Number(pi.verified));
  put("incident_page", "page.decision", pi.decision ?? null);
  put("incident_page", "page.escalated", pi.escalated ?? null);
  put("incident_page", "page.decisions", pg.decisions.length);
  put("incident_page", "page.deptReports", pg.deptReports.length);
  put("incident_page", "page.needsYou", !!pi.why?.needsYou);

  // -- Ask the Map
  const mapAsk = (await col.post("/api/map/ask", { text: `open incidents in zone ${inc.zone ?? 5}`, context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } })).data;
  put("map_pins", "ask.total", mapAsk.total);

  // -- alerts lane
  const al = (await col.get("/api/collector/alerts")).data;
  put("alerts", "lane.level", al.lane?.status?.level === "alert" ? 2 : al.lane?.status?.level === "watchful" ? 1 : 0);

  // -- briefing
  const br = (await col.get(`/api/collector/insights?${P}&part=briefing`)).data;
  for (const k of ["open", "overdue", "reported", "severe"]) put("briefing", `stats.${k}`, br.briefing.stats[k]);
  const da = br.deptActions.find((d) => d.code === inc.dept);
  put("briefing", "dept.open", da?.open ?? 0);
  put("briefing", "dept.complaints", da?.complaints ?? 0);
  put("briefing", "dept.overdue", da?.overdue ?? 0);
  put("briefing", "dept.serious", da?.serious ?? 0);
  put("briefing", "book.awaiting", br.book?.glance?.tiles?.awaiting);
  put("briefing", "book.resolved", br.book?.good?.resolved);
  put("briefing", "attention.status", br.briefing.attention.find((a) => a.id === inc.id)?.status ?? null);
  const brd = (await col.get(`/api/collector/insights?${P}&part=briefing&dept=${inc.dept}${inc.zone ? `&zone=${inc.zone}` : ""}`)).data;
  const item = brd.book?.departments?.flatMap((d) => d.items)?.find((x) => x.id === inc.id);
  put("briefing", "book.item.status", item?.status ?? null);
  const attention = brd.briefing.attention.find((a) => a.id === inc.id);
  if (attention) put("briefing", "attention.status", attention.status);

  // -- trends
  const tr = (await col.get(`/api/collector/insights?${P}&part=trends`)).data;
  const tk = inc.taluk ? tr.taluks.find((t) => t.code === inc.taluk) : tr.talukUnassigned;
  put("trends", "taluk.open", tk?.open);
  put("trends", "taluk.severe", tk?.severe);
  put("trends", "taluk.overdue", tk?.overdue);
  put("trends", "taluk.reported", tk?.reported);
  put("trends", "weekly.total", tr.trends.weekly.lines.reduce((a, l) => a + l.total, 0));
  if (inc.hotspot) {
    const trc = (await col.get(`/api/collector/insights?${P}&part=trends&cat=${inc.cat}`)).data;
    put("trends", "hotspot.open", trc.patterns.hotspots.find((h) => h.id === inc.hotspot)?.open ?? null);
    const pat = (await col.get(`/api/collector/pattern?kind=hotspot&id=${encodeURIComponent(inc.hotspot)}`)).data;
    const pr = (pat?.incidents ?? []).find((x) => x.id === inc.id);
    put("trends", "pattern.row.status", pr?.status ?? null);
    put("trends", "pattern.row.open", pr ? Number(pr.open) : null);
  }

  // -- officer
  if (inc.officer) {
    const off = session[inc.officer];
    const oo = (await off.get(`/api/officer/overview?${P}`)).data;
    for (const k of ["new", "action", "sent", "verified", "returned", "serious", "overdue", "newSerious"]) put("officer_overview", `counts.${k}`, oo.counts[k]);
    put("officer_overview", "board.ongoing", num(oo.board.kpi.cur.ongoing));
    put("officer_overview", "board.resolved", num(oo.board.kpi.cur.resolved));
    put("officer_overview", "board.complaints", num(oo.board.kpi.cur.complaints));
    put("officer_overview", "board.snapshot.open", oo.board.snapshot?.open);
    put("officer_overview", "feedback.has", oo.feedback.some((f) => f.id === inc.id));
    put("map_pins", "officer.pin", oo.map.pins.some((p) => p.id === inc.id));
    const g = (await off.get(`/api/officer/grievances?tab=all&${P}&per=10&q=${encodeURIComponent(inc.id)}`)).data;
    const row = g.rows?.find((r) => r.id === inc.id);
    put("officer_grievances", "row.stage", row?.stage ?? null);
    const de = (await off.get(`/api/officer/grievances/${inc.id}`)).data;
    put("officer_grievances", "detail.stage", de?.grievance?.stage ?? null);
    put("officer_grievances", "detail.returned", !!de?.grievance?.returned);
    put("officer_grievances", "detail.closedByDept", !!de?.closedByDept);
    put("officer_grievances", "detail.timeline", de?.timeline?.length ?? null);
    for (const k of ["new", "action", "sent", "verified"]) put("officer_grievances", `tab.${k}`, (await off.get(`/api/officer/grievances?tab=${k}&${P}&per=1`)).data?.total);
    const oi = (await off.get(`/api/officer/insights?${P}`)).data;
    const work = oi.modules?.find((x) => (x.key ?? x.id) === "work");
    const kpi = (label) => work?.kpis?.find((x) => x.label === label);
    put("officer_insights", "work.closed", firstNumber(kpi("Closed")?.sub));
    put("officer_insights", "work.pastDeadline", firstNumber(kpi("Open past deadline")?.value));
    const checks = String(kpi("Collector's checks")?.sub ?? "");
    put("officer_insights", "work.checks.verified", firstNumber(checks.match(/([\d,]+) verified/)?.[1]));
    put("officer_insights", "work.checks.returned", firstNumber(checks.match(/([\d,]+) returned/)?.[1]));
    const os = (await off.get(`/api/officer/search?q=${encodeURIComponent(inc.id)}`)).data;
    put("search", "officer.stage", os.rows?.find((r) => r.id === inc.id)?.stage ?? null);
  }

  // -- citizen
  if (inc.citizen && inc.code) {
    const cit = session[inc.citizen];
    const li = (await cit.get("/api/complaints")).data.complaints.find((c) => c.complaint_code === inc.code);
    put("citizen_tracker", "list.status", li?.status ?? null);
    const de = (await cit.get(`/api/complaints/${inc.code}`)).data;
    put("citizen_tracker", "detail.status", de?.complaint?.status ?? null);
    put("citizen_tracker", "detail.rejected_stage", de?.complaint?.rejected_stage ?? null);
    put("citizen_tracker", "detail.checkedBy", de?.progress?.checkedBy ?? null);
    put("citizen_tracker", "history", de?.history?.length ?? null);
    put("citizen_tracker", "photos", de?.progress?.photos?.length ?? 0);
    const db = new DatabaseSync(DURABLE, { readOnly: true });
    db.exec("PRAGMA busy_timeout = 5000");
    put("citizen_tracker", "stored.status", db.prepare("SELECT status FROM complaints WHERE complaint_code = ?").get(inc.code)?.status ?? null);
    db.close();
  }

  // -- Ask District IQ's tools (overview_kpis first: its one-minute memo is what the briefing's memo expires behind)
  const tool = async (name, args) => (await col.post("/api/collector/assistant/tools", { tool: name, args })).data?.result?.data;
  const scope = { scope: { period: PERIOD } };
  const k = await tool("overview_kpis", scope);
  put("ask_tools", "kpis.ongoing", num(k?.cur?.ongoing));
  put("ask_tools", "kpis.complaints", num(k?.cur?.complaints));
  put("ask_tools", "kpis.resolved", num(k?.cur?.resolved));
  const zs = await tool("zones", scope);
  const zt = zs?.rows?.find((z) => Number(z.zone) === inc.zone);
  put("ask_tools", "zones.open", zt?.open ?? null);
  put("ask_tools", "zones.complaints", zt?.complaints ?? null);
  put("ask_tools", "departments.open", (await tool("departments", scope))?.rows?.find((d) => d.code === inc.dept)?.open ?? null);
  put("ask_tools", "severity.mixopen", (await tool("severity", scope))?.mix?.find((x) => x.sev === inc.sev)?.open ?? null);
  const bk = (await tool("dept_backlog", scope))?.rows?.find((d) => d.code === inc.dept);
  put("ask_tools", "backlog.open", bk?.n ?? null);
  put("ask_tools", "backlog.overdue", bk?.overdue ?? null);
  put("ask_tools", "incidents.id.open", (await tool("incidents", { scope: { period: PERIOD }, q: inc.id, status: "open" }))?.rows?.filter((r) => r.id === inc.id).length ?? null);
  const dt = await tool("incident_detail", { id: inc.id });
  put("ask_tools", "detail.status", dt?.incident?.status ?? null);
  put("ask_tools", "detail.open", dt?.incident?.open ?? null);
  const st = (await tool("search", { text: inc.id }))?.incidents?.find((r) => r.id === inc.id);
  put("ask_tools", "search.status", st?.status ?? null);
  put("ask_tools", "search.open", st?.open ?? null);
  if (pi.loc) {
    const sr = await tool("search_records", { text: String(pi.loc).slice(0, 200), scope: { period: PERIOD, ...(inc.zone ? { zone: inc.zone } : {}), dept: inc.dept } });
    put("ask_tools", "search_records.status", sr?.incidents?.find((r) => r.id === inc.id)?.status ?? null);
  }
  put("ask_tools", "queue.count", (await tool("verification_queue", scope))?.count ?? null);
  const bt = await tool("briefing", scope);
  put("ask_tools", "briefing.open", bt?.stats?.open ?? null);
  put("ask_tools", "followups.open", (await tool("dept_followups", scope))?.rows?.find((d) => d.code === inc.dept)?.open ?? 0);
  if (inc.taluk) put("ask_tools", "taluks.open", (await tool("taluks", scope))?.rows?.find((t) => t.code === inc.taluk)?.open ?? null);
  const co = await chat("how many open incidents this week").catch(() => null);
  put("ask_tools", "chat.open", firstNumber(co?.headline));
  const cr = await chat("how many resolved incidents this week").catch(() => null);
  put("ask_tools", "chat.resolved", firstNumber(cr?.headline));

  // -- Jarvis: the round route, no model, the rules' lane
  const other = (await session.collector.get(`/api/collector/overview?${P}`)).data.zoneTable.find((z) => Number(z.zone) !== (inc.zone ?? 5));
  const zname = inc.zoneName ?? "";
  const cmp = (await jarvis({ text: `compare ${zname} and ${other.name} this week` })).data;
  const side = cmp.result?.stage?.blocks?.find((b) => b.kind === "Compare")?.sides?.find((s) => s.label === zname);
  put("jarvis", "compare.open", side?.values?.open ?? null);
  put("jarvis", "compare.spoken", firstNumber(String(cmp.result?.say ?? "").match(new RegExp(`${zname.replace(/[-.]/g, ".")}: [^.]*?([\\d,]+) open`))?.[1]));
  const cases = (await jarvis({ text: "x", direct: { recipe: "cases", slots: { dept: inc.dept, zones: inc.zone ? [inc.zone] : [], status: "open", period: PERIOD, sort: "priority", n: 20, fresh: true }, lang: "en" } })).data;
  const caseBlock = cases.result?.stage?.blocks?.find((b) => b.kind === "CaseList");
  put("jarvis", "cases.total", caseBlock?.total ?? 0);
  put("jarvis", "cases.spoken", firstNumber(cases.result?.say) ?? 0);
  const bf = (await jarvis({ text: "brief me on this week" })).data;
  put("jarvis", "brief.overdue", bf.result?.stage?.blocks?.find((b) => b.kind === "Kpis")?.items?.[2]?.value ?? null);
  const sv = (await jarvis({ text: "severe cases this week" })).data;
  put("jarvis", "severe.total", sv.result?.stage?.blocks?.find((b) => b.kind === "CaseList")?.total ?? null);
  put("jarvis", "severe.spoken", firstNumber(sv.result?.say));

  // -- search
  const se = (await col.get(`/api/collector/search?q=${encodeURIComponent(inc.id)}`)).data;
  const hit = se.incidents.find((x) => x.id === inc.id);
  put("search", "console.status", hit?.status ?? null);
  put("search", "console.open", hit ? Number(hit.open) : null);
  put("search", "total", se.incidentsTotal);
  const zq = (await col.get(`/api/collector/search?q=${encodeURIComponent(zname || "Royapuram")}`)).data;
  put("search", "zone.open", zq.zones.find((z) => Number(z.zone) === inc.zone)?.open ?? null);

  // -- exports
  const ex = (await col.withGrant((h) => col.get(`/api/collector/export?${P}&dept=${inc.dept}`, { headers: h }))).data;
  const lines = String(ex?.csv ?? "").split("\n");
  put("exports", "csv.has", lines.some((l) => l.includes(inc.id)));
  put("exports", "csv.count", ex?.count ?? null);
  const rp = (await col.get(`/api/collector/report?${P}&dept=${inc.dept}`)).data;
  put("exports", "report.attention", rp?.report?.attentionTotal ?? null);
  put("exports", "report.routine", rp?.report?.routine ?? null);
  if (withAssistantExport) {
    const ax = await col.get(`/api/collector/assistant/export?${P}&dept=${inc.dept}`);
    put("exports", "assistant.has", typeof ax.data === "string" ? ax.data.includes(inc.id) : null);
  }
  if (withMapExport) {
    const body = { plan: mapAsk.plan, question: null, format: "csv" };
    const mx = await col.withGrant((h) => col.post("/api/map/export", body, { headers: h }));
    put("exports", "map.rows", num(mx.headers?.get?.("x-rows")));
  }
  return m;
}

// ------------------------------------------------------------------ judging --

const same = (a, b) => (a === b) || (a == null && b == null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

function judge(exp, before, imm, settled) {
  const unread = settled === undefined || (exp && "d" in exp && (before == null || settled == null));
  if (unread) return "unread";
  if (exp?.info) return same(before, settled) ? "still" : "moved";
  const want = !exp ? before : "d" in exp ? before + exp.d : exp.eq;
  const movedAtAll = !same(before, settled);
  const expectMove = !same(before, want);
  if (same(settled, want)) {
    if (!expectMove) return "still";
    return same(imm, want) ? "moved" : "moved_late";
  }
  if (!movedAtAll) return "did_not_move";
  return "moved_wrongly";
}
const RANK = { moved_wrongly: 5, did_not_move: 4, moved_late: 3, moved: 2, still: 1, unread: 0 };

function judgeAll(action, inc, before, imm, settled) {
  const exp = expected(action, inc);
  // the action list keeps what explain() says needs the Collector: the incident's page runs the same rule on the decided row
  const needsAfter = settled["incident_page|page.needsYou"];
  if (exp["exports|csv.has"] === undefined) exp["exports|csv.has"] = { eq: needsAfter };
  const wasOn = before["exports|csv.has"] ? 1 : 0, onAfter = exp["exports|csv.has"].eq ? 1 : 0;
  exp["exports|csv.count"] = { d: onAfter - wasOn };
  exp["exports|report.attention"] = { d: onAfter - wasOn };
  const dOpen = effect(action, inc).open - inc.pipeOpen;
  exp["exports|report.routine"] = { d: dOpen - (onAfter - wasOn) };
  // Jarvis's case list counts what the console's list counts: groups of the same problem in one area (intel.ts list(): total), so closing one member of a group leaves the count
  // since 8779570 the case list counts incidents (the console list's `incidents`), not groups
  const dGroups = settled["console_list|scoped.incidents"] - before["console_list|scoped.incidents"];
  exp["jarvis|cases.total"] = { d: dGroups };
  exp["jarvis|cases.spoken"] = { d: dGroups };
  // the bell lists six: an incident below the sixth is simply not on it
  if (exp["alerts|bell.has"]?.eq === true && settled["alerts|bell.has"] === false && settled["alerts|bell.full"]?.info) exp["alerts|bell.has"] = { eq: false };
  const keys = new Set([...Object.keys(settled), ...Object.keys(before)].filter((k) => k !== "alerts|bell.full"));
  const metrics = {};
  for (const k of [...keys].sort()) {
    const e = exp[k];
    // a row an incident is simply not on (the top lists hold only a few): nothing to compare, so nothing to say
    const rowOnly = ["briefing|attention.status", "briefing|book.item.status", "trends|pattern.row.status", "trends|pattern.row.open", "trends|hotspot.open",
      "map_pins|console.pin.open", "map_pins|console.pin.status", "search|officer.stage", "ask_tools|search_records.status", "exports|assistant.has", "exports|map.rows"].includes(k);
    const v = judge(e, before[k], imm[k], settled[k]);
    if (rowOnly && before[k] == null && settled[k] == null) continue;
    if (k === "exports|assistant.has") { metrics[k] = { before: before[k], immediate: imm[k], settled: settled[k], expected: { eq: exp["exports|csv.has"].eq }, verdict: same(settled[k], exp["exports|csv.has"].eq) ? (same(before[k], settled[k]) ? "still" : "moved") : (same(before[k], settled[k]) ? "did_not_move" : "moved_wrongly") }; continue; }
    metrics[k] = { before: before[k], immediate: imm[k], settled: settled[k], expected: e ?? { same: true }, verdict: v };
  }
  const surfaces = {};
  for (const s of SURFACES) {
    const mine = Object.entries(metrics).filter(([k]) => k.startsWith(`${s}|`));
    if (!mine.length) { surfaces[s] = { verdict: "unread", notes: [] }; continue; }
    const worst = mine.reduce((a, [, v]) => (RANK[v.verdict] > RANK[a] ? v.verdict : a), "unread");
    const notes = mine.filter(([, v]) => ["moved_wrongly", "did_not_move", "moved_late"].includes(v.verdict))
      .map(([k, v]) => `${k.split("|")[1]}: ${JSON.stringify(v.before)} to ${JSON.stringify(v.settled)}, wanted ${"d" in (v.expected ?? {}) ? `${v.expected.d >= 0 ? "+" : ""}${v.expected.d}` : "eq" in (v.expected ?? {}) ? JSON.stringify(v.expected.eq) : "no change"} (${v.verdict}${v.verdict === "moved_late" ? `, right after: ${JSON.stringify(v.immediate)}` : ""})`);
    surfaces[s] = { verdict: worst, notes };
  }
  return { metrics, surfaces };
}

// ----------------------------------------------------------------- fixtures --

/** In the throwaway file only: officerC reads the severe department, and each incident has a complaint a test citizen owns, as the pipeline files them (events.source_record_id = the complaint number). */
function fixtures(incs) {
  const db = new DatabaseSync(DURABLE);
  db.exec("PRAGMA busy_timeout = 8000");
  const had = Number(db.prepare(`SELECT COUNT(*) AS n FROM collector_decisions WHERE incident_id IN (${incs.map(() => "?").join(",")})`).get(...incs.map((i) => i.id)).n);
  if (had) throw new Error(`this durable file already holds ${had} decisions on the chosen incidents: start from an empty instance folder`);
  db.prepare("UPDATE users SET dept_code = ? WHERE id = ?").run(OFFICER_C_DEPT, acc.officerC.id);
  const add = db.prepare(`INSERT INTO complaints (complaint_code, user_id, first_name, gender, street_address, zone_id, ward_number, department_id, title, description, status, created_at)
    VALUES (?, ?, 'QA', 'Other', 'QA address', ?, ?, 1, 'QA complaint', 'QA complaint for the decision matrix', 'Complaint Filed', ?)`);
  const hist = db.prepare(`INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at) VALUES (?, 'Complaint Filed', 'Citizen', 'QA', ?, ?)`);
  for (const inc of incs) {
    if (!inc.code || inc.realComplaint) continue;
    const r = add.run(inc.code, acc[inc.citizen].id, inc.zone ?? 1, inc.ward ?? 1, inc.filed);
    hist.run(r.lastInsertRowid, acc[inc.citizen].id, inc.filed);
  }
  db.close();
}

/** Real complaints the store already links to an incident (four in the whole snapshot): moved to citizenB, in this file only, so the tracker can be read. */
function ownRealComplaint(code) {
  const db = new DatabaseSync(DURABLE);
  db.exec("PRAGMA busy_timeout = 8000");
  db.prepare("UPDATE complaints SET user_id = ? WHERE complaint_code = ?").run(acc.citizenB.id, code);
  db.close();
}

function decisionRows() {
  const db = new DatabaseSync(DURABLE, { readOnly: true });
  db.exec("PRAGMA busy_timeout = 5000");
  const rows = db.prepare("SELECT incident_id, decision, decided_role, decision_id FROM collector_decisions ORDER BY decision_id").all();
  const routed = db.prepare("SELECT DISTINCT incident_id FROM dept_assignments").all().map((r) => r.incident_id);
  db.close();
  return { rows, routed };
}

// ----------------------------------------------------------------- the runs --

const decide = (id, decision, extra = {}) => session.collector.withGrant((h) => session.collector.post("/api/collector/decisions", { incidentIds: [id], decision, ...extra }, { headers: h }));
const officerStep = (who, id, step, remarks = "QA: work finished and checked on site.") =>
  session[who].withGrant((h) => session[who].req("POST", `/api/officer/grievances/${id}/report`, { form: reportForm(step, remarks), headers: h }));

async function apply(action, inc) {
  if (action === "note") return decide(inc.id, "note", { note: "QA note for the decision matrix." });
  if (action === "reject") return decide(inc.id, "reject", { note: "QA: returned for the decision matrix." });
  if (action === "officer_close") return officerStep(inc.officer, inc.id, "close");
  if (action === "officer_send") return officerStep(inc.officer, inc.id, "send");
  return decide(inc.id, action);
}

/** The state of one incident on the surfaces that read the store directly (no cache), for the sequences. */
async function rowState(inc) {
  const col = session.collector;
  const pg = (await col.get(`/api/collector/incidents/${inc.id}`)).data;
  const out = { status: pg?.incident?.status ?? null, open: pg?.incident ? Number(pg.incident.open) : null, decision: pg?.incident?.decision ?? null,
    listOpen: (await col.get(`/api/collector/list?scope=all&status=open&q=${encodeURIComponent(inc.id)}`)).data?.incidents ?? null };
  if (inc.officer) {
    const de = await session[inc.officer].get(`/api/officer/grievances/${inc.id}`);
    out.stage = de.data?.grievance?.stage ?? null; out.returned = !!de.data?.grievance?.returned;
  }
  if (inc.citizen && inc.code) {
    const de = await session[inc.citizen].get(`/api/complaints/${inc.code}`);
    out.tracker = de.data?.complaint?.status ?? null;
  }
  return out;
}

async function sequences(load) {
  const out = [];
  const run = async (name, id, officer, steps, want, why) => {
    const inc = load(id, officer);
    const trail = [{ step: "start", ...(await rowState(inc)) }];
    for (const [label, call] of steps(inc)) {
      const r = await call();
      trail.push({ step: label, http: r.status, ...(await rowState(inc)) });
    }
    const last = trail.at(-1);
    const bad = Object.entries(want).filter(([k, v]) => !same(last[k], v)).map(([k, v]) => `${k}: ${JSON.stringify(last[k])}, wanted ${JSON.stringify(v)}`);
    out.push({ name, id, trail, want, ok: bad.length === 0, bad, why });
    log("sequence", name, bad.length ? `DIFFERS: ${bad.join("; ")}` : "ok");
  };
  await run("resolve, reopen, resolve within two minutes", "INC-20261104-FC41F8", "officerA",
    (i) => [["resolve", () => decide(i.id, "resolve")], ["reopen", () => decide(i.id, "reopen")], ["resolve again", () => decide(i.id, "resolve")]],
    { open: 0, status: "Resolved", decision: "resolve" }, "decisions route: \"a double click sends the same decision twice: the one just made ... is kept, not recorded\". The third call is not a double click: the latest decision is reopen.");
  await run("reopen, resolve, reopen within two minutes", "INC-20261103-6E8CD6", "officerA",
    (i) => [["reopen", () => decide(i.id, "reopen")], ["resolve", () => decide(i.id, "resolve")], ["reopen again", () => decide(i.id, "reopen")]],
    { open: 1, status: "Open", decision: "reopen" }, "the same rule, the other way round");
  await run("resolve, then a note", "INC-20261030-CB8991", "officerA",
    (i) => [["resolve", () => decide(i.id, "resolve")], ["note", () => decide(i.id, "note", { note: "QA note." })]],
    { open: 0, status: "Resolved", decision: "resolve" }, "effective.ts: \"The latest decision other than a note decides\"");
  await run("resolve, then escalate", "INC-20261103-B74560", "officerA",
    (i) => [["resolve", () => decide(i.id, "resolve")], ["escalate", () => decide(i.id, "escalate")]],
    { open: 0, status: "Resolved", decision: "escalate", stage: "verified" }, "effective.ts: \"The latest decision with an effect decides\": an escalate has none, so the resolve stands; the officer's stage ignores escalate too.");
  await run("severe: resolve, then verify", "INC-20261105-BB4429", "officerC",
    (i) => [["resolve", () => decide(i.id, "resolve")], ["verify", () => decide(i.id, "verify")]],
    { open: 0, status: "Resolved", decision: "verify", stage: "verified" }, "effective.ts: a verify (\"Verify and close\") closes, so after a resolve it stays closed");
  await run("officer close, then the Collector reopens", "INC-20261101-5C6119", "officerA",
    (i) => [["officer close", () => officerStep("officerA", i.id, "close")], ["reopen", () => decide(i.id, "reopen", { note: "QA: sent back." })]],
    { open: 1, status: "Open", decision: "reopen", stage: "action", returned: true }, "officer/data.ts: \"The latest of those wins\"; the Collector's Send back is a reopen");
  await run("reject, then reopen", "INC-20261102-A7CC18", "officerA",
    (i) => [["reject", () => decide(i.id, "reject", { note: "QA." })], ["reopen", () => decide(i.id, "reopen")]],
    { open: 1, status: "Open", decision: "reopen", stage: "action" }, "reopen opens what reject closed");
  await run("verify a severe incident the pipeline has not verified", "INC-20261105-D0CC25", null,
    (i) => [["verify", () => decide(i.id, "verify")]],
    { open: 0, status: "Resolved", decision: "verify" }, "verify closes the incident (effective.ts); the list's verified filter should hold it (next check)");
  // the whole loop: the officer sent it in the matrix above; the Collector's check takes it off My Tasks
  const task = async () => (await session.collector.get(`/api/collector/overview?period=${PERIOD}`)).data.tasks.count;
  const before = await task();
  const v = await decide("INC-20261103-53934E-1", "verify");
  const after = await task();
  out.push({ name: "officer send, then the Collector verifies: My Tasks", id: "INC-20261103-53934E-1", trail: [{ step: "before verify", tasks: before }, { step: "verify", http: v.status, tasks: after }], want: { tasks: before - 1 }, ok: after === before - 1, bad: after === before - 1 ? [] : [`tasks: ${after}, wanted ${before - 1}`], why: "intel.ts: a report sent \"always comes to My Tasks ... until the Collector decides\"" });
  return out;
}

/** Flows the screens can reach: the Collector's only two buttons are Verify and Send back (CollectorApp.tsx), and the officer's are Approve, Send and Close. */
async function reachableFlows(load) {
  const out = [];
  const tasks = async () => (await session.collector.get(`/api/collector/overview?period=${PERIOD}`)).data.tasks.count;
  {
    const inc = load("INC-20261104-22A6D5", "officerC");
    const trail = [{ step: "start", ...(await rowState(inc)), tasks: await tasks() }];
    for (const [label, call] of [["officer send", () => officerStep("officerC", inc.id, "send")], ["send back", () => decide(inc.id, "reopen", { note: "Sent back to the department: the Collector did not accept the reported action." })],
      ["officer send again", () => officerStep("officerC", inc.id, "send", "QA: done again, checked on site.")], ["send back again", () => decide(inc.id, "reopen", { note: "Sent back to the department: the Collector did not accept the reported action." })]]) {
      const r = await call();
      trail.push({ step: label, http: r.status, ...(await rowState(inc)), tasks: await tasks() });
      await sleep(1100); // whole seconds in the store: a tie would hide the later step
    }
    const last = trail.at(-1);
    const ok = last.stage === "action" && last.tasks === trail[0].tasks;
    out.push({ name: "officer send, send back, officer send, send back, within two minutes", id: inc.id, trail, want: { stage: "action", tasks: trail[0].tasks }, ok,
      bad: ok ? [] : [`stage: ${last.stage}, wanted action; My Tasks: ${last.tasks}, wanted ${trail[0].tasks}; the second Send back answered ${last.http} and was not recorded`],
      why: "the same double-click rule, reached with the screens' own buttons: the second Send back is a new decision on a new report, not a double click" });
  }
  {
    const inc = load("INC-20261101-738431", "officerC");
    const t0 = await tasks();
    const r1 = await decide(inc.id, "reopen", { note: "QA: not done." });
    const mid = await rowState(inc);
    await sleep(1100); // whole seconds in the store: a tie would hide the later step
    const r2 = await officerStep("officerC", inc.id, "send");
    const end = await rowState(inc);
    const t1 = await tasks();
    const awaiting = (await session.collector.get(`/api/collector/list?scope=all&status=awaiting&q=${inc.id}`)).data?.incidents;
    const ok = t1 === t0 + 1 && awaiting === 1;
    out.push({ name: "reopen an incident the pipeline closed, then the officer sends a report: My Tasks", id: inc.id, trail: [{ step: "reopen", http: r1.status, ...mid, tasks: t0 }, { step: "officer send", http: r2.status, ...end, tasks: t1, awaiting_list: awaiting }], want: { tasks: t0 + 1, awaiting_list: 1 }, ok,
      bad: ok ? [] : [`My Tasks: ${t1}, wanted ${t0 + 1}; awaiting list: ${awaiting}, wanted 1`],
      why: "intel.ts: \"Such a report always comes to My Tasks (the officer asked for the Collector's check), whatever the period\". sentByOfficer() reads the pipeline's i.is_open" });
  }
  log("flows", out.map((x) => `${x.name}: ${x.ok ? "ok" : "DIFFERS"}`).join("; "));
  return out;
}

async function permissions(chosen) {
  const out = [];
  const before = decisionRows().rows.length;
  const check = (who, what, got, want) => { out.push({ who, what, got, want, ok: want.includes(got) }); };
  const inc = chosen[0];
  const swm = "INC-20261106-707839"; // GCC-SWM, not yet touched
  const ele = "INC-20261106-D065CE"; // GCC-ELE, not yet touched
  const body = (d) => ({ incidentIds: [swm], decision: d, note: "QA permission check" });
  for (const d of ["resolve", "reject", "reopen", "verify", "escalate", "note"]) {
    check("no session", `POST decisions ${d}`, (await session.anon.post("/api/collector/decisions", body(d))).status, [401]);
    check("citizen", `POST decisions ${d}`, (await session.citizenA.post("/api/collector/decisions", body(d))).status, [401]);
    check("officer of the incident's department", `POST decisions ${d}`, (await session.officerA.post("/api/collector/decisions", body(d))).status, [401]);
    check("officer of another department", `POST decisions ${d}`, (await session.officerB.post("/api/collector/decisions", body(d))).status, [401]);
  }
  check("collector, no grant", "POST decisions resolve", (await session.collector.post("/api/collector/decisions", body("resolve"))).status, [428]);
  check("collector", "verify on a non-severe incident", (await session.collector.withGrant((h) => session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "verify" }, { headers: h }))).status, [409]);
  check("collector", "reject with no note", (await session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "reject" })).status, [400]);
  check("collector", "note with no note", (await session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "note" })).status, [400]);
  check("collector", "escalate to an unknown department", (await session.collector.withGrant((h) => session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "escalate", escalateTo: "NOPE-1" }, { headers: h }))).status, [400]);

  // a grant fits one action on one scope
  const need = await session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "resolve" });
  const g = await session.collector.post("/api/auth/confirm", { step: "check", action: "decide", scope: need.data.confirm.scope, summary: "x", method: "password", code: acc.collector.password });
  const grant = { "x-diq-grant": g.data.grant };
  check("collector, a grant for another incident", "POST decisions resolve", (await session.collector.post("/api/collector/decisions", { incidentIds: [ele], decision: "resolve" }, { headers: grant })).status, [428]);
  check("collector, a grant for another decision", "POST decisions escalate", (await session.collector.post("/api/collector/decisions", { incidentIds: [swm], decision: "escalate" }, { headers: grant })).status, [428]);
  check("officer, the Collector's grant", "POST decisions resolve", (await session.officerA.post("/api/collector/decisions", { incidentIds: [swm], decision: "resolve" }, { headers: grant })).status, [401]);

  // the officer's routes
  for (const [who, cl] of [["no session", session.anon], ["citizen", session.citizenA], ["collector", session.collector]]) {
    check(who, "GET a grievance", (await cl.get(`/api/officer/grievances/${swm}`)).status, [401]);
    check(who, "approve a grievance", (await cl.post(`/api/officer/grievances/${swm}`, { step: "approve" })).status, [401]);
    check(who, "officer's report (close)", (await cl.req("POST", `/api/officer/grievances/${swm}/report`, { form: reportForm("close", "QA: not their case.") })).status, [401]);
  }
  check("officer of another department", "GET a grievance", (await session.officerB.get(`/api/officer/grievances/${swm}`)).status, [404]);
  check("officer of another department", "approve a grievance", (await session.officerB.post(`/api/officer/grievances/${swm}`, { step: "approve" })).status, [404]);
  check("officer of another department", "officer's report (close), with a grant", (await session.officerB.withGrant((h) => session.officerB.req("POST", `/api/officer/grievances/${swm}/report`, { form: reportForm("close", "QA: not their case."), headers: h }))).status, [404]);
  check("officer of another department", "search finds another department's grievance", ((await session.officerB.get(`/api/officer/search?q=${swm}`)).data?.rows ?? []).length, [0]);
  check("officer, wrong order", "close a new grievance (not yet approved)", (await session.officerA.withGrant((h) => session.officerA.req("POST", `/api/officer/grievances/${swm}/report`, { form: reportForm("close", "QA: too early."), headers: h }))).status, [409]);
  check("officer", "send a non-severe grievance to the Collector", (await session.officerB.withGrant((h) => session.officerB.req("POST", `/api/officer/grievances/INC-20261106-A90262/report`, { form: reportForm("send", "QA: not severe."), headers: h }))).status, [409]);
  check("officer", "close a severe grievance", (await session.officerC.withGrant((h) => session.officerC.req("POST", `/api/officer/grievances/INC-20261105-0476D7/report`, { form: reportForm("close", "QA: severe."), headers: h }))).status, [409]);
  check("officer, the other officer's grant", "officer's report", await (async () => {
    const n = await session.officerA.req("POST", `/api/officer/grievances/${swm}/report`, { form: reportForm("close", "QA: grant check.") });
    const g2 = await session.officerA.post("/api/auth/confirm", { step: "check", action: "officer_report", scope: n.data.confirm.scope, summary: "x", method: "password", code: acc.officerA.password });
    return (await session.officerB.req("POST", `/api/officer/grievances/${swm}/report`, { form: reportForm("close", "QA: grant check."), headers: { "x-diq-grant": g2.data.grant } })).status;
  })(), [428]);

  // the citizen's side
  if (inc.code) {
    check("citizen, not the owner", "GET another's complaint", (await session.citizenB.get(`/api/complaints/${inc.code}`)).status, [404]);
    check("collector", "GET a complaint on the citizen's route", (await session.collector.get(`/api/complaints/${inc.code}`)).status, [401]);
  }
  check("citizen", "confirm box", (await session.citizenA.post("/api/auth/confirm", { step: "check", action: "decide", scope: need.data.confirm.scope, summary: "x", method: "password", code: acc.citizenA.password })).status, [401]);
  check("officer", "assistant tools route (Collector only)", (await session.officerA.post("/api/collector/assistant/tools", { tool: "overview_kpis", args: {} })).status, [401]);
  check("citizen", "assistant tools route", (await session.citizenA.post("/api/collector/assistant/tools", { tool: "overview_kpis", args: {} })).status, [401]);
  const after = decisionRows().rows.length;
  out.push({ who: "the store", what: "decision rows written by all the refused calls", got: after - before, want: [0], ok: after === before });
  return out;
}

// ----------------------------------------------------------------- the sums --

function oracle(rawIncs, now) {
  const { rows, routed } = decisionRows();
  const routedSet = new Set(routed);
  const latest = new Map();
  // effective.ts (RC-26): the latest decision WITH AN EFFECT decides. resolve, verify ("Verify and close") and reject close, reopen opens; a note and an escalate are skipped.
  const EFFECT = { resolve: { open: 0, status: "Resolved" }, verify: { open: 0, status: "Resolved" }, reject: { open: 0, status: "Rejected" }, reopen: { open: 1, status: "Open" } };
  for (const r of rows) if (EFFECT[r.decision]) latest.set(r.incident_id, r.decision);
  const end = new Date(now.replace(" ", "T") + "Z").getTime();
  const fromT = new Date(end - 168 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const out = { ongoing: 0, resolved: 0, complaints: 0, severe_open: 0, urgent: 0, reported: 0, open_all: 0, byZone: {}, byDept: {} };
  for (const i of rawIncs) {
    const t = t19(i.first_reported_at);
    const e = EFFECT[latest.get(i.incident_id)] ?? { open: Number(i.is_open) === 1 ? 1 : 0, status: i.status_std };
    // Resolved is counted in the window by its closing time (PB-214, RC-29; the oracle's resolvedByClose): an incident reported before the window and closed by a decision now counts, as the Resolved tile counts it.
    // Every other figure keeps the reported-in-window rule.
    if (!(t > fromT && t <= now)) { if (e.status === "Resolved" && latest.has(i.incident_id)) out.resolved++; continue; }
    out.reported++;
    if (e.open) {
      out.open_all++;
      out.complaints += Number(i.citizen_complaints) || 0;
      if (i.severity_level === "Severe") out.severe_open++;
      out.byDept[i.lead_dept] = (out.byDept[i.lead_dept] ?? 0) + 1;
      const z = i.zone_no == null ? "none" : String(i.zone_no);
      out.byZone[z] = (out.byZone[z] ?? 0) + 1;
      if (!routedSet.has(i.incident_id)) {
        out.ongoing++;
        if (["Severe", "High"].includes(i.severity_level)) out.urgent++;
      }
    } else if (e.status === "Resolved") out.resolved++;
  }
  return out;
}

async function sums(rawIncs, baselineOracle, baselineConsole) {
  const col = session.collector;
  const tool = async (name, args) => (await col.post("/api/collector/assistant/tools", { tool: name, args })).data?.result?.data;
  const ov = (await col.get(`/api/collector/overview?period=${PERIOD}`)).data;
  const raw = oracle(rawIncs, ov.now);
  // the server takes news-only incidents out of the build when it loads it and places some from their reports (derive.ts), so the raw rows differ from the console by a fixed number before any decision. The oracle is the console's starting figure plus what the raw rows say the decisions changed
  const adj = (k) => baselineConsole[k] + (raw[k] - baselineOracle[k]);
  const or = { ...raw, ongoing: adj("ongoing"), open_all: adj("open_all"), resolved: adj("resolved"), complaints: adj("complaints"), severe_open: adj("severe_open"), reported: adj("reported") };
  const scope = { scope: { period: PERIOD } };
  const list = (await col.get(`/api/collector/list?period=${PERIOD}&status=open`)).data;
  const tk = await tool("overview_kpis", scope);
  const zs = await tool("zones", scope);
  const ds = await tool("departments", scope);
  const brf = (await col.get(`/api/collector/insights?period=${PERIOD}&part=briefing`)).data;
  const chatOpen = firstNumber((await chat("how many open incidents this week").catch(() => null))?.headline);
  const mapAll = (await col.post("/api/map/ask", { text: "open incidents in the district", context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } })).data;
  const perf = (await jarvis({ text: "department wise performance this week" })).data;
  const sumZones = ov.zoneTable.reduce((a, z) => a + z.open, 0) + ov.zoneUnassigned.open;
  const openAll = [
    ["console: zone table plus the no-zone row", sumZones], ["console: department list", ov.deptNav.reduce((a, d) => a + d.open, 0)],
    ["console: severity mix", ov.severityMix.reduce((a, s) => a + s.open, 0)], ["briefing: still open", brf.briefing.stats.open],
    ["Ask District IQ: chat count", chatOpen], ["Ask District IQ: departments tool", ds?.rows?.reduce((a, d) => a + Number(d.open), 0)],
    ["Jarvis: performance screen", perf.result?.stage?.blocks?.find((b) => b.kind === "Kpis")?.items?.[0]?.value ?? null]
  ];
  const ongoing = [["console: Ongoing tile", Number(ov.kpi.cur.ongoing)], ["console: open list", list.incidents], ["Ask District IQ: overview_kpis", Number(tk?.cur?.ongoing)],
    ["Ask the Map: open incidents", mapAll.total]];
  const rows = [];
  const line = (figure, oracleValue, values, note) => rows.push({ figure, oracle: oracleValue, values, ok: values.every(([, v]) => same(Number(v), oracleValue)), note });
  line("Ongoing incidents, last 7 days (open, not routed)", or.ongoing, ongoing, "");
  line("Open incidents, last 7 days (routed ones too)", or.open_all, openAll, "");
  line("Resolved, last 7 days", or.resolved, [["console: Resolved tile", Number(ov.kpi.cur.resolved)], ["Ask District IQ: overview_kpis", Number(tk?.cur?.resolved)]], "");
  line("Open complaints, last 7 days", or.complaints, [["console: tile", Number(ov.kpi.cur.complaints)], ["console: zone table plus the no-zone row", ov.zoneTable.reduce((a, z) => a + z.complaints, 0) + ov.zoneUnassigned.complaints], ["Ask District IQ: overview_kpis", Number(tk?.cur?.complaints)]], "");
  line("Severe and open, last 7 days", or.severe_open, [["console: tile's breakdown", Number(ov.kpi.cur.severe_open)], ["console: severity mix", ov.severityMix.find((s) => s.sev === "Severe")?.open]], "");
  // zones: the tool against the console, zone by zone
  const zoneDiff = ov.zoneTable.map((z) => ({ zone: z.zone, console: z.open, tool: zs?.rows?.find((r) => Number(r.zone) === Number(z.zone))?.open ?? null, oracle: baselineConsole.zones[String(z.zone)] + (raw.byZone[String(z.zone)] ?? 0) - (baselineOracle.byZone[String(z.zone)] ?? 0) })).filter((x) => !same(Number(x.console), Number(x.tool)) || !same(Number(x.console), x.oracle));
  rows.push({ figure: "Open by zone: console, the zones tool and the raw rows, zone by zone", oracle: null, values: [["zones that differ", zoneDiff.length]], ok: zoneDiff.length === 0, note: JSON.stringify(zoneDiff) });
  // each officer's page against the Collector's view of the same department, and the two figures on the officer's own page
  for (const k of ["officerA", "officerB", "officerC"]) {
    const off = (await session[k].get(`/api/officer/overview?period=${PERIOD}`)).data;
    const code = off.dept.code;
    const cd = (await col.get(`/api/collector/overview?period=${PERIOD}&dept=${code}`)).data;
    const openStages = off.counts.new + off.counts.action + off.counts.sent;
    rows.push({ figure: `${code}: the Collector's Ongoing and the board on the officer's page`, oracle: Number(cd.kpi.cur.ongoing), values: [["officer's board", Number(off.board.kpi.cur.ongoing)]], ok: same(Number(off.board.kpi.cur.ongoing), Number(cd.kpi.cur.ongoing)), note: "" });
    rows.push({ figure: `${code}: open on the board against New + In action + Sent on the same officer page`, oracle: Number(off.board.kpi.cur.ongoing), values: [["New + In action + Sent", openStages]], ok: same(openStages, Number(off.board.kpi.cur.ongoing)),
      note: "A verify closes the incident in the stages and on the board." });
  }
  return { rows, oracle: { ...or, byZone: undefined, byDept: undefined }, raw_before_any_decision: { ...baselineOracle, byZone: undefined, byDept: undefined }, console_before_any_decision: { ...baselineConsole, zones: undefined },
    build_offset: { reported: baselineOracle.reported - baselineConsole.reported, open: baselineOracle.open_all - baselineConsole.open_all, why: "open news-only incidents the server leaves out when it loads a build (derive.ts: news media, report kinds, news sanity)" } };
}

// ------------------------------------------------------------------- main --

async function main() {
  const health = await fetch(`${BASE}/login`).catch(() => null);
  if (!health) throw new Error(`no server on ${BASE}: start it first (see the top of this file)`);
  const rawIncs = pinnedTable("incidents");
  const events = pinnedTable("events").filter((e) => e.source === "grievance");
  const hotspots = new Map(pinnedTable("hotspots").map((h) => [h.hotspot_id, h]));
  const zoneNames = new Map(pinnedTable("ref_wards").map((w) => [Number(w.zone_no), w.zone_name]));
  const load = (id, officer, citizen = "citizenA") => {
    const i = rawIncs.find((x) => x.incident_id === id);
    if (!i) throw new Error(`no incident ${id} in the snapshot`);
    const ev = events.filter((e) => e.incident_id === id);
    return { id, officer, dept: i.lead_dept, sev: i.severity_level, cc: Number(i.citizen_complaints) || 0, br: Number(i.sla_breached) === 1 ? 1 : 0, aw: Number(i.awaiting_collector) === 1 ? 1 : 0, ver: Number(i.verified) === 1 ? 1 : 0,
      zone: i.zone_no == null ? null : Number(i.zone_no), ward: i.ward_no == null ? null : Number(i.ward_no), zoneName: i.zone_no == null ? null : zoneNames.get(Number(i.zone_no)), taluk: i.taluk_code || null, cat: i.category_code,
      hotspot: i.hotspot_id && Number(hotspots.get(i.hotspot_id)?.incidents_30d) >= 3 ? i.hotspot_id : null, pipeOpen: Number(i.is_open) === 1 ? 1 : 0, pipeStatus: i.status_std,
      first: t19(i.first_reported_at), code: ev[0]?.source_record_id ?? null, citizen: ev[0] ? citizen : null, filed: t19(ev[0]?.reported_at ?? i.first_reported_at) };
  };

  await signIn();
  const buildId = (await session.collector.get("/api/collector/overview?meta=1")).data;
  log("server", JSON.stringify(buildId));
  const chosen = ACTIONS.map((a) => ({ ...a, inc: load(a.id, a.officer) }));
  const seqIds = [["INC-20261104-FC41F8", "officerA"], ["INC-20261103-6E8CD6", "officerA"], ["INC-20261030-CB8991", "officerA"], ["INC-20261103-B74560", "officerA"], ["INC-20261105-BB4429", "officerC"], ["INC-20261101-5C6119", "officerA"], ["INC-20261102-A7CC18", "officerA"], ["INC-20261105-D0CC25", null]];
  const seqLoaded = new Map(seqIds.map(([id, o]) => [id, load(id, o)]));
  fixtures([...chosen.map((c) => c.inc), ...seqLoaded.values()]);
  for (const k of ["officerC"]) session[k] = await new Client(k).login(); // the department is read per request; this only refreshes the session after the fixture
  const baselineOracle = oracle(rawIncs, buildId.now);
  const ov0 = (await session.collector.get(`/api/collector/overview?period=${PERIOD}`)).data;
  const baselineConsole = { ongoing: Number(ov0.kpi.cur.ongoing), resolved: Number(ov0.kpi.cur.resolved), complaints: Number(ov0.kpi.cur.complaints), severe_open: Number(ov0.kpi.cur.severe_open), reported: Number(ov0.kpi.cur.reported),
    open_all: ov0.zoneTable.reduce((a, z) => a + z.open, 0) + ov0.zoneUnassigned.open, zones: Object.fromEntries(ov0.zoneTable.map((z) => [String(z.zone), z.open])) };

  const results = { meta: {
    generated_at: new Date().toISOString(), server: `node tests/qa/pass4/server.mjs start --port ${PORT} --frozen --ticking --instance ${INSTANCE} --env ASSISTANT_TOOLS_API=1 --env OFFICER_UPLOAD_DIR=...`,
    console_now: buildId.now, exported_at: buildId.exportedAt, build_id: JSON.parse(fs.readFileSync(path.join(PIN_DIR, "info.json"), "utf8")).build_id, period: PERIOD, settle_ms: SETTLE_MS,
    notes: [
      "The frozen clock starts at 2026-11-06 12:00 IST, but the pipeline's as_of (18:08) is later, so asOf() stays at 18:08 for the whole run. On production asOf() moves every 30 s, so a cache keyed on it rolls over within 30 s; here the same keys live for their full 60 s. So the moved, late cells say only that a figure lags, and the section on the real lag gives the seconds.",
      "officerC is moved to PWD-WRD in the throwaway durable file only: no test officer's department has a severe open incident.",
      "Only four grievance events in the snapshot link to a complaint in the complaints table. For the other incidents a complaint row owned by citizenA is added to the throwaway durable file, with the number the pipeline's grievance event holds, so the tracker reads it the real way. The real links are checked as well (realComplaints below).",
      "ASSISTANT_TOOLS_API=1 turns on the developer route that runs one assistant tool; it is off by default in production."
    ] }, incidents: {}, actions: [], sequences: [], realComplaints: [], permissions: [], sums: null };

  // permissions first: they must leave no trace, and they run on incidents the matrix does not use
  log("permissions");
  results.permissions = await permissions(chosen.map((c) => c.inc));

  let exportsLeft = 6;
  for (const c of chosen) {
    const { action, inc, why } = c;
    const label = c.label ?? action;
    inc.afterStatus = effect(action, inc).status;
    results.incidents[inc.id] = { action: label, why, dept: inc.dept, sev: inc.sev, complaints: inc.cc, past_deadline: !!inc.br, awaiting: !!inc.aw, verified: !!inc.ver, zone: inc.zone, taluk: inc.taluk, hotspot: inc.hotspot, pipeline_open: !!inc.pipeOpen, pipeline_status: inc.pipeStatus, complaint_number: inc.code, officer: inc.officer };
    const extra = { withAssistantExport: exportsLeft >= 2 && (action === "resolve" || action === "reopen" || action === "reject"), withMapExport: action === "resolve" || action === "reopen" || action === "reject" };
    if (extra.withAssistantExport) exportsLeft -= 2;
    log(`== ${label} ${inc.id}: reading before`);
    const before = await readSurfaces(inc, extra);
    log(`   applying`);
    const r = await apply(action, inc);
    if (r.status !== 201) throw new Error(`${label} on ${inc.id}: the route answered ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    const immediate = await readSurfaces(inc, extra);
    log(`   waiting ${SETTLE_MS} ms for the caches`);
    await sleep(SETTLE_MS);
    const settled = await readSurfaces(inc, extra);
    const judged = judgeAll(action, inc, before, immediate, settled);
    results.actions.push({ action: label, id: inc.id, http: r.status, ...judged });
    const bad = Object.entries(judged.surfaces).filter(([, v]) => ["moved_wrongly", "did_not_move"].includes(v.verdict)).map(([k]) => k);
    log(`   ${label}: ${bad.length ? `gaps on ${bad.join(", ")}` : "all as designed"}`);
    fs.mkdirSync(path.dirname(PARTIAL), { recursive: true });
    fs.writeFileSync(PARTIAL, JSON.stringify(results, null, 1));
  }

  log("sequences");
  results.sequences = await sequences((id, o) => seqLoaded.get(id) ?? load(id, o));
  results.sequences.push(...await reachableFlows((id, o) => load(id, o)));
  // the verified filter on a severe incident the pipeline had not verified
  const vf = await session.collector.get(`/api/collector/list?scope=all&status=verified&q=INC-20261105-D0CC25`);
  const vr = await session.collector.get(`/api/collector/list?scope=all&q=INC-20261105-D0CC25`);
  results.sequences.push({ name: "verify, then the list's verified filter", id: "INC-20261105-D0CC25", trail: [{ step: "after verify", verified_filter: vf.data?.incidents, row_verified: Number(vr.data?.rows?.[0]?.verified) }], want: { verified_filter: 1, row_verified: 1 }, ok: vf.data?.incidents === 1 && Number(vr.data?.rows?.[0]?.verified) === 1,
    bad: vf.data?.incidents === 1 ? [] : [`verified_filter: ${vf.data?.incidents}, wanted 1 (the row says verified ${Number(vr.data?.rows?.[0]?.verified)})`], why: "intel.ts overlay sets verified on the row; the list's filter reads the pipeline's i.verified only" });

  log("real complaints");
  for (const [code, id, how] of [["2026-846NCR", "INC-20261006-9D13D8", "resolve"], ["2026-379YNK", "INC-20261006-9FB89A", "officer_close"]]) {
    ownRealComplaint(code);
    const inc = load(id, "officerB", "citizenB");
    inc.code = code; inc.citizen = "citizenB";
    const start = await rowState(inc);
    let r;
    if (how === "resolve") r = await decide(id, "resolve");
    else {
      const a = await session.officerB.post(`/api/officer/grievances/${id}`, { step: "approve" });
      const mid = await rowState(inc);
      results.realComplaints.push({ code: "(real complaint)", id, step: "approve", http: a.status, ...mid });
      r = await officerStep("officerB", id, "close");
    }
    const end = await rowState(inc);
    results.realComplaints.push({ code: "(real complaint)", id, step: how, http: r.status, start, end, ok: how === "resolve" ? end.tracker === "Verified by Collector" : end.tracker === "Resolved by Department" });
  }

  log("waiting for the caches, then the sums");
  await sleep(SETTLE_MS);
  results.sums = await sums(rawIncs, baselineOracle, baselineConsole);
  const logFile = path.join(APP_ROOT, "data", "aws-cache", "qa", "run", `srv-${PORT}.log`);
  const srvLog = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  const errs = srvLog.split(/\r?\n/).filter((l) => /⨯|\berror\b|Error:|failed/i.test(l));
  const indexLines = srvLog.split(/\r?\n/).filter((l) => l.includes("search index")).length;
  const emb = errs.filter((l) => l.includes("embedding index"));
  results.server_errors = { search_index_lines: indexLines, embedding_model_lines: emb.length, embedding_model_why: "the model file in this worktree is a 134-byte pointer, not the model, so the meaning search stays off here and keyword search answers", other: errs.filter((l) => !l.includes("embedding index")).map((l) => l.slice(0, 200)).slice(0, 30) };
  results.meta.connection_resets_asked_again = resets;
  if (fs.existsSync(OUT)) { const was = JSON.parse(fs.readFileSync(OUT, "utf8")); if (was.after_run) results.after_run = was.after_run; }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  log("done", OUT, sha(JSON.stringify(results)));
}

// ----------------------------------------------------------------- the report --

const DESIGN = [
  ["The rule for status", "\"The latest decision with an effect decides: resolve, verify (Verify and close) and reject close the incident, reopen opens it. A note and an escalate have no effect and are skipped, so an escalate after a resolve leaves it closed\" (RC-26)", "src/lib/collector/effective.ts"],
  ["One rule, at once", "\"One rule for the row lists (overlay in intel.ts) and the SQL behind the KPI tiles and list filters, so a resolved incident leaves 'Ongoing' on the tile at the same moment it shows Resolved in the list.\"", "src/lib/collector/effective.ts"],
  ["Every number", "\"'Open' is the Collector-adjusted flag (EFF), as on the tiles and lists, so a resolved incident drops out of every number at once.\"", "src/lib/collector/intel.ts, snapCommon"],
  ["The route", "\"The console shows them at once; the pipeline applies them on its next build.\"", "src/app/api/collector/decisions/route.ts"],
  ["Citizens", "\"verify / resolve / return / reject reach the residents' trackers (complaint-progress.ts); notes and escalations do not\"", "src/app/api/collector/decisions/route.ts"],
  ["The citizen's words", "verify and resolve: \"Verified by Collector\", \"The Collector's office checked the work and closed the complaint.\" reopen: \"In Progress\". reject: \"Rejected\". The officer's close: \"Resolved by Department\". The officer's send: \"Completed - Pending Collector Verification\".", "src/lib/complaint-progress.ts"],
  ["The officer's stages", "\"The latest of those wins\"; the stage is 'verified' after verify and resolve, 'action' after reopen, 'closed' after reject; escalate and note are not read.", "src/lib/officer/data.ts, STAGE_SQL"],
  ["The officer's close", "\"close is the department's own verification, recorded as a resolve decision by the officer so every console shows it closed.\"", "src/lib/officer/data.ts, recordStep"],
  ["The officer's feedback", "\"The Collector's verify / return decisions on this department's grievances\"; the bell says \"Collector verified\" or \"Collector returned for rework\".", "src/lib/officer/data.ts, OfficerApp.tsx"],
  ["Ask District IQ", "\"so every number the assistant states is a number the console shows\"", "src/lib/assistant/tools.ts"],
  ["The words the Collector sees", "verify: \"Verify and close\"; reject: \"Return to the department\"; the toast after a verify: \"The citizen will see it closed.\"", "decisions/route.ts, CollectorApp.tsx"],
  ["A double click", "\"a double click sends the same decision twice: the one just made by the same person on the same incident is kept, not recorded (and audited) a second time\"", "src/app/api/collector/decisions/route.ts"],
  ["The map", "\"the Collector's decisions (which close or reopen incidents) are laid on top at every question, with the same rule as the console (effective.ts), so a resolved incident leaves the map at once\"", "src/lib/map/world.ts"],
  ["My Tasks", "\"Such a report always comes to My Tasks (the officer asked for the Collector's check), whatever the period\"", "src/lib/collector/intel.ts"]
];
const SHORT = { console_overview: "Console figures", console_list: "Console list", incident_page: "Incident page", map_pins: "Map pins", alerts: "Alerts and bell", briefing: "Briefing", trends: "Trends", officer_overview: "Officer overview",
  officer_grievances: "Officer grievances", officer_insights: "Officer insights", citizen_tracker: "Citizen tracker", ask_tools: "Ask District IQ", jarvis: "Jarvis", search: "Search", exports: "Exports" };
const CELL = { moved: "moved", moved_late: "moved, late", still: "still", did_not_move: "**DID NOT MOVE**", moved_wrongly: "**WRONG**", unread: "n/a" };

function writeReport() {
  const j = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const findingsFile = path.resolve(path.dirname(OUT), "..", "findings", "decisions.json");
  const findings = fs.existsSync(findingsFile) ? JSON.parse(fs.readFileSync(findingsFile, "utf8")) : [];
  const L = [];
  L.push("# Decision matrix (QA pass 4)", "");
  L.push(`Run on the production build, on a throwaway copy of the pinned snapshot (build \`${j.meta.build_id}\`), through the real routes as the right role. Period read: last 7 days. The console's now: ${j.meta.console_now}. Each action went to a fresh real incident. Every surface was read before, right after, and again ${Math.round(j.meta.settle_ms / 1000)} seconds after, so a cache is not mistaken for a gap.`, "");
  L.push("No model was called. The server has no model key, so Ask District IQ and Jarvis answered from their code lanes. The model-written query and the search index were tested in the permanent test with a fake model and a fake embedding at the boundary, and it says so below.", "");
  L.push("**In short.** The console's tiles, list and incident page, its map pins, the officer's stages and the citizen's tracker follow every action at once. Ask District IQ's tools, Jarvis and Ask the Map catch up within a minute. These do not follow at all: search rows, a hotspot's open count on Trends, the resolved figure and the rows in the Briefing, \"how many resolved\" in Ask District IQ, model-written queries and the search index. A verify says closed to everyone but stays open on the console. An officer of another department, a citizen and no session could not act. After all the actions the surfaces agree with each other, apart from the two open figures on an officer's own page after a verify.", "");
  L.push("Raw data: `decision-matrix.json`. Script: `chennai-grievance-portal-main/tests/qa/pass4/decision-matrix.mjs`. Permanent test: `chennai-grievance-portal-main/tests/qa/pass4/decision-matrix.test.ts`. Findings: `../findings/decisions.json`.", "");
  L.push("## What \"as designed\" means", "", "Each expected move comes from these lines of the code. Where two of them disagree, the cell follows the status rule and the conflict is a finding.", "", "| What | The code says | Where |", "|---|---|---|");
  for (const [w, q, src] of DESIGN) L.push(`| ${w} | ${q} | \`${src}\` |`);
  L.push("", "## The matrix", "", "**moved**: moved as designed, at once. **moved, late**: moved as designed, but only after a cache ran out. **still**: did not move, and it should not. **DID NOT MOVE**: should have moved, and did not. **WRONG**: moved in a way design does not say, or shows something design does not say. **n/a**: the surface has nothing to read for this incident (no complaint on it, no officer). A cell shows the worst of the figures read on that surface; the list under the table names each one. The verify row says \"still\" on the console because that is what the status rule says: the words shown to the Collector, the officer and the citizen say closed, and that conflict is finding DECISIONS-2.", "");
  L.push(`| Action | ${SURFACES.map((x) => SHORT[x]).join(" | ")} |`, `|---|${SURFACES.map(() => "---").join("|")}|`);
  for (const a of j.actions) L.push(`| ${a.action} | ${SURFACES.map((x) => CELL[a.surfaces[x]?.verdict ?? "unread"]).join(" | ")} |`);
  L.push("", "### The incidents", "", "| Action | Incident | Department | Severity | Pipeline status | Complaints | Why this one |", "|---|---|---|---|---|---|---|");
  for (const [id, x] of Object.entries(j.incidents)) L.push(`| ${x.action} | \`${id}\` | ${x.dept} | ${x.sev} | ${x.pipeline_status} | ${x.complaints} | ${x.why} |`);
  L.push("", "### What each gap and each late move is", "");
  for (const a of j.actions) {
    const lines = SURFACES.flatMap((x) => (a.surfaces[x]?.notes ?? []).map((n) => `${SHORT[x]}: ${n}`));
    if (!lines.length) continue;
    L.push(`**${a.action}** (\`${a.id}\`)`, "", ...lines.map((l) => `- ${l}`), "");
  }
  L.push("## Sequences: one incident, several actions", "", "| Sequence | Incident | Ends as designed | Trail (step: status, open, stage, tracker) | Why it matters |", "|---|---|---|---|---|");
  for (const q of j.sequences) {
    const trail = q.trail.map((t) => [t.step, t.status, t.open, t.stage, t.tracker, t.tasks != null ? `tasks ${t.tasks}` : null, t.verified_filter != null ? `verified filter ${t.verified_filter}, row ${t.row_verified}` : null].filter((x) => x != null).join(", ")).join(" / ");
    L.push(`| ${q.name} | \`${q.id}\` | ${q.ok ? "yes" : `**NO**: ${q.bad.join("; ")}`} | ${trail} | ${String(q.why).replace(/\|/g, "/")} |`);
  }
  L.push("", "### Real complaints", "", "Four complaints in the snapshot are linked to an incident. Two of them were moved to citizenB in the throwaway file, so the tracker could be read:", "", "| Incident | Step | HTTP | Tracker after |", "|---|---|---|---|");
  for (const r of j.realComplaints) L.push(`| \`${r.id}\` | ${r.step} | ${r.http} | ${r.end?.tracker ?? r.tracker} |`);
  const pOk = j.permissions.filter((p) => p.ok).length;
  L.push("", "## Who may act", "", `${pOk} of ${j.permissions.length} checks as designed.${pOk === j.permissions.length ? "" : " The rest are listed below."} An officer of another department, a citizen and no session were each refused every action, and the refused calls wrote no decision.`, "", "| Who | What | Got | Wanted | |", "|---|---|---|---|---|");
  for (const p of j.permissions) L.push(`| ${p.who} | ${p.what} | ${p.got} | ${p.want.join(" or ")} | ${p.ok ? "ok" : "**NO**"} |`);
  L.push("", "## The sum across surfaces, after all the actions", "");
  L.push(`The oracle is the console's figure before any decision plus what the raw rows and the decision table say changed. The raw rows differ from the console by a fixed number before any decision (${j.sums.build_offset.reported} reported, ${j.sums.build_offset.open} open): ${j.sums.build_offset.why}.`, "", "| Figure | Oracle | Surfaces | Agree |", "|---|---|---|---|");
  for (const r of j.sums.rows) L.push(`| ${r.figure} | ${r.oracle ?? ""} | ${r.values.map(([k, v]) => `${k}: ${v}`).join("; ")} | ${r.ok ? "yes" : "**NO**"}${r.note && !r.ok ? `: ${r.note}` : ""} |`);
  if (j.after_run) {
    const a = j.after_run;
    L.push("", "## How long the figures really lag, on a clock that runs as on production", "");
    L.push("On the matrix's server the pipeline's as_of (18:08) is later than the clock (12:00), so `asOf()` stands still and each memo lives its full time. So these checks ran on a second, clean server whose clock is later than as_of, so `asOf()` moves every 30 seconds as on production. Each row is one resolve, with the figure polled every few seconds up to 95. The console's own tile and list are the control.", "", "| Incident | Figure | Before | Seconds until it moved | Change |", "|---|---|---|---|---|");
    for (const r of a.lag) {
      for (const k of Object.keys(r.before)) L.push(`| \`${r.id}\` | ${k} | ${r.before[k]} | ${r.moved[k]?.seconds ?? "**did not move**"} | ${r.moved[k]?.delta ?? ""} |`);
    }
    L.push("", `**An officer's send on the action list (CSV).** The rows for \`${a.csv_twice.id}\` before the send: ${a.csv_twice.before.map((x) => `"${x}"`).join(", ") || "none"}. After it: ${a.csv_twice.after.map((x) => `"${x}"`).join(", ") || "none"}.`, "");
    L.push(`**Search rows after a resolve** (\`${a.search_rows.id}\`). The page says ${a.search_rows.page_status}, open ${a.search_rows.page_open}. The search_records tool, on its keyword lane (the live server's only lane here): ${JSON.stringify(a.search_rows.search_records)}. The search tool: ${JSON.stringify(a.search_rows.search_tool)}.`, "");
    L.push(`**Server log of the second server.** ${a.server_log.index_lines} lines about the search index; ${a.server_log.error_lines.length} error lines.`);
  }
  L.push("", "## OPEN-16: the two readers on the pipeline's flag", "");
  L.push("Both still do not move. These two are tested in `tests/qa/pass4/decision-matrix.test.ts`, on the real store, with a fake model and a fake embedding at the boundary, because the server has no model key and the embedding model file in this worktree is a 134-byte pointer. The index in that test lives in a scratch folder under `data/aws-cache/qa/srv/`.", "");
  L.push("- **Model-written queries** (`src/lib/assistant/compile.ts`). A plan with `is_open = 1` on one incident gives 1 before and 1 after a resolve, while the console says 0. A plan with `status_std = 'Resolved'` gives 0 after it. The whole path gives the same: a question, a fake agent step, a fake plan, the real compile, the real store and the real card, whose headline says 1. The catalog offers `is_open` as \"still open\" and marks `ops.collector_decisions` \"not for answers\", so a model has no right way to ask.", "- **The search index** (`src/lib/assistant/lance.ts`). No index exists in this worktree (`data/lancedb` holds no table), so the live server falls back to keywords, and that lane reads the pipeline's status too (DECISIONS-4). In a scratch folder, an index built from the real store by `syncLance`: after a resolve and a sync, an open-only search still returns the incident, with `open = 1` and its old status; after a reopen and a sync, an open-only search still misses it. `rows()` reads `is_open` and `status_std` and never the decisions, so a sync sees no change.", "");
  L.push("## Other claims checked", "");
  L.push("- \"The pipeline applies them on its next build\" (decisions route): in `district_intel` the decisions table is read only by `dintel/priority.py` (to learn the priority weights) and created by `dintel/mysql_export.py`. No code there changes an incident's status from a decision, so nothing later closes what a verify leaves open.", "");
  L.push("## Findings", "", "| Id | Severity | Title |", "|---|---|---|");
  for (const x of findings) L.push(`| ${x.id} | ${x.severity} | ${x.title} |`);
  L.push("", "## Limits", "");
  for (const n of j.meta.notes) L.push(`- ${n}`);
  L.push("- The Collector's AI brief (`/api/collector/brief`) needs a model: not read here. Its status field reads `i.status_std` beside the effective open flag (`src/lib/collector/aibrief.ts`), the same pattern as finding DECISIONS-10.", "- The assistant export is capped at 10 a day, so it was read for the first three actions that close or reopen; the other actions rely on the console export, which runs the same `exportRows`.", "- The Rain tabs read the pipeline's flag (`src/lib/rehearsal/source.ts`): they replay past rain, were not in this brief, and were not tested.", "- The officer's Insights modules on police and PWD records read the source records' own status (`events.status_std`). A decision is on an incident, not on a source record, so they were not expected to move and were not read.", "- A mistake in this job, now fixed: an earlier version of the permanent test wrote an index of fake vectors into the worktree's `data/lancedb`, because `tools.ts` had already loaded `lance.ts` with the real folder. It was there from 19:15 to 22:00 on 6 Nov. Servers of this worktree that ran then logged failed attempts to keep it in step (\"search index: embedding 300 of 27923\", \"search index sync failed\"). Questions still fell back to keywords, because `hybridSearch` returns null when the embedding model is not ready, but other agents' logs from that time hold those lines. The folder was deleted, the test now loads `lance.ts` in a scratch folder first, and a check in the test guards it.", `- The server log held ${j.server_errors?.embedding_model_lines ?? 0} lines about the embedding model not loading (${j.server_errors?.embedding_model_why}); lines about the search index: ${j.server_errors?.search_index_lines ?? 0}; other error lines: ${j.server_errors?.other?.length ?? 0}. Reads the machine reset and that were asked again: ${j.meta.connection_resets_asked_again ?? 0} (other test servers were running on this machine; the server logged no error for them).`);
  fs.writeFileSync(OUT.replace(/\.json$/, ".md"), L.join("\n") + "\n");
  log("wrote", OUT.replace(/\.json$/, ".md"));
}

/** Runs only the reachable flows on the server already up, and adds them to the evidence of the run just made. */
async function extra() {
  await signIn();
  const raw = pinnedTable("incidents");
  const j = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const load = (id, officer) => { const i = raw.find((x) => x.incident_id === id); if (!i) throw new Error(id); return { id, officer, dept: i.lead_dept, citizen: null, code: null }; };
  const flows = await reachableFlows(load);
  j.sequences = [...j.sequences.filter((s) => !flows.some((x) => x.name === s.name)), ...flows];
  fs.writeFileSync(OUT, JSON.stringify(j, null, 1));
}

/**
 * Checks on a second, clean server whose clock runs later than the pipeline's as_of, so asOf() moves as it does on production. How long the figures that lagged in
 * the full run really lag; an officer's send on the CSV; the search_records tool's keyword lane after a decision. Merged into the evidence of the full run.
 *   node tests/qa/pass4/server.mjs start --port 3121 --frozen 2026-11-06T13:00:00.000Z --ticking --instance decisions-after --env ASSISTANT_TOOLS_API=1 --env OFFICER_UPLOAD_DIR=data/aws-cache/qa/srv/decisions-after/uploads
 *   QA_DM_INSTANCE=decisions-after node tests/qa/pass4/decision-matrix.mjs --after
 */
async function afterRun() {
  await signIn();
  const raw = pinnedTable("incidents");
  const zoneNames = new Map(pinnedTable("ref_wards").map((w) => [Number(w.zone_no), w.zone_name]));
  const inc = (id) => { const i = raw.find((x) => x.incident_id === id); if (!i) throw new Error(id); return { id, dept: i.lead_dept, zone: Number(i.zone_no), zoneName: zoneNames.get(Number(i.zone_no)) }; };
  const col = session.collector;
  const db = new DatabaseSync(DURABLE);
  db.exec("PRAGMA busy_timeout = 8000");
  db.prepare("UPDATE users SET dept_code = ? WHERE id = ?").run(OFFICER_C_DEPT, acc.officerC.id);
  db.close();
  const scope = { scope: { period: PERIOD } };
  const tool = async (name, args) => (await col.post("/api/collector/assistant/tools", { tool: name, args })).data?.result?.data;

  // -- how long each figure lags a decision, in seconds, polled every 3 seconds up to 95
  const lag = [];
  for (const id of ["INC-20261103-1D9CB6", "INC-20261104-EA19E3", "INC-20261103-8989A6"]) {
    const i = inc(id);
    const other = (await col.get(`/api/collector/overview?period=${PERIOD}`)).data.zoneTable.find((z) => Number(z.zone) !== i.zone);
    const readers = {
      "console Ongoing tile": async () => Number((await col.get(`/api/collector/overview?period=${PERIOD}`)).data.kpi.cur.ongoing),
      "console open list": async () => (await col.get(`/api/collector/list?period=${PERIOD}&status=open`)).data.incidents,
      "Ask District IQ: overview_kpis tool": async () => Number((await tool("overview_kpis", scope))?.cur?.ongoing),
      "Ask District IQ: chat": async () => firstNumber((await chat("how many open incidents this week").catch(() => null))?.headline),
      "Jarvis: compare screen": async () => (await jarvis({ text: `compare ${i.zoneName} and ${other.name} this week` })).data.result?.stage?.blocks?.find((b) => b.kind === "Compare")?.sides?.find((x) => x.label === i.zoneName)?.values?.open ?? null,
      "Ask the Map": async () => (await col.post("/api/map/ask", { text: `open incidents in zone ${i.zone}`, context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } })).data.total,
      "console list, this department and zone": async () => (await col.get(`/api/collector/list?period=${PERIOD}&status=open&zone=${i.zone}&dept=${i.dept}`)).data.incidents,
      "console list's groups, this department and zone": async () => (await col.get(`/api/collector/list?period=${PERIOD}&status=open&zone=${i.zone}&dept=${i.dept}`)).data.total,
      "Jarvis: case list (counts groups), this department and zone": async () => (await jarvis({ text: "x", direct: { recipe: "cases", slots: { dept: i.dept, zones: [i.zone], status: "open", period: PERIOD, sort: "priority", n: 20, fresh: true }, lang: "en" } })).data.result?.stage?.blocks?.find((b) => b.kind === "CaseList")?.total ?? null
    };
    const before = {};
    for (const [k, read] of Object.entries(readers)) before[k] = await read();
    const r = await decide(id, "resolve");
    if (r.status !== 201) throw new Error(`resolve on ${id}: ${r.status}`);
    const t0 = Date.now();
    const moved = {};
    while (Object.keys(moved).length < Object.keys(readers).length && Date.now() - t0 < 95_000) {
      for (const [k, read] of Object.entries(readers)) {
        if (k in moved) continue;
        const v = await read();
        if (v != null && v !== before[k]) moved[k] = { seconds: Math.round((Date.now() - t0) / 1000), delta: v - before[k] };
      }
      await sleep(3000);
    }
    lag.push({ id, before, moved, not_moved: Object.keys(readers).filter((k) => !(k in moved)) });
    log("lag", id, JSON.stringify(moved));
  }

  // -- an officer's send: the same incident twice on the action list (CSV)
  const sendId = "INC-20261103-53934E-1", sendDept = inc(sendId).dept;
  const csv = async () => {
    const ex = (await col.withGrant((h) => col.get(`/api/collector/export?period=${PERIOD}&dept=${sendDept}`, { headers: h }))).data;
    return String(ex?.csv ?? "").split("\n").filter((l) => l.includes(sendId)).map((l) => l.split(",")[0].replace(/"/g, ""));
  };
  const csvBefore = await csv();
  const sent = await officerStep("officerC", sendId, "send");
  const csvAfter = await csv();
  log("csv", JSON.stringify({ csvBefore, http: sent.status, csvAfter }));

  // -- the search_records tool with no meaning index: the keyword lane, after a resolve
  const rid = "INC-20261103-1D9CB6";
  const pg = (await col.get(`/api/collector/incidents/${rid}`)).data.incident;
  const sr = await tool("search_records", { text: String(pg.loc).slice(0, 200), scope: { period: PERIOD, zone: inc(rid).zone, dept: inc(rid).dept } });
  const srRow = sr?.incidents?.find((x) => x.id === rid);
  const st = (await tool("search", { text: rid }))?.incidents?.find((x) => x.id === rid);
  const searchRows = { id: rid, page_status: pg.status, page_open: Number(pg.open), search_records: srRow ? { status: srRow.status, match: srRow.match } : null, search_tool: st ? { status: st.status, open: st.open } : null };
  log("search rows", JSON.stringify(searchRows));

  const logFile = path.join(APP_ROOT, "data", "aws-cache", "qa", "run", `srv-${PORT}.log`);
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split(/\r?\n/) : [];
  const j = JSON.parse(fs.readFileSync(OUT, "utf8"));
  j.after_run = { server: `--frozen 2026-11-06T13:00:00.000Z --ticking --instance ${INSTANCE}, clock later than the pipeline's as_of, so asOf() moves as on production; no index in data/lancedb`, lag,
    csv_twice: { id: sendId, before: csvBefore, http: sent.status, after: csvAfter }, search_rows: searchRows,
    server_log: { index_lines: lines.filter((l) => /search index/.test(l)).length, error_lines: lines.filter((l) => /⨯|\berror\b|Error:|failed/i.test(l)).map((l) => l.slice(0, 200)).slice(0, 20) } };
  fs.writeFileSync(OUT, JSON.stringify(j, null, 1));
}

if (process.argv.includes("--report")) writeReport();
else if (process.argv.includes("--after")) afterRun().then(writeReport).catch((e) => { console.error(e); process.exit(1); });
else if (process.argv.includes("--extra")) extra().then(writeReport).catch((e) => { console.error(e); process.exit(1); });
else main().then(writeReport).catch((e) => { console.error(e); process.exit(1); });
