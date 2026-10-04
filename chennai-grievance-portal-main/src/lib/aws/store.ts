/**
 * The dashboard's data store when DATA_BACKEND=aws: no MySQL server. The curated district_intel build lives in S3
 * (the PC's scheduled job uploads it with aws/export_intel.py); this module downloads it through the team API
 * (POST /intel/snapshot -> presigned links), loads it into an in-memory SQLite database (node:sqlite, built into
 * Node 22) and answers the dashboard's existing MySQL queries through the dialect adapter (dialect.ts).
 *
 * - The website holds no AWS keys: only the API key (REFRESH_API_KEY in .env), like the PC.
 * - Tables are cached on disk by sha256 (data/aws-cache/), so a restart downloads only what changed.
 * - Every CHECK_MS a query triggers a background check for a newer build; a new build is loaded into a fresh
 *   database and swapped in whole, so a page never sees half of one build and half of another.
 * - The interface is the slice of mysql2's Pool the code uses: query / execute / getConnection.
 *
 * The website's own data (complaints, users, Collector and officer work, assistant chats ...) is the durable store:
 * DynamoDB holds it, and POST /store/load hands it over (with the read-only reference tables: streets, wards ...)
 * when the server starts. It is kept in a SQLite file (data/aws-cache/durable.sqlite) attached to every build, so
 * the same queries read and write it. Triggers note each changed row in _changes; after every write (or COMMIT) the
 * changed rows go to POST /store/write before the query returns. A failed send stays in _changes and is retried.
 * Only the PC with AWS_STORE_SAVE=1 sends; any other copy reloads the store every few minutes and keeps its own changes.
 * Writes run one at a time (a transaction holds the write lock until COMMIT / ROLLBACK), like a single MySQL writer.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { DatabaseSync as DB } from "node:sqlite";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

// node:sqlite is loaded at run time, and only when this store is used: Next.js 14's bundler does not know the
// node:sqlite scheme (and rewrites createRequire), and the MySQL backend never needs it
const sqlite = () =>
  (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

const API_URL = (process.env.AWS_API_URL || "https://i6q6oi20lb.execute-api.ap-south-1.amazonaws.com").replace(/\/$/, "");
const CACHE_DIR = path.join(process.cwd(), "data", "aws-cache");
const CHECK_MS = 5 * 60_000;

type Kind = "text" | "int" | "bool" | "float" | "date" | "datetime";
interface TableInfo { sha: string; rows: number; bytes: number; key: string; url: string }
interface Manifest {
  build_id: string;
  built_at: string;
  exported_at: string;
  tables: Record<string, TableInfo>;
  meta: Record<string, string>;
  views: Record<string, string>;
  keys: Record<string, string[]>;
  indexes: Record<string, string[]>;
}
interface Snapshot { table: string; columns: [string, Kind][]; rows: unknown[][] }

interface State { db: DB; buildId: string; builtAt: string; loadedAt: number; checkedAt: number; durableFile: string }
interface Durable { conn: DB; keys: Record<string, string[]>; file: string; loadedAt: number }

/** One holder at a time; acquire() resolves to the release function. */
class Lock {
  private tail: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const before = this.tail;
    this.tail = before.then(() => held);
    return before.then(() => release);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __awsStore: {
    state: State | null; loading: Promise<State> | null; checking: boolean;
    durable: Durable | null; durableLoading: Promise<Durable> | null; lock: Lock; flushing: Promise<void>;
    reloading?: boolean; reference?: { id: string; doc: Doc };
  } | undefined;
}
const g = (global.__awsStore ??= {
  state: null, loading: null, checking: false, durable: null, durableLoading: null, lock: new Lock(), flushing: Promise.resolve()
});
const DB_NAMES = () => [
  process.env.INTEL_DB_NAME || "district_intel", process.env.INTEL_OPS_DB_NAME || "district_intel_ops", process.env.DB_NAME || "district_collector_dashboard"
];

