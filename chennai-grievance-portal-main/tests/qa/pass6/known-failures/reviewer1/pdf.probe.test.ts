/**
 * reviewer1 (QA pass 6): tries to break 6d784d8 (P5-028). Other ways for a small upload to make pdfImages / savePages spend a lot of
 * memory or time, with bitmaps already off for the desk. Real code path: savePages -> pdfImages. Files only in a temp dir.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { savePages } from "@/lib/manu/files";
import { pdfImages } from "@/lib/studio/ocr";

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-r1-pdf-")); process.env.PETITION_UPLOAD_DIR = dir; });
afterAll(() => { delete process.env.PETITION_UPLOAD_DIR; fs.rmSync(dir, { recursive: true, force: true }); });

/** `n` image dictionaries with no /Length and no endstream anywhere: each one makes pdfImages search the rest of the file. */
function noEndPdf(bytes: number): Buffer {
  const one = "<</Subtype/Image>>stream\n";
  return Buffer.from("%PDF-1.4\n" + one.repeat(Math.floor(bytes / one.length)), "latin1");
}
/** 20 JPEG-looking image streams with no /Length, then `pad` bytes and no endstream: each image is the rest of the file. */
function jpegNoLengthPdf(pad: number): Buffer {
  const head = Buffer.from("<</Subtype/Image/Filter/DCTDecode>>stream\n", "latin1");
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), ...Array.from({ length: 20 }, () => Buffer.concat([head, jpg])), Buffer.alloc(pad, 0x20)]);
}

describe("reviewer1: pdfImages time grows with the square of the file (desk upload, bitmaps off)", () => {
  it("doubling a crafted PDF about quadruples the time savePages takes to refuse it", async () => {
    const times: [number, number][] = [];
    for (const kb of [250, 500, 1000]) {
      const b = noEndPdf(kb * 1000);
      const t0 = performance.now();
      await expect(savePages([b])).rejects.toThrow(/No scanned pages/);
      times.push([kb, Math.round(performance.now() - t0)]);
    }
    console.log(`[reviewer1] savePages refusal time by size (KB, ms): ${JSON.stringify(times)}; 20 MB is 400x the 1 MB time`);
    const [, a] = times[0], [, c] = times[2];
    expect(c / Math.max(1, a), "4x the size should cost about 4x the time, not 16x").toBeLessThan(8);
  });
});

describe("reviewer1: one PDF is copied up to 20 times in memory before the desk refuses it", () => {
  it("a 5 MB PDF returns 20 'pages' of ~5 MB each (about 100 MB) from pdfImages(b, { bitmaps: false })", async () => {
    const b = jpegNoLengthPdf(5_000_000);
    const r = pdfImages(b, { bitmaps: false });
    const total = r.images.reduce((s, x) => s + x.length, 0);
    console.log(`[reviewer1] file ${b.length} bytes -> ${r.images.length} images, ${total} bytes copied (${(total / b.length).toFixed(1)}x)`);
    await expect(savePages([b])).rejects.toThrow(/at most 8 pages|too large/);
    expect(total, "pdfImages copied far more than the file holds").toBeLessThan(2 * b.length);
  });
});

describe("reviewer1: the 150 MB bitmap budget silently drops real pages of a Studio scan", () => {
  it("a 6-page A4 colour scan at 300 dpi (Flate RGB bitmaps) gives OCR only 5 pages; nothing tells the Collector", async () => {
    const zlib = await import("zlib");
    const w = 2480, h = 3508; // A4 at 300 dpi
    const raw = zlib.deflateSync(Buffer.alloc(w * h * 3, 255));
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    for (let i = 0; i < 6; i++)
      parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`, "latin1"), raw, Buffer.from("\nendstream\nendobj\n", "latin1"));
    const b = Buffer.concat(parts);
    const r = pdfImages(b); // what parseAllAsync (lib/studio/parse.ts:531) calls for a scanned PDF
    console.log(`[reviewer1] ${b.length}-byte 6-page scan -> ${r.images.length} pages for OCR, ${r.skipped} skipped (the table note says "read from ${r.images.length} scanned pages")`);
    expect(r.images.length, "pages of a real scan were dropped").toBe(6);
  });
});
