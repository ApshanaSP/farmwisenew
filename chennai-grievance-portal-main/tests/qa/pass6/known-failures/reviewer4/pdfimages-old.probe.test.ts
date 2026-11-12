// reviewer4: the same two pages through the code as it stood before c641408 (copied from git show c641408^:.../ocr.ts, bitmap part only)
import zlib from "zlib";
import { expect, it } from "vitest";
const B = (s: string) => Buffer.from(s, "latin1");
function oldPdfImages(buf: Buffer) {
  const src = buf.toString("latin1"); const images: Buffer[] = []; let skipped = 0;
  const re = /<<((?:[^<>]|<<[^<>]*>>)*?\/Subtype\s*\/Image(?:[^<>]|<<[^<>]*>>)*?)>>\s*stream\r?\n/g; let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && images.length < 20) {
    const dict = m[1]; const start = m.index + m[0].length;
    const len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] ?? -1);
    const end = len > 0 && start + len <= buf.length ? start + len : src.indexOf("endstream", start);
    if (end < 0) break; re.lastIndex = Math.max(re.lastIndex, end);
    const data = buf.subarray(start, end);
    const W = Number(dict.match(/\/Width\s+(\d+)/)?.[1]), H = Number(dict.match(/\/Height\s+(\d+)/)?.[1]);
    const need = W * H;
    try { const px = /\/FlateDecode/.test(dict) ? zlib.inflateSync(data, { maxOutputLength: need + 1024 }) : data; if (px.length < need) { skipped++; continue; } images.push(px.subarray(0, need)); } catch { skipped++; }
  }
  return { images: images.length, skipped };
}
function flateEndingIn(byte: number, W = 60, H = 60) {
  for (let v = 0; v < 5000; v++) { const raw = Buffer.alloc(W * H, v % 251); raw[0] = v >> 8; const z = zlib.deflateSync(raw); if (z[z.length - 1] === byte) return { z, W, H }; }
  throw new Error("none");
}
it("old code keeps both pages the new code drops", () => {
  const { z, W, H } = flateEndingIn(0x0d);
  const a = oldPdfImages(Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode /Length 7 0 R >>\nstream\n`), z, B("\nendstream\n")]));
  const raw = Buffer.alloc(400, 200); raw[399] = 13;
  const b = oldPdfImages(Buffer.concat([B(`%PDF-1.4\n<< /Subtype /Image /Width 20 /Height 20 /BitsPerComponent 8 /ColorSpace /DeviceGray >>\nstream\n`), raw, B("\nendstream\n")]));
  console.log("[r4-old]", JSON.stringify({ flate: a, raw: b }));
  expect([a, b]).toEqual([{ images: 1, skipped: 0 }, { images: 1, skipped: 0 }]);
});
