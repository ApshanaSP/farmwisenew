/**
 * QA pass 7, studio-parse: every Data Studio file is read in a separate process with a time and a memory limit (src/lib/studio/parse-pool.ts),
 * so no crafted file holds the web server's thread. Rows redteam-gate-05 and reviewer5-04 (a workbook whose deflate stream never ends hangs
 * SheetJS for ever), and the mechanism the brief asked for: a time limit, a memory limit (V8's heap and the whole process), a crashed reader,
 * many files at once, a reader that cannot start, the clear message the Collector gets.
 *
 * Without the fix (parseAllAsync reading on the caller's thread) the hang tests never return: run this file under `timeout`.
 *   timeout 300 npx vitest run --config vitest.p7.config.ts tests/qa/pass7/studio-parse/reader.test.ts < /dev/null
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParseError, parseAll, parseAllAsync, parseFile, parseFileAsync } from "@/lib/studio/parse";
import { ParseLimitError, readerState, stopReaders } from "@/lib/studio/parse-pool";
import { budget, MAX_CELLS } from "@/lib/studio/parse-worker";
import { FEED, PAGE, brokenSheet, csv, fillFile, pdfBombs, stuckFile, unendedDeflate, workbook } from "./files";

/** The longest gap between 10 ms ticks of this (the server's) thread while `f` runs. */
async function loopGap<T>(f: () => Promise<T>): Promise<{ value: T; gap: number; ms: number }> {
  let last = performance.now(), gap = 0;
  const iv = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 10);
  const t0 = performance.now();
  try {
    const value = await f();
    gap = Math.max(gap, performance.now() - last); // a thread held the whole time never ticks
    return { value, gap: Math.round(gap), ms: Math.round(performance.now() - t0) };
  } finally { clearInterval(iv); }
}
const caught = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const limits = (o: Record<string, string | number>) => { stopReaders(); for (const [k, v] of Object.entries(o)) vi.stubEnv(k, String(v)); };

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); stopReaders(); });