function apiKey(): string {
  const k = (process.env.REFRESH_API_KEY || "").trim();
  if (!k) throw new Error("REFRESH_API_KEY is not set: the AWS data store needs the team API key in .env");
  return k;
}

async function manifest(): Promise<Manifest> {
  const r = await fetch(`${API_URL}/intel/snapshot`, {
    method: "POST", headers: { "x-refresh-key": apiKey(), "content-type": "application/json" }, body: "{}", cache: "no-store"
  });
  if (!r.ok) throw new Error(`AWS snapshot: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Manifest;
}

async function table(name: string, t: TableInfo): Promise<Snapshot> {
  const file = path.join(CACHE_DIR, `${name}-${t.sha}.json.gz`);
  let gz: Buffer;
  if (fs.existsSync(file)) gz = fs.readFileSync(file);
  else {
    const r = await fetch(t.url, { cache: "no-store" });
    if (!r.ok) throw new Error(`AWS table ${name}: HTTP ${r.status}`);
    gz = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, gz);
    for (const old of fs.readdirSync(CACHE_DIR)) // keep only the current version of each table
      if (old.startsWith(`${name}-`) && old !== path.basename(file) && /^[a-z0-9_]+-[0-9a-f]{64}\.json\.gz$/.test(old))
        fs.rmSync(path.join(CACHE_DIR, old), { force: true });
  }
  return JSON.parse(zlib.gunzipSync(gz).toString("utf8")) as Snapshot;
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const SQL_TYPE: Record<Kind, string> = { text: "TEXT COLLATE NOCASE", int: "INTEGER", bool: "INTEGER", float: "REAL", date: "TEXT", datetime: "TEXT" };

/**
 * Columns and tables that newer pipeline code writes (AI notes, location precision, news labelling) and the website
 * reads. A build uploaded by a PC on older pipeline code lacks them: they are added empty, so the pages show no AI
 * note instead of failing. Once the uploading PC runs the newer pipeline, the build carries them and nothing is added.
 */
const COMPAT: Record<string, [string, Kind][]> = {
  incidents: [["loc_precision_m", "float"], ["ai_summary", "text"], ["ai_summary_ta", "text"], ["ai_attention", "text"],
    ["ai_next_step", "text"], ["ai_model", "text"]],
  briefings: [["ai_summary", "text"], ["ai_summary_ta", "text"]],
  documents: [["category_suggestion", "text"], ["category_method", "text"], ["incident_method", "text"], ["places", "text"],
    ["geo_conf", "float"], ["dept_src", "text"], ["language", "text"], ["is_complaint", "bool"]]
};
const COMPAT_TABLES: Record<string, [string, Kind][]> = {
  briefing_notes: [["section", "text"], ["item_key", "text"], ["text_en", "text"], ["text_ta", "text"], ["extra", "text"],
    ["model", "text"], ["written_at", "datetime"], ["written_for", "text"], ["as_of", "datetime"]]
};

function compat(db: DB, snaps: { table: string; columns: [string, Kind][] }[]): void {
  const have = new Map(snaps.map((s) => [s.table, new Set(s.columns.map(([c]) => c))]));
  for (const [t, cols] of Object.entries(COMPAT)) {
    const got = have.get(t);
    if (!got) continue;
    for (const [c, k] of cols) if (!got.has(c)) db.exec(`ALTER TABLE ${q(t)} ADD COLUMN ${q(c)} ${SQL_TYPE[k]}`);
  }
  for (const [t, cols] of Object.entries(COMPAT_TABLES))
    if (!have.has(t)) db.exec(`CREATE TABLE ${q(t)} (${cols.map(([c, k]) => `${q(c)} ${SQL_TYPE[k]}`).join(", ")})`);
}

/** A fresh in-memory database holding one complete build. */
async function build(m: Manifest): Promise<State> {
  setDatabaseNames(DB_NAMES());
  const durableFile = (await durable()).file;
  const db = new (sqlite().DatabaseSync)(":memory:");
  registerFunctions(db);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("ATTACH DATABASE ? AS durable").run(durableFile);
  const names = Object.keys(m.tables);
  const snaps = await Promise.all(names.map((n) => table(n, m.tables[n])));
  db.exec("BEGIN");
  for (const s of snaps) {
    const pk = m.keys[s.table];
    const cols = s.columns.map(([c, k]) => `${q(c)} ${SQL_TYPE[k] ?? "TEXT"}`);
    if (pk?.length) cols.push(`PRIMARY KEY (${pk.map(q).join(", ")})`);
    // WITHOUT ROWID stores rows in key order, so a query without ORDER BY returns them as InnoDB does
    db.exec(`CREATE TABLE ${q(s.table)} (${cols.join(", ")})${pk?.length ? " WITHOUT ROWID" : ""}`);
    if (s.rows.length) {
      const ins = db.prepare(`INSERT INTO ${q(s.table)} VALUES (${s.columns.map(() => "?").join(", ")})`);
      for (const r of s.rows) ins.run(...(r as any[]));
    }
    for (const c of m.indexes[s.table] ?? [])
      if (s.columns.some(([n]) => n === c)) db.exec(`CREATE INDEX ${q(`ix_${s.table}_${c}`)} ON ${q(s.table)} (${q(c)})`);
  }
  compat(db, snaps);
  db.exec("CREATE TABLE _export_meta (k TEXT PRIMARY KEY, v TEXT)");
  const meta = db.prepare("INSERT INTO _export_meta VALUES (?, ?)");
  for (const [k, v] of Object.entries({ ...m.meta, build_id: m.build_id, store: "aws" })) meta.run(k, String(v));
  for (const [v, sql] of Object.entries(m.views)) db.exec(`CREATE VIEW ${q(v)} AS ${translate(sql)}`);
  db.exec("COMMIT");
  db.exec("ANALYZE");
  catalog(db);
  return { db, buildId: m.build_id, builtAt: m.built_at, loadedAt: Date.now(), checkedAt: Date.now(), durableFile };
}

/** Points a build at another durable file (after a reload). Call with the write lock held: no transaction is open. */
function attach(s: State, file: string): void {
  if (s.durableFile === file) return;
  s.db.exec("DETACH DATABASE durable");
  s.db.prepare("ATTACH DATABASE ? AS durable").run(file);
  s.durableFile = file;
  catalog(s.db);
}

/**
 * information_schema.tables and .columns, which the code reads to see whether optional tables exist. All three MySQL
 * databases live in this one store (the build and the attached durable file), so every table is listed under each
 * name. Rebuilt after any CREATE / DROP.
 */
function catalog(db: DB): void {
  const schemas = DB_NAMES();
  if (!db.prepare("SELECT 1 FROM pragma_database_list WHERE name = 'information_schema'").get())
    db.exec("ATTACH DATABASE ':memory:' AS information_schema");
  db.exec(`DROP TABLE IF EXISTS information_schema.tables; DROP TABLE IF EXISTS information_schema.columns;
           CREATE TABLE information_schema.tables (table_schema TEXT COLLATE NOCASE, table_name TEXT COLLATE NOCASE, table_type TEXT, table_rows INTEGER);
           CREATE TABLE information_schema.columns (table_schema TEXT COLLATE NOCASE, table_name TEXT COLLATE NOCASE, column_name TEXT COLLATE NOCASE, ordinal_position INTEGER, data_type TEXT);`);
  const objs = db.prepare(`SELECT name, type, 'main' AS db FROM main.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
                           UNION ALL SELECT name, type, 'durable' FROM durable.sqlite_master
                           WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name <> '_changes'`)
    .all() as { name: string; type: string; db: string }[];
  const t = db.prepare("INSERT INTO information_schema.tables VALUES (?, ?, ?, NULL)");
  const c = db.prepare("INSERT INTO information_schema.columns VALUES (?, ?, ?, ?, ?)");
  for (const o of objs) {
    const cols = db.prepare(`SELECT name, type, cid FROM pragma_table_info(?, ?)`).all(o.name, o.db) as { name: string; type: string; cid: number }[];
    for (const s of schemas) {
      t.run(s, o.name, o.type === "view" ? "VIEW" : "BASE TABLE");
      for (const col of cols) c.run(s, o.name, col.name, col.cid + 1, (col.type || "text").split(" ")[0].toLowerCase());
    }
  }
}

// ------------------------------------------------------------ durable store --

// a second process on the same PC (e.g. `npm run lance:build`, which only reads the build) sets AWS_DURABLE_FILE to a
// file of its own: Windows does not let it replace the durable file the running website holds open
const DURABLE_FILE = process.env.AWS_DURABLE_FILE || path.join(CACHE_DIR, "durable.sqlite");
const BATCH = 400;          // changed rows per POST /store/write
const RETRY_MS = 60_000;    // a failed send is retried this often (and after the next write)
// Only the one PC whose .env says AWS_STORE_SAVE=1 sends changes to AWS. Every other copy (a teammate's clone, a test
// server) keeps them in its own durable.sqlite until it restarts: two saving copies would give new rows the same ids
// and overwrite each other's rows in DynamoDB. AWS_STORE_DRY_RUN=1 turns saving off even with AWS_STORE_SAVE=1.
const DRY_RUN = process.env.AWS_STORE_SAVE !== "1" || process.env.AWS_STORE_DRY_RUN === "1";
// Such a copy loads the durable store again this often while it is used (AWS_STORE_RELOAD_MINUTES), so it shows what
// the saving PC saved, and keeps its own changes over each reload ...
const RELOAD_MS = Math.max(1, Number(process.env.AWS_STORE_RELOAD_MINUTES) || 5) * 60_000;
// ... numbering its own new rows from here, so they never take the id of a row the saving PC adds later
const LOCAL_IDS = 1_000_000_000;

type Doc = { schema: Record<string, { ddl: string[]; key: string[] }>; rows: Record<string, Record<string, unknown>[]> };

async function api(route: string, body: unknown): Promise<any> {
  const r = await fetch(`${API_URL}${route}`, {
    method: "POST", headers: { "x-refresh-key": apiKey(), "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store"
  });
  if (!r.ok) throw new Error(`AWS ${route}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function gzJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`AWS download: HTTP ${r.status}`);
  return JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8")) as T;
}

