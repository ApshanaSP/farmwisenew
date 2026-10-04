/**
 * Ask District IQ's search index: LanceDB (an embedded vector database in a folder, no server) holding two
 * collections, `incidents` and `news`. Each record carries its multilingual-e5 vector (meaning, English and Tamil),
 * its text (keywords) and the fields questions filter on (time, zone, category, severity, department).
 *
 * Search is hybrid: meaning (vector, cosine) and keywords (BM25 full-text, fuzzy for typos) run with the same filters
 * and are fused by rank (reciprocal-rank fusion). Retrieval finds records; counts and figures still come from the
 * store (SQL), never from what was retrieved.
 *
 * The index is synced from the store (`syncLance`, `npm run lance:build`): only new or changed texts are embedded
 * (a hash per record), records that only changed status are rewritten with their old vector, records that left the
 * store are removed. Incident vectors already in the older index (data/embeddings) are reused by the same hash.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { embed } from "@/lib/assistant/embed";

const DIR = path.join(process.cwd(), "data", "lancedb");
const MODEL = (process.env.AI_EMBED_MODEL ?? "").trim() || "Xenova/multilingual-e5-base";
const LEGACY = path.join(process.cwd(), "data", "embeddings", `incidents-${MODEL.replace(/[^a-z0-9]+/gi, "_")}`);
export type Kind = "incidents" | "news";

type Lance = typeof import("@lancedb/lancedb");
type Table = Awaited<ReturnType<Awaited<ReturnType<Lance["connect"]>>["openTable"]>>;
interface State { lib: Lance | null; db: Awaited<ReturnType<Lance["connect"]>> | null; tables: Partial<Record<Kind, Table>>; syncing: Promise<SyncReport[]> | null }
declare global {
  // eslint-disable-next-line no-var
  var __lance: State | undefined;
}
const S: State = (global.__lance ??= { lib: null, db: null, tables: {}, syncing: null });

async function lib(): Promise<Lance> {
  // loaded at run time from node_modules (native binaries; next.config keeps it out of the bundle)
  S.lib ??= (await import("@lancedb/lancedb")) as Lance;
  return S.lib;
}
async function conn() {
  // a running website picks up what the build job (another process) writes, within a minute
  S.db ??= await (await lib()).connect(DIR, { readConsistencyInterval: 60 });
  return S.db;
}
async function table(kind: Kind): Promise<Table | null> {
  if (S.tables[kind]) return S.tables[kind]!;
  const db = await conn();
  if (!(await db.tableNames()).includes(kind)) return null;
  return (S.tables[kind] = await db.openTable(kind));
}

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v: unknown, d = -1) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
const epoch = (t: unknown) => (t ? Math.floor(Date.parse(`${String(t).replace(" ", "T")}+05:30`) / 1000) || 0 : 0);

// ------------------------------------------------------------------ records --

/** One record as stored: fixed types (no nulls), so every batch has the same schema. */
export interface Rec {
  id: string; text: string; title: string; cat: string; cat_label: string; zone_no: number; zone: string; place: string; taluk: string;
  dept: string; sev: string; status: string; open: number; t: number; dead: number; source: string; url: string; story: string;
  incident: string; thash: string; rhash: string; vector: number[];
}

