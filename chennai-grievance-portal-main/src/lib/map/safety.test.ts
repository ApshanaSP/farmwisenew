import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "src", "lib", "map");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".golden.ts"));
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");

describe("Ask the Map never builds SQL from a plan", () => {
  it("only world.ts queries the store, with fixed SQL", () => {
    for (const f of files) {
      const s = read(f);
      if (f === "world.ts") continue;
      expect(/intelPool|\.query\(|\bq\(`/.test(s), `${f} must not query the store`).toBe(false);
    }
  });
  it("world.ts interpolates only constants into its SQL (the title column and table names)", () => {
    const s = read("world.ts");
    const sqls = [...s.matchAll(/\bq\(\s*`([\s\S]*?)`/g)].map((m) => m[1]);
    expect(sqls.length).toBeGreaterThan(4);
    const allowed = new Set(["TITLE", 'ops("collector_decisions")', 'ops("dept_assignments")']);
    for (const sql of sqls) for (const m of sql.matchAll(/\$\{([^}]+)\}/g)) expect(allowed.has(m[1].trim()), `SQL interpolates ${m[1]}`).toBe(true);
  });
  it("no complainant's personal data is read or sent", () => {
    for (const f of files) {
      const s = read(f).toLowerCase();
      for (const word of ["mobile_number", "phone_number", "street_address", "first_name", "last_name", "from complaints", "complainant_name"])
        expect(s.includes(word), `${f} mentions ${word}`).toBe(false);
    }
  });
});
