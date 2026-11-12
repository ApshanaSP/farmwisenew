import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
const l = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?period=daily&q=INC-W", CH)).text);
console.log("INC-W in Collector daily list:", l.total, l.incidents);
const all = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?period=daily&sort=t&dir=-1", CH)).text);
const ws = all.rows.filter((r) => r.id.startsWith("INC-W"));
for (const r of ws.slice(0, 12)) console.log(r.id, r.dept, r.sev, r.status, r.zone, r.complaints);
const byDept = {};
for (const k of ["officerA", "officerB", "officerC"]) {
  const o = JSON.parse((await call(3106, k, "GET", "/api/officer/grievances?tab=new&period=daily&per=100")).text);
  byDept[k] = o.rows.filter((r) => r.id.startsWith("INC-W")).length + "/" + o.total + " awaiting:" + o.awaiting;
}
console.log("officer New tab INC-W/total", JSON.stringify(byDept));
