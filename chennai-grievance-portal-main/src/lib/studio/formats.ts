/**
 * The file kinds beyond Excel, CSV and JSON, each read by code with no new package:
 *
 *   zip      the entries of a ZIP archive (the central directory, inflated with zlib), capped against zip bombs
 *   docx     the tables of a Word file (word/document.xml: w:tbl > w:tr > w:tc)
 *   kml/kmz  placemarks: name, description, their ExtendedData fields, latitude and longitude
 *   geojson  features: their properties, with a point's (or a shape's centre's) latitude and longitude
 *   xml      the most repeated record element, its child elements as columns
 *   pdf      text with its position on the page (Tj / TJ under Tm / Td), grouped into lines and columns; a table that
 *            runs over several pages is joined when the pages repeat the header. A scanned PDF (only images) is said
 *            to be one, never guessed at.
 *
 * Bytes are data, never instructions: nothing read here is run or followed.
 */
import zlib from "zlib";
import type { Cell } from "@/lib/studio/parse";

export class FormatError extends Error {}

// --------------------------------------------------------------------- zip --

export interface ZipEntry { name: string; data: Buffer }
const ZIP_TOTAL = 60 * 1024 * 1024;
const ZIP_FILES = 200;

/** The files in a ZIP (folders and the macOS __MACOSX shadows left out). */
export function unzip(buf: Buffer): ZipEntry[] {
  // the end-of-central-directory record: the last 22..65 557 bytes
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new FormatError("This ZIP file is damaged: its table of contents is missing.");
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let k = 0; k < count && k < ZIP_FILES; k++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new FormatError("This ZIP file is damaged.");
    const method = buf.readUInt16LE(at + 10);
    const csize = buf.readUInt32LE(at + 20), usize = buf.readUInt32LE(at + 24);
    const nlen = buf.readUInt16LE(at + 28), xlen = buf.readUInt16LE(at + 30), clen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nlen).toString("utf8");
    at += 46 + nlen + xlen + clen;
    if (name.endsWith("/") || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name)) continue;
    total += usize;
    if (total > ZIP_TOTAL || (csize > 0 && usize / csize > 400)) throw new FormatError("This ZIP unpacks to far more than its size: it is not read (a safety limit).");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new FormatError("This ZIP file is damaged.");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.min(ZIP_TOTAL, Math.max(usize, 1) + 1024) }); } catch { throw new FormatError(`"${name}" inside the ZIP could not be unpacked.`); }
    } else throw new FormatError(`"${name}" inside the ZIP uses a packing method the Studio cannot read.`);
    out.push({ name, data });
  }
  return out;
}

export const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
/** What a ZIP holds: an Office file (xlsx, docx, ods), a KMZ, or an archive of files. */
export function zipKind(b: Buffer): "xlsx" | "docx" | "ods" | "kmz" | "zip" {
  let names: string[] = [];
  try { names = zipNames(b); } catch { return "zip"; }
  if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
  if (names.some((n) => n.startsWith("word/"))) return "docx";
  if (names.includes("content.xml") && names.includes("mimetype")) return "ods";
  if (names.some((n) => /\.kml$/i.test(n)) && names.length <= 20 && !names.some((n) => /\.(csv|xlsx?|json)$/i.test(n))) return "kmz";
  return "zip";
}
function zipNames(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out: string[] = [];
  for (let k = 0; k < count && k < 2000 && at + 46 <= buf.length; k++) {
    const nlen = buf.readUInt16LE(at + 28), xlen = buf.readUInt16LE(at + 30), clen = buf.readUInt16LE(at + 32);
    out.push(buf.subarray(at + 46, at + 46 + nlen).toString("utf8"));
    at += 46 + nlen + xlen + clen;
  }
  return out;
}

// --------------------------------------------------------------------- xml --

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const unent = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => { if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m; const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; });
const text = (s: string) => unent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const val = (s: string): Cell => {
  const t = text(s);
  if (t === "") return null;
  return /^-?\d+(\.\d+)?$/.test(t) && t.length < 16 && !/^0\d/.test(t) ? Number(t) : t;
};

