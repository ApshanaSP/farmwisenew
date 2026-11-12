// QA pass 4: the golden master. Records what every API route answers, so a later fix can prove what it changed and what it did not.
//   node tests/qa/pass4/golden.mjs --label <name> --port <p> [--dist .next-qa] [--concurrency 6] [--width 1|2|4 | --serial] [--only reads,reads2,ask,writes]
// It starts its own servers (pinned snapshot, frozen clock, no model keys, no outbound network), signs in each role, records, stops them. There is one fresh server per
// session, because the frozen clock never resets a rate-limit window and every write must start from a fresh durable file. A server's work runs on one thread, so the
// sessions run side by side when memory allows, each in its own process: on port <p> and on 20000+<p>+1, +2, +3. --width sets how many at once; --serial is --width 1.
// The recording is the same at any width.
// Bodies (they can hold personal data) go to the gitignored data/aws-cache/qa/golden/<label>/. The manifest goes to docs/qa/pass4/golden/<label>.manifest.json.
// See docs/qa/pass4/golden/README.md and NORMALISE.md. Compare two recordings with golden-diff.mjs. Exit code: 0 clean, 2 the recording itself has a problem.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { APP_ROOT, FROZEN_NOW, PIN_DIR, QA_DIR, RUN_DIR } from "./lib/env.mjs";
import { inventory } from "./lib/golden-inventory.mjs";
import { isText, maskPersonal, normaliseText as normaliseWith } from "./lib/golden-normalise.mjs";
import { SCREEN, getPlan, loadSamples } from "./lib/golden-plan.mjs";
import { SENTENCES } from "./lib/golden-sentences.mjs";
import { accounts } from "../seed-local-users.mjs";

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const label = opt("label"), port = Number(opt("port")), dist = opt("dist", ".next-qa"), concurrency = Number(opt("concurrency", 6)), part = opt("part");
if (!label || !/^[A-Za-z0-9._-]+$/.test(label) || !port) { console.error("usage: golden.mjs --label <name> --port <p> [--dist .next-qa] [--concurrency 6] [--width 1|2|4 | --serial] [--only reads,reads2,ask,writes]"); process.exit(2); }

const BASE = `http://127.0.0.1:${port}`;
const OUT = path.join(QA_DIR, "golden", label);
const BODIES = path.join(OUT, "bodies");
const DOCS = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "golden");
const FIXTURES = path.join(QA_DIR, "golden", "_fixtures");
const SERVER = path.join(APP_ROOT, "tests", "qa", "pass4", "server.mjs");
/** Files in data/aws-cache that outside feeds and other servers rewrite (NORMALISE.md). */
const CACHE_FILES = ["aibrief.json", "analysis.json", "nearby-news.json", "cmwssb-lakes.json", "news-fulltext.json", "sachet-chennai.json", "map-questions.jsonl"];
/** A 429 here would be an accident of the frozen clock: nothing in a recording may hit a limit. */
const ROLE_KEYS = { citizenA: "citizenA", officerA: "officerA", officerB: "officerB", collector: "collector" };
const ROLES = ["anonymous", "citizenA", "officerA", "officerB", "collector"];
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!part) fs.rmSync(OUT, { recursive: true, force: true }); // a part is one process of a recording its parent has just cleared
fs.mkdirSync(BODIES, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });

const inv = inventory(APP_ROOT);
const samples = loadSamples();
const plan = getPlan(inv, samples);
const normaliseText = (text, captured) => normaliseWith(text, captured, samples.knownUuids);
const accs = Object.fromEntries(accounts().map((a) => [a.key, a]));
const routeMatchers = inv.map((r) => ({ route: r.route, re: new RegExp(`^${r.route.replace(/\[[^\]]+\]/g, "[^/]+")}$`), dyn: r.segments.length })).sort((a, b) => a.dyn - b.dyn);
const routeOf = (url) => { const p = url.split("?")[0]; return routeMatchers.find((m) => m.re.test(p))?.route ?? p; };

// ---- fixtures: a private, unchanging copy of the files feeds rewrite. Made once, from what is there at the first recording.
function fixtures() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  // once made, the set never changes: a feed file that appears later (analysis.json, say) must not join it between two recordings
  const sealed = path.join(FIXTURES, "SEALED");
  const first = !fs.existsSync(sealed);
  const out = {};
  for (const f of CACHE_FILES) {
    const to = path.join(FIXTURES, f), from = path.join(APP_ROOT, "data", "aws-cache", f);
    if (first && !fs.existsSync(to) && fs.existsSync(from)) fs.copyFileSync(from, to);
    out[f] = fs.existsSync(to) ? sha256(fs.readFileSync(to)).slice(0, 16) : null;
  }
  if (first) fs.writeFileSync(sealed, "Do not add to or change this folder: see docs/qa/pass4/golden/NORMALISE.md.\n");
  return out;
}

