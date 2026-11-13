/**
 * QA pass 7, studio-egress REVIEWER 4: red-team of the Studio upload size limit (route.ts readFormCapped / readJsonCapped, lib/body-cap.ts)
 * and of what the 15 MB the route lets in can become in memory once the file is read (formats.ts pdfTables, parse.ts excelAll / SheetJS).
 * Each test asserts the SECURE behaviour, so a FAILING test is a BREAK; each logs what it measured. Sizes are kept small (a loaded machine):
 * the logs give the ratio, and what a full 15 MB request would come to.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/studio-egress/reviewer4/upload-probes4.test.ts
 */
import v8 from "v8";
import vm from "vm";
import zlib from "zlib";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@x", userId: 1, role: "collector" }), failed: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
const calls: string[] = [];
vi.mock("@/lib/studio/pipeline", () => ({
  ingest: async (p: { buf: Buffer; file: string }) => { calls.push(`ingest ${p.file} ${p.buf.length}`); return "ds-1"; },
  ingestLink: async () => { calls.push("ingestLink"); return "ds-2"; },
  namesOf: () => ({})
}));

const MB = 1024 * 1024;
const CAP = 15 * MB + 64 * 1024;
const CRLF = "\r\n";
v8.setFlagsFromString("--expose_gc");
const gc = vm.runInNewContext("gc") as () => void;
const used = () => { gc(); gc(); const m = process.memoryUsage(); return m.heapUsed + m.external + m.arrayBuffers; };

/** a body streamed in 64 KB pieces (as a socket gives it); `pulled` counts what the server read */
function streamed(body: Uint8Array, headers: Record<string, string>) {
  const box = { pulled: 0 };
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (at >= body.length) { ctrl.close(); return; }
      const c = body.subarray(at, Math.min(body.length, at + 64 * 1024)); at += c.length; box.pulled += c.length; ctrl.enqueue(c);
    }
  });
  const req = new NextRequest("http://x/api/collector/studio", { method: "POST", body: stream, duplex: "half", headers } as never) /* studio-egress: type-only, for tsc */;
  return { req, box };
}
const filePart = (b: string, name: string, data: Buffer) => Buffer.concat([Buffer.from(`--${b}${CRLF}Content-Disposition: form-data; name="file"; filename="${name}"${CRLF}Content-Type: text/csv${CRLF}${CRLF}`), data, Buffer.from(CRLF)]);