/** Word tables (each a grid), largest first. */
export function docxTables(buf: Buffer): Cell[][][] {
  const doc = unzip(buf).find((e) => e.name === "word/document.xml");
  if (!doc) throw new FormatError("This Word file has no document inside it.");
  const xml = doc.data.toString("utf8");
  const grids: Cell[][][] = [];
  for (const t of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const grid: Cell[][] = [];
    for (const tr of t[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
      const row: Cell[] = [];
      for (const tc of tr[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
        const span = Number(tc[1].match(/<w:gridSpan w:val="(\d+)"/)?.[1] ?? 1);
        const v = val([...tc[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(" "));
        for (let k = 0; k < Math.min(span, 20); k++) row.push(v);
      }
      if (row.some((c) => c != null)) grid.push(row);
    }
    if (grid.length >= 2) grids.push(grid);
  }
  return grids.sort((a, b) => b.length - a.length);
}

/** KML placemarks as a grid: Name, Description, every ExtendedData field, Latitude, Longitude. */
export function kmlGrid(xml: string): Cell[][] {
  const marks = [...xml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)].map((m) => m[1]);
  if (!marks.length) throw new FormatError("This KML has no places in it.");
  const extra: string[] = [];
  const recs = marks.map((p) => {
    const r: Record<string, Cell> = {};
    r.Name = val(p.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? "");
    const desc = p.match(/<description>([\s\S]*?)<\/description>/i)?.[1];
    if (desc) r.Description = (text(unent(desc)) || null);
    for (const d of p.matchAll(/<(?:Data|SimpleData)\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:Data|SimpleData)>/gi)) {
      const k = unent(d[1]).trim();
      const v = d[2].match(/<value>([\s\S]*?)<\/value>/i)?.[1] ?? d[2];
      if (!extra.includes(k)) extra.push(k);
      r[k] = val(v);
    }
    const coords = p.match(/<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1]?.trim().split(/\s+/).map((c) => c.split(",").map(Number)) ?? [];
    const pts = coords.filter((c) => c.length >= 2 && c.every(Number.isFinite));
    if (pts.length) {
      r.Longitude = Math.round((pts.reduce((s, c) => s + c[0], 0) / pts.length) * 1e6) / 1e6;
      r.Latitude = Math.round((pts.reduce((s, c) => s + c[1], 0) / pts.length) * 1e6) / 1e6;
    }
    return r;
  });
  const cols = ["Name", ...(recs.some((r) => r.Description != null) ? ["Description"] : []), ...extra.slice(0, 40), "Latitude", "Longitude"];
  return [cols, ...recs.map((r) => cols.map((c) => r[c] ?? null))];
}

/** A GeoJSON FeatureCollection as records: properties, then Latitude and Longitude. */
export function geojsonRecords(doc: unknown): Record<string, unknown>[] | null {
  const d = doc as { type?: string; features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[] };
  if (!d || d.type !== "FeatureCollection" || !Array.isArray(d.features)) return null;
  return d.features.map((f) => {
    const r: Record<string, unknown> = { ...(f.properties ?? {}) };
    const pts: number[][] = [];
    const walk = (c: unknown) => {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") pts.push(c as number[]);
      else if (Array.isArray(c)) for (const x of c) walk(x);
    };
    walk(f.geometry?.coordinates);
    if (pts.length) {
      r.Latitude = Math.round((pts.reduce((s, c) => s + c[1], 0) / pts.length) * 1e6) / 1e6;
      r.Longitude = Math.round((pts.reduce((s, c) => s + c[0], 0) / pts.length) * 1e6) / 1e6;
    }
    return r;
  });
}

/** A generic XML file: the element that repeats most (with child elements) is a record, its children the columns. */
export function xmlGrid(xml: string): Cell[][] | null {
  const body = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const counts = new Map<string, number>();
  for (const m of body.matchAll(/<([A-Za-z_][\w.:-]*)\b[^>/]*>\s*<[A-Za-z_]/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const rec = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!rec) return null;
  const esc = rec.replace(/[.:-]/g, (c) => `\\${c}`);
  const cols: string[] = [];
  const recs = [...body.matchAll(new RegExp(`<${esc}\\b([^>]*)>([\\s\\S]*?)</${esc}>`, "g"))].slice(0, 50_000).map((m) => {
    const r: Record<string, Cell> = {};
    for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) { if (!cols.includes(a[1])) cols.push(a[1]); r[a[1]] = val(a[2]); }
    for (const c of m[2].matchAll(/<([A-Za-z_][\w.:-]*)\b[^>]*>([\s\S]*?)<\/\1>/g)) { if (!cols.includes(c[1])) cols.push(c[1]); r[c[1]] = val(c[2]); }
    return r;
  });
  if (recs.length < 3 || cols.length < 2) return null;
  const keep = cols.slice(0, 60);
  return [keep, ...recs.map((r) => keep.map((c) => r[c] ?? null))];
}

// --------------------------------------------------------------------- pdf --

interface Glyph { x: number; y: number; s: string; page: number }
const PDF_MAX = 40 * 1024 * 1024;

/** The streams of a PDF, inflated where they are Flate-compressed. */
function pdfStreams(buf: Buffer): { dict: string; data: Buffer }[] {
  const out: { dict: string; data: Buffer }[] = [];
  const src = buf.toString("latin1");
  const re = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>)*)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const lenM = m[1].match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let end = lenM ? start + Number(lenM[1]) : src.indexOf("endstream", start);
    if (end < start || end > src.length) end = src.indexOf("endstream", start);
    let data = buf.subarray(start, end);
    if (/\/FlateDecode/.test(m[1])) {
      // capped like a ZIP: a compression bomb is not inflated past 40 MB
      try { data = zlib.inflateSync(data, { maxOutputLength: PDF_MAX }); } catch { try { data = zlib.inflateRawSync(data.subarray(2), { maxOutputLength: PDF_MAX }); } catch { continue; } }
    } else if (/\/Filter/.test(m[1])) { out.push({ dict: m[1], data: Buffer.alloc(0) }); continue; }
    out.push({ dict: m[1], data });
    re.lastIndex = end;
  }
  return out;
}

