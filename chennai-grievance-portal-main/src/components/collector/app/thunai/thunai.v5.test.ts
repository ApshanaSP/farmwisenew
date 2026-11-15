/**
 * Thunai.tsx's v5 trace stamps (section 6.4), read from the source as thunai.v4.test.ts does: "gateDone" and the turn's lane are
 * stamped once the address gate and the rules have decided, for a spoken sentence's own trace only (typed text stamps nothing).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
const between = (a: string, b: string) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i >= 0 && j > i ? src.slice(i, j) : ""; };

describe("gateDone and the lane, after the gate and the rules", () => {
  it("one helper stamps gateDone and the lane, and only on the sentence's own trace, once", () => {
    const h = between("const traceDecided = ", "\n");
    expect(h).toMatch(/stamp\("gateDone"\)/);
    expect(h).toMatch(/traceLane\(lane\)/);
    expect(h).toMatch(/traceOf\.current = null/);
    expect(h).toMatch(/traces\(\)\.at\(-1\)\?\.n === n/);
  });
  it("a spoken sentence hands its trace to handle(); whatever handle() decided before its first wait is \"other\" unless it said rules or planner", () => {
    const on = between("const onSentence = ", "const onSentenceRef");
    expect(on).toMatch(/traceOf\.current = h\.trace \?\? null/);
    const call = on.indexOf("handleRef.current(h.text"), other = on.indexOf("traceDecided(\"other\")");
    expect(call).toBeGreaterThan(-1);
    expect(other).toBeGreaterThan(call);
  });
  it("the rules' two lanes say rules; the planner's call says planner, before the call is made", () => {
    const body = between("const handle = async (", "const handleRef = useRef(handle)");
    expect(body.match(/traceDecided\("rules"\)/g)?.length).toBe(2);
    const planner = body.indexOf("traceDecided(\"planner\")"), agent = body.indexOf("await callAgent(said");
    expect(planner).toBeGreaterThan(-1);
    expect(agent).toBeGreaterThan(planner);
    // the rules' lanes are stamped before their run(), not after it
    const reflex = between("if (rules.kind === \"do\" && isReflex(rules.steps, st)) {", "\n    }");
    expect(reflex.indexOf("traceDecided(\"rules\")")).toBeGreaterThan(-1);
    expect(reflex.indexOf("traceDecided(\"rules\")")).toBeLessThan(reflex.indexOf("await run("));
  });
});
