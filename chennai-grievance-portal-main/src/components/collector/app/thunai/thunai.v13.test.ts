/**
 * v13 (21 Nov), Thunai.tsx's side of the adversarial review of v12 (review 1, findings 1, 9, 10, 12 and 14), read from the source as the v12
 * reading tests do (the loop needs a browser and a console to run; the rules are tested in turn.v13.test.ts and conductor.v13.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (a: string, b: string) => { const i = src.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };
const handle = between("const handle = async (", "const handleRef = useRef(handle)");
const bump = handle.indexOf("const gen = ++turnGen.current;");

describe("review 1-1: a lone backchannel or apology starts no turn", () => {
  it("before the turn starts (no ++turnGen, no abort), unless a yes, a choice, a confirm, a next step or a news offer waits for it", () => {
    const i = handle.indexOf("startsNoTurn(said)");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(bump);
    const check = handle.slice(i - 80, handle.indexOf("return;", i) + 7);
    expect(check).toMatch(/spokenLine && !original && startsNoTurn\(said\) && !askOnce && !pendingB && !confirmRef\.current && !offerLive\(\) && !newsOffer\.current/);
    expect(check).not.toContain("turnCtl.current?.abort()");
    // (v14, review turns 6: asksAgain joins the import, for "Sorry?" after an answer)
    expect(src).toMatch(/import \{ asksAgain, Conductor, type HeardLine, noRequest, startsNoTurn, wakeQuietMs \} from "\.\/conductor";/);
    // the greeting itself is still answered at once, after the turn starts
    expect(handle.indexOf("isGreeting(said)")).toBeGreaterThan(bump);
  });
});

describe("review 1-9: no \"I didn't catch that\" while a question is in flight", () => {
  it("the cue only when the dropped line was not busy and the page is not thinking", () => {
    expect(src).toMatch(/onDropped: \(d\) => \{ noteDropped\(d\); if \(d\.why === "unclear" && d\.engaged && !d\.busy && phaseRef\.current !== "thinking" && phaseRef\.current !== "acting"\) unclearCue\(d\.lang, d\.called\); \}/);
  });
});

describe("review 1-10: cancelTurn keeps a finished answer's reply", () => {
  it("only a working turn's line, or the acknowledgement's, is cleared", () => {
    const c = between("const cancelTurn = () => {", "\n  };");
    expect(c).toContain('const working = phaseRef.current === "thinking" || phaseRef.current === "acting";');
    expect(c).toContain("setReply((r) => (working || r === ackText.current ? \"\" : r));");
    expect(c).not.toMatch(/setReply\(""\)/);
    expect(c).toContain("stopSpeaking();");
  });
});

describe("review 1-12: a directStage left behind clears its own busy label", () => {
  it("it marks the label as its generation's, and clears it (only if still its own) when a newer turn took over", () => {
    const d = between("const directStage = async", "showStage(r.stage");
    expect(src).toContain("const stageBusyGen = useRef(0);");
    expect(d.indexOf("stageBusyGen.current = gen;")).toBeGreaterThan(d.indexOf("setStageBusy(label);"));
    expect(d).toContain("if (gen !== turnGen.current) { if (stageBusyGen.current === gen) setStageBusy((b) => (b === label ? null : b)); return; }");
  });
});

describe("review 1-14: the client deadline after a streamed screen", () => {
  it("finishes with what came (the streamed screen and its sentences, then SO_FAR_LINE), before SLOW_LINE and the city rebuild", () => {
    expect(src).toMatch(/const SO_FAR_LINE: Record<Lang, string> = \{ en: "That's what I have so far\.", ta: /);
    const i = handle.indexOf("const part = ag?.note === CLIENT_TIMEOUT ? streamOf(gen) : null;");
    expect(i).toBeGreaterThan(-1);
    const block = handle.slice(i, handle.indexOf("return;", i) + 7);
    expect(block).toContain("if (part?.screen) {");
    expect(block).toMatch(/showStage\(part\.screen, \[\.\.\.lines, SO_FAR_LINE\[part\.lang\]\]\.join\(" "\), part\.lang, [^\n]*\{ heard: heardAs, stream: part \}\);/);
    expect(block).not.toContain("SLOW_LINE[");
    expect(block).not.toContain("directStage(");
    expect(i).toBeLessThan(handle.indexOf("out(SLOW_LINE[rules.lang]"));
    const city = handle.indexOf('directStage("city"');
    if (city > -1) expect(i).toBeLessThan(city);
    // the plain deadline (nothing streamed) still says the short honest line
    expect(handle).toMatch(/if \(ag\?\.note === CLIENT_TIMEOUT\) \{[^\n]*out\(SLOW_LINE\[rules\.lang\]/);
  });
});
