import { call } from "../../lib/live.mjs";
const H = { headers: { referer: "http://127.0.0.1:3106/collector" } };
const qs = process.argv[2] || "period=weekly";
const out = [];
for (const st of ["", "open","overdue","critical","awaiting","unverified","verified","Resolved","Rejected"]) {
  const l = await call(3106, "collector", "GET", "/api/collector/list?" + qs + (st ? "&status=" + st : ""), H);
  const lj = JSON.parse(l.text);
  out.push(`${st||"(all)"}: groups ${lj.total} incidents ${lj.incidents} complaints ${lj.complaints}`);
}
for (const sev of ["Severe","High","Medium","Low"]) {
  const l = await call(3106, "collector", "GET", "/api/collector/list?" + qs + "&sev=" + sev, H);
  const lj = JSON.parse(l.text);
  const l2 = await call(3106, "collector", "GET", "/api/collector/list?" + qs + "&sev=" + sev + "&status=open", H);
  const lj2 = JSON.parse(l2.text);
  out.push(`sev ${sev}: incidents ${lj.incidents} open ${lj2.incidents}`);
}
console.log(out.join("\n"));
