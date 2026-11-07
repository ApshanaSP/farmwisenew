// RC-16 gate: run the unit suite under more than one server time zone. A date read in the server's zone passes in India
// (the developer's PC) and fails on a UTC host. Usage: node tests/qa/pass4/with-tz.mjs [zone ...] [-- vitest args]
import { spawnSync } from "node:child_process";
const argv = process.argv.slice(2);
const cut = argv.indexOf("--");
const zones = (cut < 0 ? argv : argv.slice(0, cut)).filter(Boolean);
const rest = cut < 0 ? [] : argv.slice(cut + 1);
let bad = 0;
for (const tz of zones.length ? zones : ["UTC", "Asia/Kolkata"]) {
  console.log(`\n=== vitest under TZ=${tz} ===`);
  const r = spawnSync("npx", ["vitest", "run", ...rest], { stdio: "inherit", shell: true, env: { ...process.env, TZ: tz } });
  if (r.status !== 0) bad++;
}
process.exit(bad ? 1 : 0);
