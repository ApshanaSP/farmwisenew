import { call } from "../../lib/live.mjs";
import { snap, CH } from "./snap.mjs";
const id = process.argv[2];
const counts = async () => {
  const o = JSON.parse((await call(3106, "officerA", "GET", `/api/officer/overview?period=quarterly`)).text);
  const c = JSON.parse((await call(3106, "collector", "GET", `/api/collector/overview?period=quarterly&dept=GCC-SWM`, CH)).text);
  const la = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?scope=all&dept=GCC-SWM&status=open`, CH)).text);
  return { officerCounts: o.counts, officerFeedbackHasIt: (o.feedback || []).some((f) => f.id === id), collectorQuarterOngoing: c.kpi.cur.ongoing, collectorAllTimeOpenList: la.incidents };
};
console.log("before", JSON.stringify(await counts()));
const r = await call(3106, "collector", "POST", "/api/collector/decisions", { ...CH, body: { incidentIds: [id], decision: "reopen", note: "QA hunt2: residents say the garbage is back" } });
console.log("reopen", r.status, r.text.slice(0, 200));
console.log(JSON.stringify(await snap(id, "after reopen of a May case")));
console.log("after", JSON.stringify(await counts()));
const s = await call(3106, "officerA", "GET", `/api/officer/search?q=${id}`);
console.log("officer search", s.status, s.text.slice(0, 150));
