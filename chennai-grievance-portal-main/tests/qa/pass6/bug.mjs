// QA pass 6: the bug ledger, docs/qa/pass6/BUGS.json. One row per bug; rows are merged by id, so a later call fills in or changes fields.
//   node tests/qa/pass6/bug.mjs '<json object or array>'      (fields: id severity area found_by repro failing_test root_cause fix_commit
//                                                               revert_check status reviewer title)
//   node tests/qa/pass6/bug.mjs --list                        (id, severity, status, title)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "docs", "qa", "pass6", "BUGS.json");
const FIELDS = ["id", "severity", "area", "title", "found_by", "repro", "failing_test", "root_cause", "fix_commit", "revert_check", "status", "reviewer"];
const rows = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];
const arg = process.argv[2];
if (arg === "--list") {
  for (const r of rows) console.log([r.id, r.severity, r.status, r.title].join(" | "));
  process.exit(0);
}
const add = [].concat(JSON.parse(arg));
for (const a of add) {
  if (!a.id) throw new Error("id is required");
  const i = rows.findIndex((r) => r.id === a.id);
  const base = i < 0 ? Object.fromEntries(FIELDS.map((f) => [f, null])) : rows[i];
  const next = { ...base, ...a };
  if (i < 0) rows.push(next); else rows[i] = next;
}
rows.sort((x, y) => x.id.localeCompare(y.id, "en", { numeric: true }));
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2) + "\n");
console.log(`${rows.length} rows`);
