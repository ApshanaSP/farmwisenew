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
