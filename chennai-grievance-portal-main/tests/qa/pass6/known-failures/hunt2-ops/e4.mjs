import { call } from "../../lib/live.mjs";
for (const k of ["officerA","officerB","officerC"]) for (const tab of ["new","action","sent"]) {
  const r = await call(3106, k, "GET", `/api/officer/grievances?tab=${tab}&period=quarterly&per=100&sev=Severe`);
  const j = JSON.parse(r.text);
  console.log(k, tab, r.status, j.total, (j.rows||[]).slice(0,4).map((x) => `${x.id} c=${x.complaints} due=${x.due_at} ${x.status}`).join(" | "));
}
