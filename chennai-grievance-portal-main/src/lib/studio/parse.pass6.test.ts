/**
 * QA pass 6, P6-008 (found by the pass4-open hunter): the first 30 or 40 bytes of an Excel workbook made SheetJS's XLSX.read run without
 * ever returning, on the server's own thread, so one cut-off upload to the Data Studio stalled the whole site. A workbook is a ZIP; one
 * whose table of contents (the end record) is missing or points outside the file is now refused before SheetJS reads it.
 * Without the fix this file does not finish (the run has to be killed), which is the failure.
 */
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseFile } from "@/lib/studio/parse";
import { zipIntact } from "@/lib/studio/formats";

const book = (): Buffer => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Ward", "Complaints"], [1, 4], [2, 7]]), "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
};

/** the hunter's case: a one-file ZIP as a workbook starts, cut after 30 or 40 bytes (inside the first file's header) */
const started = (): Buffer => Buffer.from(zipSync({ "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types>') }));

describe("QA pass 6, P6-008: a cut-off workbook is refused at once", () => {
  for (const n of [30, 40]) {
    it(`the first ${n} bytes of a workbook's ZIP (the case that never returned): a clear refusal, in under a second`, () => {
      const t0 = performance.now();
      expect(() => parseFile(started().subarray(0, n), "register.xlsx")).toThrow(/damaged|cut off|could not be/i);
      expect(performance.now() - t0).toBeLessThan(1000);
    });
  }
  for (const n of [30, 40, 64, 200]) {
    it(`the first ${n} bytes of a workbook: a clear refusal, in under a second`, () => {
      const t0 = performance.now();
      expect(() => parseFile(book().subarray(0, n), "register.xlsx")).toThrow(/damaged|cut off|could not be/i);
      expect(performance.now() - t0).toBeLessThan(1000);
    });
  }
  it("all but the last bytes (the end record cut) is refused too", () => {
    const b = book();
    expect(() => parseFile(b.subarray(0, b.length - 10), "register.xlsx")).toThrow(/damaged|cut off|could not be/i);
  });
  it("a whole workbook still reads", () => {
    const t = parseFile(book(), "register.xlsx");
    expect(t.headers).toEqual(["Ward", "Complaints"]);
    expect(t.rows).toHaveLength(2);
  });
  it("zipIntact: whole yes, cut no, an end record pointing outside the file no", () => {
    const b = book();
    expect(zipIntact(b)).toBe(true);
    expect(zipIntact(b.subarray(0, 40))).toBe(false);
    const bad = Buffer.from(b);
    const eocd = bad.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    bad.writeUInt32LE(bad.length * 2, eocd + 16);
    expect(zipIntact(bad)).toBe(false);
  });
});

describe("QA pass 6, P6-008 after review (reviewer 3): an intact table of contents over a cut-off entry, and other PK starts", () => {
  const NAME = "[Content_Types].xml";
  const withToc = (csize: number, usize: number): Buffer => {
    const loc = started().subarray(0, 40);
    const cd = Buffer.alloc(46 + NAME.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(csize, 20); cd.writeUInt32LE(usize, 24); cd.writeUInt16LE(NAME.length, 28); cd.write(NAME, 46);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(loc.length, 16);
    return Buffer.concat([Buffer.from(loc), cd, end]);
  };
  it("a cut-off entry under a well-formed table of contents is not whole, and is refused at once", () => {
    expect(zipIntact(withToc(30, 100_000_000))).toBe(false);
    const t0 = performance.now();
    expect(() => parseFile(withToc(30, 100_000_000), "register.xlsx")).toThrow(/damaged|cut off|could not be/i);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  for (const [a, b] of [[0x07, 0x08], [0x05, 0x06], [0x01, 0x02], [0x03, 0x03]]) {
    it(`the cut-off bytes starting PK ${a}/${b}, named .xls, are refused at once`, () => {
      const buf = Buffer.from(started().subarray(0, 40)); buf[2] = a; buf[3] = b;
      const t0 = performance.now();
      expect(() => parseFile(buf, "register.xls")).toThrow();
      expect(performance.now() - t0).toBeLessThan(1000);
    });
  }
});

describe("QA pass 6, P6-030 (reviewer 5 on P6-018): an end record whose two entry counts disagree", () => {
  it("1 entry on this disk and 0 in all, over the cut-off 40 bytes: not whole, refused at once", () => {
    const loc = started().subarray(0, 40);
    const NAME = "[Content_Types].xml";
    const cd = Buffer.alloc(46 + NAME.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(30, 20); cd.writeUInt32LE(100, 24); cd.writeUInt16LE(NAME.length, 28); cd.write(NAME, 46);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(0, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(loc.length, 16);
    const buf = Buffer.concat([Buffer.from(loc), cd, end]);
    expect(zipIntact(buf)).toBe(false);
    const t0 = performance.now();
    expect(() => parseFile(buf, "register.xlsx")).toThrow();
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
