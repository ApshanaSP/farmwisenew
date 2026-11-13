/**
 * OCR for tables that arrive as pictures: an image of a table (PNG, JPEG, TIFF, BMP, WebP) or a scanned PDF (pages
 * that are only images). Tesseract (tesseract.js, in this server, no network) reads English and Tamil with the
 * language data committed in data/ocr/ (eng, tam: Tesseract's 4.0 "best int" models). Page layout mode 4 (one column
 * of text of varying sizes) reads a ruled table cell by cell; mode 6 reads gridlines as text.
 *
 * The words come back with their boxes: they are put into lines by height, into cells by the gaps between them, and
 * into columns by the widest line. A cell read with low confidence is listed for the Collector to check, never
 * silently trusted.
 */
import path from "path";
import zlib from "zlib";
import type { Cell } from "@/lib/studio/parse";

export const OCR_LOW = 70;
const IDLE_MS = 5 * 60_000;

interface Word { text: string; conf: number; x0: number; y0: number; x1: number; y1: number }
type Worker = { recognize: (img: Buffer, o?: object, out?: object) => Promise<{ data: { blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[] | null } }>; setParameters: (p: Record<string, string>) => Promise<unknown>; terminate: () => Promise<unknown> };

declare global {
  // eslint-disable-next-line no-var
  var __studioOcr: { worker: Promise<Worker>; timer: ReturnType<typeof setTimeout> | null } | undefined;
}

/** One shared worker (English and Tamil), closed after five idle minutes. */
async function worker(): Promise<Worker> {
  const g = global.__studioOcr;
  if (g) { if (g.timer) clearTimeout(g.timer); g.timer = setTimeout(close, IDLE_MS); return g.worker; }
  const w = (async () => {
    const { createWorker } = await import("tesseract.js");
    const wk = await createWorker(["eng", "tam"], 1, { langPath: path.join(process.cwd(), "data", "ocr"), cacheMethod: "none", gzip: true }) as unknown as Worker;
    await wk.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
    return wk;
  })();
  global.__studioOcr = { worker: w, timer: setTimeout(close, IDLE_MS) };
  w.catch(() => { global.__studioOcr = undefined; });
  return w;
}
async function close() {
  const g = global.__studioOcr;
  global.__studioOcr = undefined;
  try { await (await g?.worker)?.terminate(); } catch { /* already gone */ }
}

export const isImage = (b: Buffer) =>
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a) ||
  // a bitmap: "BM", its size, then four zero bytes (so a CSV that starts "BMC Ward" is not taken for one)
  (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d && b.readUInt32LE(6) === 0 && b.readUInt32LE(2) <= b.length + 1024) ||
  (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP");

/** At most 40 million pixels a picture (a 7,000 x 5,700 scan), and 60 seconds of reading. */
export const OCR_MAX_PIXELS = 40_000_000;
/** A picture's size from its header (PNG, JPEG, PNM), or null when it cannot be told. */
export function pixels(b: Buffer): number | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return b.readUInt32BE(16) * b.readUInt32BE(20);
  if (b[0] === 0x50 && (b[1] === 0x35 || b[1] === 0x36)) { const m = b.subarray(0, 40).toString("latin1").match(/^P[56]\s+(\d+)\s+(\d+)/); return m ? Number(m[1]) * Number(m[2]) : null; }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length && i < 2_000_000;) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return b.readUInt16BE(i + 5) * b.readUInt16BE(i + 7);
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Words on a page to rows of cells: lines by height, cells by gaps, columns by the widest line. */
export function wordsToGrid(words: Word[]): { grid: Cell[][]; low: string[] } {
  const ws = words.map((w) => ({ ...w, text: w.text.replace(/[|[\]{}]/g, "").trim() })).filter((w) => w.text);
  if (!ws.length) return { grid: [], low: [] };
  const h = median(ws.map((w) => w.y1 - w.y0)) || 10;
  // lines: words whose middles are within half a word's height
  const lines: Word[][] = [];
  for (const w of [...ws].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
    const mid = (w.y0 + w.y1) / 2;
    const l = lines.find((x) => Math.abs((x[0].y0 + x[0].y1) / 2 - mid) < h * 0.6);
    if (l) l.push(w); else lines.push([w]);
  }
  lines.sort((a, b) => a[0].y0 - b[0].y0);
  // cells: words of a line closer than a word's height belong together ("Anna Nagar", "Fever cases")
  type C = { x0: number; x1: number; text: string; conf: number };
  const cellLines: C[][] = lines.map((l) => {
    const out: C[] = [];
    for (const w of l.sort((a, b) => a.x0 - b.x0)) {
      const last = out[out.length - 1];
      if (last && w.x0 - last.x1 < h * 0.9) { last.text += ` ${w.text}`; last.x1 = w.x1; last.conf = Math.min(last.conf, w.conf); }
      else out.push({ x0: w.x0, x1: w.x1, text: w.text, conf: w.conf });
    }
    return out;
  });
  // columns: the starts of the line with the most cells (a table's header or a full row)
  const multi = cellLines.filter((l) => l.length >= 2);
  if (!multi.length) return { grid: [], low: [] };
  const widest = multi.reduce((a, b) => (b.length > a.length ? b : a));
  const anchors = widest.map((c) => c.x0);
  const col = (c: C) => { let best = 0; anchors.forEach((a, i) => { if (Math.abs(a - c.x0) < Math.abs(anchors[best] - c.x0)) best = i; }); return best; };
  const grid: Cell[][] = [];
  const low: string[] = [];
  for (const l of cellLines) {
    if (l.length < 2) continue; // a title or a page number: not a row
    const row: Cell[] = anchors.map(() => null);
    for (const c of l) {
      const i = col(c);
      const t = c.text;
      row[i] = row[i] == null ? (/^-?\d[\d,]*(\.\d+)?$/.test(t) && t.replace(/,/g, "").length < 16 ? Number(t.replace(/,/g, "")) : t) : `${row[i]} ${t}`;
      if (c.conf < OCR_LOW) low.push(`"${t}" (row ${grid.length + 1})`);
    }
    grid.push(row);
  }
  return { grid, low };
}

