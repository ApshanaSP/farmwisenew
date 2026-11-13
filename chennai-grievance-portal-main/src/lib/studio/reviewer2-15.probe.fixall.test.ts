// reviewerF-08 (on reviewer2-15, 041e1aa6): any 8-bit Flate page whose colour space was an indirect reference ("/ColorSpace 5 0 R") was
// read by its size, W x H bytes as grey and 3 W H as RGB. An indirect reference is not always ICC: object 5 can be [/Indexed /DeviceRGB ...]
// (a palette scan) or a /Separation, whose W x H bytes are palette indices or ink tints, not grey levels. Before 041e1aa6 such a page was
// skipped (and counted); 041e1aa6 passed its indices to OCR as a grey picture (index 1 = white read as grey 1, near black). The reference
// is now followed: an ICC profile (its /N, else the size) or a device space is read, anything else skipped as before.
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { pdfImages } from "@/lib/studio/ocr";

const B = (s: string) => Buffer.from(s, "latin1");
const W = 40, H = 40;
const page = (cs: string, ch = 1, fill = 1) => {
  const z = zlib.deflateSync(Buffer.alloc(W * H * ch, fill));
  return Buffer.concat([B(`1 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace ${cs} /Filter /FlateDecode /Length ${z.length} >>\nstream\n`), z, B("\nendstream\nendobj\n")]);
};
const pdf = (...parts: Buffer[]) => Buffer.concat([B("%PDF-1.4\n"), ...parts]);

describe("reviewerF-08 (reviewer2-15): a palette page behind an indirect colour space is not read as grey", () => {
  it("[/Indexed /DeviceRGB 1 <000000FFFFFF>] by reference: skipped, or white read as white", () => {
    const r = pdfImages(pdf(B("5 0 obj\n[/Indexed /DeviceRGB 1 <000000FFFFFF>]\nendobj\n"), page("5 0 R")));
    const p = r.images[0];
    const ok = !p || p[p.length - 1] === 255;
    expect(ok, p ? `read as grey, last pixel ${p[p.length - 1]}` : "skipped").toBe(true);
  });
  it("a /Separation by reference, and a reference the file does not hold, are skipped and counted", () => {
    expect(pdfImages(pdf(B("5 0 obj\n[/Separation /Spot /DeviceCMYK 6 0 R]\nendobj\n"), page("5 0 R")))).toEqual({ images: [], skipped: 1 });
    expect(pdfImages(pdf(page("5 0 R")))).toEqual({ images: [], skipped: 1 });
  });
  it("a reference to an ICC profile (through an array, or straight to /DeviceGray) is still read", () => {
    const icc = (n: number, N: number) => B(`${n} 0 obj\n<< /N ${N} /Alternate /DeviceRGB /Length 4 >>\nstream\nabcd\nendstream\nendobj\n`);
    const grey = pdfImages(pdf(icc(7, 1), B("5 0 obj\n[/ICCBased 7 0 R]\nendobj\n"), page("5 0 R", 1, 200)));
    const rgb = pdfImages(pdf(icc(7, 3), B("5 0 obj\n[/ICCBased 7 0 R]\nendobj\n"), page("5 0 R", 3, 200)));
    const dev = pdfImages(pdf(B("5 0 obj\n/DeviceGray\nendobj\n"), page("5 0 R", 1, 200)));
    for (const r of [grey, rgb, dev]) expect([r.images.length, r.skipped, r.images[0]?.[r.images[0].length - 1]]).toEqual([1, 0, 200]);
  });
  it("an ICC profile's /N decides: four channels (CMYK) skipped even when the size would fit grey", () => {
    const icc = B("7 0 obj\n<< /N 4 /Length 4 >>\nstream\nabcd\nendstream\nendobj\n");
    expect(pdfImages(pdf(icc, page("[/ICCBased 7 0 R]", 1, 200)))).toEqual({ images: [], skipped: 1 });
  });
});
