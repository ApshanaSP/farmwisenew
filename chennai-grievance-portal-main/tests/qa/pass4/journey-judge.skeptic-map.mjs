// skeptic for journey-judge-4: POST /api/map/ask on :3193. node tests/qa/pass4/journey-judge.skeptic-map.mjs
import { accounts } from "../seed-local-users.mjs";
const B = "http://127.0.0.1:3193", c = accounts().find((a) => a.key === "collector");
const lg = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: c.email, password: c.password }) });
const cookie = lg.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
for (const q of ["incidents reported by more than one newspaper but missing from the departmental application", "show incidents reported by more than one newspaper"]) {
  const r = await fetch(`${B}/api/map/ask`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ q, text: q, question: q, context: { zone: null, taluk: null, incidentId: null, ward: null, drawn: null } }) });
  const t = await r.text(); console.log(r.status, q.slice(0, 40), "=>", t.slice(0, 700));
}
