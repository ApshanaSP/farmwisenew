/**
 * Reviewer 2 probe (QA pass 7, studio-parse): a fetched page's reply has no cell budget (budget() runs only for files), and every table of
 * the page is packed and sent, though discover() looks at the first 12.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts --maxWorkers=2 tests/qa/pass7/studio-parse/reviewer2/page.test.ts < /dev/null
 */
import v8 from "node:v8";
import vm from "node:vm";
import { afterEach, expect, it } from "vitest";
import { readPage, stopReaders } from "@/lib/studio/parse-pool";
import { MAX_CELLS } from "@/lib/studio/parse-worker";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;
const heapMb = () => { gc(); gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };
const MB = 1048576;
afterEach(() => stopReaders());

async function measure(html: string) {
  const h0 = heapMb();
  let last = performance.now(), gap = 0, peak = 0;
  const iv = setInterval(() => { const x = performance.now(); gap = Math.max(gap, x - last); last = x; peak = Math.max(peak, process.memoryUsage.rss()); }, 5);
  const t0 = performance.now();
  const p = await readPage(html, "https://example.org/x");
  const ms = performance.now() - t0;
  clearInterval(iv);
  const held = heapMb() - h0;
  const cells = p.tables.reduce((s, t) => s + (t ? t.rows.length * t.headers.length : 0), 0);
  return { p, info: { pageMb: +(html.length / MB).toFixed(1), tables: p.tables.length, cells, maxCells: MAX_CELLS, serverHeapHeldMb: held, peakRssMb: Math.round(peak / MB), gapMs: Math.round(gap), ms: Math.round(ms) } };
}

it("a 15 MB page of five 50 000-row colspan tables: more cells than any file may bring", async () => {
  const row = `<tr><td colspan=20>a</td><td colspan=20>b</td><td colspan=20>c</td></tr>`;
  const one = `<table><tr><th colspan=20>x</th><th colspan=20>y</th><th colspan=20>z</th></tr>${row.repeat(50_000)}</table>`;
  const html = `<html><body>${one.repeat(Math.floor(15 * MB / one.length))}</body></html>`;
  const { info } = await measure(html);
  console.log("colspan tables page:", info);
  expect(info.cells).toBeLessThanOrEqual(MAX_CELLS);
}, 240_000);

it("a 15 MB page of tiny 3x2 tables: every one is packed and sent (discover reads 12)", async () => {
  const one = `<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>`;
  const html = `<html><body>${one.repeat(Math.floor(15 * MB / one.length))}</body></html>`;
  const { info } = await measure(html);
  console.log("tiny tables page:", info);
  expect(info.gapMs).toBeLessThan(500);
}, 240_000);

it("the same tiny-tables page read in-thread (work()): what the Page object holds, for comparison", async () => {
  const { work } = await import("@/lib/studio/parse-worker");
  const one = `<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>`;
  const html = `<html><body>${one.repeat(Math.floor(15 * MB / one.length))}</body></html>`;
  const h0 = heapMb();
  const r = work({ op: "page", html, url: "https://example.org/x" }) as { page: { tables: unknown[] } };
  console.log("tiny tables in-thread:", { tables: r.page.tables.length, heldMb: heapMb() - h0 });
}, 240_000);
