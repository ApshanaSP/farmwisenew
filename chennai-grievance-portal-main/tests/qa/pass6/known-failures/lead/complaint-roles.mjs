// QA pass 6 lead probe: who may file a citizen complaint (POST /api/complaints) with a valid body. Prints statuses and the complaint code only.
import { call } from "../../lib/live.mjs";
const port = Number(process.argv[2] || 3106);
const body = (who) => ({ firstName: "Qa", lastName: "Six", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 1, wardNumber: 1,
  manualStreetName: "Test Street", complaintSubtypeId: 1, title: `QA6 role probe ${who} ${Date.now()}`, description: "Garbage not cleared for three days near the corner shop." });
for (const who of ["citizenA", "officerA", "collector", "manu"]) {
  const r = await call(port, who, "POST", "/api/complaints", { body: body(who) });
  let j = null; try { j = JSON.parse(r.text); } catch { /* not json */ }
  console.log(who, r.status, j?.complaintCode ?? j?.error ?? r.text.slice(0, 80));
}
