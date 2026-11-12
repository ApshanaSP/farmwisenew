// QA pass 6, redsec2: what officerB's Ask the Map answer says about officerA's (GCC-SWM) incident: id only, or its title and place.
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const ids = [...new Set(gA.text.match(/INC-\d{8}-[A-F0-9]{6}/g) ?? [])];
for (const id of ids.slice(0, 3)) {
  const d = JSON.parse((await call(P, "officerA", "GET", `/api/officer/grievances/${id}`)).text);
  const g = d.grievance ?? d;
  const title = String(g.title ?? ""), place = String(g.place ?? g.place_text ?? g.location ?? "");
  const m = JSON.parse((await call(P, "officerB", "POST", "/api/map/ask", { body: { text: null, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: id, ward: null, drawn: null } }, headers: off })).text);
  const mask = (s) => String(s ?? "").split(id).join("<SWM-ID>").split(title).join("<SWM-TITLE>").split(place || "\u0000").join("<SWM-PLACE>");
  const box = m.camera?.areas?.[0]?.box;
  console.log(`${id.slice(0, 12)}…: officerA sees title ${title.length}ch place ${place.length}ch | officerB map headline: ${mask(m.answer?.headline).slice(0, 140)} | area label: ${mask(m.camera?.areas?.[0]?.label).slice(0, 100)} | box: ${box ? "yes" : "no"} | place name: ${mask(m.context?.places?.[0]?.name).slice(0, 80)}`);
}
