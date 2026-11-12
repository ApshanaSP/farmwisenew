import { call, P, j, track } from "./h.mjs";
const out = {};
out.before555 = await track("2026-555UYE", "1062");
const r = await call(P, "officerC", "POST", "/api/officer/grievances/INC-W-2026-766XJA", { body: { step: "approve" } });
out.approve = { status: r.status, body: j(r) };
out.after766 = await track("2026-766XJA", "3556");
out.after555 = await track("2026-555UYE", "1062");
console.log(JSON.stringify(out).slice(0, 4000));
