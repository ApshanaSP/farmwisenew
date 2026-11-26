/**
 * The Collector's own uploaded files (Data Studio), read by the brain as tables: D1, D2, ... each a table of its own in a small store in memory,
 * its columns named by their labels, with the zone, ward, taluk, place and day the Studio read for each row. One read-only SELECT at a time.
 * A column the Studio marked as a person's details never enters the table, and a phone number or an e-mail inside a text is hidden.
 */
import { DatabaseSync } from "node:sqlite";
import { datasetOfTag, mayUse } from "@/lib/studio/forAssistants";
import { getMeta, getRows } from "@/lib/studio/store";
import { ToolProblem } from "./types";

type Cell = string | number | null;
type Row = Record<string, unknown>;
export interface StudioCol { key: string; label: string; type: "number" | "text" | "date"; filled: number; blank: number; distinct: number; min?: Cell; max?: Cell; top?: string }
export interface StudioTable { tag: string; id: string; name: string; entity: string; rows: number; window: string | null; summary: string | null; cols: StudioCol[]; hidden: string[] }
interface Held { at: string; table: StudioTable; made: boolean }

const g = globalThis as { __brainStudio?: { db: DatabaseSync; held: Map<string, Held> } };
const store = () => (g.__brainStudio ??= { db: new DatabaseSync(":memory:"), held: new Map() });
const MAX_TAGS = 12, MAX_ROWS = 200, MAX_LOAD = 120_000;
const RESERVED = new Set("select from where group order by having limit table index values set to as on and or not null in is case when then else end join left distinct day zone ward taluk place lat lon".split(" "));

export function slug(label: string, used: Set<string>): string {
  let s = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "col";
  if (/^\d/.test(s) || RESERVED.has(s)) s = `c_${s}`;
  let t = s;
  for (let k = 2; used.has(t); k++) t = `${s}_${k}`;
  used.add(t);
  return t;
}
const hide = (t: string): string => t.replace(/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g, "[phone]").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]");
const cell = (v: unknown): Cell => (v == null || v === "" ? null : typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "boolean" ? (v ? 1 : 0) : hide(String(v)).slice(0, 400));

/** the table of one file, made when first asked for and again when the file changed */
export function studioTable(tag: string, who: { role: string; lockDept: string | null }): StudioTable | null {
  if (!mayUse(who as never)) return null;
  const T = tag.trim().toUpperCase();
  const id = datasetOfTag(T, who as never), m = id ? getMeta(id) : null;
  if (!id || !m) return null;
  const s = store(), had = s.held.get(T);
  const at = `${id}|${m.updatedAt}|${m.rows}`;
  if (had && had.at === at) return had.table;
  const all = getRows(id) as unknown as Row[];
  const used = new Set<string>(["day", "zone", "ward", "taluk", "place", "lat", "lon"]);
  const spec = (m.spec?.columns ?? []).filter((c) => c.role !== "person" && c.role !== "ignore");
  const cols = spec.map((c) => ({ src: c.key, key: slug(c.label || c.header, used), label: c.label || c.header, num: c.type === "number" }));
  const extra = ([["_d", "day"], ["_z", "zone"], ["_w", "ward"], ["_t", "taluk"], ["_p", "place"], ["_la", "lat"], ["_lo", "lon"]] as const).filter(([k]) => all.some((r) => r[k] != null)).map(([src, key]) => ({ src, key, label: `${key} (read by the console)`, num: ["zone", "ward", "lat", "lon"].includes(key) }));
  const full = [...cols, ...extra];
  const rows = all.slice(0, MAX_LOAD);
  s.db.exec(`DROP TABLE IF EXISTS ${T}; CREATE TABLE ${T} (${full.map((c) => `"${c.key}" ${c.num ? "REAL" : "TEXT"}`).join(", ")})`);
  const ins = s.db.prepare(`INSERT INTO ${T} VALUES (${full.map(() => "?").join(", ")})`);
  s.db.exec("BEGIN");
  for (const r of rows) ins.run(...full.map((c) => cell(r[c.src])));
  s.db.exec("COMMIT");
  const profile: StudioCol[] = full.map((c) => {
    const x = s.db.prepare(`SELECT COUNT("${c.key}") AS filled, COUNT(DISTINCT "${c.key}") AS distinct_n, MIN("${c.key}") AS lo, MAX("${c.key}") AS hi FROM ${T}`).get() as Row;
    const n = Number(x.filled ?? 0), d = Number(x.distinct_n ?? 0);
    const top = !c.num && d > 0 && d <= 400 ? (s.db.prepare(`SELECT "${c.key}" AS v, COUNT(*) AS n FROM ${T} WHERE "${c.key}" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5`).all() as Row[]).map((y) => `${String(y.v).slice(0, 30)} (${y.n})`).join(", ") : undefined;
    return { key: c.key, label: c.label, type: c.num ? "number" : /^\d{4}-\d{2}-\d{2}/.test(String(x.lo ?? "")) ? "date" : "text", filled: n, blank: rows.length - n, distinct: d, min: (x.lo ?? null) as Cell, max: (x.hi ?? null) as Cell, top };
  });
  const table: StudioTable = { tag: T, id, name: m.spec?.title || m.name, entity: m.spec?.entity ?? "row", rows: all.length, window: m.window?.from ? `${m.window.from} to ${m.window.to}` : null, summary: m.spec?.summary ?? null, cols: profile, hidden: (m.spec?.columns ?? []).filter((c) => c.role === "person").map((c) => c.label || c.header) };
  s.held.set(T, { at, table, made: true });
  return table;
}