/** OCR of one image: its table as a grid, the cells to check, the mean confidence. */
export async function ocrImage(img: Buffer): Promise<{ grid: Cell[][]; low: string[]; conf: number; words: number }> {
  const px = pixels(img);
  if (px != null && px > OCR_MAX_PIXELS) throw new Error(`This picture is too large to read (${Math.round(px / 1e6)} million pixels; the limit is ${OCR_MAX_PIXELS / 1e6} million).`);
  const w = await worker();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const { data } = await Promise.race([
    w.recognize(img, {}, { blocks: true }),
    new Promise<never>((_, no) => { timer = setTimeout(() => { void close(); no(new Error("Reading the picture took over 60 seconds: stopped.")); }, 60_000); })
  ]).finally(() => { if (timer) clearTimeout(timer); });
  const words: Word[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((x) => ({
    text: x.text, conf: x.confidence, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })))));
  const { grid, low } = wordsToGrid(words);
  return { grid, low, conf: words.length ? Math.round(words.reduce((s, x) => s + x.conf, 0) / words.length) : 0, words: words.length };
}

/**
 * The page images of a scanned PDF, as files Tesseract reads: a JPEG stream (DCTDecode) as it is; an 8-bit grey or
 * RGB bitmap (FlateDecode) as a PNM. At most 20 pages; other encodings are skipped and counted.
 */
/**
 * `bitmaps: false` leaves out 8-bit bitmaps (a caller that keeps only JPEG and PNG pages would throw them away), and `maxBitmapBytes` caps
 * what all bitmaps together may inflate to: a few hundred KB of Flate data can hold 40 Mpx images, 2.4 GB for twenty of them, all
 * inflated in memory before the desk refused the file (QA pass 6, P5-028).
 */
export interface PdfImageOptions { bitmaps?: boolean; maxBitmapBytes?: number }
// about 20 A4 colour pages at 300 dpi (26 MB each): 150 MB dropped pages of a real scan (P6-007); before P5-028 there was no limit (2.4 GB).
// It bounds the inflating; what a call keeps is at most 20 pages of OCR_PAGE_PIXELS bytes (ocrPage)
export const PDF_BITMAP_BUDGET = 600_000_000;

/** The most pixels of one bitmap page given to OCR: an A4 page at 300 dpi is 8.7 million, and OCR reads no better above that. */
export const OCR_PAGE_PIXELS = 9_000_000;

