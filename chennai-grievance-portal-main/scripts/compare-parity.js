/**
 * Compares two parity runs (src/lib/aws/parity.test.ts): MySQL vs the AWS store. Prints, per case, "same" or the
 * first differences (path, mysql value, aws value). Numbers within 1e-6 (relative) count as equal.
 *
 *   node scripts/compare-parity.js tmp/parity-mysql.json tmp/parity-aws.json
 */
const fs = require("fs");

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const diffs = [];
function cmp(x, y, p, out) {
  if (out.length >= 8) return;
  if (typeof x === "number" && typeof y === "number") {
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) out.push([p, x, y]);
    return;
  }
  if (x === null || y === null || typeof x !== "object" || typeof y !== "object") {
    if (x !== y) out.push([p, x, y]);
    return;
  }
  if (Array.isArray(x) !== Array.isArray(y)) return out.push([p, "array?" + Array.isArray(x), "array?" + Array.isArray(y)]);
  if (Array.isArray(x) && x.length !== y.length) out.push([`${p}.length`, x.length, y.length]);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) {
    if (k === "ms") continue;
    if (!(k in x) || !(k in y)) { out.push([`${p}.${k}`, k in x ? "present" : "missing", k in y ? "present" : "missing"]); continue; }
    cmp(x[k], y[k], `${p}.${k}`, out);
  }
}
let same = 0;
for (const name of Object.keys(a.results)) {
  const x = a.results[name], y = b.results[name];
  const out = [];
  if (!y) out.push(["", "present", "missing"]);
  else cmp(x, y, "", out);
  const ms = y ? `${x.ms} ms -> ${y.ms} ms` : "";
  if (!out.length) { same++; console.log(`same       ${name}  (${ms})`); continue; }
  console.log(`DIFFERENT  ${name}  (${ms})`);
  for (const [p, u, v] of out) console.log(`    ${p || "(root)"}:  ${JSON.stringify(u)?.slice(0, 160)}  |  ${JSON.stringify(v)?.slice(0, 160)}`);
}
console.log(`\n${same}/${Object.keys(a.results).length} cases identical (${a.backend} vs ${b.backend})`);
