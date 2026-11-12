import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
for (const qs of ["period=daily", "period=weekly", "period=monthly", "period=quarterly&zone=4"]) {
  const o = JSON.parse((await call(3106, "collector", "GET", "/api/collector/overview?" + qs, CH)).text);
  const m = o.map, lc = m.layerCounts;
  const drawn = { severe: m.pins.filter((p) => p.sev === "Severe").length, complaint: m.pins.filter((p) => p.sev !== "Severe" && Number(p.complaints) > 0).length, other: m.pins.filter((p) => p.sev !== "Severe" && !(Number(p.complaints) > 0)).length };
  console.log(qs.padEnd(26), "legend", JSON.stringify(lc), "sum", lc.severe + lc.complaint + lc.other, "| pins drawn", m.pins.length, JSON.stringify(drawn), "| unlocated", m.unlocated, "total", m.total);
}
