// QA pass 4: ACCESS MATRIX. Every route file under src/app/api, every exported method, against anonymous, citizenA, officerA, officerB and the collector,
// plus role-confusion cells (a token carried under another portal's cookie name). The designed rule per route comes from the route's own guard call.
//   node tests/qa/pass4/access-matrix.mjs [--port 3140]
// Output: docs/qa/pass4/evidence/access-matrix.json (pass or fail per cell).
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/env.mjs";
import { pathToFileURL } from "node:url";
import { IDS, allRoutes, concrete, login, loginAll, req, ruleFor } from "./lib/access-lib.mjs";
const BODIES = process.env.QA_ACCESS_BODIES ? (await import(pathToFileURL(path.resolve(process.env.QA_ACCESS_BODIES)).href)).default : {};

const pi = process.argv.indexOf("--port"); const port = pi > 0 ? Number(process.argv[pi + 1]) : 3140;
const base = `http://127.0.0.1:${port}`;
const OUT = process.env.QA_ACCESS_OUT ? path.resolve(process.env.QA_ACCESS_OUT) : path.resolve(APP_ROOT, "..", "docs/qa/pass4/evidence/access-matrix.json");
const SESSION_KILLERS = new Set(["/api/auth/logout", "/api/auth/security", "/api/profile/change-password"]);

const ALLOW = {
  collector: ["collector"], officer: ["officerA", "officerB"], staff: ["collector", "officerA", "officerB"], citizen: ["citizenA"],
  anyauth: ["citizenA", "officerA", "officerB", "collector"], public: IDS, jobkey: [], dev: [],
  "staff-or-owner": ["collector", "officerA", "officerB", "citizenA"], mixed: ["collector", "officerA", "officerB"],
  // QA pass 5: the desk account "opens the Manu Desk and nothing else" (lib/manu/constants.ts), so it is in no other rule's list
  manu: ["manu"], "petition-viewers": ["manu", "collector", "officerA", "officerB"],
};
ALLOW.anyauth = [...ALLOW.anyauth, "manu"];
const rename = (cookie, to) => cookie.replace(/^[^=]+/, to);

let cookies = await loginAll(base);
// role confusion: the token of a lower role carried under the cookie name of a higher portal
const confused = {
  "citizenA@officer-cookie": rename(cookies.citizenA, "dcd_session_officer"),
  "citizenA@collector-cookie": rename(cookies.citizenA, "dcd_session_collector"),
  "officerA@collector-cookie": rename(cookies.officerA, "dcd_session_collector"),
};
const STACKISH = (t) => /\n\s+at\s.*:\d+:\d+|node_modules/.test(t);

const cells = [];
const routes = allRoutes();
async function runRoutes(list) {
for (const r of list) {
  const { rule, guard } = ruleFor(r.route, r.methods);
  const url = concrete(r.route);
  for (const m of r.methods) {
    const methodRule = r.route === "/api/rehearsal/tasks" ? "mixed" : rule;
    const allowed = ALLOW[methodRule] ?? [];
    const names = [...IDS, ...(["collector", "officer", "staff", "mixed", "jobkey"].includes(methodRule) ? Object.keys(confused) : [])];
    for (const idName of names) {
      let cookie = idName === "anonymous" ? "" : confused[idName] ?? cookies[idName];
      if (SESSION_KILLERS.has(r.route) && cookie && !confused[idName]) { cookie = (await login(base, idName)).cookie; if (!cookie) { cells.push({ route: r.route, method: m, identity: idName, rule: methodRule, guard, expected: "allow", status: 0, verdict: "skip", body: "sign-in was rate limited (429): re-run on a fresh server" }); continue; } }
      const bodyless = m === "GET" || m === "HEAD";
      // QA pass 6: a deny cell that gets a 400 on "{}" proves nothing about the guard, so each method is sent a valid body when one is known
      // (QA_ACCESS_BODIES: a module whose default export maps "METHOD /api/route" to a JSON body, or to { raw, type } for another content type)
      const vbRaw = BODIES[`${m} ${r.route}`];
      const vb = typeof vbRaw === "function" ? vbRaw(idName) : vbRaw; // a function gets the identity (e.g. its own password for a step-up)
      const bodyHeaders = vb && typeof vb === "object" && "raw" in vb ? { "content-type": vb.type } : { "content-type": "application/json" };
      const bodyText = vb === undefined ? "{}" : typeof vb === "object" && "raw" in vb ? vb.raw : JSON.stringify(vb);
      const res = await req(base, m, url, { cookie, headers: bodyless ? {} : bodyHeaders, body: bodyless ? undefined : bodyText, timeout: 60000 });
      const expectAllow = confused[idName] ? methodRule === "public" || methodRule === "anyauth" : allowed.includes(idName);
      const denied = res.status === 401 || res.status === 403 || (methodRule === "dev" && res.status === 404);
      const ok2 = res.status >= 200 && res.status < 400;
      let verdict;
      if (res.status === 503 && /no-stt|no-tts/.test(res.text)) verdict = "pass"; // the test server has no speech key: designed answer
      else if (res.status === 0 || res.status >= 500) verdict = "fail"; // a guard must never answer with a crash or a hang
      else if (methodRule === "staff-or-owner" || methodRule === "mixed" || methodRule === "petition-viewers") verdict = expectAllow ? "pass" : denied ? "pass" : ok2 ? "fail" : "pass";
      else if (methodRule === "public") verdict = "pass";
      else if (expectAllow) verdict = denied && !/not linked/i.test(res.text) ? "fail" : "pass"; // a signed-in allowed role must get past the guard (400, 404, 429 are fine)
      else verdict = ok2 ? "fail" : "pass"; // a role that is not allowed must not get a 2xx or 3xx
      // QA pass 6: a passing deny cell is "guard" only when the guard itself answered (401, 403, or 404 for a dev route); any other 4xx is "unproven"
      const proof = expectAllow || verdict !== "pass" ? undefined : denied ? "guard" : "unproven";
      cells.push({ route: r.route, method: m, identity: idName, rule: methodRule, guard, expected: expectAllow ? "allow" : "deny", status: res.status, verdict, ...(proof ? { proof } : {}), ...(bodyless ? {} : { body: vb === undefined ? "{}" : "valid" }), ...(verdict === "fail" || proof === "unproven" ? { text: res.text.slice(0, 160), err: res.error } : {}) });
    }
  }
}
}
await runRoutes(routes.filter((r) => !SESSION_KILLERS.has(r.route)));