/**
 * One inflated bitmap page as OCR is given it: grey (what Tesseract reads in any case), and shrunk by a whole factor (the mean of each
 * f x f block) to at most OCR_PAGE_PIXELS. The budget above was also what one request held: a 762 KB PDF of 40 Mpx pages came back as
 * 600 MB of page images, read at that size by OCR (reviewer2-13). Now one call holds at most 20 x 9 MB.
 */
function ocrPage(px: Buffer, W: number, H: number, ch: number): Buffer {
  const f = Math.max(1, Math.ceil(Math.sqrt((W * H) / OCR_PAGE_PIXELS)));
  const w = Math.max(1, Math.floor(W / f)), h = Math.max(1, Math.floor(H / f));
  const head = Buffer.from(`P5\n${w} ${h}\n255\n`, "latin1");
  if (f === 1 && ch === 1) return Buffer.concat([head, px.subarray(0, W * H)]);
  const out = Buffer.allocUnsafe(w * h);
  const sum = new Uint32Array(w);
  const n = f * f;
  for (let y = 0; y < h; y++) {
    sum.fill(0);
    for (let dy = 0; dy < f; dy++) {
      const row = (y * f + dy) * W * ch;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dx = 0, i = row + x * f * ch; dx < f; dx++, i += ch) s += ch === 3 ? (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8 : px[i];
        sum[x] += s;
      }
    }
    for (let x = 0; x < w; x++) out[y * w + x] = Math.round(sum[x] / n);
  }
  return Buffer.concat([head, out]);
}

