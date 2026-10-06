/**
 * Any table file to rows: Excel (.xlsx, .xls, .ods through SheetJS), CSV / TSV (delimiter sniffed, UTF-8 or
 * Windows-1252), and JSON (the first array of records, nested fields flattened one level).
 *
 * Department exports are rarely clean tables: a title or two above the header ("GREATER CHENNAI CORPORATION ...
 * AS ON 30.09.2026"), merged cells (a zone written once for its block of rows), a two-row header, Excel day numbers
 * for dates. The header row is found, the title kept as the caption the AI reads, merged cells are filled in and dates
 * become YYYY-MM-DD, so every later step sees one plain table.
 */
import * as XLSX from "xlsx";
import { excelDate, tidy } from "@/lib/studio/values";

export type Cell = string | number | null;

export interface Table {
  headers: string[];
  rows: Cell[][];
  sheet: string | null;
  sheets: string[];
  caption: string | null;
  format: "excel" | "csv" | "json" | "feed" | "html";
  /** rows past the limit that were not read */
  truncated: number;
}

export const MAX_ROWS = 50_000;
export const MAX_COLS = 60;

export class ParseError extends Error {}

/** Read a file's bytes. `name` decides the format when the bytes do not. */
export function parseFile(buf: Buffer, name: string, contentType = "", base = "https://example.invalid/"): Table {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const head = buf.subarray(0, 8);
  const zip = head[0] === 0x50 && head[1] === 0x4b; // xlsx / ods
  const ole = head[0] === 0xd0 && head[1] === 0xcf; // legacy .xls
  if (zip || ole || ["xlsx", "xlsm", "xls", "ods", "xlsb"].includes(ext)) return excel(buf);
  const text = decode(buf);
  const t = text.trimStart();
  if (ext === "json" || /json/i.test(contentType) || t.startsWith("{") || t.startsWith("[")) return json(text);
  // a news feed (RSS or Atom): one row per article
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(t) || (/xml/i.test(contentType) && /<(item|entry)\b/i.test(t))) return feed(text);
  if (/pdf/i.test(contentType) || t.startsWith("%PDF")) throw new ParseError("That link is a PDF. Tables inside PDFs cannot be read yet: open it, download the table as Excel or CSV, and drop that file here.");
  // a web page: its largest table, else the headlines it lists
  if (/^<(!doctype|html|head|body|div|meta)/i.test(t) || /html/i.test(contentType)) return htmlPage(text, base);
  if (t.startsWith("<")) throw new ParseError("This XML is not a news feed or a table the Studio can read. Save it as CSV or Excel and drop it here.");
  return csv(text);
}

// -------------------------------------------------------------------- feed --

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function unxml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
}
const tagOf = (xml: string, name: string) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? null;
const plain = (s: string | null) => (s == null ? null : tidy(unxml(unxml(s)).replace(/<[^>]+>/g, " ")) || null);

/** A feed date ("Tue, 06 Oct 2026 04:57:39 GMT", ISO) as India time, YYYY-MM-DD HH:MM. */
function feedDate(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s.trim());
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 5.5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** RSS 2.0, RSS 1.0 (RDF) or Atom: Headline, Source, Published, Summary, Link. */
function feed(xml: string): Table {
  const items = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]).slice(0, MAX_ROWS);
  if (!items.length) throw new ParseError("The feed has no articles in it.");
  const channel = plain(tagOf(xml.replace(/<(item|entry)\b[\s\S]*$/i, ""), "title"));
  const rows: Cell[][] = items.map((it) => {
    let title = plain(tagOf(it, "title")) ?? "";
    let source = plain(tagOf(it, "source")) ?? plain(tagOf(it, "dc:creator")) ?? plain(tagOf(it, "author"));
    // Google News writes the outlet after the headline: "Headline - The Hindu"
    const tail = title.match(/^(.*\S)\s+[-–|]\s+([^-–|]{2,40})$/);
    if (tail) { title = tail[1]; source ??= tail[2]; }
    const link = plain(tagOf(it, "link")) ?? it.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] ?? null;
    const when = feedDate(tagOf(it, "pubDate") ?? tagOf(it, "published") ?? tagOf(it, "updated") ?? tagOf(it, "dc:date"));
    let summary = plain(tagOf(it, "description") ?? tagOf(it, "summary") ?? tagOf(it, "content"));
    if (summary && (summary === title || summary.startsWith(title))) summary = null;
    return [title || null, source ?? null, when, summary ? summary.slice(0, 600) : null, link];
  });
  return { headers: ["Headline", "Source", "Published", "Summary", "Link"], rows, sheet: null, sheets: [], caption: channel ? `News feed: ${channel}` : "News feed", format: "feed", truncated: 0 };
}

// -------------------------------------------------------------------- html --