async function rows(kind: Kind): Promise<Omit<Rec, "vector">[]> {
  const q = async (sql: string) => (await intelPool.query<RowDataPacket[]>(sql))[0];
  if (kind === "incidents") {
    const r = await q(`SELECT incident_id AS id, category_label AS cat_label, category_code AS cat, title, place_text AS place, zone_no AS zone_no,
        zone_name AS zone, taluk_code AS taluk, lead_dept AS dept, severity_level AS sev, status_std AS status, is_open AS open,
        DATE_FORMAT(first_reported_at, '%Y-%m-%d %H:%i:%s') AS t, dead, summary, sources FROM incidents`);
    return r.map((x) => {
      // the same text the older index embedded, so its vectors can be reused
      const text = [clean(x.cat_label, 60), clean(x.title, 220), clean(x.place, 120), clean(x.zone, 40), clean(x.summary, 300)].filter(Boolean).join(". ");
      const base = {
        id: String(x.id), text, title: clean(x.title || x.cat_label, 220), cat: String(x.cat ?? ""), cat_label: String(x.cat_label ?? ""),
        zone_no: num(x.zone_no), zone: String(x.zone ?? ""), place: clean(x.place, 120), taluk: String(x.taluk ?? ""), dept: String(x.dept ?? ""),
        sev: String(x.sev ?? ""), status: String(x.status ?? ""), open: num(x.open, 0), t: epoch(x.t), dead: num(x.dead, 0),
        source: String(x.sources ?? ""), url: "", story: "", incident: String(x.id)
      };
      return { ...base, thash: sha(`passage: ${text}`), rhash: sha(JSON.stringify(base)) };
    });
  }
  const r = await q(`SELECT doc_id AS id, story_id AS story, title, summary, url, publisher, category_code AS cat, place_text AS place,
      DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS t, dead, linked_incident_id AS incident, is_incident, department AS dept
      FROM documents WHERE source_kind = 'news' AND is_district = 1`);
  return r.map((x) => {
    const sum = clean(x.summary, 300);
    const text = [clean(x.title, 300), sum && sum !== clean(x.title, 300) ? sum : ""].filter(Boolean).join(". ");
    const base = {
      id: String(x.id), text, title: clean(x.title, 300), cat: String(x.cat ?? ""), cat_label: "", zone_no: -1, zone: "", place: clean(x.place, 120),
      taluk: "", dept: String(x.dept ?? ""), sev: "", status: Number(x.is_incident) ? "incident" : "news", open: 0, t: epoch(x.t), dead: num(x.dead, 0),
      source: String(x.publisher ?? ""), url: String(x.url ?? ""), story: String(x.story ?? ""), incident: String(x.incident ?? "")
    };
    return { ...base, thash: sha(`passage: ${text}`), rhash: sha(JSON.stringify(base)) };
  });
}

/** Vectors in the older incident index, by text hash (same model, same passage text). */
function legacyVectors(): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  try {
    const head = JSON.parse(fs.readFileSync(`${LEGACY}.json`, "utf8")) as { model: string; dim: number; hash: string[] };
    if (head.model !== MODEL) return out;
    const buf = fs.readFileSync(`${LEGACY}.bin`);
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    head.hash.forEach((h, i) => out.set(h, v.slice(i * head.dim, (i + 1) * head.dim)));
  } catch { /* no older index */ }
  return out;
}

// --------------------------------------------------------------------- sync --

export interface SyncReport { kind: Kind; total: number; embedded: number; reused: number; rewritten: number; removed: number; ms: number }

/** Questions being answered right now: background embedding waits for them (it shares this machine's CPU). */
let answering = 0;
export function holdSync(): () => void {
  answering++;
  let done = false;
  return () => { if (!done) { done = true; answering--; } };
}
const idle = async () => { for (let i = 0; answering > 0 && i < 600; i++) await new Promise((r) => setTimeout(r, 200)); };

