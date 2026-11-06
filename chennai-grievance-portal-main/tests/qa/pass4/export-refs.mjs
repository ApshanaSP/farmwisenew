// QA pass 4: exports the bodies, zones and categories from the pinned snapshot for the blind test-set authors.
//   node tests/qa/pass4/export-refs.mjs <out dir>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PIN_DIR } from "./lib/env.mjs";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
for (const name of ["ref_departments", "ref_zones", "ref_categories"]) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PIN_DIR, "tables", `${name}.json.gz`))).toString("utf8"));
  const cols = j.columns.map((c) => c[0]);
  const rows = j.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(rows, null, 1));
  console.log(name, rows.length, cols.join(","));
}