// ---- the server, one per session, on a clean folder
const instance = path.join(QA_DIR, "srv", String(port));
const stopServer = () => { try { execFileSync(process.execPath, [SERVER, "stop", "--port", String(port)], { cwd: APP_ROOT, stdio: "ignore" }); } catch { /* not running */ } };
async function wipe(dir) {
  for (let i = 0; i < 40; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { await sleep(500); } // Windows holds a file for a moment after the process ends
  }
  throw new Error(`could not clear ${dir}`);
}
const session = { name: "", cookies: {}, captured: new Map(), keyCount: new Map(), netLog: "" };
async function startServer(name) {
  stopServer();
  await wipe(instance);
  const cache = path.join(instance, "golden-cache");
  fs.mkdirSync(cache, { recursive: true });
  for (const f of CACHE_FILES) if (fs.existsSync(path.join(FIXTURES, f))) fs.copyFileSync(path.join(FIXTURES, f), path.join(cache, f));
  const rel = (p) => path.relative(APP_ROOT, p);
  const require = (p) => `--require=${path.join(APP_ROOT, "tests", "qa", "pass4", p).replace(/\\/g, "/")}`;
  const netLog = path.join(instance, "refused-network.log");
  const env = {
    DISTRICT_IQ_JOBS: "off", SACHET_OFF: "1",
    STUDIO_DIR: rel(path.join(instance, "studio")), DATASET_DIR: path.join(instance, "datasets"),
    OFFICER_UPLOAD_DIR: path.join(instance, "officer-photos"), COMPLAINT_UPLOAD_DIR: path.join(instance, "complaint-media"),
    GOLDEN_CACHE_DIR: cache, GOLDEN_CACHE_FILES: CACHE_FILES.join(","), GOLDEN_NET_LOG: netLog,
    NODE_OPTIONS: `--max-old-space-size=2048 ${require("freeze-clock.cjs")} ${require("golden-preload.cjs")}`
  };
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
  const out = execFileSync(process.execPath, [SERVER, "start", "--port", String(port), "--frozen", "--dist", dist, ...envArgs], { cwd: APP_ROOT, encoding: "utf8" });
  const started = JSON.parse(out.trim().split(/\r?\n/).pop());
  if (started.signIn !== 200) throw new Error(`the server did not sign in: ${started.signIn}`);
  Object.assign(session, { name, cookies: {}, captured: new Map(), keyCount: new Map(), netLog });
}
function endSession(meta) {
  const log = path.join(RUN_DIR, `srv-${port}.log`);
  const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  fs.writeFileSync(path.join(OUT, `server-${session.name}.log`), text);
  // a server with no model says so on every model call: that is expected here, not an error
  const errors = text.split(/\r?\n/).filter((l) => /^\s*(?:⨯|Error\b|TypeError\b|RangeError\b|ReferenceError\b|SyntaxError\b)|\b(?:failed|unhandled|exception)\b/i.test(l) && !/^\s+at |No AI provider|no model answered|^\s*\[jarvis llm\]/.test(l));
  const refused = fs.existsSync(session.netLog) ? fs.readFileSync(session.netLog, "utf8").split(/\r?\n/).filter(Boolean).sort() : [];
  const kinds = [...new Set(errors.map((l) => normaliseText(l.trim()).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "(email)").slice(0, 160)))].sort();
  meta.sessions.push({ name: session.name, server_error_lines: errors.length, server_errors: kinds.slice(0, 20), refused_hosts: refused });
  stopServer();
}

// ---- one recorded request
const requests = [];
const timings = [];
const problems = [];
const stored = new Set();
const LIMIT_OK = new Set();
function store(hash, bytes) {
  if (stored.has(hash)) return;
  stored.add(hash);
  // another session may be writing these same bytes right now: it finishes the job
  try { fs.writeFileSync(path.join(BODIES, `${hash}.gz`), zlib.gzipSync(bytes, { level: 6 }), { flag: "wx" }); } catch (e) { if (!["EEXIST", "EBUSY", "EPERM"].includes(e.code)) throw e; }
}
/** Registers a request now (its place and id never depend on timing); `run` makes it. */
function prepare(role, method, url, o = {}) {
  const logical = decodeURIForLog(normaliseText(url, session.captured));
  const bodyKey = o.secret ? (o.note ?? "") : o.form ? (o.note ?? "form") : o.body !== undefined ? normaliseText(JSON.stringify(o.body), session.captured) : "";
  const base = `${session.name}|${role}|${method}|${logical}|${bodyKey}`;
  const n = session.keyCount.get(base) ?? 0;
  session.keyCount.set(base, n + 1);
  const id = sha256(`${base}|${n}`).slice(0, 16);
  const entry = { id, session: session.name, role, method, url: maskPersonal(logical), route: routeOf(url), status: null, bytes: 0, sha256: null };
  if (o.note) entry.note = o.note;
  if (o.body !== undefined && !o.secret) entry.request = maskPersonal(normaliseText(JSON.stringify(o.body), session.captured)).slice(0, 400);
  requests.push(entry);
  return { entry, role, method, url, o };
}
function decodeURIForLog(u) { try { return decodeURI(u); } catch { return u; } }

/** One connection per request: a server busy on a long query closes idle kept-alive sockets as it wakes, which would look like a failed request. */
function exchange(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + url, { method, headers: { ...headers, ...(body ? { "content-length": body.length } : {}) }, agent: false, timeout: 300_000 }, (res) => {
      const parts = [];
      res.on("data", (d) => parts.push(d));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(parts) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end(body);
  });
}

async function send(role, method, url, o) {
  const headers = { ...(o.headers ?? {}) };
  if (session.cookies[role]) headers.cookie = session.cookies[role];
  let body = null;
  if (o.form) {
    const r = new Response(o.form());
    headers["content-type"] = r.headers.get("content-type");
    body = Buffer.from(await r.arrayBuffer());
  } else if (o.body !== undefined) { headers["content-type"] = "application/json"; body = Buffer.from(JSON.stringify(o.body)); }
  return exchange(method, url, headers, body);
}

