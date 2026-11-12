import { call } from "../../lib/live.mjs";
for (const tab of ["new","action","sent","verified"]) {
  const r = await call(3106, "officerA", "GET", `/api/officer/grievances?tab=${tab}&period=monthly&per=100`);
  const j = JSON.parse(r.text);
  console.log(tab, r.status, "total", j.total, "rows", j.rows?.length);
  for (const x of (j.rows||[]).slice(0, 6)) console.log("  ", JSON.stringify(x).slice(0, 300));
}
const c = await call(3106, "citizenA", "GET", "/api/complaints", { headers: { referer: "http://127.0.0.1:3106/citizen" } });
console.log("citizenA complaints", c.status, c.text.slice(0, 1500));
