// reviewer2, QA pass 6: trying to break a3937ca (P6-007) in pdfImages(). Each `it` states what SHOULD hold; a failure is a finding.
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { pdfImages } from "@/lib/studio/ocr";

const B = (s: string) => Buffer.from(s, "latin1");
// a small but real JPEG header (SOI + APP0 + EOI is enough for the length check)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), B("JFIF\0"), Buffer.alloc(300, 0x11), Buffer.from([0xff, 0xd9])]);
const dct = (len: string, data = JPEG) => Buffer.concat([B(`<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${len} >>\nstream\n`), data, B("\nendstream\nendobj\n")]);

describe("pdfImages: the image dictionary regex", () => {
  const time = (k: number) => {
    const buf = B("%PDF-1.4\n<< " + "/Subtype/Image ".repeat(k) + ">>\nendobj\n");
    const t = performance.now(); pdfImages(buf); return { bytes: buf.length, ms: Math.round(performance.now() - t) };
  };
  it("is linear in the size of one dictionary (one dict repeating /Subtype /Image, no stream)", () => {
    const a = time(2000), b = time(4000), c = time(8000);
    console.log("[reviewer2] regex", JSON.stringify({ a, b, c }));
    // linear: doubling the input about doubles the time. Quadratic: x4.
    expect(c.ms, JSON.stringify({ a, b, c })).toBeLessThan(Math.max(50, b.ms * 2.6));
  });
});

describe("pdfImages: /Length", () => {
  it("an indirect /Length with a 2-digit object number (/Length 12 0 R) keeps the whole JPEG", () => {
    const r = pdfImages(Buffer.concat([B("%PDF-1.4\n"), dct("12 0 R"), B("12 0 obj\n" + JPEG.length + "\nendobj\n")]));
    expect(r.images[0]?.length).toBe(JPEG.length);
  });
  it("an indirect /Length with a 1-digit object number (/Length 5 0 R) keeps the whole JPEG (control)", () => {
    const r = pdfImages(Buffer.concat([B("%PDF-1.4\n"), dct("5 0 R")]));
    expect(r.images[0]?.length).toBe(JPEG.length);
  });
  it("a Flate grey page with /Length 12 0 R is read, not skipped", () => {
    const px = zlib.deflateSync(Buffer.alloc(100 * 100, 200));
    const buf = Buffer.concat([B("%PDF-1.4\n<< /Subtype /Image /Width 100 /Height 100 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length 12 0 R >>\nstream\n"), px, B("\nendstream\n")]);
    const r = pdfImages(buf);
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 1, skipped: 0 });
  });
  it("a /Length too large (but inside the file) on page 1 does not swallow page 2", () => {
    const p2 = dct(String(JPEG.length));
    const p1 = dct(String(JPEG.length + p2.length + 20));
    const r = pdfImages(Buffer.concat([B("%PDF-1.4\n"), p1, p2, B("trailer\n<< /Root 1 0 R >>\n%%EOF\n")]));
    expect(r.images.length).toBe(2);
  });
});

describe("pdfImages: bitmap memory from a small upload", () => {
  it("20 x 40 Mpx grey Flate pages: what one small upload costs", () => {
    const one = zlib.deflateSync(Buffer.alloc(8000 * 5000, 255), { level: 9 });
    const page = Buffer.concat([B(`<< /Subtype /Image /Width 8000 /Height 5000 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length ${one.length} >>\nstream\n`), one, B("\nendstream\n")]);
    const buf = Buffer.concat([B("%PDF-1.4\n"), ...Array.from({ length: 20 }, () => page)]);
    const t = performance.now();
    const r = pdfImages(buf);
    const held = r.images.reduce((s, x) => s + x.length, 0);
    console.log("[reviewer2] bomb", JSON.stringify({ fileKB: Math.round(buf.length / 1024), images: r.images.length, skipped: r.skipped, heldMB: Math.round(held / 1e6), ms: Math.round(performance.now() - t) }));
    // what the fix allows on purpose (600 MB); recorded, asserted only as "under 1 MB of file holds under 200 MB" (the pre-fix budget was 150 MB)
    expect(held / buf.length, "amplification").toBeLessThan(200);
  });
});

describe("pdfImages: real scan encodings", () => {
  const flate = (dictExtra: string) => {
    const px = zlib.deflateSync(Buffer.alloc(100 * 100 * 3, 200));
    return Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width 100 /Height 100 /BitsPerComponent 8 ${dictExtra} /Filter /FlateDecode /Length ${px.length} >>\nstream\n`), px, B("\nendstream\n")]);
  };
  it("an RGB Flate page with /ColorSpace /ICCBased (as an indirect ref) is read", () => {
    expect(pdfImages(flate("/ColorSpace 7 0 R")).images.length).toBe(1);
  });
  it("a JPEG page with an SMask is ONE page, not two", () => {
    const mask = zlib.deflateSync(Buffer.alloc(10 * 10, 255));
    const buf = Buffer.concat([B("%PDF-1.4\n"), dct(String(JPEG.length)).subarray(0), B(`<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length ${mask.length} >>\nstream\n`), mask, B("\nendstream\n")]);
    expect(pdfImages(buf).images.length).toBe(1);
  });
});

describe("what the fix claims (should hold)", () => {
  it("a 5 MB file: a stream with no end followed by many image dictionaries is fast and copies nothing big", () => {
    const d = "<< /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode >>\nstream\n";
    const buf = B("%PDF-1.4\n" + (d + "x".repeat(200)).repeat(Math.ceil(5e6 / (d.length + 200))));
    const t = performance.now(); const r = pdfImages(buf); const ms = performance.now() - t;
    console.log("[reviewer2] noend", JSON.stringify({ MB: buf.length / 1e6, ms: Math.round(ms), images: r.images.length, held: r.images.reduce((s, x) => s + x.length, 0) }));
    expect(ms).toBeLessThan(1000);
  });
  it("100k tiny image streams (each with /Length and endstream) are linear", () => {
    const one = (n: number) => B(("<< /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray /Length 1 >>\nstream\nA\nendstream\n").repeat(n));
    const t1 = performance.now(); pdfImages(one(50_000)); const a = performance.now() - t1;
    const t2 = performance.now(); pdfImages(one(100_000)); const b = performance.now() - t2;
    console.log("[reviewer2] tiny", JSON.stringify({ a: Math.round(a), b: Math.round(b) }));
    expect(b).toBeLessThan(Math.max(200, a * 3));
  });
});