async function run(job) {
  const { entry, role, method, url, o } = job;
  let res, buf;
  const t1 = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      res = await send(role, method, url, o);
      buf = res.buf;
    } catch (e) {
      entry.status = 0;
      problems.push(`${role} ${method} ${entry.url}: no answer (${e.code ?? e.name})`);
      return { status: 0, text: "", json: null };
    }
    // the Briefing's write-up: a page that gets `pending` asks again, so the tool does too; the wait is a real timer, and a busy machine must not change the record
    if (entry.route === "/api/collector/brief" && res.status === 200 && /"pending":true/.test(buf.toString("utf8"))) {
      if (attempt < 40) { await sleep(1000); continue; }
      problems.push(`${role} ${method} ${entry.url}: still pending after 40 tries`);
    }
    break;
  }
  timings.push({ ms: Date.now() - t1, role, url: entry.url, session: session.name });
  const type = res.headers["content-type"] ?? "";
  let saved = buf, text = "";
  if (isText(type)) {
    const raw = buf.toString("utf8");
    o.capture?.(raw, session.captured);
    text = normaliseText(raw, session.captured);
    saved = Buffer.from(text, "utf8");
  }
  const hash = sha256(saved);
  store(hash, saved);
  Object.assign(entry, { status: res.status, bytes: saved.length, sha256: hash, type: type.split(";")[0] || null });
  const disp = res.headers["content-disposition"], cache = res.headers["cache-control"], rows = res.headers["x-rows"];
  if (disp) entry.disposition = normaliseText(disp, session.captured);
  if (cache) entry.cache = cache;
  if (rows) entry.x_rows = rows;
  if (res.status === 429 && !LIMIT_OK.has(entry.route)) problems.push(`${role} ${method} ${entry.url}: 429, a limit bit the recording`);
  const rawText = isText(type) ? buf.toString("utf8") : "";
  let json = null;
  try { json = /json/i.test(type) ? JSON.parse(rawText) : null; } catch { /* left as text */ }
  return { status: res.status, text: rawText, json };
}
const call = (role, method, url, o = {}) => run(prepare(role, method, url, o));
const get = (role, url, o = {}) => call(role, "GET", url, o);
const post = (role, url, body, o = {}) => call(role, "POST", url, { ...o, body });

/** Runs jobs (already registered, in a fixed order) with a few at a time. */
async function pool(jobs, n = concurrency) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < jobs.length) await run(jobs[next++]); }));
}

