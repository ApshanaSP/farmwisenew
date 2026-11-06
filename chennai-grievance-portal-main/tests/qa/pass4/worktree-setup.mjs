// QA pass 4: makes a fixer's own git worktree runnable without copying 1 GB. Run from anywhere:
//   node <pass4 worktree app>/tests/qa/pass4/worktree-setup.mjs <path to the new worktree's chennai-grievance-portal-main>
// node_modules and data/aws-cache are junctions to this worktree's copies (the pinned snapshot is read-only and each server has its own folder);
// .env and data/thunai are copied. All of these are gitignored.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/env.mjs";

const target = path.resolve(process.argv[2] || "");
if (!fs.existsSync(path.join(target, "package.json"))) { console.error("not an app folder: " + target); process.exit(2); }
const junction = (rel) => {
  const to = path.join(target, rel), from = path.join(APP_ROOT, rel);
  if (fs.existsSync(to)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execSync(`cmd /c mklink /J "${to}" "${from}"`, { stdio: "ignore" });
};
junction("node_modules");
junction(path.join("data", "aws-cache"));
fs.copyFileSync(path.join(APP_ROOT, ".env"), path.join(target, ".env"));
fs.cpSync(path.join(APP_ROOT, "data", "thunai"), path.join(target, "data", "thunai"), { recursive: true, filter: (s) => !/srv|spec/.test(path.basename(s)) });
console.log("ready: " + target);
