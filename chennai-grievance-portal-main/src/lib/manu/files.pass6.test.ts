/**
 * QA pass 6, P5-028: a small PDF of Flate-packed bitmaps was inflated in full (up to 40 Mpx x 3 bytes an image, 20 images: about 2.4 GB) before the
 * desk refused it, though the desk keeps only JPEG and PNG pages and throws every bitmap away. Real code path: savePages -> pdfImages.
 */
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { savePages } from "@/lib/manu/files";
import { pdfImages } from "@/lib/studio/ocr";

/** A PDF of `images` Flate-packed RGB bitmaps of w x h, all zero bytes: a few hundred KB that inflate to w*h*3 bytes each. */
function bitmapPdf(images: number, w: number, h: number): Buffer {
  const raw = zlib.deflateSync(Buffer.alloc(w * h * 3));
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  for (let i = 0; i < images; i++)
    parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`, "latin1"), raw, Buffer.from("\nendstream\nendobj\n", "latin1"));
  parts.push(Buffer.from("%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}
/** A PDF holding one JPEG page (DCTDecode), as a scanner writes it. */
function jpegPdf(): Buffer {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7), Buffer.from([0xff, 0xd9])]);
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, "latin1"), jpg, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
}

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-files-")); process.env.PETITION_UPLOAD_DIR = dir; });
afterAll(() => { delete process.env.PETITION_UPLOAD_DIR; fs.rmSync(dir, { recursive: true, force: true }); });
afterEach(() => vi.restoreAllMocks());

describe("QA pass 6, P5-028: the desk never inflates a PDF's bitmaps it would throw away", () => {
  it("a 3-image bitmap PDF is refused without inflating any image", async () => {
    const pdf = bitmapPdf(3, 4000, 4000);
    expect(pdf.length).toBeLessThan(400_000);
    const inflate = vi.spyOn(zlib, "inflateSync");
    await expect(savePages([pdf])).rejects.toThrow(/No scanned pages/);
    const inflated = inflate.mock.results.reduce((s, r) => s + (r.type === "return" ? (r.value as Buffer).length : 0), 0);
    expect(inflated, "bytes inflated in memory for a desk upload").toBe(0);
  });

  it("a scanned PDF of JPEG pages is still taken page by page", async () => {
    const names = await savePages([jpegPdf()]);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/\.jpg$/);
  });
});

describe("QA pass 6, P5-028: every caller of pdfImages has a total budget for inflated bitmaps", () => {
  it("bitmaps past the budget are skipped, not inflated", () => {
    const pdf = bitmapPdf(3, 2000, 2000); // 12 MB an image when inflated
    const inflate = vi.spyOn(zlib, "inflateSync");
    const out = pdfImages(pdf, { maxBitmapBytes: 20_000_000 });
    expect(out.images).toHaveLength(1);
    expect(out.skipped).toBe(2);
    expect(inflate).toHaveBeenCalledTimes(1);
  });

  it("the default budget holds a 20-image bomb to well under a gigabyte", () => {
    const pdf = bitmapPdf(20, 4000, 4000); // 48 MB an image, 960 MB in all, before the budget
    const inflate = vi.spyOn(zlib, "inflateSync");
    const out = pdfImages(pdf);
    const inflated = inflate.mock.results.reduce((s, r) => s + (r.type === "return" ? (r.value as Buffer).length : 0), 0);
    expect(inflated).toBeLessThanOrEqual(200_000_000);
    expect(out.images.length).toBeLessThan(20);
  });
});
