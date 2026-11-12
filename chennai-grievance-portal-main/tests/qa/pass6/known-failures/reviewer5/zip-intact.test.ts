// reviewer5 probe on P6-018 (56a9ecb): zipIntact() + excelAll().
//  (a) a WHOLE, structurally intact ZIP whose sheet entry has a broken deflate stream (1 byte, or 40 x 0xFF) passes zipIntact and SheetJS
//      still never returns (run in a child process under a 10 s limit so the probe itself cannot hang);
//  (b) a valid workbook whose central directory uses the zip64 size fields is refused as "cut off", though SheetJS reads it.
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/zip-intact.test.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { zipIntact } from "@/lib/studio/formats";
import { parseAll } from "@/lib/studio/parse";

const crc32 = (b: Buffer) => { let c: number, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
interface E { name: string; data: Buffer; raw?: Buffer; z64cd?: boolean }
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
    const x = Buffer.alloc(e.z64cd ? 20 : 0); if (e.z64cd) { x.writeUInt16LE(1, 0); x.writeUInt16LE(16, 2); x.writeBigUInt64LE(BigInt(e.data.length), 4); x.writeBigUInt64LE(BigInt(raw.length), 12); }
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(e.z64cd ? 45 : 20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.z64cd ? 0xffffffff : raw.length, 18); lh.writeUInt32LE(e.z64cd ? 0xffffffff : e.data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(x.length, 28);
    parts.push(lh, nm, x, raw);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(45, 4); ch.writeUInt16LE(e.z64cd ? 45 : 20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.z64cd ? 0xffffffff : raw.length, 20); ch.writeUInt32LE(e.z64cd ? 0xffffffff : e.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt16LE(x.length, 30); ch.writeUInt32LE(off, 42);
    cds.push(Buffer.concat([ch, nm, x])); off += 30 + nm.length + x.length + raw.length;
  }
  const cd = Buffer.concat(cds); const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(ents.length, 8); eo.writeUInt16LE(ents.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, eo]);
}
const ws = XLSX.utils.aoa_to_sheet([["ward", "complaints"], ...Array.from({ length: 50 }, (_, i) => ["W" + i, i * 3])]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data");
const valid = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
const ents = entries(valid);
const s = ents.findIndex((e) => /sheet1\.xml$/.test(e.name));

/** XLSX.read with the same options as excelAll, in a child process: "returned" or "hung". */
function sheetjs(buf: Buffer): string {
  const f = path.join(os.tmpdir(), `r5-${process.pid}-${Math.random().toString(36).slice(2)}.xlsx`); fs.writeFileSync(f, buf);
  const r = spawnSync(process.execPath, ["-e", `const X=require(${JSON.stringify(path.resolve("node_modules/xlsx"))});try{X.read(require("fs").readFileSync(process.argv[1]),{type:"buffer",cellDates:false,cellNF:true,cellText:false,sheetRows:5040});console.log("returned")}catch(e){console.log("threw "+e.message)}`, f], { timeout: 10_000, encoding: "utf8" });
  fs.rmSync(f, { force: true });
  return r.error ? "hung (killed after 10 s)" : r.stdout.trim();
}

describe("reviewer5 on P6-018", () => {
  for (const [label, raw] of [["1-byte deflate stream", zlib.deflateRawSync(ents[s].data).subarray(0, 1)], ["40 x 0xFF deflate stream", Buffer.alloc(40, 0xff)]] as const) {
    it(`a whole ZIP with a ${label} in the sheet: zipIntact lets it through, and SheetJS must still return`, () => {
      const buf = build(ents.map((e, i) => (i === s ? { ...e, raw } : e)));
      expect(zipIntact(buf)).toBe(true);
      const r = sheetjs(buf);
      console.log(label, buf.length, "bytes:", r);
      expect(r).not.toMatch(/hung/);
    }, 30_000);
  }
  it("a valid workbook with zip64 size fields in its table of contents is read, not called cut off", () => {
    const buf = build(ents.map((e) => ({ ...e, z64cd: true })));
    console.log("zip64 central sizes: SheetJS alone ->", sheetjs(buf));
    let res = "";
    try { res = `read ${parseAll(buf, "report.xlsx")[0].rows.length} rows`; } catch (e) { res = String((e as Error).message); }
    console.log("parseAll ->", res);
    expect(res).toMatch(/^read 50 rows/);
  }, 30_000);
});

// zipIntact counts entries from the end record's "total entries" (offset 10); SheetJS (CFB parse_zip) loops over "entries on this disk"
// (offset 8). The hunter's cut-off workbook (its first 40 bytes) with a table of contents for it and an end record saying 1 / 0:
describe("reviewer5 on P6-018: the two entry counts of the end record", () => {
  it("first 40 bytes of a workbook + its central entry + end record (this disk 1, total 0): refused, or SheetJS returns", () => {
    const cut = valid.subarray(0, 40);
    let c = valid.length - 22; while (valid.readUInt32LE(c) !== 0x06054b50) c--;
    const cdAt = valid.readUInt32LE(c + 16), nl = valid.readUInt16LE(cdAt + 28), xl = valid.readUInt16LE(cdAt + 30), cl = valid.readUInt16LE(cdAt + 32);
    const entry = Buffer.from(valid.subarray(cdAt, cdAt + 46 + nl + xl + cl)); // the first entry's central record, local header at 0
    const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(0, 10); eo.writeUInt32LE(entry.length, 12); eo.writeUInt32LE(40, 16);
    const buf = Buffer.concat([cut, entry, eo]);
    console.log("two counts:", buf.length, "bytes, zipIntact:", zipIntact(buf));
    if (!zipIntact(buf)) return;
    const r = sheetjs(buf);
    console.log("two counts: SheetJS ->", r);
    expect(r).not.toMatch(/hung/);
  }, 30_000);
});
