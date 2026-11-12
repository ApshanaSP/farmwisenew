/**
 * Crafted files for the Studio file-reader tests (QA pass 7, studio-parse): the pass 6 probes' builders (redteam-gate's unended deflate,
 * reviewer5's broken sheet streams, reviewer5's run of comments), a PDF of deflate bombs and a few ordinary files.
 */
import zlib from "node:zlib";
import * as XLSX from "xlsx";

/** One deflated entry in a ZIP whose structure is whole (redteam-gate-05's builder, tests/qa/pass6/known-failures/redteam-gate/p6-030-unended-deflate.test.ts). */
export function oneEntryZip(data: Buffer, name = "[Content_Types].xml"): Buffer {
  const n = Buffer.from(name);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(100, 22); loc.writeUInt16LE(n.length, 26);
  const local = Buffer.concat([loc, n, data]);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(100, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const cdAll = Buffer.concat([cd, n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cdAll.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cdAll, end]);
}

/** redteam-gate-05: an empty non-final stored block (00 00 00 FF FF), the stream never ends; SheetJS's inflate loops for ever. */
export const unendedDeflate = () => oneEntryZip(Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]));

const crc32 = (b: Buffer) => { let c: number, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
interface E { name: string; data: Buffer; raw?: Buffer }
function entries(buf: Buffer): E[] {
  let e = buf.length - 22; while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let at = buf.readUInt32LE(e + 16); const out: E[] = [];
  for (let k = 0; k < n; k++) {
    const m = buf.readUInt16LE(at + 10), cs = buf.readUInt32LE(at + 20), nl = buf.readUInt16LE(at + 28), xl = buf.readUInt16LE(at + 30), cl = buf.readUInt16LE(at + 32), lo = buf.readUInt32LE(at + 42);
    const d0 = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28); const raw = buf.subarray(d0, d0 + cs);
    out.push({ name: buf.toString("utf8", at + 46, at + 46 + nl), data: m === 8 ? zlib.inflateRawSync(raw) : raw }); at += 46 + nl + xl + cl;
  }
  return out;
}
function build(ents: E[]): Buffer {
  const parts: Buffer[] = [], cds: Buffer[] = []; let off = 0;
  for (const e of ents) {
    const raw = e.raw ?? zlib.deflateRawSync(e.data); const crc = crc32(e.data); const nm = Buffer.from(e.name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, raw);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(45, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cds.push(Buffer.concat([ch, nm])); off += 30 + nm.length + raw.length;
  }
  const cd = Buffer.concat(cds); const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(ents.length, 8); eo.writeUInt16LE(ents.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, eo]);
}

/** A small valid workbook: ward, complaints, 50 rows. */
export function workbook(rows = 50, sheets = ["Data"]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ward", "complaints"], ...Array.from({ length: rows }, (_, i) => [`W${i}`, i * 3])]), s);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}

/** reviewer5-04: the valid workbook with its sheet's deflate stream replaced (1 byte of it, or 40 x 0xFF): structurally whole, SheetJS never returns. */
export function brokenSheet(kind: "1-byte" | "40xFF"): Buffer {
  const ents = entries(workbook());
  const s = ents.findIndex((e) => /sheet1\.xml$/.test(e.name));
  const raw = kind === "1-byte" ? zlib.deflateRawSync(ents[s].data).subarray(0, 1) : Buffer.alloc(40, 0xff);
  return build(ents.map((e, i) => (i === s ? { ...e, raw } : e)));
}

/** reviewer5-09: an XML of `n` comments, then records (not a feed): the old feed pattern tried 2^(n-1) splits of the comments. */
export const commentsXml = (n: number) => Buffer.from("<?xml version=\"1.0\"?>\n" + "<!-- a -->\n".repeat(n) + "<data><row><a>1</a><b>x</b></row><row><a>2</a><b>y</b></row><row><a>3</a><b>z</b></row><row><a>4</a><b>w</b></row></data>");

/** A text PDF whose `streams` Flate streams each inflate to 39 MB of zeros (just under the 40 MB a stream may inflate to): 20 of them hold 780 MB. */
export function pdfBombs(streams: number): Buffer {
  const z = zlib.deflateSync(Buffer.alloc(39 * 1024 * 1024));
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  for (let i = 0; i < streams; i++) parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from("\nendstream\nendobj\n"));
  parts.push(Buffer.from("trailer\n<< >>\n%%EOF\n"));
  return Buffer.concat(parts);
}

/** A CSV of `rows` x `cols` short numbers. */
export function csv(rows: number, cols: number): Buffer {
  const head = Array.from({ length: cols }, (_, c) => `col${c}`).join(",");
  const line = Array.from({ length: cols }, (_, c) => String(c)).join(",");
  return Buffer.from([head, ...Array.from({ length: rows }, () => line)].join("\n"));
}

export const FEED = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/feed.xsl"?>
<!-- generated -->
<rss version="2.0"><channel><title>Chennai news</title>
<item><title>Rain in Adyar - The Hindu</title><link>https://example.in/a</link><pubDate>Tue, 06 Oct 2026 04:57:39 GMT</pubDate></item>
<item><title>Water supply cut in Zone 9</title><link>https://example.in/b</link><pubDate>Wed, 07 Oct 2026 04:57:39 GMT</pubDate></item>
</channel></rss>`);

export const PAGE = Buffer.from(`<!doctype html><html><head><title>Ward data</title></head><body><!-- nav --><nav><a href="/">Home</a></nav>
<table><tr><th>Ward</th><th>Zone</th><th>Complaints</th></tr>${Array.from({ length: 8 }, (_, i) => `<tr><td>W${i}</td><td>Zone ${i % 3}</td><td>${i * 7}</td></tr>`).join("")}</table>
<a href="/data/wards.csv">Download CSV</a> <a href="?page=2">Next</a><link rel="alternate" type="application/rss+xml" href="/rss.xml"></body></html>`);
