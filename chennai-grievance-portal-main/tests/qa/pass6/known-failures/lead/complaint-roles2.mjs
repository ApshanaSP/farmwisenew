// QA pass 6 lead probe: the same, with each role's own portal as the referer.
import { call } from "../../lib/live.mjs";
const port = Number(process.argv[2] || 3106);
const body = (who) => ({ firstName: "Qa", lastName: "Six", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 1, wardNumber: 1,
  manualStreetName: "Test Street", complaintSubtypeId: 1, title: `QA6 role probe2 ${who} ${Date.now()}`, description: "Garbage not cleared for three days near the corner shop." });
for (const [who, ref] of [["citizenA", "/citizen/file-complaint"], ["collector", "/collector"], ["officerB", "/officer"]]) {
  const r = await call(port, who, "POST", "/api/complaints", { body: body(who), headers: { referer: `http://127.0.0.1:${port}${ref}` } });
  let j = null; try { j = JSON.parse(r.text); } catch { /* not json */ }
  console.log(who, ref, r.status, j?.complaintCode ?? j?.error ?? r.text.slice(0, 80));
}
