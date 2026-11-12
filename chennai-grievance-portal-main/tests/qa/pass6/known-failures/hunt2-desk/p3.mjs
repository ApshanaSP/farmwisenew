import { upload, file, base, track, mob, repeats, call, P, j } from "./h.mjs";
const out = {};
const target = process.argv[2] || "INC-W-2026-766XJA";
const D = await upload();
out.D = await file(D.id, base({ name: "Kumar Garbage", mobile: mob(), problem: "Garbage not collected for ten days near the school", dept: "GCC-SWM", ward: 70, attachTo: target }));
const E = await upload();
out.E = await file(E.id, base({ name: "Lakshmi", mobile: mob(), problem: "Water supply is dirty and smells", dept: "CMWSSB", ward: 70, attachTo: "INC-W-NOPE-123" }));
for (const who of ["manu", "officerC", "officerA", "collector"]) {
  const r = await call(P, who, "GET", `/api/manu/case/${target}`);
  out["case_" + who] = { status: r.status, body: j(r) };
}
const r2 = await call(P, "manu", "GET", `/api/manu/case/INC-W-NOPE-123`); out.case_nope = j(r2);
console.log(JSON.stringify(out, null, 0).slice(0, 5000));
