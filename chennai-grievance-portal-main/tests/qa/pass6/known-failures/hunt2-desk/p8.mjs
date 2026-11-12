import { call, P, j, track, mob } from "./h.mjs";
const out = {};
const m = mob();
const cit = { headers: { referer: "http://127.0.0.1:3106/citizen/file-complaint" } };
const body = { firstName: "செல்வம்", lastName: "", gender: "Male", streetAddress: "4 Jawahar Street, Perambur", mobileNumber: m, zoneId: 6, wardNumber: 70,
  manualStreetName: "Jawahar Street", complaintSubtypeId: 1, title: "Garbage not cleared, my Aadhaar 2345 6789 1234",
  description: "குப்பை அள்ளப்படவில்லை. Aadhaar ௨௩௪௫ ௬௭௮௯ ௧௨௩௪ for reference. Call 98400 11111." };
const r = await call(P, "citizenA", "POST", "/api/complaints", { body, ...cit });
out.file = { status: r.status, body: j(r) };
const code = out.file.body.complaintCode || out.file.body.code || out.file.body.complaint?.complaint_code;
out.code = code; out.m4 = m.slice(-4);
out.track = await track(code, m.slice(-4));
const inc = `INC-W-${code}`;
for (const who of ["officerA", "officerC"]) { const g = await call(P, who, "GET", `/api/officer/grievances?tab=all&q=${encodeURIComponent(code)}&per=5`); out["list_" + who] = j(g).rows?.map((x) => ({ id: x.id, title: x.title, loc: x.loc })); }
console.log(JSON.stringify(out).slice(0, 3000));
