import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
import { confirmed } from "./confirm.mjs";
const l = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?scope=all&dept=GCC-SWM&status=Resolved&dir=1&page=2", CH)).text);
const ids = l.rows.slice(0, 9).map((r) => r.id);
console.log("old resolved SWM cases:", l.rows.slice(0, 9).map((r) => `${r.id}(${r.t.slice(0, 10)} ${r.status})`).join(" "));
const tiles = async () => {
  const d = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?period=daily&dept=GCC-SWM", CH)).text);
  const r = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?period=daily&dept=GCC-SWM&status=Resolved", CH)).text);
  const o = JSON.parse((await call(3106, "officerA", "GET", "/api/officer/overview?period=daily")).text);
  return { dailyResolvedTile: d.kpi.cur.resolved, dailyResolvedList: r.incidents, dailyReported: d.kpi.cur.reported, officerFeedback: o.feedback.length, feedbackOk: o.feedback.filter((f) => f.ok).length };
};
console.log("before", JSON.stringify(await tiles()));
const res = await confirmed("collector", "POST", "/api/collector/decisions", { incidentIds: ids, decision: "resolve" }, CH.headers);
console.log("bulk resolve of 9 already-resolved cases", res.first, res.confirm, res.r.status, res.r.text.slice(0, 120));
console.log("after", JSON.stringify(await tiles()));
