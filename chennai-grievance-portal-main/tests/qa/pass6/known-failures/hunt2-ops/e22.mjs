import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=weekly", "period=monthly", "period=quarterly"]) {
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  const hit = (arr) => (arr || []).filter((r) => ["INC-20261105-5C94BB", "INC-20261030-158A1B"].includes(r.id)).map((r) => `${r.id}:${r.status}:open=${r.open}`);
  console.log(qs, "bell", JSON.stringify(hit(o.bell)), "severity.rows", JSON.stringify(hit(o.severity.rows)), "news", JSON.stringify(hit(o.news)), "pins", JSON.stringify(hit(o.map.pins)), "tasks", JSON.stringify(hit(o.tasks.rows)));
}
