// Skeptic 2: the guarded routes with and without the console's soft header (PB-316 fix), and with a forged or borrowed grant. Nothing may be done without a real grant.
import { login } from "./lib/access-lib.mjs";
const base = "http://127.0.0.1:3216";
const { cookie } = await login(base, "collector");
const call = async (method, p, h = {}, body) => { const r = await fetch(base + p, { method, headers: { cookie, "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { s: r.status, soft: r.headers.get("x-diq-confirm"), cc: r.headers.get("cache-control"), ct: (r.headers.get("content-type") || "").slice(0, 30), head: t.slice(0, 90).replace(/\n/g, " ") }; };
const rows = [];
for (const [m, p, b] of [["GET", "/api/collector/export?period=daily"], ["GET", "/api/collector/assistant/export?format=csv"], ["POST", "/api/map/export", { plan: {}, question: "x", format: "csv" }], ["POST", "/api/collector/decisions", { incidentId: "INC-1", decision: "approve" }]]) {
  rows.push([m, p, "plain", await call(m, p, {}, b)]);
  rows.push([m, p, "soft", await call(m, p, { "x-diq-confirm": "json" }, b)]);
  rows.push([m, p, "soft+forged", await call(m, p, { "x-diq-confirm": "json", "x-diq-grant": "abc.def.ghi" }, b)]);
  rows.push([m, p, "soft=JSON", await call(m, p, { "x-diq-confirm": "JSON" }, b)]);
}
for (const r of rows) console.log(r[0], r[1].slice(0, 36), r[2].padEnd(12), JSON.stringify(r[3]));
