// QA pass 4: a test that needs a server starts one itself when nothing answers on its port, and stops it again (never one that was already there).
// Before this, model-lifecycle, hunt-askiq and skeptic-askiq failed with "fetch failed" on any run where nobody had started their server first.
import { execFileSync } from "node:child_process";
import path from "node:path";

const APP = path.resolve(__dirname, "..", "..", "..", "..");
// the test process's own settings (the test NODE_ENV, its durable file, its Thunai folder) must not reach the server it starts: same as same-number.test.ts
const childEnv = (): NodeJS.ProcessEnv => { const e: NodeJS.ProcessEnv = { ...process.env }; for (const k of Object.keys(e)) if (k === "NODE_ENV" || k.startsWith("VITEST") || k === "AWS_DURABLE_FILE" || k === "THUNAI_DIR" || k === "NODE_OPTIONS") delete e[k]; return e; };
const run = (a: string[]) => execFileSync(process.execPath, ["tests/qa/pass4/server.mjs", ...a], { cwd: APP, env: childEnv(), stdio: "ignore", timeout: 240_000 });

/** Starts a server on `port` if none answers there. Returns the function that stops it (a no-op when the server was already up). */
export async function ensureServer(port: number, instance: string, args: string[] = ["--frozen", "--ticking"]): Promise<() => void> {
  const probe = () => fetch(`http://127.0.0.1:${port}/login`).then((r) => r.status < 500).catch(() => false);
  // a server another test just stopped can still answer once: it must answer twice, a moment apart
  if (await probe()) { await new Promise((r) => setTimeout(r, 1500)); if (await probe()) return () => {}; }
  run(["start", "--port", String(port), "--instance", `${instance}-${process.pid}`, ...args]);
  return () => { try { run(["stop", "--port", String(port)]); } catch { /* already gone */ } };
}
