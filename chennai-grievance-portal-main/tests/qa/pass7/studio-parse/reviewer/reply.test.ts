/**
 * Reviewer probe (QA pass 7, studio-parse): the reader's reply is capped in CELLS (MAX_CELLS), not in bytes. A workbook whose cells all point
 * at one shared string costs the reader one string, but the reply copies it once per cell, and the server deserializes every copy.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer/reply.test.ts < /dev/null
 */
import v8 from "node:v8";
import vm from "node:vm";
import { afterEach, expect, it } from "vitest";
import { parseAll, parseAllAsync } from "@/lib/studio/parse";
import { stopReaders } from "@/lib/studio/parse-pool";
import { sharedStringXlsx } from "./craft.mjs";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;
const heapMb = () => { gc(); gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };
afterEach(() => stopReaders());

it("a 1.3 MB workbook of one shared 800-character string (10 000 x 50): what the server holds after parseAllAsync is no more than after parseAll", async () => {
  const buf: Buffer = sharedStringXlsx(10_000, 50, 800);
  const h0 = heapMb();
  let t = parseAll(buf, "wards.xlsx");
  const inThread = heapMb() - h0;
  const cells = t[0].rows.length * t[0].headers.length;
  t = [];
  const h1 = heapMb();
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
  const r = await parseAllAsync(buf, "wards.xlsx");
  clearInterval(iv);
  const viaReader = heapMb() - h1;
  const rss = Math.round(process.memoryUsage.rss() / 1048576);
  console.log("shared strings:", { fileMb: +(buf.length / 1048576).toFixed(2), cells, inThreadHeapMb: inThread, viaReaderHeapMb: viaReader, rssMb: rss, gap: Math.round(gap), sameCells: r[0].rows[5][7] === parseAll(buf, "wards.xlsx")[0].rows[5][7] });
  expect(viaReader).toBeLessThan(inThread * 3 + 50);
}, 120_000);

it("a fetched 15 MB page whose cells span 20 columns (colspan=20): what readPage hands the server is no more than the page held", async () => {
  const { readPage } = await import("@/lib/studio/parse-pool");
  const long = "Zone 9 Teynampet ward office ".repeat(35).slice(0, 1000);
  const row = `<tr>${`<td colspan=20>${long}</td>`.repeat(3)}</tr>`;
  const html = `<html><body><table><tr><th colspan=20>a</th><th colspan=20>b</th><th colspan=20>c</th></tr>${row.repeat(Math.floor((15 * 1048576 - 200) / row.length))}</table></body></html>`;
  const h0 = heapMb();
  const p = await readPage(html, "https://example.org/x");
  const held = heapMb() - h0;
  const t = p.tables[0]!;
  console.log("colspan page:", { pageMb: +(html.length / 1048576).toFixed(1), rows: t.rows.length, cols: t.headers.length, serverHeapMb: held });
  expect(held).toBeLessThan(3 * html.length / 1048576 + 50);
}, 120_000);