export function pdfImages(buf: Buffer, { bitmaps = true, maxBitmapBytes = PDF_BITMAP_BUDGET }: PdfImageOptions = {}): { images: Buffer[]; skipped: number } {
  const src = buf.toString("latin1");
  const images: Buffer[] = [];
  let skipped = 0;
  let bitmapBytes = 0;
  // every dictionary that opens a stream, read whole (greedy, so a failed match costs its length once); whether it is an image is asked after.
  // "/Subtype /Image" inside the pattern, with a lazy part on each side, tried every occurrence of it in one dictionary as the anchor: time
  // grew with the square of a crafted dictionary (120 KB, 1.6 s; P6-013)
  const re = /<<((?:[^<>]|<<[^<>]*>>)*)>>\s*stream\r?\n/g;
  // the objects another image names as its soft mask or mask ("/SMask 12 0 R"): a mask is not a page, wherever it is in the file. Every
  // 8-bit grey image was taken as one, so a JPEG page with an SMask counted as two (reviewer2-15)
  const masks = new Set<string>();
  for (const k of src.matchAll(/\/S?Mask\s+(\d+)\s+(\d+)\s+R/g)) masks.add(`${k[1]} ${k[2]}`);
  // where each "n g obj" starts, found in one pass the first time a colour space must be followed (a later definition wins, as in an
  // updated file)
  let objs: Map<string, number> | null = null;
  const object = (n: string, g: string): string | null => {
    objs ??= new Map([...src.matchAll(/(?<!\d)(\d+)\s+(\d+)\s+obj\b/g)].map((k) => [`${k[1]} ${k[2]}`, k.index + k[0].length]));
    const at = objs.get(`${n} ${g}`);
    return at == null ? null : src.slice(at, at + 2000).trimStart();
  };
  /**
   * A colour space's channels: 1 grey, 3 RGB, null an ICC profile whose /N is not found (told by the page's size), 0 anything else. An
   * indirect one ("/ColorSpace 9 0 R") is followed: it was taken as ICC unread, so a palette (Indexed) or Separation page reached OCR as
   * its indices or ink tints read as grey (reviewerF-08). One that cannot be found in the file (a compressed object stream) is skipped.
   */
  const channels = (cs: string, depth = 0): number | null => {
    if (/^\/DeviceGray\b/.test(cs)) return 1;
    if (/^\/DeviceRGB\b/.test(cs)) return 3;
    const icc = cs.match(/^\[\s*\/ICCBased\s+(\d+)\s+(\d+)\s+R\b/);
    if (icc) {
      const n = object(icc[1], icc[2])?.match(/^<<((?:[^<>]|<<[^<>]*>>)*)>>/)?.[1].match(/\/N\s+(\d+)/)?.[1];
      return n == null ? null : n === "1" ? 1 : n === "3" ? 3 : 0;
    }
    const ref = cs.match(/^(\d+)\s+(\d+)\s+R\b/);
    const target = ref && depth < 3 ? object(ref[1], ref[2]) : null;
    return target == null ? 0 : channels(target, depth + 1);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && images.length < 20) {
    const dict = m[1];
    const start = m.index + m[0].length;
    // a direct /Length, the whole number: "/Length 12 0 R" (an indirect length) was read as /Length 1 (P6-013)
    const len = Number(dict.match(/\/Length\s+(\d+)(?!\d)(?!\s+\d+\s+R)/)?.[1] ?? -1);
    // a /Length is trusted when "endstream" follows it; else the stream ends at the next "endstream", less the end-of-line before it
    // (a /Length too large swallowed the next page: P6-013)
    let end = len > 0 && start + len <= buf.length && /^\s*endstream/.test(src.slice(start + len, start + len + 32)) ? start + len : src.indexOf("endstream", start);
    // a stream with no end in the file holds the rest of it, so nothing after it can be an image: each later image dictionary searched to
    // the end again and copied the rest of the file (time growing with the square of the size; a 5 MB file copied 20 times: P6-007)
    if (end < 0) break;
    // every path below moves past this stream, so no stream is read from inside another
    re.lastIndex = Math.max(re.lastIndex, end);
    if (!/\/Subtype\s*\/Image\b/.test(dict)) continue;
    const obj = src.slice(Math.max(0, m.index - 40), m.index).match(/(\d+)\s+(\d+)\s+obj\s*$/);
    if (obj && masks.has(`${obj[1]} ${obj[2]}`)) continue;
    // with no trusted /Length the data runs to "endstream", end-of-line included. Only a JPEG has it taken off: a JPEG ends FF D9, so a CR
    // or LF after that is never its own. A Flate or unfiltered stream's last byte can be 0x0D or 0x0A, and taking it as the end-of-line
    // broke the page (reviewer4-04); zlib stops at the end of its own stream, and a bitmap is read for W x H bytes, so the extra byte is harmless
    const data = buf.subarray(start, Math.max(start, end));
    if (!data.length) { skipped++; continue; }
    const W = Number(dict.match(/\/Width\s+(\d+)/)?.[1]), H = Number(dict.match(/\/Height\s+(\d+)/)?.[1]);
    if (/\/DCTDecode/.test(dict)) {
      let e = data.length;
      if (end !== start + len) { if (data[e - 1] === 0x0a) e--; if (data[e - 1] === 0x0d) e--; }
      images.push(Buffer.from(data.subarray(0, e)));
    }
    else if ((/\/FlateDecode/.test(dict) || !/\/Filter/.test(dict)) && !/\/DecodeParms/.test(dict) && Number(dict.match(/\/BitsPerComponent\s+(\d+)/)?.[1]) === 8 && W > 0 && H > 0 && W * H <= 40_000_000) {
      // an 8-bit bitmap, Flate-packed or stored as it is
      // a scanner's ICC colour space ("/ColorSpace 9 0 R" or "[/ICCBased 7 0 R]") names its channels in another object, followed here: its
      // /N, else the page's own size, tells grey (W x H) from RGB (3 W H), and anything else (CMYK, a palette, a separation) is skipped.
      // Only the two device spaces were read (reviewer2-15)
      const known = channels(dict.match(/\/ColorSpace\s*(\/[A-Za-z]+|\d+\s+\d+\s+R|\[[^\]]*\])/)?.[1] ?? "");
      if (known === 0) { skipped++; continue; }
      const need = W * H * (known ?? 3);
      // decided before anything is inflated: a bitmap the caller does not want, or one past the budget, costs nothing
      if (!bitmaps || bitmapBytes + need > maxBitmapBytes) { skipped++; re.lastIndex = Math.max(re.lastIndex, end); continue; }
      bitmapBytes += need;
      try {
        const flate = /\/FlateDecode/.test(dict);
        const px = flate ? zlib.inflateSync(data, { maxOutputLength: need + 1024 }) : data;
        // an unfiltered stream may still hold its end-of-line (at most 2 bytes); a Flate one is its exact size
        const fits = (ch: number) => px.length >= W * H * ch && px.length <= W * H * ch + (flate ? 0 : 2);
        const ch = known ? (px.length >= need ? known : 0) : fits(3) ? 3 : fits(1) ? 1 : 0;
        if (!ch) { skipped++; continue; }
        images.push(ocrPage(px, W, H, ch));
      } catch { skipped++; }
    } else skipped++;
    re.lastIndex = Math.max(re.lastIndex, end);
  }
  return { images, skipped };
}
