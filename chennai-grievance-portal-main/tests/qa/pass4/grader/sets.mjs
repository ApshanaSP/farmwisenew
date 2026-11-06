// QA pass 4: reading a frozen test set, checking it against its hash, drawing a stratified sample, and the lock on the sealed run. No app code.
// The sealed file is only ever opened by readSet("sealed"), at run time, by the final gate. Nothing here prints a row.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, "..", "..", "..", "..");
export const QA_DOCS = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4");
export const SETS_DIR = path.join(QA_DOCS, "testsets");
export const RESULTS_DIR = path.join(QA_DOCS, "results");
export const FINDINGS_DIR = path.join(QA_DOCS, "findings");

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** The hashes written when the sets were frozen: { "open.jsonl": "...", "sealed.jsonl": "..." } */
export function frozenHashes(dir = SETS_DIR) {
  const out = {};
  for (const line of fs.readFileSync(path.join(dir, "HASHES.txt"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64}) \*(\S+)/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/** A set's rows, after its hash is checked. A set that no longer matches is refused: it may not be edited. */
export function readSet(name, dir = SETS_DIR) {
  if (name !== "open" && name !== "sealed") throw new Error(`no such test set: ${name}`);
  const text = name === "open"
    ? fs.readFileSync(path.join(dir, "open.jsonl"), "utf8")
    : zlib.gunzipSync(fs.readFileSync(path.join(dir, "sealed.jsonl.gz"))).toString("utf8");
  const want = frozenHashes(dir)[`${name}.jsonl`];
  const got = sha(text), gotLf = sha(text.replace(/\r\n/g, "\n"));
  if (want && got !== want && gotLf !== want) throw new Error(`${name} set does not match its frozen hash`);
  return { rows: text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)), hash: want ?? got };
}

/** A small fast generator, the one the sets were split with. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** n rows, spread over family and language in proportion (largest remainder), chosen by the seed. The same seed gives the same rows. */
export function stratifiedSample(rows, n, seed = 20261106) {
  if (!Number.isInteger(n) || n <= 0 || n >= rows.length) return rows.slice();
  const rnd = mulberry32(seed);
  const strata = new Map();
  for (const r of rows) { const k = `${r.family}/${r.lang}`; if (!strata.has(k)) strata.set(k, []); strata.get(k).push(r); }
  const keys = [...strata.keys()].sort();
  const quota = keys.map((k) => { const exact = (strata.get(k).length * n) / rows.length; return { k, take: Math.floor(exact), rest: exact - Math.floor(exact) }; });
  let left = n - quota.reduce((a, q) => a + q.take, 0);
  for (const q of [...quota].sort((a, b) => b.rest - a.rest || a.k.localeCompare(b.k))) { if (left-- <= 0) break; q.take++; }
  const picked = new Set();
  for (const q of quota) {
    const pool = [...strata.get(q.k)];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (const r of pool.slice(0, q.take)) picked.add(r.id);
  }
  return rows.filter((r) => picked.has(r.id));
}

/**
 * The sealed lock: a sealed run writes its results once, ever. This takes the file (it fails if the file exists, and two runs cannot both win), so a
 * second run stops before it reads a single row. Returns the path.
 */
export function claimSealedResult(mode, dir = RESULTS_DIR) {
  if (!/^[a-z0-9-]+$/.test(mode)) throw new Error(`bad mode: ${mode}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sealed-${mode}.json`);
  let fd;
  try { fd = fs.openSync(file, "wx"); } catch (e) {
    if (e.code === "EEXIST") throw new Error(`sealed lock: ${path.basename(file)} already exists, and the sealed set runs once only`);
    throw e;
  }
  fs.writeSync(fd, JSON.stringify({ claimed: true, note: "a sealed run started here" }));
  fs.closeSync(fd);
  return file;
}

/** The label a run writes under: plain words only, and "sealed-" is taken. */
export function checkLabel(label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(label ?? "")) throw new Error("QA_P4_LABEL: letters, digits, dot, dash and underscore only");
  if (/^sealed-/.test(label)) throw new Error("the label sealed-* belongs to the sealed run");
  return label;
}

export function resultsPath(label, dir = RESULTS_DIR) { return path.join(dir, `${label}.json`); }

/**
 * Opens a run: the one door to a set. For the sealed set the lock is taken before the file is read, so a second run stops before it sees a row, and nothing here prints.
 * Returns { rows, hash, outFile, sealed }. `dirs` is for the lock's own test (a temporary fake folder); a real run leaves it out.
 */
export function openRun({ set, label, mode = "codelanes", sample = null, seed = 20261106 }, dirs = {}) {
  const setsDir = dirs.sets ?? SETS_DIR, resDir = dirs.results ?? RESULTS_DIR;
  if (set !== "open" && set !== "sealed") throw new Error(`QA_P4_SET: open or sealed, not ${set}`);
  const sealed = set === "sealed";
  if (sealed && sample) throw new Error("the sealed set runs whole, once");
  let outFile;
  if (sealed) outFile = claimSealedResult(mode, resDir);
  else { fs.mkdirSync(resDir, { recursive: true }); outFile = resultsPath(checkLabel(label), resDir); }
  const { rows, hash } = readSet(set, setsDir);
  const chosen = sample ? stratifiedSample(rows, Number(sample), Number(seed)) : rows;
  return { rows: chosen, hash, outFile, sealed };
}