const stripPage = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "");
/** A cell's text: tags, footnote marks ([1], [a]) and extra spaces removed. */
const cellText = (s: string) => tidy(unxml(s.replace(/<br\s*\/?>/gi, " ").replace(/<sup\b[\s\S]*?<\/sup>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\[\s*(\d+|[a-z]|note \d+|citation needed)\s*\]/gi, ""));

/** Every table on a page as a grid (colspans repeated), largest first. */
export function htmlTables(html: string): Cell[][][] {
  const page = stripPage(html);
  const out: Cell[][][] = [];
  for (const m of page.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = m[1];
    if (/<table\b/i.test(body)) continue; // the outer layout table of a nested pair
    const grid: Cell[][] = [];
    for (const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row: Cell[] = [];
      for (const td of tr[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
        const span = Math.min(20, Number(td[2].match(/colspan=["']?(\d+)/i)?.[1] ?? 1) || 1);
        const v = cellText(td[3]);
        for (let k = 0; k < span; k++) row.push(v === "" ? null : v);
      }
      if (row.some((c) => c != null)) grid.push(row);
    }
    const cols = Math.max(0, ...grid.map((r) => r.length));
    if (grid.length >= 3 && cols >= 2) out.push(grid);
  }
  return out.sort((a, b) => b.length * Math.max(...b.map((r) => r.length)) - a.length * Math.max(...a.map((r) => r.length)));
}

/** A web page: its largest table, else the headlines it lists (a news or notices page), as a feed. */
function htmlPage(html: string, base: string): Table {
  const title = cellText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  const tables = htmlTables(html);
  if (tables[0] && tables[0].length >= 4) {
    const t = shape(tables[0]);
    return { ...t, sheet: tables.length > 1 ? `Largest of ${tables.length} tables` : null, sheets: [], caption: title, format: "html" };
  }
  // headlines: links whose text reads like a headline, each once
  const host = (() => { try { return new URL(base).hostname.replace(/^www\./, ""); } catch { return null; } })();
  const seen = new Set<string>();
  const rows: Cell[][] = [];
  for (const m of stripPage(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = cellText(m[2]);
    if (text.length < 30 || text.length > 260 || text.split(" ").length < 5 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    let link: string | null = null;
    try { link = new URL(unxml(m[1]), base).toString(); } catch { /* keep null */ }
    rows.push([text, host, null, null, link]);
    if (rows.length >= 300) break;
  }
  if (rows.length >= 5) return { headers: ["Headline", "Source", "Published", "Summary", "Link"], rows, sheet: null, sheets: [], caption: title ? `Headlines on ${title}` : "Headlines on the page", format: "feed", truncated: 0 };
  const host2 = host ?? "";
  if (/data\.gov\.in$/.test(host2)) throw new ParseError("data.gov.in builds its pages with JavaScript, so the data is not in the page. On the dataset's page press Download, choose CSV (or Excel), and drop that file here; or paste its API link (api.data.gov.in/resource/...&format=csv).");
  const textLen = stripPage(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").length;
  if (textLen < 2000 && html.length > 50_000) throw new ParseError("That page builds its content with JavaScript, so there is nothing to read in it. Look on the page for a Download (CSV / Excel) or RSS link and paste that, or download the table and drop the file here.");
  throw new ParseError("That web page has no table, no data file and no list of headlines to read. Open it, look for a \"Download\" (CSV / Excel) or an RSS link, and paste that instead.");
}

/** Links on a page to data files (CSV first, then Excel, then JSON), for a page that only links its data. */
export function dataLinksIn(html: string, base: string): string[] {
  const out: { url: string; rank: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = unxml(m[1]);
    const text = cellText(m[2]).toLowerCase();
    const ext = href.toLowerCase().match(/\.(csv|xlsx|xls|json)(\?|$)/)?.[1] ?? (/(^|\W)(csv)(\W|$)/.test(text) ? "csv" : /(^|\W)(xlsx?|excel)(\W|$)/.test(text) ? "xlsx" : null);
    if (!ext) continue;
    try { out.push({ url: new URL(href, base).toString(), rank: { csv: 0, xlsx: 1, xls: 1, json: 2 }[ext] ?? 3 }); } catch { /* a broken link */ }
  }
  return [...new Set(out.sort((a, b) => a.rank - b.rank).map((x) => x.url))].slice(0, 3);
}

/** The news feed a web page points to (<link rel="alternate" type="application/rss+xml">), if any. */
export function feedLinkIn(html: string, base: string): string | null {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) try { return new URL(unxml(href), base).toString(); } catch { /* a broken link */ }
  }
  return null;
}

function decode(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

// ------------------------------------------------------------------- excel --

function excel(buf: Buffer): Table {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: false, cellNF: true, cellText: false, sheetRows: MAX_ROWS + 40 });
  } catch (e) {
    throw new ParseError(`This Excel file could not be read (${(e as Error).message.slice(0, 80)}). Save it again as .xlsx or .csv and retry.`);
  }
  const sheets = wb.SheetNames.filter((n) => wb.Sheets[n]?.["!ref"]);
  if (!sheets.length) throw new ParseError("The workbook has no data.");
  // the sheet with the most filled cells is the data; the others are listed
  const size = (n: string) => Object.keys(wb.Sheets[n]).filter((k) => k[0] !== "!").length;
  const sheet = [...sheets].sort((a, b) => size(b) - size(a))[0];
  const ws = wb.Sheets[sheet];
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const grid: Cell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + MAX_COLS * 2); c++) row.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })]));
    grid.push(row);
  }
  // a merged block takes its top-left value everywhere (a zone written once for its rows, a header spanning columns);
  // a title merged across the sheet's width stays in its first cell, so it never looks like a row of headers
  const width = range.e.c - range.s.c + 1;
  for (const m of ws["!merges"] ?? []) {
    const v = grid[m.s.r - range.s.r]?.[m.s.c - range.s.c];
    if (v == null) continue;
    if (m.s.r === m.e.r && m.e.c - m.s.c + 1 >= Math.max(4, width * 0.5)) continue;
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
      const row = grid[r - range.s.r];
      if (row && c - range.s.c < row.length && row[c - range.s.c] == null) row[c - range.s.c] = v;
    }
  }
  return { ...shape(grid), sheet, sheets, format: "excel" };
}

