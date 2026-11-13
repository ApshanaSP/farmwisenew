/**
 * Reviewer 2 probe (QA pass 7, studio-parse): the packed reply shares a text only WITHIN a table. A workbook of many sheets whose cells all
 * point at one shared string costs SheetJS (and the in-thread parseAll) one string; the reply carries one copy per sheet.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer2/sheets.test.ts < /dev/null
 */
import v8 from "node:v8";
import vm from "node:vm";
import { afterEach, expect, it } from "vitest";
import { parseAll, parseAllAsync } from "@/lib/studio/parse";
import { stopReaders } from "@/lib/studio/parse-pool";
import { toWire } from "@/lib/studio/parse-worker";
import { sheetsXlsx } from "./craft2.mjs";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;
const heapMb = () => { gc(); gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };
afterEach(() => stopReaders());

it("80 sheets x 5 rows, every remark one shared 1.5 MB text: what the server holds after parseAllAsync vs after parseAll", async () => {
  const buf: Buffer = sheetsXlsx(80, 5, 1_500_000);
  const h0 = heapMb();
  let t = parseAll(buf, "zones.xlsx");
  const inThread = heapMb() - h0;
  const wireBytes = v8.serialize(toWire({ tables: t })).length;
  const n = t.length;
  t = [];
  const h1 = heapMb();
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const x = performance.now(); gap = Math.max(gap, x - last); last = x; }, 10);
  const r = await parseAllAsync(buf, "zones.xlsx");
  clearInterval(iv);
  const viaReader = heapMb() - h1;
  console.log("many sheets, one shared text:", { fileKb: Math.round(buf.length / 1024), tables: n, cellsPerTable: r[0].rows.length * r[0].headers.length,
    inThreadHeapMb: inThread, wireMb: Math.round(wireBytes / 1048576), viaReaderHeapMb: viaReader, gapMs: Math.round(gap), rssMb: Math.round(process.memoryUsage.rss() / 1048576) });
  expect(viaReader).toBeLessThan(inThread * 3 + 50);
}, 180_000);
