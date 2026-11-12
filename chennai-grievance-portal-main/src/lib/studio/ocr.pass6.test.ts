/**
 * QA pass 6, P6-007 (reviewer 1 on the P5-028 fix): pdfImages on crafted and on real scans. A stream with no end made every later image
 * search to the end of the file again and copy the rest of it (time growing with the square of the size, a 5 MB file copied 20 times),
 * and the 150 MB bitmap budget that P5-028 added dropped pages of a real 300 dpi scan without a word.
 */
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { savePages } from "@/lib/manu/files";
import { pdfImages } from "@/lib/studio/ocr";

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-ocr-")); process.env.PETITION_UPLOAD_DIR = dir; });
afterAll(() => { delete process.env.PETITION_UPLOAD_DIR; fs.rmSync(dir, { recursive: true, force: true }); });

/** image dictionaries with no /Length and no endstream anywhere */
const noEndPdf = (bytes: number) => { const one = "<</Subtype/Image>>stream\n"; return Buffer.from("%PDF-1.4\n" + one.repeat(Math.floor(bytes / one.length)), "latin1"); };
/** 20 JPEG-looking image streams with no /Length, then padding and no endstream: each image would be the rest of the file */
function jpegNoLengthPdf(pad: number): Buffer {
  const head = Buffer.from("<</Subtype/Image/Filter/DCTDecode>>stream\n", "latin1");
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), ...Array.from({ length: 20 }, () => Buffer.concat([head, jpg])), Buffer.alloc(pad, 0x20)]);
}

describe("QA pass 6, P6-007: crafted PDFs cost time and memory in proportion to their size", () => {
  it("a 1 MB PDF of image dictionaries with no end is refused in well under a second", async () => {
    const b = noEndPdf(1_000_000);
    const t0 = performance.now();
    await expect(savePages([b])).rejects.toThrow(/No scanned pages/);
    expect(performance.now() - t0).toBeLessThan(800);
  });
  it("a 5 MB PDF is not copied over and over: what pdfImages returns is at most the file's own size", () => {
    const b = jpegNoLengthPdf(5_000_000);
    const r = pdfImages(b, { bitmaps: false });
    expect(r.images.reduce((s, x) => s + x.length, 0)).toBeLessThanOrEqual(b.length);
  });
});

describe("QA pass 6, P6-007: the bitmap budget holds a real scan", () => {
  it("a 6-page A4 colour scan at 300 dpi gives OCR all 6 pages", () => {
    const w = 2480, h = 3508;
    const raw = zlib.deflateSync(Buffer.alloc(w * h * 3, 255));
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    for (let i = 0; i < 6; i++)
      parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`, "latin1"),
        raw, Buffer.from("\nendstream\nendobj\n", "latin1"));
    const r = pdfImages(Buffer.concat(parts));
    expect(r.images).toHaveLength(6);
    expect(r.skipped).toBe(0);
  });
  it("a normal scan with /Length and endstream still gives every JPEG page", () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7), Buffer.from([0xff, 0xd9])]);
    const page = (n: number) => Buffer.concat([Buffer.from(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, "latin1"), jpg, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    const r = pdfImages(Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), page(1), page(2), page(3)]), { bitmaps: false });
    expect(r.images.map((x) => x.length)).toEqual([jpg.length, jpg.length, jpg.length]);
  });
});