function cellValue(cell: XLSX.CellObject | undefined): Cell {
  if (!cell || cell.v == null) return null;
  if (cell.t === "e") return null;
  if (cell.t === "b") return cell.v ? "Yes" : "No";
  if (cell.t === "d") {
    const d = cell.v as Date;
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (cell.t === "n") {
    const v = cell.v as number;
    if (cell.z && XLSX.SSF.is_date(String(cell.z))) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p && p.y > 1900) {
        const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
        return p.H || p.M ? `${date} ${String(p.H).padStart(2, "0")}:${String(p.M).padStart(2, "0")}` : date;
      }
      return excelDate(v);
    }
    return v;
  }
  const s = String(cell.v);
  return s.trim() === "" ? null : s;
}

// --------------------------------------------------------------------- csv --

function csv(text: string): Table {
  const lines = text.split(/\r?\n/).slice(0, 30).filter((l) => l.trim());
  if (!lines.length) throw new ParseError("The file is empty.");
  // the delimiter that splits the first lines into the same, largest number of fields
  let best = { d: ",", score: -1 };
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    const agree = counts.filter((c) => c === mode).length / counts.length;
    const score = mode > 1 ? agree * 10 + Math.min(mode, 30) / 10 : -1;
    if (score > best.score) best = { d, score };
  }
  if (best.score < 0) {
    // one column: still a table (a list of names, places ...)
    best.d = "\u0000";
  }
  const grid = readCsv(text, best.d).slice(0, MAX_ROWS + 40).map((r) => r.map((c) => (c.trim() === "" ? null : c)));
  return { ...shape(grid), sheet: null, sheets: [], format: "csv" };
}

function splitLine(line: string, d: string): string[] {
  return readCsv(line, d)[0] ?? [];
}

/** RFC 4180: quoted fields may hold the delimiter, quotes ("") and line breaks. */
function readCsv(text: string, d: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") { q = true; continue; }
    if (ch === d) { row.push(field); field = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = []; field = "";
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}

// -------------------------------------------------------------------- json --

function json(text: string): Table {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ParseError("The JSON could not be read: it is not valid JSON."); }
  const find = (v: unknown, depth = 0): Record<string, unknown>[] | null => {
    if (Array.isArray(v) && v.length && v.some((x) => x && typeof x === "object" && !Array.isArray(x))) return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
    if (v && typeof v === "object" && depth < 4) {
      // the largest array of records wins (an API's "records" over its "fields")
      let best: Record<string, unknown>[] | null = null;
      for (const x of Object.values(v as object)) {
        const f = find(x, depth + 1);
        if (f && (!best || f.length > best.length)) best = f;
      }
      return best;
    }
    return null;
  };
  // column-shaped JSON ({ time: [...], rain: [...] }, as weather APIs send it): the longest group of equal-length
  // arrays becomes the rows
  const columnar = (v: unknown, depth = 0): Record<string, unknown>[] | null => {
    if (!v || typeof v !== "object" || Array.isArray(v) || depth > 4) return null;
    const arrays = Object.entries(v as object).filter(([, x]) => Array.isArray(x) && x.length >= 2 && x.every((y) => y == null || typeof y !== "object")) as [string, unknown[]][];
    const len = arrays[0]?.[1].length;
    if (arrays.length >= 2 && arrays.every(([, a]) => a.length === len))
      return Array.from({ length: len! }, (_, i) => Object.fromEntries(arrays.map(([k, a]) => [k, a[i]])));
    for (const x of Object.values(v as object)) { const f = columnar(x, depth + 1); if (f) return f; }
    return null;
  };
  const recs = find(data) ?? columnar(data);
  if (!recs?.length) throw new ParseError("No list of records was found in the JSON.");
  const flat = recs.slice(0, MAX_ROWS).map((o) => {
    const r: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as object)) r[`${k}.${k2}`] = scalar(v2);
      else r[k] = scalar(v);
    }
    return r;
  });
  const keys: string[] = [];
  for (const r of flat.slice(0, 500)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const cols = keys.slice(0, MAX_COLS);
  const grid: Cell[][] = [cols, ...flat.map((r) => cols.map((k) => r[k] ?? null))];
  return { ...shape(grid, 0), sheet: null, sheets: [], format: "json", truncated: Math.max(0, recs.length - MAX_ROWS) };
}

