import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=weekly", "period=weekly&taluk=TLK-TDP", "period=monthly&cat=FLOOD_WATERLOGGING"]) {
  const j = JSON.parse((await call(3106, "collector", "GET", "/api/collector/insights?part=briefing&" + qs, CH)).text);
  console.log(qs, "| briefing.stats", JSON.stringify(j.briefing.stats).slice(0, 400));
  console.log("   headline:", String(j.briefing.headline).slice(0, 250));
  console.log("   opening:", JSON.stringify(j.briefing.opening).slice(0, 400));
}
