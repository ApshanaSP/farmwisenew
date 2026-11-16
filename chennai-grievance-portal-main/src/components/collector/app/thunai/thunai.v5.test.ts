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
  it("one helper stamps gateDone and the lane, and only on the sentence's own trace (by its number, even after side talk opened a newer one), once", () => {
    const h = between("const traceDecided = ", "\n");
    expect(h).toMatch(/stamp\("gateDone", undefined, n\)/);
    expect(h).toMatch(/traceLane\(lane, n\)/);
    expect(h).toMatch(/traceOf\.current = null/);
    expect(h).toMatch(/if \(n != null\)/);
    // not "only while it is the newest trace": a side-talk upload while the turn ran must not take its stamps away
    expect(h).not.toMatch(/at\(-1\)/);
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

/**
 * Review voice-detector-latency-1: the answer's stamps (firstEvent, the planner's stages, speakCalled, voiceStart) go to the turn the
 * console is answering, never to whichever trace opened last (side talk's upload opens one too). trace.v5.test.ts proves the rule;
 * these hold the console's side of it.
 */
describe("the turn the console is answering (trace.ts traceAnswer)", () => {
  const body = between("const handle = async (", "const handleRef = useRef(handle)");
  it("handle() says which turn it answers before it first waits: the spoken sentence's trace, or none for typed text", () => {
    const at = body.indexOf("traceAnswer(traceOf.current)");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(body.indexOf("await "));
  });
  it("a spoken sentence's turn is let go when its handling ends (an interjection or a tap later is no turn's), only if it is still that turn", () => {
    const on = between("const onSentence = ", "const onSentenceRef");
    expect(on).toMatch(/handled\.finally\(\(\) => \{[^\n]*traceAnswerDone\(h\.trace\)/);
  });
  it("the planner's round carries the turn it was asked for, taken when the call starts (as its generation is)", () => {
    const call = between("const callAgent = async (", "const stopNarration = ");
    const take = call.indexOf("traceAnswering()");
    expect(take).toBeGreaterThan(-1);
    expect(take).toBeLessThan(call.indexOf("await "));
    expect(call).toMatch(/readRound\(res, \{ turnId, live, trace,/);
  });
  it("before any sentence is handled no turn is being answered (the power-on brief stamps nothing): said as the conductor is made", () => {
    const made = between("const conductorOf = () => {", "new Conductor(");
    expect(made).toMatch(/traceAnswer\(null\)/);
  });
  it("Thunai no longer picks the newest trace for a stamp", () => {
    expect(src).not.toMatch(/traces\(\)\.at\(-1\)/);
  });
});