// ---------------------------------------------------------------------------------------------------------------------
describe("U1 the body read itself", () => {
  it("content-encoding gzip: a 1 KB gzip of a 40 MB form is not inflated by the route (read as bytes, unreadable form)", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const form = Buffer.concat([filePart("b", "big.csv", Buffer.alloc(40 * MB, 97)), Buffer.from(`--b--${CRLF}`)]);
    const gz = zlib.gzipSync(form);
    const { req, box } = streamed(gz, { "content-type": "multipart/form-data; boundary=b", "content-encoding": "gzip" });
    const res = await POST(req);
    console.log(`[U1a] gzip ${gz.length} bytes -> status ${res.status}, read ${box.pulled}, handed on: ${JSON.stringify(calls)}`);
    expect(res.status).not.toBe(200);
    expect(calls.filter((c) => c.startsWith("ingest "))).toEqual([]);
  }, 60_000);

  it("a false small content-length, two 10 MB file parts, and no content-length at all: refused once the bytes read pass the limit", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const two = Buffer.concat([filePart("b", "a.csv", Buffer.alloc(10 * MB, 97)), filePart("b", "b.csv", Buffer.alloc(10 * MB, 98)), Buffer.from(`--b--${CRLF}`)]);
    const out: string[] = [];
    for (const [k, h] of [["lying length", { "content-length": "1000" }], ["no length", {}], ["two lengths", { "content-length": "100, 99999999" }]] as [string, Record<string, string>][]) {
      const { req, box } = streamed(two, { "content-type": "multipart/form-data; boundary=b", ...h });
      const res = await POST(req);
      out.push(`${k}: ${res.status} after ${box.pulled}`);
      expect(res.status, k).toBe(413);
      // the test's stream reads one 64 KB piece ahead of the server: the server itself stops one piece past the limit
      expect(box.pulled, k).toBeLessThanOrEqual(CAP + 3 * 64 * 1024);
    }
    console.log(`[U1b] ${out.join(" | ")}`);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------
describe("U2 inside the limit: what a body under 15 MB becomes in memory when the form is parsed", () => {
  it("a urlencoded body whose content-type merely mentions multipart/form-data goes to the form reader, whose time grows with the SQUARE of the body", async () => {
    const { POST } = await import("@/app/api/collector/studio/route");
    const { readFormCapped } = await import("@/lib/body-cap");
    const ct = "application/x-www-form-urlencoded; multipart/form-data";
    // the route takes this content-type into readFormCapped (its answer is the form path's "Choose a file.", not the link path's)
    const res = await POST(streamed(Buffer.from("a&".repeat(1000)), { "content-type": ct }).req);
    const said = await res.json();
    const time = async (n: number) => {
      const body = Buffer.from("a&".repeat(n));
      const before = used();
      const t = Date.now();
      const { form } = await readFormCapped(streamed(body, { "content-type": ct }).req, CAP);
      const ms = Date.now() - t;
      return { bytes: body.length, ms, held: used() - before, entries: form ? [...form.keys()].length : 0 };
    };
    const a = await time(100_000), b = await time(200_000);
    const k = b.ms / Math.max(1, a.ms);
    const full = b.ms * (CAP / b.bytes) ** 2 / 1000;
    console.log(`[U2a] route: ${res.status} ${JSON.stringify(said)}
  ${a.bytes} bytes -> ${a.entries} entries in ${a.ms} ms; ${b.bytes} bytes -> ${b.entries} entries in ${b.ms} ms (x${k.toFixed(1)} for x2),` +
      ` ${Math.round(b.held / MB)} MB held (${(b.held / b.bytes).toFixed(0)}x)
  a full ${Math.round(CAP / MB)} MB body: ~${Math.round(full / 60)} min on the server's one thread, ~${Math.round((b.held / b.bytes) * CAP / MB)} MB`);
    expect(said.error).not.toBe("Choose a file.");
    expect(full, "seconds for a 15 MB body").toBeLessThanOrEqual(10);
  }, 300_000);

  it("a multipart body of tiny file parts: one File per 70 bytes", async () => {
    const { readFormCapped } = await import("@/lib/body-cap");
    const part = `--b${CRLF}Content-Disposition: form-data; name="f"; filename="a"${CRLF}${CRLF}${CRLF}`;
    const body = Buffer.from(part.repeat(Math.floor(2 * MB / part.length)) + `--b--${CRLF}`);
    const before = used();
    const t = Date.now();
    const { form } = await readFormCapped(streamed(body, { "content-type": "multipart/form-data; boundary=b" }).req, CAP);
    const ms = Date.now() - t;
    const grew = used() - before;
    const n = form ? form.getAll("f").length : 0;
    console.log(`[U2b] ${body.length} bytes -> ${n} parts, ${Math.round(grew / MB)} MB held (${(grew / body.length).toFixed(1)}x), ${ms} ms;` +
      ` a full ${Math.round(CAP / MB)} MB body: ~${Math.round((grew / body.length) * CAP / MB)} MB, ~${Math.round(ms * CAP / body.length / 1000)} s`);
    expect(grew / body.length).toBeLessThanOrEqual(4);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------------
describe("U3 after the limit: a file under 15 MB that unpacks to far more (the route hands it to parse.ts on the server's thread)", () => {
  it("PDF: every Flate stream is inflated up to 40 MB, with no total: 4 streams of 20 MB from an ~80 KB file", async () => {
    const { pdfTables } = await import("@/lib/studio/formats");
    const one = zlib.deflateSync(Buffer.alloc(20 * MB));
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    for (let i = 0; i < 4; i++) parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /Filter /FlateDecode /Length ${one.length} >>\nstream\n`, "latin1"), one, Buffer.from("\nendstream\nendobj\n", "latin1"));
    parts.push(Buffer.from("trailer\n<< >>\n%%EOF\n", "latin1"));
    const buf = Buffer.concat(parts);
    let inflated = 0;
    const real = zlib.inflateSync;
    const spy = vi.spyOn(zlib, "inflateSync").mockImplementation(((d: zlib.InputType, o?: zlib.ZlibOptions) => { const r = real(d, o); inflated += r.length; return r; }) as typeof zlib.inflateSync);
    const t = Date.now();
    const r = pdfTables(buf);
    spy.mockRestore();
    // a stream that inflates to the 40 MB cap is about twice this one; a 15 MB PDF holds 15 MB / that many of them
    const full = (15 * MB / (2 * one.length)) * 40 * MB;
    console.log(`[U3a] a ${Math.round(buf.length / 1024)} KB PDF -> ${Math.round(inflated / MB)} MB inflated and held at once (${Math.round(inflated / buf.length)}x), ${Date.now() - t} ms, scanned=${r.scanned};` +
      ` a 15 MB PDF of 40 MB streams: ~${Math.round(full / 1024 / MB)} GB`);
    expect(inflated, "bytes inflated").toBeLessThanOrEqual(CAP);
  }, 120_000);

  it("Excel: SheetJS unpacks every entry of the workbook with no ratio or total check (unzip()'s 400x / 60 MB limit is never applied to .xlsx)", async () => {
    const XLSX = await import("xlsx");
    const { unzip } = await import("@/lib/studio/formats");
    const { parseFile } = await import("@/lib/studio/parse");
    const ws = XLSX.utils.aoa_to_sheet([["Zone", "Complaints"], ...Array.from({ length: 6 }, (_, i) => [`Zone ${i + 1}`, 10 + i])]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const base = unzip(XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: false }) as Buffer);
    const PAD = 80 * MB;
    const bomb = zipOf([...base, { name: "xl/media/pad.bin", data: Buffer.alloc(PAD, 32) }]);
    let refusedByUnzip = "";
    try { unzip(bomb); } catch (e) { refusedByUnzip = (e as Error).message; }
    const t = Date.now();
    const table = parseFile(bomb, "bomb.xlsx");
    const ms = Date.now() - t;
    const cfb = XLSX.CFB.read(bomb, { type: "buffer" });
    const at = cfb.FullPaths.findIndex((f: string) => f.endsWith("pad.bin"));
    const padIn = at >= 0 ? (cfb.FileIndex[at].content?.length ?? 0) : -1;
    console.log(`[U3b] a ${Math.round(bomb.length / 1024)} KB .xlsx: unzip() would refuse it ("${refusedByUnzip.slice(0, 60)}"); parseFile read it in ${ms} ms (${table.rows.length} rows);` +
      ` SheetJS's reader holds the ${Math.round(padIn / MB)} MB entry (${Math.round(padIn / bomb.length)}x); a 15 MB workbook: ~${Math.round(15 * padIn / bomb.length / 1024)} GB`);
    expect(padIn, "bytes SheetJS unpacked").toBeLessThanOrEqual(CAP);
  }, 180_000);
});

/** a ZIP of deflated entries (crc and sizes right), for the workbook above */
function zipOf(entries: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), comp = zlib.deflateRawSync(e.data), crc = zlib.crc32(e.data) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(0, 10);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(0, 12);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    local.push(h, name, comp); central.push(c, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, end]);
}
