// officer-day p12: who may file a complaint and who may open a citizen's attached photo
// usage: node p12-roles.mjs <mediaPath of citizenA's SWM complaint>
import { as, log, short, EVID } from "./h.mjs";
import fs from "node:fs";
import path from "node:path";

const media = process.argv[2];
if (media) for (const k of ["officerA", "officerB", "officerC", "collector", "citizenB"]) log("p12", { media, k, status: (await as(k, "GET", media)).status });

const wards = await as("citizenA", "GET", "/api/locations/wards");
const ward = wards.json.wards.find((w) => w.wardNumber === 120) ?? wards.json.wards[0];
const stamp = new Date().toISOString().slice(11, 19);
const body = { firstName: "Qa", lastName: "Officer", gender: "Female", streetAddress: "QA probe address, officer-day", mobileNumber: "9000000002",
  zoneId: ward.zoneId, wardNumber: ward.wardNumber, manualStreetName: "Probe Street", streetType: "Street", complaintSubtypeId: 52,
  title: `QA officer-day ${stamp} filed by an officer`, description: "officer-day probe: can a department officer or the Collector file a citizen complaint?" };
for (const k of ["officerA", "collector"]) {
  const r = await as(k, "POST", "/api/complaints", { body: { ...body, title: `${body.title} (${k})` } });
  log("p12", { fileAs: k, result: short(r) });
  if (r.json?.complaintCode) fs.appendFileSync(path.join(EVID, "cases.txt"), `${new Date().toISOString()} ${r.json.complaintCode} filed-by-${k}\n`);
}