describe("the reader reads ordinary files exactly as before", () => {
  const files: [string, Buffer][] = [["wards.csv", csv(40, 5)], ["report.xlsx", workbook(30, ["Data", "Notes"])], ["news.xml", FEED], ["page.html", PAGE],
    ["rows.json", Buffer.from(JSON.stringify({ records: [{ ward: "W1", n: 3, at: { zone: 9 } }, { ward: "W2", n: 5, at: { zone: 10 } }] }))]];
  for (const [name, buf] of files) {
    it(`${name}: parseAllAsync and parseFileAsync give what parseAll and parseFile give on this thread`, async () => {
      expect(await parseAllAsync(buf, name, "", "https://example.in/x")).toEqual(parseAll(buf, name, "", "https://example.in/x"));
      expect(await parseFileAsync(buf, name)).toEqual(parseFile(buf, name));
    }, 30_000);
  }
  it("a file that is not a table is the same ParseError, with the same words", async () => {
    const e = await caught(parseAllAsync(Buffer.from("\u0000\u0001binary\u0000"), "x.csv"));
    expect(e).toBeInstanceOf(ParseError);
    expect(e).not.toBeInstanceOf(ParseLimitError);
    expect((e as Error).message).toMatch(/could not be read as text/);
  }, 30_000);
  it("a picture comes back to be read with OCR, a scan with no readable page says so", async () => {
    // a PDF with only a JPEG-less image stream: a scan whose pictures OCR cannot open (pdfImages ran in the reader)
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 1 /Length 1 >>\nstream\n\u0000\nendstream\nendobj\n/Type /Page\n%%EOF\n", "latin1");
    const e = await caught(parseAllAsync(pdf, "scan.pdf"));
    expect((e as Error).message).toMatch(/This PDF is a scan whose pictures the Studio cannot open \(1 in a format/);
    // without OCR (a link's candidates) it is the reader's ParseError, as parseAll threw it
    const e2 = await caught(parseAllAsync(pdf, "scan.pdf", "", undefined, { ocr: false }));
    expect((e2 as Error).message).toMatch(/This PDF is a scan/);
  }, 30_000);
});

describe("redteam-gate-05 and reviewer5-04: a workbook SheetJS never finishes is stopped, and the server goes on", () => {
  it("an unended deflate stream (00 00 00 FF FF): refused at once (zlib inflates a workbook's entries before SheetJS, since p7-studio-egress-19), the thread ticks", async () => {
    limits({ STUDIO_PARSE_SECONDS: 3 });
    const r = await loopGap(() => caught(parseAllAsync(unendedDeflate(), "register.xlsx")));
    console.log("unended deflate:", { ms: r.ms, gap: r.gap, error: (r.value as Error)?.message.slice(0, 80) });
    expect(r.value).toBeInstanceOf(ParseError);
    expect(r.value).not.toBeInstanceOf(ParseLimitError);
    expect((r.value as Error).message).toMatch(/^This Excel file is damaged/);
    expect(r.ms).toBeLessThan(3000);
    expect(r.gap).toBeLessThan(500);
  }, 30_000);
  it("a file the reader is stuck on (the test seam: a run of unclosed <Placemark> is read at once since reviewer5-10): stopped at the time limit with a clear message, while another file is read and the thread ticks", async () => {
    limits({ STUDIO_PARSE_SECONDS: 3 });
    const r = await loopGap(async () => {
      const hang = caught(parseAllAsync(stuckFile(), "map.kml"));
      const other = await parseAllAsync(csv(5, 3), "other.csv");
      return { other, hang: await hang };
    });
    console.log("slow kml:", { ms: r.ms, gap: r.gap, other: r.value.other[0].rows.length, error: (r.value.hang as Error)?.message.slice(0, 60) });
    expect(r.value.other[0].rows).toHaveLength(5);
    expect(r.value.hang).toBeInstanceOf(ParseLimitError);
    expect((r.value.hang as ParseLimitError).reason).toBe("time");
    expect((r.value.hang as Error).message).toMatch(/^This file took longer than 3 seconds to read, so the Studio stopped reading it and nothing from it was added\./);
    expect(r.ms).toBeLessThan(10_000);
    expect(r.gap).toBeLessThan(500);
  }, 30_000);
  for (const kind of ["1-byte", "40xFF"] as const) {
    it(`a whole workbook whose sheet has a ${kind} deflate stream: stopped, not hung`, async () => {
      limits({ STUDIO_PARSE_SECONDS: 3 });
      const r = await loopGap(() => caught(parseFileAsync(brokenSheet(kind), "report.xlsx")));
      console.log(kind, { ms: r.ms, gap: r.gap, error: (r.value as Error)?.message.slice(0, 60) });
      expect(r.value).toBeInstanceOf(ParseError);
      expect(r.ms).toBeLessThan(10_000);
      expect(r.gap).toBeLessThan(500);
    }, 30_000);
  }
});

describe("the memory limit: only the reader ends, never the server", () => {
  it("a PDF of deflate bombs (20 streams x 39 MB): refused by the inflate budget before the memory is spent (p7-studio-egress-18)", async () => {
    limits({ STUDIO_PARSE_RSS_MB: 300, STUDIO_PARSE_SECONDS: 30 });
    const r = await loopGap(() => caught(parseAllAsync(pdfBombs(20), "bombs.pdf")));
    console.log("pdf bombs:", { ms: r.ms, gap: r.gap, error: (r.value as Error)?.message.slice(0, 70) });
    expect(r.value).toBeInstanceOf(ParseError);
    expect(r.value).not.toBeInstanceOf(ParseLimitError);
    expect((r.value as Error).message).toMatch(/unpacks to far more than its size/);
    expect(r.gap).toBeLessThan(500);
  }, 60_000);
  it("a file whose reading fills memory outside V8's heap is stopped by the reader's own watchdog (the test seam: a scan of 36 Mpx pages is held at 9 MB a page since reviewer2-13)", async () => {
    limits({ STUDIO_PARSE_RSS_MB: 300, STUDIO_PARSE_SECONDS: 30 });
    const pdf = fillFile();
    const before = process.memoryUsage.rss();
    const r = await loopGap(() => caught(parseAllAsync(pdf, "scan.pdf")));
    const grew = Math.round((process.memoryUsage.rss() - before) / 1e6);
    console.log("scan images:", { kb: Math.round(pdf.length / 1024), ms: r.ms, gap: r.gap, grewMb: grew, error: (r.value as Error)?.message.slice(0, 70) });
    expect(r.value).toBeInstanceOf(ParseLimitError);
    expect((r.value as ParseLimitError).reason).toBe("memory");
    expect((r.value as Error).message).toMatch(/needs more memory to read than the Studio allows/);
    expect(grew).toBeLessThan(200);
    expect(r.gap).toBeLessThan(500);
    // and the next file is read by a new reader
    expect((await parseAllAsync(csv(3, 2), "after.csv"))[0].rows).toHaveLength(3);
  }, 60_000);
  it("a file that fills V8's heap (a small heap set for the test): the reader ends with 'heap out of memory', the server says why and goes on", async () => {
    limits({ STUDIO_PARSE_HEAP_MB: 48, STUDIO_PARSE_SECONDS: 30 });
    const big = csv(200_000, 30);
    const r = await loopGap(() => caught(parseAllAsync(big, "big.csv")));
    console.log("heap:", { ms: r.ms, gap: r.gap, error: (r.value as Error)?.message.slice(0, 70) });
    expect(r.value).toBeInstanceOf(ParseLimitError);
    expect((r.value as ParseLimitError).reason).toBe("memory");
    expect(r.gap).toBeLessThan(500);
    expect((await parseAllAsync(csv(3, 2), "after.csv"))[0].rows).toHaveLength(3);
  }, 60_000);
});

describe("a reader that crashes, many files at once, a reader that cannot start", () => {
  it("the reader process killed mid-read: the file is said to be stopped, and the next file is read by a new reader", async () => {
    limits({ STUDIO_PARSE_SECONDS: 30 });
    const hang = caught(parseAllAsync(stuckFile(), "map.kml"));
    let pid: number | null = null;
    for (let i = 0; i < 200 && !pid; i++) { await new Promise((r) => setTimeout(r, 25)); pid = readerState().procs.find((p) => p.busy)?.pid ?? null; }
    expect(pid).toBeTruthy();
    const t0 = Date.now();
    process.kill(pid!, "SIGKILL");
    const e = await hang;
    console.log("killed reader:", { ms: Date.now() - t0, error: (e as Error)?.message.slice(0, 70) });
    expect(e).toBeInstanceOf(ParseLimitError);
    expect((e as ParseLimitError).reason).toBe("stopped");
    expect((e as Error).message).toMatch(/file reader stopped while reading this file/);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await parseAllAsync(csv(3, 2), "after.csv"))[0].rows).toHaveLength(3);
    expect(readerState().procs.some((p) => p.pid === pid)).toBe(false);
  }, 60_000);

  it("two hanging files hold both readers: 6 more wait their turn and are read, the rest are told the Studio is busy, at once", async () => {
    limits({ STUDIO_PARSE_SECONDS: 3, STUDIO_PARSE_PROCS: 2, STUDIO_PARSE_QUEUE: 8 });
    const r = await loopGap(async () => {
      const hangs = [caught(parseAllAsync(stuckFile(), "a.kml")), caught(parseAllAsync(stuckFile(), "b.kml"))];
      const t0 = Date.now();
      const small = Array.from({ length: 10 }, (_, i) => parseAllAsync(csv(i + 1, 2), `f${i}.csv`).then((t) => ({ rows: t[0].rows.length, at: Date.now() - t0 }), (e: Error) => ({ error: e, at: Date.now() - t0 })));
      return { hangs: await Promise.all(hangs), small: await Promise.all(small) };
    });
    const busy = r.value.small.filter((x) => "error" in x);
    const read = r.value.small.filter((x) => "rows" in x) as { rows: number; at: number }[];
    console.log("many:", { ms: r.ms, gap: r.gap, read: read.length, busy: busy.length, busyAt: busy.map((b) => b.at) });
    expect(r.value.hangs.every((e) => e instanceof ParseLimitError && e.reason === "time")).toBe(true);
    expect(read).toHaveLength(6);
    expect(read.map((x) => x.rows).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(busy).toHaveLength(4);
    for (const b of busy) { expect((b as { error: Error }).error).toBeInstanceOf(ParseLimitError); expect(b.at).toBeLessThan(500); }
    expect(r.gap).toBeLessThan(500);
  }, 60_000);

  it("a file that waits longer than the wait limit is told the Studio is busy, not held", async () => {
    limits({ STUDIO_PARSE_SECONDS: 6, STUDIO_PARSE_PROCS: 1, STUDIO_PARSE_WAIT_SECONDS: 1 });
    const hang = caught(parseAllAsync(stuckFile(), "a.kml"));
    const t0 = Date.now();
    const e = await caught(parseAllAsync(csv(2, 2), "late.csv"));
    expect((e as ParseLimitError).reason).toBe("busy");
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(((await hang) as ParseLimitError).reason).toBe("time");
  }, 30_000);

  it("a reader that cannot start (no bundle where it is looked for) fails the file with a message, and does not keep trying", async () => {
    limits({});
    vi.spyOn(process, "cwd").mockReturnValue(process.env.TEMP || process.env.TMPDIR || "/tmp");
    const e = await caught(parseAllAsync(csv(2, 2), "x.csv"));
    expect(e).toBeInstanceOf(ParseLimitError);
    expect((e as Error).message).toMatch(/file reader could not start/);
    expect(readerState().procs).toHaveLength(0);
  }, 40_000);
});

describe("what one file may send back", () => {
  const fake = (rows: number, cols: number, part: string) => ({ headers: Array.from({ length: cols }, (_, i) => `c${i}`), rows: new Array(rows), sheet: null, sheets: [], caption: null, format: "csv" as const, truncated: 0, part });
  it("tables past MAX_CELLS are left out and the first says so; a file within it is untouched", () => {
    const three = [fake(50_000, 60, "a.csv"), fake(50_000, 60, "b.csv"), fake(10, 2, "c.csv")];
    expect(MAX_CELLS).toBe(6_000_000);
    const kept = budget(three);
    expect(kept.map((t) => t.part)).toEqual(["a.csv", "b.csv"]);
    expect(kept[0].notes?.[0]).toMatch(/^1 more table in this file was not read: one file may bring in at most 6 million cells\./);
    const two = [fake(100, 5, "x"), fake(100, 5, "y")];
    expect(budget(two)).toBe(two);
  });
});
