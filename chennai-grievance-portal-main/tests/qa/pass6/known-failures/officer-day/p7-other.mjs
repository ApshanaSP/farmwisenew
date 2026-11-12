// officer-day p7: a complaint filed under a type with no fixed department ("Other" / unmapped): where does it land, and is the officer told
// that its routing needs review?
import { as, log, short, EVID } from "./h.mjs";
import fs from "node:fs";
import path from "node:path";
const tax = await as("citizenA", "GET", "/api/complaint-taxonomy");
const subs = (tax.json?.categories ?? []).flatMap((c) => c.subcomplaints.map((s) => ({ ...s, cat: c.name })));
const none = subs.filter((s) => !s.departmentId);
const assumed = subs.filter((s) => s.mappingStatus !== "mapped");
log("p7", { noDept: none.slice(0, 5).map((s) => `${s.id} ${s.cat} / ${s.label} (${s.mappingStatus})`), nNoDept: none.length, nNotMapped: assumed.length,
  notMappedSample: assumed.slice(0, 5).map((s) => `${s.id} ${s.label} -> ${s.departmentName} (${s.mappingStatus})`) });
const sub = none[0];
if (!sub) process.exit(0);
const wards = await as("citizenA", "GET", "/api/locations/wards");
const ward = wards.json.wards.find((w) => w.wardNumber === 120) ?? wards.json.wards[0];
const stamp = new Date().toISOString().slice(11, 19);
const body = { firstName: "Qa", lastName: "CitizenA", gender: "Female", streetAddress: "QA probe address, officer-day", mobileNumber: "9000000001",
  zoneId: ward.zoneId, wardNumber: ward.wardNumber, manualStreetName: "Probe Street", streetType: "Street", complaintSubtypeId: sub.id,
  otherDescription: "Street light not working", title: `QA officer-day ${stamp} other`, description: "The street light at the corner has not worked for a week; the road is dark at night." };
const r = await as("citizenA", "POST", "/api/complaints", { body });
log("p7", { file: short(r) });
const code = r.json?.complaintCode;
if (!code) process.exit(1);
fs.appendFileSync(path.join(EVID, "cases.txt"), `${new Date().toISOString()} ${code} INC-W-${code} ${r.json.department} other\n`);
await new Promise((res) => setTimeout(res, 31_000));
const c = await as("citizenA", "GET", `/api/complaints/${code}`);
log("p7", { citizenHistory: c.json?.history?.map((h) => `${h.status} | ${h.remarks}`), needsReview: c.json?.complaint?.needs_manual_review, dept: c.json?.complaint?.department_name });
const ci = await as("collector", "GET", `/api/collector/incidents/INC-W-${code}`);
log("p7", { collector: ci.status, dept: ci.json?.incident?.dept, type: ci.json?.incident?.type, needs_review: ci.json?.incident?.needs_review, review_reason: ci.json?.incident?.review_reason });
for (const k of ["officerA", "officerB"]) {
  const d = await as(k, "GET", `/api/officer/grievances/INC-W-${code}`);
  log("p7", { k, status: d.status, type: d.json?.grievance?.type, mentionsReview: /review|rout/i.test(d.text) });
}
