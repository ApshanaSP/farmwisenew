// QA pass 4: are secrets in what a browser can download? Reads .env, never prints a value: only a variable or pattern name, and the file.
//   node tests/qa/pass4/scan-bundle.mjs [--dist .next-qa] [--out <report.json>]
// Looks in <dist>/static/** and <dist>/server/app/**/*.html as the brief asks, and also in <dist>/server/app/**/*.rsc, <dist>/server/pages/**/*.html and public/**,
// since a browser can fetch those too.
// Before it trusts a clean result it runs itself on a made-up bundle in the temp folder, with one planted value and one planted key shape.
// Exit 0 clean, 1 a secret was found, 2 the scanner failed its own check.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_PATTERNS, classOf, envNeedles, needlesFor, readEnvFile, scanBuffer, walk } from "./lib/secret-scan.mjs";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const distName = opt("dist", ".next-qa");
const dist = path.join(APP_ROOT, distName);
const outFile = opt("out", null);

const browserFile = (rel) => rel.startsWith("static/") || (/^server\/(app|pages)\//.test(rel) && /\.(html|rsc)$/.test(rel));

function scanDir(root, needles) {
  const files = walk(root, browserFile);
  const hits = [];
  let bytes = 0;
  for (const f of files) {
    const buf = fs.readFileSync(f);
    bytes += buf.length;
    for (const h of scanBuffer(buf, needles)) hits.push({ ...h, file: path.relative(root, f).replace(/\\/g, "/") });
  }
  return { files: files.length, bytes, hits };
}

/** The scanner proves it can find both kinds of hit, and all encoded forms, before anyone believes a zero. */
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scan-bundle-"));
  try {
    const value = `qa-planted-${process.pid}-${Date.now()}`;
    const shape = ["gsk", "_", "A".repeat(30)].join("");
    fs.mkdirSync(path.join(tmp, "static", "chunks"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "server", "app"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "static", "chunks", "a.js"), `var x="${value}"`);
    fs.writeFileSync(path.join(tmp, "static", "chunks", "b.js"), `var y="${Buffer.from(value).toString("base64")}"`);
    fs.writeFileSync(path.join(tmp, "server", "app", "c.html"), `<script>${shape}</script>`);
    fs.writeFileSync(path.join(tmp, "server", "app", "skip.js"), `var z="${value}"`); // a server file: must not count
    const r = scanDir(tmp, [{ name: "PLANTED_KEY", class: "secret", needles: needlesFor(value) }]);
    const seen = (file, name) => r.hits.some((h) => h.file === file && h.name === name);
    return seen("static/chunks/a.js", "PLANTED_KEY") && seen("static/chunks/b.js", "PLANTED_KEY") && seen("server/app/c.html", "groq-gsk_") && !r.hits.some((h) => h.file.endsWith("skip.js"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Variable names of server secrets that show up as words in a browser file: not a leak by itself, but it means server code reached the browser. */
function nameMentions(root, names) {
  const out = [];
  for (const f of walk(root, (r) => r.startsWith("static/") && r.endsWith(".js"))) {
    const text = fs.readFileSync(f, "latin1");
    for (const n of names) if (text.includes(n)) out.push({ name: n, file: path.relative(root, f).replace(/\\/g, "/") });
  }
  return out;
}

if (!selfTest()) { console.error("scan-bundle: the self-test failed, so a clean result would mean nothing"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "BUILD_ID"))) { console.error(`scan-bundle: no build in ${distName}`); process.exit(2); }

const envFile = path.join(APP_ROOT, ".env");
const env = readEnvFile(envFile);
const needles = envNeedles(envFile, 7);
const built = scanDir(dist, needles);
// public/ is served as it is, so it counts too; its files are not under static/ or server/, hence its own walk
const publicHits = [];
let publicFiles = 0, publicBytes = 0;
for (const f of walk(path.join(APP_ROOT, "public"))) {
  const buf = fs.readFileSync(f);
  publicFiles++; publicBytes += buf.length;
  for (const h of scanBuffer(buf, needles)) publicHits.push({ ...h, file: `public/${path.relative(path.join(APP_ROOT, "public"), f).replace(/\\/g, "/")}` });
}
const files = built.files + publicFiles, bytes = built.bytes + publicBytes, hits = [...built.hits, ...publicHits];
const secretHits = hits.filter((h) => h.class === "secret" || h.class === "identity");
const settingHits = hits.filter((h) => h.class === "setting");
const patternHits = hits.filter((h) => h.kind === "pattern");
const secretNames = env.filter((e) => classOf(e.name) === "secret" && !e.name.startsWith("NEXT_PUBLIC_")).map((e) => e.name);
const report = {
  dist: distName,
  buildId: fs.readFileSync(path.join(dist, "BUILD_ID"), "utf8").trim(),
  selfTest: "passed",
  filesScanned: files,
  bytesScanned: bytes,
  scopes: ["static/**", "server/app/**/*.html", "server/app/**/*.rsc", "server/pages/**/*.html", "public/**"],
  envVariablesChecked: [...new Set(needles.map((n) => n.name))].sort().map((name) => ({ name, class: classOf(name) })),
  envVariablesSkippedAs7OrFewerCharacters: [...new Set(env.filter((e) => e.value.length > 0 && e.value.length <= 7).map((e) => e.name))].sort(),
  envVariablesEmpty: [...new Set(env.filter((e) => e.value.length === 0).map((e) => e.name))].sort(),
  patternsChecked: KEY_PATTERNS.map(([n]) => n),
  secretValueHits: secretHits.map(({ name, file }) => ({ name, file })),
  patternHits: patternHits.map(({ name, file }) => ({ name, file })),
  settingValueHits: settingHits.map(({ name, file }) => ({ name, file })),
  secretNameMentionsInBrowserJs: nameMentions(dist, [...new Set(secretNames)]),
  nextPublicInEnv: [...new Set(env.filter((e) => e.name.startsWith("NEXT_PUBLIC_")).map((e) => e.name))].sort().map((name) => ({ name, setInEnv: env.some((e) => e.name === name && e.value.length > 0), class: classOf(name) })),
};
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));

console.log(`scan-bundle: ${files} files, ${(bytes / 1e6).toFixed(1)} MB, build ${report.buildId}, self-test passed`);
console.log(`secret values found: ${secretHits.length}; key shapes found: ${patternHits.length}; plain settings found: ${settingHits.length}`);
for (const h of secretHits) console.log(`SECRET ${h.name} in ${h.file}`);
for (const h of patternHits) console.log(`KEY-SHAPE ${h.name} in ${h.file}`);
const bySetting = new Map();
for (const h of settingHits) bySetting.set(h.name, (bySetting.get(h.name) || 0) + 1);
for (const [n, c] of bySetting) console.log(`setting ${n} (not secret): ${c} file(s)`);
for (const m of report.secretNameMentionsInBrowserJs) console.log(`name-only ${m.name} in ${m.file}`);
process.exit(secretHits.length || patternHits.length ? 1 : 0);
