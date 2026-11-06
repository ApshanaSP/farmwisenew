// QA pass 4, audit of fixed bugs (part: narrate_and_figures): a real-run check on a frozen test server, as the right role, with each figure beside tests/qa/oracle/pinned.mjs.
// No model key is on the server, so a sentence the rules' lanes do not read answers "no-model": that is recorded, never hidden.
//   node tests/qa/pass4/server.mjs start --port 3131 --frozen --ticking   (the round route allows 90 a minute by Date.now(): on a clock that does not move, the 91st answer is 429 for ever)
//   node tests/qa/pass4/audit-narrate_and_figures.drive.mjs narrate|overdue|yesterday|officer|csv|extra|decisions [--base http://127.0.0.1:3131]
//   node tests/qa/pass4/audit-narrate_and_figures.drive.mjs tz --label <name> --clock "2026-11-07 00:30:00" [--base http://127.0.0.1:3132]
// Each part adds its section to docs/qa/pass4/evidence/bug-audit/narrate_and_figures-recheck.json as soon as it ends. Never prints a password.
import fs from "node:fs";
import path from "node:path";
import { accounts } from "../seed-local-users.mjs";
import { APP_ROOT } from "./lib/env.mjs";
import { HOURS, loadOracle, wallMs } from "../oracle/pinned.mjs";

const args = process.argv.slice(2);
const part = args.shift();
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const BASE = opt("base", "http://127.0.0.1:3131");
const OUT = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence", "bug-audit", "narrate_and_figures-recheck.json");
const acc = Object.fromEntries(accounts().map((a) => [a.key, a]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save(section, value) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* first part */ }
  all[section] = value;
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
}

