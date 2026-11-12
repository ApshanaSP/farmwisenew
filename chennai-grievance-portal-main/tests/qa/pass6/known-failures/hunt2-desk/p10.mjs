import { call, P, j, track, mob, upload, file, base, repeats } from "./h.mjs";
const out = {};
const m = mob();
const cit = { headers: { referer: "http://127.0.0.1:3106/citizen/file-complaint" } };
const body = { firstName: "Rani", lastName: "S", gender: "Female", streetAddress: "9 Jawahar Street, Perambur", mobileNumber: m, zoneId: 6, wardNumber: 70,
  manualStreetName: "Jawahar Street", complaintSubtypeId: 1, title: "Garbage not cleared near the temple", description: "Garbage piled near the temple for a week, dogs spreading it." };
const r = await call(P, "citizenB", "POST", "/api/complaints", { body, ...cit });
out.file = { status: r.status, code: j(r).complaintCode, dept: j(r).department };
const code = out.file.code;
// the same woman comes to the Collector's office with a paper petition in Tamil about the same garbage
const A = await upload();
const cand = { mobile: m, name: "ராணி எஸ்", street: "Jawahar Street", ward: 70, dept: "GCC-SWM", problem: "கோவில் அருகே குப்பை அள்ளப்படவில்லை" };
out.repTamil = (await repeats(A.id, cand)).body;
out.repEnglish = (await repeats(A.id, { ...cand, problem: "Garbage near temple not cleared, dogs" })).body;
const att = out.repEnglish.repeats?.attachTo;
out.filed = await file(A.id, base({ name: "ராணி எஸ்", mobile: m, problem: "Garbage near temple not cleared, dogs", dept: "GCC-SWM", attachTo: att }));
out.trackPet = await track(out.filed.body.approved?.code, m.slice(-4));
out.trackOnline = await track(code, m.slice(-4));
const mine = await call(P, "citizenB", "GET", "/api/complaints", { headers: { referer: "http://127.0.0.1:3106/citizen/track-complaints" } });
const list = j(mine);
out.citizenList = { status: mine.status, n: (list.complaints || list.items || []).length, sample: JSON.stringify(list).slice(0, 600) };
console.log(JSON.stringify(out).slice(0, 5000));
