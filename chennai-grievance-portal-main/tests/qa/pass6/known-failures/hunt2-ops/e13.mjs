import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
const L = async (qs) => JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?" + qs, CH)).text);
for (const qs of (process.argv[2] || "").split(",")) {
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  const all = await L(qs), open = await L(qs + "&status=open"), res = await L(qs + "&status=Resolved"), od = await L(qs + "&status=overdue"), sev = await L(qs + "&sev=Severe");
  const k = o.kpi.cur, mix = o.severityMix.reduce((a, b) => a + b.n, 0), mixOpen = o.severityMix.reduce((a, b) => a + b.open, 0);
  const bad = [];
  const cmp = (name, a, b) => { if (a !== b) bad.push(`${name}: tile ${a} vs list ${b}`); };
  cmp("reported", k.reported, all.incidents); cmp("ongoing", k.ongoing, open.incidents); cmp("resolved", k.resolved, res.incidents);
  cmp("overdue", o.snapshot.overdue, od.incidents); cmp("severe", k.severe, sev.incidents); cmp("map.total", o.map.total, k.reported);
  cmp("severityMix n", mix, k.reported); cmp("severityMix open", mixOpen, k.ongoing); cmp("open complaints", k.complaints, open.complaints); cmp("complaint_inc", k.complaint_inc, (await L(qs + "&status=open")).incidents >= k.complaint_inc ? k.complaint_inc : -1);
  console.log(qs.padEnd(52), `rep ${k.reported} ong ${k.ongoing} res ${k.resolved} od ${o.snapshot.overdue} sev ${k.severe} cmp ${k.complaints}`, bad.length ? "MISMATCH " + bad.join("; ") : "ok");
}
