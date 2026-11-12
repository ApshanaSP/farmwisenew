// officer-day p4: Collector decisions on cases at the wrong stage (no stage check), and what the officer and citizen are told.
// usage: node p4-collector.mjs <decision: reopen|resolve|reject|verify> <complaintCode> [note]
import { as, log, short, grantFor } from "./h.mjs";

const [decision, code, note] = process.argv.slice(2);
const inc = code.startsWith("INC-") ? code : `INC-W-${code}`;
const officer = process.argv[5] ?? "officerA";
const before = await as(officer, "GET", `/api/officer/grievances/${inc}`);
log("p4", { decision, inc, stageBefore: before.json?.grievance?.stage, sev: before.json?.grievance?.sev });
const body = { incidentIds: [inc], decision, note: note ?? `officer-day probe ${decision}` };
let r = await as("collector", "POST", "/api/collector/decisions", { body });
log("p4", { first: short(r) });
if (r.status === 428 && r.json?.confirm) {
  log("p4", { confirmBox: r.json.confirm.title, summary: r.json.confirm.summary });
  const g = await grantFor("collector", r.json.confirm);
  r = await as("collector", "POST", "/api/collector/decisions", { body, headers: { "x-diq-grant": g } });
  log("p4", { withGrant: short(r) });
}
const d = await as(officer, "GET", `/api/officer/grievances/${inc}`);
const c = code.startsWith("INC-") ? { json: null } : await as("citizenA", "GET", `/api/complaints/${code}`);
const ov = await as(officer, "GET", "/api/officer/overview?period=daily");
log("p4", { officerStage: d.json?.grievance?.stage, returned: d.json?.grievance?.returned, returnNote: d.json?.grievance?.returnNote, next: d.json?.next,
  closedByDept: d.json?.closedByDept, tl: (d.json?.timeline ?? []).slice(-2).map((x) => `${x.label}: ${x.note}`),
  feedback: (ov.json?.feedback ?? []).filter((f) => f.id === inc).map((f) => ({ decision: f.decision, ok: f.ok, note: f.note })),
  citizen: c.json?.complaint?.status, rejected_stage: c.json?.complaint?.rejected_stage, citizenRemarks: c.json?.complaint?.remarks, checkedBy: c.json?.progress?.checkedBy,
  last: (c.json?.history ?? []).slice(-2).map((h) => `${h.status} | ${h.remarks}`) });
// can the officer still act?
if (!inc.startsWith("INC-W-")) process.exit(0); // a pipeline case: leave it alone
const ap = await as(officer, "POST", `/api/officer/grievances/${inc}`, { body: { step: "approve" } });
log("p4", { officerApproveAfter: short(ap) });
