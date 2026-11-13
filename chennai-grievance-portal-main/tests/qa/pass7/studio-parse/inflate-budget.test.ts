/**
 * QA pass 7, studio-parse, rows p7-studio-egress-18 and -19: a small file must not unpack to a large one, in any format. One budget per
 * uploaded file (formats.ts Inflate: 100 times the file's size, at least 1 MB, at most 200 MB), and every inflate goes through it: the
 * entries of a ZIP, the entries of a workbook (inflated by zlib before SheetJS sees the workbook), the text streams of a PDF; nested
 * parts (a workbook inside a ZIP) share the upload's budget. The reader's memory watchdog stays the backstop, not the rule.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-parse/inflate-budget.test.ts < /dev/null
 */
import zlib from "node:zlib";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParseError, parseAll, parseFile } from "@/lib/studio/parse";
import { pdfTables, unzip } from "@/lib/studio/formats";

const MB = 1024 * 1024;
/** Bytes zlib inflated while `f` ran (both entry points formats.ts uses). */
function inflated<T>(f: () => T): { value: T | Error; bytes: number } {
  let bytes = 0;
  const raw = zlib.inflateRawSync, wrapped = zlib.inflateSync;
  const a = vi.spyOn(zlib, "inflateRawSync").mockImplementation(((d: zlib.InputType, o?: zlib.ZlibOptions) => { const r = raw(d, o); bytes += r.length; return r; }) as typeof zlib.inflateRawSync);
  const b = vi.spyOn(zlib, "inflateSync").mockImplementation(((d: zlib.InputType, o?: zlib.ZlibOptions) => { const r = wrapped(d, o); bytes += r.length; return r; }) as typeof zlib.inflateSync);
  try { return { value: f(), bytes }; } catch (e) { return { value: e as Error, bytes }; } finally { a.mockRestore(); b.mockRestore(); }
}
afterEach(() => vi.restoreAllMocks());

