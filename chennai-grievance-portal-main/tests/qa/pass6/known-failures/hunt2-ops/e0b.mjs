import { call } from "../../lib/live.mjs";
const r = await call(3106, "officerA", "GET", `/api/officer/grievances?tab=new&period=monthly&per=100`);
const j = JSON.parse(r.text);
console.log(Object.keys(j.rows[0]).join(","));
for (const x of j.rows) console.log(x.id, x.sev, x.status, x.stage, "c="+x.complaints, x.due ?? x.sla_due_at, x.overdue, x.t ?? x.reported);
const c = await call(3106, "citizenB", "GET", "/api/complaints", { headers: { referer: "http://127.0.0.1:3106/citizen" } });
console.log("citizenB complaints", c.status, c.text.slice(0, 600));
