import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { pdfImages } from "@/lib/studio/ocr";

const B = (s: string) => Buffer.from(s, "latin1");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), B("JFIF\0"), Buffer.alloc(300, 0x11), Buffer.from([0xff, 0xd9])]);

// reviewer4-04 (P6-013 regression): with no direct /Length the stream runs to "endstream", and the end-of-line before it was taken off
// as an LF and then, separately, a CR, even when the end-of-line was a lone LF: a stream whose own last byte is 0x0D lost it. Flate then
// failed its checksum (about 1 page in 256 with an indirect /Length), and an unfiltered bitmap came up one byte short.
function flateEndingIn(byte: number, W = 60, H = 60) {
  for (let v = 0; v < 5000; v++) { const raw = Buffer.alloc(W * H, v % 251); raw[0] = v >> 8; const z = zlib.deflateSync(raw); if (z[z.length - 1] === byte) return { raw, z, W, H }; }
  throw new Error("none");
}

describe("reviewer4-04: a stream with no direct /Length keeps its own last byte", () => {
  it("a Flate grey page with an indirect /Length whose data ends in 0x0D", () => {
    for (const eol of ["\n", "\r\n"]) {
      const { z, W, H } = flateEndingIn(0x0d);
      const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length 7 0 R >>\nstream${eol}`), z, B(`${eol}endstream\nendobj\n7 0 obj\n${z.length}\nendobj\n`)]);
      const r = pdfImages(buf);
      expect({ images: r.images.length, skipped: r.skipped }, JSON.stringify(eol)).toEqual({ images: 1, skipped: 0 });
    }
  });
  it("an unfiltered grey bitmap with no /Length whose last pixel is 13", () => {
    const W = 20, H = 20; const raw = Buffer.alloc(W * H, 200); raw[raw.length - 1] = 13;
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray >>\nstream\n`), raw, B("\nendstream\n")]);
    const r = pdfImages(buf);
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 1, skipped: 0 });
    expect(r.images[0][r.images[0].length - 1]).toBe(13);
  });
  it("a JPEG with no direct /Length still loses only the end-of-line (LF, CRLF or CR)", () => {
    for (const eol of ["\n", "\r\n", "\r"]) {
      const buf = Buffer.concat([B("%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode /Length 0 >>\nstream\n"), JPEG, B(`${eol}endstream\n`)]);
      expect(pdfImages(buf).images[0]?.length, JSON.stringify(eol)).toBe(JPEG.length);
    }
  });
  it("an empty stream is not passed on as a page", () => {
    const r = pdfImages(B("%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode /Length 0 >>\nstream\nendstream\n"));
    expect(r.images).toEqual([]);
    expect(r.skipped).toBe(1);
  });
});

// reviewer2-15: only /DeviceRGB and /DeviceGray bitmaps were read, so a scanner's RGB or grey page with an ICC colour space (an indirect
// reference, or [/ICCBased n 0 R]) was left out; and every 8-bit grey image was taken as a page, a JPEG page's soft mask included.
describe("reviewer2-15: real scan encodings", () => {
  const flate = (n: number, W: number, H: number, ch: number, cs: string, extra = "") => {
    const px = zlib.deflateSync(Buffer.alloc(W * H * ch, 200));
    return Buffer.concat([B(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace ${cs}${extra} /Filter /FlateDecode /Length ${px.length} >>\nstream\n`), px, B("\nendstream\nendobj\n")]);
  };
  const icc = (n: number, N: number) => B(`${n} 0 obj\n<< /N ${N} /Length 4 >>\nstream\nabcd\nendstream\nendobj\n`);
  it("an RGB and a grey Flate page with an ICC colour space (indirect, or [/ICCBased n 0 R]) are read", () => {
    const buf = Buffer.concat([B("%PDF-1.4\n"), icc(7, 3), icc(8, 1), B("9 0 obj\n[/ICCBased 7 0 R]\nendobj\n"), flate(1, 100, 100, 3, "9 0 R"), flate(2, 100, 100, 1, "[/ICCBased 8 0 R]")]);
    const r = pdfImages(buf);
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 2, skipped: 0 });
    // every page reaches OCR grey (reviewer2-13): the RGB page's 200, 200, 200 is grey 200, and both are 100 x 100
    expect(r.images.map((x) => [x.subarray(0, 15).toString("latin1"), x.length, x[x.length - 1]])).toEqual([["P5\n100 100\n255\n", 15 + 100 * 100, 200], ["P5\n100 100\n255\n", 15 + 100 * 100, 200]]);
  });
  it("a CMYK page behind an ICC colour space is skipped, not read as RGB or grey", () => {
    const r = pdfImages(Buffer.concat([B("%PDF-1.4\n"), flate(1, 50, 50, 4, "[/ICCBased 7 0 R]")]));
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 0, skipped: 1 });
  });
  it("a JPEG page with a soft mask (/SMask n 0 R) is one page, wherever the mask is in the file", () => {
    const page = (n: number, mask: number) => Buffer.concat([B(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /SMask ${mask} 0 R /Filter /DCTDecode /Length ${JPEG.length} >>\nstream\n`), JPEG, B("\nendstream\nendobj\n")]);
    const before = pdfImages(Buffer.concat([B("%PDF-1.4\n"), flate(12, 10, 10, 1, "/DeviceGray"), page(11, 12)]));
    const after = pdfImages(Buffer.concat([B("%PDF-1.4\n"), page(11, 12), flate(12, 10, 10, 1, "/DeviceGray"), flate(13, 10, 10, 1, "/DeviceGray", " /Decode [1 0]")]));
    expect(before.images.length).toBe(1);
    // the mask is left out, not counted as a page that could not be read; a grey page no image points at is still a page
    expect(before.skipped).toBe(0);
    expect(after.images.length).toBe(2);
  });
});

