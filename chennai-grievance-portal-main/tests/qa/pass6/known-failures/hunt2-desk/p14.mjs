import { call, P, j, upload, file, base, mob } from "./h.mjs";
const A = await upload();
const t0 = Date.now();
const f = await file(A.id, base({ name: "Lag Probe", mobile: mob(), problem: "Drinking water contaminated with sewage", dept: "CMWSSB" }));
const code = f.body.approved?.code;
const t1 = Date.now();
for (let i = 0; i < 12; i++) {
  const d = await call(P, "officerC", "GET", `/api/officer/grievances/INC-W-${code}`);
  const l = await call(P, "officerC", "GET", `/api/officer/grievances?tab=all&q=${code}&per=5`);
  const c = await call(P, "collector", "GET", `/api/collector/incidents/INC-W-${code}`);
  console.log(((Date.now() - t1) / 1000).toFixed(1) + "s", "detail", d.status, "list", j(l).rows?.length, "collector", c.status);
  if (d.status === 200 && j(l).rows?.length) break;
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("file took", (t1 - t0) / 1000, "s", code);