async function signIn() {
  for (const role of ROLES.slice(1)) {
    const a = accs[ROLE_KEYS[role]];
    const j = prepare(role, "POST", "/api/auth/login", { secret: true, note: "sign in" });
    // done by hand: the cookies are the point, and they never reach the record
    const r = await exchange("POST", "/api/auth/login", { "content-type": "application/json" }, Buffer.from(JSON.stringify({ email: a.email, password: a.password })));
    const text = r.buf.toString("utf8");
    session.cookies[role] = (r.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
    const hash = sha256(text);
    store(hash, Buffer.from(text, "utf8"));
    Object.assign(j.entry, { status: r.status, bytes: Buffer.byteLength(text), sha256: hash, type: "application/json" });
    if (r.status !== 200) problems.push(`${role}: sign-in answered ${r.status}`);
  }
}

/** "Confirm it's you": the request without a grant (428, on the record), the password check, then the request with the grant. */
async function confirmed(role, method, url, o = {}) {
  const first = await call(role, method, url, { ...o, note: `${o.note ?? ""} no grant`.trim() });
  if (first.status !== 428) return first;
  const c = first.json.confirm;
  const check = await post(role, "/api/auth/confirm", { step: "check", action: c.action, scope: c.scope, summary: c.summary, method: "password", code: accs[ROLE_KEYS[role]].password },
    { secret: true, note: `confirm ${c.action} ${o.note ?? ""}`.trim() });
  if (check.status !== 200) { problems.push(`${role}: confirm answered ${check.status}`); return first; }
  return call(role, method, url, { ...o, headers: { ...(o.headers ?? {}), "x-diq-grant": check.json.grant }, note: `${o.note ?? ""} with grant`.trim() });
}

// ---- session 1: every GET route, for every role, with its scopes
const SEQUENTIAL_READS = new Set(["/api/collector/audit", "/api/auth/security", "/api/collector/thunai/audit", "/api/collector/assistant/export"]);
/** The slowest routes, on a server of their own. Every role asks each route on one server, so an answer that leaks from one role to another through a route's cache still shows. */
const READS2 = /^\/api\/(?:officer\/|collector\/(?:insights|report)$)/;
async function sessionReads2() {
  await signIn();
  const urls = plan.urls.filter((u) => READS2.test(u.route));
  await pool(ROLES.flatMap((role) => urls.map((u) => prepare(role, "GET", u.url))));
}
async function sessionReads() {
  await signIn();
  // the routes every role may read and the scoped ones: a few at a time
  const urls = plan.urls.filter((u) => !SEQUENTIAL_READS.has(u.route) && !READS2.test(u.route));
  await pool(ROLES.flatMap((role) => urls.map((u) => prepare(role, "GET", u.url))));

  // ids only a response can give
  const near = await get("collector", "/api/collector/nearby", { note: "for its event ids" });
  const events = [...new Set((near.json?.watch ?? []).map((e) => e.id))].sort().slice(0, 3);
  for (const id of events) for (const role of ["officerA", "collector"]) await get(role, `/api/collector/nearby?event=${encodeURIComponent(id)}`);
  const rains = await get("collector", "/api/rehearsal/rains", { note: "for its replay ids" });
  const replays = (rains.json?.rains ?? rains.json?.items ?? []).map((r) => r.id).filter(Boolean).slice(0, 2);
  const rehearsal = await get("collector", "/api/rehearsal/state", { note: "for its facility ids" });
  const facilities = (rehearsal.json?.facilities ?? []).map((f) => ({ id: String(f.id), kind: f.kind })).sort((a, b) => a.id.localeCompare(b.id));
  const reach = [...new Set(facilities.map((f) => f.kind))].sort().map((k) => facilities.find((f) => f.kind === k).id).slice(0, 2).map(encodeURIComponent);
  if (!reach.length) problems.push("rehearsal/state gave no facility ids, so rehearsal/reach only shows its refusals");
  for (const id of reach) for (const q of ["", "&t=5", "&t=15"]) await get("collector", `/api/rehearsal/reach?id=${id}${q}`);
  if (reach[0]) await get("officerA", `/api/rehearsal/reach?id=${reach[0]}`);
  for (const r of replays) {
    await get("collector", `/api/rehearsal/state?replay=${r}`);
    if (reach[0]) await get("collector", `/api/rehearsal/reach?id=${reach[0]}&replay=${r}`);
  }

  // exports. The Collector's needs a confirmation; the assistant's is limited to 10 a day per person, and audited
  for (const q of ["", "?period=weekly", "?period=monthly&zone=13", `?period=quarterly&dept=GCC-SWM`, `?period=monthly&cat=${samples.cats[0]}`, `?period=weekly&taluk=${samples.taluks[0]}`]) {
    await confirmed("collector", "GET", `/api/collector/export${q}`, { note: "export" });
  }
  const assistantExports = ["", "?period=weekly", "?period=monthly&zone=13", "?period=quarterly&dept=GCC-SWM", "?period=monthly&dept=CMWSSB", "?zone=5"];
  for (const role of ROLES) for (const q of assistantExports) await get(role, `/api/collector/assistant/export${q}`);

  await askInContext();
  // Ask District IQ: the first 20 for the Collector and officer A, the last 20 for officer B (20 a minute per person, and the frozen clock never starts a new minute)
  for (let i = 0; i < 20; i++) await say("collector", i);
  for (let i = 0; i < 20; i++) await say("officerA", i);
  for (let i = 20; i < 40; i++) await say("officerB", i);
  await say("citizenA", 0);
  await say("anonymous", 0);

  // last, one at a time: the logs that show what came before
  for (const role of ROLES) for (const route of ["/api/collector/audit", "/api/auth/security", "/api/collector/thunai/audit"]) await get(role, route);
}

// ---- what reads or computes through POST
const sentence = (i) => SENTENCES[i % SENTENCES.length];
const say = (role, i, extra = {}) => post(role, "/api/collector/assistant/chat", { message: sentence(i), ...extra });
const sseDone = (text) => {
  const m = [...text.matchAll(/event: done\ndata: (.*)\n/g)].pop();
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};

/** Ask the Map with what the page holds (a zone, a taluk, an incident, a ward, a drawn circle), a follow-up on an answer, Thunai's agent, and what the rehearsal computes. */
async function askInContext() {
  const contexts = [
    { zone: 13, taluk: null, incidentId: null, ward: null, drawn: null },
    { zone: null, taluk: samples.taluks[0], incidentId: null, ward: null, drawn: null },
    { zone: null, taluk: null, incidentId: samples.inc.swmOpen[0], ward: null, drawn: null },
    { zone: null, taluk: null, incidentId: null, ward: 170, drawn: null },
    { zone: null, taluk: null, incidentId: null, ward: null, drawn: { lat: 13.0067, lon: 80.2206, r: 1500 } }
  ];
  for (const role of ["collector", "officerA"]) {
    for (const context of contexts) await post(role, "/api/map/ask", { text: null, context });
    for (const context of contexts) await post(role, "/api/map/ask", { text: "how many open cases here?", context });
  }
  const base = await post("collector", "/api/map/ask", { text: "open garbage complaints in Adyar this month" });
  for (const text of ["only the severe ones", "and in Teynampet?", "நிலுவையில் உள்ளவை மட்டும்"]) await post("collector", "/api/map/ask", { text, prev: base.json?.plan ?? null }, { note: "follow-up" });
  if (base.json?.plan) await post("collector", "/api/map/ask", { text: null, plan: base.json.plan }, { note: "a chip's plan" });
  await post("collector", "/api/map/ask", { text: null, context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } });
  // Thunai v2 (the code lanes; the model lane answers "no model" here)
  for (let i = 0; i < 12; i++) await post("collector", "/api/collector/thunai/agent", { text: sentence(i * 3), state: SCREEN });
  for (const [role, state] of [["collector", "normal"], ["collector", "rehearsal"], ["officerA", "rehearsal"], ["citizenA", "rehearsal"]]) {
    await post(role, "/api/rehearsal/route", { from: { lat: 13.0067, lon: 80.2206 }, to: { lat: 13.0827, lon: 80.2707 }, state });
  }
  await post("collector", "/api/rehearsal/plan", { action: "draft", manual: false, keys: null });
  await post("collector", "/api/rehearsal/plan", { action: "draft", manual: true, keys: null });
}

