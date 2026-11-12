import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { typedDigits } from "@/lib/typed-digits";

// P5-033 part "Tamil-keyboard digits dropped as typed" (P5-007's sweep): the number boxes kept what was typed with
// e.target.value.replace(/\D/g, ""), and JavaScript's \D is every character but 0 to 9, so a mobile number, PIN code, Aadhaar
// number, one-time code or slip's last 4 typed on a Tamil (or Devanagari, or fullwidth) keyboard vanished digit by digit.
const ROOT = path.join(process.cwd(), "src");
// the Manu Desk's boxes are in src/components/manu, a p7 session's files: listed here, left for the lead
const P7 = [/^components[\\/]manu[\\/]/];

function files(d: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) files(f, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}

describe("typed digits of any script are kept, as 0 to 9", () => {
  it("Tamil, Devanagari, fullwidth and mixed digits; everything else dropped", () => {
    expect(typedDigits("௯௮௪௦௦௧௨௩௪௫")).toBe("9840012345");
    expect(typedDigits("६०००११")).toBe("600011");
    expect(typedDigits("１２３４")).toBe("1234");
    expect(typedDigits("98 40-0௧ 2345a")).toBe("9840012345");
    expect(typedDigits("")).toBe("");
  });

  it("no number box outside the p7 files drops a non-ASCII digit as it is typed or pasted", () => {
    const loose: string[] = [];
    for (const f of files(ROOT)) {
      const rel = path.relative(ROOT, f);
      if (P7.some((r) => r.test(rel))) continue;
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(/(e\.target\.value|clipboardData\.getData\([^)]*\))\.replace\(\/\\D\/g, ""\)/g)) loose.push(`${rel.split(path.sep).join("/")}: ${m[0]}`);
    }
    expect(loose).toEqual([]);
  });
});
