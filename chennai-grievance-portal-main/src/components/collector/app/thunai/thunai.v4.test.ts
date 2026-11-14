// v4, the browser's turn loop (Thunai.tsx) is wired as the brief says: these read the code itself, as guards.pass4.test.ts does,
// because the loop needs a browser and a console to run. Each failed on the code before v4 (38d96d2f).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(__dirname, "Thunai.tsx"), "utf8").replace(/\r\n/g, "\n");
const between = (from: string, to: string) => { const a = src.indexOf(from); expect(a, from).toBeGreaterThan(-1); const b = src.indexOf(to, a + from.length); return src.slice(a, b < 0 ? undefined : b); };

describe("the streamed turn (Pillar 2)", () => {
  const call = between("const callAgent = async", "const stopNarration");
  it("asks for the stream and reads it event by event, with the JSON reply as the fallback", () => {
    expect(call).toMatch(/stream:\s*!direct/);
    expect(call).toContain("readRound(");
    expect(call).not.toMatch(/await post\(url/);
  });
  it("drops what belongs to an older turn (the generation) and runs a round's console steps once", () => {
    expect(call).toMatch(/turnGen\.current/);
    expect(call).toContain("stepsSent");
  });
  it("the round's whole answer does not show or say again what streamed", () => {
    expect(src).toContain("settleStream(");
  });
});

describe("observations carry the screen's digest (defect 4)", () => {
  it("the round's observations go back with the digest of what is on screen after its steps", () => {
    const call = between("const callAgent = async", "const stopNarration");
    expect(call).toContain("withDigest(");
    expect(call).toMatch(/consoleDigest\(/);
  });
});

describe("memory turns (defect 5)", () => {
  it("a turn keeps the recipe, the slots and a one-line result, and all four go to the round", () => {
    expect(between("const remember = ", "\n")).toContain("memTurn(");
    expect(src).toMatch(/turns:\s*turns\.current\.slice\(-4\)/);
  });
});

describe("the ears' confidence and language (defect 6)", () => {
  const onSentence = between("const onSentence = ", "const onSentenceRef");
  it("the sentence's own confidence reaches handle(), not a fixed 0.95", () => {
    expect(onSentence).not.toMatch(/handleRef\.current\(h\.text,\s*0\.95/);
    expect(onSentence).toMatch(/h\.conf/);
    expect(onSentence).toMatch(/lang:\s*h\.lang/);
  });
  it("the round is told how the sentence was heard", () => {
    expect(src).toContain("heardOf(");
    expect(between("const callAgent = async", "const stopNarration")).toMatch(/heard:/);
  });
  it("an unsure sentence prefers the rules' question", () => expect(src).toContain("asksFirst(rules.confidence"));
});

describe("captions only while hearing (defect 10)", () => {
  it("opening the microphone no longer starts the browser's recogniser for the whole session", () => {
    const open = between("const openMic = () => {", "const setModeRef");
    // the recogniser is only made by HearingCaptions, when speech starts; nothing here starts it
    expect(open).not.toMatch(/captions\.current = new Captions\(/);
    expect(open).toContain("new HearingCaptions(");
    expect(open).not.toMatch(/\.start\(\)/);
  });
  it("speech start (engaged) starts it, speech end stops it, and its partials reach the conductor", () => {
    expect(src).toMatch(/onSpeechStart:/);
    expect(src).toMatch(/onSpeechEnd:/);
    expect(src).toMatch(/\.partial\(/);
  });
  it("the \"Hi Jarvis\" wake listener is exactly as the owner left it", () => {
    const a = src.indexOf("  // \"Hi Jarvis\": closed, the browser");
    const b = src.indexOf("}, [mode]);", a) + "}, [mode]);".length;
    expect(a).toBeGreaterThan(-1);
    expect(crypto.createHash("sha256").update(src.slice(a, b)).digest("hex")).toBe("bcc132e299addb98a2b2bd00c133f1e657c9717a59ce87cbacfa3f4f5631a33b");
  });
});

describe("Finding 51: what a screen may say comes from the speakable set", () => {
  it("screenFigures (every number in doc.say) is gone; speakableFigures is used", () => {
    expect(src).not.toMatch(/screenFigures/);
    expect(src).toContain("speakableFigures(");
  });
});

describe("the honest ack, the warm-up, the two speeds", () => {
  it("an earcon at the end of speech; the spoken ack only by the 1.2 s rule", () => {
    expect(between("mark: (name, t) => {", "\n      }")).toContain("earconEnd()");
    expect(src).toContain("ackDue(");
    expect(src).toContain("speakAck(");
  });
  it("mode-on warms the voice and the planner, once", () => {
    expect(src).toContain("warmVoice(");
    expect(src).toContain("/api/jarvis/warm");
  });
  it("a turn past 10 s shows its steps and a Stop", () => {
    expect(src).toContain("longTurn(");
    expect(src).toMatch(/data-testid="long-turn"/);
  });
  it("the keyboard comment names the real keys", () => {
    expect(src).not.toMatch(/Alt\+T/);
  });
});
