import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA pass 5, merge seam class guards (P5-001, P5-002). Main's Manu Desk was written for Next 14; pass 4 moved the app to Next 15.
 *  1. Next 15 hands a route or page its dynamic segments as a Promise. A handler typed `{ params: { id: string } }` fails `next build`
 *     ("is not a valid type for the function's second argument") and reads the segment without awaiting it.
 *  2. Pass 4 (RC-49) moved every font to next/font in app/layout.tsx and removed the Google Fonts links; a page that links one again
 *     loads a second copy of the fonts from Google on every visit.
 */
const APP = path.resolve(__dirname);
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/^(route|page|layout)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};
const rel = (p: string) => path.relative(APP, p).split(path.sep).join("/");

describe("P5-002: dynamic segments are awaited (Next 15)", () => {
  it("no route, page or layout types its params (or searchParams) as a plain object", () => {
    const bad: string[] = [];
    for (const f of walk(APP)) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(params|searchParams)\??\s*:\s*\{/g)) {
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${rel(f)}:${line}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("P5-001: no page links Google Fonts (fonts come from next/font in app/layout.tsx)", () => {
  it("no route, page or layout under src/app names fonts.googleapis.com or fonts.gstatic.com", () => {
    const bad = walk(APP).filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });
});
