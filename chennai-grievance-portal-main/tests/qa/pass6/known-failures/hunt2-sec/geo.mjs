import { call } from "../../lib/live.mjs";
const r = await call(3106, "officerB", "GET", "/api/officer/geo?dept=GCC-SWM");
const j = JSON.parse(r.text);
for (const [k, v] of Object.entries(j)) console.log(k, Array.isArray(v) ? `array ${v.length} ${v[0] ? Object.keys(v[0]).join(",") : ""}` : typeof v);
const s = r.text; console.log("GCC-SWM mentions", (s.match(/GCC-SWM/g) || []).length, "GCC-ELE mentions", (s.match(/GCC-ELE/g) || []).length);
const ins = await call(3106, "officerB", "GET", "/api/officer/insights?dept=GCC-SWM");
console.log("insights SWM mentions", (ins.text.match(/GCC-SWM|Solid Waste/gi) || []).length);
