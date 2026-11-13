// RC-49 / RC-48 class guards (PB-320, PB-321, PB-322, PB-323, PB-325): the accessibility mistakes that axe found, checked in the source
// so that a new page or component cannot bring them back. The browser run (tests/qa/pass4/axe.mjs) checks the rendered result.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = process.env.A11Y_SRC_ROOT ?? path.resolve(__dirname, ".."); // the env var lets a run point at an older copy of src
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const read = (p: string) => fs.readFileSync(p, "utf8");

/** The text of the element that starts at `from` (a `<div` or `<nav` opening tag), up to its matching close. */
function elementText(s: string, from: number): string {
  const name = /^<(\w+)/.exec(s.slice(from))![1];
  const re = new RegExp(`<${name}(?=[\\s>])|</${name}>`, "g");
  re.lastIndex = from + 1;
  let depth = 1, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return s.slice(from, m.index + m[0].length);
  }
  return s.slice(from);
}

describe("RC-49 a11y class guards", () => {
  it("PB-320: every button directly inside a role=tablist is a role=tab (axe aria-required-children)", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const s = read(f);
      for (const m of s.matchAll(/<(div|nav)\b[^>]*role="tablist"/g)) {
        const el = elementText(s, m.index!);
        for (const b of el.matchAll(/<button\b[^>]*>/g)) if (!/role=/.test(b[0])) bad.push(`${path.relative(SRC, f)}: ${b[0].slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("PB-323: a language switch names itself with the words it shows (axe label-content-name-mismatch)", () => {
    for (const f of ["components/LangToggle.tsx", "components/collector/app/TopMenu.tsx"]) {
      const s = read(path.join(SRC, f));
      const label = /aria-label=\{lang === "ta" \? "([^"]+)" : "([^"]+)"\}/.exec(s);
      expect(label, f).not.toBeNull();
      expect(label![1].startsWith("English"), f).toBe(true);
      expect(label![2].startsWith("தமிழ்"), f).toBe(true);
    }
  });

  it("PB-322: muted and subtle text colours reach 4.5:1 on every canvas colour, light and dark", () => {
    const css = read(path.join(SRC, "app/theme.css"));
    const block = (sel: RegExp) => css.split(sel)[1].split("}")[0];
    const tok = (b: string, n: string) => { const m = new RegExp(`--c-${n}:([0-9]+) ([0-9]+) ([0-9]+)`).exec(b); if (!m) throw new Error("token not found: " + n); return m.slice(1, 4).map(Number); };
    const lum = ([r, g, b]: number[]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bad: string[] = [];
    for (const [theme, b] of [["light", block(/:root,:root\[data-theme="light"\]\{/)], ["dark", block(/:root\[data-theme="dark"\]\{/)]] as const)
      for (const fg of ["ink", "ink-muted", "ink-subtle"]) for (const bg of ["canvas", "canvas-raised", "canvas-sunken"]) {
        const r = ratio(tok(b, fg), tok(b, bg));
        if (r < 4.5) bad.push(`${theme} ${fg} on ${bg} = ${r.toFixed(2)}`);
      }
    expect(bad).toEqual([]);
  });

  it("PB-321: no page loads a stylesheet or font from another host (the Content-Security-Policy blocks the fetch and the console logs an error)", () => {
    const bad: string[] = [];
    for (const f of FILES.filter((p) => path.relative(SRC, p).split(path.sep)[0] === "app")) {
      const s = read(f);
      if (/<link\b[^>]*rel="(stylesheet|preload|preconnect)"[^>]*href=\{?["']?https?:/.test(s) || /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(s)) bad.push(path.relative(SRC, f));
    }
    expect(bad).toEqual([]);
  });
});
