// QA pass 4, final red team: two small real-run probes kept as evidence (docs/qa/pass4/evidence/redteam-final/signin-and-approve.json).
//   RT_BASE=http://127.0.0.1:3231 node tests/qa/pass4/redteam-final.signin.mjs
// 1. right passwords only: does the per-email sign-in limit count successful sign-ins? (redteam-final-3)
// 2. "Approve a new data source" with a valid body and no grant: is "Confirm it's you" asked?
import { BASE, acct, login, req, save } from "./redteam-final.lib.mjs";

const rows = [];
for (let i = 1; i <= 10; i++) { const r = await login("officerC"); rows.push({ attempt: i, right: true, status: r.status }); }
const col = (await login("collector")).cookie;
const body = { url: "https://example.org/feed.xml", kind: "rss", detected: "rss", name: "rt feed", recordPath: null, refreshMinutes: 60, auth: null, authorized: true,
  mapping: { title: "title", body: [], url: null, published: null, dateFormat: "auto", place: [], lat: null, lon: null, category: null, id: null } };
const plain = await req("POST", "/api/collector/sources/onboard/approve", { cookie: col, body });
const soft = await req("POST", "/api/collector/sources/onboard/approve", { cookie: col, body, headers: { "x-diq-confirm": "json" } });
const approve = [{ soft: false, status: plain.status, head: plain.text.slice(0, 120) }, { soft: true, status: soft.status, confirmHeader: soft.headers["x-diq-confirm"] ?? null, head: soft.text.slice(0, 120) }];
save("signin-and-approve.json", { base: BASE, account: "officerC (right password every time)", at: new Date().toISOString(), signins: rows, approve });
console.log(JSON.stringify({ signins: rows.map((r) => r.status).join(" "), approve: approve.map((a) => a.status) }));
