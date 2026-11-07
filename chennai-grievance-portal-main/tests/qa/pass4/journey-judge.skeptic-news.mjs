// skeptic for journey-judge-6 on :3193
import { accounts } from "../seed-local-users.mjs";
const B = "http://127.0.0.1:3193", c = accounts().find((a) => a.key === "collector");
const lg = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: c.email, password: c.password }) });
const cookie = lg.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
for (const q of ["Newborn girl found abandoned", "Diwali security", "Two killed in accidents Poonamallee"]) {
  const r = await fetch(`${B}/api/collector/search?q=${encodeURIComponent(q)}`, { headers: { cookie } });
  const j = await r.json(); console.log("##", q, JSON.stringify((j.incidents||[]).slice(0,3).map(i=>[i.title,i.type,i.dept_name,i.loc])).slice(0, 900));
}
