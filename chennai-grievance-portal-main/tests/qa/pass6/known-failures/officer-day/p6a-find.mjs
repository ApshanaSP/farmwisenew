// officer-day p6a: severe grievances per officer, by stage (read only)
import { as, log } from "./h.mjs";
for (const k of ["officerA", "officerB", "officerC"]) {
  const r = await as(k, "GET", "/api/officer/grievances?tab=all&per=100&period=quarterly&sev=Severe");
  log("p6a", { k, status: r.status, total: r.json?.total, rows: (r.json?.rows ?? []).map((x) => `${x.id} ${x.stage} ${x.t} returned=${x.returned}`) });
}
