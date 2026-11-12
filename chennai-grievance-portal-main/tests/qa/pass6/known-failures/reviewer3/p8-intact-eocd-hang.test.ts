/**
 * reviewer3 on P6-008 (17f93d9). RUN ONLY UNDER `timeout 30` (this file hangs on the fixed code):
 *   timeout 30 npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer3/p8-intact-eocd-hang.test.ts < /dev/null
 * The hunter's cut-off 40 bytes, followed by a well-formed table of contents (one central-directory entry for "[Content_Types].xml",
 * deflate, local header at 0, compressed size 30) and an end record pointing at it: zipIntact() says whole, and XLSX.read never returns.
 */
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseFile } from "@/lib/studio/parse";
import { zipIntact } from "@/lib/studio/formats";

const NAME = "[Content_Types].xml";
const build = (csize: number, usize: number): Buffer => {
  const loc = Buffer.from(zipSync({ [NAME]: strToU8('<?xml version="1.0"?><Types>') })).subarray(0, 40);
  const cd = Buffer.alloc(46 + NAME.length);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(csize, 20); cd.writeUInt32LE(usize, 24); cd.writeUInt16LE(NAME.length, 28); cd.write(NAME, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(loc.length, 16);
  return Buffer.concat([Buffer.from(loc), cd, end]);
};

describe("reviewer3 P6-008: an intact end record over a cut-off entry", () => {
  it("zipIntact calls it whole (so the guard lets it through)", () => {
    expect(zipIntact(build(30, 100_000_000))).toBe(true);
  });
  it("register.xlsx = cut-off local header + intact table of contents: refused in under a second (hangs instead)", () => {
    const t0 = performance.now();
    expect(() => parseFile(build(30, 100_000_000), "register.xlsx")).toThrow();
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
