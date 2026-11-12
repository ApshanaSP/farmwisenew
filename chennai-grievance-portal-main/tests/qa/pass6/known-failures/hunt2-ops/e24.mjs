import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=weekly", "period=weekly&taluk=TLK-TDP", "period=monthly&cat=FLOOD_WATERLOGGING"]) {
  const j = JSON.parse((await call(3106, "collector", "GET", "/api/collector/insights?part=briefing&" + qs, CH)).text);
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  console.log(qs, "| book.stats", JSON.stringify(j.book?.stats), "| critical list", (j.book?.critical || []).length, "| briefing keys", Object.keys(j.briefing || {}).join(","));
  console.log("   tiles: reported", o.kpi.cur.reported, "ongoing", o.kpi.cur.ongoing, "overdue", o.snapshot.overdue, "resolved", o.kpi.cur.resolved, "severe", o.kpi.cur.severe, "severe_open", o.kpi.cur.severe_open, "urgent", o.kpi.cur.urgent, "complaints", o.kpi.cur.complaints, "critical", o.snapshot.critical);
}