// Row values as DynamoDB keeps them (aws/migrate_mysql.py): binary as {"$b64": ...}, everything else as JSON
const toSql = (v: unknown) =>
  v && typeof v === "object" && "$b64" in v ? new Uint8Array(Buffer.from(String((v as { $b64: string }).$b64), "base64"))
    : typeof v === "boolean" ? Number(v) : v === undefined ? null : v;
const fromSql = (v: unknown) =>
  v instanceof Uint8Array ? { $b64: Buffer.from(v).toString("base64") } : typeof v === "bigint" ? Number(v) : v;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
// The DynamoDB sort key: the key columns as a compact JSON array, as the migration wrote it
const keyJson = (row: "NEW" | "OLD", key: string[]) => `json_array(${key.map((k) => `${row}.${k === "rowid" ? "rowid" : q(k)}`).join(", ")})`;

/** Creates the tables of `doc` with their rows; `track` adds the triggers that note every change in _changes. */
function fill(db: DB, doc: Doc, track: boolean): void {
  const inserts = new Map<string, ReturnType<DB["prepare"]>>();
  for (const [t, s] of Object.entries(doc.schema)) {
    for (const ddl of s.ddl) db.exec(ddl);
    for (const row of doc.rows[t] ?? []) {
      const cols = Object.keys(row);
      const sig = `${t}\u0000${cols.join("\u0000")}`;
      if (!inserts.has(sig)) inserts.set(sig, db.prepare(`INSERT INTO ${q(t)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`));
      inserts.get(sig)!.run(...(cols.map((c) => toSql(row[c])) as any[]));
    }
    if (!track) continue;
    const name = (op: string) => q(`_changes_${t}_${op}`);
    db.exec(`CREATE TRIGGER ${name("ins")} AFTER INSERT ON ${q(t)} BEGIN
               INSERT INTO _changes (t, k) VALUES (${lit(t)}, ${keyJson("NEW", s.key)}); END;
             CREATE TRIGGER ${name("upd")} AFTER UPDATE ON ${q(t)} BEGIN
               INSERT INTO _changes (t, k) VALUES (${lit(t)}, ${keyJson("OLD", s.key)}), (${lit(t)}, ${keyJson("NEW", s.key)}); END;
             CREATE TRIGGER ${name("del")} AFTER DELETE ON ${q(t)} BEGIN
               INSERT INTO _changes (t, k) VALUES (${lit(t)}, ${keyJson("OLD", s.key)}); END;`);
  }
}