/** Brings one collection up to the store. `maxNew` caps how many texts are embedded in this run (newest first). */
async function syncKind(kind: Kind, o: { batch?: number; maxNew?: number; log?: (m: string) => void }): Promise<SyncReport> {
  const t0 = Date.now();
  const L = await lib();
  const db = await conn();
  const want = (await rows(kind)).sort((a, b) => b.t - a.t);
  const tbl = await table(kind);
  // what the index holds now: hashes, and vectors for records whose text did not change
  const have = new Map<string, { thash: string; rhash: string }>();
  if (tbl) for (const r of await tbl.query().select(["id", "thash", "rhash"]).toArray()) have.set(String(r.id), { thash: String(r.thash), rhash: String(r.rhash) });
  const wantIds = new Set(want.map((r) => r.id));
  const removed = [...have.keys()].filter((id) => !wantIds.has(id));
  const changed = want.filter((r) => have.get(r.id)?.rhash !== r.rhash);
  const textSame = changed.filter((r) => have.get(r.id)?.thash === r.thash).map((r) => r.id);
  const oldVec = new Map<string, number[]>();
  for (let i = 0; tbl && i < textSame.length; i += 500) {
    const part = textSame.slice(i, i + 500);
    for (const r of await tbl.query().where(`id IN (${part.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")})`).select(["id", "vector"]).toArray())
      oldVec.set(String(r.id), Array.from(r.vector as ArrayLike<number>));
  }
  // the same text under a new id (a record renumbered by the uploading PC): its vector, by text hash
  const byText = new Map<string, number[]>();
  const need = [...new Set(changed.filter((r) => !oldVec.has(r.id)).map((r) => r.thash))];
  for (let i = 0; tbl && i < need.length; i += 500)
    for (const r of await tbl.query().where(`thash IN (${need.slice(i, i + 500).map((x) => `'${x}'`).join(",")})`).select(["thash", "vector"]).toArray())
      byText.set(String(r.thash), Array.from(r.vector as ArrayLike<number>));
  const legacy = kind === "incidents" && byText.size < need.length ? legacyVectors() : new Map<string, Float32Array>();
  const out: Rec[] = [];
  const todo: Omit<Rec, "vector">[] = [];
  let reused = 0;
  for (const r of changed) {
    const v = oldVec.get(r.id) ?? byText.get(r.thash) ?? (legacy.get(r.thash) ? Array.from(legacy.get(r.thash)!) : null);
    if (v) { out.push({ ...r, vector: v }); reused++; } else todo.push(r);
  }
  const embedNow = todo.slice(0, o.maxNew ?? Infinity);
  const batch = o.batch ?? 32;
  if (embedNow.length) o.log?.(`${kind}: embedding ${embedNow.length} of ${want.length} (${reused} reused, ${todo.length - embedNow.length} left for later)`);
  for (let k = 0; k < embedNow.length; k += batch) {
    await idle();
    const part = embedNow.slice(k, k + batch);
    const e = await embed(part.map((r) => `passage: ${r.text}`));
    part.forEach((r, j) => out.push({ ...r, vector: Array.from(e.vecs.subarray(j * e.dim, (j + 1) * e.dim)) }));
    if (o.log && (k / batch) % 25 === 0) o.log(`${kind}: ${Math.min(embedNow.length, k + batch)} / ${embedNow.length}`);
  }
  const drop = [...removed, ...out.map((r) => r.id).filter((id) => have.has(id))];
  let t = tbl;
  if (!t) {
    if (!out.length) return { kind, total: 0, embedded: 0, reused: 0, rewritten: 0, removed: 0, ms: Date.now() - t0 };
    t = S.tables[kind] = await db.createTable(kind, out as unknown as Record<string, unknown>[]);
  } else {
    for (let i = 0; i < drop.length; i += 500)
      await t.delete(`id IN (${drop.slice(i, i + 500).map((x) => `'${x.replace(/'/g, "''")}'`).join(",")})`);
    for (let i = 0; i < out.length; i += 2000) await t.add(out.slice(i, i + 2000) as unknown as Record<string, unknown>[]);
  }
  if (out.length || removed.length || !tbl) {
    // keywords: lowercased, accents folded; the simple tokenizer keeps Tamil words whole
    await t.createIndex("text", { config: L.Index.fts({ withPosition: false, lowercase: true, asciiFolding: true, stem: false, removeStopWords: false }), replace: true });
    await t.optimize().catch(() => { /* compaction is best effort */ });
  }
  return { kind, total: want.length, embedded: embedNow.length, reused, rewritten: changed.length, removed: removed.length, ms: Date.now() - t0 };
}

/** Syncs both collections (one run at a time per process). */
export function syncLance(o: { batch?: number; maxNew?: number; log?: (m: string) => void } = {}): Promise<SyncReport[]> {
  const run = async () => [await syncKind("incidents", o), await syncKind("news", o)];
  return (S.syncing ??= run().finally(() => { S.syncing = null; }));
}

// ------------------------------------------------------------------- search --

export interface Filters {
  /** epoch seconds, inclusive */
  since?: number | null;
  until?: number | null;
  zone?: number | null;
  cats?: string[] | null;
  sev?: string[] | null;
  dept?: string | null;
  openOnly?: boolean;
}
export interface Found { kind: Kind; id: string; score: number; sim: number | null; rec: Omit<Rec, "vector" | "thash" | "rhash"> }

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
function where(kind: Kind, f: Filters): string | undefined {
  const w: string[] = [];
  if (f.since != null) w.push(`t >= ${Math.floor(f.since)}`);
  if (f.until != null) w.push(`t <= ${Math.floor(f.until)}`);
  if (f.cats?.length) w.push(`cat IN (${f.cats.map(quote).join(",")})`);
  if (kind === "incidents") {
    if (f.zone != null) w.push(`zone_no = ${Math.floor(f.zone)}`);
    if (f.sev?.length) w.push(`sev IN (${f.sev.map(quote).join(",")})`);
    if (f.dept) w.push(`dept = ${quote(f.dept)}`);
    if (f.openOnly) w.push("open = 1");
  }
  return w.length ? w.join(" AND ") : undefined;
}

/**
 * The records closest to `query` by meaning and by keywords, fused by rank. `sim` is the cosine similarity (1 is
 * identical) when the record came up in the meaning search. Null while the collection has not been built.
 */
