import fs from "fs";
import path from "path";
import zlib from "zlib";
import { describe, expect, it } from "vitest";

// QA pass 4: no sentence of the blind test sets may appear in non-test source. A rule written from a test sentence would make
// the score say nothing about understanding. On failure this names row ids only, so the sealed set stays unread.
const APP = process.cwd();
const SETS = path.join(APP, "..", "docs", "qa", "pass4", "testsets");
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s​-‍]+/g, " ").trim();
const rows = (): { id: string; text: string }[] => {
  const open = fs.readFileSync(path.join(SETS, "open.jsonl"), "utf8");
  const sealed = zlib.gunzipSync(fs.readFileSync(path.join(SETS, "sealed.jsonl.gz"))).toString("utf8");
  return `${open}\n${sealed}`.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
};
const TEST_FILE = /\.(test|spec|live|cases)\.tsx?$|[\\/]__tests__[\\/]/;
function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name) && !TEST_FILE.test(e.name)) out.push(p);
  }
  return out;
}

describe.runIf(fs.existsSync(path.join(SETS, "sealed.jsonl.gz")))("pass 4 blind sets", () => {
  it("has 450 rows, and no sentence appears in non-test source", () => {
    const all = rows();
    expect(all.length).toBe(450);
    const text = sources(path.join(APP, "src")).map((f) => norm(fs.readFileSync(f, "utf8"))).join("\n");
    const leaked = all.filter((r) => norm(r.text).length >= 10 && text.includes(norm(r.text))).map((r) => r.id);
    expect(leaked).toEqual([]);
  });
});