// reviewer2-13: the bitmap budget (600 MB, to fit 20 real A4 300 dpi colour pages) was also what one request held: a 762 KB PDF of
// 40 Mpx pages came back as 600 MB of page images, and OCR then ran on fifteen 40 Mpx pages. OCR needs no more than a 300 dpi grey page.
describe("reviewer2-13: a small PDF of huge pages is not held, or read by OCR, at full size", () => {
  const page = (n: number, W: number, H: number, ch: number, px: Buffer) => {
    const z = zlib.deflateSync(px, { level: 9 });
    return Buffer.concat([B(`${n} 0 obj\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /Device${ch === 3 ? "RGB" : "Gray"} /Filter /FlateDecode /Length ${z.length} >>\nstream\n`), z, B("\nendstream\nendobj\n")]);
  };
  const dims = (img: Buffer) => img.subarray(0, 40).toString("latin1").match(/^P5\n(\d+) (\d+)\n255\n/)!.slice(1).map(Number);
  it("20 grey pages of 40 Mpx: what the call returns stays within 200 times the file, every page at most OCR_PAGE_PIXELS", async () => {
    const { OCR_PAGE_PIXELS } = await import("@/lib/studio/ocr") as { OCR_PAGE_PIXELS: number };
    const one = page(1, 8000, 5000, 1, Buffer.alloc(8000 * 5000, 255));
    const buf = Buffer.concat([B("%PDF-1.4\n"), ...Array.from({ length: 20 }, () => one)]);
    const r = pdfImages(buf);
    const held = r.images.reduce((s, x) => s + x.length, 0);
    expect(r.images.length).toBeGreaterThan(10);
    expect(held / buf.length, `${held} bytes held from a ${buf.length} byte file`).toBeLessThan(200);
    for (const img of r.images) { const [w, h] = dims(img); expect(w * h).toBeLessThanOrEqual(OCR_PAGE_PIXELS); }
  }, 60_000);
  it("an A4 colour page at 300 dpi is kept at full size (as grey), and a page shrunk to fit keeps its picture", () => {
    const a4 = pdfImages(Buffer.concat([B("%PDF-1.4\n"), page(1, 2480, 3508, 3, Buffer.alloc(2480 * 3508 * 3, 200))]));
    expect(dims(a4.images[0])).toEqual([2480, 3508]);
    expect(a4.images[0][a4.images[0].length - 1]).toBe(200);
    // 6000 x 6000, left half black, right half white: half the size each way, still black then white
    const W = 6000, px = Buffer.alloc(W * W, 255);
    for (let y = 0; y < W; y++) px.fill(0, y * W, y * W + W / 2);
    const big = pdfImages(Buffer.concat([B("%PDF-1.4\n"), page(1, W, W, 1, px)])).images[0];
    const [w, h] = dims(big);
    expect([w, h]).toEqual([3000, 3000]);
    const body = big.subarray(big.length - w * h);
    expect([body[0], body[w / 2 - 1], body[w / 2], body[w * h - 1]]).toEqual([0, 0, 255, 255]);
  }, 60_000);
});
