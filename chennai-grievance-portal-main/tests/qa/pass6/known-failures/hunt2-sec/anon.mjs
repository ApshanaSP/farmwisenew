import { call } from "../../lib/live.mjs";
const P = 3106;
const urls = process.argv.slice(2);
for (const u of urls) {
  const [m, path] = u.includes(" ") ? u.split(" ") : ["GET", u];
  const r = await call(P, null, m, path, m === "GET" ? {} : { body: {} });
  console.log(r.status, m, path, (r.headers.get("content-type")||"").slice(0,30), r.text.length, r.text.slice(0, 140).replace(/\s+/g, " "));
}
