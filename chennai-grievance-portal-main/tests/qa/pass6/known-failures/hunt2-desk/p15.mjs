import { call, P, j } from "./h.mjs";
const [id, decision, note] = process.argv.slice(2);
const r = await call(P, "collector", "POST", "/api/collector/decisions", { body: { incidentIds: [id], decision, note: note || null }, headers: { referer: "http://127.0.0.1:3106/collector" } });
console.log(r.status, r.text.slice(0, 400));
