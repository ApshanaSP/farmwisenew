/**
 * QA pass 7, studio-parse: the reader process runs scripts/studio-parse-worker.mjs, a committed bundle of the parse code. These guards keep
 * the mechanism whole:
 *  - the bundle is what a fresh build of today's code gives (else the reader runs old code: run node scripts/build-parse-worker.mjs);
 *  - no server code reads a file or a page on its own thread: the in-thread readers of parse.ts, formats.ts and ocr.ts are imported only
 *    by the reader's own files (and two named exceptions, checked below).
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/studio-parse/bundle.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OUT, bundle } from "../../../../scripts/build-parse-worker.mjs";

const ROOT = path.resolve(__dirname, "../../../..");

describe("the reader's bundle", () => {
  it("is what a fresh build of the code gives (run node scripts/build-parse-worker.mjs after changing the parse code)", async () => {
    const fresh: string = await bundle();
    const now = fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    expect(now === fresh, "scripts/studio-parse-worker.mjs is older than the code: run node scripts/build-parse-worker.mjs").toBe(true);
  }, 60_000);
  it("loads SheetJS as a package (xlsx.mjs, as the server bundle does) and never the server side of the reader", () => {
    const text = fs.readFileSync(OUT, "utf8");
    expect(text).toMatch(/^import \* as XLSX from "xlsx";$/m);
    expect(text).not.toMatch(/["']@\/lib\/studio\/parse-pool["']|node:child_process|["']tesseract\.js["']/);
  });
});

/** Every .ts / .tsx file under src, tests left out. */
function sources(dir = path.join(ROOT, "src")): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return sources(p);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

const IN_THREAD: Record<string, string[]> = {
  parse: ["parseAll", "parseFile", "htmlTables", "headlinesIn", "feedLinkIn", "dataLinksIn", "stripPage", "shape"],
  formats: ["pdfTables", "xmlGrid", "kmlGrid", "docxTables", "unzip", "zipIntact"],
  ocr: ["pdfImages"]
};
const READER = ["src/lib/studio/parse.ts", "src/lib/studio/parse-worker.ts", "src/lib/studio/parse-worker-main.ts", "src/lib/studio/formats.ts", "src/lib/studio/ocr.ts"];
const EXCEPT: Record<string, string> = {
  // fetchLink, the old one-guess link reader, has no caller (checked below); studio-egress owns the file
  "src/lib/studio/fetchurl.ts": "htmlTables dataLinksIn feedLinkIn",
  // the Manu Desk keeps only a PDF's JPEG and PNG pages: no inflate, one linear pass (QA pass 6, P5-028 and P6-013)
  "src/lib/manu/files.ts": "pdfImages"
};

describe("no server code reads a file or a page on its own thread", () => {
  it("the in-thread readers are imported only by the reader's files and the two exceptions", () => {
    const found: string[] = [];
    for (const file of sources()) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      if (READER.includes(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/studio\/(parse|formats|ocr)["']/g)) {
        const names = m[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type ")).map((s) => s.split(/\s+as\s+/)[0]);
        const allowed = (EXCEPT[rel] ?? "").split(" ");
        const bad = names.filter((n) => IN_THREAD[m[2]].includes(n) && !allowed.includes(n));
        if (bad.length) found.push(`${rel}: ${bad.join(", ")} from ${m[2]}`);
      }
    }
    expect(found).toEqual([]);
  });
  it("the exceptions hold: fetchLink has no caller, the Manu Desk takes no bitmaps", () => {
    const callers = sources().filter((f) => !f.endsWith("fetchurl.ts") && /\bfetchLink\s*\(/.test(fs.readFileSync(f, "utf8")));
    expect(callers.map((f) => path.relative(ROOT, f))).toEqual([]);
    expect(fs.readFileSync(path.join(ROOT, "src/lib/manu/files.ts"), "utf8")).toMatch(/pdfImages\(b, \{ bitmaps: false \}\)/);
  });
});
