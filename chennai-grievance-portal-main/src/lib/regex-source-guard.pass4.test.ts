/**
 * QA4 RC-37 (item 3). The Next 14 bundle once compiled a regex made in a template literal wrongly: a backslash-b became a backspace
 * character, so a refusal rule stopped matching. Next 15 is fine; these guards keep the same class of mistake out of the source.
 *   1. No file under src holds the byte 0x08 (backspace), except images and fonts.
 *   2. A regex built with RegExp(...) from a string or template keeps its escapes: in the source text every backslash is doubled
 *      (a single one would make \b a backspace and \s a plain "s"), except an escaped backtick or dollar sign in a template.
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");
const BINARY = /\.(png|jpe?g|gif|webp|ico|avif|bmp|svg|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|pdf|gz|zip|onnx|bin)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(process.cwd(), p).split(path.sep).join("/");

/** Backslash runs in a literal's raw text that would not reach RegExp as written: an odd run is a single escape in the string. */
export function singleBackslashes(raw: string): number[] {
  const at: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\") continue;
    let j = i; while (raw[j] === "\\") j++;
    const run = j - i, next = raw[j];
    if (run % 2 === 1 && !(next === "`" || next === "$" || next === '"' || next === "'" || next === "\n" || next === "\r")) at.push(i);
    i = j - 1;
  }
  return at;
}

describe("regex source guards (QA4 RC-37)", () => {
  it("no file under src holds a backspace byte, except images and fonts", () => {
    const bad = walk(SRC).filter((f) => !BINARY.test(f) && fs.readFileSync(f).includes(0x08)).map(rel);
    expect(bad).toEqual([]);
  });

  it("every RegExp(...) built from a string or template keeps its backslashes doubled", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p))) {
      const text = fs.readFileSync(f, "utf8");
      if (!text.includes("RegExp(")) continue;
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
      const visit = (n: ts.Node) => {
        if ((ts.isNewExpression(n) || ts.isCallExpression(n)) && n.expression.getText(sf) === "RegExp" && n.arguments?.[0]) {
          const lits: ts.Node[] = [];
          const collect = (m: ts.Node) => {
            if (ts.isNoSubstitutionTemplateLiteral(m) || ts.isStringLiteral(m) || ts.isTemplateHead(m) || ts.isTemplateMiddle(m) || ts.isTemplateTail(m)) lits.push(m);
            ts.forEachChild(m, (c) => { if (!ts.isTaggedTemplateExpression(c) && !ts.isRegularExpressionLiteral(c) && !ts.isArrowFunction(c) && !ts.isFunctionExpression(c)) collect(c); });
          };
          // String.raw`...` keeps its backslashes as typed, so it is the right way to write a single one: not checked
          if (!ts.isTaggedTemplateExpression(n.arguments[0])) collect(n.arguments[0]);
          for (const l of lits) {
            seen++;
            if (singleBackslashes(l.getText(sf)).length) bad.push(`${rel(f)}:${sf.getLineAndCharacterOfPosition(l.getStart(sf)).line + 1}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(seen).toBeGreaterThan(20); // the walk really found the regexes
    expect(bad).toEqual([]);
  });

  it("the check itself tells a doubled backslash from a single one", () => {
    const B = String.fromCharCode(92), T = "`";
    expect(singleBackslashes(T + B + B + "bdrop" + B + B + "s+x" + T)).toEqual([]);
    expect(singleBackslashes(T + B + "bdrop" + T)).toEqual([1]);
    expect(singleBackslashes(T + B + "s+" + T)).toEqual([1]);
    expect(singleBackslashes(T + "a" + B + T + "b" + T)).toEqual([]);
  });

  it("lint is configured the way Next 15 expects, and the dead file and the unused package stay gone (RC-37)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts.lint).toBe("next lint");
    expect(fs.existsSync(path.join(process.cwd(), ".eslintrc.json"))).toBe(true);
    expect(pkg.dependencies.animejs).toBeUndefined();
    for (const d of ["jiti", "fast-png", "fflate"]) expect(pkg.devDependencies[d], d).toBeTruthy();
    expect(fs.existsSync(path.join(SRC, "components", "AuthHeroPanel.tsx"))).toBe(false);
  });
});
