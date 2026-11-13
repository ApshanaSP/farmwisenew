// g-repair (SK2-14): the colours the consoles use for words and for white-on-green reach 4.5:1 (WCAG AA for small text), in the tokens file, so a new rule that uses them cannot bring the axe findings back.
// The rendered result is checked by tests/qa/pass4/skeptic-g2.test.ts (SK2-14) and axe.mjs on a real build.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve(__dirname, "collector/app/tokens.css"), "utf8");
const light = css.split(/:root,:root\[data-theme="light"\],\.dic\[data-theme="light"\]\{/)[1].split("\n}")[0];
const dark = css.split(/:root\[data-theme="dark"\],\.dic\[data-theme="dark"\]\{/)[1].split("\n}")[0];
const tok = (b: string, n: string): string => { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(b); if (!m) throw new Error("token not found: " + n); return m[1]; };
const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("the ink colours for words (light theme)", () => {
  const PAIRS: [string, string][] = [["critical-ink", "critical-soft"], ["high-ink", "high-soft"], ["medium-ink", "medium-soft"], ["ok-ink", "ok-soft"], ["neutral-ink", "neutral-soft"]];
  it("each reaches 4.5:1 on its own soft colour, on the surface and on the page colour", () => {
    const bad: string[] = [];
    for (const [ink, soft] of PAIRS) for (const bg of [soft, "surface", "surface-2", "bg"]) {
      const r = ratio(tok(light, ink), tok(light, bg));
      if (r < 4.5) bad.push(`${ink} on ${bg} = ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
  it("the plain colours (for fills and dots) are kept, so the charts do not change", () => {
    expect(tok(light, "high")).toBe("#E5720F");
    expect(tok(light, "medium")).toBe("#B98B00");
  });
  it("the stylesheets use the ink for the words of a chip, a change figure and an overdue note", () => {
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
    expect(read("collector/app/civic.css")).toMatch(/\.sev-high\{background:var\(--high-soft\);color:var\(--high-ink\)\}/);
    expect(read("collector/app/civic.css")).toMatch(/\.sev-medium\{background:var\(--medium-soft\);color:var\(--medium-ink\)\}/);
    expect(read("officer/officer.css")).toMatch(/\.oi-ch\.down\{background:var\(--low-soft\);color:var\(--ok-ink\)\}/);
    expect(read("officer/officer.css")).toMatch(/small\.old\{color:var\(--high-ink\)/);
  });
});

describe("white text on the green of the dark theme", () => {
  it("both ends of the gradient and the solid fill reach 4.5:1", () => {
    const grad = /--accent-grad:linear-gradient\(135deg,(#[0-9A-Fa-f]{6}) 0%,(#[0-9A-Fa-f]{6}) 100%\)/.exec(dark);
    expect(grad).not.toBeNull();
    for (const c of [grad![1], grad![2], tok(dark, "accent-3")]) expect(ratio("#FFFFFF", c), c).toBeGreaterThanOrEqual(4.5);
  });
});
