/**
 * The brain's read of the whole database (26 Nov): every table the website holds (the hourly build from AWS S3, the website's own durable
 * tables from DynamoDB, the live lanes laid over them), by one read-only SELECT. Jarvis and Ask District IQ share it.
 *
 * - `cases` is the table to ask about incidents: one row per incident with the effective status (the Collector's decisions and the officers'
 *   steps on top of the pipeline's), so a count over it is the number on the dashboard's tiles. It is a temporary table kept per build and
 *   per decision (dataEpoch), made again when either changes.
 * - Read only: one SELECT, no PRAGMA, no ATTACH, query_only set while it runs, never more than MAX_ROWS rows, and a plan check that refuses a
 *   statement that would multiply two whole tables (it would hold the server's thread).
 * - Secrets (passwords, tokens, codes) and citizens' personal fields are never read: a statement that names one is refused and "*" leaves it
 *   out. Officials' published phone numbers and e-mails (official_contacts, ref_offices) are public and stay.
 */
import { createHash } from "crypto";
import { withCurrentBuild, storeInfo } from "@/lib/aws/store";
import { expand, translate } from "@/lib/aws/dialect";
import { effectiveSql } from "@/lib/collector/effective";
import { dataEpoch } from "@/lib/collector/epoch";
import { ops, TITLE, CLUSTER } from "@/lib/collector/db";
import { OPEN_NOW } from "@/lib/collector/intel";
import { redactText } from "@/lib/thunai/privacy";

type DB = { exec(s: string): void; prepare(s: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown } };
export type Row = Record<string, unknown>;

export const MAX_ROWS = 200;
/** tables nobody but the sign-in code reads */
const NO_TABLE = new Set(["password_resets", "user_profiles", "users", "_changes", "_keys", "schema_migrations", "_export_meta", "data_keys", "sqlite_master", "sqlite_schema", "sqlite_sequence", "assistant_messages", "assistant_sessions", "assistant_pins"]);
/** columns that hold a secret or a citizen's personal data (and a petition's own words, which carry the name and the address) */
const NO_COLUMN = new Set(["password_hash", "otp_hash", "token_version", "secret_enc", "session_enc", "session_expires_at", "username", "user_field", "pass_field", "login_url", "identifier",
  "aadhaar_number_encrypted", "aadhaar_last4", "initials", "first_name", "last_name", "gender", "date_of_birth", "street_address", "pincode", "mobile_number", "phone_number", "alternate_email",
  "door_no_and_street", "profile_photo", "media_path", "specific_location", "manual_street_name", "location_pincode", "mobile", "full_text", "reading", "user_id", "citizen_user_id", "sent_user_id", "actor_user_id",
  "uploaded_email", "before_value", "after_value", "photo_dir", "payload_json", "plan_json", "body_hash", "snapshot_sha256", "simhash", "reporter_hash"]);
/** a column of that name is personal only in these tables */
const NO_COLUMN_IN: Record<string, Set<string>> = { petitions: new Set(["name", "address", "problem", "request", "subject"]), complaints: new Set(["email", "description", "remarks"]), outbound_emails: new Set(["body", "delivered_to"]),
  events: new Set(["text"]), sources: new Set(["auth"]), audit_log: new Set(), petition_sms: new Set(["detail", "result"]), complaint_status_history: new Set(["remarks"]), officer_reports: new Set(["photos"]) };
/** a "*" over one of these would carry a hidden column out under another name (a CTE's own column list, a UNION): their columns are named */
const NAME_COLUMNS = new Set([...Object.keys(NO_COLUMN_IN), "officer_steps", "petitions", "sources"]);
/** where a phone or an e-mail is an official's, published for the public */
const OFFICIAL = new Set(["official_contacts", "ref_offices", "dept_assignments", "ref_facilities"]);
const WORD = /[A-Za-z_][A-Za-z0-9_$]*/g;
const FORBIDDEN = /\b(?:insert|update|delete|replace|drop|alter|create|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension|readfile|writefile|edit|fts3_tokenizer|zeroblob|randomblob)\b/i;

