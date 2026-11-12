// QA pass 4: API FUZZ. All routes under src/app/api, seeded malformed requests, as anonymous and as the collector.
//   node tests/qa/pass4/api-fuzz.mjs [--port 3140] [--seed 4] [--big 20] [--budget-min 14]
// Checks: no 5xx, no stack trace or internal path in the body, no partial write (durable row counts before and after a rejected write),
// and a server crash is a finding (the script restarts the server and goes on). Output: docs/qa/pass4/evidence/api-fuzz.json
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { APP_ROOT } from "./lib/env.mjs";
import { STACK, allRoutes, concrete, counts, diff, login, openDurable, req, sleep } from "./lib/access-lib.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg("port", 3140)), seed = Number(arg("seed", 4)), bigMb = Number(arg("big", 20)), budgetMs = Number(arg("budget-min", 14)) * 60000;
const base = `http://127.0.0.1:${port}`;
const OUT = path.resolve(APP_ROOT, "..", "docs/qa/pass4/evidence/api-fuzz.json");
const started = Date.now();
let rnd = seed; const rand = () => (rnd = (rnd * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (a) => a[Math.floor(rand() * a.length)];
// routes that would end the collector's own session or burn the sign-in quota: tried anonymous only
const NO_COLLECTOR = new Set(["/api/auth/logout", "/api/auth/login", "/api/auth/security"]);

/** field names a route's zod schema declares: the first z.object({ ... }) blocks in the file */
function schemaKeys(route) {
  const s = fs.readFileSync(path.join(APP_ROOT, "src/app/api", route.slice(5), "route.ts"), "utf8");
  const keys = new Set();
  for (const m of s.matchAll(/z\.object\(\{([\s\S]*?)\}\)/g)) for (const k of m[1].matchAll(/^\s*([A-Za-z_]\w*)\s*:\s*z\./gm)) keys.add(k[1]);
  for (const m of s.matchAll(/(?:body|b|j|data)\??\.([A-Za-z_]\w*)/g)) if (keys.size < 6 && m[1].length > 2 && !["data", "success", "error", "json", "text"].includes(m[1])) keys.add(m[1]);
  return [...keys].slice(0, 12);
}
const wrongs = () => [123456789012, -1, 0, 1e308, true, [], {}, [[]], null, "x".repeat(5000), "\u0000\u0000", "<script>alert(1)</script>", "../../../etc/passwd", { __proto__: { admin: true } }, ["a", { b: 1 }]];

const BIGS = {};
const big = (mb) => (BIGS[mb] ??= Buffer.from('{"a":"' + "A".repeat(mb * 1024 * 1024) + '"}'));

function writeCases(route, keys) {
  const cs = [];
  const J = { "content-type": "application/json" };
  cs.push(["bad-json", { headers: J, body: '{"a":' }], ["json-null", { headers: J, body: "null" }], ["json-array", { headers: J, body: "[1,2,3]" }], ["json-string", { headers: J, body: '"str"' }],
    ["empty-body", { headers: J, body: "" }], ["text-plain", { headers: { "content-type": "text/plain" }, body: '{"a":1}' }], ["no-content-type", { headers: {}, body: '{"a":1}' }],
    ["form-urlencoded", { headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1&b=%00&__proto__=x" }],
    ["multipart-garbage", { headers: { "content-type": "multipart/form-data; boundary=zz" }, body: "--zz\r\nContent-Disposition: form-data; name=\"x\"\r\n\r\n\u0000\r\n--zz--" }],
    ["multipart-no-boundary", { headers: { "content-type": "multipart/form-data" }, body: "garbage" }],
    ["null-bytes", { headers: J, body: JSON.stringify(Object.fromEntries((keys.length ? keys : ["a", "q", "name", "message"]).map((k) => [k, "a\u0000b"]))) }],
    ["proto-pollution", { headers: J, body: '{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}}}' }],
    ["deep-nest", { headers: J, body: "[".repeat(5000) + "]".repeat(5000) }],
    ["empty-object", { headers: J, body: "{}" }]);
  for (const k of keys) { const v = pick(wrongs()); cs.push([`schema-wrong-type:${k}`, { headers: J, body: JSON.stringify({ [k]: v }) }]); }
  if (keys.length) cs.push(["schema-all-wrong", { headers: J, body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, pick(wrongs())]))) }]);
  cs.push(["huge-1MB", { headers: J, body: big(1) }]);
  if (bigMb > 0) cs.push([`huge-${bigMb}MB`, { headers: J, body: big(bigMb), timeout: 60000 }]);
  return cs;
}
function getCases(params) {
  const q = (s) => [`query:${s.slice(0, 40)}`, { url: s }];
  const cs = [q("?period=constructor"), q("?period=__proto__"), q("?__proto__[admin]=1&constructor[prototype][x]=1"), q("?zone=%00&taluk=%00"), q("?limit=-1&offset=-5"), q("?limit=99999999999&page=1e308"), q("?q=" + "A".repeat(100000)),
    q("?period=daily&period=weekly&period[]=x"), q("?dept=%27%20OR%201%3D1--"), q("?id=null&code=undefined"), q("?lat=NaN&lon=Infinity"), q("?format=../../etc/passwd"), q("?meta=1&since=-1")];
  for (const p of params) cs.push([`param:${p}=weird`, { url: `?${p}=${encodeURIComponent(pick(["constructor", "__proto__", "\u0000", "x".repeat(3000), "-1", "1e999", "[object Object]", "{{7*7}}", "%", "null"]))}` }]);
  return cs;
}