// ---- session 2: the 40 sentences. A frozen clock never resets a window, so this needs its own server
async function sessionAsk() {
  await signIn();
  const plans = [];
  for (const [role, count] of [["collector", 40], ["officerA", 20], ["officerB", 20]]) {
    for (let i = 0; i < count; i++) {
      const at = role === "officerB" ? i + 20 : i;
      const r = await post(role, "/api/map/ask", { text: sentence(at) });
      if (role === "collector" && r.json?.plan) plans.push({ i, plan: r.json.plan });
    }
  }
  const picked = plans.filter((p) => p.plan?.steps).slice(0, 10);
  for (const p of picked.slice(0, 8)) await post("collector", "/api/map/insight", { plan: p.plan }, { note: `plan of sentence ${p.i}` });
  for (const p of picked.slice(0, 3)) await post("officerA", "/api/map/insight", { plan: p.plan }, { note: `plan of sentence ${p.i}` });
  await post("citizenA", "/api/map/insight", { plan: picked[0]?.plan ?? null }, { note: "not allowed" });
  await post("anonymous", "/api/map/ask", { text: sentence(0) });
  await post("citizenA", "/api/map/ask", { text: sentence(0) });

  // the map's exports: exactly the answer's rows, in both formats
  for (const p of picked.slice(0, 3)) for (const format of ["csv", "geojson"]) {
    await confirmed("collector", "POST", "/api/map/export", { body: { plan: p.plan, question: sentence(p.i), format }, note: `plan of sentence ${p.i}` });
  }
  if (picked[0]) await confirmed("officerA", "POST", "/api/map/export", { body: { plan: picked[0].plan, question: sentence(picked[0].i), format: "csv" }, note: `plan of sentence ${picked[0].i}` });
  // the drafts only: nothing is ever sent
  for (const p of picked.slice(0, 3)) await post("collector", "/api/map/send", { action: "draft", plan: p.plan, question: sentence(p.i) }, { note: `plan of sentence ${p.i}` });

  // Jarvis: understood by the model (none here, so the plan is empty) or by the code lanes
  for (let i = 0; i < 40; i++) await post("collector", "/api/collector/thunai/plan", { text: sentence(i), state: SCREEN, turns: [] });
  await post("officerA", "/api/collector/thunai/plan", { text: sentence(0), state: SCREEN, turns: [] });
  const stages = [];
  for (let i = 0; i < 40; i++) {
    const turnId = `golden-${i}`;
    let r = await post("collector", "/api/collector/thunai/agent/round", { text: sentence(i), state: SCREEN, turnId, round: 0 });
    for (let k = 1; k <= 3 && r.json && r.json.done === false; k++) r = await post("collector", "/api/collector/thunai/agent/round", { text: sentence(i), state: SCREEN, turnId, round: k, observations: [] });
    const st = r.json?.result?.stage;
    if (st?.recipe && st.slots) stages.push({ i, stage: st, say: r.json.result.say ?? "" });
  }
  await post("anonymous", "/api/collector/thunai/agent/round", { text: sentence(0), state: SCREEN, turnId: "golden-anon", round: 0 });
  // a Stage control: the same screen asked for directly, built by code
  for (const s of stages.slice(0, 15)) {
    await post("collector", "/api/collector/thunai/agent/round", { text: sentence(s.i), state: SCREEN, turnId: `golden-direct-${s.i}`, round: 0, direct: { recipe: s.stage.recipe, slots: s.stage.slots, lang: /[஀-௿]/.test(sentence(s.i)) ? "ta" : "en" } }, { note: `direct, sentence ${s.i}` });
  }
  // following on from a screen: elliptical sentences, answered by code
  const first = stages[0];
  if (first) {
    const stage = { recipe: first.stage.recipe, title: String(first.stage.title ?? "").slice(0, 200), blocks: (first.stage.blocks ?? []).slice(0, 6).map((b) => ({ kind: String(b.kind).slice(0, 20), ids: [] })), slots: first.stage.slots, focus: null };
    for (const [k, text] of ["and in Adyar?", "why?", "the second one", "அடையாறில்?"].entries()) {
      await post("collector", "/api/collector/thunai/agent/round", { text, state: SCREEN, turnId: `golden-follow-${k}`, round: 0, stage, turns: [{ heard: sentence(first.i), did: "showed a screen" }], lastText: sentence(first.i) }, { note: "follow-on" });
    }
  }

  // Ask District IQ: the Collector's other 20 sentences
  let sessionId = null;
  for (let i = 20; i < 40; i++) {
    const r = await say("collector", i);
    sessionId ??= sseDone(r.text)?.sessionId ?? null;
  }
  const own = await say("officerA", 0);
  const officerSession = sseDone(own.text)?.sessionId ?? null;

  for (const role of ["officerA", "officerB", "collector"]) await get(role, "/api/collector/assistant/sessions");
  // one person's conversation, read by its owner and by someone else
  if (sessionId) for (const role of ["collector", "officerA"]) await get(role, `/api/collector/assistant/sessions/${sessionId}`);
  if (officerSession) for (const role of ["officerA", "officerB", "collector"]) await get(role, `/api/collector/assistant/sessions/${officerSession}`);
  await get("collector", "/api/collector/audit");
}

