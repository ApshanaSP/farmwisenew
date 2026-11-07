// QA pass 4: SAME NUMBER EVERYWHERE. For a spread of one scope (district, a zone, a department, a mix, four periods) reads the same figures from
// every surface through the real HTTP routes as the right role, and compares each against the independent oracle (tests/qa/oracle/pinned.mjs)
// and against the others. Every difference is reconciled row by row by id, or it is a finding.
//
//   node tests/qa/pass4/server.mjs start --port 3120 --frozen --ticking --env ASSISTANT_TOOLS_API=1
// (--ticking: with a clock that never moves, the per-minute rate limits never reset and every surface starts answering 429. The windows do not move: the store's
// as-of, 18:08 on 6 Nov, is later than the clock, which starts at 12:00, so the console's now stays 18:08 for six hours.)
//   node tests/qa/pass4/same-number.mjs --port 3120 [--scopes all|core|one] [--overlay] [--only more|chat|overlay] [--suffix x]     writes docs/qa/pass4/evidence/same-number[-x].raw.json
//
// No model is called: the server has no key, and the questions used are ones the code lanes answer. A surface that needs a model is listed as such.
// --overlay first runs the news-routing job and a few decisions on this server's own local copy (never saved), so that the routed and decided rows exist inside the windows.
// Use it only on a server just started: tools keep results for a while, keyed on the frozen now. No .env value, password or token is printed.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { accounts } from "../seed-local-users.mjs";
import { DEFS, HOURS, SEVERITIES, fmtWall, loadOracle, wallMs } from "../oracle/pinned.mjs";
import { loadTable } from "../oracle/load.mjs";
import { PIN_TABLES } from "../oracle/pinned.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..", "..", "..");
export const EVIDENCE_DIR = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence");
const WHEN = { daily: "today", weekly: "this week", monthly: "this month", quarterly: "this quarter" };
const LAST_DAYS = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 };

const P = ["daily", "weekly", "monthly", "quarterly"];
export const ALL_SCOPES = [
  ...P.map((period) => ({ period, zone: null, dept: null })),
  ...P.map((period) => ({ period, zone: 13, dept: null })),
  { period: "weekly", zone: 5, dept: null },
  ...P.map((period) => ({ period, zone: null, dept: "GCC-SWM" })),
  { period: "weekly", zone: null, dept: "GCC-ELE" }, { period: "monthly", zone: null, dept: "CMWSSB" }, { period: "daily", zone: null, dept: "POL-GCP" },
  { period: "weekly", zone: 13, dept: "GCC-SWM" }, { period: "monthly", zone: 13, dept: "GCC-SWM" }, { period: "monthly", zone: 9, dept: "CMWSSB" }
];
export const CORE_SCOPES = [{ period: "daily", zone: null, dept: null }, { period: "weekly", zone: null, dept: null }, { period: "weekly", zone: 13, dept: null },
  { period: "weekly", zone: null, dept: "GCC-SWM" }, { period: "weekly", zone: 13, dept: "GCC-SWM" }];
const OFFICER_OF = { "GCC-SWM": "officerA", "GCC-ELE": "officerB", CMWSSB: "officerC" };
const DEPT_WORDS = { "GCC-SWM": "solid waste management", "GCC-ELE": "street lighting and electrical", CMWSSB: "metro water", "POL-GCP": "greater chennai police" };
const ZONE_WORDS = { 13: "Adyar", 5: "Royapuram", 9: "Teynampet" };
export const scopeLabel = (s) => [s.period, s.zone ? `zone ${s.zone}` : null, s.dept ?? null].filter(Boolean).join(" · ") + (s.zone || s.dept ? "" : " · district");

