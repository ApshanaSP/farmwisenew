import { call, P, j, upload, file, base, mob, track } from "./h.mjs";
const M = mob();
const A = await upload();
const f = await file(A.id, base({ name: "Reopen Probe", mobile: M, problem: "Street light pole leaning dangerously", dept: "GCC-ELE" }));
const code = f.body.approved?.code;
await new Promise((r) => setTimeout(r, 1500));
const r = await call(P, "collector", "POST", "/api/collector/decisions", { body: { incidentIds: [`INC-W-${code}`], decision: "reopen" }, headers: { referer: "http://127.0.0.1:3106/collector" } });
const t = await track(code, M.slice(-4));
console.log(JSON.stringify({ code, reopen: r.status, track: t.body }).slice(0, 1500));
