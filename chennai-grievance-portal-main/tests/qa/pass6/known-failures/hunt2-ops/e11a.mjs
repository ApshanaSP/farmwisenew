import { call } from "../../lib/live.mjs";
import { CH } from "./snap.mjs";
const r = JSON.parse((await call(3106, "collector", "GET", "/api/collector/list?scope=all&dept=GCC-SWM&status=Resolved&dir=1", CH)).text);
console.log(r.total, r.incidents, r.rows.slice(0, 5).map((x) => `${x.id} ${x.t} ${x.sev} ${x.status} c=${x.complaints}`).join("\n"));
