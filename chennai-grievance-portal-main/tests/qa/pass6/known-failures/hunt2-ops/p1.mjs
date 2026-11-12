import { call } from "../../lib/live.mjs";
const H = { headers: { referer: "http://127.0.0.1:3106/collector" } };
const qs = process.argv[2] || "period=weekly";
const o = await call(3106, "collector", "GET", "/api/collector/overview?" + qs, H);
console.log("overview", o.status);
const j = JSON.parse(o.text);
const show = (v, d=0) => { if (d>1) return; for (const [k, x] of Object.entries(v)) { if (x && typeof x === "object" && !Array.isArray(x)) { console.log(" ".repeat(d*2)+k+":"); show(x, d+1);} else console.log(" ".repeat(d*2)+k+" = "+JSON.stringify(x)?.slice(0,160)); } };
show(j);
