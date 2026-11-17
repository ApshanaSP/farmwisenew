/**
 * v7 review (3A, 3C): the wiring in Thunai.tsx, read from the source as thunai.v5.test.ts does.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8");
const between = (a: string, b: string) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i >= 0 && j > i ? src.slice(i, j) : ""; };

describe("v7 review: Thunai.tsx", () => {
  it("3A: a streamed aide sentence's figures go into the voice's queue with it, and the queue's speech gates with what it hands over (no lookup by one sentence's text)", () => {
    const f = between("const streamSay = ", "/** Ask the agent");
    expect(f).not.toBe("");
    expect(f).toMatch(/new SayQueue\(\(t, end, own\) =>/);
    expect(f).toMatch(/sx\.queue\.push\(text, /);
    expect(f).not.toMatch(/figs\?\.get\(/);
  });
  it("3C: the news lane is asked with the answer style, so JARVIS_ANSWER=v6 keeps v6's reading of \"tell me about this news\"", () => {
    expect(src).toMatch(/newsAsk\(said, newsOnScreen\(stageRef\.current, buildState\(\)\), \{ v7: answersV7\(\) \}\)/);
  });
});
