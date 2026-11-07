// QA pass 4, RC-33 class guard: a click guard is tested on the string the code really builds, never on the string its author pictured.
// The click guard sees the accessible name and the text of a button; a bare "Yes" button has both, so it reads "Yes Yes".
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KEEP_BUTTON, keepsSomething } from "./guards";

describe("keepsSomething", () => {
  it.each(["Yes", "OK", "Okay", "ஆம்", "ஆமாம்", "சரி", "Save new version", "Pin", "Unpin", "Add to dashboard", "Add this chart to the dashboard (Environment page)"])(
    "%s is a keep button, whether its name, its text or both are read", (w) => {
      expect(keepsSomething(w, w)).toBe(true);
      expect(keepsSomething(w, "")).toBe(true);
      expect(keepsSomething("", w)).toBe(true);
      expect(KEEP_BUTTON.test(`${w} ${w}`.trim())).toBe(true);
    });
  it.each(["Open", "Show trends", "Zone 13", "Close panel"])("%s is not", (w) => expect(keepsSomething(w, w)).toBe(false));
  it("a long name cannot hide the word on the button", () => expect(keepsSomething("Export, workspaces, customize, theme and language", "Pin")).toBe(true));
});

describe("the Jarvis client uses the guard with both strings", () => {
  const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
  it("no call tests KEEP_BUTTON on one joined string", () => {
    expect(src).not.toMatch(/KEEP_BUTTON\.test\(/);
    expect(src).toContain("keepsSomething(t.name, t.el.textContent)");
  });
});
