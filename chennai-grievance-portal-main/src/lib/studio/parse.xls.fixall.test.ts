import { describe, expect, it } from "vitest";
import { ParseError, parseAll } from "@/lib/studio/parse";

// pass4-open-05 (pass 4's PB-265 for .xls): a file named .xls that is neither a legacy workbook (OLE) nor a zip went to SheetJS,
// which reads any text as a one-sheet workbook: plain words came back as one table with no rows, "no data", not "unreadable".
// Real non-OLE .xls files are HTML or XML tables, or tab- or comma-separated text saved with an .xls name; those are still read.
const said = (text: string | Buffer, name: string) => {
  try { const t = parseAll(Buffer.isBuffer(text) ? text : Buffer.from(text), name); return `parsed ${t.length} table(s), ${t[0]?.rows.length ?? 0} rows`; } catch (e) { return `${e instanceof ParseError ? "ParseError" : (e as Error).name}: ${(e as Error).message}`; }
};

describe("pass4-open-05: a .xls that is not a workbook is called unreadable", () => {
  it("plain words named .xls", () => {
    expect(said("this is not a spreadsheet at all, just words", "old.xls")).toMatch(/ParseError: "old\.xls" could not be opened as an Excel workbook/);
  });
  it("binary bytes named .xls (no OLE header)", () => {
    expect(said(Buffer.from([0x11, 0x00, 0x22, 0x0a, 0x00, 0x7f, 0x0a, 0x01, 0x02]), "b.xls")).toMatch(/ParseError: .*could not be/);
  });
  it("tab- and comma-separated text and an HTML table saved as .xls are still read", () => {
    expect(said("ward\tcount\n1\t2\n2\t3\n", "t.xls")).toBe("parsed 1 table(s), 2 rows");
    expect(said("ward,count\n1,2\n2,3\n", "c.xls")).toBe("parsed 1 table(s), 2 rows");
    expect(said("<html><body><table><tr><td>ward</td><td>n</td></tr><tr><td>1</td><td>2</td></tr></table></body></html>", "h.xls")).toBe("parsed 1 table(s), 1 rows");
  });
});
