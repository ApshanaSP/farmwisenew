// FINAL TEST smoke: is the server up, are the private APIs closed without a session, and (with a Collector session cookie)
// do the main collector APIs answer within budget?
//   node scripts/final-test/smoke.mjs                     (BASE defaults to http://localhost:3005)
//   set FINALTEST_COOKIE=<cookie header>&& node scripts/final-test/smoke.mjs
// Prints one line per check and PASS or FAIL. Reads only: no POST that changes data.
const BASE = (process.env.BASE || "http://localhost:3005").replace(/\/$/, "");
const COOKIE = process.env.FINALTEST_COOKIE || "";

const PRIVATE = [
  "/api/collector/overview?period=daily", "/api/collector/alerts", "/api/collector/brief?kind=day&period=daily", "/api/collector/insights",
  "/api/collector/search?q=velachery%20flooding", "/api/collector/studio", "/api/collector/assistant/status", "/api/collector/sources",
  "/api/collector/workspaces", "/api/collector/audit", "/api/officer/overview", "/api/officer/grievances", "/api/profile", "/api/collector/geo"
];
// budget in ms on a warm production server (AI routes are not here)
const WITH_SESSION = [
  ["/api/collector/overview?period=daily", 800], ["/api/collector/alerts", 1500], ["/api/collector/insights", 1500],
  ["/api/collector/search?q=velachery%20flooding", 800], ["/api/collector/studio", 2000], ["/api/collector/assistant/status", 800],
  ["/api/collector/geo", 800], ["/api/collector/stories?period=daily", 800]
];

let fail = 0;
const line = (ok, what) => { if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

async function get(path, cookie) {
  const t = Date.now();
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = await r.text();
  return { status: r.status, ms: Date.now() - t, body };
}

try {
  const home = await get("/");
  line(home.status < 500, `server up: GET / -> ${home.status} (${home.ms} ms)`);
} catch (e) {
  console.log(`FAIL server not reachable at ${BASE}: ${e.message}`);
  process.exit(1);
}

for (const p of PRIVATE) {
  const r = await get(p);
  line(r.status === 401 || r.status === 403, `no session: ${p} -> ${r.status}`);
  line(!/at \w+ \(|node_modules|SELECT .* FROM/i.test(r.body), `no stack or SQL in the refusal: ${p}`);
}

if (COOKIE) {
  for (const [p, budget] of WITH_SESSION) {
    await get(p, COOKIE); // warm
    const r = await get(p, COOKIE);
    line(r.status === 200, `collector: ${p} -> ${r.status}`);
    line(r.ms <= budget, `collector: ${p} warm ${r.ms} ms (budget ${budget})`);
  }
} else console.log("note: FINALTEST_COOKIE not set, so the signed-in checks were skipped");

console.log(fail ? `FAIL (${fail})` : "PASS");
process.exit(fail ? 1 : 0);
