// QA pass 4: before a real-path test run, make sure the pinned API is up. It keeps running for other runs; `server.mjs stop-all` stops it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT, PIN_DIR, PIN_URL, RUN_DIR } from "./env.mjs";

export default async function setup() {
  try { if ((await fetch(`${PIN_URL}/health`)).ok) return; } catch { /* not up */ }
  if (!fs.existsSync(path.join(PIN_DIR, "manifest.json"))) throw new Error("no pinned snapshot: run tests/qa/pass4/pin-snapshot.mjs");
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const out = fs.openSync(path.join(RUN_DIR, "pinned-api.log"), "a");
  const c = spawn(process.execPath, [path.join(APP_ROOT, "tests/qa/pass4/pinned-api.mjs")], { detached: true, stdio: ["ignore", out, out], cwd: APP_ROOT, windowsHide: true });
  fs.writeFileSync(path.join(RUN_DIR, "pinned-api.pid"), String(c.pid));
  c.unref();
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); try { if ((await fetch(`${PIN_URL}/health`)).ok) return; } catch { /* wait */ } }
  throw new Error("pinned API did not start");
}