export async function hybridSearch(kind: Kind, query: string, f: Filters = {}, k = 10): Promise<Found[] | null> {
  const tbl = await table(kind);
  if (!tbl) return null;
  const L = await lib();
  const w = where(kind, f);
  const pool = Math.max(k * 4, 40);
  const qv = Array.from((await embed([`query: ${query.slice(0, 300)}`])).vecs);
  const cols = ["id", "text", "title", "cat", "cat_label", "zone_no", "zone", "place", "taluk", "dept", "sev", "status", "open", "t", "dead", "source", "url", "story", "incident"];
  let vq = tbl.vectorSearch(qv).distanceType("cosine").limit(pool).select([...cols, "_distance"]);
  if (w) vq = vq.where(w);
  const words = query.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const [vec, fts] = await Promise.all([
    vq.toArray(),
    words
      ? (() => {
          let fq = tbl.query().fullTextSearch(new L.MatchQuery(words, "text", { fuzziness: 1, operator: L.Operator.Or })).limit(pool).select(cols);
          if (w) fq = fq.where(w);
          return fq.toArray().catch(() => [] as Record<string, unknown>[]);
        })()
      : Promise.resolve([] as Record<string, unknown>[])
  ]);
  // reciprocal-rank fusion: a record high in either list ranks high; in both, higher still
  const K = 60;
  const by = new Map<string, Found>();
  const add = (r: Record<string, unknown>, rank: number, sim: number | null) => {
    const id = String(r.id);
    const cur = by.get(id);
    const rec = Object.fromEntries(cols.map((c) => [c, r[c]])) as unknown as Found["rec"];
    if (cur) { cur.score += 1 / (K + rank); if (sim != null) cur.sim = sim; } else by.set(id, { kind, id, score: 1 / (K + rank), sim, rec });
  };
  vec.forEach((r, i) => add(r, i + 1, 1 - Number(r._distance)));
  fts.forEach((r, i) => add(r, i + 1, null));
  return [...by.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * The store's current id for each found incident. The uploading PC can renumber incidents between builds (the index then
 * holds the old id until its next sync): an id the store no longer has is matched by the same title and report time.
 */
export async function currentIncidentIds(found: Found[]): Promise<string[]> {
  if (!found.length) return [];
  const ids = found.map((f) => f.id);
  const [have] = await intelPool.query<RowDataPacket[]>("SELECT incident_id AS id FROM incidents WHERE incident_id IN (?)", [ids]);
  const ok = new Set(have.map((r) => String(r.id)));
  const out: string[] = [];
  for (const f of found) {
    if (ok.has(f.id)) { out.push(f.id); continue; }
    const at = new Date((Number(f.rec.t) + 5.5 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");
    const [m] = await intelPool.query<RowDataPacket[]>(
      "SELECT incident_id AS id FROM incidents WHERE title = ? AND first_reported_at = ? LIMIT 1", [f.rec.title, at]);
    if (m[0]) out.push(String(m[0].id));
  }
  return [...new Set(out)];
}

/**
 * On the web server: keeps the index in step with the store. When the store's data changes (a new build, an upload from
 * the team's PC), the index is synced in the background, at most `maxNew` new texts embedded per run (renumbered records
 * reuse their vectors, so a run is mostly seconds). Never blocks the caller. Returns whether the index exists.
 */
let syncedFor: string | null = null;
export function lanceWarm(asOf: string): void {
  if (syncedFor === asOf || S.syncing) return;
  syncedFor = asOf;
  void table("incidents").then((t) => {
    if (!t) return; // not built yet: `npm run lance:build` makes it (a first build is too long for the web server)
    return syncLance({ batch: 8, maxNew: 300, log: (m) => console.info(`[assistant] search index: ${m}`) })
      .then((r) => console.info(`[assistant] search index synced: ${r.map((x) => `${x.kind} ${x.rewritten} updated, ${x.embedded} embedded, ${x.removed} removed`).join("; ")}`));
  }).catch((e) => { syncedFor = null; console.warn(`[assistant] search index sync failed: ${(e as Error).message}`); });
}

/** Whether the search index has been built (the older in-memory index is then not needed). */
export async function lanceReady(): Promise<boolean> {
  return !!(await table("incidents").catch(() => null));
}

export async function lanceStatus() {
  const out: Record<string, number | null> = {};
  for (const k of ["incidents", "news"] as Kind[]) {
    const t = await table(k).catch(() => null);
    out[k] = t ? await t.countRows() : null;
  }
  return { dir: DIR, ...out, syncing: !!S.syncing };
}
