// Shared loader for the QA oracle. Reads the cached data-store snapshot (data/aws-cache/<table>-<sha>.json.gz,
// each {table, columns:[[name, kind]], rows:[[...]]}) without any app code. Never reads .env.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, "..", "..", "..");
export const CACHE_DIR = process.env.QA_CACHE_DIR || path.join(APP_ROOT, "data", "aws-cache");

/** Every cached table file: { table, file, mtime }. The table name is the part before "-<sha>.json.gz". */
export function listTables(dir = CACHE_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => /^[a-z0-9_]+-[0-9a-f]{16,}\.json\.gz$/i.test(f))
    .map((f) => ({ table: f.replace(/-[0-9a-f]+\.json\.gz$/i, ""), file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }));
}

const cache = new Map();
/**
 * Load a table by name (exact table name, or a prefix when no exact match), newest file wins.
 * Returns { table, file, columns, kinds, rows, objects() } where objects() maps rows to {col: value}.
 */
export function loadTable(name, dir = CACHE_DIR) {
  const key = `${dir}|${name}`;
  if (cache.has(key)) return cache.get(key);
  const all = listTables(dir);
  let hits = all.filter((t) => t.table === name);
  if (!hits.length) hits = all.filter((t) => t.table.startsWith(name));
  if (!hits.length) throw new Error(`no cached table matching "${name}" in ${dir}`);
  hits.sort((a, b) => b.mtime - a.mtime);
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(hits[0].file)).toString("utf8"));
  const columns = j.columns.map((c) => c[0]);
  const kinds = Object.fromEntries(j.columns.map((c) => [c[0], c[1]]));
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  let objs = null;
  const t = {
    table: j.table, file: hits[0].file, columns, kinds, idx, rows: j.rows,
    objects() { return (objs ||= j.rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])))); }
  };
  cache.set(key, t);
  return t;
}

/** A store wall-clock string ("YYYY-MM-DD HH:MM:SS", IST, optional T / offset) as ms on a fake-UTC axis. */
export function wallMs(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${(m[2] || "00:00:00").padEnd(8, ":00")}Z`);
  return Number.isNaN(t) ? null : t;
}
export const fmtWall = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
