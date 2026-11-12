import { call, P, j, mob } from "./h.mjs";
const body = { firstName: "​", lastName: "", gender: "Male", streetAddress: "​", mobileNumber: mob(), zoneId: 6, wardNumber: 70,
  manualStreetName: "​", complaintSubtypeId: 1, title: "​", description: "‍" };
const r = await call(P, "citizenA", "POST", "/api/complaints", { body, headers: { referer: "http://127.0.0.1:3106/citizen/file-complaint" } });
console.log(r.status, r.text.slice(0, 300));
