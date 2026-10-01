/**
 * MySQL -> SQLite for the dashboard's queries, so they run unchanged on the in-memory store loaded from AWS
 * (src/lib/aws/store.ts) instead of a MySQL server.
 *
 * Three parts:
 *  - translate(sql): grammar SQLite lacks, rewritten on tokens (never inside strings or comments):
 *      `db`.`table` -> table            (both databases live in one SQLite store)
 *      x +/- INTERVAL n UNIT, DATE_ADD / DATE_SUB(x, INTERVAL n UNIT)  -> dt_add(x, +/-n, 'UNIT')
 *      a / b -> a * 1.0 / b             (MySQL '/' never truncates; SQLite's does on integers)
 *      IF( -> iif(,  CAST(x AS SIGNED|UNSIGNED|DECIMAL(..)|CHAR) -> INTEGER / REAL / TEXT,  "text" -> 'text'
 *      GROUP_CONCAT(x SEPARATOR 's') -> group_concat(x, 's')
 *      INSERT IGNORE -> INSERT OR IGNORE, REPLACE INTO -> INSERT OR REPLACE INTO,
 *      ON DUPLICATE KEY UPDATE c = VALUES(c) -> ON CONFLICT DO UPDATE SET c = excluded.c
 *  - registerFunctions(db): the MySQL functions the queries call (NOW, CURDATE, DATE_FORMAT, TIMESTAMPDIFF, ...),
 *    on IST wall-clock strings like the stored values (the MySQL server ran on IST, with dateStrings).
 *  - expand(sql, params): mysql2's `query` placeholders: an array becomes a list (IN (?)), an array of arrays
 *    becomes row tuples (VALUES ?), an object becomes `col` = ? pairs (SET ?), ?? an identifier, a Date its
 *    local "YYYY-MM-DD HH:MM:SS", a boolean 1/0.
 * Text columns are created COLLATE NOCASE (store.ts), which gives MySQL's case-insensitive = and ORDER BY.
 */
import type { DatabaseSync } from "node:sqlite";

type Tok = { t: "s" | "id" | "c" | "n" | "w" | "p" | "q" | "ws"; v: string };

/** Splits SQL into tokens: strings, `identifiers`, comments, numbers, words, ? / ??, punctuation, whitespace. */
export function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "\\") j += 2;
        else if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j++;
      }
      out.push({ t: "s", v: sql.slice(i, j + 1) });
      i = j + 1;
    } else if (ch === "`") {
      const j = sql.indexOf("`", i + 1);
      out.push({ t: "id", v: sql.slice(i, j + 1) });
      i = j + 1;
    } else if (two === "/*") {
      const j = sql.indexOf("*/", i + 2);
      out.push({ t: "c", v: sql.slice(i, j < 0 ? n : j + 2) });
      i = j < 0 ? n : j + 2;
    } else if (two === "--" || ch === "#") {
      const j = sql.indexOf("\n", i);
      out.push({ t: "c", v: sql.slice(i, j < 0 ? n : j) });
      i = j < 0 ? n : j;
    } else if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(sql[j])) j++;
      out.push({ t: "ws", v: sql.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(sql.slice(i))!;
      out.push({ t: "n", v: m[0] });
      i += m[0].length;
    } else if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(sql.slice(i))!;
      out.push({ t: "w", v: m[0] });
      i += m[0].length;
    } else if (ch === "?") {
      const dbl = sql[i + 1] === "?";
      out.push({ t: "q", v: dbl ? "??" : "?" });
      i += dbl ? 2 : 1;
    } else {
      const three = sql.slice(i, i + 3);
      const op = ["->>", "<=>"].includes(three) ? three : ["->", "<=", ">=", "<>", "!=", "||", ":="].includes(two) ? two : ch;
      out.push({ t: "p", v: op });
      i += op.length;
    }
  }
  return out;
}

const join = (toks: Tok[]) => toks.map((t) => t.v).join("");
const W = (t: Tok | undefined, word: string) => !!t && t.t === "w" && t.v.toUpperCase() === word;
const UNITS = new Set(["MICROSECOND", "SECOND", "MINUTE", "HOUR", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]);

