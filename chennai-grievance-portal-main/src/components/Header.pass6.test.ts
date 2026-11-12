/**
 * QA pass 6, P5-038: on a phone, the citizen's bottom navigation shows the page you are on in text-navy-500 (rgb 28 143 76 in the light theme)
 * at 11 px on the bar's background (#f4f8f6, measured by axe at 360 px): a contrast of 3.85:1, below WCAG AA's 4.5:1 for small text. The
 * test reads the class the header uses and the colours from the generated theme (src/app/theme.css), in the light and the dark theme.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const src = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const header = src("src/components/Header.tsx");
const theme = src("src/app/theme.css");
const block = (sel: string) => theme.slice(theme.indexOf(sel), theme.indexOf("}", theme.indexOf(sel)));
const LIGHT = block(':root,:root[data-theme="light"]'), DARK = block(':root[data-theme="dark"]');
const rgb = (css: string, name: string): number[] => { const m = css.match(new RegExp(`--c-${name}:(\\d+) (\\d+) (\\d+)`)); if (!m) throw new Error(`no --c-${name}`); return m.slice(1, 4).map(Number); };
const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("QA pass 6, P5-038: the bottom navigation's current page is readable on a phone", () => {
  const active = header.match(/\$\{active \? "text-([a-z]+-\d+)" : "text-ink-subtle"\}/)?.[1];
  it("the header names the colour of the current page's tab", () => expect(active).toBeTruthy());
  it("light theme: at least 4.5:1 on the bar (measured #f4f8f6) and on the canvas", () => {
    const fg = rgb(LIGHT, active!);
    for (const bg of [[244, 248, 246], rgb(LIGHT, "canvas"), rgb(LIGHT, "canvas-raised")]) expect(ratio(fg, bg), `${active} on rgb(${bg})`).toBeGreaterThanOrEqual(4.5);
  });
  it("dark theme: at least 4.5:1 on the canvas", () => {
    const fg = rgb(DARK, active!);
    for (const bg of [rgb(DARK, "canvas"), rgb(DARK, "canvas-raised")]) expect(ratio(fg, bg), `${active} on rgb(${bg})`).toBeGreaterThanOrEqual(4.5);
  });
});
