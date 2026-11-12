// officer-day p2: a citizen files a complaint; does it reach the right officer's queue, with what deadline, and what does the citizen see?
// usage: node p2-file.mjs [subtypeLabelRegex] [deptNameRegex]
import fs from "node:fs";
import path from "node:path";
import { as, log, short, EVID, JPEG } from "./h.mjs";

const want = new RegExp(process.argv[2] ?? "garbage|waste|debris", "i");
const deptWant = new RegExp(process.argv[3] ?? "Solid Waste", "i");
const tax = await as("citizenA", "GET", "/api/complaint-taxonomy");
const subs = (tax.json?.categories ?? []).flatMap((c) => c.subcomplaints);
const sub = subs.find((s) => want.test(s.label) && deptWant.test(s.departmentName ?? "") && s.mappingStatus === "mapped") ?? subs.find((s) => deptWant.test(s.departmentName ?? ""));
log("p2", { taxStatus: tax.status, nSubs: subs.length, picked: sub, depts: [...new Set(subs.map((s) => s.departmentName))] });
if (!sub) process.exit(1);
const wards = await as("citizenA", "GET", "/api/locations/wards");
const ward = wards.json?.wards?.find((w) => w.wardNumber === 120) ?? wards.json?.wards?.[0];
const stamp = new Date().toISOString().slice(11, 19);
const body = {
  firstName: "Qa", lastName: "CitizenA", gender: "Female", streetAddress: "QA probe address, officer-day", mobileNumber: "9000000001",
  zoneId: ward.zoneId, wardNumber: ward.wardNumber, manualStreetName: "Probe Street", streetType: "Street", specificLocation: "Near the probe junction",
  complaintSubtypeId: sub.id, title: `QA officer-day ${stamp} ${process.argv[4] ?? ""}`.trim(), description: process.argv.includes("hazard") ? "Live EB wire snapped and sparking on the road near the school gate; children walk past it. Danger of electric shock." : process.argv.includes("long") ? `officer-day probe ${stamp}: ` + "The garbage bin near the bus stop has overflowed for four days and waste is spread across the footpath. ".repeat(4).slice(0, 360) + " END-OF-TEXT" : `officer-day probe complaint filed at ${stamp}; please ignore.`
};
if (process.argv.includes("media")) {
  const fd = new FormData();
  fd.append("media", new Blob([JPEG], { type: "image/jpeg" }), "evidence.jpg");
  const m = await as("citizenA", "POST", "/api/complaints/media", { body: fd, raw: true });
  log("p2", { media: short(m) });
  if (m.json?.mediaPath) body.mediaPath = m.json.mediaPath;
}
const t0 = Date.now();
const double = process.argv.includes("double");
const [r, r2] = await Promise.all([as("citizenA", "POST", "/api/complaints", { body }), double ? as("citizenA", "POST", "/api/complaints", { body }) : null]);
log("p2", { file: short(r), second: r2 ? short(r2) : null, ms: Date.now() - t0 });
const code = r.json?.complaintCode;
if (!code) process.exit(1);
const inc = `INC-W-${code}`;
fs.appendFileSync(path.join(EVID, "cases.txt"), `${new Date().toISOString()} ${code} ${inc} ${sub.departmentName} ${body.title}\n`);

// the right officer sees it (allow for the 30 s as-of cache)
const officerFor = /Solid Waste/i.test(sub.departmentName) ? "officerA" : /Electrical/i.test(sub.departmentName) ? "officerB" : "officerC";
for (let i = 0; i < 4; i++) {
  const d = await as(officerFor, "GET", `/api/officer/grievances/${inc}`);
  const l = await as(officerFor, "GET", `/api/officer/grievances?tab=new&per=100&period=daily`);
  const inList = (l.json?.rows ?? []).find((x) => x.id === inc);
  log("p2", { try: i, officerFor, detail: d.status, stage: d.json?.grievance?.stage, sev: d.json?.grievance?.sev, t: d.json?.grievance?.t, due: d.json?.grievance?.due, inNewList: !!inList, listNow: l.json?.now, awaiting: l.json?.awaiting, awaitingNote: l.json?.awaitingNote?.en });
  if (inList) break;
  await new Promise((res) => setTimeout(res, 12_000));
}
for (const k of ["officerA", "officerB", "officerC"].filter((k) => k !== officerFor))
  log("p2", { other: k, detail: (await as(k, "GET", `/api/officer/grievances/${inc}`)).status });
{
  const d = await as(officerFor, "GET", `/api/officer/grievances/${inc}`);
  log("p2", { descLen: body.description.length, officerSeesWholeText: d.text.includes("END-OF-TEXT"), sources: (d.json?.sources ?? []).map((s) => `${s.label} | ${s.name} | ${String(s.note).length}`),
    type: d.json?.grievance?.type, summary: d.json?.grievance?.summary, firstSource: d.json?.firstSource, officer: d.json?.grievance?.officer });
}
if (body.mediaPath) {
  const d = await as(officerFor, "GET", `/api/officer/grievances/${inc}`);
  log("p2", { mediaPathInOfficerDetail: d.text.includes(body.mediaPath.split("/").pop()), officerOpensMedia: (await as(officerFor, "GET", body.mediaPath)).status });
}
{
  const ci = await as("collector", "GET", `/api/collector/incidents/${inc}`);
  const i = ci.json?.incident ?? {};
  log("p2", { collectorView: ci.status, type: i.type, cat: i.cat, sev: i.sev, dept: i.dept, t: i.t, sla_due: i.sla_due, title: i.title });
}
const c = await as("citizenA", "GET", `/api/complaints/${code}`);
log("p2", { citizen: c.status, status: c.json?.complaint?.status, created: c.json?.complaint?.created_at, history: c.json?.history });
const other = await as("citizenB", "GET", `/api/complaints/${code}`);
log("p2", { citizenB: other.status });
console.log("CODE", code, inc);
