// reviewerF-04 (on pass4-open-05, db6b6e87): a .xls that is not OLE was refused as "not a workbook" when its first 4 KB held a NUL byte.
// Excel 2.x, 3.0 and 4.0 worksheets (BIFF2-4) are .xls files that are a bare BIFF stream, not OLE: their first record (BOF, 09 00 04 00 ...)
// holds NULs, and SheetJS reads them. Before db6b6e87 such a file went to excelAll and was read; it must be read again, while other binary
// bytes named .xls stay refused (parse.xls.fixall.test.ts).
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseAll } from "@/lib/studio/parse";

const book = (bookType: "biff2" | "biff3" | "biff4") => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ward", "count"], [1, 2], [2, 3]]), "Sheet1");
  return Buffer.from(XLSX.write(wb, { bookType, type: "buffer" }) as Buffer);
};

describe("reviewerF-04 (pass4-open-05): an old Excel worksheet (BIFF2-4, not OLE) named .xls is still read", () => {
  it("an Excel 2.x worksheet with a header and two rows", () => {
    const buf = book("biff2");
    expect(buf[0] === 0xd0 && buf[1] === 0xcf).toBe(false); // a bare BIFF stream, not an OLE file
    expect(buf.subarray(0, 4096).includes(0)).toBe(true); // which is why the binary-bytes rule refused it
    // SheetJS itself reads it
    expect(XLSX.utils.sheet_to_json(XLSX.read(buf, { type: "buffer" }).Sheets.Sheet1).length).toBe(2);
    const t = parseAll(buf, "old.xls");
    expect(t[0].rows.length).toBe(2);
  });
  it.each(["biff3", "biff4"] as const)("an Excel %s worksheet", (kind) => {
    expect(parseAll(book(kind), "old.xls")[0].rows.length).toBe(2);
  });
  it("binary bytes that only start like a BOF but are not a workbook are still refused", () => {
    const junk = Buffer.concat([Buffer.from([0x09, 0x00, 0x04, 0x00]), Buffer.alloc(200, 0), Buffer.from("garbage")]);
    expect(() => parseAll(junk, "old.xls")).toThrow(/could not be opened as an Excel workbook/);
  });
});
