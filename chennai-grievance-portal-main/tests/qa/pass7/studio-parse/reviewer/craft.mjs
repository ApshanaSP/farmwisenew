// Crafted files for the reviewer's probes (plain JS so the scratch harnesses and the vitest files share them).
import zlib from "node:zlib";

/** A ZIP of deflated entries (CRC and sizes right). */
export function zip(entries) {
  const parts = [], cds = []; let off = 0;
  for (const [name, data0] of entries) {
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(data0);
    const raw = zlib.deflateRawSync(data, { level: 9 }); const crc = zlib.crc32(data); const nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, raw);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(45, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cds.push(Buffer.concat([ch, nm])); off += 30 + nm.length + raw.length;
  }
  const cd = Buffer.concat(cds); const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10);
  eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, eo]);
}

const col = (c) => { let s = ""; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

/**
 * A workbook whose every cell (rows x cols, under a header row) points at ONE shared string of `len` characters. SheetJS gives every cell the
 * same string; the reader's reply copies it once per cell.
 */
export function sharedStringXlsx(rows, cols, len) {
  const head = `<row r="1">${Array.from({ length: cols }, (_, c) => `<c r="${col(c)}1" t="inlineStr"><is><t>h${c}</t></is></c>`).join("")}</row>`;
  const body = [];
  for (let r = 2; r <= rows + 1; r++) {
    let row = `<row r="${r}">`;
    for (let c = 0; c < cols; c++) row += `<c r="${col(c)}${r}" t="s"><v>0</v></c>`;
    body.push(row + "</row>");
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${col(cols - 1)}${rows + 1}"/><sheetData>${head}${body.join("")}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>${"Zone 9 Teynampet ".repeat(Math.ceil(len / 17)).slice(0, len)}</t></si></sst>`;
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/sharedStrings.xml", sst]
  ]);
}

/** redteam-gate-05's workbook: one entry whose deflate stream never ends (SheetJS's inflate loops for ever). */
export function unendedDeflate() {
  const data = Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]); const n = Buffer.from("[Content_Types].xml");
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(100, 22); loc.writeUInt16LE(n.length, 26);
  const local = Buffer.concat([loc, n, data]);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(100, 24); cd.writeUInt16LE(n.length, 28);
  const cdAll = Buffer.concat([cd, n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cdAll.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cdAll, end]);
}
