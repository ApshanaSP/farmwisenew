/**
 * Live Connectors: a dataset that keeps itself up to date from a site that publishes data every day (Task 6's
 * "connect a source"). A connector is a stored object next to its dataset:
 *
 *   locate    where the new data is: the same table on the page ("same-table"), the newest file whose name matches a
 *             dated pattern ("newest-file-matching": Reservoir_Levels_{DD-MM-YYYY}.xlsx), an API with a date
 *             parameter ("api-date-param": ...?date={YYYY-MM-DD}, the new period only), or one file ("fixed-url")
 *   schedule  hourly / daily / weekly, at a time of day (IST), with a tolerance before data counts as late
 *   mode      replace (the newest table) · append (new rows, de-duplicated by the key) · snapshots (each run kept
 *             with its date, so a "today's status" page becomes history)
 *
 * Health: Healthy · Late (the expected data did not come within the tolerance) · Failing (errors, retried after
 * 15 min, 1 h, then every 3 h) · Paused · Needs review. A run never wipes data:
 *   - new or renamed columns pause the connector with a self-heal proposal (old mapping beside the new) for a person
 *   - a suspicious change (rows fall by more than half, every number zero, values far outside their history) is held
 *     in quarantine: the last good data stays live until a person approves or rejects it
 *
 * The core (runConnector) takes its clock, its reader and its rebuild as arguments, so a week of daily runs can be
 * simulated in a test; connectorRuntime() gives the real ones. Connectors run while District IQ's server runs.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileLinksIn, schemaHash } from "@/lib/studio/connect/discover";
import { dateIn } from "@/lib/studio/connect/series";
import { fetchOnce, LinkError } from "@/lib/studio/fetchurl";
import { parseFileAsync, type Cell, type Table } from "@/lib/studio/parse";
import { editDistance, normKey, parseDate, parseNum } from "@/lib/studio/values";

const DIR = () => path.join(process.env.STUDIO_DIR || path.join(process.cwd(), "data", "studio"), "connectors");
const ID_RE = /^ds_[a-z0-9]{6,24}$/;

export type Health = "healthy" | "late" | "failing" | "paused" | "review";
export type Locate = "same-table" | "newest-file-matching" | "api-date-param" | "fixed-url";
export type Mode = "replace" | "append" | "snapshots";
export type Every = "hourly" | "daily" | "weekly";

export interface ConnRun {
  at: string;
  kind: "new" | "same" | "late" | "error" | "drift" | "quarantine" | "approved" | "rejected" | "backfill" | "watch" | "created" | "paused" | "resumed";
  ok: boolean;
  rowsAdded: number | null;
  rows: number | null;
  note: string;
}

export interface Connector {
  id: string;
  name: string;
  /** the page or file read; for newest-file-matching, the page that lists the files */
  url: string;
  locate: Locate;
  /** the dated file name (newest-file-matching) or the API address with {YYYY-MM-DD} (api-date-param) */
  pattern: string | null;
  schedule: { every: Every; at: string; tolerance: number };
  mode: Mode;
  key: string[];
  retention: number;
  status: Health;
  paused: boolean;
  headers: string[];
  schema: string;
  /** column renames approved in a self-heal (new name -> the name the dataset knows) */
  rename: Record<string, string>;
  /** the dates or periods already read (newest-file-matching, api-date-param) */
  seen: string[];
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastNewAt: string | null;
  nextAt: string;
  fails: number;
  retryAt: string | null;
  lastIn: number;
  rows: number;
  ranges: Record<string, { min: number; max: number }>;
  history: ConnRun[];
  proposal: { at: string; old: string[]; next: string[]; mapping: Record<string, string | null> } | null;
  quarantine: { at: string; why: string; rows: number } | null;
  createdAt: string;
}

export interface Incoming { table: Table; period: string; label: string }

export interface Deps {
  now: () => number;
  /** what is new at the source: the tables not read yet (oldest first), or [] when nothing new */
  read: (c: Connector) => Promise<Incoming[]>;
  /** the dataset rebuilt from the connector's table (the seven agents, the brief) */
  rebuild: (c: Connector, table: Table, note: string) => Promise<void>;
  /** the watches checked after a run ("tell me when storage passes 90%"): those crossed */
  watches?: (c: Connector) => Promise<string[]>;
}

