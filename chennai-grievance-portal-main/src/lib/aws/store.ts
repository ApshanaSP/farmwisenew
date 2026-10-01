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
 */
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import zlib from "zlib";
import type { DatabaseSync as DB } from "node:sqlite";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

// node:sqlite is loaded at run time, and only when this store is used: Next.js 14's bundler does not know the
// node:sqlite scheme, and the MySQL backend never needs it
const sqlite = () => createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as typeof import("node:sqlite");

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

interface State { db: DB; buildId: string; builtAt: string; loadedAt: number; checkedAt: number }

declare global {
  // eslint-disable-next-line no-var
  var __awsStore: { state: State | null; loading: Promise<State> | null; checking: boolean } | undefined;
}
const g = (global.__awsStore ??= { state: null, loading: null, checking: false });

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

/** A fresh in-memory database holding one complete build. */
async function build(m: Manifest): Promise<State> {
  setDatabaseNames([process.env.INTEL_DB_NAME || "district_intel", process.env.INTEL_OPS_DB_NAME || "district_intel_ops"]);
  const db = new (sqlite().DatabaseSync)(":memory:");
  registerFunctions(db);
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
  db.exec("CREATE TABLE _export_meta (k TEXT PRIMARY KEY, v TEXT)");
  const meta = db.prepare("INSERT INTO _export_meta VALUES (?, ?)");
  for (const [k, v] of Object.entries({ ...m.meta, build_id: m.build_id, store: "aws" })) meta.run(k, String(v));
  for (const [v, sql] of Object.entries(m.views)) db.exec(`CREATE VIEW ${q(v)} AS ${translate(sql)}`);
  db.exec("COMMIT");
  db.exec("ANALYZE");
  catalog(db);
  return { db, buildId: m.build_id, builtAt: m.built_at, loadedAt: Date.now(), checkedAt: Date.now() };
}

/**
 * information_schema.tables and .columns, which the code reads to see whether optional tables exist. Both MySQL
 * databases live in this one store, so every table is listed under both names. Rebuilt after any CREATE / DROP.
 */
function catalog(db: DB): void {
  const schemas = [process.env.INTEL_DB_NAME || "district_intel", process.env.INTEL_OPS_DB_NAME || "district_intel_ops"];
  if (!db.prepare("SELECT 1 FROM pragma_database_list WHERE name = 'information_schema'").get())
    db.exec("ATTACH DATABASE ':memory:' AS information_schema");
  db.exec(`DROP TABLE IF EXISTS information_schema.tables; DROP TABLE IF EXISTS information_schema.columns;
           CREATE TABLE information_schema.tables (table_schema TEXT COLLATE NOCASE, table_name TEXT COLLATE NOCASE, table_type TEXT, table_rows INTEGER);
           CREATE TABLE information_schema.columns (table_schema TEXT COLLATE NOCASE, table_name TEXT COLLATE NOCASE, column_name TEXT COLLATE NOCASE, ordinal_position INTEGER, data_type TEXT);`);
  const objs = db.prepare("SELECT name, type FROM main.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'").all() as { name: string; type: string }[];
  const t = db.prepare("INSERT INTO information_schema.tables VALUES (?, ?, ?, NULL)");
  const c = db.prepare("INSERT INTO information_schema.columns VALUES (?, ?, ?, ?, ?)");
  for (const o of objs) {
    const cols = db.prepare(`SELECT name, type, cid FROM pragma_table_info(?)`).all(o.name) as { name: string; type: string; cid: number }[];
    for (const s of schemas) {
      t.run(s, o.name, o.type === "view" ? "VIEW" : "BASE TABLE");
      for (const col of cols) c.run(s, o.name, col.name, col.cid + 1, (col.type || "text").split(" ")[0].toLowerCase());
    }
  }
}

/** The current database: loads the first build (once), and checks for a newer one in the background. */
async function current(): Promise<State> {
  if (!g.state) {
    g.loading ??= manifest().then(build).then((s) => { g.state = s; return s; }).finally(() => { g.loading = null; });
    return g.loading;
  }
  if (Date.now() - g.state.checkedAt > CHECK_MS && !g.checking) {
    g.checking = true;
    g.state.checkedAt = Date.now();
    manifest()
      .then(async (m) => {
        if (m.build_id === g.state?.buildId) return;
        const fresh = await build(m);
        const old = g.state;
        g.state = fresh; // swapped whole
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

function connection(db: () => Promise<DB>) {
  const c = {
    query: async (sql: any, params?: unknown[]) => run(await db(), sql, params),
    execute: async (sql: any, params?: unknown[]) => run(await db(), sql, params),
    beginTransaction: async () => { (await db()).exec("BEGIN"); },
    commit: async () => { (await db()).exec("COMMIT"); },
    rollback: async () => { try { (await db()).exec("ROLLBACK"); } catch { /* no transaction open */ } },
    release: () => undefined,
    end: async () => undefined
  };
  return c;
}

/** A stand-in for a mysql2 Pool over the AWS-backed store. */
export function awsPool(): any {
  const db = async () => (await current()).db;
  const c = connection(db);
  return { ...c, getConnection: async () => connection(db), end: async () => undefined };
}
