// QA pass 4: starts and stops test servers. Never prints .env values.
//   node tests/qa/pass4/server.mjs start --port 3100 [--groq] [--frozen [ISO]] [--ticking] [--dist .next-qa] [--dev] [--instance name] [--no-pin] [--env K=V ...]
//   node tests/qa/pass4/server.mjs stop --port 3100 | stop-all | status
// Each server has its own durable file and Thunai folder, data/aws-cache/qa/srv/<instance>. Run the production build first, or use --dev.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT, FROZEN_NOW, PIN_DIR, PIN_PORT, PIN_URL, RUN_DIR, qaEnv } from "./lib/env.mjs";
import { accounts } from "../seed-local-users.mjs";

fs.mkdirSync(RUN_DIR, { recursive: true });
const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return null; const v = args[i + 1]; return v && !v.startsWith("--") ? v : true; };
const pidFile = (p) => path.join(RUN_DIR, `srv-${p}.pid`);
const logFile = (p) => path.join(RUN_DIR, `srv-${p}.log`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const killTree = (pid) => { try { execSync(process.platform === "win32" ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`, { stdio: "ignore" }); } catch { /* gone */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePinned() {
  try { if ((await fetch(`${PIN_URL}/health`)).ok) return; } catch { /* not up */ }
  if (!fs.existsSync(path.join(PIN_DIR, "manifest.json"))) throw new Error("no pinned snapshot: run tests/qa/pass4/pin-snapshot.mjs");
  const out = fs.openSync(path.join(RUN_DIR, "pinned-api.log"), "a");
  const c = spawn(process.execPath, [path.join(APP_ROOT, "tests/qa/pass4/pinned-api.mjs")], { detached: true, stdio: ["ignore", out, out], cwd: APP_ROOT, windowsHide: true });
  fs.writeFileSync(path.join(RUN_DIR, "pinned-api.pid"), String(c.pid));
  c.unref();
  for (let i = 0; i < 40; i++) { await sleep(250); try { if ((await fetch(`${PIN_URL}/health`)).ok) return; } catch { /* wait */ } }
  throw new Error("pinned API did not start");
}

async function start() {
  const port = Number(opt("port"));
  if (!port) throw new Error("--port is required");
  if (fs.existsSync(pidFile(port)) && alive(Number(fs.readFileSync(pidFile(port), "utf8")))) { console.log(`already running on ${port}`); return; }
  const groq = !!opt("groq"), dev = !!opt("dev"), pinned = !opt("no-pin");
  const f = opt("frozen");
  const frozen = f === true ? FROZEN_NOW : f || null;
  const dist = typeof opt("dist") === "string" ? opt("dist") : dev ? `.next-dev-${port}` : ".next-qa";
  if (pinned) await ensurePinned();
  const env = qaEnv({ port, groq, frozen, ticking: !!opt("ticking"), dist, pinned, instance: typeof opt("instance") === "string" ? opt("instance") : String(port) });
  env.PORT = String(port);
  for (let i = 0; i < args.length; i++) if (args[i] === "--env") { const [k, ...v] = args[i + 1].split("="); env[k] = v.join("="); }
  const out = fs.openSync(logFile(port), "w");
  const next = path.join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");
  const c = spawn(process.execPath, [next, dev ? "dev" : "start", "-H", "127.0.0.1", "-p", String(port)], { detached: true, stdio: ["ignore", out, out], cwd: APP_ROOT, env, windowsHide: true });
  fs.writeFileSync(pidFile(port), String(c.pid));
  c.unref();
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) { await sleep(500); try { const r = await fetch(`${base}/login`); if (r.status < 500) break; } catch { if (i === 239) throw new Error(`no answer on ${port}; see ${logFile(port)}`); } }
  // the first query loads the store: sign in as the Collector so the server is warm before anyone uses it
  const col = accounts().find((a) => a.key === "collector");
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: col.email, password: col.password }) }).catch((e) => ({ status: String(e.message) }));
  console.log(JSON.stringify({ started: port, dist, groq, frozen, signIn: r.status, log: path.relative(APP_ROOT, logFile(port)) }));
}

function stop(port) {
  if (!fs.existsSync(pidFile(port))) return;
  killTree(Number(fs.readFileSync(pidFile(port), "utf8")));
  fs.rmSync(pidFile(port), { force: true });
  console.log(`stopped ${port}`);
}
const running = () => fs.readdirSync(RUN_DIR).map((f) => f.match(/^srv-(\d+)\.pid$/)?.[1]).filter(Boolean).map(Number);

if (cmd === "start") await start();
else if (cmd === "stop") stop(Number(opt("port")));
else if (cmd === "stop-all") {
  for (const p of running()) stop(p);
  const pin = path.join(RUN_DIR, "pinned-api.pid");
  if (fs.existsSync(pin)) { killTree(Number(fs.readFileSync(pin, "utf8"))); fs.rmSync(pin, { force: true }); console.log(`stopped pinned API ${PIN_PORT}`); }
} else if (cmd === "status") {
  for (const p of running()) console.log(p, alive(Number(fs.readFileSync(pidFile(p), "utf8"))) ? "running" : "dead");
} else { console.error("usage: server.mjs start|stop|stop-all|status"); process.exit(2); }