async function login(key) {
  const a = acc[key];
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }), redirect: "manual" });
  if (r.status !== 200) throw new Error(`login ${key}: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const call = (p, o = {}) => fetch(`${BASE}${p}`, { ...o, headers: { cookie, ...(o.body ? { "content-type": "application/json" } : {}), ...(o.headers ?? {}) } });
  const parse = async (r) => { const t = await r.text(); try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t }; } };
  return {
    key, call,
    get: async (p) => parse(await call(p)),
    post: async (p, b, h) => { for (let i = 0; ; i++) { const r = await call(p, { method: "POST", body: JSON.stringify(b), headers: h }); if (r.status !== 429 || i >= 30) return parse(r); await r.text(); await sleep(5000); } },
    confirmed: async (p, b) => {
      const first = await call(p, { method: "POST", body: JSON.stringify(b) });
      if (first.status !== 428) return parse(first);
      const j = await first.json();
      const g = await call("/api/auth/confirm", { method: "POST", body: JSON.stringify({ step: "check", action: j.confirm.action, scope: j.confirm.scope, summary: j.confirm.summary, method: "password", code: a.password }) });
      if (g.status !== 200) return { status: g.status, text: "confirm failed" };
      const { grant } = await g.json();
      return parse(await call(p, { method: "POST", body: JSON.stringify(b), headers: { "x-diq-grant": grant } }));
    }
  };
}

let tn = 0;
const state = (over = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false, ...over });
const ROUND = "/api/collector/thunai/agent/round";
async function jarvis(s, text, over = {}) {
  const turnId = `rc${Date.now().toString(36)}${(tn++).toString(36)}`;
  let round = 0, last = null;
  while (round < 4) {
    last = await s.post(ROUND, { turnId, round, text, turns: [], lastText: null, stage: null, direct: null, state: state(over) });
    if (last.status !== 200 || last.json?.done || last.json?.result) break;
    round++;
  }
  return last;
}
const direct = (s, recipe, slots, lang = "en") => s.post(ROUND, { turnId: `rd${Date.now().toString(36)}${(tn++).toString(36)}`, round: 0, text: "show", turns: [], lastText: null, stage: null, direct: { recipe, slots, lang }, state: state() });
async function ask(s, message, scope = {}) {
  const r = await s.call("/api/collector/assistant/chat", { method: "POST", body: JSON.stringify({ message, inputMode: "text", language: "auto", consoleScope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, ...scope } }) });
  const t = await r.text();
  if (r.status !== 200) return { status: r.status, text: t.slice(0, 200) };
  const ev = t.split("\n\n").map((b) => { const e = b.match(/^event: (.+)$/m)?.[1]; const d = b.match(/^data: (.+)$/m)?.[1]; return e ? { e, d: d ? JSON.parse(d) : null } : null; }).filter(Boolean);
  const a = ev.find((x) => x.e === "answer")?.d;
  return { status: 200, headline: a?.headline ?? null, answer: a?.answerMarkdown ?? null, error: ev.find((x) => x.e === "error")?.d ?? null };
}
const stageOf = (r) => r?.json?.result?.stage ?? null;
const blockOf = (st, kind) => st?.blocks?.find((b) => b.kind === kind) ?? null;
const says = (r) => { const st = stageOf(r); return st ? { en: st.say?.en ?? null, ta: st.say?.ta ?? null } : { en: null, ta: null }; };
const summary = (r) => { const st = stageOf(r); return { http: r?.status, kind: r?.json?.result?.kind ?? null, recipe: st?.recipe ?? null, title: st?.title ?? null, ...says(r), reply: r?.json?.result?.reply ?? null, note: r?.json?.result?.note ?? r?.json?.note ?? null }; };

// ---------------------------------------------------------------- BUG-004, BUG-031, BUG-019 --
const FIELD_LABELS = /\bstatus (open|is)\b|\bstatus:|handles it|INC-\d|\b(GCC|POL|PWD|HLT)-[A-Z]+\b|^(Severe|High|Medium|Low),|, status /i;
const OPEN_WORDS_EN = /It's been open|past its deadline|I'd ask|send a pump/;
const OPEN_WORDS_TA = /தீர்க்கப்படாமல் இருக்கிறது|நிலவரம் கேட்கலாம்|கெடு/;
const CLOSED_WORDS_EN = /marked resolved|nothing to chase|no work is pending|rejected and closed|lapsed/i;
const BAD_JOIN = /துறைவிடம்|[A-Za-z]இடம்|ம்இடம்|துறைஇடம்|பிரிவுஇடம்|வாரியம்இடம்/;

async function narratePart() {
  const c = await login("collector");
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const sentences = ["explain the flooding complaint in Adyar", "explain the garbage complaint in Royapuram", "tell me about the street light complaint in Velachery", "explain the mosquito complaint in Teynampet",
    "Adyar flooding enna aachu", "Anna Nagar kuppai enna aachu", "Perungudi la kuppai problem enna aachu",
    "அடையாறு வெள்ளம் விளக்கு", "அடையாறு வெள்ள புகார் விளக்கமா சொல்லுங்க", "அண்ணா நகர் குப்பை புகார் விளக்கவும்", "பெருங்குடி தெருவிளக்கு புகார் விளக்கு"];
  const spoken = [];
  for (const text of sentences) {
    const r = await jarvis(c, text);
    const st = stageOf(r), inc = blockOf(st, "CaseDetail")?.incident;
    const orow = inc?.id ? o.row(String(inc.id)) : null;
    spoken.push({ text, ...summary(r), id: inc?.id ?? null, sev: inc?.sev ?? null, place: inc?.place ?? null, zoneName: inc?.zoneName ?? null, oracle_status: orow?.effStatus ?? null, oracle_zone: orow?.zoneName ?? null, field_label: FIELD_LABELS.test(`${st?.say?.en ?? ""} ${st?.say?.ta ?? ""}`) });
  }
  // a sample across every status and lead department, from the oracle's rows, newest first
  const picks = new Map();
  for (const r of [...o.effective].sort((a, b) => (b.t ?? 0) - (a.t ?? 0))) {
    const k = `${r.effStatus}|${r.dept}`;
    if ((picks.get(k)?.length ?? 0) >= 2) continue;
    picks.set(k, [...(picks.get(k) ?? []), r]);
  }
  const rows = [...picks.values()].flat();
  const out = { sample: rows.length, spoke: 0, not_found: [], field_labels: [], closed: { n: 0, told_open_en: [], told_open_ta: [] }, open: { n: 0, told_closed: [] }, bad_join: [], join_forms: {}, examples: {} };
  for (const row of rows) {
    const r = await direct(c, "case", { id: row.id, fresh: true });
    const { en, ta } = says(r);
    if (!en) { out.not_found.push({ id: row.id, http: r.status, reply: r.json?.result?.reply ?? r.text ?? null }); continue; }
    if (/could not find/i.test(en)) { out.not_found.push({ id: row.id, en: en.slice(0, 90) }); continue; }
    out.spoke++;
    if (FIELD_LABELS.test(en) || FIELD_LABELS.test(ta ?? "")) out.field_labels.push({ id: row.id, en, ta });
    if (!row.open) {
      out.closed.n++;
      if (OPEN_WORDS_EN.test(en)) out.closed.told_open_en.push({ id: row.id, status: row.effStatus, en });
      if (OPEN_WORDS_TA.test(ta ?? "")) out.closed.told_open_ta.push({ id: row.id, status: row.effStatus, ta });
    } else {
      out.open.n++;
      if (CLOSED_WORDS_EN.test(en)) out.open.told_closed.push({ id: row.id, status: row.effStatus, en });
    }
    if (BAD_JOIN.test(ta ?? "")) out.bad_join.push({ id: row.id, dept: row.dept, ta: ta.match(/[^ ]*இடம்[^.]*\./)?.[0] ?? ta.slice(-80) });
    for (const m of (ta ?? "").matchAll(/([^\s.,]+இடம்|[^\s.,]+ிடம்)/g)) out.join_forms[m[1]] = (out.join_forms[m[1]] ?? 0) + 1;
    const key = row.effStatus;
    if (!out.examples[key]) out.examples[key] = { id: row.id, en, ta };
  }
  save("narrate", { sentences: spoken, sweep: out });
  console.log(JSON.stringify({ sample: out.sample, spoke: out.spoke, notFound: out.not_found.length, labels: out.field_labels.length, closed: out.closed.n, toldOpenEn: out.closed.told_open_en.length, toldOpenTa: out.closed.told_open_ta.length, open: out.open.n, toldClosed: out.open.told_closed.length, badJoin: out.bad_join.length }));
}

// ---------------------------------------------------------------- BUG-007, BUG-021 --
async function overduePart() {
  const c = await login("collector");
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const sentences = ["overdue cases this week", "show me overdue cases today", "indha week overdue cases kaattu", "innaiku overdue cases enna", "காலக்கெடு தாண்டிய சம்பவங்கள் இந்த வாரம்", "இன்று காலக்கெடு தாண்டிய சம்பவங்கள்",
    "severe overdue cases", "severe cases past the deadline", "overdue severe cases this week", "severe overdue cases innaiku", "இந்த வாரம் கெடு தாண்டிய கடுமையான சம்பவங்கள் காட்டு", "overdue high priority cases in Adyar"];
  const spoken = [];
  for (const text of sentences) {
    const r = await jarvis(c, text), st = stageOf(r), list = blockOf(st, "CaseList");
    spoken.push({ text, ...summary(r), slots: st?.slots ?? null, list_total: list?.total ?? null, list_rows: list?.rows?.length ?? null, rows_overdue: list?.rows?.filter((x) => x.overdue).length ?? null, rows_sev: list?.rows?.map((x) => x.sev).join(",") ?? null });
  }
  const scopes = [];
  for (const period of ["daily", "weekly", "monthly", "quarterly"]) for (const zone of [null, 13, 4, 5, 9]) for (const sev of [null, "Severe", "High", "Medium", "Low"]) {
    const q = new URLSearchParams({ period, status: "overdue", sort: "t", dir: "-1", page: "0" });
    if (zone) q.set("zone", String(zone));
    if (sev) q.set("sev", sev);
    const con = await c.get(`/api/collector/list?${q}`);
    const scope = { period, zone: zone ?? null };
    const rows = o.rows(scope).filter((r) => r.open && r.breached && (!sev || r.sev === sev));
    const r = await direct(c, "cases", { status: "overdue", period, zones: zone ? [zone] : [], sev, fresh: true });
    const st = stageOf(r), list = blockOf(st, "CaseList");
    scopes.push({ period, zone, sev, console_incidents: con.json?.incidents ?? null, console_groups: con.json?.total ?? null, oracle_incidents: rows.length, oracle_groups: new Set(rows.map((x) => x.group)).size,
      jarvis_total: list?.total ?? null, jarvis_rows: list?.rows?.length ?? 0, jarvis_rows_overdue: list?.rows?.filter((x) => x.overdue).length ?? 0, say_en: (st?.say?.en ?? "").slice(0, 110) });
  }
  const has = scopes.filter((s) => s.console_incidents > 0);
  const saysNone = (s) => /^There are no /.test(s.say_en) || /^No /.test(s.say_en);
  const stats = { scopes: scopes.length, with_overdue: has.length, says_none: has.filter(saysNone).length, no_sev_with_overdue: has.filter((s) => !s.sev).length, no_sev_says_none: has.filter((s) => !s.sev && saysNone(s)).length,
    sev_with_overdue: has.filter((s) => s.sev).length, sev_says_none: has.filter((s) => s.sev && saysNone(s)).length, total_differs_from_console: has.filter((s) => s.jarvis_total !== s.console_incidents).length,
    console_differs_from_oracle: scopes.filter((s) => s.console_incidents !== s.oracle_incidents).length };
  const tops = scopes.filter((s) => s.zone == null).map((s) => `${s.period}/${s.sev ?? "any"}: console ${s.console_incidents} (groups ${s.console_groups}), oracle ${s.oracle_incidents}, jarvis ${s.jarvis_total} (rows ${s.jarvis_rows}) "${s.say_en.slice(0, 70)}"`);
  // the Ask District IQ path to the same figure: BUG-007's total, on the other surface
  const chat = [];
  for (const m of ["how many overdue incidents today", "how many overdue incidents this week", "evlo overdue cases indha week", "இந்த வாரம் எத்தனை காலக்கெடு தாண்டிய சம்பவங்கள்"]) chat.push({ m, ...(await ask(c, m)) });
  save("overdue", { sentences: spoken, stats, district: tops, chat, scopes });
  console.log(JSON.stringify(stats));
}

// ---------------------------------------------------------------- BUG-018 --
const dayRows = (o, day) => { const lo = Date.parse(`${day}T00:00:00Z`), hi = lo + 864e5; return o.effective.filter((r) => r.t != null && r.t >= lo && r.t < hi); };
const closedDayRows = (o, day) => { const lo = Date.parse(`${day}T00:00:00Z`), hi = lo + 864e5; return o.effective.filter((r) => r.closed != null && r.closed >= lo && r.closed < hi && r.status === "Resolved"); };
const dayFigures = (o, day) => { const rs = dayRows(o, day); return { reported: rs.length, severe: rs.filter((r) => r.sev === "Severe").length, open: rs.filter((r) => r.open).length, deaths: rs.reduce((a, r) => a + r.dead, 0), complaints: rs.reduce((a, r) => a + r.complaints, 0), adyar: rs.filter((r) => r.zone === 13).length, resolved_by_closed_at: closedDayRows(o, day).length }; };
const YESTERDAY_ASKS = ["how many incidents yesterday", "how many severe incidents yesterday", "how many incidents in Adyar yesterday", "how many incidents were closed yesterday", "yesterday's incidents", "நேற்று எத்தனை புகார்கள்", "நேற்று எத்தனை புகார்கள் வந்தன", "நேற்று அடையாறில் எத்தனை புகார்கள்", "nethu evlo incidents", "nethu evlo complaints", "nethu Adyar la evlo incidents", "neththu evlo severe cases"];
async function yesterdayPart() {
  const c = await login("collector");
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const figures = Object.fromEntries(["2026-11-05", "2026-11-04", "2026-11-03"].map((d) => [d, dayFigures(o, d)]));
  const asked = [];
  for (const m of YESTERDAY_ASKS) asked.push({ m, ...(await ask(c, m)) });
  save("yesterday", { now: o.now, oracle_days: figures, asked });
  console.log(JSON.stringify({ figures, firstAnswers: asked.slice(0, 3).map((a) => a.answer) }));
}

// ---------------------------------------------------------------- BUG-008, BUG-018 across clocks --
async function tzPart() {
  const label = opt("label") ?? "tz", clock = opt("clock");
  const c = await login("collector");
  const o = loadOracle({ clock });
  const d = (await c.get("/api/collector/insights?period=monthly&part=trends")).json;
  const w = d?.trends?.weekly;
  const totals = (w?.keys ?? []).map((_, j) => w.lines.reduce((a, l) => a + (l.values[j] ?? 0), 0));
  const oracleWeeks = (w?.keys ?? []).map((k) => { const lo = Date.parse(`${k}T00:00:00Z`); return o.effective.filter((r) => r.t != null && r.t >= lo && r.t < lo + 7 * 864e5).length; });
  const today = o.now.slice(0, 10), yday = new Date(Date.parse(`${today}T00:00:00Z`) - 864e5).toISOString().slice(0, 10), before = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 864e5).toISOString().slice(0, 10);
  const y = await ask(c, "how many incidents yesterday");
  const yta = await ask(c, "நேற்று எத்தனை புகார்கள்");
  const ytg = await ask(c, "nethu evlo incidents");
  const row = { label, tz_env: opt("tz"), clock_ist: clock, console_now: o.now, keys: w?.keys ?? null, all_mondays: (w?.keys ?? []).every((k) => new Date(`${k}T00:00:00Z`).getUTCDay() === 1), weekly_totals: totals, oracle_weekly: oracleWeeks, zero_weeks: totals.filter((n) => n === 0).length,
    yesterday: { today, yday, oracle_yday: dayFigures(o, yday), oracle_before: dayFigures(o, before), en: y.answer, ta: yta.answer, tanglish: ytg.answer, headline: y.headline } };
  let all = {};
  try { all = JSON.parse(fs.readFileSync(OUT, "utf8")).tz ?? {}; } catch { /* first */ }
  all[label] = row;
  save("tz", all);
  console.log(JSON.stringify({ label, now: o.now, keys0: row.keys?.[0], keysLast: row.keys?.[11], mondays: row.all_mondays, zero: row.zero_weeks, totals, oracleWeeks, y: y.answer, oracleY: row.yesterday.oracle_yday.reported, oracleB: row.yesterday.oracle_before.reported }));
}

// ---------------------------------------------------------------- BUG-026, BUG-027 --
async function officerPart() {
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const out = { overview: [], insights: [], collector_filter: [] };
  for (const [key, dept] of [["officerA", "GCC-SWM"], ["officerB", "GCC-ELE"], ["officerC", "CMWSSB"]]) {
    const s = await login(key);
    for (const q of ["period=daily", "period=weekly", "period=monthly", "period=quarterly", "period=weekly&zone=13", "period=weekly&zone=4", "period=weekly&dept=POL-GCP", "period=weekly&dept=GCC-SWD"]) {
      const r = await s.get(`/api/officer/overview?${q}`);
      const ids = [...new Set(JSON.stringify(r.json ?? {}).match(/INC-\d{8}-[0-9A-F]+/g) ?? [])];
      const foreign = ids.filter((id) => { const x = o.rawRow(id); return x && x.dept !== dept && !o.routed.has(id); });
      const bell = r.json?.board?.bell ?? [];
      out.overview.push({ key, dept, q, http: r.status, ids: ids.length, foreign: foreign.length, foreign_ids: foreign.slice(0, 5), bell: bell.length, bell_foreign: bell.filter((b) => (b.dept ?? b.lead_dept) && (b.dept ?? b.lead_dept) !== dept).length });
    }
    const chips = await s.get("/api/collector/assistant/insights");
    const ins = await s.get("/api/officer/insights?period=daily");
    const em = (chips.json?.items ?? []).map((x) => ({ key: x.key, label: x.label ?? x.title ?? null, headline: x.headline ?? null }));
    out.insights.push({ key, dept, chips_http: chips.status, chips: em, officer_insights_http: ins.status, foreign_ids: [...new Set(JSON.stringify(ins.json ?? {}).match(/INC-\d{8}-[0-9A-F]+/g) ?? [])].filter((id) => { const x = o.rawRow(id); return x && x.dept !== dept && !o.routed.has(id); }).length });
  }
  const c = await login("collector");
  const depts = ["GCC-SWM", "GCC-ELE", "CMWSSB", "GCC-SWD", "POL-GCP", "PWD-WRD", "GCC-LND", "GCC-BRG", "GCC-EDU", "GCC-HLT", "TNPCB"];
  for (const dept of depts) for (const zone of [null, 4]) {
    const q = new URLSearchParams({ period: "daily", dept }); if (zone) q.set("zone", String(zone));
    const r = await c.get(`/api/collector/insights?${q}`);
    const emerging = r.json?.briefing?.emerging ?? [];
    out.collector_filter.push({ dept, zone, emerging: emerging.map((e) => {
      const hits = o.effective.filter((x) => x.cat === e.cat && (e.zone == null || x.zone === Number(e.zone)));
      return { cat: e.cat, zone: e.zone, observed: e.observed, text: e.text ?? e.headline ?? e.title ?? null, example: e.example ?? null, dept_rows_in_zone_all_time: hits.filter((x) => x.dept === dept).length, all_rows_in_zone_all_time: hits.length };
    }) });
  }
  save("officer", out);
  console.log(JSON.stringify({ overviewForeign: out.overview.reduce((a, x) => a + x.foreign, 0), overviewIds: out.overview.reduce((a, x) => a + x.ids, 0), bellForeign: out.overview.reduce((a, x) => a + x.bell_foreign, 0), insightForeign: out.insights.map((x) => x.foreign_ids), filter: out.collector_filter.filter((x) => x.emerging.length).map((x) => `${x.dept}/${x.zone ?? "all"}: ${x.emerging.map((e) => `${e.cat}@${e.zone} obs ${e.observed}, dept rows ${e.dept_rows_in_zone_all_time}`).join("; ")}`) }));
}

// ---------------------------------------------------------------- BUG-029 --
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function csvPart() {
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const runs = [];
  const one = async (who, s, q, dept) => {
    const r = await s.call(`/api/collector/assistant/export?${q}`);
    const t = (await r.text()).replace(/^﻿/, "");
    if (r.status !== 200) return runs.push({ who, q, http: r.status, body: t.slice(0, 120) });
    const rows = parseCsv(t), head = rows[0] ?? [], body = rows.slice(1).filter((x) => x.length > 1);
    const blanks = Object.fromEntries(head.map((h, i) => [h, body.filter((x) => String(x[i] ?? "").trim() === "").length]));
    const idCol = head.indexOf("id");
    const wrongDept = dept ? body.filter((x) => { const rr = o.rawRow(x[idCol]); return rr && rr.dept !== dept && !o.routed.has(x[idCol]); }).length : null;
    runs.push({ who, q, http: 200, columns: head, rows: body.length, uneven: body.filter((x) => x.length !== head.length).length, blanks, wrong_dept: wrongDept, unknown_ids: body.filter((x) => !o.rawRow(x[idCol])).length });
  };
  const c = await login("collector"), a = await login("officerA"), b = await login("officerB");
  for (const q of ["period=daily", "period=weekly", "period=monthly", "period=weekly&zone=13", "period=weekly&dept=GCC-SWD"]) await one("collector", c, q, q.includes("dept=") ? "GCC-SWD" : null);
  await one("officerA", a, "period=weekly", "GCC-SWM");
  await one("officerB", b, "period=weekly&dept=POL-GCP", "GCC-ELE");
  const main = await c.get("/api/collector/export?period=weekly");
  save("csv", { runs, console_export_http: main.status });
  console.log(JSON.stringify(runs.map((r) => ({ who: r.who, q: r.q, http: r.http, n: r.rows, cols: r.columns?.length, blankCols: r.blanks ? Object.entries(r.blanks).filter(([, v]) => v > 0) : null, wrong: r.wrong_dept, uneven: r.uneven }))));
}

// ---------------------------------------------------------------- BUG-028, BUG-035 --
const DURABLE = path.join(APP_ROOT, "data", "aws-cache", "qa", "srv", opt("instance", "3131"), "durable.sqlite");
async function decisionsPart() {
  const c = await login("collector"), b = await login("officerB");
  let o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const daily = o.rows({ period: "daily" }).filter((r) => r.open && !r.routed && !o.latest.has(r.id));
  const T1 = daily.find((r) => r.sev === "High" && r.dept === "GCC-ELE") ?? daily.find((r) => r.dept === "GCC-ELE");   // resolve, an electrical case the officer also sees
  const T2 = daily.find((r) => r.sev === "Severe" && r.breached);                                                     // reject, a Severe overdue one
  const T3 = daily.find((r) => r.mediaOnly && r.id !== T1?.id && r.id !== T2?.id) ?? daily.find((r) => r.id !== T1?.id && r.id !== T2?.id && r.sev === "High"); // resolve
  const T4 = o.rows({ period: "weekly" }).find((r) => r.status === "Resolved" && !o.latest.has(r.id));                  // reopen a closed one
  const ids = { T1: T1?.id, T2: T2?.id, T3: T3?.id, T4: T4?.id };
  const has = (x, id) => JSON.stringify(x ?? null).includes(id);
  async function snap(tag) {
    const s = { tag };
    const ov = (await c.get("/api/collector/overview?period=daily")).json;
    s.overview = { kpi: ov.kpi?.cur, overdue: ov.snapshot?.overdue, stories: ov.stories?.threads?.filter((t) => [T1?.id, T2?.id, T3?.id].some((id) => t.incidents.includes(id))).map((t) => ({ id: t.id, open: t.open })) };
    const ins = (await c.get("/api/collector/insights?period=daily")).json;
    s.briefing = { stats: ins.briefing?.stats, line: ins.briefing?.headline?.[1] ?? null, attention_has: Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, (ins.briefing?.attention ?? []).some((a) => a.id === id)])), followups_has: Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, has((ins.deptActions ?? []).map((d) => d.followUps), id)])) };
    const bookRows = (ins.book?.departments ?? []).flatMap((d) => d.items ?? []);
    s.book = { rows: Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, bookRows.find((x) => x.id === id)?.status ?? null])), good_serious_has: Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, (ins.book?.good?.serious ?? []).some((x) => x.id === id)])), good_resolved: ins.book?.good?.resolved ?? null };
    const oo = (await b.get("/api/officer/overview?period=daily")).json;
    s.officer = { kpi: oo.board?.kpi?.cur, counts: oo.counts };
    const oi = (await b.get("/api/officer/insights?period=daily")).json;
    s.officerInsights = (oi.modules ?? []).flatMap((m) => (m.kpis ?? []).filter((k) => /open|overdue|closed/i.test(`${k.label} ${k.sub ?? ""}`)).map((k) => `${k.label}=${k.value} (${k.sub ?? ""})`)).slice(0, 6);
    s.chat = {};
    for (const m of ["how many open incidents today", "how many overdue incidents today", "which department has the most open incidents", `what is the status of ${T1?.id}`, `what is the status of ${T2?.id}`, `what is the status of ${T4?.id}`]) { const a = await ask(c, m); s.chat[m] = `${a.headline} | ${String(a.answer ?? "").slice(0, 220).replace(/\n/g, " ")}`; }
    const oc = await ask(b, "how many open incidents today"); s.chat_officer = oc.headline;
    const warn = await ask(c, "is there a cyclone warning?"); s.warning_has = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, has(warn, id)]));
    s.cases = {};
    for (const [k, id] of Object.entries(ids)) { const r = await direct(c, "case", { id, fresh: true }); const st = stageOf(r), cd = blockOf(st, "CaseDetail"); s.cases[k] = { en: st?.say?.en ?? null, status: cd?.incident?.status ?? null, overdue: cd?.incident?.overdue ?? null }; }
    const br = await direct(c, "brief", { period: "daily", fresh: true, zones: [] });
    s.jarvis_brief = (blockOf(stageOf(br), "Kpis")?.items ?? []).map((k) => `${k.key}=${k.value}`).join(" ");
    return s;
  }
  const before = await snap("before");
  save("decisions", { ids, before });
  const made = {
    T1: await c.confirmed("/api/collector/decisions", { incidentIds: [T1.id], decision: "resolve", note: "QA pass 4 audit" }),
    T2: await c.confirmed("/api/collector/decisions", { incidentIds: [T2.id], decision: "reject", note: "QA pass 4 audit" }),
    T3: await c.confirmed("/api/collector/decisions", { incidentIds: [T3.id], decision: "resolve", note: "QA pass 4 audit" }),
    T4: await c.confirmed("/api/collector/decisions", { incidentIds: [T4.id], decision: "reopen", note: "QA pass 4 audit" })
  };
  const madeShort = Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.status]));
  const after = await snap("right after");
  save("decisions", { ids, before, made: madeShort, after });
  await sleep(65_000);
  const later = await snap("65 s after");
  save("decisions", { ids, before, made: madeShort, after, later });
  await sleep(10.5 * 60_000);
  const much_later = await snap("11.6 min after");
  save("decisions", { ids, before, made: madeShort, after, later, much_later });
  o = loadOracle({ clock: "2026-11-06 12:00:00", durableFile: fs.existsSync(DURABLE) ? DURABLE : null });
  const oracle_after = { open: o.value("open", { period: "daily" }), ongoing: o.value("ongoing", { period: "daily" }), overdue_flag: o.value("overdue_flag", { period: "daily" }), decisions_seen: [...o.latest.entries()].filter(([id]) => Object.values(ids).includes(id)) };
  save("decisions", { ids, before, made: madeShort, after, later, much_later, oracle_after });
  console.log(JSON.stringify({ made: madeShort, ids, stats: [before.briefing.stats, after.briefing.stats], oracle_after, case_after: after.cases }));
}

// ---------------------------------------------------------------- what the new findings say, on the real route --
async function extraPart() {
  const c = await login("collector");
  const o = loadOracle({ clock: "2026-11-06 12:00:00" });
  const J = ["explain the garbage complaint in Madurai", "explain the flooding complaint in Mumbai", "explain the flooding complaint in Velachery", "explain the garbage complaint in Mylapore", "Velachery flooding enna aachu", "மதுரை குப்பை புகார் விளக்கு", "வேளச்சேரி வெள்ள புகார் விளக்கு",
    "severe cases yesterday", "நேற்று கடுமையான சம்பவங்கள்", "nethu severe cases", "cases in Adyar yesterday", "cases in Adyar this week"];
  const jarvisOut = [];
  for (const text of J) {
    const r = await jarvis(c, text), st = stageOf(r), inc = blockOf(st, "CaseDetail")?.incident, list = blockOf(st, "CaseList");
    const orow = inc?.id ? o.row(String(inc.id)) : null;
    jarvisOut.push({ text, http: r.status, kind: r.json?.result?.kind ?? null, recipe: st?.recipe ?? null, note: r.json?.result?.note ?? null, title: st?.title ?? null, en: st?.say?.en ?? null, ta: st?.say?.ta ?? null, id: inc?.id ?? null, place: inc?.place ?? null, oracle_zone: orow?.zoneName ?? null, list_total: list?.total ?? null, rows_sev: list?.rows?.map((x) => x.sev).join(",") ?? null });
  }
  const A = ["how many overdue incidents this week", "evlo overdue cases indha week", "indha week evlo overdue incidents", "indha week evlo open cases", "how many incidents are still open this week", "இந்த வாரம் எத்தனை காலக்கெடு தாண்டிய சம்பவங்கள்", "இந்த வாரம் கெடு தாண்டிய சம்பவங்கள் எத்தனை", "இந்த வாரம் எத்தனை சம்பவங்கள் நிலுவையில்", "நிலுவையில் உள்ள சம்பவங்கள் எத்தனை இந்த வாரம்", "how many incidents this week", "indha week evlo incidents", "இந்த வாரம் எத்தனை சம்பவங்கள்", "நேற்று எத்தனை சம்பவங்கள்", "நேற்றைய புகார்கள் எத்தனை", "நேத்து எவ்வளவு புகார்", "how many were resolved yesterday", "how many deaths yesterday"];
  const askOut = [];
  for (const m of A) askOut.push({ m, ...(await ask(c, m)) });
  const week = { reported: o.value("reported", { period: "weekly" }), open: o.value("open", { period: "weekly" }), overdue: o.value("overdue_flag", { period: "weekly" }) };
  save("extra", { jarvis: jarvisOut, ask: askOut, oracle_week: week });
  console.log(JSON.stringify({ week }));
  for (const x of jarvisOut) console.log("J:", x.text, "=>", x.recipe, x.note, x.title, "|", String(x.en).slice(0, 120), "|", x.oracle_zone, x.list_total, x.rows_sev);
  for (const x of askOut) console.log("A:", x.m, "=>", x.headline, "|", String(x.answer).slice(0, 170));
}

// ---------------------------------------------------------------- BUG-035's other surfaces, after the decisions part --
async function afterPart() {
  const c = await login("collector");
  const { ids } = JSON.parse(fs.readFileSync(OUT, "utf8")).decisions;
  const out = {};
  const mail = await c.get(`/api/collector/incidents/${ids.T2}/action`);
  out.action_mail_for_rejected_T2 = { http: mail.status, error: mail.json?.error ?? null, subject: mail.json?.subject ?? null, body_start: String(mail.json?.body ?? "").slice(0, 400), says_rejected: /reject|closed/i.test(String(mail.json?.body ?? "")) };
  const det = await c.get(`/api/collector/incidents/${ids.T2}`);
  out.detail_T2 = { http: det.status, status: det.json?.incident?.status ?? null, open: det.json?.incident?.open ?? null };
  const mp = await c.post("/api/map/ask", { text: "open street light complaints in Perungudi this week", context: {} });
  out.map_ask = { http: mp.status, has_T1: JSON.stringify(mp.json ?? {}).includes(ids.T1), kind: mp.json?.kind ?? null };
  if (mp.json?.plan) {
    const dr = await c.post("/api/map/send", { action: "draft", plan: mp.json.plan, question: "open street light complaints in Perungudi this week" });
    out.map_draft = { http: dr.status, closed: dr.json?.closed ?? null, ids: (dr.json?.drafts ?? []).flatMap((d) => d.ids).length, has_T1: JSON.stringify(dr.json ?? {}).includes(ids.T1) };
  }
  const k = await c.call("/api/collector/assistant/chat", { method: "POST", body: JSON.stringify({ message: "how many overdue incidents this week", inputMode: "text", language: "auto", consoleScope: { period: "daily", zone: null, dept: null, cat: null, taluk: null } }) });
  const t = await k.text();
  const ans = t.split("\n\n").map((b) => { const e = b.match(/^event: (.+)$/m)?.[1]; const d = b.match(/^data: (.+)$/m)?.[1]; return e === "answer" && d ? JSON.parse(d) : null; }).filter(Boolean)[0];
  out.overdue_card_kpis = ans?.kpis ?? null;
  const ins = (await c.get("/api/collector/insights?period=daily")).json;
  out.news_only = { stat: ins.briefing?.stats?.newsOnly ?? null, lists_T3: JSON.stringify(ins.newsOnly ?? ins.news ?? null).includes(ids.T3) };
  const ov = (await c.get("/api/collector/overview?period=daily")).json;
  out.overview_mentions_T3 = Object.keys(ov ?? {}).filter((key) => JSON.stringify(ov[key] ?? null).includes(ids.T3));
  save("after", out);
  console.log(JSON.stringify(out, null, 1).slice(0, 2500));
}

// ---------------------------------------------------------------- BUG-035: a developing story, on the real route, right after and past its cache --
async function storyPart() {
  const c = await login("collector");
  const read = async () => (await c.get("/api/collector/overview?period=weekly")).json?.stories?.threads ?? [];
  const before = await read();
  const pick = before.find((t) => t.open && t.incidents?.length === 1 && !t.incidents[0].startsWith("INC-20261106"));
  if (!pick) { save("story", { note: "no open story with one incident", threads: before.length }); return console.log("none"); }
  const id = pick.incidents[0];
  const made = await c.confirmed("/api/collector/decisions", { incidentIds: [id], decision: "resolve", note: "QA pass 4 audit" });
  const right = (await read()).find((t) => t.id === pick.id);
  const out = { id, thread: pick.id, title: pick.title ?? pick.headline ?? null, made: made.status, open_before: pick.open, open_right_after: right?.open ?? null };
  save("story", out);
  await sleep(11 * 60_000);
  const later = (await read()).find((t) => t.id === pick.id);
  out.open_11_min_after = later?.open ?? null;
  out.still_listed_11_min_after = !!later;
  save("story", out);
  console.log(JSON.stringify(out));
}

const parts = { narrate: narratePart, overdue: overduePart, yesterday: yesterdayPart, tz: tzPart, officer: officerPart, csv: csvPart, decisions: decisionsPart, extra: extraPart, after: afterPart, story: storyPart };
if (!parts[part]) { console.error(`parts: ${Object.keys(parts).join(" ")}`); process.exit(2); }
await parts[part]();
void HOURS; void wallMs;
