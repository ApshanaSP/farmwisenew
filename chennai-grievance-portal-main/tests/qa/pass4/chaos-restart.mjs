// QA pass 4 chaos: a full restart mid-session. Sign in, save Thunai memory, restart the same server (same instance), check session and memory survive,
// then corrupt the memory file (a copy lives in this instance's own Thunai folder) and check the answer is honest.
//   node tests/qa/pass4/chaos-restart.mjs <port> <instance>
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { login } from "./lib/access-lib.mjs";
import { APP_ROOT } from "./lib/env.mjs";
const [port, inst] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const sh = (c) => execSync(c, { cwd: APP_ROOT, stdio: "pipe" }).toString();
const out = { port, inst, steps: [] };
const rec = (n, v) => { out.steps.push({ n, ...v }); };
const call = async (cookie, p, body, n = 0) => { try { const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, body: t.slice(0, 600) }; } catch (e) { if (n < 2) return call(cookie, p, body, n + 1); return { error: String(e.cause?.code || e.message) }; } };
let cookie; for (let i = 0; i < 3 && !cookie; i++) { try { cookie = (await login(base, "collector")).cookie; } catch { /* keep-alive reset */ } }
rec("me before", await call(cookie, "/api/auth/me"));
rec("note", await call(cookie, "/api/collector/thunai/memory", { op: "note", text: "chaos note: remember the ward 170 pump" }));
rec("habit", await call(cookie, "/api/collector/thunai/memory", { op: "habit", heard: "chaosword", meant: "Adyar" }));
rec("memory before restart", await call(cookie, "/api/collector/thunai/memory"));
sh(`node tests/qa/pass4/server.mjs stop --port ${port}`);
sh(`node tests/qa/pass4/server.mjs start --port ${port} --instance ${inst}`);
rec("me after restart (old cookie)", await call(cookie, "/api/auth/me"));
rec("memory after restart", await call(cookie, "/api/collector/thunai/memory"));
rec("collector page after restart", { status: (await fetch(base + "/collector", { headers: { cookie }, redirect: "manual" })).status });
// corrupt the memory file in this instance's own folder
const dir = path.join(APP_ROOT, "data/aws-cache/qa/srv", inst, "thunai");
const files = fs.readdirSync(dir, { recursive: true }).map(String);
rec("thunai files", { files });
for (const f of files) if (/memory|notes/i.test(f) && fs.statSync(path.join(dir, f)).isFile()) fs.writeFileSync(path.join(dir, f), "{not json\u0000\u0000");
rec("memory after corrupt file", await call(cookie, "/api/collector/thunai/memory"));
rec("note after corrupt file", await call(cookie, "/api/collector/thunai/memory", { op: "note", text: "after corruption" }));
rec("memory after note", await call(cookie, "/api/collector/thunai/memory"));
console.log(JSON.stringify(out, null, 1));
