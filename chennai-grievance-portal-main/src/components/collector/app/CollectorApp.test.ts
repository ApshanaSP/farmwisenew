import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "CollectorApp.tsx"), "utf8");

describe("the console under Jarvis mode", () => {
  // the Collector's wish (4 Nov 2026): Jarvis keeps the console's own theme; only the theme switch turns it dark
  it("never turns the console dark because Jarvis is open", () => {
    expect(src).not.toMatch(/jv\.hud \? "dark"/);
    expect(src).not.toMatch(/dataset\.theme = "dark"/);
  });
  it("follows the theme switch while Jarvis is open", () => {
    expect(src).toMatch(/localStorage\.setItem\("diq-theme", n\)[^]*?document\.documentElement\.dataset\.theme = n;/);
  });
  it("forgets the browser's copy of the pins and of Jarvis's questions on logout: the next Collector must not see them", () => {
    expect(src).toMatch(/\/api\/auth\/logout[^\n]*localStorage\.removeItem\("thunai-pins"\)[^\n]*localStorage\.removeItem\("jarvis-log"\)/);
  });
});