// ----------------------------------------------------------------- storage --

const file = (id: string, ext: string) => { if (!ID_RE.test(id)) throw new Error("Unknown connector."); return path.join(DIR(), `${id}${ext}`); };
function write(p: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}
export function getConnector(id: string): Connector | null { try { return JSON.parse(fs.readFileSync(file(id, ".json"), "utf8")); } catch { return null; } }
export function saveConnector(c: Connector) { write(file(c.id, ".json"), JSON.stringify(c)); }
export function listConnectors(): Connector[] {
  try { return fs.readdirSync(DIR()).filter((f) => /^ds_[a-z0-9]+\.json$/.test(f)).map((f) => getConnector(f.slice(0, -5))).filter((c): c is Connector => !!c); } catch { return []; }
}
export function deleteConnector(id: string) { for (const e of [".json", ".table.json.gz", ".held.json.gz"]) fs.rmSync(file(id, e), { force: true }); }
/** The connector's own table (all it has gathered: the appended rows, the snapshots). */
export function getTable(id: string): Table | null { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(file(id, ".table.json.gz"))).toString("utf8")); } catch { return null; } }
function saveTable(id: string, t: Table) { write(file(id, ".table.json.gz"), zlib.gzipSync(JSON.stringify(t))); }
function getHeld(id: string): Incoming[] { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(file(id, ".held.json.gz"))).toString("utf8")); } catch { return []; } }
function saveHeld(id: string, x: Incoming[] | null) { if (!x) fs.rmSync(file(id, ".held.json.gz"), { force: true }); else write(file(id, ".held.json.gz"), zlib.gzipSync(JSON.stringify(x))); }

// ---------------------------------------------------------------- schedule --

const IST = 5.5 * 3600_000;
const PERIOD: Record<Every, number> = { hourly: 3600_000, daily: 864e5, weekly: 7 * 864e5 };
const RETRY = [15 * 60_000, 3600_000, 3 * 3600_000];

/** The next scheduled slot after `after`: hourly at the minute of `at`, daily at `at` IST, weekly on the same weekday. */
export function nextSlot(s: Connector["schedule"], after: number): number {
  const [hh, mm] = s.at.split(":").map(Number);
  if (s.every === "hourly") {
    const d = new Date(after + IST);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), mm || 0) - IST;
    while (t <= after) t += 3600_000;
    return t;
  }
  const d = new Date(after + IST);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh || 0, mm || 0) - IST;
  while (t <= after) t += 864e5;
  if (s.every === "weekly") while (t - after > 7 * 864e5) t -= 7 * 864e5;
  return t;
}

/**
 * Whether a connector should run now. A server that was off for three days runs a missed connector once, not three
 * times: the next slot is always counted from the run that just happened.
 */
export function isDue(c: Connector, now: number): boolean {
  if (c.paused || c.proposal || c.quarantine) return false;
  if (c.retryAt) return now >= Date.parse(c.retryAt);
  return now >= Date.parse(c.nextAt);
}

/** Late: nothing new for longer than one period and the tolerance (counted from the last new data). */
export function lateNow(c: Connector, now: number): boolean {
  const since = Date.parse(c.lastNewAt ?? c.createdAt);
  return now - since > PERIOD[c.schedule.every] + c.schedule.tolerance * 60_000;
}

// ------------------------------------------------------------------- tables --

const DATEISH = /date|day|as on|period|week|month|year|தேதி/i;
const colIndex = (t: Table, name: string) => t.headers.findIndex((h) => h === name);

/** The columns that name one row: a date column and the first text column (e.g. Date + Reservoir). */
export function guessKey(t: Table): string[] {
  const date = t.headers.find((h) => DATEISH.test(h));
  const text = t.headers.find((h, i) => h !== date && t.rows.slice(0, 50).some((r) => typeof r[i] === "string" && parseNum(r[i]) == null && !parseDate(r[i])));
  return [date, text].filter((x): x is string => !!x);
}

