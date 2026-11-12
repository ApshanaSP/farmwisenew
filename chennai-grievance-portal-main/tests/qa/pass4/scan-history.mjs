// QA pass 4: was a key ever committed? Reads every file version in every commit reachable from any ref (git rev-list --all --objects), which is wider than
// gitleaks: it also sees files git calls binary, and it checks for the exact values in today's .env, which a rule-based scanner cannot do.
// Prints only names: the variable or pattern, the path and the first commit that holds it. Never a value.
//   node tests/qa/pass4/scan-history.mjs [--out <report.json>] [--reflog]
// --reflog also looks in commits only the reflog still reaches (never pushed, or rewritten).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envNeedles, innerBuffers, isContainer, isLfsPointer, scanBuffer } from "./lib/secret-scan.mjs";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const useReflog = args.includes("--reflog");
const MAX_BLOB = 400 * 1024 * 1024;

const git = (...a) => execFileSync("git", a, { cwd: APP_ROOT, maxBuffer: 1 << 30, encoding: "utf8" });
const revArgs = ["--all", ...(useReflog ? ["--reflog"] : [])];
const needles = envNeedles(path.join(APP_ROOT, ".env"), 7);

// every blob, with one path it was seen at
const paths = new Map();
for (const line of git("rev-list", ...revArgs, "--objects").split("\n")) {
  const i = line.indexOf(" ");
  if (i > 0) { const sha = line.slice(0, i); if (!paths.has(sha)) paths.set(sha, line.slice(i + 1)); }
}
// keep blobs only, with their sizes
const types = execFileSync("git", ["cat-file", "--batch-check"], { cwd: APP_ROOT, input: [...paths.keys()].join("\n") + "\n", maxBuffer: 1 << 30, encoding: "utf8" });
const blobs = [];
let skippedBig = 0;
for (const line of types.split("\n")) {
  const [sha, type, size] = line.split(" ");
  if (type !== "blob") continue;
  if (Number(size) > MAX_BLOB) { skippedBig++; continue; }
  blobs.push({ sha, size: Number(size), path: paths.get(sha) || "" });
}

const hits = [];
const lfsPointers = [], containersNotOpened = [];
let containersOpened = 0;
let done = 0, bytes = 0;
await new Promise((resolve, reject) => {
  const p = spawn("git", ["cat-file", "--batch"], { cwd: APP_ROOT, stdio: ["pipe", "pipe", "inherit"] });
  let pending = [], have = 0;
  let cur = null; // {size, sha}
  p.stdout.on("data", (d) => {
    pending.push(d); have += d.length;
    for (;;) {
      if (!cur) {
        const buf = pending.length === 1 ? pending[0] : Buffer.concat(pending);
        const nl = buf.indexOf(10);
        pending = [buf]; have = buf.length;
        if (nl < 0) return;
        const [sha, , size] = buf.subarray(0, nl).toString().split(" ");
        pending = [buf.subarray(nl + 1)]; have = buf.length - nl - 1;
        if (size === undefined) continue; // "<sha> missing"
        cur = { sha, size: Number(size) };
      }
      if (have < cur.size + 1) return; // keeps the pieces apart until the whole file has arrived, so a large one costs one join
      const buf = pending.length === 1 ? pending[0] : Buffer.concat(pending);
      const body = buf.subarray(0, cur.size), name = paths.get(cur.sha) || "";
      for (const h of scanBuffer(body, needles)) hits.push({ ...h, sha: cur.sha, path: name });
      if (isLfsPointer(body)) lfsPointers.push(name);
      else if (isContainer(name)) {
        const inner = innerBuffers(name, body);
        if (inner.length) containersOpened++; else containersNotOpened.push(name);
        for (const [part, b] of inner) for (const h of scanBuffer(b, needles)) hits.push({ ...h, sha: cur.sha, path: part ? `${name}!${part}` : `${name}!` });
      }
      done++; bytes += cur.size;
      pending = [buf.subarray(cur.size + 1)]; have = buf.length - cur.size - 1;
      cur = null;
    }
  });
  p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`git cat-file exited ${c}`))));
  p.stdin.write(blobs.map((b) => b.sha).join("\n") + "\n");
  p.stdin.end();
});

// the first commit that added the path for a real hit, so the triage can say how old it is
const firstCommit = (p) => { try { return git("log", ...revArgs, "--diff-filter=A", "--format=%h %cs", "--", `:/${p.split("!")[0]}`).trim().split("\n").pop(); } catch { return ""; } };
const realHits = hits.filter((h) => h.class === "secret" || h.class === "identity" || h.class === "key-shape");
const grouped = new Map();
for (const h of realHits) {
  const k = `${h.kind}|${h.name}|${h.path}`;
  if (!grouped.has(k)) grouped.set(k, { kind: h.kind, name: h.name, class: h.class, path: h.path, versions: 0 });
  grouped.get(k).versions++;
}
const list = [...grouped.values()].map((g) => ({ ...g, firstCommit: firstCommit(g.path) }));
const settings = new Map();
for (const h of hits.filter((x) => x.class === "setting")) settings.set(h.name, (settings.get(h.name) || 0) + 1);
const report = { revs: revArgs.join(" "), commits: Number(git("rev-list", ...revArgs, "--count").trim()), blobsScanned: done, bytesScanned: bytes, blobsSkippedOver400MB: skippedBig, compressedFilesOpened: containersOpened, compressedFilesNotOpened: [...new Set(containersNotOpened)], gitLfsPointersContentNotHere: [...new Set(lfsPointers)], variablesChecked: [...new Set(needles.map((n) => n.name))].sort(), hits: list, plainSettingsSeen: Object.fromEntries(settings) };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(`scan-history: ${report.commits} commits, ${done} file versions, ${(bytes / 1e6).toFixed(0)} MB, ${skippedBig} over 400 MB skipped`);
console.log(`compressed files opened: ${containersOpened}; not opened: ${report.compressedFilesNotOpened.length}; Git LFS pointers (content is not in this clone's blobs): ${report.gitLfsPointersContentNotHere.length}`);
console.log(`hits on secret values or key shapes: ${list.length}`);
for (const h of list) console.log(`${h.kind} ${h.name} ${h.path} versions=${h.versions} first=${h.firstCommit}`);