/** A ZIP of deflated entries, sizes and CRC right (stored = method 0). */
function zipOf(entries: { name: string; data: Buffer; stored?: boolean }[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), comp = e.stored ? e.data : zlib.deflateRawSync(e.data, { level: 9 }), crc = zlib.crc32(e.data) >>> 0, method = e.stored ? 0 : 8;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    local.push(h, name, comp); central.push(c, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, end]);
}
const book = (rows = 6) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Zone", "Complaints"], ...Array.from({ length: rows }, (_, i) => [`Zone ${i + 1}`, 10 + i])]), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
};
/** A PDF of `n` Flate streams each inflating to `mb` MB of zeros; `image` makes them image XObjects. */
function pdfOf(n: number, mb: number, image = false): Buffer {
  const one = zlib.deflateSync(Buffer.alloc(mb * MB));
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  for (let i = 0; i < n; i++) parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${image ? "/Type /XObject /Subtype /Image /Width 1 /Height 1 " : ""}/Filter /FlateDecode /Length ${one.length} >>\nstream\n`, "latin1"), one, Buffer.from("\nendstream\nendobj\n", "latin1"));
  parts.push(Buffer.from("trailer\n<< >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}
const budgetOf = (bytes: number) => Math.min(200 * MB, Math.max(1 * MB, 100 * bytes));

describe("p7-studio-egress-18: a PDF's streams", () => {
  it("4 text streams of 20 MB from an ~80 KB PDF: refused once the budget (100x the file) is spent, never 80 MB inflated", () => {
    const pdf = pdfOf(4, 20);
    const r = inflated(() => pdfTables(pdf));
    console.log("pdf text streams:", { kb: Math.round(pdf.length / 1024), inflatedMb: +(r.bytes / MB).toFixed(1), budgetMb: +(budgetOf(pdf.length) / MB).toFixed(1), result: r.value instanceof Error ? r.value.message.slice(0, 70) : "read" });
    expect(r.bytes).toBeLessThanOrEqual(budgetOf(pdf.length));
    expect((r.value as Error).message).toMatch(/unpacks to far more than its size/);
  });
  it("image streams (pdfTables never reads them) are not inflated at all", () => {
    const pdf = pdfOf(4, 20, true);
    const r = inflated(() => pdfTables(pdf));
    expect(r.bytes).toBe(0);
    expect(r.value).toMatchObject({ scanned: true });
  });
});

describe("p7-studio-egress-19: a workbook's entries", () => {
  it("a ~30 KB .xlsx holding a 30 MB entry: refused before SheetJS reads it, never 30 MB inflated", () => {
    const base = unzip(book());
    const bomb = zipOf([...base, { name: "xl/media/pad.bin", data: Buffer.alloc(30 * MB, 32) }]);
    const r = inflated(() => parseFile(bomb, "bomb.xlsx"));
    console.log("xlsx bomb:", { kb: Math.round(bomb.length / 1024), inflatedMb: +(r.bytes / MB).toFixed(1), budgetMb: +(budgetOf(bomb.length) / MB).toFixed(1), result: r.value instanceof Error ? r.value.message.slice(0, 70) : "read" });
    expect(r.value).toBeInstanceOf(ParseError);
    expect((r.value as Error).message).toMatch(/unpacks to far more than its size/);
    expect(r.bytes).toBeLessThanOrEqual(budgetOf(bomb.length));
  });
  it("a workbook inside a ZIP shares the upload's budget: 20 workbooks of 4 MB entries from a small archive are refused", () => {
    const pad = unzip(book());
    const inner = zipOf([...pad, { name: "xl/media/pad.bin", data: Buffer.alloc(4 * MB, 32) }]);
    // the inner workbooks are stored in the archive: the archive is about as large as its workbooks, each of which unpacks 4 MB
    const archive = zipOf(Array.from({ length: 20 }, (_, i) => ({ name: `zone${i + 1}.xlsx`, data: inner, stored: true })));
    const r = inflated(() => parseAll(archive, "zones.zip"));
    console.log("nested:", { kb: Math.round(archive.length / 1024), inflatedMb: +(r.bytes / MB).toFixed(1), budgetMb: +(budgetOf(archive.length) / MB).toFixed(1), result: r.value instanceof Error ? r.value.message.slice(0, 70) : `${(r.value as unknown[]).length} tables` });
    // SheetJS inflated these with its own code (zlib never saw them): refusing the file is what shows the shared budget
    expect((r.value as Error).message).toMatch(/unpacks to far more than its size/);
    expect(r.bytes).toBeLessThanOrEqual(budgetOf(archive.length));
  });
});

describe("a ZIP archive's entries", () => {
  it("CSV entries at 200x each (under the 400x entry rule, under 60 MB in all) from a small archive: refused at 100x the archive", () => {
    // about 160x each (a plain repeated row is past 400x, which the entry rule already refuses)
    let text = "Ward,Zone,Complaints\n";
    for (let i = 0; text.length < 2 * MB; i++) text += `W${i % 30},Zone ${i % 15},${i % 7}\n`;
    const csv = Buffer.from(text);
    const archive = zipOf(Array.from({ length: 12 }, (_, i) => ({ name: `ward${i}.csv`, data: csv })));
    const r = inflated(() => parseAll(archive, "wards.zip"));
    console.log("csv archive:", { kb: Math.round(archive.length / 1024), ratio: Math.round(12 * csv.length / archive.length), inflatedMb: +(r.bytes / MB).toFixed(1), budgetMb: +(budgetOf(archive.length) / MB).toFixed(1), result: r.value instanceof Error ? r.value.message.slice(0, 70) : `${(r.value as unknown[]).length} tables` });
    expect(r.bytes).toBeLessThanOrEqual(budgetOf(archive.length));
    expect((r.value as Error).message).toMatch(/unpacks to far more than its size/);
  });
});

describe("ordinary files read as before", () => {
  it("a workbook of 2 000 rows and two sheets, a ZIP of CSVs at about 5x: the same tables as SheetJS and the CSV reader give", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Ward", "Zone", "Complaints"], ...Array.from({ length: 2000 }, (_, i) => [`W${i % 200}`, `Zone ${(i % 15) + 1}`, i * 3])]), "Data");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Note"], ["Collected by the zonal offices"], ["Checked"]]), "Notes");
    const xlsx = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
    const t = parseAll(xlsx, "wards.xlsx");
    expect(t[0].rows).toHaveLength(2000);
    expect(t[0].rows[0]).toEqual(["W0", "Zone 1", 0]);
    const ref = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(xlsx, { type: "buffer" }).Sheets.Data, { header: 1 });
    expect(t[0].rows.map((r) => r[2])).toEqual(ref.slice(1).map((r) => r[2]));
    const csvs = Array.from({ length: 3 }, (_, k) => ({ name: `z${k}.csv`, data: Buffer.from("Ward,Complaints\n" + Array.from({ length: 500 }, (_, i) => `W${(i * 7919 + k) % 9973},${(i * 31) % 97}`).join("\n")) }));
    const z = parseAll(zipOf(csvs), "zones.zip");
    expect(z.map((x) => x.rows.length)).toEqual([500, 500, 500]);
  });
});