/** Similar names: the proposal's guess for a renamed column. */
function closest(name: string, among: string[]): string | null {
  const n = normKey(name);
  let best: string | null = null, bd = Infinity;
  for (const o of among) {
    const k = normKey(o);
    const d = k.includes(n) || n.includes(k) ? 0 : editDistance(n, k, 8);
    if (d < bd) { bd = d; best = o; }
  }
  return best && bd <= Math.max(3, n.length * 0.5) ? best : null;
}

const renamed = (t: Table, rename: Record<string, string>): Table => ({ ...t, headers: t.headers.map((h) => rename[h] ?? h) });

/** Numbers by column (min, max of the column's median per run), to see a value far outside its history. */
function medians(t: Table): Record<string, number> {
  const out: Record<string, number> = {};
  t.headers.forEach((h, i) => {
    const xs = t.rows.map((r) => (typeof r[i] === "number" ? r[i] as number : parseNum(r[i]))).filter((x): x is number => x != null).sort((a, b) => a - b);
    if (xs.length >= Math.max(1, t.rows.length * 0.6)) out[h] = xs[Math.floor(xs.length / 2)];
  });
  return out;
}

/** Why an incoming table should be held for a person's eye, or null when it looks like the data it replaces. */
export function suspicious(c: Connector, t: Table): string | null {
  if (c.lastIn >= 4 && t.rows.length < c.lastIn * 0.5) return `Rows fell from ${c.lastIn.toLocaleString("en-IN")} to ${t.rows.length.toLocaleString("en-IN")} (more than half gone).`;
  const nums = t.rows.flatMap((r) => r.filter((x) => typeof x === "number") as number[]);
  if (nums.length >= 4 && nums.every((x) => x === 0) && Object.values(c.ranges).some((r) => r.max > 0)) return "Every number is zero.";
  const med = medians(t);
  for (const [h, m] of Object.entries(med)) {
    const r = c.ranges[h];
    if (!r || DATEISH.test(h)) continue;
    const span = Math.max(Math.abs(r.max), Math.abs(r.min), 1);
    if (m > r.max + span * 9 || (r.min >= 0 && m < 0)) return `"${h}" is far outside its history (now ${m.toLocaleString("en-IN")}, before ${r.min.toLocaleString("en-IN")} to ${r.max.toLocaleString("en-IN")}).`;
  }
  return null;
}

/** The connector's table after one more incoming table, by its mode. */
export function applyMode(c: Connector, prev: Table | null, inc: Incoming, today: string): Table {
  const t = inc.table;
  if (c.mode === "replace" || !prev) {
    if (c.mode === "snapshots") return { ...t, headers: [...t.headers, "Snapshot date"], rows: t.rows.map((r) => [...r, inc.period || today]) };
    return t;
  }
  if (c.mode === "snapshots") {
    const day = inc.period || today;
    const si = colIndex(prev, "Snapshot date");
    const kept = prev.rows.filter((r) => r[si] !== day);
    return { ...prev, rows: [...kept, ...t.rows.map((r) => [...r, day])] };
  }
  // append: rows whose key is already there are not added again (a re-published file, an overlapping API answer)
  const keyIdx = (tt: Table) => (c.key.length ? c.key.map((k) => colIndex(tt, k)) : tt.headers.map((_, i) => i));
  const pk = keyIdx(prev), nk = keyIdx(t);
  const sig = (r: Cell[], ix: number[]) => ix.map((i) => String(r[i] ?? "").trim().toLowerCase()).join("\u0001");
  const have = new Set(prev.rows.map((r) => sig(r, pk)));
  const order = prev.headers.map((h) => colIndex(t, h));
  const add = t.rows.filter((r) => !have.has(sig(r, nk))).map((r) => order.map((i) => (i >= 0 ? r[i] : null)));
  return { ...prev, rows: [...prev.rows, ...add] };
}

