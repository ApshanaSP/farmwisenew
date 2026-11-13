import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// pass4-open-02 (pass 4's PB-332): /dev/thunai showed two elements with data-testid="state", the harness's JSON readout and the
// HUD's state word, so Playwright's strict getByTestId("state") in hold.spec.ts and mode.spec.ts matched both and refused to act.
const root = path.resolve(__dirname, "../../../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);

describe("pass4-open-02: the harness readout and the HUD's state word have their own test ids", () => {
  it('data-testid="state" is on one element in the app', () => {
    const hits = walk(path.join(root, "src")).filter((f) => !/\.test\.tsx?$/.test(f) && /data-testid="state"/.test(fs.readFileSync(f, "utf8")));
    expect(hits.map((f) => path.relative(root, f))).toEqual([path.join("src", "components", "collector", "app", "thunai", "Hud.tsx")]);
  });
  it("the harness specs read the harness's JSON readout by its own id", () => {
    expect(read("src/app/dev/thunai/Harness.tsx")).toMatch(/data-testid="harness-state"/);
    for (const spec of ["tests/e2e/hold.spec.ts", "tests/e2e/mode.spec.ts"]) {
      const s = read(spec);
      expect(s, spec).not.toMatch(/getByTestId\("state"\)/);
      expect(s, spec).toMatch(/getByTestId\("harness-state"\)/);
    }
  });
});
