// QA pass 6, redsec2: citizen-to-citizen complaint IDOR with the citizen portal's referer (statuses only).
import { call } from "../../lib/live.mjs";
const P = 3106, ref = { referer: "http://127.0.0.1:3106/citizen" };
const listA = await call(P, "citizenA", "GET", "/api/complaints", { headers: ref });
const codes = [...new Set(listA.text.match(/\b\d{4}-\d{3}[A-Z]{3}\b/g) ?? [])];
for (const c of codes.slice(0, 1)) for (const who of ["citizenA", "citizenB"]) {
  const r = await call(P, who, "GET", `/api/complaints/${c}`, { headers: ref });
  console.log(`${who} GET /api/complaints/${c} -> ${r.status} ${r.status === 200 ? "(own complaint body, not printed)" : r.text.slice(0, 80)}`);
}
for (const who of ["citizenB", null]) {
  const r = await call(P, who, "POST", "/api/track", { body: { code: codes[0], last4: "0000" }, headers: ref });
  console.log(`${who ?? "anon"} POST /api/track wrong last4 -> ${r.status} ${r.text.slice(0, 80)}`);
}