/** Rows older than the retention window left out (by the key's date column, or the snapshot date). */
export function retain(c: Connector, t: Table, now: number): Table {
  if (!c.retention || c.mode === "replace") return t;
  const col = c.mode === "snapshots" ? colIndex(t, "Snapshot date") : t.headers.findIndex((h) => c.key.includes(h) && DATEISH.test(h));
  if (col < 0) return t;
  const cut = new Date(now + IST - c.retention * 864e5).toISOString().slice(0, 10);
  return { ...t, rows: t.rows.filter((r) => { const d = parseDate(r[col]); return !d || d.slice(0, 10) >= cut; }) };
}

const iso = (ms: number) => new Date(ms).toISOString();
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);

function record(c: Connector, run: ConnRun) { c.history = [run, ...c.history].slice(0, 120); return run; }

function setRanges(c: Connector, t: Table) {
  for (const [h, m] of Object.entries(medians(t))) {
    const r = c.ranges[h];
    c.ranges[h] = r ? { min: Math.min(r.min, m), max: Math.max(r.max, m) } : { min: m, max: m };
  }
}

// ----------------------------------------------------------------------- run --

/** One run: read what is new, check it, apply it by the mode, rebuild the dataset; health and history updated. */
export async function runConnector(id: string, deps: Deps, opts: { manual?: boolean } = {}): Promise<ConnRun> {
  const c = getConnector(id);
  if (!c) throw new Error("Unknown connector.");
  const now = deps.now();
  c.lastRunAt = iso(now);
  c.nextAt = iso(nextSlot(c.schedule, now));
  let incoming: Incoming[];
  try {
    incoming = await deps.read(c);
  } catch (e) {
    c.fails++;
    c.retryAt = iso(now + RETRY[Math.min(c.fails - 1, RETRY.length - 1)]);
    c.status = "failing";
    const run = record(c, { at: iso(now), kind: "error", ok: false, rowsAdded: null, rows: c.rows,
      note: `${(e as Error).message.slice(0, 160)} Next try ${new Date(Date.parse(c.retryAt) + IST).toISOString().slice(11, 16)} IST; the last good data stays.` });
    saveConnector(c);
    return run;
  }
  c.fails = 0;
  c.retryAt = null;
  if (!incoming.length) {
    const late = lateNow(c, now);
    c.status = late ? "late" : "healthy";
    // while late, look again in an hour (not only at the next day's slot)
    if (late) c.nextAt = iso(Math.min(Date.parse(c.nextAt), now + 3600_000));
    const run = record(c, { at: iso(now), kind: late ? "late" : "same", ok: true, rowsAdded: 0, rows: c.rows, note: late ? `Expected new data by now (every ${c.schedule.every === "daily" ? "day" : c.schedule.every === "hourly" ? "hour" : "week"}, ${c.schedule.tolerance} min grace): nothing new yet.` : "Nothing new since the last run." });
    saveConnector(c);
    return run;
  }
  const result = await apply(c, incoming, deps, now, opts.manual ? "Run by hand" : "");
  saveConnector(c);
  return result;
}