// ---- session 3: a fixed sequence of writes on a fresh durable file, then the routes they should change
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const report = (remarks, step) => () => {
  const f = new FormData();
  f.set("remarks", remarks);
  f.set("step", step);
  f.append("photos", new Blob([PNG], { type: "image/png" }), "work.png");
  return f;
};
const name = (m, value, tag) => { if (value && !m.has(String(value))) m.set(String(value), `<${tag}-${[...m.values()].filter((v) => v.startsWith(`<${tag}-`)).length + 1}>`); };
const capturePhotoDirs = (text, m) => { for (const x of text.matchAll(/\b(\d{8}-[a-f0-9]{16})\b/g)) if (!samples.knownPhotoDirs.has(x[1]) && /photo/i.test(text.slice(Math.max(0, x.index - 60), x.index))) name(m, x[1], "photo-dir"); };

async function sessionWrites() {
  await signIn();
  const { inc } = samples;

  // a citizen files a complaint, then a double click, then reads it back
  const complaint = {
    firstName: "Qa", lastName: "CitizenA", gender: "Female", streetAddress: "1 Golden Test Street", mobileNumber: accs.citizenA.mobile,
    zoneId: 13, manualStreetName: "Golden Test Street", streetType: "Street", wardNumber: 170, complaintSubtypeId: samples.subtype.id,
    title: "Golden master test complaint", description: "A fixed test complaint from the QA golden master.", isAnonymous: false
  };
  const filed = await post("citizenA", "/api/complaints", complaint, { capture: (t, m) => { try { name(m, JSON.parse(t).complaintCode, "new-complaint-code"); } catch { /* an error body */ } } });
  await post("citizenA", "/api/complaints", complaint, { note: "the same complaint again" });
  await post("anonymous", "/api/complaints", complaint);
  const code = filed.json?.complaintCode;
  await get("citizenA", "/api/complaints");
  if (code) {
    await get("citizenA", `/api/complaints/${code}`);
    await get("citizenA", `/api/complaints?code=${code}`);
    await get("collector", `/api/collector/search?q=${code}`);
    await get("officerA", `/api/complaints/${code}`);
  }

  // the Collector: a note, an action, then decisions that need a confirmation; the routes they change are read back
  const noted = inc.swmOpen[0], escalated = inc.severeOpen[1], verified = inc.severeOpen[2];
  await post("collector", "/api/collector/decisions", { incidentId: noted, decision: "note", note: "Golden master note." });
  await get("collector", `/api/collector/incidents/${noted}`);
  await get("officerA", `/api/officer/grievances/${noted}`);
  const act = await post("collector", "/api/collector/actions", { incidentId: noted, text: "Golden master action for the department." });
  if (act.json?.actionId) await post("collector", "/api/collector/actions", { incidentId: noted, actionId: act.json.actionId, status: "In progress" });
  await get("collector", `/api/collector/incidents/${noted}`);
  await post("officerA", "/api/collector/decisions", { incidentId: noted, decision: "note", note: "An officer may not do this." });
  await post("collector", "/api/collector/decisions", { incidentId: "INC-00000000-000000", decision: "note", note: "No such incident." });
  await confirmed("collector", "POST", "/api/collector/decisions", { body: { incidentId: escalated, decision: "escalate", note: "Golden master escalation." }, note: "escalate" });
  await get("collector", `/api/collector/incidents/${escalated}`);
  await confirmed("collector", "POST", "/api/collector/decisions", { body: { incidentId: verified, decision: "verify" }, note: "verify" });
  await get("collector", `/api/collector/incidents/${verified}`);
  await post("collector", "/api/collector/decisions", { incidentId: verified, decision: "reopen" });
  await get("collector", `/api/collector/incidents/${verified}`);
  for (const q of ["", "?status=awaiting", "?status=verified&period=quarterly"]) await get("collector", `/api/collector/list${q}`);
  await get("collector", "/api/collector/overview");
  await get("collector", "/api/collector/overview?period=weekly&zone=13");

  // officers work cases of their own department. A case that is not severe is closed by the department; a severe one goes to the Collector
  const list = await get("officerA", "/api/officer/grievances?tab=new&per=4");
  const cases = (list.json?.rows ?? []).map((r) => r.id);
  const [one, two] = cases;
  const otherDept = inc.eleOpen[0];
  if (one) {
    await post("officerA", `/api/officer/grievances/${one}`, { step: "approve" });
    await get("officerA", `/api/officer/grievances/${one}`);
    await confirmed("officerA", "POST", `/api/officer/grievances/${one}/report`, { form: report("Golden master report: sent to the Collector, though not severe.", "send"), note: "report, send, not severe", capture: capturePhotoDirs });
    await get("officerA", `/api/officer/grievances/${one}`, { capture: capturePhotoDirs });
    await get("officerB", `/api/officer/grievances/${one}`);
    await get("collector", `/api/collector/incidents/${one}`, { capture: capturePhotoDirs });
  }
  if (two) {
    await post("officerA", `/api/officer/grievances/${two}`, { step: "approve" });
    await confirmed("officerA", "POST", `/api/officer/grievances/${two}/report`, { form: report("Golden master report: closed by the department.", "close"), note: "report, close", capture: capturePhotoDirs });
    const after = await get("officerA", `/api/officer/grievances/${two}`, { capture: capturePhotoDirs });
    await get("collector", `/api/collector/incidents/${two}`, { capture: capturePhotoDirs });
    const photo = /\/api\/officer\/photos\/[^"]+/.exec(after.text)?.[0];
    if (photo) for (const role of ROLES) await get(role, photo);
  }
  const severeCase = inc.severeOwn[0];
  if (severeCase) {
    await post("officerB", `/api/officer/grievances/${severeCase}`, { step: "approve" }, { note: "a severe case" });
    await confirmed("officerB", "POST", `/api/officer/grievances/${severeCase}/report`, { form: report("Golden master report: severe case, sent to the Collector.", "send"), note: "report, send, severe", capture: capturePhotoDirs });
    await get("officerB", `/api/officer/grievances/${severeCase}`, { capture: capturePhotoDirs });
    await get("collector", `/api/collector/incidents/${severeCase}`, { capture: capturePhotoDirs });
    await get("collector", "/api/collector/list?status=awaiting");
    await confirmed("collector", "POST", "/api/collector/decisions", { body: { incidentId: severeCase, decision: "verify" }, note: "verify the officer's case" });
    await get("officerB", `/api/officer/grievances/${severeCase}`, { capture: capturePhotoDirs });
    await get("officerB", "/api/officer/overview?meta=1");
  }
  await post("officerA", `/api/officer/grievances/${otherDept}`, { step: "approve" }, { note: "another department's case" });
  await confirmed("officerA", "POST", `/api/officer/grievances/${otherDept}/report`, { form: report("Golden master report on a case of another department.", "send"), note: "another department's case", capture: capturePhotoDirs });
  await post("citizenA", `/api/officer/grievances/${one ?? otherDept}`, { step: "approve" }, { note: "a citizen" });
  for (const tab of ["new", "action", "sent", "verified", "all"]) await get("officerA", `/api/officer/grievances?tab=${tab}`, { capture: capturePhotoDirs });
  await get("officerA", "/api/officer/overview?meta=1");
  await get("officerA", "/api/officer/overview");
  await get("officerB", "/api/officer/overview?meta=1");
  await get("collector", "/api/collector/list?status=awaiting");

  // Jarvis's memory and audit trail
  const memoryIds = (t, m) => { for (const x of t.matchAll(/"id":"([^"]+)"/g)) name(m, x[1], "memory-id"); };
  await post("collector", "/api/collector/thunai/memory", { op: "note", text: "Golden master note to remember." }, { capture: memoryIds });
  await get("collector", "/api/collector/thunai/memory", { capture: memoryIds });
  // the line's hash covers its random id, so it is as random as the id
  await post("collector", "/api/collector/thunai/audit", { heard: "golden master", plan: [], risk: "A", approval: null, outcome: "recorded" }, { capture: (t, m) => { try { const j = JSON.parse(t); name(m, j.id, "audit-id"); name(m, j.hash, "audit-hash"); } catch { /* an error body */ } } });
  await get("collector", "/api/collector/thunai/audit");

  // "Save as workspace" from a briefing answer: the console's own briefing, frozen. It computes, then writes
  await post("collector", "/api/collector/assistant/briefing", { period: "weekly" });
  await post("officerA", "/api/collector/assistant/briefing", { period: "weekly" });
  // a saved workspace
  const saved = await post("collector", "/api/collector/workspaces", { name: "Golden workspace", filters: { period: "weekly" }, layout: { panels: {} } });
  const wid = saved.json?.id ?? saved.json?.workspace_id ?? saved.json?.workspaceId;
  await get("collector", "/api/collector/workspaces");
  if (wid) { await get("collector", `/api/collector/workspaces/${wid}`); await get("officerA", `/api/collector/workspaces/${wid}`); }
  await call("collector", "PATCH", "/api/collector/workspaces", { body: { from: "Golden workspace", to: "Golden workspace 2" } });
  await get("collector", "/api/collector/workspaces");
  await call("collector", "DELETE", "/api/collector/workspaces?name=Golden%20workspace%202");
  await get("collector", "/api/collector/workspaces");

  // an answer pinned, rated and read back
  const chat = await say("collector", 1);
  const done = sseDone(chat.text);
  await get("collector", "/api/collector/assistant/sessions");
  if (done?.messageId) {
    const pin = await post("collector", "/api/collector/assistant/pins", { messageId: done.messageId }, { note: "the last answer" });
    await get("collector", "/api/collector/assistant/pins");
    await post("collector", "/api/collector/assistant/feedback", { messageId: done.messageId, rating: 1 }, { note: "the last answer" });
    await get("collector", `/api/collector/assistant/sessions/${done.sessionId}`);
    if (pin.json?.id) await call("collector", "DELETE", `/api/collector/assistant/pins?id=${pin.json.id}`);
    await get("collector", "/api/collector/assistant/pins");
  }

  // a sample dataset in Data Studio, its reads and exports (the PDF brief is excluded: NORMALISE.md)
  const added = await post("collector", "/api/collector/studio", { sample: "fever" }, { capture: (t, m) => { for (const x of t.matchAll(/"t":"done","id":"([^"]+)"/g)) name(m, x[1], "dataset"); for (const x of t.matchAll(/"id":"([^"]+)","t":"done"/g)) name(m, x[1], "dataset"); } });
  const id = /"id":"([^"]+)"[^}]*}\s*$/.exec(added.text.trim())?.[1];
  await get("collector", "/api/collector/studio");
  await get("collector", "/api/collector/studio/watch");
  if (id) {
    const narrowed = `?f=${encodeURIComponent(JSON.stringify([{ col: "c0", op: "neq", values: ["no such value"] }]))}`;
    for (const q of ["", "?rows=1", "?export=csv", "?export=xlsx", narrowed, `${narrowed}&export=csv`, "?f=bad"]) await get("collector", `/api/collector/studio/${encodeURIComponent(id)}${q}`);
    await get("officerA", `/api/collector/studio/${encodeURIComponent(id)}`);
  }

  // the logs of it all
  for (const role of ROLES) for (const route of ["/api/collector/audit", "/api/auth/security"]) await get(role, route);
}

