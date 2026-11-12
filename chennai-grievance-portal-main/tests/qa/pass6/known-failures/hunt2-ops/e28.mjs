import { call } from "../../lib/live.mjs";
for (const k of ["officerA", "officerB"]) for (const p of ["weekly", "quarterly"]) {
  const o = JSON.parse((await call(3106, k, "GET", `/api/officer/overview?period=${p}`)).text);
  const m = o.map;
  console.log(k, p, "legend", JSON.stringify(m.layerCounts), "pins", m.pins.length, "open counts new+action+sent", o.counts.new + o.counts.action + o.counts.sent, "unlocated", m.unlocated, "total", m.total);
}
