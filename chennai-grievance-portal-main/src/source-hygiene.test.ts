import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// A control character typed into a regex (a backspace where "\b" was meant) is invisible in review and silently stops the
// pattern matching: cluster.ts's street-name rule never ran because of one. No source file may hold one.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(tsx?|jsx?|css)$/.test(e.name) ? [p] : [];
  });
}

describe("source files", () => {
  it("hold no control characters", () => {
    const hits = files(__dirname).flatMap((f) => fs.readFileSync(f, "utf8").split("\n")
      .map((line, i) => (BAD.test(line) ? `${path.relative(__dirname, f)}:${i + 1}` : null)).filter((x): x is string => !!x));
    expect(hits).toEqual([]);
  });
});
