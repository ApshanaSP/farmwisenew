import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
const map = { officerA: "GCC-SWM", officerB: "GCC-ELE", officerC: "CMWSSB" };
for (const period of ["daily", "weekly", "monthly", "quarterly"]) for (const [k, dept] of Object.entries(map)) {
  const o = JSON.parse((await call(3106, k, "GET", `/api/officer/overview?period=${period}`)).text);
  const c = JSON.parse((await call(3106, "collector", "GET", `/api/collector/overview?period=${period}&dept=${dept}`, CH)).text);
  const lo = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?period=${period}&dept=${dept}&status=open`, CH)).text);
  const lod = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?period=${period}&dept=${dept}&status=overdue`, CH)).text);
  const oc = o.counts;
  console.log(period, dept, "| officer new+action+sent", oc.new + oc.action + oc.sent, "overdue", oc.overdue, "serious", oc.serious, "board.ongoing", o.board?.kpi?.cur?.ongoing,
    "| collector ongoing", c.kpi.cur.ongoing, "reported", c.kpi.cur.reported, "list open inc", lo.incidents, "list overdue inc", lod.incidents, "snapshot overdue", c.snapshot.overdue, "serious", c.snapshot.serious);
}
