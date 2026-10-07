/**
 * Where Studio datasets live: files under data/studio/ on this server (like uploaded photos), not in the shared
 * store. With DATA_BACKEND=aws the shared store is rebuilt from AWS every few minutes and keeps only the tables it
 * already knows, so a Collector's own files would vanish; here they stay until deleted.
 *
 *   <id>.json           the dataset: source, spec, profile, Data Detective report, dashboard plans, link, story, alerts
 *   <id>.rows.json.gz   the cleaned rows with their derived fields
 *   <id>.src            the original file, so a re-mapping re-reads it exactly
 *   <id>.cand.json.gz   a link's candidate tables (every table, file, feed it held), so another can be chosen
 *   <id>.auth           a link's sign-in and browser session, encrypted (connect/vault.ts)
 *   <id>.pending.json   a run the Relevance gate stopped, waiting for "Use anyway"
 *   board.json          panels pinned to the Studio board
 * Writes go to a temporary file first and are renamed into place, so a crash never leaves half a file.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { DRow } from "@/lib/studio/clean";
import type { Table } from "@/lib/studio/parse";
import type { Candidate, DatasetCard, DatasetMeta, Pin, Spec } from "@/lib/studio/types";

const DIR = path.join(process.cwd(), "data", "studio");
const ID_RE = /^ds_[a-z0-9]{6,24}$/;

declare global {
  // eslint-disable-next-line no-var
  var __studioRows: Map<string, { at: number; rows: DRow[] }> | undefined;
}
const rowCache = (global.__studioRows ??= new Map());

function ensure() { fs.mkdirSync(DIR, { recursive: true }); }
function write(file: string, data: string | Buffer) {
  ensure();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
const p = (id: string, ext: string) => {
  if (!ID_RE.test(id)) throw new Error("Unknown dataset.");
  return path.join(DIR, `${id}${ext}`);
};

export function newId(): string {
  return `ds_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export const validId = (id: string) => ID_RE.test(id);

export function saveDataset(meta: DatasetMeta, rows: DRow[]) {
  write(p(meta.id, ".rows.json.gz"), zlib.gzipSync(JSON.stringify(rows)));
  rowCache.set(meta.id, { at: Date.now(), rows });
  write(p(meta.id, ".json"), JSON.stringify(meta));
}
export function saveMeta(meta: DatasetMeta) { write(p(meta.id, ".json"), JSON.stringify(meta)); }
export function saveSource(id: string, buf: Buffer) { write(p(id, ".src"), buf); }

export function getMeta(id: string): DatasetMeta | null {
  try { return JSON.parse(fs.readFileSync(p(id, ".json"), "utf8")); } catch { return null; }
}
export function getSource(id: string): Buffer | null {
  try { return fs.readFileSync(p(id, ".src")); } catch { return null; }
}
export function getRows(id: string): DRow[] {
  const c = rowCache.get(id);
  if (c) { c.at = Date.now(); return c.rows; }
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(p(id, ".rows.json.gz"))).toString("utf8")) as DRow[];
  rowCache.set(id, { at: Date.now(), rows });
  // keep the six most recently used datasets in memory
  if (rowCache.size > 6) [...rowCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, rowCache.size - 6).forEach(([k]) => rowCache.delete(k));
  return rows;
}

export function saveCandidates(id: string, found: { cand: Candidate; table: Table }[]) {
  write(p(id, ".cand.json.gz"), zlib.gzipSync(JSON.stringify(found)));
}
export function getCandidates(id: string): { cand: Candidate; table: Table }[] {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p(id, ".cand.json.gz"))).toString("utf8")); } catch { return []; }
}

/** A run stopped by the Relevance gate: what is needed to resume it with "Use anyway". */
export interface Pending { id: string; table: Table; source: DatasetMeta["source"]; name: string | null; sample: boolean; spec: Spec; why: string; signals: string[]; at: string }
export function savePending(x: Pending) { write(p(x.id, ".pending.json"), JSON.stringify(x)); }
export function getPending(id: string): Pending | null {
  try { return JSON.parse(fs.readFileSync(p(id, ".pending.json"), "utf8")); } catch { return null; }
}
export function dropPending(id: string, all = false) {
  fs.rmSync(p(id, ".pending.json"), { force: true });
  // a dataset that was never kept leaves nothing behind
  if (all) for (const ext of [".src", ".cand.json.gz", ".auth"]) fs.rmSync(p(id, ext), { force: true });
}

export function deleteDataset(id: string) {
  for (const ext of [".json", ".rows.json.gz", ".src", ".cand.json.gz", ".auth", ".pending.json"]) fs.rmSync(p(id, ext), { force: true });
  rowCache.delete(id);
  const b = getBoard();
  saveBoard(b.filter((x) => x.datasetId !== id));
}

export function listDatasets(): DatasetCard[] {
  ensure();
  const out: DatasetCard[] = [];
  for (const f of fs.readdirSync(DIR)) {
    const id = f.replace(/\.json$/, "");
    if (!f.endsWith(".json") || !ID_RE.test(id)) continue;
    const m = getMeta(id);
    if (!m) continue;
    out.push({ id: m.id, name: m.name, kind: m.source.kind, file: m.source.file, rows: m.rows, health: m.detective.after, department: m.spec.deptName,
      updatedAt: m.updatedAt, link: m.link?.strength ?? null, sample: m.sample,
      every: m.source.connect?.every ?? null, failing: !!m.source.connect?.lastError, auth: m.source.connect?.auth ?? "none" });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getBoard(): Pin[] {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "board.json"), "utf8")); } catch { return []; }
}
export function saveBoard(pins: Pin[]) { write(path.join(DIR, "board.json"), JSON.stringify(pins.slice(0, 24))); }
