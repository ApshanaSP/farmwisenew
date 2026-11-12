// QA pass 4: Git LFS files are not in the commits themselves, so neither gitleaks nor scan-history.mjs sees them. This reads the copies in .git/lfs/objects, in overlapping
// pieces, for the secret values in .env (as they are) and for key shapes. Prints only names and the LFS object's short id, never a value.
//   node tests/qa/pass4/scan-lfs.mjs [--out report.json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_PATTERNS, classOf, readEnvFile, walk } from "./lib/secret-scan.mjs";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const commonDir = path.resolve(APP_ROOT, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: APP_ROOT, encoding: "utf8" }).trim());
const objects = path.join(commonDir, "lfs", "objects");
const secrets = readEnvFile(path.join(APP_ROOT, ".env")).filter((e) => e.value.length > 7 && classOf(e.name) !== "setting").map((e) => ({ name: e.name, b: Buffer.from(e.value) }));
const shapes = new RegExp(KEY_PATTERNS.map(([, re]) => `(?:${re.source})`).join("|"));
const PIECE = 48 * 1024 * 1024, OVERLAP = 8 * 1024;

const hits = [];
let bytes = 0;
const files = walk(objects, (r) => !r.includes("/incomplete/") && !r.startsWith("incomplete") && !r.includes("/tmp/"));
for (const f of files) {
  const id = path.basename(f).slice(0, 12);
  const fd = fs.openSync(f, "r");
  const size = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(Math.min(PIECE, Math.max(1, size)));
  const found = new Set();
  for (let at = 0; at < size; at += PIECE - OVERLAP) {
    const n = fs.readSync(fd, buf, 0, buf.length, at);
    const part = buf.subarray(0, n);
    for (const s of secrets) if (!found.has(s.name) && part.includes(s.b)) { found.add(s.name); hits.push({ kind: "env", name: s.name, object: id }); }
    if (!found.has("key-shape")) {
      const text = part.toString("latin1");
      const m = text.match(shapes);
      if (m) { found.add("key-shape"); const which = KEY_PATTERNS.find(([, re]) => re.test(m[0]))?.[0] ?? "key-shape"; hits.push({ kind: "pattern", name: which, object: id }); }
    }
    if (n < buf.length) break;
  }
  fs.closeSync(fd);
  bytes += size;
}
const report = { objectsScanned: files.length, bytesScanned: bytes, secretVariablesChecked: [...new Set(secrets.map((s) => s.name))].sort(), patternsChecked: KEY_PATTERNS.map(([n]) => n), hits };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(`scan-lfs: ${files.length} objects, ${(bytes / 1e9).toFixed(2)} GB, hits: ${hits.length}`);
for (const h of hits) console.log(`${h.kind} ${h.name} object ${h.object}`);
