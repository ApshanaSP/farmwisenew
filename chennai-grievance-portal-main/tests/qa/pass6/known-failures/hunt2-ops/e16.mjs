import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
const l = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?period=weekly&sort=t&dir=-1", CH)).text);
const r0 = l.rows[0];
console.log(Object.keys(r0).join(","));
for (const r of l.rows.slice(0, 12)) {
  const d = JSON.parse((await call(3106, "collector", "GET", `/api/collector/incidents/${r.id}`, CH)).text).incident;
  console.log(r.id, "t", r.t, "due", r.sla_due ?? r.due, "breached", r.breached, "sla_h", d.sla_hours, "closed", d.closed_at ?? "", "status", r.status, "overdue(list)", r.overdue, "| detail due", d.sla_due ?? d.due, d.deadline ? JSON.stringify(d.deadline) : "");
}
