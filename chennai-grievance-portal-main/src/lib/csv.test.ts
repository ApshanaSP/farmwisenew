import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("CSV cells (export, assistant export, chart data, Studio)", () => {
  it("never lets a cell run as a formula in Excel", () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csvCell("+91 call")).toBe("'+91 call");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });
  it("leaves numbers, Tamil and plain text as they are; quotes commas, quotes and line breaks", () => {
    expect(csvCell(-12)).toBe("-12");
    expect(csvCell("-3.5")).toBe("-3.5");
    expect(csvCell("மழைநீர் தேக்கம்")).toBe("மழைநீர் தேக்கம்");
    expect(csvCell("Adyar, Zone 13")).toBe('"Adyar, Zone 13"');
    expect(csvCell(null)).toBe("");
    expect(csvCell("x", true)).toBe('"x"');
  });
});
