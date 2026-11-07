import { accounts } from "../seed-local-users.mjs";
const BASE = "http://127.0.0.1:3173";
const col = accounts().find((a) => a.key === "collector");
const lg = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: col.email, password: col.password }) });
const cookie = lg.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const g = async (u) => { const r = await fetch(BASE + u, { headers: { cookie } }); const t = await r.text(); return [r.status, t.slice(0, 300)]; };
for (const u of ["/api/collector/search?q=adyar","/api/collector/search?q=%25","/api/collector/search?q=_","/api/collector/search?q=%27","/api/collector/search?q=GCC","/api/collector/search?q=%E0%AE%85%E0%AE%9F%E0%AE%AF%E0%AE%BE%E0%AE%B1%E0%AF%81","/api/collector/search?q=a%00b","/api/collector/search?q=%5C","/api/collector/export?period=weekly","/api/collector/export?period=bogus&zone=99","/api/collector/export?zone=abc&dept=%27","/api/collector/export?period=daily&zone=3&confirm=1"]) console.log(u, JSON.stringify(await g(u)));