function scalar(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ").slice(0, 500) || null;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 500);
  const s = String(v);
  return s.trim() === "" ? null : s;
}

// ------------------------------------------------------------------- shape --

const isText = (c: Cell) => typeof c === "string" && !/^[-+]?[\d.,\s₹%/:-]+$/.test(c.trim());

/** Header row, caption, two-row headers, empty columns: a grid becomes headers + rows. */
function shape(grid: Cell[][], forceHeader?: number): Omit<Table, "sheet" | "sheets" | "format"> {
  // trailing empty columns and rows
  while (grid.length && grid[grid.length - 1].every((c) => c == null)) grid.pop();
  if (!grid.length) throw new ParseError("The file has no rows.");
  const filled = (r: Cell[]) => r.filter((c) => c != null).length;
  const width = Math.max(...grid.slice(0, 40).map(filled));
  let h = forceHeader ?? -1;
  if (h < 0) {
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const f = filled(grid[r]);
      const t = grid[r].filter(isText).length;
      const distinct = new Set(grid[r].filter((c) => c != null).map((c) => String(c).trim().toLowerCase())).size;
      // a header: most of the table's width filled, nearly all of it distinct words; a data row follows
      if (f >= Math.max(1, Math.ceil(width * 0.5)) && t >= Math.ceil(f * 0.7) && distinct >= Math.ceil(f * 0.6)
        && grid.slice(r + 1, r + 6).some((x) => filled(x) >= Math.ceil(width * 0.4))) { h = r; break; }
    }
    if (h < 0) h = 0;
  }
  const caption = grid.slice(0, h).map((r) => r.filter((c) => c != null).map(String).map(tidy).join(" · ")).filter(Boolean).join(" — ").slice(0, 240) || null;
  let headerCells = grid[h].map((c) => (c == null ? "" : tidy(c)));
  let start = h + 1;
  // a two-row header: the second row names the parts of a group in the first ("Amount" over "Sanctioned | Spent")
  const next = grid[h + 1];
  if (next && forceHeader == null) {
    const nf = filled(next), nt = next.filter(isText).length;
    const grouped = next.filter((c, i) => isText(c) && (headerCells[i] === "" || (i > 0 && headerCells[i] === headerCells[i - 1]))).length;
    const after = grid.slice(h + 2, h + 7);
    if (nf >= Math.ceil(width * 0.3) && nt >= Math.ceil(nf * 0.8) && grouped >= 2 && after.some((x) => filled(x) >= Math.ceil(width * 0.4))) {
      headerCells = headerCells.map((top, i) => {
        const sub = next[i] == null ? "" : tidy(next[i]);
        return top && sub && top !== sub ? `${top} ${sub}` : sub || top;
      });
      start = h + 2;
    }
  }
  const body = grid.slice(start);
  const ncol = Math.min(MAX_COLS, Math.max(headerCells.length, ...body.slice(0, 200).map((r) => r.length)));
  // columns with neither a header nor any value are dropped
  const keep: number[] = [];
  for (let c = 0; c < ncol; c++) if (headerCells[c] || body.some((r) => r[c] != null)) keep.push(c);
  const seen = new Map<string, number>();
  const headers = keep.map((c, i) => {
    let name = headerCells[c] || `Column ${i + 1}`;
    if (name.length > 80) name = name.slice(0, 80);
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    return n > 1 ? `${name} (${n})` : name;
  });
  const rows = body.slice(0, MAX_ROWS).map((r) => keep.map((c) => r[c] ?? null));
  if (!headers.length) throw new ParseError("No columns were found.");
  return { headers, rows, caption, truncated: Math.max(0, body.length - MAX_ROWS) };
}
