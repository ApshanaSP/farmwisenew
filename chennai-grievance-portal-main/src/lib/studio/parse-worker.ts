/**
 * What the Data Studio's file reader does in its own process (QA pass 7): every file and every fetched page is read here, never on the
 * web server's thread. parse-pool.ts starts the processes, gives each a time and a memory limit and stops one that passes either, so no
 * file, however it is built, can hold the server: an Excel whose deflate stream never ends (SheetJS's own inflate loops for ever), a
 * pattern that backtracks on a crafted feed or page, a ZIP or PDF that unpacks to gigabytes.
 *
 * The process runs scripts/studio-parse-worker.mjs: this file and parse-worker-main.ts bundled with the parse code they import
 * (node scripts/build-parse-worker.mjs; tests/qa/pass7/studio-parse/bundle.test.ts fails while the bundle is older than the code).
 * work() is a plain function, so the unit tests also call it on their own thread.
 */
import { MAX_COLS, MAX_ROWS, NeedsOcr, ParseError, UserError, feedLinkIn, headlinesIn, htmlTables, parseAll, shape, type Cell, type Table } from "@/lib/studio/parse";
import { pdfImages } from "@/lib/studio/ocr";
import { fileLinksIn, nextPageLink, pageFacts, scriptJsonUrls, type PageFacts } from "@/lib/studio/connect/links";
import { applyMapping, extractRecords, feedLink, legacyItems, loginForm, pageTitle, passwordField, type FetchKind, type LegacyItem, type MappedItem, type Rec, type StoredMapping } from "@/lib/collector/sourcemap";

/** A file to read: every table in it (or, `main`, only the largest); `ocr`: a picture or a scan comes back as images to read with OCR. */
export interface FileJob { op: "file"; buf: Uint8Array; name: string; contentType: string; base: string; ocr: boolean; main: boolean }
/** A fetched web page: its tables (shaped), its feed, headlines, data files, the JSON its scripts load and its next page. */
export interface PageJob { op: "page"; html: string; url: string }
/** A fetched page's facts (pageFacts in links.ts): its title, and whether it is an article, a sign-in, a CAPTCHA wall, a JavaScript app. */
export interface FactsJob { op: "facts"; html: string }
/**
 * A Collector source's fetched page or feed, read as source onboarding (collector/onboard.ts) and every scheduled run (collector/sources.ts)
 * need it: its title, the feed it announces, a password field in its first `password` characters, its sign-in form, its records, or its
 * items (records through the stored mapping, or the legacy readers). Every one of these patterns searched to the end of the page from
 * every unclosed tag on the server's thread (p7-studio-parse-12).
 */
export interface CollectorWant { title?: boolean; feed?: boolean; password?: number; form?: boolean; records?: { kind: FetchKind; path: string | null }; items?: { kind: string; stored: StoredMapping | null } }
export interface CollectorRead { title?: string | null; feed?: string | null; password?: boolean; form?: ReturnType<typeof loginForm>; records?: { records: Rec[]; path: string | null }; items?: (MappedItem | LegacyItem)[] }
export interface CollectorJob { op: "collector"; text: string; url: string; want: CollectorWant }
export type Job = FileJob | PageJob | FactsJob | CollectorJob;

export interface Page {
  /** the page's tables, largest first (null: a grid that is not a table) */
  tables: (Table | null)[];
  feed: string | null;
  headlines: Cell[][];
  files: { url: string; text: string }[];
  scripts: string[];
  next: string | null;
}
export type Reply =
  | { tables: Table[] }
  | { ocr: { kind: "image" | "scan"; images: Uint8Array[]; skipped: number } }
  | { page: Page }
  | { facts: PageFacts }
  | { collector: CollectorRead }
  | { error: { type: "parse" | "user" | "other"; message: string } };

/** What the reader process writes before its watchdog ends it (parse-worker-main.ts): parse-pool.ts reads it to say the file needed too much memory. */
export const MEMORY_MARK = "studio-parse: memory limit";

