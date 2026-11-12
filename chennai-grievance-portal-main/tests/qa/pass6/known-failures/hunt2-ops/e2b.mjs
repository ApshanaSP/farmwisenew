import { call } from "../../lib/live.mjs";
const ov = await call(3106, "officerA", "GET", `/api/officer/overview?period=quarterly`);
const j = JSON.parse(ov.text);
for (const [k, v] of Object.entries(j)) console.log(k, JSON.stringify(v).slice(0, 300));