/** the statement with its text literals and comments taken out (for the checks; never run) */
function bare(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/'(?:[^']|'')*'/g, "''");
}

/** why a statement may not run; null when it may */
export function sqlProblem(sql: string): string | null {
  const t = String(sql ?? "").trim().replace(/;+\s*$/, "");
  if (!t) return "The statement is empty.";
  if (t.length > 6000) return "The statement is too long.";
  const b = bare(t);
  if (b.includes(";")) return "Only one statement at a time.";
  if (!/^\s*(?:select|with)\b/i.test(b)) return "Only a SELECT (or WITH ... SELECT) may run: the data is read only.";
  const bad = b.match(FORBIDDEN);
  if (bad && !/^replace$/i.test(bad[0])) return `"${bad[0]}" is not allowed: the data is read only.`;
  if (/\breplace\s+into\b/i.test(b)) return "The data is read only.";
  const words = (b.match(WORD) ?? []).map((w) => w.toLowerCase());
  const table = words.find((w) => NO_TABLE.has(w));
  if (table) return `The table "${table}" holds sign-in or personal data and is not read.`;
  const col = words.find((w) => NO_COLUMN.has(w));
  if (col) return `"${col}" is a secret or a citizen's personal detail and is not read.`;
  for (const [tb, cols] of Object.entries(NO_COLUMN_IN)) {
    if (!words.includes(tb)) continue;
    const c = words.find((w) => cols.has(w));
    if (c && tb !== "petitions") return `"${c}" of ${tb} is a citizen's personal detail and is not read.`;
    if (c && tb === "petitions") return `A petition's ${c} is the citizen's own and is not read; its area, ward, department, category, status and dates may be.`;
  }
  const starred = words.find((w) => NAME_COLUMNS.has(w));
  if (starred && /\*/.test(b.replace(/\bcount\s*\(\s*\*\s*\)/gi, "COUNT()").replace(/[\w)\]'"]\s*\*\s*[\w(]/g, " "))) return `Name the columns of ${starred} instead of "*" (some of its columns are citizens' own).`;
  if (/information_schema/i.test(b)) return "Use the schema tool for the tables and their columns.";
  return null;
}

// ------------------------------------------------------------------- cases --

/**
 * What `cases` was made from: the build, the data epoch when last looked at, and `sig`, what it is made of besides the build (casesSig).
 * 27 Nov: no longer made again every 10 minutes and on every epoch move. On the copy that does not save the epoch moves every 5 minutes (the
 * complaints reload), and on every news-desk sweep and live reading, and each time the table (28,570 incidents with their decisions) was
 * made again on the server's one thread, inside whichever question came first. It is made again when the build changes, or when the epoch
 * moved and casesSig says a decision, an officer's step, an assignment or the build's cases changed (so an answer right after a decision
 * counts it). The keep-warm makes it after a new build or a reload (refreshCases), in slices with the thread let go between them.
 */
const g = globalThis as { __brainCases?: { build: string; epoch: number; sig: string; at: number }; __brainCasesBuilding?: Promise<boolean> | null };

/** the columns of `cases`, in words (the schema tool and the prompt) */
export const CASES_COLUMNS: [string, string][] = [
  ["id", "incident id, INC-..."], ["title", "headline in plain words"], ["kind_code", "category code"], ["kind", "category label"], ["family", "category family"],
  ["dept_code", "lead department code"], ["dept", "lead department name"], ["zone_no", "GCC zone 1-15"], ["zone", "zone name"], ["ward_no", "GCC ward"], ["taluk_code", "TLK-..."], ["taluk", "taluk name"],
  ["place", "place text"], ["locality", "locality named in the place text"], ["lat", "latitude"], ["lon", "longitude"], ["severity", "Severe, High, Medium or Low"], ["status", "effective status now"],
  ["is_open", "1 = still open (unresolved) as the dashboard counts it"], ["is_overdue", "1 = open and past its deadline"], ["is_resolved", "1 = closed as Resolved"],
  ["reported_at", "first reported, IST YYYY-MM-DD HH:MM:SS"], ["updated_at", "last update"], ["resolved_at", "when it was closed"], ["due_at", "resolution deadline"],
  ["complaints", "citizen complaints joined to it"], ["police_reports", "police reports joined to it"], ["outlets", "how many different newspapers carried it"], ["newspapers", "their names"], ["news_only", "1 = only in the news, no department record"],
  ["sources", "which systems reported it"], ["source_count", "how many sources"], ["dead", "people who died"], ["injured", "people injured"], ["affected", "people affected"],
  ["priority", "priority score 0-100"], ["priority_why", "why it ranks so"], ["severity_why", "why that severity"], ["attention", "why it needs the Collector"], ["needs_review", "1 = its location or grouping needs a check"], ["review_reason", "what needs the check"],
  ["officer", "officer assigned"], ["group_id", "incidents of the same problem share it"], ["verified", "1 = checked"], ["awaiting_collector", "1 = waits for the Collector's check"]
];

/**
 * The SELECT `cases` is made of, in SQLite: every incident ("all"), those whose id is in (?, ?] ("range"), or after ? ("after"); the bounds
 * go after `params`. `named`: the build has the newspapers hook's outlet_names (else the linked reports are counted here, over every document).
 * (The build's tables are WITHOUT ROWID, keyed by their primary key: the slices go by incident_id.)
 */
export function casesSelect(named: boolean, part: "all" | "range" | "after" = "all"): { sql: string; params: unknown[] } {
  const EFF = effectiveSql(ops("collector_decisions"));
  const sql = `SELECT i.incident_id AS id, ${TITLE} AS title, i.category_code AS kind_code, i.category_label AS kind, i.family, i.lead_dept AS dept_code, dp.name AS dept, i.zone_no, i.zone_name AS zone, i.ward_no,
      i.taluk_code, tk.name AS taluk, i.place_text AS place, NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.place_text, ' (', 1), ',', -1)), '') AS locality, i.lat, i.lon, i.severity_level AS severity, ${EFF.status} AS status,
      (${OPEN_NOW}) AS is_open, (CASE WHEN ${EFF.open} = 0 AND ${EFF.status} = 'Resolved' THEN 1 ELSE 0 END) AS is_resolved,
      i.first_reported_at AS reported_at, i.last_update_at AS updated_at, ${EFF.closedAt} AS resolved_at, i.sla_due_at AS due_at, COALESCE(i.citizen_complaints, 0) AS complaints, COALESCE(i.police_reports, 0) AS police_reports,
      ${named ? "COALESCE(i.outlet_count, 0)" : "COALESCE(np.n, 0)"} AS outlets, ${named ? "i.outlet_names" : "np.names"} AS newspapers, COALESCE(i.media_only, 0) AS news_only, i.sources, i.source_count, COALESCE(i.dead, 0) AS dead, COALESCE(i.injured, 0) AS injured, i.persons_affected AS affected,
      i.priority_score AS priority, i.priority_reasons AS priority_why, i.severity_reasons AS severity_why, i.attention_reason AS attention, i.needs_review, i.review_reason, i.officer, ${CLUSTER} AS group_id,
      ${EFF.verified} AS verified, COALESCE(i.awaiting_collector, 0) AS awaiting_collector
    FROM incidents i LEFT JOIN ref_departments dp ON dp.code = i.lead_dept LEFT JOIN ref_taluks tk ON tk.taluk_code = i.taluk_code
      ${named ? "" : "LEFT JOIN (SELECT linked_incident_id AS inc, COUNT(DISTINCT publisher) AS n, GROUP_CONCAT(DISTINCT publisher) AS names FROM documents WHERE linked_incident_id IS NOT NULL AND publisher IS NOT NULL GROUP BY linked_incident_id) np ON np.inc = i.incident_id"}
    ${part === "range" ? "WHERE i.incident_id > ? AND i.incident_id <= ?" : part === "after" ? "WHERE i.incident_id > ?" : ""}`;
  const bounds = part === "range" ? ["", ""] : part === "after" ? [""] : [];
  const [text, params] = expand(sql, bounds.length ? bounds : []);
  return { sql: translate(text), params: params.slice(0, params.length - bounds.length) };
}

/**
 * incidents per slice of a sliced make (refreshCases). On the owner's PC (27 Nov, 28,570 incidents): 1.6 s in one go; slices of 4,000 took
 * at most 0.32 s each and gave the same rows; 2,500 keeps a slice near 0.2 s there (more on the hosted copy's one slower core).
 */
export const CASES_SLICE = 2500;

const namedOf = (db: DB): boolean => (db.prepare("PRAGMA table_info(incidents)").all() as { name: string }[]).some((x) => x.name === "outlet_names");
const casesThere = (db: DB): boolean => { try { return !!db.prepare("SELECT 1 AS x FROM temp.sqlite_master WHERE name = 'brain_cases'").get(); } catch { return false; } };

/**
 * What `cases` is made of besides the build: the decisions and the officers' steps (each kept with a rising id), the assignments, and the
 * build's own cases as live writes change them (a case filed or joined, a news item that was no incident taken out). About 50 ms over 28,570
 * incidents on the owner's PC (the incidents are read whole); read only when the epoch has moved, against the 1.6 s of making the table.
 */
export function casesSig(db: DB): string {
  const one = (sql: string): string => { try { return JSON.stringify(Object.values((db.prepare(sql).get() as Row | undefined) ?? {})); } catch { return "-"; } };
  return [one("SELECT COUNT(*), MAX(decision_id) FROM collector_decisions"), one("SELECT COUNT(*), MAX(step_id) FROM officer_steps"),
    one("SELECT COUNT(*), MAX(assigned_at) FROM dept_assignments"), one("SELECT COUNT(*), MAX(last_update_at), TOTAL(citizen_complaints) FROM incidents"),
    String(incidentWrites(db))].join("|");
}

/**
 * (27 Nov review) The rows of the build's incidents written on this connection since `cases` was first looked at on it. A case changed in
 * place moves no count and no latest time: the news desk's better headline and its hold for review (newsdesk.ts laid, derive.ts applyDesk)
 * and a petition's case kept as its officer chose (manu/cases.ts keepPetitionCase) went unseen until the next build. Temp triggers: on this
 * build's connection only, gone with it. -1 when they cannot be made (the counts above still hold).
 */
function incidentWrites(db: DB): number {
  try {
    const r = db.prepare("SELECT n FROM temp.brain_inc_writes").get() as { n: number } | undefined;
    if (r) return Number(r.n);
  } catch { /* not made on this connection yet */ }
  try {
    // (the table first and never dropped: a trigger whose table is missing would make every write to incidents fail. A trigger's own
    // statement names its table unqualified; a temp trigger finds the temp table first)
    db.exec(`CREATE TEMP TABLE IF NOT EXISTS brain_inc_writes (n INTEGER NOT NULL); DELETE FROM temp.brain_inc_writes; INSERT INTO temp.brain_inc_writes VALUES (0);
      CREATE TEMP TRIGGER IF NOT EXISTS brain_inc_ins AFTER INSERT ON incidents BEGIN UPDATE brain_inc_writes SET n = n + 1; END;
      CREATE TEMP TRIGGER IF NOT EXISTS brain_inc_upd AFTER UPDATE ON incidents BEGIN UPDATE brain_inc_writes SET n = n + 1; END;
      CREATE TEMP TRIGGER IF NOT EXISTS brain_inc_del AFTER DELETE ON incidents BEGIN UPDATE brain_inc_writes SET n = n + 1; END;`);
    return 0;
  } catch {
    return -1;
  }
}

/** Is `cases` up to date for this build and the data now? Moves its epoch on when the data moved but nothing it is made of did. */
function casesFresh(db: DB, build: string): boolean {
  const had = g.__brainCases;
  if (!had || had.build !== build || !casesThere(db)) return false;
  const e = dataEpoch();
  if (had.epoch === e) return true;
  if (casesSig(db) !== had.sig) return false;
  had.epoch = e;
  return true;
}

/** the made table put in place of `cases` (its indexes and the view with is_overdue, which follows the clock) */
function swapIn(db: DB, from: string): void {
  db.exec(`DROP VIEW IF EXISTS temp.cases; DROP TABLE IF EXISTS temp.brain_cases; ALTER TABLE temp.${from} RENAME TO brain_cases;
    CREATE INDEX temp.ix_bc_t ON brain_cases (reported_at); CREATE INDEX temp.ix_bc_id ON brain_cases (id); CREATE INDEX temp.ix_bc_z ON brain_cases (zone_no);
    CREATE TEMP VIEW cases AS SELECT *, CASE WHEN is_open = 1 AND due_at IS NOT NULL AND due_at < NOW() THEN 1 ELSE 0 END AS is_overdue FROM brain_cases`);
}

/** `cases` made when the build or what it is made of changed, in one go. Call with the store's turn held (inside withCurrentBuild). */
function ensureCases(db: DB, build: string): void {
  if (casesFresh(db, build)) return;
  const epoch = dataEpoch(), sig = casesSig(db);
  const { sql, params } = casesSelect(namedOf(db));
  db.exec("DROP TABLE IF EXISTS temp.brain_cases_one");
  db.prepare(`CREATE TEMP TABLE brain_cases_one AS ${sql}`).run(...params);
  swapIn(db, "brain_cases_one");
  g.__brainCases = { build, epoch, sig, at: Date.now() };
}

/**
 * `cases` made again if the build or what it is made of changed, CASES_SLICE incidents at a time, the store's turn and the thread let go
 * between slices (the keep-warm after a new build or a reload, and every read of `cases` before it takes its turn). One make at a time;
 * a make already running is waited for. True when it was made.
 */
export function refreshCases(): Promise<boolean> {
  return (g.__brainCasesBuilding ??= makeSliced().finally(() => { g.__brainCasesBuilding = null; }));
}

async function makeSliced(): Promise<boolean> {
  const plan = await withCurrentBuild((db0, build) => {
    const db = db0 as unknown as DB;
    if (casesFresh(db, build)) return null;
    const named = namedOf(db);
    // the slices' tops: every CASES_SLICE-th incident id in key order (a build without outlet_names counts the linked reports over every
    // document, so it is made in one go, not once a slice)
    const tops = named ? (db.prepare(`SELECT incident_id AS id FROM (SELECT incident_id, ROW_NUMBER() OVER (ORDER BY incident_id) AS n FROM incidents) WHERE n % ${CASES_SLICE} = 0 ORDER BY n`).all() as { id: string }[]).map((r) => r.id) : [];
    return { build, epoch: dataEpoch(), sig: casesSig(db), named, tops };
  });
  if (!plan) return false;
  const range = casesSelect(plan.named, "range"), after = casesSelect(plan.named, "after");
  /** one step on the build the plan was made for, in the store's turn; false when a new build came meanwhile (the next read makes it for that one) */
  const onPlan = (fn: (db: DB) => void): Promise<boolean | null> => withCurrentBuild((db0, build) => {
    const db = db0 as unknown as DB;
    if (build !== plan.build) return false;
    fn(db);
    return true;
  });
  // the table's shape, with no rows (an empty range); the slices go in after
  if (!(await onPlan((db) => { db.exec("DROP TABLE IF EXISTS temp.brain_cases_slices"); db.prepare(`CREATE TEMP TABLE brain_cases_slices AS ${range.sql}`).run(...range.params, "", ""); }))) return false;
  let lo = "";
  for (const top of plan.tops) {
    await new Promise<void>((r) => setImmediate(r));
    const from = lo;
    if (!(await onPlan((db) => { db.prepare(`INSERT INTO temp.brain_cases_slices ${range.sql}`).run(...range.params, from, top); }))) return false;
    lo = top;
  }
  await new Promise<void>((r) => setImmediate(r));
  // the last slice and the swap in one turn (a decision made while the slices went in moved the epoch and the sig: the next read makes it again)
  return !!(await onPlan((db) => {
    db.prepare(`INSERT INTO temp.brain_cases_slices ${after.sql}`).run(...after.params, lo);
    swapIn(db, "brain_cases_slices");
    g.__brainCases = { build: plan.build, epoch: plan.epoch, sig: plan.sig, at: Date.now() };
  }));
}

/** The keep-warm's step: `cases` made after a new build or a reload when what it is made of changed (false: up to date, or no build yet). */
export async function warmCases(): Promise<boolean> {
  await storeInfo().catch(() => null);
  return refreshCases().catch(() => false);
}

export interface SqlOut { columns: string[]; rows: Row[]; more: boolean; ms: number; tables: string[] }
export class SqlRefused extends Error {}

/** two whole tables multiplied (a join with no condition the store can use): refused, it would hold the server */
function heavyPlan(db: DB, sql: string, params: unknown[]): string | null {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { id: number; parent: number; detail: string }[];
  const byParent = new Map<number, number>();
  const SMALL = /\b(?:ref_\w+|zones|departments|_?meta|workspaces|followups|sources|source_health|kpis|metrics|alerts|anomalies|briefings|briefing_notes|police_stations|official_contacts|traffic_snaps|collector_decisions|officer_steps|actions?_updates|dept_assignments)\b/i;
  for (const p of plan) if (/^SCAN\b/.test(p.detail) && !SMALL.test(p.detail) && !/CONSTANT ROW|SUBQUERY|MATERIALIZE|USING (?:COVERING )?INDEX .*\(.*=/.test(p.detail)) byParent.set(p.parent, (byParent.get(p.parent) ?? 0) + 1);
  if ([...byParent.values()].some((n) => n > 1)) return "This would compare every row of one large table with every row of another. Join on an indexed key (id, incident_id, zone_no, dept_code, taluk_code) or filter one side first in a subquery.";
  const correlated = plan.find((p) => /CORRELATED/.test(p.detail));
  if (correlated && plan.some((p) => p.parent === correlated.id && /^SCAN (?!.*(?:ref_|zones))/.test(p.detail))) return "A correlated subquery reads a whole table for every row. Use a JOIN or a GROUP BY subquery instead.";
  return null;
}

const tablesIn = (sql: string): string[] => [...new Set([...bare(sql).matchAll(/\b(?:from|join)\s+([A-Za-z_][\w.]*)/gi)].map((m) => m[1].toLowerCase().replace(/^.*\./, "")))];

/** One read-only SELECT over the whole store. Throws SqlRefused with the reason in plain words. */
export async function readSql(sql: string, params: unknown[] = [], limit = MAX_ROWS): Promise<SqlOut> {
  const why = sqlProblem(sql);
  if (why) throw new SqlRefused(why);
  const text = sql.trim().replace(/;+\s*$/, "");
  // (the store must be loaded: the first question after a start may come before any page did)
  const info = await storeInfo();
  const t0 = Date.now();
  // (cases made again first, if they must be, in slices: the statement's own turn below then finds them made)
  if (tablesIn(text).includes("cases")) await refreshCases().catch(() => false);
  const got = await withCurrentBuild((db0, build) => {
    const db = db0 as unknown as DB;
    const tables = tablesIn(text);
    if (tables.includes("cases")) ensureCases(db, build);
    const wrapped = `SELECT * FROM (${text}) LIMIT ${Math.min(limit, MAX_ROWS) + 1}`;
    db.exec("PRAGMA query_only = 1");
    try {
      const heavy = heavyPlan(db, wrapped, params);
      if (heavy) throw new SqlRefused(heavy);
      const rows = db.prepare(wrapped).all(...params) as Row[];
      return { rows, tables };
    } catch (e) {
      if (e instanceof SqlRefused) throw e;
      throw new SqlRefused(`The database said: ${(e as Error).message}`);
    } finally {
      db.exec("PRAGMA query_only = 0");
    }
  });
  if (!got) throw new SqlRefused(`The data is still loading (build ${info.buildId}).`);
  const cap = Math.min(limit, MAX_ROWS);
  const official = got.tables.length > 0 && got.tables.every((t) => OFFICIAL.has(t) || /^ref_|^cases$|^departments$/.test(t)) && got.tables.some((t) => OFFICIAL.has(t));
  const rows = got.rows.slice(0, cap).map((r) => clean(r, official, got.tables));
  return { columns: Object.keys(rows[0] ?? {}), rows, more: got.rows.length > cap, ms: Date.now() - t0, tables: got.tables };
}

/** personal fields out, phone and id numbers in free text masked (an official's own published number stays) */
function clean(r: Row, official: boolean, tables: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    const key = k.toLowerCase();
    if (NO_COLUMN.has(key)) continue;
    if (tables.some((t) => NO_COLUMN_IN[t]?.has(key))) continue;
    if (v instanceof Uint8Array) continue;
    out[k] = typeof v === "string" ? (official ? v : redactText(v)).slice(0, 1200) : v;
  }
  return out;
}

/** The brain's own reads (code, not the model): the cases table and any read-only statement, with parameters, rows as they are. */
export async function caseRows(sql: string, params: unknown[] = []): Promise<Row[]> {
  await storeInfo();
  await refreshCases().catch(() => false);
  const rows = await withCurrentBuild((db0, build) => {
    const db = db0 as unknown as DB;
    ensureCases(db, build);
    return db.prepare(sql).all(...params) as Row[];
  });
  return rows ?? [];
}

let schemaCache: { build: string; tables: { name: string; columns: string[]; rows: number }[] } | null = null;
/** every table and its columns (what may be read), with the row counts */
export async function readSchema(): Promise<{ name: string; columns: string[]; rows: number }[]> {
  const info = await storeInfo();
  if (schemaCache && schemaCache.build === info.buildId) return schemaCache.tables;
  await refreshCases().catch(() => false);
  const tables = await withCurrentBuild((db0, build) => {
    const db = db0 as unknown as DB;
    ensureCases(db, build);
    const objs = db.prepare(`SELECT name, 'main' AS db FROM main.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
      UNION SELECT name, 'durable' FROM durable.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`).all() as { name: string; db: string }[];
    return objs.filter((o) => !NO_TABLE.has(o.name.toLowerCase()) && !/^_/.test(o.name)).map((o) => {
      const cols = (db.prepare("SELECT name FROM pragma_table_info(?, ?)").all(o.name, o.db) as { name: string }[]).map((c) => c.name)
        .filter((c) => !NO_COLUMN.has(c.toLowerCase()) && !NO_COLUMN_IN[o.name]?.has(c.toLowerCase()));
      const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${o.db}."${o.name}"`).get() as { n: number }).n;
      return { name: o.name, columns: cols, rows: n };
    }).sort((a, b) => a.name.localeCompare(b.name));
  });
  if (tables) schemaCache = { build: info.buildId, tables };
  return tables ?? [];
}

/** a short stable id for a statement (evidence) */
export const sqlId = (sql: string): string => createHash("sha1").update(sql.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 8);
