// officerA's (GCC-SWM) grievances and their photos, opened as officerB (GCC-ELE). Prints ids and statuses only.
import { call } from "../../lib/live.mjs";
const list = await call(3106, "officerA", "GET", "/api/officer/grievances?status=all&limit=50");
console.log("officerA list", list.status, list.text.length);
let j; try { j = JSON.parse(list.text); } catch { console.log(list.text.slice(0, 200)); process.exit(); }
const items = j.items || j.grievances || j.rows || [];
console.log("keys", Object.keys(j), "n", items.length, items[0] ? Object.keys(items[0]).join(",") : "");
const ids = items.slice(0, 5).map((x) => x.id ?? x.incidentId ?? x.incident_id);
for (const id of ids) {
  const a = await call(3106, "officerA", "GET", `/api/officer/grievances/${encodeURIComponent(id)}`);
  const b = await call(3106, "officerB", "GET", `/api/officer/grievances/${encodeURIComponent(id)}`);
  const c = await call(3106, "officerB", "GET", `/api/officer/grievances/${encodeURIComponent(id)}/report`);
  const photos = [...new Set((a.text.match(/\/api\/(officer\/photos|complaints\/media|manu\/photos|rehearsal\/photo)\/[^"\\]+/g) || []))];
  console.log(id, "A", a.status, "B", b.status, "B report", c.status, "photos", photos.length);
  for (const p of photos.slice(0, 2)) { const pb = await call(3106, "officerB", "GET", p); console.log("   B photo", p.split("/").slice(0, 4).join("/"), pb.status); }
}
