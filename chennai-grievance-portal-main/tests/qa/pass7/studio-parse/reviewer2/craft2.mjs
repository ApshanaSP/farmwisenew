// Reviewer 2: crafted files (plain JS). zip() is the first reviewer's builder.
import { zip } from "../reviewer/craft.mjs";

const col = (c) => { let s = ""; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

/**
 * A workbook of `sheets` sheets, each a small table (a header row, `rows` rows x 2 columns) whose cells all point at ONE shared string of
 * `len` characters. SheetJS gives every cell of every sheet the same string; the packed reply dedups texts per TABLE only, so each sheet
 * carries its own copy.
 */
export function sheetsXlsx(sheets, rows, len) {
  const sheet = () => {
    const head = `<row r="1"><c r="A1" t="inlineStr"><is><t>ward</t></is></c><c r="B1" t="inlineStr"><is><t>remarks</t></is></c></row>`;
    let body = "";
    for (let r = 2; r <= rows + 1; r++) body += `<row r="${r}"><c r="A${r}"><v>${r}</v></c><c r="B${r}" t="s"><v>0</v></c></row>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B${rows + 1}"/><sheetData>${head}${body}</sheetData></worksheet>`;
  };
  const ids = Array.from({ length: sheets }, (_, i) => i + 1);
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ids.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${ids.map((i) => `<sheet name="Zone ${i}" sheetId="${i}" r:id="rId${i}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${sheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>${"Zone 9 Teynampet ".repeat(Math.ceil(len / 17)).slice(0, len)}</t></si></sst>`;
  const s = sheet();
  return zip([
    ["[Content_Types].xml", types],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", wb],
    ["xl/_rels/workbook.xml.rels", rels],
    ...ids.map((i) => [`xl/worksheets/sheet${i}.xml`, s]),
    ["xl/sharedStrings.xml", sst]
  ]);
}
