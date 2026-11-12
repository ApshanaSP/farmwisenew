// officer-day p8: the Collector's "Send to department" email about several cases (map send). Which of the cases show the instruction
// on the officer's grievance drawer? (No AI draft is asked for: the text is written here. Mail is off on this server.)
// usage: node p8-batch.mjs <dept> <incidentId> <incidentId> [...]
import { as, log, short, grantFor } from "./h.mjs";

const [dept, ...ids] = process.argv.slice(2);
const officer = { "GCC-SWM": "officerA", "GCC-ELE": "officerB" }[dept] ?? "officerA";
const body = { action: "send", dept, ids, subject: `officer-day probe: ${ids.length} cases need a completion report`,
  body: "Dear officer,\n\nThe cases listed need your attention. Please send a completion report with site photos through the officer console.\n\nDistrict Collector, Chennai", plan: { probe: "officer-day" } };
let r = await as("collector", "POST", "/api/map/send", { body });
log("p8", { first: short(r) });
if (r.status === 428 && r.json?.confirm) r = await as("collector", "POST", "/api/map/send", { body, headers: { "x-diq-grant": await grantFor("collector", r.json.confirm) } });
log("p8", { send: short(r) });
for (const id of ids) {
  const d = await as(officer, "GET", `/api/officer/grievances/${id}`);
  log("p8", { id, status: d.status, instructions: (d.json?.instructions ?? []).map((i) => `${i.t} ${i.subject} ref=${i.ref ? "yes" : "no"}`) });
}