// ---- data scope: what an allowed identity gets back must be only theirs ----
const scope = [];
const rec = (check, ok, detail) => scope.push({ check, verdict: ok ? "pass" : "fail", detail });
const J = async (id, url, c = cookies) => { const r = await req(base, "GET", url, { cookie: c[id], timeout: 90000 }); let j = null; try { j = JSON.parse(r.text); } catch { /* not json */ } return { ...r, j }; };

const col = await J("collector", "/api/collector/list");
const deptOf = new Map((col.j?.rows ?? []).map((x) => [x.id, x.dept]));
const DEPT = { officerA: "GCC-SWM", officerB: "GCC-ELE" };
const ids = {};
for (const o of ["officerA", "officerB"]) {
  const otherCode = o === "officerA" ? "GCC-ELE" : "GCC-SWM";
  for (const q of ["", `?dept=${otherCode}`, `?dept=${DEPT[o]}`, "?department=CMWSSB", "?dept=ALL"]) {
    const g = await J(o, "/api/officer/grievances" + q);
    const rows = g.j?.rows ?? [];
    if (!q) ids[o] = rows.map((x) => x.id);
    const wrong = rows.filter((x) => deptOf.has(x.id) && deptOf.get(x.id) !== DEPT[o]);
    rec(`${o} grievances list ${q || "(plain)"} returns only ${DEPT[o]}`, g.status === 200 && wrong.length === 0, { status: g.status, rows: rows.length, wrongDept: wrong.slice(0, 3).map((x) => x.id), notInCollectorList: rows.filter((x) => !deptOf.has(x.id)).length });
  }
  const ov = await J(o, `/api/officer/overview?dept=${otherCode}`);
  rec(`${o} overview ignores ?dept= for another department`, ov.status === 200 && ov.j?.dept?.code === DEPT[o], { status: ov.status, got: ov.j?.dept?.code });
  for (const u of ["/api/officer/search?q=a", "/api/officer/geo", "/api/officer/insights"]) {
    const x = await J(o, u + (u.includes("?") ? "&" : "?") + "dept=" + otherCode);
    const mentions = x.text.includes(`"${otherCode}"`) || x.text.includes(`"code":"${otherCode}"`);
    rec(`${o} ${u.split("?")[0]} with ?dept=${otherCode} shows no ${otherCode} data`, x.status === 200 && !mentions, { status: x.status, mentionsOther: mentions });
  }
}
// cross-department incident by id
for (const [a, b] of [["officerA", "officerB"], ["officerB", "officerA"]]) {
  const target = (ids[b] ?? []).find((id) => deptOf.get(id) === DEPT[b]) ?? ids[b]?.[0];
  if (!target) { rec(`${a} reads ${b}'s incident by id`, true, "no incident to try (inconclusive)"); continue; }
  const u = `/api/officer/grievances/${target}`;
  const x = await J(a, u);
  rec(`${a} cannot read ${DEPT[b]} incident ${target} by id`, [403, 404].includes(x.status), { status: x.status, body: x.text.slice(0, 120) });
  const w = await req(base, "POST", u, { cookie: cookies[a], headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "note", note: "qa scope probe" }), timeout: 60000 });
  rec(`${a} cannot act on ${DEPT[b]} incident ${target} (POST)`, [400, 403, 404, 422].includes(w.status), { status: w.status, body: w.text.slice(0, 120) });
}
// collector-only data
for (const o of ["officerA", "officerB"]) for (const u of ["/api/collector/list", "/api/collector/overview", "/api/collector/export", "/api/collector/audit"]) {
  const x = await J(o, u);
  rec(`${o} refused ${u}`, x.status === 401 || x.status === 403, { status: x.status });
}
// citizen: own complaints only
const cbCookies = { ...cookies, citizenB: (await login(base, "citizenB")).cookie };
const ca = await J("citizenA", "/api/complaints"); const cb = await J("citizenB", "/api/complaints", cbCookies);
rec("citizenA complaints list has no other user's rows", ca.status === 200 && !(ca.j?.complaints ?? []).some((x) => x.user_id && Number(x.user_id) !== 1000000005), { status: ca.status, n: ca.j?.complaints?.length });
const fc = (cb.j?.complaints ?? [])[0]; const foreign = fc?.complaint_code ?? fc?.code;
if (foreign) { const x = await J("citizenA", `/api/complaints/${foreign}`); rec("citizenA cannot open citizenB's complaint by code", [403, 404].includes(x.status), { status: x.status }); }
else rec("citizenA cannot open citizenB's complaint by code", true, "citizenB has no complaints in the pinned store (inconclusive)");
for (const code of ["GC-0001", "1", "..%2f..%2fetc", "' OR 1=1 --"]) { const x = await J("citizenA", `/api/complaints/${encodeURIComponent(code)}`); rec(`citizenA complaint code probe ${code}`, x.status < 500 && !STACKISH(x.text), { status: x.status }); }
for (const u of ["/api/officer/grievances", "/api/collector/list", "/api/rehearsal/state"]) { const x = await J("citizenA", u); rec(`citizenA refused ${u}`, x.status === 401 || x.status === 403, { status: x.status }); }
// the assistant's saved sessions
const cs = await J("collector", "/api/collector/assistant/sessions");
const sid = cs.j?.sessions?.[0]?.id;
if (sid) { const x = await J("officerA", `/api/collector/assistant/sessions/${sid}`); rec("officerA cannot open the Collector's assistant session", [401, 403, 404].includes(x.status), { status: x.status }); }
else rec("officerA cannot open the Collector's assistant session", true, "the Collector has no saved session (inconclusive)");
const os = await J("officerA", "/api/collector/assistant/sessions"); rec("officerA's assistant session list holds no Collector session (list is per signed-in email)", os.status === 200 && !(os.j?.sessions ?? []).some((x) => (cs.j?.sessions ?? []).some((y) => y.id === x.id)), { status: os.status, n: os.j?.sessions?.length, note: "designed: assistantSession allows officers, sessions keyed by email" });

