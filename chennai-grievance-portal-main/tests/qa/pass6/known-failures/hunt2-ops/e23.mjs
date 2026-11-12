import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=weekly", "period=weekly&taluk=TLK-TDP", "period=monthly&cat=FLOOD_WATERLOGGING", "period=monthly&dept=GCC-ELE&zone=9"]) {
  const r = await call(3106, "collector", "GET", "/api/collector/insights?part=briefing&" + qs, CH);
  const j = JSON.parse(r.text);
  const b = j.book ?? j.briefing ?? j;
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  console.log(qs.padEnd(40), r.status, "book.stats", JSON.stringify(b.stats ?? Object.keys(j)).slice(0, 300));
  console.log("   tiles: reported", o.kpi.cur.reported, "ongoing", o.kpi.cur.ongoing, "overdue", o.snapshot.overdue, "resolved", o.kpi.cur.resolved, "severe", o.kpi.cur.severe, "complaints", o.kpi.cur.complaints, "tasks", o.tasks.count);
}
