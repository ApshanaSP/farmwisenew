// g-repair (SK2-9, SK2-10, SK2-11, SK2-12, SK2-15, SK2-16): source guards for the screen fixes the live skeptic tests (tests/qa/pass4/skeptic-g2.test.ts) show in a browser.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("the Confirm box (SK2-10, SK2-11)", () => {
  const s = read("components/security/Confirm.tsx").replace(/\r\n/g, "\n");
  it("has Tamil words for every English word it has, and prints no English sentence of its own", () => {
    const en = /en: \{([\s\S]*?)\},\n  ta: \{([\s\S]*?)\}\n\};/.exec(s);
    expect(en).not.toBeNull();
    const keys = (b: string) => [...b.matchAll(/(\w+): /g)].map((m) => m[1]).sort();
    expect(keys(en![2])).toEqual(keys(en![1]));
    expect(/[஀-௿]/.test(en![2])).toBe(true);
    // the JSX holds no fixed English text node of its own: every word on the box comes from the table
    const jsx = s.slice(s.indexOf("return (\n    <div className=\"cfm-veil\""));
    expect(jsx).not.toMatch(/>\s*(Cancel|Confirm|Email me a code|Use my password|Send another code)\s*</);
    expect(jsx).not.toMatch(/Confirm it&apos;s you|Being signed in/);
  });
  it("keeps Tab inside the box: a key handler on the form wraps first and last", () => {
    expect(s).toMatch(/onKeyDown=\{trap\}/);
    expect(s).toMatch(/e\.key !== "Tab"/);
    expect(s).toMatch(/last\.focus\(\)/);
    expect(s).toMatch(/first\.focus\(\)/);
  });
});

describe("the queue notes print the Tamil text on a Tamil page (SK2-9, SK2-12)", () => {
  it("the officer's list and the citizen's filing screen read the language", () => {
    expect(read("components/officer/Cards.tsx")).toMatch(/awaitingNote\.ta/);
    expect(read("app/citizen/file-complaint/page.tsx")).toMatch(/queueNote\.ta/);
  });
});

describe("pages and drawers a keyboard can use (SK2-15, SK2-16)", () => {
  it("the 404 page puts its text in a main landmark", () => {
    expect(read("app/not-found.tsx")).toMatch(/<main[ >]/);
  });
  it("every scrolling case-drawer body can take focus, so the keyboard can scroll it", () => {
    const s = read("components/officer/Drawer.tsx");
    const bodies = [...s.matchAll(/<div className="odrawer-b"[^>]*>/g)];
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b[0]).toMatch(/tabIndex=\{0\}/);
  });
});
