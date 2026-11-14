import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSynth, FakeUtterance } from "./fakeaudio.testkit";

// VOICE_UNDER_TEST points the same tests at another copy of the module (how the failing-first run was made)
const load = async () => { vi.resetModules(); return (await import(/* @vite-ignore */ process.env.VOICE_UNDER_TEST ?? "./voice")) as typeof import("./voice"); };

let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth([{ name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" }]);
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => vi.unstubAllGlobals());

describe("the browser voice speaks the chunks it is given, as they are (defect 7: no second chunking)", () => {
  it("one line is one utterance, however long: mouth.ts has already cut it", async () => {
    const v = await load();
    const line = `${"The drains near the bridge are blocked and the main roads are under water, ".repeat(3)}and that is all.`;
    expect(line.length).toBeGreaterThan(220);
    v.speakLines([line], "en-IN");
    expect(synth.said).toEqual([line.replace(/\s+/g, " ").trim()]);
  });
});

describe("pause and resume, for the barge-in's duck", () => {
  it("pause() pauses only while something is being said, and resume() undoes it", async () => {
    const v = await load();
    expect(v.pause()).toBe(false);
    v.speakText("The drains near the bridge are blocked.", "en-IN");
    expect(v.pause()).toBe(true);
    expect(v.isPaused()).toBe(true);
    v.resume();
    expect(v.isPaused()).toBe(false);
  });
  it("stopVoice() after a pause leaves the synthesiser able to speak the next answer", async () => {
    const v = await load();
    v.speakText("The drains near the bridge are blocked.", "en-IN");
    v.pause();
    v.stopVoice();
    expect(synth.paused).toBe(false);
  });
});