/** The most cells one file sends back to the server: two tables at the row and column limits (a ZIP of small CSVs built 30 million). */
export const MAX_CELLS = 2 * MAX_ROWS * MAX_COLS;

const size = (t: Table) => t.rows.length * t.headers.length;

/** Tables past the cell budget are left out, and the first table says so. */
export function budget(tables: Table[]): Table[] {
  let cells = 0;
  const kept: Table[] = [];
  for (const t of tables) {
    if (kept.length && cells + size(t) > MAX_CELLS) break;
    kept.push(t);
    cells += size(t);
  }
  const left = tables.length - kept.length;
  if (!left) return tables;
  const note = `${left} more ${left === 1 ? "table" : "tables"} in this file ${left === 1 ? "was" : "were"} not read: one file may bring in at most ${(MAX_CELLS / 1e6).toLocaleString("en-IN")} million cells.`;
  kept[0] = { ...kept[0], notes: [...(kept[0].notes ?? []), note] };
  return kept;
}

function readFile(job: FileJob): Reply {
  const buf = Buffer.from(job.buf.buffer, job.buf.byteOffset, job.buf.byteLength);
  try {
    const all = parseAll(buf, job.name, job.contentType, job.base);
    // the largest table is the main one (parseFile's rule)
    if (job.main) return { tables: [all.length === 1 ? all[0] : [...all].sort((a, b) => size(b) - size(a))[0]] };
    return { tables: budget(all) };
  } catch (e) {
    if (e instanceof NeedsOcr && job.ocr) {
      // a picture is read as it is (the server already holds it); a scan's page images are taken out here, where a crafted PDF cannot hold the server
      if (e.kind === "image") return { ocr: { kind: "image", images: [], skipped: 0 } };
      const pages = pdfImages(buf);
      return { ocr: { kind: "scan", images: pages.images.map((b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength)), skipped: pages.skipped } };
    }
    return fail(e);
  }
}

/** The tables one page reply holds at most. */
export const PAGE_TABLES = 24;

/** One part of a page's reading: a part that throws (a link the URL parser refuses) is left empty, not the whole page. */
function part<T>(f: () => T, none: T): T {
  try { return f(); } catch { return none; }
}

function readPage(job: PageJob): Reply {
  const { html, url } = job;
  // the first PAGE_TABLES tables (discover uses 12, paginate looks for its own among them), within the file budget of cells: a page of
  // 154 000 tiny tables, or of colspan tables twice MAX_CELLS, filled the server (QA pass 7 reviewer)
  let cells = 0;
  const tables = part(() => htmlTables(html), []).slice(0, PAGE_TABLES).map((g): Table | null => {
    const t = part(() => ({ ...shape(g as Cell[][]), sheet: null, sheets: [], format: "html" as const, caption: null }), null);
    if (!t || cells + size(t) > MAX_CELLS) return null;
    cells += size(t);
    return t;
  });
  return { page: { tables, feed: part(() => feedLinkIn(html, url), null), headlines: part(() => headlinesIn(html, url), []), files: part(() => fileLinksIn(html, url), []),
    scripts: part(() => scriptJsonUrls(html, url), []), next: part(() => nextPageLink(html, url), null) } };
}

function fail(e: unknown): Reply {
  const message = String((e as Error)?.message ?? e);
  if (e instanceof UserError) return { error: { type: "user", message } };
  if (e instanceof ParseError) return { error: { type: "parse", message } };
  return { error: { type: "other", message } };
}

function collectorRead({ text, url, want }: CollectorJob): CollectorRead {
  const out: CollectorRead = {};
  if (want.title) out.title = pageTitle(text);
  if (want.feed) out.feed = feedLink(text, url);
  if (want.password) out.password = passwordField(text, want.password);
  if (want.form) out.form = loginForm(text, url);
  if (want.records) out.records = extractRecords(want.records.kind, text, url, want.records.path);
  if (want.items) {
    const { kind, stored } = want.items;
    out.items = stored
      ? extractRecords(kind as FetchKind, text, url, stored.recordPath).records.map((r) => applyMapping(r, stored.map)).filter((x): x is MappedItem => !!x)
      : legacyItems(kind, text, url);
  }
  return out;
}

