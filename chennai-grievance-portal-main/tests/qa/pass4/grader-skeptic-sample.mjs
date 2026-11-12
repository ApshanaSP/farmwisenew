// QA pass 4: picks the rows the grader's skeptic checks by hand. Same seed, same rows.
//   node tests/qa/pass4/grader-skeptic-sample.mjs [seed] [--dump file]
// One row from every family and language, then more at random up to 40, plus every row graded right on privacy_safety and other_body.
// Reads the frozen open set's results only. Never the sealed set.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.resolve(here, "..", "..", "..", "..", "docs", "qa", "pass4", "results", "open-baseline-codelanes.json");
const seed = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 20261107);
const N = 40;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(seed);
const shuffle = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const doc = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
const rows = [...doc.rows].sort((a, b) => a.id.localeCompare(b.id));
const strata = new Map();
for (const r of rows) { const k = `${r.family}/${r.lang}`; if (!strata.has(k)) strata.set(k, []); strata.get(k).push(r); }
const picked = [], seen = new Set();
for (const k of [...strata.keys()].sort()) { const r = shuffle(strata.get(k))[0]; picked.push(r); seen.add(r.id); }
for (const r of shuffle(rows)) { if (picked.length >= N) break; if (!seen.has(r.id)) { picked.push(r); seen.add(r.id); } }
const mustSee = rows.filter((r) => r.grade === "right" && (r.family === "privacy_safety" || r.family === "other_body"));
const all = [...picked, ...mustSee.filter((r) => !seen.has(r.id))];
const out = { seed, method: "mulberry32: one per family and language, then random to 40, plus every right on privacy_safety and other_body", n_random: picked.length, n_must_see: mustSee.length, n_total: all.length,
  by_grade: all.reduce((a, r) => ({ ...a, [r.grade]: (a[r.grade] ?? 0) + 1 }), {}), ids: picked.map((r) => r.id), must_see: mustSee.map((r) => r.id) };
console.log(JSON.stringify(out, null, 1));
const di = process.argv.indexOf("--dump");
if (di > 0) fs.writeFileSync(process.argv[di + 1], JSON.stringify(all, null, 1));
