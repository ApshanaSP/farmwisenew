import { call, P, j } from "./h.mjs";
const q = process.argv[2] || "Garbage not collected for ten";
for (const who of ["officerA", "officerC"]) {
  const r = await call(P, who, "GET", `/api/officer/grievances?tab=all&q=${encodeURIComponent(q)}&per=20`);
  const b = j(r);
  console.log(who, r.status, JSON.stringify(b).slice(0, 1500));
}
