import { describe, expect, it } from "vitest";
import { Inflate, docxTables, pdfTables, unent } from "@/lib/studio/formats";

// fixall-studio-lazy-01, -02: two Studio readers still used lazy patterns of the unclosed-tag kind (reviewer5-10 fixed the others): Word
// tables (<w:tbl>([\s\S]*?)<\/w:tbl>, and w:tr, w:tc, w:t) and the CDATA step of unent. Each searched to the end of the text again for
// every opening with no end, so the time grew with the square of the input: 400 KB of unclosed <w:tbl> 4.5 s, of <w:t> in one cell
// 4.2 s, of "<![CDATA[" 1.5 s (1 MB: about 28 s and 10 s). Each is now read in one pass, well inside a second at 1 MB. pdfStreams'
// dictionary pattern was timed too and is not affected (5 MB of crafted dictionaries in under 60 ms): its case here is a guard.
const ms = (f: () => unknown) => { const t = performance.now(); try { f(); } catch { /* refused: what is timed is the reading */ } return performance.now() - t; };
const MB = 1024 * 1024;
const fill = (unit: string, bytes = MB) => unit.repeat(Math.floor(bytes / unit.length));

function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], cds: Buffer[] = [];
  let off = 0;
  for (const [n, c] of Object.entries(files)) {
    const data = Buffer.from(c), nm = Buffer.from(n);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cds.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(cds);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const docx = (body: string) => storedZip({ "word/document.xml": `<w:document><w:body>${body}</w:body></w:document>`, "[Content_Types].xml": "<Types/>" });

describe("fixall-studio-lazy: unclosed Word table tags and CDATA sections are read in one pass", () => {
  it("fixall-studio-lazy-01: 1 MB of unclosed <w:tbl>, and of unclosed <w:t> in one closed cell, each well inside a second", () => {
    expect(ms(() => docxTables(docx(fill("<w:tbl>"))))).toBeLessThan(1000);
    expect(ms(() => docxTables(docx(`<w:tbl><w:tr><w:tc>${fill("<w:t>")}</w:tc></w:tr></w:tbl>`)))).toBeLessThan(1000);
  }, 120_000);

  it("fixall-studio-lazy-02: 1 MB of unclosed CDATA sections, well inside a second, the text left as it is", () => {
    const s = fill("<![CDATA[");
    let out = "";
    expect(ms(() => { out = unent(s); })).toBeLessThan(1000);
    expect(out).toBe(s);
  }, 120_000);

  it("pdfStreams: 5 MB of crafted dictionaries, nested and unclosed, well inside a second (not affected)", () => {
    for (const unit of ["<<", "<</A <</B <<", "<</A x ", "<</A <</B <</C <</D 1>> >> >> >>\nstream\n"]) {
      const pdf = Buffer.from("%PDF-1.4\n" + fill(unit, 5 * MB) + "\n%%EOF", "latin1");
      expect(ms(() => pdfTables(pdf, new Inflate(pdf.length))), unit).toBeLessThan(1000);
    }
  });

  it("well-formed Word tables and CDATA read as before", () => {
    const cell = (t: string, extra = "") => `<w:tc><w:tcPr><w:tcW w:w="100"/>${extra}</w:tcPr><w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
    const body = `<w:tbl><w:tblPr><w:tblStyle w:val="x"/></w:tblPr><w:tblGrid><w:gridCol/></w:tblGrid>
      <w:tr w:rsidR="00A1"><w:trPr/>${cell("Zone")}${cell("Count", '<w:gridSpan w:val="2"/>')}</w:tr>
      <w:tr>${cell("Adyar")}<w:tc><w:p><w:r><w:t>1</w:t><w:t/></w:r><w:r><w:t>2</w:t></w:r></w:p></w:tc>${cell("&amp; more")}</w:tr></w:tbl>
      <w:p><w:r><w:t>not a table</w:t></w:r></w:p>`;
    expect(docxTables(docx(body))).toEqual([[["Zone", "Count", "Count"], ["Adyar", "1 2", "& more"]]]);
    expect(unent("a <![CDATA[<b> & c]]> d &amp; e")).toBe("a <b> & c d & e");
  });
});