// ---- one session in one process (--part): it writes what it recorded for the parent, which writes the manifest
const SESSIONS = { reads: sessionReads, reads2: sessionReads2, ask: sessionAsk, writes: sessionWrites };
if (part) {
  const meta = { sessions: [] };
  const t1 = Date.now();
  try {
    await startServer(part);
    await SESSIONS[part]();
    endSession(meta);
    meta.sessions[0].seconds = Math.round((Date.now() - t1) / 1000);
    console.log(`${part}: ${requests.length} requests, ${meta.sessions[0].seconds} s`);
  } catch (e) {
    problems.push(`session ${part} stopped: ${e.message}`);
  } finally {
    stopServer();
    await wipe(instance).catch(() => { /* a fresh start wipes it again */ });
  }
  fs.writeFileSync(path.join(OUT, `part-${part}.json`), JSON.stringify({ requests, problems, timings, session: meta.sessions[0] ?? { name: part, seconds: Math.round((Date.now() - t1) / 1000) } }));
  process.exit(0);
}

// ---- the recording
const t0 = Date.now();
const fixtureHashes = fixtures();
const only = opt("only")?.split(",") ?? null;
const names = Object.keys(SESSIONS).filter((n) => !only || only.includes(n));
const self = fileURLToPath(import.meta.url);
// each server holds up to 1 GB, and the machine is shared: how many run at once follows the memory free. The recording is the same either way
const free = os.freemem() / 1024 ** 3;
const width = Math.max(1, Math.min(names.length, args.includes("--serial") ? 1 : Number(opt("width")) || (free >= 5 ? 4 : free >= 2 ? 2 : 1)));
console.log(`${Math.round(free * 10) / 10} GB free: ${width} server(s) at a time`);
const runPart = (name, slot) => new Promise((resolve) => {
  const p = slot === 0 ? port : 20000 + port + slot;
  const c = spawn(process.execPath, [self, "--label", label, "--port", String(p), "--dist", dist, "--concurrency", String(concurrency), "--part", name], { cwd: APP_ROOT, stdio: ["ignore", "inherit", "inherit"] });
  c.on("close", resolve);
});
let nextPart = 0;
await Promise.all(Array.from({ length: width }, async (_, slot) => { while (nextPart < names.length) await runPart(names[nextPart++], slot); }));

