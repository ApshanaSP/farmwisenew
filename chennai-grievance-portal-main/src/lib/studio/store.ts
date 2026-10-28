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
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { DRow } from "@/lib/studio/clean";
import type { Table } from "@/lib/studio/parse";
import type { AuthInput, Candidate, DatasetCard, DatasetMeta, Pin, PickSet, Spec } from "@/lib/studio/types";

// STUDIO_DIR: another folder (the golden questions load the samples into a temporary one)
const DIR = process.env.STUDIO_DIR || path.join(process.cwd(), "data", "studio");
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

// each saved original's sha256, by id and modification time (a source fetched again is hashed again)
const srcHashes = new Map<string, { mtime: number; sha: string }>();
const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * A dataset already made from exactly these bytes (the same file, sample or downloaded link), so adding it again opens
 * it rather than making a copy. Only finished datasets count: a run the Relevance gate stopped has no dataset yet.
 */
export function findBySource(buf: Buffer): DatasetMeta | null {
  ensure();
  const want = sha256(buf);
  for (const f of fs.readdirSync(DIR)) {
    const id = f.replace(/\.src$/, "");
    if (!f.endsWith(".src") || !ID_RE.test(id)) continue;
    try {
      const st = fs.statSync(path.join(DIR, f));
      if (st.size !== buf.length) continue;
      let h = srcHashes.get(id);
      if (!h || h.mtime !== st.mtimeMs) srcHashes.set(id, (h = { mtime: st.mtimeMs, sha: sha256(fs.readFileSync(path.join(DIR, f))) }));
      if (h.sha === want) { const m = getMeta(id); if (m) return m; }
    } catch { /* deleted meanwhile */ }
  }
  return null;
}

/** Every dataset's id (no cards built: a quick look for duplicates). */
export function datasetIds(): string[] {
  ensure();
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && ID_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5));
}

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

/** A run stopped by the Relevance gate: what is needed to resume it with "Use anyway" (no reading yet when the link
 *  engine stopped it before the agents ran). */
export interface Pending { id: string; table: Table; source: DatasetMeta["source"]; name: string | null; sample: boolean; spec: Spec | null; why: string; signals: string[]; at: string }
export function savePending(x: Pending) { write(p(x.id, ".pending.json"), JSON.stringify(x)); }
export function getPending(id: string): Pending | null {
  try { return JSON.parse(fs.readFileSync(p(id, ".pending.json"), "utf8")); } catch { return null; }
}
export function dropPending(id: string, all = false) {
  fs.rmSync(p(id, ".pending.json"), { force: true });
  // a dataset that was never kept leaves nothing behind
  if (all) for (const ext of [".src", ".cand.json.gz", ".auth"]) fs.rmSync(p(id, ext), { force: true });
}

/** A link that held several datasets, waiting for the Collector's choice in the picker. */
export interface SavedPick { pick: PickSet; found: { cand: Candidate; table: Table }[]; auth: AuthInput["mode"]; every: number | null; name: string | null; buf: string; contentType: string; pageUrl: string; method: "http" | "browser" }
export function savePick(id: string, x: SavedPick) { write(p(id, ".pick.json.gz"), zlib.gzipSync(JSON.stringify(x))); }
export function getPick(id: string): SavedPick | null {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p(id, ".pick.json.gz"))).toString("utf8")); } catch { return null; }
}

export function deleteDataset(id: string) {
  for (const ext of [".json", ".rows.json.gz", ".src", ".cand.json.gz", ".auth", ".pending.json"]) fs.rmSync(p(id, ext), { force: true });
  rowCache.delete(id);
  const b = getBoard();
  saveBoard(b.filter((x) => x.datasetId !== id));
}

/** The sha256 of a dataset's saved original (cached by modification time), or null when it has none. */
function sourceSha(id: string): string | null {
  try {
    const f = p(id, ".src");
    const st = fs.statSync(f);
    let h = srcHashes.get(id);
    if (!h || h.mtime !== st.mtimeMs) srcHashes.set(id, (h = { mtime: st.mtimeMs, sha: sha256(fs.readFileSync(f)) }));
    return h.sha;
  } catch { return null; }
}

const CHENNAI = /\b(chennai|madras)\b|சென்னை/i;
const outsideCache = new Map<string, boolean>();
/**
 * Data with nothing of Chennai in it ("Country Population Over Years", R-06): the Relevance gate's verdict when the dataset
 * has one; for one added before the gate, no row placed on Chennai's map and Chennai named nowhere. A dataset the
 * Collector kept anyway ("Use anyway") stays listed.
 */
