import { call } from "../../lib/live.mjs";
const who = process.argv[2];
const ref = { citizenA: "/citizen", citizenB: "/citizen", collector: "/collector" }[who] || "/officer";
for (const u of process.argv.slice(3)) {
  const [m, path, body] = u.split(" ");
  const r = await call(3106, who === "anon" ? null : who, m, path, { headers: { referer: "http://127.0.0.1:3106" + ref }, ...(m !== "GET" ? { body: body ? JSON.parse(body) : {} } : {}) });
  console.log(r.status, m, path, r.text.length, r.text.slice(0, 220).replace(/\s+/g, " "));
}
