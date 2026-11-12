// skeptic: live checks of OWNER_SUMMARY "What works now" claims on the gate server (port 3106). Read-only except POSTs that must be refused.
import { call } from "../../lib/live.mjs";
const P = 3106;
const short = (r) => ({ status: r.status, body: String(r.text).slice(0, 140) });
for (const who of ["officerA", "collector", "manu"]) {
  const r = await call(P, who, "POST", "/api/complaints", { body: {} });
  console.log("POST /api/complaints as", who, short(r));
}
const c = await call(P, "citizenA", "POST", "/api/complaints", { body: {} });
console.log("POST /api/complaints as citizenA (empty body, expect 400 not 403)", short(c));
// is officerA's cookie live? (so the 401 above is the citizen-only guard, not a dead session)
const me = await call(P, "officerA", "GET", "/api/auth/security");
console.log("GET /api/auth/security as officerA", { status: me.status, body: String(me.text).slice(0, 80) });