// ---- server health and restarts ----
const crashes = [];
async function alive() { const r = await req(base, "GET", "/login", { timeout: 15000 }); return r.status > 0 && r.status < 500; }
async function restart(why) {
  crashes.push({ at: new Date().toISOString(), why });
  console.log("SERVER DOWN:", why, "restarting");
  try { execSync(`node tests/qa/pass4/server.mjs stop --port ${port}`, { cwd: APP_ROOT, stdio: "ignore" }); } catch { /* gone */ }
  execSync(`node tests/qa/pass4/server.mjs start --port ${port} --frozen --ticking`, { cwd: APP_ROOT, stdio: "ignore" });
}

const db = openDurable(port);
// which tables change by themselves (background jobs)? watch the idle store for 4 s first
const c0 = counts(db); await sleep(4000); const noisy = new Set(Object.keys(diff(c0, counts(db))));
const rows = [];
const findings = [];
let collector = (await login(base, "collector")).cookie;
const routes = allRoutes();
const summary = { requests: 0, status5xx: 0, stack: 0, partialWrite: 0, crash: 0, hang: 0, skippedForBudget: 0 };
let stopped = false;

for (const r of routes) {
  if (Date.now() - started > budgetMs) { summary.skippedForBudget++; stopped = true; continue; }
  const keys = schemaKeys(r.route);
  for (const m of r.methods) {
    if (m === "HEAD" || m === "OPTIONS") continue;
    for (const who of ["anonymous", "collector"]) {
      if (who === "collector" && NO_COLLECTOR.has(r.route)) continue;
      const cases = m === "GET" ? getCases(r.inventoryParams ?? r.params) : writeCases(r.route, keys);
      for (const [name, c] of cases) {
        const url = concrete(r.route) + (c.url ?? "");
        const isWrite = m !== "GET";
        const before = isWrite ? counts(db) : null;
        const res = await req(base, m, url, { cookie: who === "collector" ? collector : "", headers: c.headers ?? {}, body: c.body, timeout: c.timeout ?? 20000 });
        summary.requests++;
        const row = { route: r.route, method: m, who, case: name, status: res.status, ms: res.ms };
        const probs = [];
        if (res.status >= 500 && !(res.status === 503 && /no-stt|no-tts|unavailable|not configured|busy|budget|rate/i.test(res.text))) { probs.push(`${res.status}`); summary.status5xx++; }
        if (STACK.test(res.text)) { probs.push("stack-or-internal-path-in-body"); summary.stack++; }
        if (res.status === 0 && /timeout|abort/i.test(res.error || "")) { probs.push("hang-over-timeout"); summary.hang++; }
        if (isWrite && res.status >= 400 && res.status < 500) {
          const after = counts(db); const d = diff(before, after);
          for (const t of Object.keys(d)) if (noisy.has(t)) delete d[t];
          if (Object.keys(d).length) {
            await sleep(300); const d2 = diff(before, counts(db)); for (const t of Object.keys(d2)) if (noisy.has(t)) delete d2[t];
            if (Object.keys(d2).length) { probs.push("rows-changed-after-rejected-write:" + JSON.stringify(d2)); summary.partialWrite++; }
          }
        }
        if (res.status === 0 && !/timeout|abort/i.test(res.error || "")) {
          if (!(await alive())) { summary.crash++; probs.push("server-crash"); await restart(`${m} ${r.route} ${name} as ${who}`); collector = (await login(base, "collector")).cookie; }
        }
        if (probs.length) { row.problems = probs; row.sample = res.text.slice(0, 200); findings.push(row); }
        if (who === "anonymous" && probs.length === 0 && rows.length < 0) rows.push(row);
        if (res.status === 401 && who === "collector") collector = (await login(base, "collector")).cookie;
      }
    }
  }
  if (Date.now() - started > budgetMs) stopped = true;
}

const byKey = new Map();
for (const f of findings) { const k = `${f.method} ${f.route} ${f.problems.map((p) => p.split(":")[0]).join("+")}`; if (!byKey.has(k)) byKey.set(k, { ...f, count: 0, cases: [] }); const e = byKey.get(k); e.count++; if (e.cases.length < 6) e.cases.push(`${f.who}/${f.case}=${f.status}`); }
const out = { generated: new Date().toISOString(), port, seed, bigMb, minutes: +((Date.now() - started) / 60000).toFixed(1), routesTotal: routes.length, budgetStopped: stopped, noisyTablesIgnored: [...noisy], summary, crashes, groups: [...byKey.values()], problemRows: findings };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ summary, minutes: out.minutes, groups: out.groups.length, crashes: crashes.length, stopped }));
for (const g of out.groups) console.log(g.method, g.route, g.problems.join(","), "x" + g.count, g.cases.join(" | "), JSON.stringify(g.sample).slice(0, 100));