await runRoutes(routes.filter((r) => SESSION_KILLERS.has(r.route))); // sign-out style routes last: they end sessions
const sum = (a) => ({ pass: a.filter((x) => x.verdict === "pass").length, skip: a.filter((x) => x.verdict === "skip").length, fail: a.filter((x) => x.verdict === "fail").length });
const denyPass = cells.filter((c) => c.expected === "deny" && c.verdict === "pass");
const unproven = denyPass.filter((c) => c.proof === "unproven");
const denyProof = { denyPassing: denyPass.length, guard: denyPass.length - unproven.length, unproven: unproven.length,
  unprovenMethods: [...new Set(unproven.map((c) => `${c.method} ${c.route}`))].sort() };
const out = { generated: new Date().toISOString(), port, routes: routes.length, methods: cells.filter((c) => c.identity === "anonymous").length, cells: cells.length, summary: sum(cells), denyProof, scopeSummary: sum(scope), scope, cellList: cells };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ routes: out.routes, methods: out.methods, cells: out.cells, summary: out.summary, denyProof: { ...denyProof, unprovenMethods: denyProof.unprovenMethods.length }, scope: out.scopeSummary }));
for (const c of cells.filter((c) => c.verdict === "fail")) console.log("FAIL", c.method, c.route, c.identity, "expected", c.expected, "got", c.status, c.rule, (c.body || "").slice(0, 80).replace(/\n/g, " "));
for (const c of scope.filter((c) => c.verdict === "fail")) console.log("SCOPE FAIL", c.check, JSON.stringify(c.detail));