/** Sends the noted changes to DynamoDB: each changed key as its current row, or as a delete when the row is gone. */
async function send(d: Pick<Durable, "conn" | "keys">): Promise<void> {
  for (;;) {
    const changes = d.conn.prepare("SELECT id, t, k FROM _changes ORDER BY id LIMIT ?").all(BATCH) as { id: number; t: string; k: string }[];
    if (!changes.length) return;
    const unique = new Map(changes.map((c) => [`${c.t}\u0000${c.k}`, c]));
    const put: { t: string; k: string; row: Record<string, unknown> }[] = [], del: { t: string; k: string }[] = [];
    for (const { t, k } of unique.values()) {
      const key = d.keys[t];
      if (!key) continue;
      const where = key.map((c) => (c === "rowid" ? "rowid IS ?" : `${q(c)} IS ?`)).join(" AND ");
      const row = d.conn.prepare(`SELECT ${key.includes("rowid") ? "rowid AS rowid, " : ""}* FROM ${q(t)} WHERE ${where}`)
        .get(...(JSON.parse(k) as any[])) as Record<string, unknown> | undefined;
      if (row) put.push({ t, k, row: Object.fromEntries(Object.entries(row).map(([c, v]) => [c, fromSql(v)])) });
      else del.push({ t, k });
    }
    if (!DRY_RUN) await api("/store/write", { gz: zlib.gzipSync(JSON.stringify({ put, del })).toString("base64") });
    const release = await g.lock.acquire();
    try {
      d.conn.prepare("DELETE FROM _changes WHERE id <= ?").run(changes[changes.length - 1].id);
    } finally {
      release();
    }
  }
}

