/**
 * reviewer3 on P6-008 (17f93d9). RUN ONLY UNDER `timeout 30` (this file hangs on the fixed code):
 *   timeout 30 npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer3/p8-xls-hang.test.ts < /dev/null
 * zipIntact() runs only when isZip() (bytes "PK\x03\x04"). SheetJS treats any "PK" + two bytes < 9 as a ZIP. A file named .xls goes to
 * excelAll() without the ZIP check (readAll line 91), so the same cut-off 40 bytes with byte 3 changed still make XLSX.read never return.
 */
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseFile } from "@/lib/studio/parse";

const s40 = () => Buffer.from(Buffer.from(zipSync({ "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types>') })).subarray(0, 40));

describe("reviewer3 P6-008: a cut-off ZIP that does not start PK\x03\x04, named .xls", () => {
  it("PK\x07\x08 + the cut-off header, as register.xls: refused in under a second (hangs instead)", () => {
    const b = s40(); b[2] = 0x07; b[3] = 0x08;
    const t0 = performance.now();
    expect(() => parseFile(b, "register.xls")).toThrow();
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