// ----------------------------------------------------------------------- HTTP, one session per role, paced under each route's rate limit --

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A connection the machine reset is tried again (the machine is shared); an answer from the app, whatever its status, is never retried. */
async function fetchRetry(url, init, http) {
  for (let k = 0; ; k++) {
    try { return await fetch(url, init); }
    catch (e) { if (k >= 4) throw e; http.resets = (http.resets ?? 0) + 1; await sleep(1500 * (k + 1)); }
  }
}
export class Http {
  constructor(port) { this.base = `http://127.0.0.1:${port}`; this.acc = Object.fromEntries(accounts().map((a) => [a.key, a])); this.cookies = {}; this.last = {}; this.calls = []; }
  async cookie(who) {
    if (this.cookies[who]) return this.cookies[who];
    const a = this.acc[who];
    const r = await fetchRetry(`${this.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) }, this);
    if (!r.ok) throw new Error(`sign-in failed for ${who}: HTTP ${r.status}`);
    return (this.cookies[who] = r.headers.getSetCookie().map((x) => x.split(";")[0]).join("; "));
  }
  async pace(key, ms) { const w = (this.last[key] ?? 0) + ms - Date.now(); if (w > 0) await sleep(w); this.last[key] = Date.now(); }
  async req(who, method, url, body, headers = {}, pace = null) {
    if (pace) await this.pace(pace[0], pace[1]);
    const cookie = await this.cookie(who);
    const t0 = Date.now();
    const r = await fetchRetry(this.base + url, { method, headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }, this);
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* text */ }
    this.calls.push({ who, method, url: url.split("?")[0], status: r.status, ms: Date.now() - t0 });
    return { status: r.status, json, text, headers: r.headers };
  }
  get(who, url, headers, pace) { return this.req(who, "GET", url, undefined, headers, pace); }
  post(who, url, body, headers, pace) { return this.req(who, "POST", url, body, headers, pace); }
  /** the confirm box: the account's own password, in code; returns a grant for this action on this exact scope hash */
  async grant(who, scope, action = "export") {
    const r = await this.post(who, "/api/auth/confirm", { step: "check", action, scope, summary: "", method: "password", code: this.acc[who].password });
    return r.json?.grant ?? null;
  }
}

const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const asNum = (v) => { if (typeof v === "number") return v; const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const parseCsv = (text) => {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries((h ?? []).map((k, i) => [k.replace(/^﻿/, ""), r[i]])));
};

// ------------------------------------------------------------------- one reading --

export class Book {
  constructor(o) { this.o = o; this.readings = []; this.notes = []; this.idChecks = []; this.lines = []; this.unavailable = []; }
  /** A figure read from a surface, for the scope, and what the oracle says. def: a name in DEFS; over: changes to the scope; filter: rows; custom: () => { value, ids }. */
  add(scope, surface, figure, value, def, opt = {}) {
    const s = { ...scope, ...(opt.over ?? {}) };
    let exp, raw = null, ids = null;
    if (opt.custom) { const c = opt.custom(); exp = c.value; ids = c.ids ?? null; raw = c.raw ?? null; }
    // RC-29 (lane d): "resolved" in a window is closed in the window, by its closing time, on every surface
    else if (def === "resolved" && !opt.filter) { const done = this.o.resolvedByClose(s); exp = done.length; raw = exp; ids = done.map((r) => r.id); }
    else {
      const f = opt.filter ?? (() => true);
      const a = this.o.apply(def, this.o.rows(s).filter(f)), b = this.o.apply(def, this.o.rows(s, "raw").filter(f));
      exp = a.value; raw = b.value; ids = a.ids;
    }
    const v = value == null ? null : Number(value);
    const entry = { scope: scopeLabel(scope), surface, figure, def, label: opt.label ?? DEFS[def]?.label ?? def, value: v, oracle: exp, oracle_raw: raw, diff: v == null ? null : v - exp, role: opt.role ?? "collector",
      ...(opt.over ? { over: opt.over } : {}), ...(opt.note ? { note: opt.note } : {}), ...(opt.xfail ? { known: opt.xfail } : {}) };
    if (v == null) entry.missing = true;
    this.readings.push(entry);
    if (v != null && v !== exp && ids) entry.oracle_ids_sample = ids.slice(0, 12);
    return entry;
  }
  /** The ids a surface actually returned, against the oracle's ids for the same thing. */
  ids(scope, surface, figure, got, def, opt = {}) {
    const s = { ...scope, ...(opt.over ?? {}) };
    const want = new Set(this.o.apply(def, this.o.rows(s).filter(opt.filter ?? (() => true))).ids), have = new Set(got);
    const onlyApp = [...have].filter((x) => !want.has(x)), onlyOracle = [...want].filter((x) => !have.has(x));
    this.idChecks.push({ scope: scopeLabel(scope), surface, figure, def, app: have.size, oracle: want.size, only_in_app: onlyApp.slice(0, 40), only_in_oracle: onlyOracle.slice(0, 40), ok: !onlyApp.length && !onlyOracle.length, ...(opt.note ? { note: opt.note } : {}) });
  }
  line(scope, surface, asked, say, extra = {}) { this.lines.push({ scope: scopeLabel(scope), surface, asked, say, ...extra }); }
}

// ------------------------------------------------------------------- what each difference is --

/** Every kind of difference seen, first match wins: [surface, figure, class, finding id or null, why in words]. A difference not listed here is UNEXPLAINED. */
export const KNOWN = [
  [/^(collector\/insights\?part=briefing|thunai\/round:brief)$/, /^(stats|kpi)\.newsOnly$/, "by-design", "RC-29", "The Briefing hides headlines about another district (newsrel.elsewhere) once, up front, so its line, its list and its figure are one number; the oracle counts every news-only incident that is not lapsed."],
  [/^thunai\/round:dashboard$/, /first row's severity rank/, "bug", "same-number-1", "Jarvis asks the list for severity order with the default direction, which puts Low first; the block is headed 'most serious first'."],
  [/^thunai\/round:advise$/, /severity rank/, "bug", "same-number-1", "The same list order: 'First: ...' comes from the page of the least serious cases."],
  [/^thunai\/round:cases\(overdue\)$/, /^total$/, "bug", "same-number-1", "The past-deadline list filters only the first page of 12, and that page is the least serious cases, so it finds none and says there are none."],
  [/^thunai\/round:text$/, /past deadline/, "bug", "same-number-1", "The same list, reached by words."],
  [/^thunai\/round:cases\(open\)$/, /^kpi\.late$/, "bug", "same-number-2", "'Past their deadline' is counted over the 12 rows on screen, beside a total for the whole list."],
  [/^thunai\/round:cases\(severe\)$/, /^kpi\.(late|held by)/, "bug", "same-number-2", "'Past their deadline' and 'Held by' are counted over the rows on screen, beside a total for the whole list."],
  [/^thunai\/round:performance$/, /^kpi\.(open|overdue)$/, "bug", "same-number-3", "Department performance adds up every department even when one department is chosen."],
  [/^thunai\/round:compare\(depts\)$/, /\.overdue$/, "bug", "same-number-3", "Comparing two departments while one is chosen: the follow-ups tool takes the filter, so the other department reads 0 past deadline."],
  [/^assistant\/tools:zone_profile$/, /\.(active|complaints)$/, "bug", "same-number-4", "With a department chosen the overview's snapshot is of the department kind, so the zone's open and complaint facts come out empty and read 0."],
  [/^collector\/insights\?part=briefing$/, /handledByDepts/, "bug", "same-number-6", "The Briefing calls every open incident routine except the 6 it shows; the PDF and CSV count all that meet the same rule."],
  [/^collector\/insights\?part=briefing$/, /^md\.In the news|^gaps\.rows on the page|^stats\.newsOnly against/, "bug", "same-number-8", "The written line says the length of a list cut at 60; the list drops more; the page's figure also counts lapsed rows."],
  [/trends$/, /\.bar\[.*against the whole week/, "bug", "same-number-10", "The bars are called complete weeks, but the query window is a rolling 84 days, so the first bar holds only the end of its week."],
  [/^assistant\/tools:category_trends$/, /first of the "12 complete weeks"/, "bug", "same-number-10", "The same first bar, through Ask District IQ's tool."],
  [/^assistant\/tools:category_trends$/, /last 12 weeks/, "definition", null, "The 'last 12 weeks' fact is the rolling 84 days and the bars are calendar weeks, so they differ by the rows after the last bar and before the first. Reconciled in same-number.md."],
  [/^collector\/insights\?part=trends$/, /against its own bars/, "definition", null, "A line's total is the rolling window (84 or 180 days) and its bars are calendar weeks or months. The total is not drawn on the Trends page; only Ask District IQ's facts carry it. Reconciled in same-number.md."],
  [/^thunai\/round:performance\(zone\)$/, /^kpi\./, "bug", "same-number-11", "Zone performance adds up the 15 zones under the labels 'Reported' and 'Open', so the rows with no zone drop out, beside a trend on the same screen that has them."],
  [/^assistant\/chat:card label$/, /tile 'Reported'/, "bug", "same-number-13", "The card's tile says 'Reported' but holds the count asked about (open, or past deadline)."],
  [/^assistant\/chat:list$/, /Incidents matching/, "bug", "same-number-9", "The list's total counts one row per group of the same problem; the card calls it incidents, and the console's own list has a separate incidents figure for this."]
];
export const classify = (r) => {
  for (const [sf, fg, cls, finding, why] of KNOWN) if (sf.test(r.surface) && fg.test(r.figure)) return { class: cls, finding, why };
  return { class: "UNEXPLAINED", finding: null, why: "nothing explains this difference yet" };
};

// ------------------------------------------------------------------- the surfaces --

const LABEL = (l) => ({ label: l });

async function readConsole(h, b, s) {
  const o = b.o, sv = "collector/overview";
  const r = await h.get("collector", `/api/collector/overview?${qs({ period: s.period, zone: s.zone, dept: s.dept })}`);
  if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: r.status }); return null; }
  const d = r.json;
  const kpi = [["reported", "reported", "reported"], ["severe", "severe", "severe"], ["complaints", "complaints_open", "complaints"], ["ongoing", "ongoing", "still open"], ["resolved", "resolved", "resolved"],
    ["severe_open", "severe_open", "severe"], ["complaint_inc", "complaint_inc", "complaints"], ["urgent", "urgent", "serious"]];
  for (const [k, def, label] of kpi) {
    b.add(s, sv, `kpi.cur.${k}`, d.kpi.cur[k], def, LABEL(label));
    b.add(s, sv, `kpi.prev.${k}`, d.kpi.prev[k], def, { over: { offset: 1 }, label: `${label} (period before)` });
    b.add(s, sv, `kpi.series.${k}.sum`, (d.kpi.series[k] ?? []).reduce((a, x) => a + x, 0), def, LABEL(label));
  }
  b.add(s, sv, "map.total", d.map.total, "reported", LABEL("reported"));
  b.add(s, sv, "map.unlocated", d.map.unlocated, "unlocated");
  b.add(s, sv, "map.layers+unlocated", d.map.layerCounts.severe + d.map.layerCounts.complaint + d.map.layerCounts.other + d.map.unlocated, "reported", LABEL("reported"));
  b.add(s, sv, "map.layerCounts.severe", d.map.layerCounts.severe, "pinnable", { filter: (x) => x.sev === "Severe" });
  const snap = d.snapshot;
  b.add(s, sv, "snapshot.serious", snap.serious, "serious_open", LABEL("serious"));
  b.add(s, sv, "snapshot.overdue", snap.overdue, "overdue", LABEL("past deadline"));
  b.add(s, sv, "snapshot.newsOnly", snap.newsOnly, "news_only_open", LABEL("news only"));
  if (snap.kind === "dept") { b.add(s, sv, "snapshot.open", snap.open, "open", LABEL("still open")); b.add(s, sv, "snapshot.verified", snap.verified, "verified_open"); b.add(s, sv, "snapshot.severe", snap.severe, "severe", LABEL("severe")); }
  if (snap.kind === "area") { b.add(s, sv, "snapshot.active", snap.active, "open", LABEL("still open")); b.add(s, sv, "snapshot.complaints", snap.complaints, "complaints_open", LABEL("complaints")); b.add(s, sv, "snapshot.severe", snap.severe, "severe", LABEL("severe")); }
  for (const m of d.severityMix) {
    b.add(s, sv, `severityMix.${m.sev}.n`, m.n, "reported", { filter: (x) => x.sev === m.sev, label: m.sev === "Severe" ? "severe" : undefined });
    b.add(s, sv, `severityMix.${m.sev}.open`, m.open, "open", { filter: (x) => x.sev === m.sev, label: m.sev === "Severe" ? "severe" : undefined });
  }
  const groups = o.severityGroups(s);
  for (const k of SEVERITIES) b.add(s, sv, `severity.counts.${k}`, d.severity.counts[k], "groups", { custom: () => ({ value: groups[k] }), label: k === "Severe" ? "severe" : `${k} (groups)` });
  for (const z of d.zoneTable) {
    const over = { zone: z.zone };
    b.add(s, sv, `zoneTable.${z.zone}.n`, z.n, "reported", { over });
    b.add(s, sv, `zoneTable.${z.zone}.open`, z.open, "open", { over });
    b.add(s, sv, `zoneTable.${z.zone}.complaints`, z.complaints, "complaints_open", { over });
    b.add(s, sv, `zoneTable.${z.zone}.severe`, z.severe, "severe", { over });
  }
  const none = { zone: "none" };
  b.add(s, sv, "zoneUnassigned.n", d.zoneUnassigned.n, "reported", { over: none });
  b.add(s, sv, "zoneUnassigned.open", d.zoneUnassigned.open, "open", { over: none });
  b.add(s, sv, "zoneTable+unassigned.n", d.zoneTable.reduce((a, z) => a + z.n, 0) + d.zoneUnassigned.n, "reported", { over: { zone: null }, label: "reported" });
  for (const x of d.deptNav) {
    const over = { dept: x.code };
    b.add(s, sv, `deptNav.${x.code}.n`, x.n, "reported", { over });
    b.add(s, sv, `deptNav.${x.code}.open`, x.open, "open", { over });
    b.add(s, sv, `deptNav.${x.code}.severe`, x.severe, "severe", { over });
    b.add(s, sv, `deptNav.${x.code}.unverified`, x.unverified, "awaiting_flag", { over });
  }
  if (s.dept) for (const x of d.bottom.byDept) b.add(s, sv, `bottom.byCategory.${x.l}`, x.v, "reported", { filter: (r) => r.catLabel === x.l });
  else for (const x of d.bottom.byDept) if (x.code) b.add(s, sv, `bottom.byDept.${x.code}.complaints`, x.v, "complaints_all", { over: { dept: x.code } });
  if (!s.zone) for (const x of d.bottom.byZone) { b.add(s, sv, `bottom.byZone.${x.zone}.n`, x.n, "open", { over: { zone: x.zone } }); b.add(s, sv, `bottom.byZone.${x.zone}.v`, x.v, "complaints_open", { over: { zone: x.zone } }); }
  for (const [z, n] of Object.entries(d.map.zoneCounts ?? {})) b.add(s, sv, `map.zoneCounts.${z}`, n, "reported", { over: { zone: Number(z) } });
  if (d.backlog) { const bl = o.backlog(s.zone).get(d.backlog.code); b.add(s, sv, `backlog.${d.backlog.code}.n`, d.backlog.n, "custom", { custom: () => ({ value: bl?.n ?? 0, ids: bl?.ids }), label: "open at any date", note: "the card has no period" }); }
  if (snap.kind === "district") {
    const cr = o.critical();
    b.add(s, sv, "snapshot.critical", snap.critical, "custom", { custom: () => ({ value: cr.length, ids: cr.map((r) => r.id) }), label: "severe needing a check (no period)" });
    const openHere = o.rows(s).filter((x) => x.open);
    b.add(s, sv, "snapshot.activeDepts", snap.activeDepts, "custom", { custom: () => ({ value: new Set(openHere.map((x) => x.dept).filter(Boolean)).size }), label: "departments with open work" });
  }
  const aw = o.awaitingCheck(s);
  b.add(s, sv, "tasks.count", d.tasks.count, "groups", { custom: () => ({ value: aw.n, ids: aw.nIds }), label: "waiting for your check" });
  b.add(s, sv, "tasks.leftToDepts", d.tasks.leftToDepts, "groups", { custom: () => ({ value: aw.left, ids: aw.leftIds }), label: "left to departments" });
  return d;
}

async function readList(h, b, s) {
  const sv = "collector/list";
  const base = { period: s.period, zone: s.zone, dept: s.dept };
  const pick = (r) => r.json ?? {};
  const a = pick(await h.get("collector", `/api/collector/list?${qs(base)}`));
  b.add(s, sv, "all.incidents", a.incidents, "reported", LABEL("reported"));
  b.add(s, sv, "all.complaints", a.complaints, "complaints_all", LABEL("complaints"));
  b.add(s, sv, "all.total(groups)", a.total, "groups", { custom: () => ({ value: b.o.groups("reported", s) }), label: "reported (groups)" });
  const op = pick(await h.get("collector", `/api/collector/list?${qs({ ...base, status: "open" })}`));
  b.add(s, sv, "open.incidents", op.incidents, "ongoing", LABEL("still open"));
  b.add(s, sv, "open.complaints", op.complaints, "complaints_ongoing", LABEL("complaints"));
  b.add(s, sv, "open.total(groups)", op.total, "groups", { custom: () => ({ value: b.o.groups("ongoing", s) }), label: "still open (groups)" });
  const ov = pick(await h.get("collector", `/api/collector/list?${qs({ ...base, status: "overdue" })}`));
  b.add(s, sv, "overdue.incidents", ov.incidents, "overdue", LABEL("past deadline"));
  const sv2 = pick(await h.get("collector", `/api/collector/list?${qs({ ...base, sev: "Severe" })}`));
  b.add(s, sv, "severe.incidents", sv2.incidents, "severe", LABEL("severe"));
  const rs = pick(await h.get("collector", `/api/collector/list?${qs({ ...base, status: "Resolved" })}`));
  b.add(s, sv, "Resolved.incidents", rs.incidents, "resolved", LABEL("resolved"));
}

async function readBriefing(h, b, s) {
  const o = b.o, sv = "collector/insights?part=briefing";
  const r = await h.get("collector", `/api/collector/insights?${qs({ period: s.period, zone: s.zone, dept: s.dept, part: "briefing" })}`);
  if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: r.status }); return null; }
  const d = r.json, st = d.briefing.stats;
  b.add(s, sv, "stats.reported", st.reported, "reported", LABEL("reported"));
  b.add(s, sv, "stats.open", st.open, "open", LABEL("still open"));
  b.add(s, sv, "stats.overdue", st.overdue, "overdue_flag", LABEL("past deadline"));
  b.add(s, sv, "stats.severe", st.severe, "severe", LABEL("severe"));
  b.add(s, sv, "stats.multi", st.multi, "multi");
  b.add(s, sv, "stats.newsOnly", st.newsOnly, "news_only", LABEL("news only"));
  // the headline sentences say the same figures in words
  const said = d.briefing.headline.join(" ").replace(/,(?=\d)/g, "");
  const m1 = said.match(/(\d+) incidents? (?:was|were) reported/), m2 = said.match(/(\d+) incidents? (?:is|are) still open(?:, (\d+) of them past the deadline)?; (\d+) severe events?/);
  if (m1) b.add(s, sv, "headline.reported", Number(m1[1]), "reported", LABEL("reported"));
  if (m2) { b.add(s, sv, "headline.open", Number(m2[1]), "open", LABEL("still open")); b.add(s, sv, "headline.overdue", Number(m2[2] ?? 0), "overdue_flag", LABEL("past deadline")); b.add(s, sv, "headline.severe", Number(m2[3]), "severe", LABEL("severe")); }
  // "only in the news": the page's figure, its written line and its list, against the rows
  const notLapsed = o.rows(s).filter((x) => x.mediaOnly && x.status !== "Lapsed");
  const nl = () => ({ value: notLapsed.length, ids: notLapsed.map((x) => x.id) });
  const mdNews = String(d.briefing.md ?? "").replace(/,(?=\d)/g, "").match(/In the news, not in department records\n- (\d+) incidents?/);
  if (mdNews) b.add(s, sv, "md.In the news, not in department records", Number(mdNews[1]), "custom", { custom: nl, label: "only in the news, not lapsed" });
  b.add(s, sv, "gaps.rows on the page", d.gaps.length, "custom", { custom: nl, label: "only in the news, not lapsed" });
  b.add(s, sv, "stats.newsOnly against the same rows", st.newsOnly, "custom", { custom: nl, label: "only in the news, not lapsed" });
  for (const x of d.deptActions) {
    const over = { dept: x.code };
    b.add(s, sv, `deptActions.${x.code}.open`, x.open, "open", { over });
    b.add(s, sv, `deptActions.${x.code}.overdue`, x.overdue, "overdue_flag", { over });
    b.add(s, sv, `deptActions.${x.code}.serious`, x.serious, "serious_open", { over });
    b.add(s, sv, `deptActions.${x.code}.complaints`, x.complaints, "complaints_open", { over });
    b.add(s, sv, `deptActions.${x.code}.awaiting`, x.awaiting, "awaiting_flag", { over });
  }
  const t = d.book?.glance?.tiles;
  if (t) {
    b.add(s, sv, "book.tiles.reported", t.reported, "reported", LABEL("reported"));
    b.add(s, sv, "book.tiles.severe", t.severe, "severe", LABEL("severe"));
    b.add(s, sv, "book.tiles.deaths", t.deaths, "deaths");
    b.add(s, sv, "book.tiles.injured", t.injured, "injured");
    b.add(s, sv, "book.tiles.newsOnly", t.newsOnly, "news_only", LABEL("news only"));
    const aw = o.awaitingCheck(s);
    b.add(s, sv, "book.tiles.awaiting", t.awaiting, "groups", { custom: () => ({ value: aw.n, ids: aw.nIds }), label: "waiting for your check" });
    b.add(s, sv, "book.tiles.leftToDepts", t.leftToDepts, "groups", { custom: () => ({ value: aw.left, ids: aw.leftIds }), label: "left to departments" });
    for (const x of d.book.departments) {
      const over = { dept: x.code };
      b.add(s, sv, `book.departments.${x.code}.n`, x.n, "reported", { over });
      b.add(s, sv, `book.departments.${x.code}.severe`, x.severe, "severe", { over });
      b.add(s, sv, `book.departments.${x.code}.dead`, x.dead, "deaths", { over });
    }
    for (const x of d.book.where) { b.add(s, sv, `book.where.${x.zone}.n`, x.n, "reported", { over: { zone: x.zone } }); b.add(s, sv, `book.where.${x.zone}.severe`, x.severe, "severe", { over: { zone: x.zone } }); }
    for (const x of d.book.citizens.kinds) b.add(s, sv, `book.citizens.${x.label}`, x.n, "complaints_all", { filter: (r) => r.catLabel === x.label });
    const lo = o.nowMs - HOURS[s.period] * 3600_000;
    const res = o.rows({ ...s, hours: 100000 }).filter((r) => !r.open && r.effStatus === "Resolved" && r.closed != null && r.closed > lo); // with decisions on top; no upper bound (a decision made since the refresh counts)
    b.add(s, sv, "book.good.resolved", d.book.good.resolved, "custom", { custom: () => ({ value: res.length, ids: res.map((r) => r.id) }), label: "resolved (by closing time)" });
  }
  return d;
}

async function readTrends(h, b, s) {
  const o = b.o, sv = "collector/insights?part=trends";
  const r = await h.get("collector", `/api/collector/insights?${qs({ period: s.period, zone: s.zone, dept: s.dept, part: "trends" })}`);
  if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: r.status }); return null; }
  const d = r.json;
  const monday = (t) => { const x = new Date(t); const day = (x.getUTCDay() + 6) % 7; return fmtWall(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - day * 864e5).slice(0, 10); };
  const month = (t) => fmtWall(t).slice(0, 7);
  const check = (name, data, hours, keyOf) => {
    // RC-29 (lane d): the Trends buckets are whole buckets: the 12 complete weeks (Monday to Monday) and the 6 calendar months up to now,
    // not a rolling window that cuts the oldest of each
    const rows = name === "weekly"
      ? o.inStretch(`${data.keys[0]} 00:00:00`, fmtWall(wallMs(`${data.keys[data.keys.length - 1]} 00:00:00`) + 7 * 864e5), s)
      : o.inStretch(`${data.keys[0]}-01 00:00:00`, fmtWall(o.nowMs + 1000), s);
    const listed = new Set(data.lines.map((l) => l.cat));
    let bad = 0, cells = 0; const wrong = [];
    for (const l of data.lines) {
      data.keys.forEach((k, j) => {
        const want = rows.filter((x) => keyOf(x.t) === k && (l.cat === "OTHERS" ? !listed.has(x.cat) : x.cat === l.cat)).length;
        cells++;
        if (want !== l.values[j]) { bad++; if (wrong.length < 12) wrong.push({ cat: l.cat, key: k, app: l.values[j], oracle: want }); }
      });
      const shown = l.values.reduce((a, x) => a + x, 0);
      b.add(s, sv, `trends.${name}.${l.cat}.total against its own bars`, l.total, "custom", { custom: () => ({ value: shown }), label: `trend ${name} total`, note: l.cat === "OTHERS" ? "OTHERS adds up only the bars" : "the other lines add up the whole rolling window, with the weeks or months not shown" });
    }
    b.add(s, sv, `trends.${name}.cells_wrong(of ${cells})`, bad, "custom", { custom: () => ({ value: 0 }), label: "trend cells that disagree", note: wrong.length ? JSON.stringify(wrong) : undefined });
    data.keys.forEach((k, j) => {
      const want = rows.filter((x) => keyOf(x.t) === k).length;
      b.add(s, sv, `trends.${name}.total[${k}]`, data.lines.reduce((a, l) => a + l.values[j], 0), "custom", { custom: () => ({ value: want }), label: `trend ${name} bucket total` });
    });
  };
  check("weekly", d.trends.weekly, 84 * 24, monday);
  // the weeks are called complete (category_trends says "the last 12 complete weeks"): each bar against the whole calendar week, not a rolling window
  d.trends.weekly.keys.forEach((k, j) => {
    const from = `${k} 00:00:00`, to = fmtWall(wallMs(from) + 7 * 864e5);
    const whole = o.inStretch(from, to, s);
    b.add(s, sv, `trends.weekly.bar[${k}] against the whole week`, d.trends.weekly.lines.reduce((a, l) => a + l.values[j], 0), "custom", { custom: () => ({ value: whole.length, ids: whole.map((r) => r.id) }), label: "trend weekly bar, whole week" });
  });
  check("monthly", d.trends.monthly, 180 * 24, month);
  const inDistrict = new Set(loadTable("ref_taluks", PIN_TABLES).objects().filter((t) => Number(t.in_district) === 1).map((t) => t.taluk_code));
  for (const t of d.taluks) {
    const over = { hours: 720, taluk: t.code };
    b.add(s, sv, `taluks.${t.code}.reported`, t.reported, "reported", { over });
    b.add(s, sv, `taluks.${t.code}.open`, t.open, "open", { over });
    b.add(s, sv, `taluks.${t.code}.severe`, t.severe, "severe_open", { over });
    b.add(s, sv, `taluks.${t.code}.overdue`, t.overdue, "overdue_flag", { over });
    b.add(s, sv, `taluks.${t.code}.prev`, t.prev, "reported", { over: { ...over, offset: 1 } });
  }
  const notIn = (x) => !x.taluk || !inDistrict.has(x.taluk);
  b.add(s, sv, "talukUnassigned.reported", d.talukUnassigned.reported, "reported", { over: { hours: 720 }, filter: notIn });
  b.add(s, sv, "talukUnassigned.open", d.talukUnassigned.open, "open", { over: { hours: 720 }, filter: notIn });
  return d;
}

/** Ask District IQ's tools, run directly through the developer route (ASSISTANT_TOOLS_API=1). */
async function readTools(h, b, s) {
  const sv = "assistant/tools";
  const scope = { period: s.period, zone: s.zone, dept: s.dept };
  const tool = async (name, args = {}) => {
    const r = await h.post("collector", "/api/collector/assistant/tools", { tool: name, args: { scope, ...args } }, {}, ["tools", 520]);
    if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: `${sv}:${name}`, status: r.status, error: r.json?.error }); return null; }
    return r.json.result;
  };
  const k = await tool("overview_kpis");
  if (k) for (const [f, def, label] of [["reported", "reported", "reported"], ["severe", "severe", "severe"], ["complaints", "complaints_open", "complaints"], ["ongoing", "ongoing", "still open"], ["resolved", "resolved", "resolved"], ["severe_open", "severe_open", "severe"]])
    b.add(s, `${sv}:overview_kpis`, `cur.${f}`, k.data.cur[f], def, LABEL(label));
  const z = await tool("zones");
  if (z) for (const x of z.data.rows) {
    b.add(s, `${sv}:zones`, `${x.zone}.n`, x.n, "reported", { over: { zone: x.zone } });
    b.add(s, `${sv}:zones`, `${x.zone}.open`, x.open, "open", { over: { zone: x.zone } });
    b.add(s, `${sv}:zones`, `${x.zone}.severe`, x.severe, "severe", { over: { zone: x.zone } });
    b.add(s, `${sv}:zones`, `${x.zone}.high`, x.high, "high", { over: { zone: x.zone } });
    b.add(s, `${sv}:zones`, `${x.zone}.complaints`, x.complaints, "complaints_open", { over: { zone: x.zone } });
  }
  const de = await tool("departments");
  if (de) for (const x of de.data.rows) { b.add(s, `${sv}:departments`, `${x.code}.open`, x.open, "open", { over: { dept: x.code } }); b.add(s, `${sv}:departments`, `${x.code}.n`, x.n, "reported", { over: { dept: x.code } }); }
  const se = await tool("severity");
  if (se) {
    const g = b.o.severityGroups(s);
    for (const lvl of SEVERITIES) b.add(s, `${sv}:severity`, `open.${lvl}`, se.data.open[lvl], "groups", { custom: () => ({ value: g[lvl] }), label: lvl === "Severe" ? "severe" : `${lvl} (groups)` });
    for (const m of se.data.mix) { b.add(s, `${sv}:severity`, `mix.${m.sev}.n`, m.n, "reported", { filter: (x) => x.sev === m.sev, label: m.sev === "Severe" ? "severe" : undefined }); }
  }
  const br = await tool("briefing");
  if (br) {
    const st = br.data.stats;
    b.add(s, `${sv}:briefing`, "stats.reported", st.reported, "reported", LABEL("reported"));
    b.add(s, `${sv}:briefing`, "stats.open", st.open, "open", LABEL("still open"));
    b.add(s, `${sv}:briefing`, "stats.overdue", st.overdue, "overdue_flag", LABEL("past deadline"));
    b.add(s, `${sv}:briefing`, "stats.severe", st.severe, "severe", LABEL("severe"));
  }
  const fu = await tool("dept_followups");
  if (fu) for (const x of fu.data.rows) { b.add(s, `${sv}:dept_followups`, `${x.code}.open`, x.open, "open", { over: { dept: x.code } }); b.add(s, `${sv}:dept_followups`, `${x.code}.overdue`, x.overdue, "overdue_flag", { over: { dept: x.code } }); }
  const li = await tool("incidents", { status: "open" });
  if (li) { b.add(s, `${sv}:incidents`, "open.total(groups)", li.data.total, "groups", { custom: () => ({ value: b.o.groups("ongoing", s) }), label: "still open (groups)" }); b.add(s, `${sv}:incidents`, "open.complaints", li.data.complaints, "complaints_ongoing", LABEL("complaints")); }
  if (s.zone) {
    const zp = await tool("zone_profile", { zone: s.zone });
    if (zp) for (const f of zp.facts) {
      const m = f.id.match(/^zone\.\d+\.(n|severe|high|active|complaints)$/);
      if (m) b.add(s, `${sv}:zone_profile`, f.id, f.value, { n: "reported", severe: "severe", high: "high", active: "open", complaints: "complaints_open" }[m[1]], LABEL({ n: "reported", severe: "severe", active: "still open", complaints: "complaints" }[m[1]]));
    }
  }
}

/** The other tools with figures: each against the oracle, on the same real route. */
async function readToolsMore(h, b, s) {
  const o = b.o, sv = "assistant/tools";
  const scope = { period: s.period, zone: s.zone, dept: s.dept };
  const tool = async (name, args = {}) => {
    const r = await h.post("collector", "/api/collector/assistant/tools", { tool: name, args: { scope, ...args } }, {}, ["tools", 520]);
    if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: `${sv}:${name}`, status: r.status, error: r.json?.error }); return null; }
    return r.json.result;
  };
  const bl = await tool("dept_backlog");
  if (bl) {
    const want = o.backlog(s.zone);
    b.add(s, `${sv}:dept_backlog`, "departments listed", bl.data.rows.length, "custom", { custom: () => ({ value: want.size }), label: "departments with 5+ open" });
    for (const x of bl.data.rows) {
      const w = want.get(x.code), upToNow = o.openAnyDate({ zone: s.zone, dept: x.code, upToNow: true });
      b.add(s, `${sv}:dept_backlog`, `${x.code}.n`, x.n, "custom", { custom: () => ({ value: w?.n ?? 0, ids: w?.ids }), label: "open at any date" });
      b.add(s, `${sv}:dept_backlog`, `${x.code}.overdue`, x.overdue, "custom", { custom: () => ({ value: w?.overdue ?? 0 }), label: "open past deadline, any date" });
      if (w && w.n !== upToNow.length) b.notes.push({ scope: scopeLabel(s), surface: `${sv}:dept_backlog`, kind: "dated-after-now", dept: x.code, backlog: x.n, up_to_now: upToNow.length, ids: w.ids.filter((id) => !upToNow.some((r) => r.id === id)) });
    }
  }
  const ng = await tool("news_gaps");
  if (ng) {
    const per = s.period === "daily" ? "weekly" : s.period;
    const rows = o.rows({ ...s, period: per }).filter((x) => x.mediaOnly && x.status !== "Lapsed");
    b.add(s, `${sv}:news_gaps`, "count", ng.data.count, "custom", { custom: () => ({ value: rows.length, ids: rows.map((r) => r.id) }), label: "only in the news, not lapsed (at least 7 days)" });
  }
  const tr = await tool("category_trends");
  if (tr) {
    const keys = tr.data.weekly.keys;
    for (const l of tr.data.weekly.lines) {
      const bars = l.values.reduce((a, x) => a + x, 0);
      const fact = tr.facts.find((x) => x.id === `trend.week.${l.cat}.total`);
      if (fact) b.add(s, `${sv}:category_trends`, `fact "${l.label}, last 12 weeks" against its 12 bars`, fact.value, "custom", { custom: () => ({ value: bars }), label: "trend, last 12 weeks" });
    }
    const from = `${keys[0]} 00:00:00`, to = fmtWall(wallMs(from) + 7 * 864e5), whole = o.inStretch(from, to, s);
    b.add(s, `${sv}:category_trends`, `first of the "12 complete weeks" (${keys[0]}) against that whole week`, tr.data.weekly.lines.reduce((a, l) => a + l.values[0], 0), "custom", { custom: () => ({ value: whole.length }), label: "trend weekly bar, whole week" });
  }
  const ta = await tool("taluks");
  if (ta) for (const t of (ta.data.rows ?? [])) {
    const over = { hours: 720, taluk: t.code };
    if (t.open != null) b.add(s, `${sv}:taluks`, `${t.code}.open`, t.open, "open", { over });
    if (t.reported != null) b.add(s, `${sv}:taluks`, `${t.code}.reported`, t.reported, "reported", { over });
  }
  const cats = [...new Set(o.rows(s).map((x) => x.cat).filter(Boolean))].slice(0, 6);
  if (cats.length) {
    const cs = await tool("category_summary", { parts: cats.map((c) => ({ label: c.replace(/_/g, " ").toLowerCase().slice(0, 60), codes: [c] })) });
    if (cs) for (const p of cs.data.parts) {
      const code = cats.find((c) => c.replace(/_/g, " ").toLowerCase().slice(0, 60) === p.part), f = (x) => x.cat === code, sf = `${sv}:category_summary`;
      b.add(s, sf, `${code}.reported`, p.reported, "reported", { filter: f });
      b.add(s, sf, `${code}.reported_prev`, p.reported_prev, "reported", { over: { offset: 1 }, filter: f });
      b.add(s, sf, `${code}.open`, p.open, "open", { filter: f });
      b.add(s, sf, `${code}.severe`, p.severe, "severe", { filter: f });
      b.add(s, sf, `${code}.high`, p.high, "high", { filter: f });
      b.add(s, sf, `${code}.complaints`, p.complaints, "complaints_all", { filter: f, note: "the tool adds up complaints on closed incidents too" });
    }
  }
  const cd = await tool("change_drivers");
  if (cd) {
    const T = cd.data.totals, sf = `${sv}:change_drivers`;
    b.add(s, sf, "totals.n", T.n, "reported", LABEL("reported"));
    b.add(s, sf, "totals.prev", T.prev, "reported", { over: { offset: 1 }, label: "reported (period before)" });
    b.add(s, sf, "totals.severe", T.severe, "severe", LABEL("severe"));
    b.add(s, sf, "totals.severePrev", T.severePrev, "severe", { over: { offset: 1 }, label: "severe (period before)" });
    b.add(s, sf, "totals.open", T.open, "open", LABEL("still open"));
    b.add(s, sf, "totals.overdue", T.overdue, "overdue_flag", LABEL("past deadline"));
    b.add(s, sf, "totals.dead", T.dead, "deaths");
    b.add(s, sf, "totals.injured", T.injured, "injured");
    for (const c of cd.data.categories) {
      const fl = (x) => x.cat === c.code;
      b.add(s, sf, `category.${c.code}.n`, c.n, "reported", { filter: fl });
      b.add(s, sf, `category.${c.code}.prev`, c.prev, "reported", { over: { offset: 1 }, filter: fl });
      b.add(s, sf, `category.${c.code}.open`, c.open, "open", { filter: fl });
    }
  }
  const pb = await tool("place_breakdown");
  if (pb) {
    const t = pb.data.total, sf = `${sv}:place_breakdown`;
    b.add(s, sf, "total.n", t.n, "reported", LABEL("reported"));
    b.add(s, sf, "total.open", t.open, "open", LABEL("still open"));
    b.add(s, sf, "total.severe", t.severe, "severe", LABEL("severe"));
    b.add(s, sf, "total.high", t.high, "high");
    for (const x of pb.data.wards ?? []) { const w = String(x.key).match(/Ward (\d+)/)?.[1]; if (w) { const fw = (r) => String(r.ward) === w; b.add(s, sf, `ward.${w}.n`, x.n, "reported", { filter: fw }); b.add(s, sf, `ward.${w}.open`, x.open, "open", { filter: fw }); } }
  }
  const se = await tool("incident_series");
  if (se) {
    const add = (k) => se.data.buckets.reduce((a, x) => a + Number(x[k] ?? 0), 0), sf = `${sv}:incident_series`;
    b.add(s, sf, "buckets.n.sum", add("n"), "reported", LABEL("reported"));
    b.add(s, sf, "buckets.open.sum", add("open"), "open", LABEL("still open"));
    b.add(s, sf, "buckets.severe.sum", add("severe"), "severe", LABEL("severe"));
  }
  const rt = await tool("resolution_times");
  if (rt) {
    const by = o.resolutionByDept(s), sum = [...by.values()].reduce((a, x) => a + x.n, 0), sf = `${sv}:resolution_times`;
    b.add(s, sf, "closed", rt.data.closed, "custom", { custom: () => ({ value: sum }), label: "resolved (by closing time, departments with 3+)" });
    for (const r of rt.data.rows) b.add(s, sf, `${r.code}.n`, r.n, "custom", { custom: () => ({ value: by.get(r.code)?.n ?? 0, ids: by.get(r.code)?.ids }), label: "resolved (by closing time)" });
  }
  const vq = await tool("verification_queue");
  if (vq) { const aw = o.awaitingCheck(s); b.add(s, `${sv}:verification_queue`, "count", vq.data.count, "groups", { custom: () => ({ value: aw.n, ids: aw.nIds }), label: "waiting for your check" }); }
}

/** Ask District IQ itself, through its code path (the fast path answers these with no model; a card with no such figure is noted). */
async function readChat(h, b, s, who = "collector") {
  const sv = who === "collector" ? "assistant/chat" : `assistant/chat(${who})`;
  const when = WHEN[s.period];
  const ask = async (q) => {
    const r = await h.post(who, "/api/collector/assistant/chat", { message: q, consoleScope: { period: s.period, zone: s.zone, dept: s.dept, cat: null, taluk: null } }, {}, ["chat", 3300]);
    const m = r.text.match(/event: answer\ndata: (.*)\n/);
    const card = m ? JSON.parse(m[1]) : null;
    b.line(s, sv, q, card?.answerMarkdown ?? null, { status: r.status, headline: card?.headline ?? null, scopeLine: card?.scopeLine ?? null, tools: card?.sources?.tools?.map((t) => t.name) ?? [], models: card?.sources?.models ?? [] });
    return card;
  };
  const kpi = (c, l) => c?.kpis?.find((x) => x.label === l);
  const opt = (extra) => ({ role: who, ...extra });
  const c1 = await ask(`how many incidents ${when}`);
  if (c1) {
    b.add(s, sv, "count.Reported", kpi(c1, "Reported")?.value, "reported", opt(LABEL("reported")));
    b.add(s, sv, "count.Reported.prev", kpi(c1, "Reported")?.prev, "reported", opt({ over: { offset: 1 }, label: "reported (period before)" }));
    b.add(s, sv, "count.Severe", kpi(c1, "Severe")?.value, "severe", opt(LABEL("severe")));
    b.add(s, sv, "count.Still open", kpi(c1, "Still open")?.value, "open", opt(LABEL("still open")));
    b.add(s, sv, "count.Deaths", kpi(c1, "Deaths")?.value ?? 0, "deaths", opt({}));
    const md = String(c1.answerMarkdown ?? "").replace(/,(?=\d)/g, "");
    const m = md.match(/(\d+) (?:incidents?|grievances?)[^:]*?reported/);
    if (m) b.add(s, sv, "count.sentence.reported", Number(m[1]), "reported", opt(LABEL("reported")));
  }
  if (who !== "collector") return;
  const c2 = await ask(`how many incidents are past their deadline ${when}`);
  if (c2) b.add(s, sv, "pastDeadline", kpi(c2, "Reported")?.value ?? asNum(c2.headline), "overdue_flag", LABEL("past deadline"));
  const c3 = await ask(`how many open complaints ${when}`);
  if (c3) { b.add(s, sv, "openComplaints", kpi(c3, "Open complaints")?.value, "complaints_open", LABEL("complaints")); b.add(s, sv, "openComplaints.incidents", kpi(c3, "Incidents with complaints")?.value, "complaint_inc", LABEL("complaints")); }
  const c4 = await ask(`how many severe incidents ${when}`);
  if (c4) { b.add(s, sv, "severe.Severe", kpi(c4, "Severe")?.value, "severe", LABEL("severe")); b.add(s, sv, "severe.Still open", kpi(c4, "Still open")?.value, "severe_open", LABEL("severe")); }
}

/** Ask District IQ's other code lanes: per-zone, per-department and per-category tables, resolved, and "how many past deadline" as a card. */
async function readChatMore(h, b, s) {
  const o = b.o, sv = "assistant/chat", when = WHEN[s.period];
  const ask = async (q) => {
    const r = await h.post("collector", "/api/collector/assistant/chat", { message: q, consoleScope: { period: s.period, zone: s.zone, dept: s.dept, cat: null, taluk: null } }, {}, ["chat", 3300]);
    const m = r.text.match(/event: answer\ndata: (.*)\n/);
    const card = m ? JSON.parse(m[1]) : null;
    b.line(s, sv, q, card?.answerMarkdown ?? null, { status: r.status, headline: card?.headline ?? null, scopeLine: card?.scopeLine ?? null, tools: card?.sources?.tools?.map((t) => t.name) ?? [], models: card?.sources?.models ?? [], kpis: (card?.kpis ?? []).map((k) => [k.label, k.value, k.prev ?? null]) });
    return card;
  };
  const ds = (c, id) => (c?.datasets ?? []).find((d) => d.id === id);
  const kpi = (c, l) => c?.kpis?.find((x) => x.label === l);

  const cz = await ask(`incidents by zone ${when}`);
  for (const x of ds(cz, "zones")?.rows ?? []) {
    const over = { zone: x.zone };
    b.add(s, `${sv}:by zone`, `${x.zone}.n`, x.n, "reported", { over });
    b.add(s, `${sv}:by zone`, `${x.zone}.open`, x.open, "open", { over });
    b.add(s, `${sv}:by zone`, `${x.zone}.severe`, x.severe, "severe", { over });
    b.add(s, `${sv}:by zone`, `${x.zone}.complaints`, x.complaints, "complaints_open", { over });
    if (x.n_prev != null) b.add(s, `${sv}:by zone`, `${x.zone}.n_prev`, x.n_prev, "reported", { over: { ...over, offset: 1 } });
  }
  const cd = await ask(`open incidents by department ${when}`);
  for (const x of ds(cd, "departments")?.rows ?? []) {
    const over = { dept: x.code };
    b.add(s, `${sv}:by department`, `${x.code}.n`, x.n, "reported", { over });
    b.add(s, `${sv}:by department`, `${x.code}.open`, x.open, "open", { over });
    b.add(s, `${sv}:by department`, `${x.code}.severe`, x.severe, "severe", { over });
  }
  const cc = await ask(`incidents by category ${when}`);
  for (const x of ds(cc, "kinds")?.rows ?? []) {
    const f = (r) => r.catLabel === x.label;
    b.add(s, `${sv}:by category`, `${x.label}.n`, x.n, "reported", { filter: f });
    if (x.n_prev != null) b.add(s, `${sv}:by category`, `${x.label}.n_prev`, x.n_prev, "reported", { over: { offset: 1 }, filter: f });
    if (x.severe != null) b.add(s, `${sv}:by category`, `${x.label}.severe`, x.severe, "severe", { filter: f });
  }
  const cr = await ask(`how many resolved incidents ${when}`);
  if (kpi(cr, "Resolved")) {
    const now = o.resolvedByClose(s), prev = o.resolvedByClose({ ...s, offset: 1 });
    b.add(s, `${sv}:resolved`, "Resolved", kpi(cr, "Resolved").value, "custom", { custom: () => ({ value: now.length, ids: now.map((r) => r.id) }), label: "resolved (by closing time)" });
    b.add(s, `${sv}:resolved`, "Resolved.prev", kpi(cr, "Resolved").prev, "custom", { custom: () => ({ value: prev.length }), label: "resolved (by closing time, period before)" });
    if (kpi(cr, "Severe")) b.add(s, `${sv}:resolved`, "Severe", kpi(cr, "Severe").value, "custom", { custom: () => ({ value: now.filter((r) => r.sev === "Severe").length }), label: "severe, resolved by closing time" });
    if (kpi(cr, "Closed late")) b.add(s, `${sv}:resolved`, "Closed late", kpi(cr, "Closed late").value, "custom", { custom: () => ({ value: now.filter((r) => r.closed != null && r.due != null && r.closed > r.due).length }), label: "resolved past the deadline" });
  }
  // a card's tile named "Reported" on a question about something else: the tile must be the reported figure, or carry another name
  const co = await ask(`how many incidents are past their deadline ${when}`);
  if (kpi(co, "Reported")) b.add(s, `${sv}:card label`, "tile 'Reported' on the past-deadline card", kpi(co, "Reported").value, "reported", LABEL("reported"));
  const cp = await ask(`how many open incidents ${when}`);
  if (kpi(cp, "Reported")) b.add(s, `${sv}:card label`, "tile 'Reported' on the open-incidents card", kpi(cp, "Reported").value, "reported", LABEL("reported"));
  const tr = await ask(`show the trend of incidents ${when}`);
  if (kpi(tr, "Incidents matching")) b.add(s, `${sv}:list`, "tile 'Incidents matching', no filter", kpi(tr, "Incidents matching").value, "reported", LABEL("reported"));
}

const ST = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0 };
const slotsFor = (s, extra = {}) => ({ period: s.period, zones: s.zone ? [s.zone] : [], dept: s.dept, depts: [], cat: null, taluk: null, sev: null, status: null, q: null, metric: null, measure: null, by: null, order: "top", n: 20, id: null, name: null, what: null, sort: "priority", fresh: true, ...extra });
let turnNo = 0;

/** Jarvis: the real round route. `direct` is how a Stage control asks for a screen (built by code, no model); text goes through the rules' lanes. */
async function readJarvis(h, b, s) {
  const sv = "thunai/round";
  const round = async (body) => (await h.post("collector", "/api/collector/thunai/agent/round", { turnId: `same-${process.pid}-${++turnNo}`, round: 0, state: { ...ST, period: s.period, zone: s.zone, dept: s.dept }, ...body }, {}, ["round", 720])).json;
  const direct = (recipe, extra) => round({ text: `${recipe} screen`, direct: { recipe, slots: slotsFor(s, extra), lang: "en" } });
  const block = (r, kind) => r?.result?.stage?.blocks?.find((x) => x.kind === kind);
  const kp = (r, key) => block(r, "Kpis")?.items?.find((x) => x.key === key)?.value;
  const said = (r) => String(r?.result?.say ?? "").replace(/,(?=\d)/g, "");

  // the brief
  const br = await direct("brief");
  b.line(s, sv, "brief (direct)", br?.result?.say ?? null, { lane: br?.lane });
  if (s.dept) {
    b.add(s, `${sv}:brief`, "kpi.reported", kp(br, "reported"), "reported", LABEL("reported"));
    b.add(s, `${sv}:brief`, "kpi.open", kp(br, "open"), "open", LABEL("still open"));
    b.add(s, `${sv}:brief`, "kpi.overdue", kp(br, "overdue"), "overdue_flag", LABEL("past deadline"));
    b.add(s, `${sv}:brief`, "kpi.serious", kp(br, "serious"), "serious_open", LABEL("serious"));
    const m = said(br).match(/(\d+) new incidents? came in/), m2 = said(br).match(/(\d+) cases? (?:is|are) still open/), m3 = said(br).match(/(\d+) (?:is|are) past the deadline/), none = /none is past the deadline/.test(said(br));
    if (m) b.add(s, `${sv}:brief`, "say.reported", Number(m[1]), "reported", LABEL("reported"));
    if (m2) b.add(s, `${sv}:brief`, "say.open", Number(m2[1]), "open", LABEL("still open"));
    if (m3 || none) b.add(s, `${sv}:brief`, "say.overdue", m3 ? Number(m3[1]) : 0, "overdue_flag", LABEL("past deadline"));
  } else {
    b.add(s, `${sv}:brief`, "kpi.reported", kp(br, "reported"), "reported", LABEL("reported"));
    b.add(s, `${sv}:brief`, "kpi.severe", kp(br, "severe"), "severe", LABEL("severe"));
    b.add(s, `${sv}:brief`, "kpi.overdue", kp(br, "overdue"), "overdue_flag", LABEL("past deadline"));
    b.add(s, `${sv}:brief`, "kpi.newsOnly", kp(br, "newsOnly"), "news_only", LABEL("news only"));
    const m = said(br).match(/(\d+) incidents? (?:was|were) reported/);
    if (m) b.add(s, `${sv}:brief`, "say.reported", Number(m[1]), "reported", LABEL("reported"));
    const pts = (block(br, "Brief")?.points ?? []).map((p) => p.text).join(" ").replace(/,(?=\d)/g, "");
    const m2 = pts.match(/(\d+) incidents? (?:is|are) still open(?:, (\d+) of them past the deadline)?/);
    if (m2) { b.add(s, `${sv}:brief`, "points.open", Number(m2[1]), "open", LABEL("still open")); b.add(s, `${sv}:brief`, "points.overdue", Number(m2[2] ?? 0), "overdue_flag", LABEL("past deadline")); }
  }

  // the dashboard
  const da = await direct("dashboard");
  b.line(s, sv, "dashboard (direct)", da?.result?.say ?? null, { lane: da?.lane });
  b.add(s, `${sv}:dashboard`, "kpi.reported", kp(da, "reported"), "reported", LABEL("reported"));
  b.add(s, `${sv}:dashboard`, "kpi.severe", kp(da, "severe"), "severe", LABEL("severe"));
  b.add(s, `${sv}:dashboard`, "kpi.ongoing", kp(da, "ongoing"), "ongoing", LABEL("still open"));
  b.add(s, `${sv}:dashboard`, "kpi.complaints", kp(da, "complaints"), "complaints_open", LABEL("complaints"));
  const cl = block(da, "CaseList");
  if (cl) {
    b.add(s, `${sv}:dashboard`, "CaseList.total(groups)", cl.total, "groups", { custom: () => ({ value: b.o.groups("ongoing", s) }), label: "still open (groups)" });
    const sevs = (cl.rows ?? []).map((x) => SEVERITIES.indexOf(x.sev));
    const best = b.o.rows(s).filter((x) => x.open && !x.routed).reduce((a, x) => Math.min(a, SEVERITIES.indexOf(x.sev)), 9);
    if (sevs.length) b.add(s, `${sv}:dashboard`, "CaseList.first row's severity rank ('most serious first', 0 = Severe)", sevs[0], "custom", { custom: () => ({ value: best }), label: "list order" });
  }
  // the Ranking block shows zones; a zone view's spoken line names the top zone
  const top = block(da, "Ranking")?.items?.[0];
  if (s.zone && top && Number(top.zone) !== s.zone && new RegExp(`Most in ${top.label}`).test(said(da)))
    b.notes.push({ scope: scopeLabel(s), surface: `${sv}:dashboard`, kind: "wrong-place", say: da.result.say, asked_zone: s.zone, named_zone: Number(top.zone) });

  // the severe list
  const sc = await direct("cases", { sev: "Severe" });
  b.line(s, sv, "severe cases (direct)", sc?.result?.say ?? null, { lane: sc?.lane });
  const g = b.o.severityGroups(s);
  b.add(s, `${sv}:cases(severe)`, "kpi.total", kp(sc, "total") ?? (block(sc, "Note") ? 0 : null), "groups", { custom: () => ({ value: g.Severe }), label: "severe" });
  const slist = block(sc, "CaseList");
  if (slist) {
    // "N are past their deadline" against the same list counted in full
    const groupsAll = severeGroupRows(b.o, s);
    const shownLate = (slist.rows ?? []).filter((x) => x.overdue).length;
    b.add(s, `${sv}:cases(severe)`, "kpi.late", kp(sc, "late"), "custom", { custom: () => ({ value: groupsAll.filter((r) => r.breached).length, ids: groupsAll.filter((r) => r.breached).map((r) => r.id) }), label: "past deadline", note: `rows shown ${slist.rows?.length ?? 0} of ${slist.total}; ${shownLate} of the shown are late` });
    const heldBy = block(sc, "Kpis")?.items?.find((x) => x.key === "dept");
    if (heldBy) {
      const nameOf = heldBy.label.replace(/^Held by /, ""), code = (slist.rows ?? []).find((x) => x.deptName === nameOf)?.dept;
      const held = groupsAll.filter((r) => r.dept === code);
      b.add(s, `${sv}:cases(severe)`, `kpi.held by ${code}`, heldBy.value, "custom", { custom: () => ({ value: held.length, ids: held.map((r) => r.id) }), label: "held by a department", note: `rows shown ${slist.rows?.length ?? 0} of ${slist.total}` });
    }
  }

  // the past-deadline list: the same figure as the tile
  const lo = await direct("cases", { status: "overdue" });
  b.line(s, sv, "past-deadline cases (direct)", lo?.result?.say ?? null, { lane: lo?.lane });
  b.add(s, `${sv}:cases(overdue)`, "total", block(lo, "CaseList")?.total ?? kp(lo, "total") ?? (block(lo, "Note") ? 0 : null), "overdue", LABEL("past deadline"));

  // open cases
  const oc = await direct("cases", { status: "open" });
  b.line(s, sv, "open cases (direct)", oc?.result?.say ?? null, { lane: oc?.lane });
  b.add(s, `${sv}:cases(open)`, "kpi.total(groups)", kp(oc, "total") ?? (block(oc, "Note") ? 0 : null), "groups", { custom: () => ({ value: b.o.groups("ongoing", s) }), label: "still open (groups)" });
  const late = kp(oc, "late");
  if (late != null) b.add(s, `${sv}:cases(open)`, "kpi.late", late, "overdue", LABEL("past deadline"));

  // department performance
  const pf = await direct("performance");
  if (block(pf, "Kpis")) {
    b.line(s, sv, "performance (direct)", pf?.result?.say ?? null, { lane: pf?.lane });
    b.add(s, `${sv}:performance`, "kpi.open", kp(pf, "open"), "open", LABEL("still open"));
    b.add(s, `${sv}:performance`, "kpi.overdue", kp(pf, "overdue"), "overdue_flag", LABEL("past deadline"));
  }

  // the same scope said in words: the rules' lanes
  const who = s.dept ? DEPT_WORDS[s.dept] : s.zone ? ZONE_WORDS[s.zone] : null;
  const place = s.zone ? ZONE_WORDS[s.zone] : null;
  const texts = s.dept && !s.zone ? [`${who} report ${WHEN[s.period]}`, `how is ${who} doing ${WHEN[s.period]}`, `${who} cases past deadline ${WHEN[s.period]}`] : s.zone && !s.dept ? [`severe cases in ${place} ${WHEN[s.period]}`, `give me the briefing for ${place} ${WHEN[s.period]}`, `cases past deadline in ${place} ${WHEN[s.period]}`] : !s.dept && !s.zone ? [`give me the briefing ${WHEN[s.period]}`, `how many severe cases ${WHEN[s.period]}`, `cases past deadline ${WHEN[s.period]}`] : [];
  for (const text of texts) {
    const r = await round({ text });
    b.line(s, sv, text, r?.result?.say ?? null, { lane: r?.lane, kind: r?.result?.kind, note: r?.result?.note ?? null, recipe: r?.result?.stage?.recipe ?? null, title: r?.result?.stage?.title ?? null, stage_scope: r?.result?.stage?.scope ?? null, kpis: block(r, "Kpis")?.items?.map((x) => [x.key, x.value]) ?? null });
    const rec = r?.result?.stage?.recipe, per = r?.result?.stage?.scope?.period, sz = r?.result?.stage?.scope?.zone ?? null, sd = r?.result?.stage?.scope?.dept ?? null;
    if (!rec) continue;
    const same = per === s.period && sz === (s.zone ?? null) && sd === (s.dept ?? null);
    if (!same) { b.notes.push({ scope: scopeLabel(s), surface: `${sv}:text`, kind: "said-period-not-followed", asked: text, got: { period: per, zone: sz, dept: sd, cat: r?.result?.stage?.scope?.cat ?? null }, say: r.result.say }); continue; }
    if (rec === "brief") {
      if (kp(r, "reported") != null) b.add(s, `${sv}:text`, `"${text}" reported`, kp(r, "reported"), "reported", LABEL("reported"));
      if (kp(r, "overdue") != null) b.add(s, `${sv}:text`, `"${text}" overdue`, kp(r, "overdue"), "overdue_flag", LABEL("past deadline"));
      if (kp(r, "open") != null) b.add(s, `${sv}:text`, `"${text}" open`, kp(r, "open"), "open", LABEL("still open"));
    } else if (rec === "cases" && /past deadline/.test(text)) b.add(s, `${sv}:text`, `"${text}" total`, kp(r, "total") ?? block(r, "CaseList")?.total ?? (block(r, "Note") ? 0 : null), "overdue", LABEL("past deadline"));
    else if (rec === "cases" && kp(r, "total") != null) b.add(s, `${sv}:text`, `"${text}" total`, kp(r, "total"), "groups", { custom: () => ({ value: g.Severe }), label: "severe" });
    else if (rec === "performance" && kp(r, "open") != null) { b.add(s, `${sv}:text`, `"${text}" open`, kp(r, "open"), "open", LABEL("still open")); b.add(s, `${sv}:text`, `"${text}" overdue`, kp(r, "overdue"), "overdue_flag", LABEL("past deadline")); }
  }
}

/** Jarvis's other screens that show incident figures. Each is the real round route with a direct recipe, as a Stage control asks for it. */
async function readJarvisMore(h, b, s) {
  const o = b.o, sv = "thunai/round";
  const round = async (body) => (await h.post("collector", "/api/collector/thunai/agent/round", { turnId: `same-${process.pid}-${++turnNo}`, round: 0, state: { ...ST, period: s.period, zone: s.zone, dept: s.dept }, ...body }, {}, ["round", 720])).json;
  const direct = (recipe, extra) => round({ text: `${recipe} screen`, direct: { recipe, slots: slotsFor(s, extra), lang: "en" } });
  const block = (r, kind) => r?.result?.stage?.blocks?.find((x) => x.kind === kind);
  const kp = (r, key) => block(r, "Kpis")?.items?.find((x) => x.key === key)?.value;
  const sum = (a) => (a ?? []).reduce((x, y) => x + Number(y ?? 0), 0);

  const tr = await direct("trend");
  b.line(s, sv, "trend (direct)", tr?.result?.say ?? null, { lane: tr?.lane, stage_scope: tr?.result?.stage?.scope ?? null });
  if (block(tr, "Trend")) {
    if (kp(tr, "total") != null) b.add(s, `${sv}:trend`, "kpi.total", kp(tr, "total"), "reported", LABEL("reported")); // a period with nothing in it has only the chart
    b.add(s, `${sv}:trend`, "Trend.values.sum", sum(block(tr, "Trend").values), "reported", LABEL("reported"));
  }
  for (const x of block(tr, "Ranking")?.items ?? []) b.add(s, `${sv}:trend`, `Ranking.${x.key}`, x.value, "reported", { over: { zone: Number(x.key) } });

  const wy = await direct("why");
  b.line(s, sv, "why (direct)", wy?.result?.say ?? null, { lane: wy?.lane });
  if (block(wy, "Kpis")) {
    b.add(s, `${sv}:why`, "kpi.n", kp(wy, "n"), "reported", LABEL("reported"));
    b.add(s, `${sv}:why`, "kpi.severe", kp(wy, "severe"), "severe", LABEL("severe"));
    b.add(s, `${sv}:why`, "kpi.overdue", kp(wy, "overdue"), "overdue_flag", LABEL("past deadline"));
    const m = String(wy?.result?.say ?? "").replace(/,(?=\d)/g, "").match(/(\d+) incidents? [^.]*?against (\d+) the period before/);
    if (m) { b.add(s, `${sv}:why`, "say.now", Number(m[1]), "reported", LABEL("reported")); b.add(s, `${sv}:why`, "say.before", Number(m[2]), "reported", { over: { offset: 1 }, label: "reported (period before)" }); }
  }

  for (const [measure, def, label] of [["zone_incidents", "reported", "reported"], ["zone_open", "open", "open"], ["zone_severe", "severe", "severe"], ["zone_complaints", "complaints_open", "complaints"]]) {
    const r = await direct("ranking", { measure, n: 15 });
    b.line(s, sv, `ranking ${measure} (direct)`, r?.result?.say ?? null, { lane: r?.lane, stage_scope: r?.result?.stage?.scope ?? null });
    for (const x of block(r, "Ranking")?.items ?? []) b.add(s, `${sv}:ranking(${measure})`, `${x.key}`, x.value, def, { over: { zone: Number(x.key) } });
    if (kp(r, "total") != null) { const rows = o.rows({ ...s, zone: null }).filter((x) => x.zone != null); b.add(s, `${sv}:ranking(${measure})`, "kpi.All areas together", kp(r, "total"), "custom", { custom: () => ({ value: o.apply(def, rows).value }), label: `${label}, all zones` }); }
  }
  for (const [measure, def] of [["dept_open", "open"], ["dept_overdue", "overdue_flag"]]) {
    const r = await direct("ranking", { measure, n: 15 });
    b.line(s, sv, `ranking ${measure} (direct)`, r?.result?.say ?? null, { lane: r?.lane, stage_scope: r?.result?.stage?.scope ?? null });
    for (const x of block(r, "Ranking")?.items ?? []) b.add(s, `${sv}:ranking(${measure})`, `${x.key}`, x.value, def, { over: { dept: x.key } });
  }

  const zp = await direct("performance", { by: "zone" });
  b.line(s, sv, "performance by zone (direct)", zp?.result?.say ?? null, { lane: zp?.lane, stage_scope: zp?.result?.stage?.scope ?? null });
  if (block(zp, "Kpis")) {
    const over = { zone: null };
    b.add(s, `${sv}:performance(zone)`, "kpi.n", kp(zp, "n"), "reported", { over, label: "reported, whole district", note: "the screen drops any zone filter" });
    b.add(s, `${sv}:performance(zone)`, "kpi.severe", kp(zp, "severe"), "severe", { over, label: "severe, whole district" });
    b.add(s, `${sv}:performance(zone)`, "kpi.open", kp(zp, "open"), "open", { over, label: "open, whole district" });
    b.add(s, `${sv}:performance(zone)`, "kpi.complaints", kp(zp, "complaints"), "complaints_open", { over, label: "complaints, whole district" });
    b.add(s, `${sv}:performance(zone)`, "Trend.values.sum", sum(block(zp, "Trend")?.values), "reported", { over, label: "reported, whole district" });
  }

  if (!s.zone) {
    const cz = await direct("compare", { zones: [13, 5] });
    b.line(s, sv, "compare Adyar and Royapuram (direct)", cz?.result?.say ?? null, { lane: cz?.lane });
    for (const side of block(cz, "Compare")?.sides ?? []) {
      const over = { zone: side.zone };
      for (const [k, def] of [["n", "reported"], ["severe", "severe"], ["high", "high"], ["open", "open"], ["complaints", "complaints_open"], ["overdue", "overdue_flag"]]) b.add(s, `${sv}:compare`, `${side.zone}.${k}`, side.values[k], def, { over });
    }
  }
  const cd = await direct("compare", { depts: ["GCC-SWM", "GCC-ELE"], zones: s.zone ? [s.zone] : [] });
  b.line(s, sv, "compare two departments (direct)", cd?.result?.say ?? null, { lane: cd?.lane, stage_scope: cd?.result?.stage?.scope ?? null });
  for (const side of block(cd, "Compare")?.sides ?? []) {
    const over = { dept: side.key };
    for (const [k, def] of [["open", "open"], ["overdue", "overdue_flag"], ["severe", "severe"]]) b.add(s, `${sv}:compare(depts)`, `${side.key}.${k}`, side.values[k], def, { over });
  }

  const ad = await direct("advise");
  b.line(s, sv, "advise (direct)", ad?.result?.say ?? null, { lane: ad?.lane });
  const firstId = (ad?.result?.stage?.blocks ?? []).flatMap((x) => [...(x.points ?? []), ...(x.items ?? [])]).map((p) => p.incidentId ?? p.id).find((id) => /^INC-/.test(String(id)));
  if (firstId) {
    const r = o.row(firstId), best = o.rows(s).filter((x) => x.open && !x.routed).reduce((a, x) => Math.min(a, SEVERITIES.indexOf(x.sev)), 9);
    b.add(s, `${sv}:advise`, "first case's severity rank (0 = Severe)", r ? SEVERITIES.indexOf(r.sev) : null, "custom", { custom: () => ({ value: best }), label: "list order", note: firstId });
  }
}

/** The console's severity list, in full: open, not routed, one row per group under its most severe member. */
function severeGroupRows(o, s) {
  const by = new Map();
  for (const r of o.rows(s)) {
    if (!(r.open && !r.routed)) continue;
    const cur = by.get(r.group);
    if (!cur || SEVERITIES.indexOf(r.sev) < SEVERITIES.indexOf(cur.sev)) by.set(r.group, r);
  }
  return [...by.values()].filter((r) => r.sev === "Severe");
}

const planFor = (s, f = {}) => ({
  steps: [{ op: "take", as: "a", layer: "incidents", filter: { category: null, family: null, severity: null, status: "any", dept: s.dept ? [s.dept] : null, overdue: null, citizen: null, period: { kind: "last_days", days: LAST_DAYS[s.period], offset: 0 }, text: null, ...f }, where: null },
    ...(s.zone ? [{ op: "inside", as: "b", of: "a", area: { kind: "zone", id: s.zone } }] : [])],
  show: s.zone ? "b" : "a", language: "en"
});

async function readMap(h, b, s, who = "collector") {
  const sv = who === "collector" ? "map/ask" : `map/ask(${who})`;
  const ask = async (body) => (await h.post(who, "/api/map/ask", body, {}, ["map", 1600])).json;
  const opt = (x) => ({ role: who, ...x });
  const all = await ask({ text: null, plan: planFor(s) });
  if (all?.answer) {
    b.add(s, sv, "any.count", all.answer.count, "has_point", opt({ label: "reported", note: "Ask the Map holds only incidents with a map point" }));
    b.add(s, sv, "any.total", all.total, "has_point", opt({ label: "reported" }));
    if (all.total) { // an empty answer has no tiles
      b.add(s, sv, "any.glance.open", all.glance?.open?.n, "ongoing", opt({ filter: (x) => x.lat != null, label: "still open" }));
      b.add(s, sv, "any.glance.overdue", all.glance?.overdue?.n, "overdue_flag", opt({ filter: (x) => x.lat != null, label: "past deadline" }));
      b.add(s, sv, "any.glance.severe", all.glance?.severe?.n, "severe", opt({ filter: (x) => x.lat != null, label: "severe" }));
    }
    const last = all.trace?.[all.trace.length - 1];
    if (last?.ids?.length === all.total) b.ids(s, sv, "any.ids", last.ids, "has_point");
    const m = String(all.answer.headline ?? "").replace(/,(?=\d)/g, "").match(/^(\d+)/);
    if (m) b.add(s, sv, "any.headline", Number(m[1]), "has_point", opt({ label: "reported" }));
  } else b.unavailable.push({ scope: scopeLabel(s), surface: sv, kind: all?.kind, error: all?.error });
  const open = await ask({ text: null, plan: planFor(s, { status: "open" }) });
  if (open?.answer) {
    b.add(s, sv, "open.count", open.answer.count, "ongoing", opt({ filter: (x) => x.lat != null, label: "still open" }));
    const last = open.trace?.[open.trace.length - 1];
    if (last?.ids?.length === open.total) b.ids(s, sv, "open.ids", last.ids, "ongoing", { filter: (x) => x.lat != null });
    b.line(s, sv, `(plan: open, ${s.period})`, open.answer.headline, { meaning: open.answer.meaning });
  }
  if (who !== "collector") return;
  const words = [s.zone ? `in ${ZONE_WORDS[s.zone]}` : "", WHEN[s.period] === "today" ? "today" : WHEN[s.period]].filter(Boolean).join(" ");
  if (!s.dept) {
    const t = await ask({ text: `open incidents ${words}` });
    b.line(s, sv, `open incidents ${words}`, t?.answer?.headline ?? t?.kind, { plan: t?.plan ? JSON.stringify(t.plan).slice(0, 400) : null });
    if (t?.answer) b.add(s, `${sv}:text`, `open incidents ${words}`, t.answer.count, "ongoing", { filter: (x) => x.lat != null, label: "still open" });
    const t2 = await ask({ text: `severe incidents ${words}` });
    b.line(s, sv, `severe incidents ${words}`, t2?.answer?.headline ?? t2?.kind);
    if (t2?.answer) b.add(s, `${sv}:text`, `severe incidents ${words}`, t2.answer.count, "severe_open", { filter: (x) => x.lat != null, label: "severe" });
  }
}

async function readExports(h, b, s, use) {
  const sv = "collector/export";
  const url = `/api/collector/export?${qs({ period: s.period, zone: s.zone, dept: s.dept })}`;
  const first = await h.get("collector", url);
  let count = null, rows = [];
  if (first.status === 428) {
    const grant = await h.grant("collector", first.json.confirm.scope);
    const r = await h.get("collector", url, { "x-diq-grant": grant });
    if (r.status === 200) { count = r.json.count; rows = parseCsv(r.json.csv); }
    else b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: r.status });
  } else b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: first.status, note: "no confirm step" });
  const rp = await h.get("collector", `/api/collector/report?${qs({ period: s.period, zone: s.zone, dept: s.dept })}`);
  const rep = rp.json?.report;
  const need = rows.filter((r) => r.list === "Needs your attention"), check = rows.filter((r) => r.list === "Closed work to check");
  if (count != null) {
    b.add(s, sv, "csv.rows", rows.length, "custom", { custom: () => ({ value: count }), label: "csv rows against its own count" });
    const within = b.o.rows(s).filter((x) => x.open && !x.routed);
    const inScope = new Set(within.map((x) => x.id));
    const outside = need.filter((r) => !inScope.has(r.id)).map((r) => r.id);
    b.add(s, sv, "needs-attention rows outside the scope's open list", outside.length, "custom", { custom: () => ({ value: 0 }), note: outside.slice(0, 12).join(" ") || undefined, label: "export row check" });
    const wrongField = need.filter((r) => { const x = b.o.row(r.id); return x && ((r.past_deadline === "Yes") !== (x.breached || (x.due != null && x.due <= b.o.nowMs)) || String(r.severity) !== x.sev); }).map((r) => r.id);
    b.add(s, sv, "needs-attention rows whose severity or deadline differ from the store", wrongField.length, "custom", { custom: () => ({ value: 0 }), note: wrongField.slice(0, 12).join(" ") || undefined, label: "export row check" });
    if (rep) b.add(s, sv, "needs-attention rows vs the PDF report's total", need.length, "custom", { custom: () => ({ value: rep.attentionTotal }), label: "needs your attention" });
    const aw = b.o.awaitingCheck(s);
    b.add(s, sv, "closed-work rows vs My Tasks", check.length, "custom", { custom: () => ({ value: aw.nIds.length }), label: "waiting for your check", note: `My Tasks counts ${aw.n} group(s), ${aw.nIds.length} incident(s)` });
    const capped = within.length > 400;
    if (capped) b.notes.push({ scope: scopeLabel(s), surface: sv, kind: "capped", text: `The action list reads only the top 400 of ${within.length} open incidents by priority, then keeps those that need the Collector; the CSV has ${need.length} such rows and the PDF says ${rep?.attentionTotal}.` });
  }
  if (rep) {
    const ins = (await h.get("collector", `/api/collector/insights?${qs({ period: s.period, zone: s.zone, dept: s.dept, part: "briefing" })}`)).json;
    if (ins?.briefing) b.add(s, "collector/insights?part=briefing", "stats.handledByDepts ('routine', nothing to do) against the PDF's routine", ins.briefing.stats.handledByDepts, "custom", { custom: () => ({ value: rep.routine }), label: "routine", note: `the Briefing shows ${ins.briefing.attention.length} needing the Collector; the PDF and the CSV say ${rep.attentionTotal}` });
    const ongoing = b.o.value("ongoing", s);
    b.add(s, "collector/report", "routine", rep.routine, "custom", { custom: () => ({ value: Math.max(0, ongoing - rep.attentionTotal) }), label: "routine" });
    b.add(s, "collector/report", "kpi.ongoing", rp.json.kpi?.cur?.ongoing, "ongoing", LABEL("still open"));
  }
  if (use.assistantExport) {
    const ae = await h.get("collector", `/api/collector/assistant/export?${qs({ period: s.period, zone: s.zone, dept: s.dept })}`);
    if (ae.status === 200) b.add(s, "collector/assistant/export", "csv.rows", parseCsv(ae.text).length, "custom", { custom: () => ({ value: count ?? parseCsv(ae.text).length }), label: "needs your attention", note: "the same list as the console's export" });
    else b.unavailable.push({ scope: scopeLabel(s), surface: "collector/assistant/export", status: ae.status });
  }
  if (use.mapExport) {
    const plan = planFor(s, { status: "open" }), body = { plan, question: null, format: "csv" };
    const m0 = await h.post("collector", "/api/map/export", body);
    if (m0.status === 428) {
      const grant = await h.grant("collector", m0.json.confirm.scope);
      const m1 = await h.post("collector", "/api/map/export", body, { "x-diq-grant": grant });
      if (m1.status === 200) {
        const rows2 = parseCsv(m1.text.split("\n").filter((l) => !l.startsWith("# ")).join("\n")); // the file opens with a few "# ..." lines saying what it is
        b.add(s, "map/export", "x-rows", Number(m1.headers.get("x-rows")), "ongoing", { filter: (x) => x.lat != null, label: "still open" });
        b.add(s, "map/export", "csv rows", rows2.length, "ongoing", { filter: (x) => x.lat != null, label: "still open" });
      } else b.unavailable.push({ scope: scopeLabel(s), surface: "map/export", status: m1.status });
    }
  }
}

/** The officer's own pages, signed in as that department's officer. */
async function readOfficer(h, b, s) {
  const who = OFFICER_OF[s.dept];
  if (!who) return;
  const o = b.o, sv = "officer/overview";
  const opt = (x = {}) => ({ role: who, ...x });
  const scope = { period: s.period, zone: s.zone };
  const off = o.officerRows(s.dept, { period: s.period, zone: s.zone });
  const ofStage = (...st) => off.filter((r) => st.includes(r.stage));
  const OPEN = ["new", "approved", "action", "sent"];
  const r = await h.get(who, `/api/officer/overview?${qs(scope)}`);
  if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: sv, status: r.status }); return; }
  const d = r.json, c = d.counts;
  const cus = (rows, label, sum) => opt({ custom: () => ({ value: sum ? rows.reduce((a, x) => a + x[sum], 0) : rows.length, ids: rows.map((x) => x.id) }), label });
  b.add(s, sv, "counts.new", c.new, "custom", cus(ofStage("new"), "stage new"));
  b.add(s, sv, "counts.action", c.action, "custom", cus(ofStage("approved", "action"), "stage in action"));
  b.add(s, sv, "counts.sent", c.sent, "custom", cus(ofStage("sent"), "stage sent"));
  b.add(s, sv, "counts.verified", c.verified, "custom", cus(ofStage("verified"), "stage verified"));
  b.add(s, sv, "counts.new+action+sent", c.new + c.action + c.sent, "custom", cus(ofStage(...OPEN), "still open"));
  b.add(s, sv, "counts.overdue", c.overdue, "custom", cus(ofStage(...OPEN).filter((x) => x.breached), "past deadline"));
  b.add(s, sv, "counts.serious", c.serious, "custom", cus(ofStage(...OPEN).filter((x) => x.sev === "Severe" || x.sev === "High"), "serious"));
  b.add(s, sv, "counts.due", c.due, "custom", cus(ofStage(...OPEN).filter((x) => !x.breached && x.due != null && x.due > o.nowMs && x.due <= o.nowMs + 864e5), "due in 24 hours"));
  b.add(s, sv, "byType.sum", d.byType.reduce((a, x) => a + x.v, 0), "custom", cus(off, "reported (not closed)"));
  b.add(s, sv, "trend.sum", d.trend.reduce((a, x) => a + x.v.reduce((p, q) => p + q, 0), 0), "custom", cus(off, "reported (not closed)"));
  if (!s.zone) b.add(s, sv, "map.zoneCounts.sum", Object.values(d.map.zoneCounts).reduce((a, x) => a + Number(x), 0), "custom", cus(ofStage(...OPEN).filter((x) => x.zone != null), "still open"));
  const k = d.board.kpi.cur;
  for (const [f, def, label] of [["reported", "reported", "reported"], ["severe", "severe", "severe"], ["complaints", "complaints_open", "complaints"], ["ongoing", "ongoing", "still open"], ["resolved", "resolved", "resolved"]])
    b.add(s, `${sv}:board`, `kpi.cur.${f}`, k[f], def, opt(LABEL(label)));
  b.add(s, `${sv}:board`, "map.total", d.board.map.total, "reported", opt(LABEL("reported")));
  b.add(s, `${sv}:board`, "snapshot.open", d.board.snapshot.open, "open", opt(LABEL("still open")));
  b.add(s, `${sv}:board`, "snapshot.overdue", d.board.snapshot.overdue, "overdue", opt(LABEL("past deadline")));
  b.add(s, `${sv}:board`, "snapshot.serious", d.board.snapshot.serious, "serious_open", opt(LABEL("serious")));
  const g = o.severityGroups(s);
  b.add(s, `${sv}:board`, "severity.counts.Severe", d.board.severity.counts.Severe, "groups", opt({ custom: () => ({ value: g.Severe }), label: "severe" }));

  const gv = "officer/grievances";
  const total = async (extra) => (await h.get(who, `/api/officer/grievances?${qs({ ...scope, per: 100, ...extra })}`)).json;
  const all = await total({ tab: "all" });
  b.add(s, gv, "tab=all.total", all.total, "custom", cus(off, "reported (not closed)"));
  // every id, page by page (the list says 100 a page), for a scope small enough to read
  if (all.total <= 1500) {
    const ids = all.rows.map((x) => x.id);
    for (let p = 1; ids.length < all.total && p < 20; p++) ids.push(...(await total({ tab: "all", page: p })).rows.map((x) => x.id));
    const want = new Set(off.map((x) => x.id)), have = new Set(ids);
    const onlyApp = [...have].filter((x) => !want.has(x)), onlyOracle = [...want].filter((x) => !have.has(x));
    b.idChecks.push({ scope: scopeLabel(s), surface: gv, figure: "tab=all ids", def: "officer rows", app: have.size, oracle: want.size, only_in_app: onlyApp.slice(0, 40), only_in_oracle: onlyOracle.slice(0, 40), ok: !onlyApp.length && !onlyOracle.length });
  }
  for (const [flag, rows, label] of [["open", ofStage(...OPEN), "still open"], ["overdue", ofStage(...OPEN).filter((x) => x.breached), "past deadline"], ["serious", ofStage(...OPEN).filter((x) => x.sev === "Severe" || x.sev === "High"), "serious"]]) {
    const t = await total({ tab: "all", flag });
    b.add(s, gv, `flag=${flag}.total`, t.total, "custom", cus(rows, label));
  }
  const ins = await h.get(who, `/api/officer/insights?${qs(scope)}`);
  const work = ins.json?.modules?.find((m) => m.title === "Work record");
  if (work && !work.kpis?.length) b.add(s, "officer/insights", "work: nothing in scope", 0, "reported", opt(LABEL("reported")));
  else if (work) {
    const kp = (l) => work.kpis.find((x) => x.label === l);
    b.add(s, "officer/insights", "work.Grievances", asNum(kp("Grievances")?.value), "reported", opt(LABEL("reported")));
    b.add(s, "officer/insights", "work.Open past deadline", asNum(kp("Open past deadline")?.value), "overdue_flag", opt(LABEL("past deadline")));
    b.add(s, "officer/insights", "work.still open", asNum(String(kp("Open past deadline")?.sub ?? "").match(/of ([\d,]+) still open/)?.[1]), "open", opt(LABEL("still open")));
  } else b.notes.push({ scope: scopeLabel(s), surface: "officer/insights", kind: "no-work-module", modules: (ins.json?.modules ?? []).map((m) => m.title) });
  await readChat(h, b, s, who);
  await readMap(h, b, s, who);
}

/** "Save as workspace" from a briefing: the route writes only to this server's own local copy. Its frozen figures should be the Briefing's. */
async function readSavedBriefing(h, b, s) {
  const r = await h.post("collector", "/api/collector/assistant/briefing", { period: s.period }, {}, ["briefing", 6100]);
  if (r.status !== 200) { b.unavailable.push({ scope: scopeLabel(s), surface: "assistant/briefing", status: r.status }); return; }
  const list = await h.get("collector", "/api/collector/workspaces");
  const v = list.json?.workspaces?.find((w) => w.name === r.json.name)?.versions?.[0];
  const w = v ? await h.get("collector", `/api/collector/workspaces/${v.id}`) : null;
  let f = w?.json?.briefing?.facts ?? null;
  if (!f) {
    // the open route takes ids of up to 9 digits; a server that does not save numbers its own rows from 1,000,000,000 (store.ts LOCAL_IDS), so it answers 404 for its own workspace
    b.notes.push({ scope: scopeLabel(s), surface: "collector/workspaces/[id]", kind: "workspace-not-openable", workspace_id: v?.id ?? null, status: w?.status ?? null, error: w?.json?.error ?? null });
    const archive = v?.filters?.archiveId;
    if (archive) {
      const db = new DatabaseSync(path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", String(h.instance ?? h.base.split(":").pop()), "durable.sqlite"), { readOnly: true });
      try { f = JSON.parse(db.prepare(`SELECT fact_pack FROM briefing_archive WHERE archive_id = ?`).get(archive)?.fact_pack ?? "null"); } finally { db.close(); }
    }
  }
  if (!f) { b.notes.push({ scope: scopeLabel(s), surface: "assistant/briefing", kind: "facts-not-readable" }); return; }
  b.add(s, "assistant/briefing", "facts.reported", f.reported, "reported", LABEL("reported"));
  b.add(s, "assistant/briefing", "facts.open", f.open, "open", LABEL("still open"));
  b.add(s, "assistant/briefing", "facts.overdue", f.overdue, "overdue_flag", LABEL("past deadline"));
  b.add(s, "assistant/briefing", "facts.severe", f.severe, "severe", LABEL("severe"));
  b.add(s, "assistant/briefing", "facts.newsOnly", f.newsOnly, "news_only", LABEL("news only"));
}

async function readBriefRoute(h, b, s) {
  const r = await h.get("collector", `/api/collector/brief?${qs({ period: s.period, zone: s.zone, dept: s.dept, kind: "day" })}`);
  b.line(s, "collector/brief", "kind=day", JSON.stringify(r.json), { status: r.status, note: "needs a model: the server has no key, so this returns no write-up. Its facts are tested with a fake model in same-number.test.ts" });
}

// ------------------------------------------------------------------- decisions and routings on this server's own copy --

/**
 * The pinned durable rows touch almost nothing in this build (see the report), so the routes that overlay them are exercised here: on a server just started
 * (nothing cached yet), the real news-routing job and real decisions through the real routes. They go only to this server's own local copy. Returns what was done.
 */
export async function applyOverlay(h, o) {
  const done = { routed: null, decisions: [] };
  const job = await h.post("collector", "/api/collector/jobs/route-news", {}, { "x-job-key": process.env.REFRESH_API_KEY_QA ?? "qa-pinned" });
  done.routed = job.json;
  const pick = (test) => o.effective.find(test);
  const week = o.nowMs - 168 * 3600_000, day = o.nowMs - 24 * 3600_000;
  const inWeek = (r) => r.t > week && r.t <= o.nowMs, inDay = (r) => r.t > day && r.t <= o.nowMs;
  const notNews = (r) => !r.mediaOnly;
  const want = [
    { why: "Solid Waste, open with a complaint, this week", decision: "resolve", row: pick((r) => inWeek(r) && r.dept === "GCC-SWM" && r.open && r.complaints > 0 && r.breached && notNews(r)) },
    { why: "severe and open, past deadline, today", decision: "resolve", row: pick((r) => inDay(r) && r.open && r.sev === "Severe" && r.breached && notNews(r)) },
    { why: "Adyar, open, this week", decision: "reject", note: "QA pass 4: not this department's work", row: pick((r) => inWeek(r) && r.zone === 13 && r.open && !r.mediaOnly && r.complaints > 0) },
    { why: "Adyar, closed as resolved, this week: sent back", decision: "reopen", note: "QA pass 4: sent back", row: pick((r) => inWeek(r) && r.zone === 13 && !r.open && r.status === "Resolved") },
    { why: "severe and open, this week: verified (leaves the status alone on the tiles)", decision: "verify", row: pick((r) => inWeek(r) && r.open && r.sev === "Severe" && !r.breached && notNews(r)) }
  ];
  for (const w of want) {
    if (!w.row) { done.decisions.push({ why: w.why, skipped: "no such row" }); continue; }
    const body = { incidentIds: [w.row.id], decision: w.decision, ...(w.note ? { note: w.note } : {}) };
    let r = await h.post("collector", "/api/collector/decisions", body);
    if (r.status === 428) { const g = await h.grant("collector", r.json.confirm.scope, "decide"); r = await h.post("collector", "/api/collector/decisions", body, { "x-diq-grant": g }); }
    done.decisions.push({ why: w.why, id: w.row.id, dept: w.row.dept, zone: w.row.zone, decision: w.decision, status: r.status, error: r.status === 200 ? undefined : r.json?.error });
  }
  return done;
}

// ------------------------------------------------------------------- the whole run --

export async function collect({ port = 3120, instance = null, scopes = ALL_SCOPES, oracle = null, overlay = false, only = null, log = () => {} } = {}) {
  let o = oracle ?? loadOracle();
  const h = new Http(port);
  h.instance = String(instance ?? port);
  let overlayDone = null;
  if (overlay) {
    overlayDone = await applyOverlay(h, o);
    log(`overlay applied: ${JSON.stringify(overlayDone)}`);
    o = loadOracle({ durableFile: path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", h.instance, "durable.sqlite") });
  }
  const b = new Book(o);
  b.overlayDone = overlayDone;
  const meta = await h.get("collector", "/api/collector/overview?meta=1");
  b.serverNow = meta.json?.now;
  let exportsLeft = 8, mapExports = 6;
  for (const s of scopes) {
    log(`reading ${scopeLabel(s)}`);
    if (only === "chat") { await readChatMore(h, b, s); continue; }
    if (only === "overlay") { await readConsole(h, b, s); await readList(h, b, s); await readBriefing(h, b, s); await readTools(h, b, s); await readExports(h, b, s, {}); await readOfficer(h, b, s); continue; }
    if (only === "more") { await readConsole(h, b, s); await readTrends(h, b, s); await readToolsMore(h, b, s); await readJarvisMore(h, b, s); continue; }
    await readConsole(h, b, s);
    await readList(h, b, s);
    await readBriefing(h, b, s);
    await readTrends(h, b, s);
    await readTools(h, b, s);
    await readToolsMore(h, b, s);
    await readChat(h, b, s);
    await readJarvis(h, b, s);
    await readJarvisMore(h, b, s);
    await readChatMore(h, b, s);
    await readMap(h, b, s);
    await readExports(h, b, s, { assistantExport: exportsLeft-- > 0, mapExport: mapExports-- > 0 });
    await readOfficer(h, b, s);
    await readBriefRoute(h, b, s);
    if (!s.zone && !s.dept) await readSavedBriefing(h, b, s);
  }
  return { o, b, h };
}

// ------------------------------------------------------------------- reconciling, row by row --

/** Raw snapshot against what every screen reads: which rows, and why. */
export function reconcileRawVsEffective(o, scopes, documents) {
  const pubs = new Map();
  for (const d of documents) { if (!d.linked_incident_id) continue; const k = String(d.linked_incident_id); if (!pubs.has(k)) pubs.set(k, new Set()); if (d.publisher) pubs.get(k).add(String(d.publisher)); }
  const places = new Map((o.hooks.zoneMoves ?? []).map((m) => [String(m.id), m]));
  const out = [];
  for (const s of scopes) for (const def of ["reported", "open", "overdue_flag", "severe", "news_only", "news_only_open", "complaints_all", "complaints_open"]) {
    const a = new Set(o.ids(def, s, "raw")), c = new Set(o.ids(def, s));
    const onlyRaw = [...a].filter((x) => !c.has(x)), onlyEff = [...c].filter((x) => !a.has(x));
    if (!onlyRaw.length && !onlyEff.length) continue;
    out.push({ scope: scopeLabel(s), figure: def, oracle_raw: o.value(def, s, "raw"), every_screen: o.value(def, s),
      in_raw_not_on_screen: onlyRaw.map((id) => { const e = o.row(id), r = o.rawRow(id); return { id, reported: r.tText, why: o.removedBy.has(id) ? `${o.removedBy.get(id)} took it out of the build` : e && s.zone != null && e.zone !== r.zone ? `places-from-reports moved it to zone ${e.zone}` : "see hook", dept: r.dept, zone: r.zone, publishers: [...(pubs.get(id) ?? [])] }; }),
      on_screen_not_in_raw: onlyEff.map((id) => { const m = places.get(id); return { id, reported: o.row(id).tText, why: m ? `places-from-reports gave it zone ${o.row(id).zone}: ${m.how ?? ""}` : "see hook" }; }) });
  }
  return out;
}

/** Same name, different count: the ids in one and not the other, for each pair of definitions a screen uses under one label. */
export function reconcileLabels(o, scopes) {
  const out = [];
  const pairs = [
    ["severe", "severe_open", "Severe tile (open or closed) against severe still open: the closed ones"],
    ["open", "ongoing", "Open (Briefing, Jarvis brief, Ask) against Ongoing (tiles, Map): rows routed to a department"],
    ["overdue_flag", "overdue", "Past deadline (Briefing, Jarvis brief, Ask) against the snapshot tile: rows routed to a department"],
    ["overdue_flag", "overdue_due", "The store's past-deadline flag against due time passed: open rows whose deadline has gone by but the flag is 0"],
    ["complaints_all", "complaints_open", "Complaints added up over everything against open only: complaints on closed incidents"],
    ["news_only", "news_only_open", "Only in the news, all against open: the closed ones"]
  ];
  for (const s of scopes) for (const [a, c, why] of pairs) {
    const A = new Set(o.ids(a, s)), C = new Set(o.ids(c, s));
    const oa = [...A].filter((x) => !C.has(x)), oc = [...C].filter((x) => !A.has(x));
    if (!oa.length && !oc.length && o.value(a, s) === o.value(c, s)) continue;
    out.push({ scope: scopeLabel(s), a, c, value_a: o.value(a, s), value_c: o.value(c, s), why, only_in_a_n: oa.length, only_in_c_n: oc.length, only_in_a: oa.slice(0, 30), only_in_c: oc.slice(0, 30) });
  }
  // the severity panel and Jarvis's "severe cases": one row per group
  for (const s of scopes) {
    const openIds = o.ids("severe_open", s);
    const heads = severeGroupRows(o, s);
    const headGroups = new Set(heads.map((r) => r.group));
    const collapsed = openIds.filter((id) => !heads.some((r) => r.id === id));
    if (openIds.length === heads.length) continue;
    out.push({ scope: scopeLabel(s), a: "severe_open", c: "severe groups (severity panel, Jarvis 'severe cases')", value_a: openIds.length, value_c: heads.length,
      why: "The panel shows one row per group of the same problem in the same area; these severe open incidents sit inside a group whose row is another severe incident",
      only_in_a_n: collapsed.length, only_in_c_n: 0, only_in_a: collapsed.slice(0, 30).map((id) => ({ id, group: o.groupOf(id), kept_row: heads.find((r) => r.group === o.groupOf(id))?.id ?? null })), only_in_c: [], kept_groups: headGroups.size });
  }
  return out;
}

export function summarise(b) {
  const bySurface = {};
  for (const r of b.readings) {
    const k = r.surface.split(":")[0];
    bySurface[k] ??= { readings: 0, agree: 0, differ: 0, missing: 0 };
    bySurface[k].readings++;
    if (r.missing) bySurface[k].missing++;
    else if (r.diff === 0) bySurface[k].agree++;
    else bySurface[k].differ++;
  }
  const n = b.readings.length, bad = b.readings.filter((r) => r.diff !== 0 && !r.missing);
  return { readings: n, agree: b.readings.filter((r) => r.diff === 0).length, differ: bad.length, missing: b.readings.filter((r) => r.missing).length, by_surface: bySurface };
}

function arg(name, dflt = null) { const a = process.argv.slice(2), i = a.indexOf(`--${name}`); return i < 0 ? dflt : a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : true; }

async function main() {
  const port = Number(arg("port", 3120));
  const scopeArg = arg("scopes", "all");
  const scopes = scopeArg === "core" ? CORE_SCOPES : scopeArg === "one" ? [{ period: "weekly", zone: null, dept: null }] : ALL_SCOPES;
  const overlay = !!arg("overlay");
  const suffix = arg("suffix", "");
  const only = arg("only", null);
  const t0 = Date.now();
  const { o, b, h } = await collect({ port, scopes, overlay, only, log: (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`) });
  const documents = loadTable("documents", PIN_TABLES).objects();
  const out = {
    generated_at: new Date().toISOString(), build: JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data/aws-cache/qa/pinned/info.json"), "utf8")).build_id, now: o.now, server_now: b.serverNow,
    method: "Every figure read over HTTP from the frozen server. oracle = the independent oracle's value for the same scope after the app's own build hooks (rows named in same-number-hooks.json); oracle_raw = the same figure over the raw snapshot.",
    no_model: "The server has no model key. Questions used are answered by the code lanes. collector/brief needs a model and returns no write-up here; its facts are checked with a fake model in same-number.test.ts.",
    overlay: b.overlayDone, routed_ids: [...o.routed], decided: [...o.latest],
    scopes: scopes.map(scopeLabel), summary: summarise(b), differences: b.readings.filter((r) => r.diff !== 0), raw_vs_screen: reconcileRawVsEffective(o, scopes, documents), same_label: reconcileLabels(o, scopes),
    id_checks: b.idChecks, lines: b.lines, notes: b.notes, unavailable: b.unavailable, readings: b.readings,
    http: { connection_resets_retried: h.resets ?? 0, calls: h.calls.length, failed: h.calls.filter((c) => c.status >= 500).length, statuses: h.calls.reduce((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {}) }
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `same-number${suffix ? `-${suffix}` : ""}.raw.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(JSON.stringify({ file: path.relative(APP_ROOT, file), summary: out.summary, http: out.http, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
