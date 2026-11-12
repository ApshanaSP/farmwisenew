import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const sc of ["period", "all"]) for (const p of ["daily", "quarterly"]) {
  const l = JSON.parse((await call(3106, "collector", "GET", `/api/collector/list?status=awaiting&scope=${sc}&period=${p}`, CH)).text);
  console.log(sc, p, "awaiting groups", l.total, "incidents", l.incidents);
}