/** Index of the next non-whitespace / non-comment token at or after i (or -1). */
function next(toks: Tok[], i: number, dir = 1): number {
  for (let j = i; j >= 0 && j < toks.length; j += dir) if (toks[j].t !== "ws" && toks[j].t !== "c") return j;
  return -1;
}

/** The index of the bracket matching the one at i. */
function match(toks: Tok[], i: number): number {
  const open = toks[i].v, close = open === "(" ? ")" : "(", dir = open === "(" ? 1 : -1;
  let depth = 0;
  for (let j = i; j >= 0 && j < toks.length; j += dir) {
    if (toks[j].t !== "p") continue;
    if (toks[j].v === open) depth++;
    else if (toks[j].v === close && --depth === 0) return j;
  }
  throw new Error("unbalanced brackets in SQL");
}

/** Start index of the operand that ends at token `end` (a value, a qualified column, or a call / bracket). */
function operandStart(toks: Tok[], end: number): number {
  let s = end;
  if (toks[end].t === "p" && toks[end].v === ")") {
    s = match(toks, end);
    const f = next(toks, s - 1, -1);
    if (f >= 0 && toks[f].t === "w") s = f; // a function call: NOW(), DATE(x)
    return s;
  }
  // a.b.c
  while (true) {
    const dot = next(toks, s - 1, -1);
    if (dot >= 0 && toks[dot].t === "p" && toks[dot].v === ".") {
      const before = next(toks, dot - 1, -1);
      if (before >= 0 && (toks[before].t === "w" || toks[before].t === "id")) { s = before; continue; }
    }
    return s;
  }
}

/** INTERVAL <expr> <UNIT> starting at token i: [expression tokens, unit, index of the unit token]. */
function readInterval(toks: Tok[], i: number): [Tok[], string, number] {
  let depth = 0;
  for (let j = i + 1; j < toks.length; j++) {
    const t = toks[j];
    if (t.t === "p" && t.v === "(") depth++;
    if (t.t === "p" && t.v === ")") depth--;
    if (depth === 0 && t.t === "w" && UNITS.has(t.v.toUpperCase())) return [toks.slice(i + 1, j), t.v.toUpperCase(), j];
  }
  throw new Error("INTERVAL without a unit");
}

function intervals(toks: Tok[]): Tok[] {
  for (let guard = 0; guard < 200; guard++) {
    // DATE_ADD(x, INTERVAL n U) / DATE_SUB(...)
    const f = toks.findIndex((t, k) => (W(t, "DATE_ADD") || W(t, "DATE_SUB") || W(t, "ADDDATE") || W(t, "SUBDATE"))
      && toks[next(toks, k + 1)]?.v === "(");
    if (f >= 0) {
      const open = next(toks, f + 1), close = match(toks, open);
      const inner = toks.slice(open + 1, close);
      const iv = inner.findIndex((t) => W(t, "INTERVAL"));
      if (iv < 0) throw new Error("DATE_ADD without INTERVAL");
      let comma = iv - 1;
      while (comma >= 0 && !(inner[comma].t === "p" && inner[comma].v === ",")) comma--;
      const [amount, unit] = readInterval(inner, iv);
      const sign = /SUB/i.test(toks[f].v) ? "-" : "";
      const rep = tokenize(`dt_add(${join(inner.slice(0, comma))}, ${sign}(${join(amount)}), '${unit}')`);
      toks = [...toks.slice(0, f), ...rep, ...toks.slice(close + 1)];
      continue;
    }
    // x + INTERVAL n U   /   x - INTERVAL n U   /   INTERVAL n U + x
    const k = toks.findIndex((t) => W(t, "INTERVAL"));
    if (k < 0) return toks;
    const [amount, unit, uEnd] = readInterval(toks, k);
    const op = next(toks, k - 1, -1);
    if (op >= 0 && toks[op].t === "p" && (toks[op].v === "+" || toks[op].v === "-")) {
      const lEnd = next(toks, op - 1, -1), lStart = operandStart(toks, lEnd);
      const sign = toks[op].v === "-" ? "-" : "";
      const rep = tokenize(`dt_add(${join(toks.slice(lStart, lEnd + 1))}, ${sign}(${join(amount)}), '${unit}')`);
      toks = [...toks.slice(0, lStart), ...rep, ...toks.slice(uEnd + 1)];
      continue;
    }
    const plus = next(toks, uEnd + 1);
    if (plus >= 0 && toks[plus].v === "+") {
      const rStart = next(toks, plus + 1);
      let rEnd = rStart;
      if (toks[rStart].t === "w" && toks[next(toks, rStart + 1)]?.v === "(") rEnd = match(toks, next(toks, rStart + 1));
      else if (toks[rStart].v === "(") rEnd = match(toks, rStart);
      const rep = tokenize(`dt_add(${join(toks.slice(rStart, rEnd + 1))}, (${join(amount)}), '${unit}')`);
      toks = [...toks.slice(0, k), ...rep, ...toks.slice(rEnd + 1)];
      continue;
    }
    throw new Error("INTERVAL used in a way the SQLite adapter does not handle");
  }
  throw new Error("too many INTERVAL rewrites");
}