/** Incoming tables checked (drift, quarantine) and applied; shared by runs, approvals and backfills. */
async function apply(c: Connector, incoming: Incoming[], deps: Deps, now: number, why: string, force = false): Promise<ConnRun> {
  let table = getTable(c.id);
  const before = table?.rows.length ?? 0;
  let added = 0;
  const labels: string[] = [];
  for (let k = 0; k < incoming.length; k++) {
    const inc = { ...incoming[k], table: renamed(incoming[k].table, c.rename) };
    // columns that changed: paused, with a proposal (old mapping beside the new)
    if (schemaHash(inc.table.headers) !== c.schema && !force) {
      const next = inc.table.headers;
      const mapping: Record<string, string | null> = {};
      for (const h of next) mapping[h] = c.headers.includes(h) ? h : closest(h, c.headers.filter((o) => !next.includes(o)));
      c.proposal = { at: iso(now), old: c.headers, next, mapping };
      c.status = "review";
      saveHeld(c.id, incoming.slice(k));
      return record(c, { at: iso(now), kind: "drift", ok: false, rowsAdded: added, rows: table?.rows.length ?? c.rows,
        note: `The columns changed in ${inc.label} (${next.filter((h) => !c.headers.includes(h)).join(", ") || "order"}): paused until the new mapping is approved. The data stays as it was.` });
    }
    const odd = force ? null : suspicious(c, inc.table);
    if (odd) {
      c.quarantine = { at: iso(now), why: odd, rows: inc.table.rows.length };
      c.status = "review";
      saveHeld(c.id, incoming.slice(k));
      return record(c, { at: iso(now), kind: "quarantine", ok: false, rowsAdded: added, rows: table?.rows.length ?? c.rows,
        note: `${odd} Held in quarantine: the last good data stays live until it is approved or rejected.` });
    }
    const was = table?.rows.length ?? 0;
    table = retain(c, applyMode(c, table, inc, istDay(now)), now);
    added += Math.max(0, table.rows.length - was) || (c.mode === "replace" ? inc.table.rows.length : 0);
    c.lastIn = inc.table.rows.length;
    setRanges(c, inc.table);
    if (inc.period && !c.seen.includes(inc.period)) c.seen = [...c.seen, inc.period].sort().slice(-400);
    labels.push(inc.label);
  }
  if (!table) throw new Error("Nothing to apply.");
  saveTable(c.id, table);
  saveHeld(c.id, null);
  c.rows = table.rows.length;
  c.lastOkAt = c.lastNewAt = iso(now);
  c.status = "healthy";
  const note = `${why ? `${why}: ` : ""}${labels.length === 1 ? labels[0] : `${labels.length} new: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? "…" : ""}`} · ${c.mode === "replace" ? `${table.rows.length.toLocaleString("en-IN")} rows` : `+${(table.rows.length - before).toLocaleString("en-IN")} rows`}`;
  await deps.rebuild(c, table, note);
  const run = record(c, { at: iso(now), kind: "new", ok: true, rowsAdded: c.mode === "replace" ? table.rows.length - before : table.rows.length - before, rows: table.rows.length, note });
  for (const w of (await deps.watches?.(c).catch(() => [])) ?? []) record(c, { at: iso(now), kind: "watch", ok: true, rowsAdded: null, rows: table.rows.length, note: w });
  void added;
  return run;
}

/** A person's answer to a self-heal proposal: the new columns mapped to the old names (or kept as new). */
export async function approveProposal(id: string, deps: Deps, keepNew = false): Promise<ConnRun> {
  const c = getConnector(id);
  if (!c?.proposal) throw new Error("No proposal is waiting.");
  const now = deps.now();
  const p = c.proposal;
  if (keepNew) { c.headers = p.next; c.schema = schemaHash(p.next); }
  else for (const [n, o] of Object.entries(p.mapping)) if (o && o !== n) c.rename[n] = o;
  c.proposal = null;
  record(c, { at: iso(now), kind: "approved", ok: true, rowsAdded: null, rows: c.rows, note: keepNew ? "New columns accepted as they are." : `Mapping approved: ${Object.entries(p.mapping).filter(([n, o]) => o && o !== n).map(([n, o]) => `${n} → ${o}`).join(", ") || "no change"}.` });
  const held = getHeld(id);
  const run = held.length ? await apply(c, held, deps, now, "After approval") : record(c, { at: iso(now), kind: "resumed", ok: true, rowsAdded: 0, rows: c.rows, note: "Resumed." });
  if (c.status !== "review") c.status = "healthy";
  saveConnector(c);
  return run;
}

/** A person's answer to a quarantine: apply the held data, or drop it (the last good data stays). */
export async function judgeQuarantine(id: string, deps: Deps, approve: boolean): Promise<ConnRun> {
  const c = getConnector(id);
  if (!c?.quarantine) throw new Error("Nothing is in quarantine.");
  const now = deps.now();
  const q = c.quarantine;
  c.quarantine = null;
  let run: ConnRun;
  if (approve) {
    record(c, { at: iso(now), kind: "approved", ok: true, rowsAdded: null, rows: c.rows, note: `Quarantined data approved: ${q.why}` });
    run = await apply(c, getHeld(id), deps, now, "Approved after quarantine", true);
  } else {
    saveHeld(id, null);
    // the rejected period is not asked for again
    run = record(c, { at: iso(now), kind: "rejected", ok: true, rowsAdded: 0, rows: c.rows, note: `Quarantined data rejected: ${q.why} The last good data stays.` });
    c.status = "healthy";
  }
  saveConnector(c);
  return run;
}

