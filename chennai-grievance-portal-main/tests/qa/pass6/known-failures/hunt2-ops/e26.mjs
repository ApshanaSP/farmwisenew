import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=daily", "period=monthly", "period=quarterly"]) {
  const j = JSON.parse((await call(3106, "collector", "GET", "/api/collector/insights?part=briefing&" + qs, CH)).text);
  console.log(qs, "| stats", JSON.stringify(j.briefing.stats));
  console.log("   headline:", JSON.stringify(j.briefing.headline).slice(0, 200));
  console.log("   opening.en:", String(j.briefing.opening?.en).slice(0, 300));
}