const DBS = new Set<string>();
/** Database names to strip from `db`.`table` (both live in one SQLite store). */
export function setDatabaseNames(names: string[]) {
  DBS.clear();
  for (const n of names) DBS.add(n.toLowerCase());
}
const bare = (t: Tok) => (t.t === "id" ? t.v.slice(1, -1) : t.v).toLowerCase();

const cache = new Map<string, string>();

/** MySQL dialect -> SQLite dialect (cached per SQL text). */
export function translate(sql: string): string {
  const hit = cache.get(sql);
  if (hit !== undefined) return hit;
  let toks = tokenize(sql);

  // `db`.`table` -> `table`
  toks = toks.filter((t, k) => {
    if ((t.t === "id" || t.t === "w") && DBS.has(bare(t)) && toks[k + 1]?.t === "p" && toks[k + 1].v === ".") {
      toks[k + 1] = { t: "ws", v: "" };
      return false;
    }
    return true;
  });

  toks = intervals(toks);

  const out: Tok[] = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const nx = toks[next(toks, k + 1)];
    if (t.t === "p" && t.v === "/") { out.push({ t: "p", v: "* 1.0 /" }); continue; }
    if (t.t === "s" && t.v.startsWith('"')) {
      // MySQL "text" is a string; SQLite would read it as an identifier
      const body = t.v.slice(1, -1).replace(/""/g, '"').replace(/\\"/g, '"');
      out.push({ t: "s", v: `'${body.replace(/'/g, "''")}'` });
      continue;
    }
    if (W(t, "DIV")) { out.push({ t: "p", v: "/" }); continue; }
    if (t.t === "w" && UNITS.has(t.v.toUpperCase()) && out.length) {
      // TIMESTAMPDIFF(SECOND, a, b) / TIMESTAMPADD(DAY, n, x): the bare unit becomes a string argument
      const prev = (() => { for (let m = out.length - 1; m >= 0; m--) if (out[m].t !== "ws") return m; return -1; })();
      const fnTok = prev >= 0 && out[prev].v === "(" ? out[(() => { for (let m = prev - 1; m >= 0; m--) if (out[m].t !== "ws") return m; return -1; })()] : undefined;
      if (W(fnTok, "TIMESTAMPDIFF") || W(fnTok, "TIMESTAMPADD")) { out.push({ t: "s", v: `'${t.v.toUpperCase()}'` }); continue; }
    }
    if (W(t, "IF") && nx?.v === "(" && !W(toks[next(toks, k - 1, -1)], "EXISTS")) { out.push({ t: "w", v: "iif" }); continue; }
    if (W(t, "SEPARATOR")) {
      // GROUP_CONCAT(x SEPARATOR 's'): drop the keyword, add a comma
      while (out.length && out[out.length - 1].t === "ws") out.pop();
      out.push({ t: "p", v: "," });
      continue;
    }
    if (W(t, "IGNORE") && W(toks[next(toks, k - 1, -1)], "INSERT")) { out.push({ t: "w", v: "OR IGNORE" }); continue; }
    if (W(t, "REPLACE") && W(nx, "INTO") && next(toks, k - 1, -1) < 0) { out.push({ t: "w", v: "INSERT OR REPLACE" }); continue; }
    if (W(t, "ON") && W(nx, "DUPLICATE")) {
      // ON DUPLICATE KEY UPDATE -> ON CONFLICT DO UPDATE SET
      const upd = next(toks, next(toks, next(toks, k + 1) + 1) + 1);
      out.push({ t: "w", v: "ON CONFLICT DO UPDATE SET" });
      k = upd;
      continue;
    }
    if (W(t, "VALUES") && nx?.v === "(" && out.some((o) => o.v === "ON CONFLICT DO UPDATE SET")) {
      // VALUES(col) inside the update list -> excluded.col
      const open = next(toks, k + 1), close = match(toks, open);
      out.push({ t: "w", v: `excluded.${join(toks.slice(open + 1, close)).trim()}` });
      k = close;
      continue;
    }
    if (W(t, "AS") && out.length) {
      // CAST(x AS SIGNED) etc. (only inside CAST: the type follows AS)
      const ty = toks[next(toks, k + 1)];
      const typ = ty?.t === "w" ? ty.v.toUpperCase() : "";
      if (["SIGNED", "UNSIGNED", "DECIMAL", "CHAR", "INTEGER", "INT"].includes(typ) && insideCast(out)) {
        let end = next(toks, k + 1);
        const after = next(toks, end + 1);
        if (toks[after]?.v === "(") end = match(toks, after);
        if (W(toks[next(toks, end + 1)], "INTEGER")) end = next(toks, end + 1); // UNSIGNED INTEGER
        out.push({ t: "w", v: `AS ${typ === "DECIMAL" ? "REAL" : typ === "CHAR" ? "TEXT" : "INTEGER"}` });
        k = end;
        continue;
      }
    }
    out.push(t);
  }
  const res = join(out);
  if (cache.size > 5000) cache.clear();
  cache.set(sql, res);
  return res;
}

