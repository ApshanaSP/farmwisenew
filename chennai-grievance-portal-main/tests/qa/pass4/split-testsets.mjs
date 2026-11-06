// QA pass 4: splits the checked blind rows into the open set (180) and the sealed set (270), with a recorded seed, per family and language.
//   node tests/qa/pass4/split-testsets.mjs <folder holding checked-*.jsonl>
// Prints counts and hashes only, never a sentence. The sealed set is written compressed so that no search over the repo reads it by accident.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { APP_ROOT } from "./lib/env.mjs";

const SEED = 20261106;
const src = process.argv[2];
const OUT = path.join(APP_ROOT, "..", "docs", "qa", "pass4", "testsets");
const WANT = { brief: 60, other_body: 80, explain: 60, list: 60, followup: 40, numbers: 40, privacy_safety: 50, offtopic: 10, noisy: 50 };
const OPEN = 180, TOTAL = 450;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const rows = [];
for (const f of ["checked-en.jsonl", "checked-ta.jsonl", "checked-tanglish.jsonl", "checked-noisy.jsonl"])
  for (const l of fs.readFileSync(path.join(src, f), "utf8").split(/\r?\n/)) if (l.trim()) rows.push(JSON.parse(l));

// validity: the prompt's table, unique ids and sentences, real values
const refs = (n) => JSON.parse(fs.readFileSync(path.join(APP_ROOT, "..", "docs", "qa", "pass4", "refs", "blind", n), "utf8"));
const bodies = new Set(refs("bodies.json").map((r) => r.code)), zones = new Set(refs("zones.json").map((r) => r.zone_name)), cats = new Set(refs("categories.json").map((r) => r.category_code));
const problems = [];
const ids = new Set(), texts = new Set();
for (const r of rows) {
  if (ids.has(r.id)) problems.push(`duplicate id ${r.id}`); ids.add(r.id);
  const key = r.text.toLowerCase().replace(/\s+/g, " ").trim();
  if (texts.has(key)) problems.push(`duplicate sentence in ${r.id}`); texts.add(key);
  if (!WANT[r.family]) problems.push(`bad family in ${r.id}`);
  if (!["en", "ta", "tanglish"].includes(r.lang)) problems.push(`bad lang in ${r.id}`);
  if (!r.expect?.action) problems.push(`no action in ${r.id}`);
  if (r.expect?.body && !bodies.has(r.expect.body)) problems.push(`unknown body ${r.expect.body} in ${r.id}`);
  if (r.expect?.zone && !zones.has(r.expect.zone)) problems.push(`unknown zone ${r.expect.zone} in ${r.id}`);
  if (r.expect?.topic && !cats.has(r.expect.topic)) problems.push(`unknown topic ${r.expect.topic} in ${r.id}`);
  if (r.family === "followup" && !r.earlier?.length) problems.push(`followup with no earlier turn: ${r.id}`);
}
for (const [fam, n] of Object.entries(WANT)) { const got = rows.filter((r) => r.family === fam).length; if (got !== n) problems.push(`family ${fam}: ${got}, wanted ${n}`); }
if (rows.length !== TOTAL) problems.push(`${rows.length} rows, wanted ${TOTAL}`);
if (problems.length) { console.error("NOT SPLIT. Problems:\n" + problems.join("\n")); process.exit(1); }

// strata: family x language. Each stratum gets its share of the open set; largest remainders settle the rounding.
const strata = new Map();
for (const r of rows) { const k = `${r.family}/${r.lang}`; (strata.get(k) ?? strata.set(k, []).get(k)).push(r); }
const keys = [...strata.keys()].sort();
const quota = keys.map((k) => { const exact = (strata.get(k).length * OPEN) / TOTAL; return { k, base: Math.floor(exact), rem: exact - Math.floor(exact), tie: rnd() }; });
let left = OPEN - quota.reduce((s, q) => s + q.base, 0);
for (const q of [...quota].sort((a, b) => b.rem - a.rem || a.tie - b.tie)) { if (left <= 0) break; q.base += 1; left -= 1; }
const open = [], sealed = [], meta = {};
for (const q of quota.sort((a, b) => a.k.localeCompare(b.k))) {
  const s = [...strata.get(q.k)].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  open.push(...s.slice(0, q.base)); sealed.push(...s.slice(q.base));
  meta[q.k] = { total: s.length, open: q.base, sealed: s.length - q.base };
}
open.sort((a, b) => a.id.localeCompare(b.id)); sealed.sort((a, b) => a.id.localeCompare(b.id));
const toJsonl = (a) => a.map((r) => JSON.stringify(r)).join("\n") + "\n";
fs.mkdirSync(OUT, { recursive: true });
const openText = toJsonl(open), sealedText = toJsonl(sealed);
fs.writeFileSync(path.join(OUT, "open.jsonl"), openText);
fs.writeFileSync(path.join(OUT, "sealed.jsonl.gz"), zlib.gzipSync(Buffer.from(sealedText, "utf8"), { level: 9 }));
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
fs.writeFileSync(path.join(OUT, "HASHES.txt"), `${sha(openText)} *open.jsonl\n${sha(sealedText)} *sealed.jsonl (the decompressed text of sealed.jsonl.gz)\n`);
fs.writeFileSync(path.join(OUT, "split-meta.json"), JSON.stringify({ seed: SEED, method: "mulberry32, per family and language, largest remainder", open: open.length, sealed: sealed.length, strata: meta }, null, 1));
console.log(JSON.stringify({ seed: SEED, open: open.length, sealed: sealed.length, sha_open: sha(openText), sha_sealed: sha(sealedText) }));
