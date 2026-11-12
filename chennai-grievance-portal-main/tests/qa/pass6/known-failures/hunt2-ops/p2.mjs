import { call } from "../../lib/live.mjs";
const H = { headers: { referer: "http://127.0.0.1:3106/collector" } };
const qs = process.argv[2] || "period=weekly";
const o = await call(3106, "collector", "GET", "/api/collector/overview?" + qs, H);
const j = JSON.parse(o.text);
console.log("now", j.now);
console.log("kpi.cur", JSON.stringify(j.kpi.cur));
console.log("kpi.prev", JSON.stringify(j.kpi.prev));
console.log("map.zoneCounts", JSON.stringify(j.map.zoneCounts).slice(0,600));
console.log("map.layerCounts", JSON.stringify(j.map.layerCounts));
console.log("map pins", j.map.pins.length, "unlocated", j.map.unlocated, "total", j.map.total);
console.log("severity.counts", JSON.stringify(j.severity.counts), "rows", j.severity.rows.length);
console.log("severityMix", JSON.stringify(j.severityMix));
console.log("zoneTable sum n", j.zoneTable.reduce((a,b)=>a+b.n,0), "open", j.zoneTable.reduce((a,b)=>a+b.open,0), "+unassigned", JSON.stringify(j.zoneUnassigned));
console.log("bottom.byDept sum", j.bottom.byDept.reduce((a,b)=>a+b.v,0), "byZone sum v", j.bottom.byZone.reduce((a,b)=>a+b.v,0), "n", j.bottom.byZone.reduce((a,b)=>a+(b.n||0),0));
console.log("snapshot", JSON.stringify(j.snapshot).slice(0,400));
console.log("tasks", j.tasks.count, j.tasks.leftToDepts);
console.log("deptNav sum open", j.deptNav.reduce((a,b)=>a+b.open,0), "n", j.deptNav.reduce((a,b)=>a+b.n,0));
console.log("bell", j.bell.length);
for (const sc of ["period"]) {
  const l = await call(3106, "collector", "GET", "/api/collector/list?" + qs + "&scope=" + sc, H);
  const lj = JSON.parse(l.text);
  console.log("list", sc, l.status, Object.keys(lj), JSON.stringify({ total: lj.total, count: lj.count, n: lj.n, pages: lj.pages, counts: lj.counts }).slice(0,500), (lj.rows||[]).length);
}
for (const st of ["open","overdue","critical","awaiting","unverified","verified"]) {
  const l = await call(3106, "collector", "GET", "/api/collector/list?" + qs + "&status=" + st, H);
  const lj = JSON.parse(l.text);
  console.log("list status", st, lj.total);
}
