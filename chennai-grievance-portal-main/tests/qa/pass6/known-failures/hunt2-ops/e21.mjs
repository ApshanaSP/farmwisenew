import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const st of ["Lapsed", "Rejected"]) {
  const all = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&status=${st}`, CH)).text);
  console.log(st, "all-time incidents", all.incidents, "open among first page:", all.rows.filter((r) => Number(r.open) === 1).length, "/", all.rows.length);
  for (const d of ["GCC-SWM", "GCC-ELE", "CMWSSB"]) {
    const x = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&status=${st}&dept=${d}`, CH)).text);
    console.log("  ", d, x.incidents, x.rows.slice(0, 3).map((r) => `${r.id} open=${r.open} t=${r.t}`).join(" | "));
  }
}
// open-flag but closed status? the overdue list for SWM vs officer overdue
const od = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&status=overdue&dept=GCC-SWM`, CH)).text);
const op = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&status=open&dept=GCC-SWM`, CH)).text);
console.log("Collector all-time SWM open", op.incidents, "overdue", od.incidents);
