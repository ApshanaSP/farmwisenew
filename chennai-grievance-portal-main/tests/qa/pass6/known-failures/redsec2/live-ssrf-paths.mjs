// QA pass 6, redsec2: SSRF through the Collector's source onboarding (nothing is stored), path traversal on the file routes,
// and a dev page's chunk in the public static folder. A listener of my own on 127.0.0.1:3151 says whether any request landed.
import http from "node:http";
import { call } from "../../lib/live.mjs";

const P = 3106;
const hits = [];
const srv = http.createServer((req, res) => { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { "content-type": "application/rss+xml" }); res.end("<rss><channel><title>t</title></channel></rss>"); });
await new Promise((r) => srv.listen(3151, "127.0.0.1", r));

const urls = ["http://127.0.0.1:3151/a", "http://[::1]:3151/b", "http://0x7f000001:3151/c", "http://2130706433:3151/d", "http://0177.0.0.1:3151/e", "http://127.1:3151/f",
  "http://[::ffff:7f00:1]:3151/g", "http://[::ffff:127.0.0.1]:3151/h", "http://0.0.0.0:3151/i", "http://[::]:3151/j", "http://LOCALHOST:3151/l",
  "http://[0:0:0:0:0:ffff:7f00:1]:3151/m", "http://[::127.0.0.1]:3151/n", "http://[64:ff9b::7f00:1]:3151/o", "127.0.0.1:3151/q"];
for (const url of urls) {
  const r = await call(P, "collector", "POST", "/api/collector/sources/onboard", { body: { url } });
  const lines = r.text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const last = lines[lines.length - 1] ?? {};
  const why = lines.map((x) => x.step?.error ?? x.error ?? x.message ?? x.step?.note ?? "").filter(Boolean)[0] ?? "";
  console.log(`onboard ${url} -> ${r.status} last=${last.type ?? "?"} ${String(why).slice(0, 110)} | listener hits so far: ${hits.length}`);
}
console.log("listener hits:", JSON.stringify(hits));
srv.close();

// path traversal on the file routes (any 200 with file bytes would be a finding)
for (const [who, u] of [["citizenA", "/api/complaints/media/..%2F..%2F..%2Fpackage.json"], ["citizenA", "/api/complaints/media/%2e%2e%5c%2e%2e%5cpackage.json"],
  ["collector", "/api/manu/photos/..%2F..%2F..%2Fpackage.json"], ["collector", "/api/officer/photos/..%2F..%2F/package.json"], ["collector", "/api/officer/photos/20261101-0123456789abcdef/..%2F..%2F..%2Fpackage.json"],
  ["collector", "/api/rehearsal/photo/..%5C..%5C/package.json"], ["manu", "/api/manu/photos/%25.jpg"]]) {
  const r = await call(P, who, "GET", u);
  console.log(`${who} GET ${u} -> ${r.status} ${r.text.slice(0, 60).replace(/\s+/g, " ")}`);
}

// a dev page: 404 in production, but its client chunk (built from fixtures.json, real store answers) is in the public static folder
for (const u of ["/dev/assistant", "/_next/static/chunks/app/dev/assistant/page-68e0345483d7b658.js"]) {
  const r = await call(P, null, "GET", u);
  console.log(`anon GET ${u} -> ${r.status} bytes=${r.text.length} incidentIds=${new Set(r.text.match(/INC-\d{8}-[A-F0-9]{6}/g) ?? []).size} refsChunk=${r.text.includes("app/dev/assistant/page-")}`);
}