export function setPaused(id: string, paused: boolean, now = Date.now()) {
  const c = getConnector(id);
  if (!c) throw new Error("Unknown connector.");
  c.paused = paused;
  c.status = paused ? "paused" : c.proposal || c.quarantine ? "review" : "healthy";
  if (!paused) { c.nextAt = iso(Math.min(Date.parse(c.nextAt), now)); c.retryAt = null; }
  record(c, { at: iso(now), kind: paused ? "paused" : "resumed", ok: true, rowsAdded: null, rows: c.rows, note: paused ? "Paused by hand." : "Resumed by hand." });
  saveConnector(c);
}

export function setSchedule(id: string, s: Partial<Connector["schedule"]> & { mode?: Mode; retention?: number; key?: string[] }, now = Date.now()) {
  const c = getConnector(id);
  if (!c) throw new Error("Unknown connector.");
  c.schedule = { ...c.schedule, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => ["every", "at", "tolerance"].includes(k) && v != null)) } as Connector["schedule"];
  if (s.mode) c.mode = s.mode;
  if (s.retention != null) c.retention = s.retention;
  if (s.key) c.key = s.key;
  c.nextAt = iso(nextSlot(c.schedule, now));
  saveConnector(c);
}

/** A new connector for a dataset, from its first table. */
export function createConnector(p: { id: string; name: string; url: string; locate: Locate; pattern: string | null; table: Table; every?: Every; at?: string; tolerance?: number; mode?: Mode; key?: string[]; retention?: number; seen?: string[] }, now = Date.now()): Connector {
  const schedule = { every: p.every ?? "daily", at: p.at ?? "07:30", tolerance: p.tolerance ?? 120 };
  const c: Connector = {
    id: p.id, name: p.name, url: p.url, locate: p.locate, pattern: p.pattern, schedule, mode: p.mode ?? (p.locate === "newest-file-matching" || p.locate === "api-date-param" ? "append" : "replace"),
    key: p.key ?? guessKey(p.table), retention: p.retention ?? 400, status: "healthy", paused: false, headers: p.table.headers, schema: schemaHash(p.table.headers), rename: {},
    seen: p.seen ?? [], lastRunAt: null, lastOkAt: iso(now), lastNewAt: iso(now), nextAt: iso(nextSlot(schedule, now)), fails: 0, retryAt: null, lastIn: p.table.rows.length, rows: p.table.rows.length,
    ranges: {}, history: [], proposal: null, quarantine: null, createdAt: iso(now)
  };
  setRanges(c, p.table);
  record(c, { at: iso(now), kind: "created", ok: true, rowsAdded: p.table.rows.length, rows: p.table.rows.length, note: `Keeping it updated ${schedule.every} at ${schedule.at} IST (${c.mode}).` });
  saveConnector(c);
  saveTable(c.id, c.mode === "snapshots" ? applyMode(c, null, { table: p.table, period: istDay(now), label: "first" }, istDay(now)) : p.table);
  return c;
}

// ------------------------------------------------------------------ reading --

const TOKEN: Record<string, { re: string; parse: (m: string) => string | null }> = {
  "{DD-MM-YYYY}": { re: "(\\d{2}[-_.]\\d{2}[-_.]\\d{4})", parse: (m) => { const [d, mo, y] = m.split(/[-_.]/); return `${y}-${mo}-${d}`; } },
  "{YYYY-MM-DD}": { re: "(\\d{4}[-_.]\\d{2}[-_.]\\d{2})", parse: (m) => m.replace(/[_.]/g, "-") },
  "{YYYYMMDD}": { re: "(\\d{8})", parse: (m) => `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6)}` },
  "{D-Mon-YYYY}": { re: "(\\d{1,2}[-_ ]?[A-Za-z]{3,9}[-_ ]?\\d{4})", parse: (m) => dateIn(m)?.date ?? null },
  "{Mon-YYYY}": { re: "([A-Za-z]{3,9}[-_ ]?\\d{4})", parse: (m) => dateIn(m)?.date ?? null }
};