/** A PDF string literal "(...)" with its escapes, or a hex string "<...>". */
function pdfString(s: string): string {
  if (s.startsWith("<")) {
    const h = s.slice(1, -1).replace(/\s+/g, "");
    let o = "";
    for (let i = 0; i < h.length; i += 2) o += String.fromCharCode(parseInt(h.slice(i, i + 2).padEnd(2, "0"), 16));
    return o;
  }
  return s.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e: string) =>
    /^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e);
}

/** The positioned text of a content stream. */
function glyphs(content: string, page: number): Glyph[] {
  const out: Glyph[] = [];
  let x = 0, y = 0, lx = 0, ly = 0, lead = 0;
  const tok = /(\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|\[(?:\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|[^\]()<])*\]|-?\d*\.?\d+|\/[^\s/[\]()<>]+|[A-Za-z'"*]+)/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tok.exec(content))) {
    const t = m[1];
    if (/^[A-Za-z'"*]+$/.test(t)) {
      const num = (k: number) => Number(stack[stack.length - k]);
      if (t === "BT") { x = lx = 0; y = ly = 0; }
      else if (t === "Tm") { lx = x = num(2); ly = y = num(1); }
      else if (t === "Td" || t === "TD") { if (t === "TD") lead = -num(1); lx += num(2); ly += num(1); x = lx; y = ly; }
      else if (t === "TL") lead = num(1);
      else if (t === "T*") { ly -= lead; x = lx; y = ly; }
      else if (t === "Tj" || t === "'" || t === '"') {
        if (t !== "Tj") { ly -= lead; x = lx; y = ly; }
        const s = stack[stack.length - 1];
        if (s && (s.startsWith("(") || s.startsWith("<"))) out.push({ x, y, s: pdfString(s), page });
      } else if (t === "TJ") {
        const arr = stack[stack.length - 1] ?? "";
        const parts = [...arr.matchAll(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|-?\d*\.?\d+/g)].map((p) => p[0]);
        let s = "";
        for (const p of parts) {
          if (p.startsWith("(") || p.startsWith("<")) s += pdfString(p);
          else if (Number(p) < -200) s += " ";
        }
        out.push({ x, y, s, page });
      }
      stack.length = 0;
    } else stack.push(t);
  }
  return out.filter((g) => g.s.trim());
}

/** The tables of a text PDF: lines grouped by height, cells by gaps; pages that repeat the header are joined. */
export function pdfTables(buf: Buffer): { grids: Cell[][][]; pages: number; scanned: boolean; words: number } {
  if (!buf.subarray(0, 1024).toString("latin1").includes("%PDF")) throw new FormatError("This is not a PDF file.");
  const streams = pdfStreams(buf);
  const pages = Math.max(1, (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length);
  const images = streams.filter((s) => /\/Subtype\s*\/Image/.test(s.dict)).length;
  const all: Glyph[] = [];
  let page = 0;
  for (const s of streams) {
    if (/\/Subtype|\/Type\s*\/(XObject|Font|Metadata)|\/Length1/.test(s.dict) || !s.data.length) continue;
    const c = s.data.toString("latin1");
    if (!/\bBT\b/.test(c)) continue;
    all.push(...glyphs(c, page++));
  }
  const words = all.reduce((n, g) => n + g.s.trim().split(/\s+/).length, 0);
  if (!all.length) return { grids: [], pages, scanned: images > 0, words: 0 };
  // lines: glyphs on one page at (nearly) the same height, left to right
  const lines: { page: number; y: number; cells: { x: number; s: string }[] }[] = [];
  for (const g of all.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    const l = lines.find((k) => k.page === g.page && Math.abs(k.y - g.y) < 2.5);
    if (l) l.cells.push({ x: g.x, s: g.s.trim() }); else lines.push({ page: g.page, y: g.y, cells: [{ x: g.x, s: g.s.trim() }] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  // a table: a run of lines with 2+ cells whose columns line up with the run's header
  const grids: Cell[][][] = [];
  let cur: { xs: number[]; head: string; rows: Cell[][] } | null = null;
  const flush = () => { if (cur && cur.rows.length >= 3) grids.push(cur.rows); cur = null; };
  for (const l of lines) {
    // a line of one piece of text (a title, a page number, a paragraph) never starts a table, nor ends one: a table
    // that runs onto the next page continues under that page's title
    if (l.cells.length < 2) continue;
    const key = l.cells.map((c) => c.s.toLowerCase()).join("|");
    if (cur && key === cur.head) continue; // the header repeated on the next page
    const fit = cur && l.cells.length <= cur.xs.length + 1 && l.cells.every((c) => cur!.xs.some((x) => Math.abs(x - c.x) < 40));
    if (!cur || !fit) {
      flush();
      cur = { xs: l.cells.map((c) => c.x), head: key, rows: [] };
    }
    const row: Cell[] = cur.xs.map(() => null);
    for (const c of l.cells) {
      let best = 0;
      cur.xs.forEach((x, i) => { if (Math.abs(x - c.x) < Math.abs(cur!.xs[best] - c.x)) best = i; });
      row[best] = row[best] == null ? val(c.s) : `${row[best]} ${c.s}`;
    }
    cur.rows.push(row);
  }
  flush();
  return { grids: grids.sort((a, b) => b.length - a.length), pages, scanned: false, words };
}

// ---------------------------------------------------------------- encodings --

/** The text of a file in whatever encoding it was saved: UTF-8 (with or without BOM), UTF-16 LE/BE, else Windows-1252. */
export function decodeText(buf: Buffer): { text: string; encoding: string } {
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(buf.subarray(2)), encoding: "UTF-16" };
  if (buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(buf.subarray(2)), encoding: "UTF-16" };
  // UTF-16 without a mark: every other byte zero in the first lines
  const head = buf.subarray(0, 400);
  let z0 = 0, z1 = 0;
  for (let i = 0; i + 1 < head.length; i += 2) { if (head[i] === 0) z0++; if (head[i + 1] === 0) z1++; }
  if (head.length >= 20 && z1 > head.length / 6 && z0 < 2) return { text: new TextDecoder("utf-16le").decode(buf), encoding: "UTF-16" };
  if (head.length >= 20 && z0 > head.length / 6 && z1 < 2) return { text: new TextDecoder("utf-16be").decode(buf), encoding: "UTF-16" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""), encoding: "UTF-8" }; } catch { /* not UTF-8 */ }
  return { text: new TextDecoder("windows-1252").decode(buf), encoding: "Windows-1252" };
}

/**
 * Text typed in an old Tamil font encoding (TAB, TAM, TSCII, Bamini): Tamil to the eye in that font, but Latin
 * letters with accents in the file. It cannot be read back reliably, so it is flagged rather than guessed.
 */
export function legacyTamil(text: string): boolean {
  const sample = text.slice(0, 20_000);
  const high = (sample.match(/[À-ÿ]/g) ?? []).length;
  const letters = (sample.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const tamil = (sample.match(/[஀-௿]/g) ?? []).length;
  return tamil === 0 && letters > 40 && high / letters > 0.25;
}
