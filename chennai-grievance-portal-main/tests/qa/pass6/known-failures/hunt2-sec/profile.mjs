import { call } from "../../lib/live.mjs";
const ref = { headers: { referer: "http://127.0.0.1:3106/citizen" } };
for (const who of ["citizenA", "citizenB"]) {
  const r = await call(3106, who, "GET", "/api/profile", ref);
  const j = JSON.parse(r.text);
  const p = j.profile || {};
  console.log(who, r.status, Object.keys(j), "mobileVerified=", p.mobileVerified, "mobile set=", !!p.mobileNumber, "keys:", Object.keys(p).join(","));
}