/** Sends whatever is waiting, one send at a time. Never throws: a failure stays in _changes for the retry. */
function flush(): Promise<void> {
  if (DRY_RUN) return g.flushing; // a copy that does not save keeps its changes noted, to carry them over each reload
  g.flushing = g.flushing
    .then(() => (g.durable ? send(g.durable) : undefined))
    .catch((e) => console.warn(`[aws-store] saving to AWS failed, will retry: ${e.message}`));
  return g.flushing;
}

/** The reference tables do not change between loads: a copy that reloads keeps them in memory. */
async function reference(url: string): Promise<Doc> {
  const id = new URL(url).pathname;
  if (g.reference?.id === id) return g.reference.doc;
  const doc = await gzJson<Doc>(url);
  if (DRY_RUN) g.reference = { id, doc };
  return doc;
}

type Loaded = Durable & { tables: number; rows: number; refTables: number };

/** A new durable file from AWS: every durable row (POST /store/load) and the read-only reference tables. */
async function fetchDurable(file: string): Promise<Loaded> {
  const m = await api("/store/load", {});
  const [rows, ref] = await Promise.all([gzJson<Doc>(m.rows), m.reference ? reference(m.reference) : null]);
  for (const f of ["", "-wal", "-shm", "-journal"]) fs.rmSync(file + f, { force: true });
  const conn = new (sqlite().DatabaseSync)(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
  conn.exec("BEGIN");
  conn.exec("CREATE TABLE _changes (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, k TEXT NOT NULL)");
  conn.exec("CREATE TABLE _keys (t TEXT PRIMARY KEY, key TEXT NOT NULL)");
  if (ref) fill(conn, ref, false);
  fill(conn, rows, true);
  const keys = Object.fromEntries(Object.entries(rows.schema).map(([t, s]) => [t, s.key]));
  const k = conn.prepare("INSERT INTO _keys VALUES (?, ?)");
  for (const [t, key] of Object.entries(keys)) k.run(t, JSON.stringify(key));
  if (DRY_RUN)
    conn.exec(`UPDATE sqlite_sequence SET seq = ${LOCAL_IDS} WHERE seq < ${LOCAL_IDS} AND name <> '_changes';
               INSERT INTO sqlite_sequence (name, seq) SELECT name, ${LOCAL_IDS} FROM sqlite_master
               WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%' AND name <> '_changes' AND name NOT IN (SELECT name FROM sqlite_sequence);`);
  conn.exec("COMMIT");
  return { conn, keys, file, loadedAt: Date.now(), tables: m.tables, rows: m.row_count, refTables: ref ? Object.keys(ref.schema).length : 0 };
}

/** Copies this copy's own changes (noted in _changes) into a newly loaded store. Returns how many it kept. */
function overlay(from: Durable, to: Durable): number {
  const changed = from.conn.prepare("SELECT DISTINCT t, k FROM _changes").all() as { t: string; k: string }[];
  let kept = 0;
  to.conn.exec("BEGIN");
  try {
    for (const { t, k } of changed) {
      const key = from.keys[t];
      if (!key || !to.keys[t]) continue;
      const vals = JSON.parse(k) as any[];
      const where = key.map((c) => (c === "rowid" ? "rowid IS ?" : `${q(c)} IS ?`)).join(" AND ");
      const row = from.conn.prepare(`SELECT ${key.includes("rowid") ? "rowid AS rowid, " : ""}* FROM ${q(t)} WHERE ${where}`)
        .get(...vals) as Record<string, unknown> | undefined;
      to.conn.exec("SAVEPOINT kept");
      try {
        to.conn.prepare(`DELETE FROM ${q(t)} WHERE ${where}`).run(...vals);
        if (row) {
          const cols = Object.keys(row);
          to.conn.prepare(`INSERT INTO ${q(t)} (${cols.map((c) => (c === "rowid" ? "rowid" : q(c))).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
            .run(...(cols.map((c) => row[c]) as any[]));
        }
        to.conn.exec("RELEASE kept");
        kept++;
      } catch {
        to.conn.exec("ROLLBACK TO kept; RELEASE kept"); // clashes with a row saved meanwhile (a unique value): that row wins
      }
    }
    to.conn.exec("COMMIT");
  } catch (e) {
    to.conn.exec("ROLLBACK");
    throw e;
  }
  return kept;
}

/** Deletes durable files nothing uses any more; one still open (by a build about to close) goes at the next sweep. */
function sweep(keep: string): void {
  for (const f of fs.readdirSync(CACHE_DIR))
    if (/^durable(-\d+)?\.sqlite(-wal|-shm|-journal)?$/.test(f) && !f.startsWith(path.basename(keep)))
      try { fs.rmSync(path.join(CACHE_DIR, f), { force: true }); } catch { /* still open */ }
}

/** A copy that does not save: loads the durable store again, into a new file, and swaps it in with its own changes. */
async function reloadDurable(): Promise<void> {
  const fresh = await fetchDurable(path.join(CACHE_DIR, `durable-${Date.now()}.sqlite`));
  const release = await g.lock.acquire(); // no transaction is open while the files are swapped
  const old = g.durable;
  let kept = 0;
  try {
    if (old) kept = overlay(old, fresh);
    if (g.state) attach(g.state, fresh.file);
    g.durable = fresh;
  } catch (e) {
    fresh.conn.close();
    throw e;
  } finally {
    release();
  }
  try { old?.conn.close(); } catch { /* already closed */ }
  sweep(fresh.file);
  console.log(`[aws-store] complaints and accounts reloaded from AWS: ${fresh.rows} rows${kept ? `, ${kept} local changes kept` : ""}`);
}

/**
 * The durable store, loaded from AWS at server start (and again every RELOAD_MS by a copy that does not save).
 * Changes a previous run could not send (a file left by a crash or a network outage) are sent first, so the fresh
 * copy includes them.
 */
async function durable(): Promise<Durable> {
  if (g.durable) {
    g.durable.file ??= DURABLE_FILE; // loaded by an older version of this module (dev hot reload)
    g.durable.loadedAt ??= Date.now();
    return g.durable;
  }
  g.durableLoading ??= (async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(DURABLE_FILE)) {
      const old = new (sqlite().DatabaseSync)(DURABLE_FILE);
      try {
        const keys = Object.fromEntries((old.prepare("SELECT t, key FROM _keys").all() as { t: string; key: string }[]).map((r) => [r.t, JSON.parse(r.key)]));
        await send({ conn: old, keys });
      } catch (e: any) {
        console.warn(`[aws-store] could not send the previous run's unsaved changes: ${e.message}`);
      } finally {
        old.close();
      }
    }
    const d = await fetchDurable(DURABLE_FILE);
    g.durable = d;
    sweep(d.file);
    setInterval(() => void flush(), RETRY_MS).unref();
    console.log(`[aws-store] durable store loaded: ${d.tables} tables, ${d.rows} rows${d.refTables ? ` + ${d.refTables} reference tables` : ""}${DRY_RUN
      ? ` (local only: changes are not saved to AWS, and the data is reloaded from AWS every ${RELOAD_MS / 60_000} min; the one PC that saves has AWS_STORE_SAVE=1)`
      : ", saving changes to AWS"}`);
    return d;
  })().finally(() => { g.durableLoading = null; });
  return g.durableLoading;
}

/** The current database: loads the first build (once), and checks for a newer one in the background. */
async function current(): Promise<State> {
  if (!g.state) {
    g.loading ??= manifest().then(build).then((s) => { g.state = s; return s; }).finally(() => { g.loading = null; });
    return g.loading;
  }
  if (DRY_RUN && g.durable && Date.now() - (g.durable.loadedAt ?? 0) > RELOAD_MS && !g.reloading) {
    g.reloading = true;
    reloadDurable()
      .catch((e) => console.warn(`[aws-store] reload from AWS failed, keeping the loaded data: ${e.message}`))
      .finally(() => { g.reloading = false; if (g.durable) g.durable.loadedAt = Date.now(); });
  }
  if (Date.now() - g.state.checkedAt > CHECK_MS && !g.checking) {
    g.checking = true;
    g.state.checkedAt = Date.now();
    manifest()
      .then(async (m) => {
        if (m.build_id === g.state?.buildId) return;
        const fresh = await build(m);
        const release = await g.lock.acquire();
        const old = g.state;
        try {
          if (g.durable) attach(fresh, g.durable.file); // a reload may have swapped the durable file meanwhile
          g.state = fresh; // swapped whole
        } finally {
          release();
        }
        console.log(`[aws-store] build ${fresh.buildId} loaded (was ${old?.buildId})`);
        setTimeout(() => { try { old?.db.close(); } catch { /* already closed */ } }, 60_000);
      })
      .catch((e) => console.warn(`[aws-store] refresh check failed, keeping build ${g.state?.buildId}: ${e.message}`))
      .finally(() => { g.checking = false; });
  }
  return g.state;
}

/** Which build the store holds (for health pages). */
export async function storeInfo() {
  const s = await current();
  return { buildId: s.buildId, builtAt: s.builtAt, loadedAt: new Date(s.loadedAt).toISOString() };
}

// ---------------------------------------------------------- mysql2 facade --

const READ = /^\s*(\(|SELECT\b|WITH\b|SHOW\b|EXPLAIN\b|PRAGMA\b|VALUES\b)/i;
const NOOP = /^\s*(SET\s+(SESSION|@@|NAMES|TIME_ZONE)|START\s+TRANSACTION\s+READ\s+ONLY|USE\s)/i;

function run(db: DB, sql: string | { sql: string; values?: unknown[] }, params?: unknown[]): [any, any] {
  const text = typeof sql === "string" ? sql : sql.sql;
  const values = (typeof sql === "string" ? params : sql.values ?? params) ?? [];
  if (NOOP.test(text)) return [{ affectedRows: 0, insertId: 0, changedRows: 0 }, undefined];
  const [expanded, flat] = expand(text, values as unknown[]);
  const sqlite = translate(expanded);
  try {
    const st = db.prepare(sqlite);
    if (READ.test(expanded)) {
      const rows = (st.all(...(flat as any[])) as Record<string, unknown>[]).map((r) => ({ ...r }));
      // StatementSync.columns() arrived after Node 22.14; the first row's keys give the same names
      const fields = Object.keys(rows[0] ?? {}).map((name) => ({ name }));
      return [rows, fields];
    }
    const r = st.run(...(flat as any[]));
    if (/^\s*(CREATE|DROP|ALTER)\s/i.test(expanded)) catalog(db);
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid), changedRows: Number(r.changes) }, undefined];
  } catch (e: any) {
    const err = new Error(`${e.message}\n  in SQLite: ${sqlite.slice(0, 600)}`) as Error & { code?: string; sqlMessage?: string };
    err.code = /UNIQUE/.test(e.message) ? "ER_DUP_ENTRY" : /no such table/.test(e.message) ? "ER_NO_SUCH_TABLE" : "SQLITE_ERROR";
    err.sqlMessage = e.message;
    throw err;
  }
}

