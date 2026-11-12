/**
 * redteam-gate on P6-030 / P6-018 / P6-008: zipIntact() checks the ZIP's structure (end record, table of contents, local headers, sizes),
 * but SheetJS's own inflate (xlsx.js inflate()) does not stop at the entry's compressed size: it reads deflate blocks until a final block,
 * and past the buffer's end every read is 0, an empty non-final stored block, forever. A structurally whole 1-entry ZIP whose deflate
 * stream is an empty non-final stored block (00 00 00 FF FF, what a sync flush writes) passes zipIntact and XLSX.read never returns.
 * XLSX.read runs in a child process under a time limit, so the probe itself cannot hang.
 *   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/known-failures/redteam-gate/p6-030-unended-deflate.test.ts
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { zipIntact } from "@/lib/studio/formats";

function oneEntryZip(data: Buffer, name = "[Content_Types].xml"): Buffer {
  const n = Buffer.from(name);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(100, 22); loc.writeUInt16LE(n.length, 26);
  const local = Buffer.concat([loc, n, data]);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(100, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const cdAll = Buffer.concat([cd, n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cdAll.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cdAll, end]);
}

const readsInChild = (buf: Buffer) => spawnSync(process.execPath,
  ["-e", "require('xlsx').read(Buffer.from(process.argv[1], 'base64'), { type: 'buffer' }); console.log('returned')", buf.toString("base64")],
  { cwd: process.cwd(), timeout: 8000, encoding: "utf8" });

describe("redteam-gate P6-030: a whole ZIP whose deflate stream never ends", () => {
  it("control: the same ZIP with a final empty stored block (01 00 00 FF FF) returns or throws at once in the child", () => {
    const buf = oneEntryZip(Buffer.from([0x01, 0x00, 0x00, 0xff, 0xff]));
    expect(zipIntact(buf)).toBe(true);
    const r = readsInChild(buf);
    console.log("control child:", { status: r.status, error: r.error?.message, err: (r.stderr || "").slice(0, 120) });
    expect(r.error?.message ?? "").not.toMatch(/ETIMEDOUT/);
  }, 20_000);

  it("passes zipIntact, and XLSX.read (what parseFile calls next, parse.ts:277) returns or throws within 8 s", () => {
    const buf = oneEntryZip(Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]));
    expect(zipIntact(buf)).toBe(true); // the check lets it through to SheetJS
    const r = readsInChild(buf);
    console.log("child:", { status: r.status, signal: r.signal, error: r.error?.message, out: (r.stdout || "").slice(0, 80), err: (r.stderr || "").slice(0, 200) });
    expect(r.error?.message ?? "", "XLSX.read did not return within 8 s").not.toMatch(/ETIMEDOUT/);
  }, 20_000);
});
