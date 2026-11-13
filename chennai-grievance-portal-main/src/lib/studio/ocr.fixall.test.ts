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
