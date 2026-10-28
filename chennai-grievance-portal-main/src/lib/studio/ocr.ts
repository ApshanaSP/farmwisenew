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
export function pdfImages(buf: Buffer): { images: Buffer[]; skipped: number } {
  const src = buf.toString("latin1");
  const images: Buffer[] = [];
  let skipped = 0;
  const re = /<<((?:[^<>]|<<[^<>]*>>)*?\/Subtype\s*\/Image(?:[^<>]|<<[^<>]*>>)*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && images.length < 20) {
    const dict = m[1];
    const start = m.index + m[0].length;
    const len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] ?? -1);
    const end = len > 0 ? start + len : src.indexOf("endstream", start);
    const data = buf.subarray(start, end);
    const W = Number(dict.match(/\/Width\s+(\d+)/)?.[1]), H = Number(dict.match(/\/Height\s+(\d+)/)?.[1]);
    if (/\/DCTDecode/.test(dict)) images.push(Buffer.from(data));
    else if ((/\/FlateDecode/.test(dict) || !/\/Filter/.test(dict)) && !/\/DecodeParms/.test(dict) && Number(dict.match(/\/BitsPerComponent\s+(\d+)/)?.[1]) === 8 && W > 0 && H > 0 && W * H <= 40_000_000) {
      // an 8-bit bitmap, Flate-packed or stored as it is
      const rgb = /\/DeviceRGB/.test(dict), grey = /\/DeviceGray/.test(dict);
      if (!rgb && !grey) { skipped++; continue; }
      try {
        const px = /\/FlateDecode/.test(dict) ? zlib.inflateSync(data, { maxOutputLength: W * H * (rgb ? 3 : 1) + 1024 }) : data;
        if (px.length < W * H * (rgb ? 3 : 1)) { skipped++; continue; }
        images.push(Buffer.concat([Buffer.from(`${rgb ? "P6" : "P5"}\n${W} ${H}\n255\n`, "latin1"), px.subarray(0, W * H * (rgb ? 3 : 1))]));
      } catch { skipped++; }
    } else skipped++;
    re.lastIndex = Math.max(re.lastIndex, end);
  }
  return { images, skipped };
}
