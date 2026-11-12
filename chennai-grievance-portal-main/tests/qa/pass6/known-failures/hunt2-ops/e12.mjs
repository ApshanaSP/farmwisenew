import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=weekly", "period=weekly&dept=GCC-SWD", "period=weekly&cat=FLOOD_WATERLOGGING", "period=weekly&taluk=TLK-TDP", "period=weekly&dept=POL-GCP", "period=weekly&zone=4"]) {
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  const l = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?status=critical&scope=all&" + qs, CH)).text);
  console.log(qs.padEnd(40), "snapshot.kind", o.snapshot.kind, "tile 'Severe, not yet checked'", o.snapshot.critical, "| list it opens: groups", l.total, "incidents", l.incidents);
}
