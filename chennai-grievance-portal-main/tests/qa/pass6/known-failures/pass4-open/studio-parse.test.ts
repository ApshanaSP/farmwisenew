// @ts-nocheck (QA pass 6: a hunter probe kept as a known failure; type errors in its own helpers, not in src)
// QA pass 6, hunter pass4-open: pass 4's PB-265 (RC-43): a corrupt or renamed file named as Excel or CSV is called unreadable, not empty.
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/pass4-open/studio-parse.test.ts
// The pass 4 inputs, then other damaged files a user could upload.
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

const said = async (buf: Buffer, name: string) => {
  const { parseAll } = await import("@/lib/studio/parse");
  try { const t = parseAll(buf, name); return `parsed ${t.length} table(s), ${t[0]?.rows.length ?? 0} rows, ${t[0]?.columns?.length ?? "?"} columns`; } catch (e) { return `${(e as Error).name}: ${(e as Error).message}`; }
};
const UNREADABLE = /could not be (opened|read)|does not (open|look)|not a .*(Excel|text|CSV)|damaged|renamed|cannot be read|unreadable/i;

describe("PB-265: a damaged file is unreadable, not empty", () => {
  it.each([
    ["orig a.xlsx (text)", "a.xlsx", Buffer.from("this is not a zip")],
    ["orig b.csv (binary)", "b.csv", Buffer.from([0, 1, 2, 3, 255, 254, 0, 0, 7, 9, 0, 1])],
    ["variant .xls of plain words", "old.xls", Buffer.from("this is not a spreadsheet at all, just words")],
    ["variant .xlsx that is a zip of a text file", "report.xlsx", Buffer.from(zipSync({ "hello.txt": strToU8("hello") }))]
  ])("%s", async (_n, name, buf) => {
    const msg = await said(buf as Buffer, name as string);
    expect(msg, msg).not.toMatch(/^parsed/);
    expect(msg, msg).not.toMatch(/no rows|is empty|no data|holds no table/i);
    expect(msg, msg).toMatch(UNREADABLE);
  });
  // pass4-open-04: a cut-off .xlsx goes to excelAll -> XLSX.read, which does not return. Run in a worker thread with a time limit (calling parseAll here would
  // hang this whole test file), with the same SheetJS call and options as src/lib/studio/parse.ts excelAll().
  it("variant .xlsx cut off after 40 bytes: the reader returns (or throws) within 10 s", async () => {
    const { Worker } = await import("node:worker_threads");
    const buf = Buffer.from(zipSync({ "[Content_Types].xml": strToU8("<?xml version=\"1.0\"?><Types>") })).subarray(0, 40);
    const code = `const { workerData, parentPort } = require("node:worker_threads"); const X = require(require("node:path").join(workerData.app, "node_modules", "xlsx"));
      try { X.read(Buffer.from(workerData.buf), { type: "buffer", cellDates: false, cellNF: true, cellText: false, sheetRows: 50040 }); parentPort.postMessage("returned"); } catch (e) { parentPort.postMessage("threw: " + e.message); }`;
    const w = new Worker(code, { eval: true, workerData: { app: process.cwd(), buf } });
    const t0 = Date.now();
    const out = await new Promise<string>((res) => { const t = setTimeout(() => res("no answer after 10 s"), 10_000); w.on("message", (m) => { clearTimeout(t); res(String(m)); }); w.on("error", (e) => { clearTimeout(t); res(`error: ${e.message}`); }); });
    await w.terminate();
    expect(out, `${out} (${Date.now() - t0} ms)`).not.toBe("no answer after 10 s");
  }, 30_000);
  it("a real tiny CSV is still read", async () => {
    expect(await said(Buffer.from("ward,count\n1,2\n2,3\n"), "ok.csv")).toMatch(/^parsed 1 table\(s\), 2 rows/);
  });
});
