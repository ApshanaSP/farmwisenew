// review voice-detector-latency-5: the read-aloud button on an answer card (JarvisLogView renders this card for Jarvis's answers in the
// Jarvis tab) handed card.voiceSummary to speechSynthesis with its digits. v5 F1: no digit reaches any voice, so the card's text goes
// through the mouth's own step first (every number in words in its sentence's language; a chunk that still holds a number sign is not
// said). Invented sentences only.
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerCard as Card } from "@/lib/assistant/answer";
import { FakeSynth, FakeUtterance, type FakeVoice } from "../thunai/fakeaudio.testkit";

const DIGIT = /\p{N}/u;
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
const PALLAVI: FakeVoice = { name: "Microsoft Pallavi Online (Natural) - Tamil (India)", lang: "ta-IN" };
const card = (voiceSummary: string, voiceLang: "en-IN" | "ta-IN", headline = "Complaints") => ({ voiceSummary, voiceLang, headline }) as unknown as Card;

let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth([NEERJA, PALLAVI]);
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("review voice-detector-latency-5: the answer card's read-aloud hands the voice words, not digits", () => {
  it("English: the card's spoken summary is said with its numbers in words", async () => {
    const { readCardAloud } = await import("./AnswerCard");
    expect(readCardAloud(card("47 complaints in Adyar, 12345 in the district.", "en-IN"), () => undefined)).toBe(true);
    expect(synth.said).toEqual(["forty-seven complaints in Adyar, twelve thousand three hundred and forty-five in the district."]);
    expect(synth.queue[0].lang).toBe("en-IN");
  });

  it("Tamil: Tamil number words, in the card's own voice language", async () => {
    const { readCardAloud } = await import("./AnswerCard");
    expect(readCardAloud(card("அடையாறில் இன்று 47 புகார்கள் வந்தன.", "ta-IN"), () => undefined)).toBe(true);
    expect(synth.said).toEqual(["அடையாறில் இன்று நாற்பத்தேழு புகார்கள் வந்தன."]);
    expect(synth.queue[0].lang).toBe("ta-IN");
  });

  it("with no spoken summary the headline is read, in words too", async () => {
    const { readCardAloud } = await import("./AnswerCard");
    expect(readCardAloud(card("", "en-IN", "3 wards flooded"), () => undefined)).toBe(true);
    expect(synth.said).toEqual(["three wards flooded"]);
  });

  it("a sentence that still holds a number sign after the words is not said (a count is logged, never the text); with nothing left, nothing is said", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { readCardAloud } = await import("./AnswerCard");
    const mouth = await import("../thunai/mouth");
    const before = mouth.digitRefused();
    expect(readCardAloud(card("About ½ of the drains are new. The list is on screen.", "en-IN"), () => undefined)).toBe(true);
    expect(synth.said).toEqual(["The list is on screen."]);
    expect(readCardAloud(card("About ½ of the drains are new.", "en-IN"), () => undefined)).toBe(false);
    expect(synth.said).toEqual(["The list is on screen."]);
    expect(mouth.digitRefused()).toBe(before + 2);
    const logged = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).not.toMatch(/drains|½/u);
    for (const t of synth.said) expect(t).not.toMatch(DIGIT);
  });

  it("the card's button goes through it: AnswerCard.tsx calls speak() once, inside readCardAloud, and the button calls readCardAloud", () => {
    const src = fs.readFileSync(path.join(__dirname, "AnswerCard.tsx"), "utf8");
    expect(src.match(/(?<![\w.])speak\(/g) ?? []).toHaveLength(1);
    expect(/function readCardAloud\([^)]*\)[^{]*\{[^}]*(?<![\w.])speak\(/.test(src)).toBe(true);
    expect(/const readAloud = \(\) => \{[\s\S]{0,200}?readCardAloud\(card,/.test(src)).toBe(true);
  });
});
