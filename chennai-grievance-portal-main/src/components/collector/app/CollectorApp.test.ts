import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "CollectorApp.tsx"), "utf8");

describe("the console under Jarvis mode", () => {
  it("restores the saved theme when the mode ends, not the one it began with", () => {
    expect(src).not.toMatch(/const was = document\.documentElement\.dataset\.theme/);
    expect(src).toMatch(/localStorage\.getItem\("diq-theme"\)[^\n]*dataset\.theme = savedTheme\(saved\)/);
  });
  it("leaves html dark when the theme is toggled during the mode", () => {
    expect(src).toMatch(/if \(!hudOn\.current\) document\.documentElement\.dataset\.theme = n;/);
  });
  it("forgets the browser's copy of the pins on logout: the next Collector must not see them", () => {
    expect(src).toMatch(/\/api\/auth\/logout[^\n]*localStorage\.removeItem\("thunai-pins"\)/);
  });
});