export function outsideDistrict(m: DatasetMeta, rows?: () => DRow[]): boolean {
  if (m.relevance) return m.relevance.verdict === "unrelated" && !m.relevance.forced;
  const key = `${m.id}|${m.updatedAt}`;
  if (!outsideCache.has(key)) {
    const named = CHENNAI.test([m.name, m.spec.title, m.spec.summary, m.source.file, m.source.url ?? ""].join(" "));
    let placed = false;
    if (!named && !m.spec.deptName) try { placed = (rows ?? (() => getRows(m.id)))().some((r) => r._z != null || r._w != null || r._t != null); } catch { placed = true; }
    outsideCache.set(key, !named && !m.spec.deptName && !placed);
  }
  return outsideCache.get(key)!;
}

/**
 * The Collector's datasets, newest first: one card per original file (R-06: the same 16,113-row grievance export was listed
 * 8 times under different names and departments). The copies stay on disk, untouched; the card says how many there are and
 * every department they were filed under. Data with nothing of Chennai in it is left out of the list (also kept on disk).
 */
export function listDatasets(): DatasetCard[] {
  return listAll().cards;
}
/** The datasets left out of the list as not about Chennai, for the line that says so. */
export function hiddenDatasets(): { id: string; name: string }[] {
  return listAll().hidden;
}
function listAll(): { cards: DatasetCard[]; hidden: { id: string; name: string }[] } {
  ensure();
  const all: { card: DatasetCard; sha: string | null }[] = [], hidden: { id: string; name: string }[] = [];
  for (const f of fs.readdirSync(DIR)) {
    const id = f.replace(/\.json$/, "");
    if (!f.endsWith(".json") || !ID_RE.test(id)) continue;
    const m = getMeta(id);
    if (!m) continue;
    if (outsideDistrict(m)) { hidden.push({ id: m.id, name: m.name }); continue; }
    all.push({ sha: sourceSha(id), card: { id: m.id, name: m.name, kind: m.source.kind, file: m.source.file, rows: m.rows, health: m.detective.after,
      department: m.spec.deptName, updatedAt: m.updatedAt, link: m.link?.strength ?? null, sample: m.sample,
      every: m.source.connect?.every ?? null, failing: !!m.source.connect?.lastError, auth: m.source.connect?.auth ?? "none" } });
  }
  all.sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt));
  const bySha = new Map<string, DatasetCard>(), cards: DatasetCard[] = [];
  for (const { card, sha } of all) {
    const first = sha ? bySha.get(sha) : undefined;
    if (!first) {
      if (sha) bySha.set(sha, card);
      cards.push(card);
      continue;
    }
    first.copies = (first.copies ?? 1) + 1;
    const depts = new Set([first.department, ...(first.departments ?? []), card.department].filter((d): d is string => !!d));
    first.departments = [...depts];
  }
  return { cards, hidden };
}

export function getBoard(): Pin[] {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "board.json"), "utf8")); } catch { return []; }
}
export function saveBoard(pins: Pin[]) { write(path.join(DIR, "board.json"), JSON.stringify(pins.slice(0, 24))); }

/** A dataset's most pressing findings, for the Briefing ("From your datasets"): read from its saved brief, no model. */
export interface WatchItem {
  id: string; name: string; sample: boolean; updatedAt: string; department: string | null;
  verdict: string; act: number;
  top: { headline: string; priority: "act" | "watch" | "note"; metric: string; caption: string; label: string }[];
}

const RANK = { act: 0, watch: 1, note: 2 } as const;

export function watchList(max = 6): WatchItem[] {
  const out: WatchItem[] = [];
  for (const d of listDatasets()) {
    const m = getMeta(d.id);
    const b = m?.brief;
    if (!m || !b?.items?.length) continue;
    // a brief saved before R-19 may rank a zone count of things (no open status) as an action: it is a note
    const things = !m.spec.columns?.some((c) => c.role === "status");
    const items = b.items.map((x) => (things && x.label === "Hotspot" && x.priority !== "note" ? { ...x, priority: "note" as const } : x))
      .sort((x, y) => RANK[x.priority] - RANK[y.priority] || y.score - x.score);
    out.push({
      id: m.id, name: m.name, sample: m.sample, updatedAt: m.updatedAt, department: m.spec.deptName, verdict: b.verdict,
      act: items.filter((x) => x.priority === "act").length,
      // only what needs action reaches the Briefing (U8 gating): what is worth knowing stays in the Studio
      top: items.filter((x) => x.priority === "act").slice(0, 2).map((x) => ({
        headline: x.headline || x.title, priority: x.priority, metric: x.metric?.value ?? "", caption: x.metric?.caption ?? "", label: x.label }))
    });
  }
  // what needs acting on first, then the freshest
  return out.sort((a, b) => Number(b.act > 0) - Number(a.act > 0) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, max);
}
