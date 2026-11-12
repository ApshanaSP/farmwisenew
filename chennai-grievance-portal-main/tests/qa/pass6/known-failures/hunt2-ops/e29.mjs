import { call } from "../../lib/live.mjs";
const u = "/api/officer/photos/20261112-081661f9173cb165/1.png";
for (const [k, ref] of [["officerA", "/officer"], ["officerB", "/officer"], ["collector", "/collector"], ["citizenA", "/citizen"], [null, "/"]]) {
  const r = await call(3106, k, "GET", u, { headers: { referer: "http://127.0.0.1:3106" + ref } });
  console.log(k, r.status, r.headers.get("content-type"), r.text.length);
}
