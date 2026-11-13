import zlib from "node:zlib";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { unzip, zipIntact } from "@/lib/studio/formats";
import { parseAll } from "@/lib/studio/parse";

// reviewer5-05: zipIntact (and unzip) read an entry's sizes and local offset, and the end record's fields, as 32-bit values and never the
// zip64 extra field (0x0001) or the zip64 end record, so a valid workbook whose table of contents carries 0xFFFFFFFF sizes (some streaming
// writers always write them) was refused as "incomplete or damaged: it may have been cut off", though SheetJS reads it.
interface E { name: string; data: Buffer }
const plainEntries = (buf: Buffer): E[] => unzip(buf).map((e) => ({ name: e.name, data: e.data }));

/** A ZIP of these entries; z64 puts every size and offset in the zip64 extra, and `end64` writes the zip64 end record and locator too. */
function build(ents: E[], { z64 = true, end64 = false } = {}): Buffer {
  const parts: Buffer[] = [], cds: Buffer[] = [];
  let off = 0;
  for (const e of ents) {
    const raw = zlib.deflateRawSync(e.data), crc = zlib.crc32(e.data) >>> 0, nm = Buffer.from(e.name);
    const lx = Buffer.alloc(z64 ? 20 : 0);
    if (z64) { lx.writeUInt16LE(1, 0); lx.writeUInt16LE(16, 2); lx.writeBigUInt64LE(BigInt(e.data.length), 4); lx.writeBigUInt64LE(BigInt(raw.length), 12); }
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(z64 ? 45 : 20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(z64 ? 0xffffffff : raw.length, 18); lh.writeUInt32LE(z64 ? 0xffffffff : e.data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(lx.length, 28);
    parts.push(lh, nm, lx, raw);
    // central: usize, csize and the local offset all in the extra, in that order
    const cx = Buffer.alloc(z64 ? 28 : 0);
    if (z64) { cx.writeUInt16LE(1, 0); cx.writeUInt16LE(24, 2); cx.writeBigUInt64LE(BigInt(e.data.length), 4); cx.writeBigUInt64LE(BigInt(raw.length), 12); cx.writeBigUInt64LE(BigInt(off), 20); }
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(45, 4); ch.writeUInt16LE(z64 ? 45 : 20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(z64 ? 0xffffffff : raw.length, 20); ch.writeUInt32LE(z64 ? 0xffffffff : e.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt16LE(cx.length, 30);
    ch.writeUInt32LE(z64 ? 0xffffffff : off, 42);
    cds.push(Buffer.concat([ch, nm, cx]));
    off += 30 + nm.length + lx.length + raw.length;
  }
  const cd = Buffer.concat(cds);
  const tail: Buffer[] = [];
  if (end64) {
    const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(ents.length), 24); r.writeBigUInt64LE(BigInt(ents.length), 32); r.writeBigUInt64LE(BigInt(cd.length), 40); r.writeBigUInt64LE(BigInt(off), 48);
    const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(off + cd.length), 8); loc.writeUInt32LE(1, 16);
    tail.push(r, loc);
  }
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0);
  eo.writeUInt16LE(end64 ? 0xffff : ents.length, 8); eo.writeUInt16LE(end64 ? 0xffff : ents.length, 10);
  eo.writeUInt32LE(end64 ? 0xffffffff : cd.length, 12); eo.writeUInt32LE(end64 ? 0xffffffff : off, 16);
  return Buffer.concat([...parts, cd, ...tail, eo]);
}

const ws = XLSX.utils.aoa_to_sheet([["ward", "complaints"], ...Array.from({ length: 50 }, (_, i) => ["W" + i, i * 3])]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data");
const ents = plainEntries(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);

describe("reviewer5-05: a workbook whose table of contents uses zip64 fields is read", () => {
  it("zip64 sizes and offsets in each entry's extra field", () => {
    const buf = build(ents);
    expect(zipIntact(buf)).toBe(true);
    expect(parseAll(buf, "report.xlsx")[0].rows.length).toBe(50);
  });
  it("and a zip64 end record as well", () => {
    const buf = build(ents, { end64: true });
    expect(zipIntact(buf)).toBe(true);
    expect(parseAll(buf, "report.xlsx")[0].rows.length).toBe(50);
  });
  it("a zip64 workbook cut short is still refused", () => {
    const buf = build(ents);
    let c = buf.length - 22; while (buf.readUInt32LE(c) !== 0x06054b50) c--;
    // the table of contents and end record kept, the first entry's data cut out from under them
    const cut = Buffer.concat([buf.subarray(0, 60), buf.subarray(c - 2000)]);
    expect(zipIntact(cut)).toBe(false);
    // an entry whose zip64 size runs past the table of contents
    const big = Buffer.from(buf);
    const at = big.readUInt32LE(c + 16);
    big.writeBigUInt64LE(BigInt(big.length), at + 46 + big.readUInt16LE(at + 28) + 12);
    expect(zipIntact(big)).toBe(false);
  });
});