export function work(job: Job): Reply {
  if (job.op === "collector") { try { return { collector: collectorRead(job) }; } catch (e) { return fail(e); } }
  if (job.op === "facts") { try { return { facts: pageFacts(job.html) }; } catch (e) { return fail(e); } }
  return job.op === "page" ? readPage(job) : readFile(job);
}

// ----------------------------------------------------------- the wire --

/**
 * Tables as they cross from the reader to the server: each distinct text once for the whole reply, every cell an index into it (or -1 a
 * number, -2 empty), the numbers in a typed array. Sent as plain arrays, a text was copied once per cell that held it: a 1.3 MB workbook
 * of one shared 800-character string in 500 000 cells became 392 MB on the server, where reading it on the server's thread cost 4 MB;
 * packed one table at a time, 80 sheets sharing one 1.5 MB string still sent it 80 times, 114 MB (QA pass 7 reviewers). Rebuilt, the
 * server holds each text once, as SheetJS itself did.
 */
export interface PackedTable { meta: Omit<Table, "rows">; kind: Int32Array; nums: Float64Array; widths: Int32Array }

/** The distinct texts of one reply. */
export class Texts {
  list: string[] = [];
  private seen = new Map<string, number>();
  id(s: string): number {
    let k = this.seen.get(s);
    if (k === undefined) { k = this.list.length; this.list.push(s); this.seen.set(s, k); }
    return k;
  }
}

export function packTable(t: Table, texts: Texts): PackedTable {
  const { rows, ...meta } = t;
  const widths = new Int32Array(rows.length);
  let n = 0;
  for (let r = 0; r < rows.length; r++) { widths[r] = rows[r]?.length ?? 0; n += widths[r]; }
  const kind = new Int32Array(n), nums = new Float64Array(n);
  let i = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < widths[r]; c++, i++) {
      const v = row[c];
      if (v == null) kind[i] = -2;
      else if (typeof v === "number") { kind[i] = -1; nums[i] = v; }
      else kind[i] = texts.id(v);
    }
  }
  return { meta, kind, nums, widths };
}

export function unpackTable(p: PackedTable, texts: string[]): Table {
  const rows: Cell[][] = new Array(p.widths.length);
  let i = 0;
  for (let r = 0; r < p.widths.length; r++) {
    const row: Cell[] = new Array(p.widths[r]);
    for (let c = 0; c < row.length; c++, i++) { const k = p.kind[i]; row[c] = k >= 0 ? texts[k] : k === -1 ? p.nums[i] : null; }
    rows[r] = row;
  }
  return { ...p.meta, rows } as Table;
}

/** A reply as sent: its tables packed, with the texts they share. */
export type WireReply = Exclude<Reply, { tables: Table[] } | { page: Page }>
  | { packed: { texts: string[]; tables: PackedTable[] } }
  | { page: Omit<Page, "tables"> & { texts: string[]; packed: (PackedTable | null)[] } };

export function toWire(r: Reply): WireReply {
  const texts = new Texts();
  if ("tables" in r) { const tables = r.tables.map((t) => packTable(t, texts)); return { packed: { texts: texts.list, tables } }; }
  if ("page" in r) { const { tables, ...rest } = r.page; const packed = tables.map((t) => (t ? packTable(t, texts) : null)); return { page: { ...rest, texts: texts.list, packed } }; }
  return r;
}

export function fromWire(w: WireReply): Reply {
  if ("packed" in w) return { tables: w.packed.tables.map((t) => unpackTable(t, w.packed.texts)) };
  if ("page" in w) { const { packed, texts, ...rest } = w.page; return { page: { ...rest, tables: packed.map((t) => (t ? unpackTable(t, texts) : null)) } }; }
  return w;
}