const sessions = [];
for (const n of names) {
  const f = path.join(OUT, `part-${n}.json`);
  if (!fs.existsSync(f)) { problems.push(`session ${n} left no record`); continue; }
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  requests.push(...r.requests); problems.push(...r.problems); timings.push(...r.timings); sessions.push(r.session);
  fs.rmSync(f);
}

// ---- the manifest
const byRole = Object.fromEntries(ROLES.map((r) => [r, requests.filter((x) => x.role === r).length]));
const fivexx = requests.filter((r) => r.status >= 500);
const buildInfo = JSON.parse(fs.readFileSync(path.join(PIN_DIR, "info.json"), "utf8"));
const seconds = Math.round((Date.now() - t0) / 1000);
const head = {
  label, tool: "tests/qa/pass4/golden.mjs", frozen_now: FROZEN_NOW, build_id: buildInfo.build_id, dist,
  next_build_id: fs.existsSync(path.join(APP_ROOT, dist, "BUILD_ID")) ? fs.readFileSync(path.join(APP_ROOT, dist, "BUILD_ID"), "utf8").trim() : null,
  fixtures: fixtureHashes, routes: inv.length, routes_with_get: inv.filter((r) => r.methods.includes("GET")).length,
  request_count: requests.length, by_role: byRole, gaps: plan.gaps, problems, five_xx: fivexx.length, seconds, sessions
};
fs.writeFileSync(path.join(OUT, "timings.json"), JSON.stringify(timings.sort((a, b) => b.ms - a.ms)));
const lines = requests.map((r) => `  ${JSON.stringify(r)}`).join(",\n");
fs.writeFileSync(path.join(DOCS, `${label}.manifest.json`), `{\n"head": ${JSON.stringify(head, null, 1)},\n"requests": [\n${lines}\n]\n}\n`);
console.log(JSON.stringify({ label, requests: requests.length, by_role: byRole, five_xx: fivexx.length, problems: problems.length, gaps: plan.gaps.length, seconds, sessions: sessions.map((x) => ({ name: x.name, seconds: x.seconds, server_error_lines: x.server_error_lines })) }));
for (const p of problems.slice(0, 20)) console.error(p);
for (const g of plan.gaps) console.error(`gap: ${g}`);
process.exit(problems.length || plan.gaps.length ? 2 : 0);
