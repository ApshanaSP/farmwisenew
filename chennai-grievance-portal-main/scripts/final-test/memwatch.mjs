// Every 30 s, the node processes' memory into docs/audits/FINAL_TEST/evidence/memory.csv; flags one growing 10 samples in a row.
//   node scripts/final-test/memwatch.mjs   (stop with Ctrl+C)
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
const out = path.resolve(process.cwd(), "..", "docs", "audits", "FINAL_TEST", "evidence", "memory.csv");
if (!fs.existsSync(out)) fs.writeFileSync(out, "time,pid,ws_mb,private_mb\n");
const last = new Map();
function sample() {
  let rows = [];
  try {
    const j = execFileSync("powershell", ["-NoProfile", "-Command", "Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,WS,PM | ConvertTo-Json"], { encoding: "utf8" });
    rows = [].concat(JSON.parse(j || "[]"));
  } catch { /* no node process */ }
  const t = new Date().toISOString();
  for (const r of rows) {
    const ws = Math.round(r.WS / 1048576), pm = Math.round(r.PM / 1048576);
    fs.appendFileSync(out, `${t},${r.Id},${ws},${pm}\n`);
    const l = last.get(r.Id) ?? { pm: 0, up: 0 };
    const up = pm > l.pm ? l.up + 1 : 0;
    if (up === 10) console.warn(`[memwatch] node ${r.Id} has grown for 10 samples in a row: ${pm} MB private`);
    last.set(r.Id, { pm, up });
  }
}
sample();
setInterval(sample, 30_000);
