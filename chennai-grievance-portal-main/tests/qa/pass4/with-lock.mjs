// QA pass 4: a simple semaphore across processes, because many agents share one 16 GB machine.
//   node tests/qa/pass4/with-lock.mjs <name> <slots> -- <command...>
// Waits for one of <slots> slots, runs the command, passes on its exit code. A slot whose holder has died is taken over.
// Standard names: build 1, vitest-full 2, stryker 1, browser 3, server 4.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { QA_DIR } from "./lib/env.mjs";

const [name, slotsArg, sep, ...cmd] = process.argv.slice(2);
if (sep !== "--" || !cmd.length) { console.error("usage: with-lock.mjs <name> <slots> -- <command...>"); process.exit(2); }
const slots = Math.max(1, Number(slotsArg) || 1);
const dir = path.join(QA_DIR, "locks");
fs.mkdirSync(dir, { recursive: true });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function tryTake() {
  for (let i = 0; i < slots; i++) {
    const f = path.join(dir, `${name}.${i}.lock`);
    try { fs.writeFileSync(f, String(process.pid), { flag: "wx" }); return f; } catch { /* taken */ }
    try { const pid = Number(fs.readFileSync(f, "utf8")); if (!alive(pid)) { fs.rmSync(f, { force: true }); fs.writeFileSync(f, String(process.pid), { flag: "wx" }); return f; } } catch { /* raced */ }
  }
  return null;
}
let held = null, waited = 0;
while (!(held = tryTake())) { await new Promise((r) => setTimeout(r, 3000)); waited += 3; if (waited % 300 === 0) console.error(`[lock] still waiting for ${name} after ${waited}s`); }
const release = () => { try { fs.rmSync(held, { force: true }); } catch { /* gone */ } };
process.on("exit", release);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const child = spawn(cmd.join(" "), { stdio: "inherit", shell: true });
child.on("exit", (code) => { release(); process.exit(code ?? 1); });
