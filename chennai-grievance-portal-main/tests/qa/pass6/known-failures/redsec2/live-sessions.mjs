// QA pass 6, redsec2: Ask District IQ conversations and pins across officers (ids and statuses only).
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const sA = await call(P, "officerB", "GET", "/api/collector/assistant/sessions", { headers: off });
const idsB = [...new Set(sA.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])];
console.log("officerB sessions", sA.status, idsB.length);
for (const id of idsB.slice(0, 1)) for (const who of ["officerB", "officerA", "collector"]) {
  const r = await call(P, who, "GET", `/api/collector/assistant/sessions/${id}`, { headers: who === "collector" ? { referer: "http://127.0.0.1:3106/collector" } : off });
  console.log(`${who} GET officerB's conversation -> ${r.status} ${r.status === 200 ? `(${r.text.length} bytes)` : r.text.slice(0, 60)}`);
}
