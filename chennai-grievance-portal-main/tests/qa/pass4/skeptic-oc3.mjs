// skeptic for journey-officer_citizen-3: file as citizenA via API, then look in the SWM officer's queue
import { accounts } from "../seed-local-users.mjs";
const base = "http://127.0.0.1:3195";
const login = async (key) => { const a = accounts().find((x) => x.key === key);
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "); };
const cit = await login("citizenA"), off = await login("officerA");
const tax = await (await fetch(base + "/api/complaint-taxonomy")).json();
const subs = JSON.stringify(tax); const m = subs.match(/"id":(\d+),"[^{}]*Overflowing of Garbage Bin/) ;
console.log("tax sample", subs.slice(0, 300), "match", m?.[1]);
const sub = Number(process.env.SUB || m?.[1] || 0);
const tag = "SK" + Date.now().toString(36);
const body = { firstName: "Test", gender: "Male", streetAddress: "1 Test St", mobileNumber: "9876543210", zoneId: 5, manualStreetName: "Gandhi Nagar 2nd Cross " + tag, wardNumber: 58, complaintSubtypeId: sub, title: "Garbage bin overflow " + tag, description: "The bin on Gandhi Nagar 2nd Cross " + tag + " is overflowing for 5 days.", latitude: 13.11, longitude: 80.29 };
const r = await fetch(base + "/api/complaints", { method: "POST", headers: { "content-type": "application/json", cookie: cit, origin: base, referer: base + "/citizen" }, body: JSON.stringify(body) });
const j = await r.text(); console.log("FILE", r.status, j.slice(0, 400));
const code = JSON.parse(j).complaintCode;
for (const q of ["", "&tab=all", "&tab=all&q=" + tag, "&tab=all&q=" + code]) {
  const o = await fetch(base + "/api/officer/grievances?per=100" + q, { headers: { cookie: off, referer: base + "/officer" } });
  const t = await o.text(); console.log("OFFICER", q, o.status, t.length, "hasTag", t.includes(tag), "hasCode", !!code && t.includes(code));
}
