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

/** A file to read: every table in it (or, `main`, only the largest); `ocr`: a picture or a scan comes back as images to read with OCR. */
export interface FileJob { op: "file"; buf: Uint8Array; name: string; contentType: string; base: string; ocr: boolean; main: boolean }
/** A fetched web page: its tables (shaped), its feed, headlines, data files, the JSON its scripts load and its next page. */
export interface PageJob { op: "page"; html: string; url: string }
/** A fetched page's facts (pageFacts in links.ts): its title, and whether it is an article, a sign-in, a CAPTCHA wall, a JavaScript app. */
export interface FactsJob { op: "facts"; html: string }
export type Job = FileJob | PageJob | FactsJob;

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

/** One part of a page's reading: a part that throws (a link the URL parser refuses) is left empty, not the whole page. */
function part<T>(f: () => T, none: T): T {
  try { return f(); } catch { return none; }
}

function readPage(job: PageJob): Reply {
  const { html, url } = job;
  const tables = part(() => htmlTables(html), []).map((g): Table | null =>
    part(() => ({ ...shape(g as Cell[][]), sheet: null, sheets: [], format: "html" as const, caption: null }), null));
  return { page: { tables, feed: part(() => feedLinkIn(html, url), null), headlines: part(() => headlinesIn(html, url), []), files: part(() => fileLinksIn(html, url), []),
    scripts: part(() => scriptJsonUrls(html, url), []), next: part(() => nextPageLink(html, url), null) } };
}

function fail(e: unknown): Reply {
  const message = String((e as Error)?.message ?? e);
  if (e instanceof UserError) return { error: { type: "user", message } };
  if (e instanceof ParseError) return { error: { type: "parse", message } };
  return { error: { type: "other", message } };
}

export function work(job: Job): Reply {
  if (job.op === "facts") { try { return { facts: pageFacts(job.html) }; } catch (e) { return fail(e); } }
  return job.op === "page" ? readPage(job) : readFile(job);
}

// ----------------------------------------------------------- the wire --

/**
 * A table as it crosses from the reader to the server: each distinct text once, every cell an index (or -1 a number, -2 empty), the
 * numbers in a typed array. Sent as plain arrays, a text was copied once per cell that held it: a 1.3 MB workbook of one shared
 * 800-character string in 500 000 cells became 392 MB on the server, where reading it on the server's thread had cost 4 MB (QA pass 7
 * reviewer). Rebuilt, the server holds each text once, as SheetJS itself did.
 */
export interface PackedTable { meta: Omit<Table, "rows">; strings: string[]; kind: Int32Array; nums: Float64Array; widths: Int32Array }

export function packTable(t: Table): PackedTable {
  const { rows, ...meta } = t;
  const widths = new Int32Array(rows.length);
  let n = 0;
  for (let r = 0; r < rows.length; r++) { widths[r] = rows[r]?.length ?? 0; n += widths[r]; }
  const kind = new Int32Array(n), nums = new Float64Array(n);
  const strings: string[] = [];
  const seen = new Map<string, number>();
  let i = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < widths[r]; c++, i++) {
      const v = row[c];
      if (v == null) kind[i] = -2;
      else if (typeof v === "number") { kind[i] = -1; nums[i] = v; }
      else {
        let k = seen.get(v);
        if (k === undefined) { k = strings.length; strings.push(v); seen.set(v, k); }
        kind[i] = k;
      }
    }
  }
  return { meta, strings, kind, nums, widths };
}

export function unpackTable(p: PackedTable): Table {
  const rows: Cell[][] = new Array(p.widths.length);
  let i = 0;
  for (let r = 0; r < p.widths.length; r++) {
    const row: Cell[] = new Array(p.widths[r]);
    for (let c = 0; c < row.length; c++, i++) { const k = p.kind[i]; row[c] = k >= 0 ? p.strings[k] : k === -1 ? p.nums[i] : null; }
    rows[r] = row;
  }
  return { ...p.meta, rows } as Table;
}

/** A reply as sent: its tables packed. */
export type WireReply = Exclude<Reply, { tables: Table[] } | { page: Page }> | { packed: PackedTable[] } | { page: Omit<Page, "tables"> & { packed: (PackedTable | null)[] } };

export function toWire(r: Reply): WireReply {
  if ("tables" in r) return { packed: r.tables.map(packTable) };
  if ("page" in r) { const { tables, ...rest } = r.page; return { page: { ...rest, packed: tables.map((t) => (t ? packTable(t) : null)) } }; }
  return r;
}

export function fromWire(w: WireReply): Reply {
  if ("packed" in w) return { tables: w.packed.map(unpackTable) };
  if ("page" in w) { const { packed, ...rest } = w.page; return { page: { ...rest, tables: packed.map((t) => (t ? unpackTable(t) : null)) } }; }
  return w;
}