/** True when the last unclosed "(" in `out` belongs to CAST. */
function insideCast(out: Tok[]): boolean {
  let depth = 0;
  for (let j = out.length - 1; j >= 0; j--) {
    const t = out[j];
    if (t.t === "p" && t.v === ")") depth++;
    if (t.t === "p" && t.v === "(") {
      if (depth === 0) {
        const f = (() => { for (let m = j - 1; m >= 0; m--) if (out[m].t !== "ws") return out[m]; })();
        return W(f, "CAST") || W(f, "CONVERT");
      }
      depth--;
    }
  }
  return false;
}

// ------------------------------------------------------------- parameters --

const pad = (n: number) => String(n).padStart(2, "0");
/** A Date as local wall-clock "YYYY-MM-DD HH:MM:SS" (mysql2's default `timezone: 'local'`). */
export function sqlDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function scalar(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return sqlDate(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (Buffer.isBuffer(v)) return v;
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

/** mysql2 `query` placeholder rules -> plain ? placeholders and a flat list of SQLite values. */
export function expand(sql: string, params: unknown[] = []): [string, unknown[]] {
  if (!params.length) return [sql, []];
  const toks = tokenize(sql);
  const flat: unknown[] = [];
  let p = 0;
  const out = toks.map((t) => {
    if (t.t !== "q") return t.v;
    const v = params[p++];
    if (t.v === "??") return Array.isArray(v) ? v.map((x) => `\`${x}\``).join(", ") : `\`${v}\``;
    if (Array.isArray(v)) {
      if (!v.length) return "NULL";
      if (Array.isArray(v[0])) return v.map((row: unknown[]) => { flat.push(...row.map(scalar)); return `(${row.map(() => "?").join(", ")})`; }).join(", ");
      flat.push(...v.map(scalar));
      return v.map(() => "?").join(", ");
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
      flat.push(...e.map(([, x]) => scalar(x)));
      return e.map(([k]) => `\`${k}\` = ?`).join(", ");
    }
    flat.push(scalar(v));
    return "?";
  });
  return [out.join(""), flat];
}

// -------------------------------------------------------------- functions --

/** Current IST wall clock as "YYYY-MM-DD HH:MM:SS" (the stored times are IST, like the MySQL server's clock). */
export function istNow(): string {
  const d = new Date(Date.now() + 330 * 60_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** "YYYY-MM-DD[ HH:MM:SS]" as a UTC-based Date (wall-clock arithmetic, no time zone involved). */
function wall(s: unknown): Date | null {
  if (s === null || s === undefined || s === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}
const isDateOnly = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const fmtWall = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

function dtAdd(x: unknown, n: unknown, unit: unknown): string | null {
  const d = wall(x);
  if (!d || n === null) return null;
  const k = Number(n), u = String(unit).toUpperCase();
  const ms: Record<string, number> = { SECOND: 1e3, MINUTE: 6e4, HOUR: 36e5, DAY: 864e5, WEEK: 6048e5 };
  if (ms[u]) d.setTime(d.getTime() + k * ms[u]);
  else if (u === "MONTH" || u === "QUARTER" || u === "YEAR") {
    const months = k * (u === "YEAR" ? 12 : u === "QUARTER" ? 3 : 1);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); // MySQL clamps 31 Jan + 1 month to 28/29 Feb
  }
  const s = fmtWall(d);
  return isDateOnly(x) && (ms[u] ?? 864e5) >= 864e5 ? s.slice(0, 10) : s;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** MySQL WEEK(d, mode) for the modes the dashboard uses (0: Sunday-first, 1/3: ISO-style Monday-first). */
function week(d: Date, mode: number): number {
  if (mode === 3 || mode === 1) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t.getTime() - first.getTime()) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const firstSunday = (7 - jan1.getUTCDay()) % 7;
  const doy = Math.floor((d.getTime() - jan1.getTime()) / 864e5);
  return doy < firstSunday ? 0 : Math.floor((doy - firstSunday) / 7) + 1;
}

function dateFormat(x: unknown, f: unknown): string | null {
  const d = wall(x);
  if (!d || f === null) return null;
  const h = d.getUTCHours();
  const map: Record<string, () => string> = {
    Y: () => String(d.getUTCFullYear()), y: () => String(d.getUTCFullYear()).slice(2),
    m: () => pad(d.getUTCMonth() + 1), c: () => String(d.getUTCMonth() + 1), d: () => pad(d.getUTCDate()),
    e: () => String(d.getUTCDate()), H: () => pad(h), k: () => String(h), h: () => pad(h % 12 || 12),
    I: () => pad(h % 12 || 12), l: () => String(h % 12 || 12), i: () => pad(d.getUTCMinutes()),
    s: () => pad(d.getUTCSeconds()), S: () => pad(d.getUTCSeconds()), p: () => (h < 12 ? "AM" : "PM"),
    b: () => MONTHS[d.getUTCMonth()].slice(0, 3), M: () => MONTHS[d.getUTCMonth()], a: () => DAYS[d.getUTCDay()].slice(0, 3),
    W: () => DAYS[d.getUTCDay()], w: () => String(d.getUTCDay()),
    j: () => String(Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1).padStart(3, "0"),
    u: () => pad(week(d, 1)), U: () => pad(week(d, 0)), v: () => pad(week(d, 3)),
    x: () => String(isoYear(d)), T: () => `${pad(h)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    "%": () => "%",
  };
  return String(f).replace(/%(.)/g, (_, c: string) => (map[c] ? map[c]() : c));
}

function isoYear(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  return t.getUTCFullYear();
}

function tsDiff(unit: unknown, a: unknown, b: unknown): number | null {
  const x = wall(a), y = wall(b);
  if (!x || !y) return null;
  const u = String(unit).toUpperCase();
  const ms: Record<string, number> = { SECOND: 1e3, MINUTE: 6e4, HOUR: 36e5, DAY: 864e5, WEEK: 6048e5 };
  if (ms[u]) return Math.trunc((y.getTime() - x.getTime()) / ms[u]);
  let months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  const rest = (d: Date) => d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (months > 0 && rest(y) < rest(x)) months--;
  if (months < 0 && rest(y) > rest(x)) months++;
  return u === "YEAR" ? Math.trunc(months / 12) : u === "QUARTER" ? Math.trunc(months / 3) : months;
}

/** MySQL functions the dashboard's queries call, defined on a node:sqlite database. */
export function registerFunctions(db: DatabaseSync): void {
  const fn = (name: string, f: (...a: any[]) => unknown, deterministic = true) => {
    for (const n of new Set([name, name.toLowerCase()])) db.function(n, { deterministic, varargs: true }, f as any);
  };
  fn("NOW", () => istNow(), false);
  fn("CURRENT_TIMESTAMP", () => istNow(), false);
  fn("SYSDATE", () => istNow(), false);
  fn("CURDATE", () => istNow().slice(0, 10), false);
  fn("UTC_TIMESTAMP", () => new Date().toISOString().slice(0, 19).replace("T", " "), false);
  fn("dt_add", dtAdd);
  fn("DATE_FORMAT", dateFormat);
  fn("TIMESTAMPDIFF", tsDiff);
  fn("TIMESTAMPADD", (unit, n, x) => dtAdd(x, n, unit));
  fn("DATEDIFF", (a, b) => { const x = wall(a), y = wall(b); return x && y ? Math.round((Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate())) / 864e5) : null; });
  fn("UNIX_TIMESTAMP", (a?: unknown) => { const d = a === undefined ? null : wall(a); return Math.floor(((d ? d.getTime() - 330 * 60_000 : Date.now())) / 1000); }, false);
  fn("FROM_UNIXTIME", (s) => (s === null ? null : fmtWall(new Date(Number(s) * 1000 + 330 * 60_000))));
  fn("HOUR", (a) => wall(a)?.getUTCHours() ?? null);
  fn("MINUTE", (a) => wall(a)?.getUTCMinutes() ?? null);
  fn("YEAR", (a) => wall(a)?.getUTCFullYear() ?? null);
  fn("MONTH", (a) => (wall(a) ? wall(a)!.getUTCMonth() + 1 : null));
  fn("DAY", (a) => wall(a)?.getUTCDate() ?? null);
  fn("DAYOFMONTH", (a) => wall(a)?.getUTCDate() ?? null);
  fn("DAYOFWEEK", (a) => (wall(a) ? wall(a)!.getUTCDay() + 1 : null));
  fn("WEEKDAY", (a) => (wall(a) ? (wall(a)!.getUTCDay() + 6) % 7 : null));
  fn("DAYNAME", (a) => (wall(a) ? DAYS[wall(a)!.getUTCDay()] : null));
  fn("MONTHNAME", (a) => (wall(a) ? MONTHS[wall(a)!.getUTCMonth()] : null));
  fn("WEEK", (a, m = 0) => (wall(a) ? week(wall(a)!, Number(m)) : null));
  fn("YEARWEEK", (a, m = 0) => { const d = wall(a); if (!d) return null; const w = week(d, Number(m)); return Number(m) % 2 ? isoYear(d) * 100 + w : d.getUTCFullYear() * 100 + w; });
  fn("QUARTER", (a) => (wall(a) ? Math.floor(wall(a)!.getUTCMonth() / 3) + 1 : null));
  fn("TO_DAYS", (a) => (wall(a) ? Math.floor(wall(a)!.getTime() / 864e5) + 719528 : null));
  fn("FIELD", (v, ...list) => { const i = list.findIndex((x) => x !== null && String(x).toLowerCase() === String(v).toLowerCase()); return i + 1; });
  fn("GREATEST", (...a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (x > m ? x : m))));
  fn("LEAST", (...a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (x < m ? x : m))));
  fn("JSON_UNQUOTE", (s) => { if (typeof s !== "string") return s; try { const v = JSON.parse(s); return typeof v === "string" ? v : s; } catch { return s; } });
  fn("JSON_LENGTH", (s) => { try { const v = typeof s === "string" ? JSON.parse(s) : s; return Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 1; } catch { return null; } });
  fn("SUBSTRING_INDEX", (s, delim, count) => {
    if (s === null) return null;
    const parts = String(s).split(String(delim)), c = Number(count);
    return c >= 0 ? parts.slice(0, c).join(String(delim)) : parts.slice(c).join(String(delim));
  });
  fn("LOCATE", (sub, s, pos = 1) => (s === null ? null : String(s).toLowerCase().indexOf(String(sub).toLowerCase(), Number(pos) - 1) + 1));
  fn("FIND_IN_SET", (v, list) => (list === null ? null : String(list).split(",").indexOf(String(v)) + 1));
  fn("LPAD", (s, n, p) => (s === null ? null : String(s).padStart(Number(n), String(p)).slice(0, Number(n))));
  fn("ANY_VALUE", (v) => v);
  fn("LEFT", (s, n) => (s === null || n === null ? null : String(s).slice(0, Math.max(0, Number(n)))));
  fn("RIGHT", (s, n) => (s === null || n === null ? null : Number(n) <= 0 ? "" : String(s).slice(-Number(n))));
}
