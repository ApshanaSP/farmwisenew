import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RC-46 class guard (PB-313, PB-318, PB-319, PB-301, PB-328). The browser run is tests/qa/pass4/layout.mjs (every page, 360 to 1920 px, both languages:
 * no sideways scroll, no floating control over a bottom-bar tab). These checks are the source rules that run in every unit pass, because the
 * mechanisms are in the source and a missed one only shows on a phone:
 *  1. a grid that has columns only from a breakpoint up has ONE column below it that may shrink (minmax(0,1fr)), or a child with long text
 *     widens the page; an auto column does not shrink under its content.
 *  2. the pages in the top bar and the bottom bar change at the same width, and the footer keeps clear of the bar exactly while it shows.
 *  3. a popover closes on an outside click and on Escape.
 */
const SRC = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(SRC, d), { withFileTypes: true })) {
    const rel = path.posix.join(d, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx$/.test(e.name)) out.push(rel);
  }
  return out;
};

describe("RC-46: a one-column-first grid never grows with its content", () => {
  const files = [...walk("app/citizen"), ...walk("app/profile"), ...walk("components/citizen"), "components/ComplaintTypeSelector.tsx", "components/AuthShell.tsx"];
  it("every `grid` with a breakpoint grid-cols has a base column that may shrink", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const c = m[1] ?? m[2] ?? "";
        if (!/(^|\s)grid(\s|$)/.test(c) || !/(sm|md|lg|xl):grid-cols-/.test(c)) continue;
        // a base grid-cols-N is repeat(N, minmax(0, 1fr)); an arbitrary base must be minmax(0,...)
        const base = c.split(/\s+/).find((t) => /^grid-cols-/.test(t));
        const ok = base && (/^grid-cols-\d+$/.test(base) || base.startsWith("grid-cols-[minmax(0,"));
        if (!ok) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}  ${c.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the guard reads the files it is about", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.map(read).join("").match(/grid-cols-\[minmax\(0,1fr\)\]/g)?.length ?? 0).toBeGreaterThan(5);
  });
});

describe("RC-46: the citizen top bar, the bottom bar and the footer change at one width", () => {
  const h = read("components/Header.tsx"), f = read("components/Footer.tsx");
  const bp = (s: string, re: RegExp) => s.match(re)?.[1];
  it("the pages show in the top bar from the same width the bottom bar goes and the footer stops clearing it", () => {
    const top = bp(h, /p-1 (\w+):flex"/), bottom = bp(h, /backdrop-blur-xl (\w+):hidden"/), foot = bp(f, /mb-16 (\w+):mb-0/);
    expect(top).toBeTruthy();
    expect(bottom).toBe(top);
    expect(foot).toBe(top);
  });
});

describe("RC-46: a popover does not stay open over the next thing", () => {
  it("the alert details close on an outside press and on Escape", () => {
    const s = read("components/collector/app/AlertBar.tsx");
    expect(s).toMatch(/addEventListener\("pointerdown"/);
    expect(s).toMatch(/e\.key === "Escape"/);
  });
});

describe("RC-46: the segmented control's pill follows its labels", () => {
  it("re-measures when a label's text or width changes, not only when the control resizes", () => {
    const s = read("components/ui/index.tsx");
    expect(s).toMatch(/new MutationObserver/);
    expect(s).toMatch(/querySelectorAll\("\[data-key\]"\)/);
  });
});

describe("RC-46: the console's floating buttons clear the bottom bar", () => {
  it("every rule that places Ask District IQ's button with the bottom bar up keeps it 76 px or more above the bottom", () => {
    const dir = path.join(SRC, "components/collector/app");
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css"))) {
      const css = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of css.matchAll(/([^{}]*:not\(\.fit\)[^{}]*\.ask-fab[^{}]*)\{([^}]*)\}/g)) {
        const b = m[2].match(/(?:^|;)\s*bottom:\s*([^;]+)/)?.[1];
        if (b && !/76px/.test(b)) bad.push(`${f}: ${m[1].trim()} { bottom: ${b} }`);
      }
    }
    expect(bad).toEqual([]);
  });
});
