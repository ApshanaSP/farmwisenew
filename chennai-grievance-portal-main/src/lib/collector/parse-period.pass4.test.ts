import { describe, it, expect } from "vitest";
import { parsePeriod } from "./intel";

// QA pass 4, finding access-fuzz-1: `v in PERIODS` also matches the names every object inherits.
describe("parsePeriod", () => {
  it("access-fuzz-1: ?period=constructor and ?period=__proto__ fall back to daily", () => {
    for (const v of ["constructor", "__proto__", "toString", "hasOwnProperty"]) expect(parsePeriod(v)).toBe("daily");
  });
});

// RC-29 class guard: a name that arrives from a request or a person is never checked against a plain object with `in`, which is also
// true for "constructor", "__proto__" and "toString". Use Object.prototype.hasOwnProperty.call (or a Map or Set).
import fs from "fs";
import path from "path";
describe("RC-29 class guard: no `x in CONSTANT_MAP` on input", () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.golden\./.test(e.name) ? [path.join(d, e.name)] : []);
  it("the collector, officer and assistant code has none", () => {
    const root = path.resolve(__dirname, "..", "..");
    const files = ["lib/collector", "lib/officer", "lib/assistant", "app/api", "components"].flatMap((d) => walk(path.join(root, d)));
    const bad: string[] = [];
    for (const f of files) fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((l, n) => {
      if (/^\s*(\/\/|\*)/.test(l) || /\bfor\s*\(/.test(l)) return;
      if (/\b(v|tok|key|k|name|code|id|s|x|value|kind|type)\s+in\s+[A-Z][A-Z_0-9]{2,}\b/.test(l.replace(/(["'`]).*?\1/g, '""'))) bad.push(`${path.relative(root, f)}:${n + 1} ${l.trim().slice(0, 90)}`);
    });
    expect(bad).toEqual([]);
  });
});
