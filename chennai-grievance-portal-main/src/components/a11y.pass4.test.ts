import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RC-49 class guard (PB-324, PB-326). The real run is tests/qa/pass4/axe.mjs (zero violations of any impact on every page, both languages and
 * themes) and tests/qa/pass4/keys.mjs (a Tab walk: every stop shows a ring). These source rules run in every unit pass:
 *  1. a heading never jumps a level: the page's one h1 is followed by h2 for a card or section title (the shared card headers are h2),
 *  2. the consoles put their page in a main landmark (axe "region"),
 *  3. no global rule takes the keyboard ring away from a control that has no ring of its own.
 */
const SRC = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
const walk = (d: string, ext: RegExp, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(SRC, d), { withFileTypes: true })) {
    const rel = path.posix.join(d, e.name);
    if (e.isDirectory()) walk(rel, ext, out);
    else if (ext.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
};

describe("RC-49: heading order", () => {
  it("a card header is an h2, in the shared kit and in the console's own `.ch` headers", () => {
    expect(read("components/ui/index.tsx")).toMatch(/<div className="ui-ch-t"><h2>/);
    const bad: string[] = [];
    for (const f of walk("components", /\.tsx$/)) {
      const src = read(f);
      for (const m of src.matchAll(/className="ch"[^\n]*?<h3/g)) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(bad).toEqual([]);
  });
  it("the citizen home's card title is an h2 straight after its h1", () => {
    const s = read("components/citizen/CitizenHome.tsx");
    expect(s).toMatch(/<h1 /);
    expect(s).not.toMatch(/<h3[ >]/);
  });
  it("the styles that named h3 for these headers name h2 too", () => {
    expect(read("components/ui/ui.css")).toMatch(/\.ui-ch-t :is\(h2,h3\)/);
    const css = walk("components", /\.css$/).map(read).join("\n");
    expect(css).not.toMatch(/\.ch h3/);
  });
});

describe("RC-49: landmarks", () => {
  it("the Collector's and the Officer's console put their page in a main", () => {
    expect(read("components/collector/app/CollectorApp.tsx")).toMatch(/<main className="body">[\s\S]*<\/main>/);
    expect(read("components/officer/OfficerApp.tsx")).toMatch(/<main className="body">[\s\S]*<\/main>/);
  });
});

describe("RC-49: the keyboard ring", () => {
  it("the base style does not remove the outline of every focused control", () => {
    const css = read("app/globals.css");
    const base = css.match(/(?:^|\n)\s*:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(base).toMatch(/outline:\s*2px solid/);
    expect(base).not.toMatch(/outline:\s*none/);
  });
  it("only a control with its own ring switches the base ring off", () => {
    const css = read("app/globals.css");
    const off = css.match(/\n\s*\.dic :focus-visible,([\s\S]*?)\{\s*outline:\s*none;/)?.[1] ?? "";
    // every selector in the list is the console's own scope or one that draws a ring of its own
    for (const sel of off.split(",").map((x) => x.trim()).filter(Boolean)) expect(sel, sel).toMatch(/btn|form-input|auth-input|focus-visible:ring|focus:ring|focus-visible:outline-none/);
  });
  it("the console's zone, taluk and department selects draw their own ring", () => {
    expect(read("components/collector/app/marina.css")).toMatch(/\.dic \.fsel select:focus-visible\{outline:2px solid/);
  });
});
