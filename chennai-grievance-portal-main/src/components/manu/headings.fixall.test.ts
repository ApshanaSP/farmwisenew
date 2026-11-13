import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// P5-033's seam-08 (pass 4's RC-49 class): the Manu Desk console had no h1 (its title was a <b>) and its lists jumped from h2 to h4.
// Pass 4's heading guard (a11y.pass4.test.ts) reads only the Collector and Officer consoles. One h1, then h2 and h3, no level skipped.
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const levels = (src: string) => [...src.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

describe("seam-08: the Manu Desk's headings", () => {
  it("the console has one h1, its title", () => {
    expect(read("ManuCounter.tsx")).toMatch(/<h1\b[^>]*>Manu Desk<\/h1>/);
    expect(levels(read("ManuDesk.tsx"))).not.toContain(1);
  });
  it("no heading skips a level: h2 sections, h3 under them, no h4", () => {
    const desk = levels(read("ManuDesk.tsx"));
    expect(desk).not.toContain(4);
    expect(Math.max(...desk)).toBe(3);
  });
});