export function studioTables(who: { role: string; lockDept: string | null }): StudioTable[] {
  const out: StudioTable[] = [];
  for (let k = 1; k <= MAX_TAGS; k++) { const t = studioTable(`D${k}`, who); if (!t) break; out.push(t); }
  return out;
}
/** one line a file, with its columns, for the question it is asked in */
export function studioLines(who: { role: string; lockDept: string | null }): string | null {
  const ts = studioTables(who);
  return ts.length ? ts.map((t) => `${t.tag} "${t.name}" (${t.rows} rows, one per ${t.entity}${t.window ? `, ${t.window}` : ""}): ${t.cols.map((c) => c.key).join(", ")}`).join("\n") : null;
}

const BAD = /\b(?:insert|update|delete|replace|drop|alter|create|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension|readfile|writefile|edit)\b/i;
export function studioSqlProblem(sql: string): string | null {
  const t = sql.trim().replace(/;+\s*$/, "");
  const b = t.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/'(?:[^']|'')*'/g, "''");
  if (!t) return "The statement is empty.";
  if (t.length > 4000) return "The statement is too long.";
  if (b.includes(";")) return "Only one statement at a time.";
  if (!/^\s*(?:select|with)\b/i.test(b)) return "Only a SELECT (or WITH ... SELECT) may run.";
  if (BAD.test(b)) return "Only reading is allowed.";
  return null;
}
export function studioSql(sql: string, who: { role: string; lockDept: string | null }): { rows: Row[]; more: boolean; tables: StudioTable[] } {
  const why = studioSqlProblem(sql);
  if (why) throw new ToolProblem(why);
  const tags = [...new Set((sql.match(/\bD\d{1,2}\b/gi) ?? []).map((x) => x.toUpperCase()))];
  const tables = tags.map((t) => studioTable(t, who)).filter((t): t is StudioTable => !!t);
  if (!tables.length) throw new ToolProblem(`Name a file's table (D1, D2...). ${studioLines(who) ?? "No file has been added to the Data Studio yet."}`);
  const db = store().db;
  db.exec("PRAGMA query_only = 1");
  try {
    const rows = db.prepare(`SELECT * FROM (${sql.trim().replace(/;+\s*$/, "")}) LIMIT ${MAX_ROWS + 1}`).all() as Row[];
    return { rows: rows.slice(0, MAX_ROWS), more: rows.length > MAX_ROWS, tables };
  } catch (e) {
    throw new ToolProblem(`The file's table said: ${(e as Error).message}. ${tables.map((t) => `${t.tag} columns: ${t.cols.map((c) => c.key).join(", ")}`).join(". ")}`);
  } finally { db.exec("PRAGMA query_only = 0"); }
}
