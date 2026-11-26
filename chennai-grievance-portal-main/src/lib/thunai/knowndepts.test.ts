import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { KNOWN_DEPTS } from "./knowndepts";

describe("the departments known without the store", () => {
  it("are the ones the pipeline's reference names", () => {
    const yaml = fs.readFileSync(path.join(process.cwd(), "..", "district_intel", "reference", "departments.yaml"), "utf8");
    const want = [...yaml.matchAll(/^- \{code: ([A-Z-]+), name: ([^,]+),.*action_owner: true/gm)].map((m) => ({ code: m[1], name: m[2].trim().replace(/^"|"$/g, "") }));
    expect(want.length).toBeGreaterThan(20);
    expect(KNOWN_DEPTS).toEqual(want);
  });
});