const OK = [{ affectedRows: 0, insertId: 0, changedRows: 0 }, undefined];
const BEGIN = /^\s*(START\s+TRANSACTION|BEGIN)\s*;?\s*$/i;
const END = /^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i;

/**
 * mysql2's connection over the store. A transaction holds the write lock from BEGIN to COMMIT / ROLLBACK; a write
 * outside one takes the lock for that statement. Either way the changed rows are sent to AWS before it returns.
 */
function connection(db: () => Promise<DB>) {
  let unlock: (() => void) | null = null; // set while this connection's transaction is open
  const begin = async () => {
    if (unlock) return;
    unlock = await g.lock.acquire();
    try {
      (await db()).exec("BEGIN");
    } catch (e) {
      unlock();
      unlock = null;
      throw e;
    }
  };
  const end = async (how: "COMMIT" | "ROLLBACK") => {
    if (!unlock) return;
    try {
      (await db()).exec(how);
    } catch (e) {
      if (how === "ROLLBACK") return; // nothing left open
      try { (await db()).exec("ROLLBACK"); } catch { /* already closed */ }
      throw e;
    } finally {
      unlock?.();
      unlock = null;
    }
    if (how === "COMMIT") await flush();
  };
  const exec = async (sql: any, params?: unknown[]) => {
    const text: string = typeof sql === "string" ? sql : sql.sql;
    if (BEGIN.test(text)) return (await begin(), OK);
    const m = END.exec(text);
    if (m) return (await end(m[1].toUpperCase() as "COMMIT" | "ROLLBACK"), OK);
    if (unlock || READ.test(text) || NOOP.test(text)) return run(await db(), sql, params);
    const release = await g.lock.acquire();
    let out;
    try {
      out = run(await db(), sql, params);
    } finally {
      release();
    }
    await flush();
    return out;
  };
  return {
    query: exec,
    execute: exec,
    beginTransaction: begin,
    commit: () => end("COMMIT"),
    rollback: () => end("ROLLBACK"),
    release: () => { if (unlock) void end("ROLLBACK"); }, // a connection given back mid-transaction is rolled back, as in mysql2
    end: async () => undefined
  };
}

/** A stand-in for a mysql2 Pool over the AWS-backed store (the build plus the durable store). */
export function awsPool(): any {
  const db = async () => (await current()).db;
  return {
    ...connection(db),
    // a connection stays on the build it started with, so a transaction never spans two builds
    getConnection: async () => { const d = await db(); return connection(async () => d); },
    end: async () => undefined
  };
}
