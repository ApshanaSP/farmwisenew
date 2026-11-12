// reviewer4 (QA pass 6): try to break the P6-013 fix to pdfImages (src/lib/studio/ocr.ts).
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { pdfImages } from "@/lib/studio/ocr";

const B = (s: string) => Buffer.from(s, "latin1");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), B("JFIF\0"), Buffer.alloc(300, 0x11), Buffer.from([0xff, 0xd9])]);
const time = (buf: Buffer) => { const t = performance.now(); const r = pdfImages(buf); return { bytes: buf.length, ms: Math.round(performance.now() - t), n: r.images.length }; };

// a deflate stream whose last byte (adler-32's low byte) is 0x0D: about one page in 256
function flateEndingIn(byte: number, W = 60, H = 60) {
  for (let v = 0; v < 5000; v++) { const raw = Buffer.alloc(W * H, v % 251); raw[0] = v >> 8; const z = zlib.deflateSync(raw); if (z[z.length - 1] === byte) return { raw, z, W, H }; }
  throw new Error("none");
}

describe("reviewer4 P6-013: the fall-back end (no direct /Length) drops the end-of-line", () => {
  it("a Flate grey page with an indirect /Length whose data ends in 0x0D, EOL \n: kept?", () => {
    const { z, W, H } = flateEndingIn(0x0d);
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length 7 0 R >>\nstream\n`), z, B("\nendstream\nendobj\n7 0 obj\n" + z.length + "\nendobj\n")]);
    const r = pdfImages(buf);
    console.log("[r4] flate+indirect+0x0D:", JSON.stringify({ images: r.images.length, skipped: r.skipped }));
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 1, skipped: 0 });
  });
  it("control: same page, data ending in another byte", () => {
    const { z, W, H } = flateEndingIn(0x41);
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length 7 0 R >>\nstream\n`), z, B("\nendstream\n")]);
    const r = pdfImages(buf);
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 1, skipped: 0 });
  });
  it("an unfiltered grey bitmap with no /Length whose last pixel is 13, EOL \n: kept?", () => {
    const W = 20, H = 20; const raw = Buffer.alloc(W * H, 200); raw[raw.length - 1] = 13;
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray >>\nstream\n`), raw, B("\nendstream\n")]);
    const r = pdfImages(buf);
    console.log("[r4] raw+nolength+13:", JSON.stringify({ images: r.images.length, skipped: r.skipped, last: r.images[0]?.[r.images[0].length - 1] }));
    expect({ images: r.images.length, skipped: r.skipped }).toEqual({ images: 1, skipped: 0 });
  });
});

describe("reviewer4 P6-013: real-scanner shapes", () => {
  it("CRLF line ends, direct /Length: whole JPEG", () => {
    const buf = Buffer.concat([B(`%PDF-1.4\r\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${JPEG.length} >>\r\nstream\r\n`), JPEG, B("\r\nendstream\r\nendobj\r\n")]);
    expect(pdfImages(buf).images[0]?.length).toBe(JPEG.length);
  });
  it("JPEG data containing the bytes 'endstream', direct /Length: whole JPEG", () => {
    const j = Buffer.concat([JPEG.subarray(0, 100), B("\nendstream\n"), JPEG.subarray(100)]);
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width 10 /Height 10 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${j.length} >>\nstream\n`), j, B("\nendstream\n")]);
    expect(pdfImages(buf).images[0]?.length).toBe(j.length);
  });
  it("/Length with a comment after it, and two spaces", () => {
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode /Length  ${JPEG.length} % len\n /Width 10 >>\nstream\n`), JPEG, B("\nendstream\n")]);
    expect(pdfImages(buf).images[0]?.length).toBe(JPEG.length);
  });
  it("/Length 0 with real data after it", () => {
    const buf = Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode /Length 0 >>\nstream\n`), JPEG, B("\r\nendstream\n")]);
    const r = pdfImages(buf);
    console.log("[r4] length0:", r.images.map((x) => x.length), "jpeg", JPEG.length);
    expect(r.images[0]?.length).toBe(JPEG.length);
  });
  it("/Length 0, empty stream: an empty page is not passed on as an image", () => {
    const r = pdfImages(B(`%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode /Length 0 >>\nstream\nendstream\n`));
    console.log("[r4] empty:", JSON.stringify({ images: r.images.map((x) => x.length), skipped: r.skipped }));
    expect(r.images.filter((x) => x.length === 0).length).toBe(0);
  });
  it("a level-2 nested dictionary before the image (font descriptor style) does not hide the image", () => {
    const font = B("<< /Type /Font /Desc << /A << /B 1 >> >> /Length 4 >>\nstream\nabcd\nendstream\n");
    const img = Buffer.concat([B(`<< /Subtype /Image /Filter /DCTDecode /Length ${JPEG.length} >>\nstream\n`), JPEG, B("\nendstream\n")]);
    expect(pdfImages(Buffer.concat([B("%PDF-1.4\n"), font, img])).images.length).toBe(1);
  });
  it("an image dictionary with a level-2 nested value is still found", () => {
    const img = Buffer.concat([B(`<< /Subtype /Image /Filter /DCTDecode /X << /Y << /Z 1 >> >> /Length ${JPEG.length} >>\nstream\n`), JPEG, B("\nendstream\n")]);
    const r = pdfImages(Buffer.concat([B("%PDF-1.4\n"), img]));
    console.log("[r4] level2 image:", r.images.length, r.skipped);
  });
});

describe("reviewer4 P6-013: crafted inputs, time", () => {
  const cases: [string, (k: number) => Buffer][] = [
    ["nested << >> two deep, unclosed", (k) => B("%PDF-1.4\n<< " + "<< /A << /B 1 >> ".repeat(k) + "\n")],
    ["huge dictionary, no stream", (k) => B("%PDF-1.4\n<< " + "/Subtype /Image /Length 1 0 R ".repeat(k) + ">>\nendobj\n")],
    ["many 'stream' words after >>", (k) => B("%PDF-1.4\n" + "<< /Subtype /Image >> streamx\n".repeat(k))],
    ["<<>>stream with no endstream", (k) => B("%PDF-1.4\n" + "<</Subtype/Image>>stream\n".repeat(k))],
    ["<< then long run then << repeated", (k) => B("%PDF-1.4\n" + ("<<" + "a".repeat(200)).repeat(k))],
    ["/Length digits run then 0 R", (k) => B("%PDF-1.4\n<< /Subtype /Image " + ("/Length " + "1".repeat(50) + " 0 R ").repeat(k) + ">>\nstream\n" + "x".repeat(10) + "\nendstream\n")],
    ["streams each with an endstream far away (indexOf)", (k) => B("%PDF-1.4\n" + "<</Length 1 0 R>>stream\n".repeat(k) + "endstream\n")],
    ["/Length pointing at a 'endstream' that is not the stream's, many", (k) => B("%PDF-1.4\n" + "<</Subtype/Image/Filter/DCTDecode/Length 3>>stream\nabc\nendstream\n".repeat(k))]
  ];
  for (const [name, mk] of cases) {
    it(name, () => {
      const a = time(mk(5000)), b = time(mk(20000));
      console.log(`[r4-time] ${name}:`, JSON.stringify({ a, b }));
      expect(b.ms, JSON.stringify({ a, b })).toBeLessThan(Math.max(200, a.ms * 8));
    });
  }
});
