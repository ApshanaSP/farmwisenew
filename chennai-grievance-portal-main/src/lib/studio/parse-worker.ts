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
import { fileLinksIn, nextPageLink, scriptJsonUrls } from "@/lib/studio/connect/links";

/** A file to read: every table in it (or, `main`, only the largest); `ocr`: a picture or a scan comes back as images to read with OCR. */
export interface FileJob { op: "file"; buf: Uint8Array; name: string; contentType: string; base: string; ocr: boolean; main: boolean }
/** A fetched web page: its tables (shaped), its feed, headlines, data files, the JSON its scripts load and its next page. */
export interface PageJob { op: "page"; html: string; url: string }
export type Job = FileJob | PageJob;

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
  return job.op === "page" ? readPage(job) : readFile(job);
}