/** A file-name pattern ("Reservoir_Levels_{DD-MM-YYYY}.xlsx") as a matcher that gives the file's date. */
export function patternMatcher(pattern: string): (name: string) => string | null {
  const tok = Object.keys(TOKEN).find((t) => pattern.includes(t));
  if (!tok) return () => null;
  const [a, b] = pattern.split(tok);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc(a)}${TOKEN[tok].re}${esc(b)}$`, "i");
  return (name) => { const m = name.match(re); return m ? TOKEN[tok].parse(m[1]) : null; };
}

/** The real reader: the source's new tables, through the same guards as every other read. */
export async function readSource(c: Connector, auth: Parameters<typeof import("@/lib/studio/connect/resolve").readLink>[1] = { mode: "none" }, opts: { now?: number; backfillDays?: number } = {}): Promise<Incoming[]> {
  const now = opts.now ?? Date.now();
  const today = istDay(now);
  if (c.locate === "newest-file-matching" && c.pattern) {
    const match = patternMatcher(c.pattern);
    const page = await fetchOnce(c.url, null, "text/html", 20_000);
    const links = fileLinksIn(page.buf.toString("utf8"), page.url).map((l) => {
      const name = decodeURIComponent(new URL(l.url).pathname.split("/").pop() ?? "");
      return { url: l.url, name, date: match(name) };
    }).filter((l): l is { url: string; name: string; date: string } => !!l.date && l.date <= today);
    const floor = opts.backfillDays ? new Date(now + IST - opts.backfillDays * 864e5).toISOString().slice(0, 10) : (c.seen[0] ?? "0000");
    const fresh = links.filter((l) => !c.seen.includes(l.date) && l.date >= floor).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    const out: Incoming[] = [];
    for (const l of fresh) {
      const f = await fetchOnce(l.url, null, undefined, 20_000);
      out.push({ table: await parseFileAsync(f.buf, f.name, f.contentType, f.url), period: l.date, label: l.name });
    }
    return out;
  }
  if (c.locate === "api-date-param" && c.pattern) {
    // the periods not read yet, from the day after the last one to today (at most 30 a run)
    const last = c.seen[c.seen.length - 1] ?? today;
    const days: string[] = [];
    for (let d = new Date(`${last}T00:00:00Z`).getTime() + 864e5; istDay(d - IST) <= today && days.length < 30; d += 864e5) days.push(new Date(d).toISOString().slice(0, 10));
    const out: Incoming[] = [];
    for (const day of days) {
      try {
        const f = await fetchOnce(c.pattern.replace("{YYYY-MM-DD}", day), null, "application/json", 20_000);
        const t = await parseFileAsync(f.buf, `${day}.json`, f.contentType, f.url);
        if (t.rows.length) out.push({ table: t, period: day, label: `the ${day} period` });
      } catch (e) {
        // a period not published yet ends the run quietly; any other failure is an error
        if (e instanceof LinkError && (e.code === "missing" || e.code === "empty")) break;
        throw e;
      }
    }
    return out;
  }
  // same-table / fixed-url: the table again; new only when its content changed
  const { readLink } = await import("@/lib/studio/connect/resolve");
  const { choose, tableHash } = await import("@/lib/studio/connect/discover");
  const got = await readLink(c.url, auth, { log: () => {} });
  const prev = getTable(c.id);
  const chosen = choose(got.found, { choice: "x", candidates: [{ id: "x", kind: got.found[0]?.cand.kind ?? "file", label: "", rows: 0, cols: c.headers.length, headers: c.headers, score: 0, why: "", schema: c.schema }] });
  if (prev && c.mode === "replace" && tableHash(chosen.table) === tableHash(prev)) return [];
  return [{ table: chosen.table, period: today, label: chosen.cand.label }];
}
