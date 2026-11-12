// QA pass 6, redsec2: cross-department reads through the complaint media route, Ask the Map and Ask District IQ (statuses,
// counts and ids only; no citizen detail printed).
import { call } from "../../lib/live.mjs";
const P = 3106, cit = { referer: "http://127.0.0.1:3106/citizen" };
const listA = await call(P, "citizenA", "GET", "/api/complaints", { headers: cit });
const code = (listA.text.match(/\b\d{4}-\d{3}[A-Z]{3}\b/) ?? [])[0];
const one = await call(P, "citizenA", "GET", `/api/complaints/${code}`, { headers: cit });
let media = null, dept = null;
try { const j = JSON.parse(one.text); media = j.complaint?.media_path ?? null; dept = j.complaint?.department_id ?? null; } catch { /* */ }
console.log("citizenA complaint dept_id", dept, "has media", !!media, media ? media.replace(/[a-f0-9]{16}/, "<hex>") : "");
if (media && media.startsWith("/api/")) for (const who of ["citizenA", "citizenB", "officerA", "officerB", "officerC", "manu", "collector"]) {
  const r = await call(P, who, "GET", media);
  console.log(`${who} GET <citizenA media> -> ${r.status} ${r.headers.get("content-type")}`);
}
// officerA's (GCC-SWM) incidents, then officerB (GCC-ELE) through Ask the Map and Ask District IQ
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const ids = [...new Set(gA.text.match(/INC-\d{8}-[A-F0-9]{6}/g) ?? [])];
const id = ids[0];
const m = await call(P, "officerB", "POST", "/api/map/ask", { body: { text: null, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: id, ward: null, drawn: null } }, headers: { referer: "http://127.0.0.1:3106/officer" } });
console.log("officerB map ask around SWM incident ->", m.status, "mentions the SWM id:", m.text.includes(id), "SWM ids in answer:", ids.filter((x) => m.text.includes(x)).length, "bytes", m.text.length);
try { const j = JSON.parse(m.text); console.log("  map kind", j.kind, "hits", (j.list ?? j.items ?? []).length, "camera focus", JSON.stringify(j.camera?.focus ?? null).slice(0, 120), "say", JSON.stringify(j.say?.en ?? "").slice(0, 160)); } catch { console.log("  ", m.text.slice(0, 160)); }
for (const msg of [`tell me about ${id}`, `${id}`, "show the collector's queue", "list all open incidents in every department"]) {
  const c = await call(P, "officerB", "POST", "/api/collector/assistant/chat", { body: { message: msg }, headers: { referer: "http://127.0.0.1:3106/officer" } });
  const hit = ids.filter((x) => c.text.includes(x)).length;
  let head = ""; try { const j = JSON.parse(c.text); head = (j.card?.headline ?? j.error ?? "").slice(0, 120); } catch { head = c.text.slice(0, 120).replace(/\s+/g, " "); }
  console.log(`officerB chat ${JSON.stringify(msg)} -> ${c.status} SWM ids in reply: ${hit} | ${head}`);
}
