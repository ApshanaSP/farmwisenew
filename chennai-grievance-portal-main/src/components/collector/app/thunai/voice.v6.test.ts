/**
 * v6, the voice kept warm (voice.ts prewarm): a silent utterance in each language's natural voice when a sentence to Jarvis begins, so the
 * answer's first word does not wait for Edge's online voice to wake up. It is never "speaking", never heard (volume 0), any real speech
 * cancels it, and NEXT_PUBLIC_JARVIS_VOICE_PREWARM=0 turns it off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSynth, FakeUtterance } from "./fakeaudio.testkit";

const load = async () => { vi.resetModules(); return (await import("./voice")) as typeof import("./voice"); };
let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth([{ name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" }, { name: "Microsoft Pallavi Online (Natural) - Tamil (India)", lang: "ta-IN" }]);
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("v6: the voice kept warm", () => {
  it("one silent utterance per language, in that language's best voice, and the synthesiser is not 'speaking' for it", async () => {
    const v = await load();
    expect(v.prewarm(["en-IN", "ta-IN"], 10_000)).toBe(true);
    expect(synth.queue.map((u) => [u.text, u.voice?.lang, (u as unknown as { volume: number }).volume])).toEqual([[".", "en-IN", 0], [".", "ta-IN", 0]]);
    expect(v.speaking()).toBe(false);
    synth.finish();
    expect(v.speaking()).toBe(false);
    synth.finish();
    expect(v.speaking()).toBe(false);
  });
  it("real speech cancels it and is 'speaking' at once", async () => {
    const v = await load();
    v.prewarm(["en-IN"], 10_000);
    v.speakText("Adyar has three severe cases today.", "en-IN");
    expect(synth.cancels).toBe(1);
    expect(synth.queue.map((u) => u.text)).toEqual(["Adyar has three severe cases today."]);
    expect(v.speaking()).toBe(true);
  });
  it("never over speech already going, and not again within PREWARM_EVERY_MS", async () => {
    const v = await load();
    v.speakText("The drains near the bridge are blocked.", "en-IN");
    expect(v.prewarm(["en-IN"], 10_000)).toBe(false);
    synth.finish();
    expect(v.prewarm(["en-IN"], 10_000)).toBe(true);
    synth.finish();
    expect(v.prewarm(["en-IN"], 10_000 + v.PREWARM_EVERY_MS - 1)).toBe(false);
    expect(v.prewarm(["en-IN"], 10_000 + v.PREWARM_EVERY_MS)).toBe(true);
  });
  it("NEXT_PUBLIC_JARVIS_VOICE_PREWARM=0: nothing is sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_VOICE_PREWARM", "0");
    const v = await load();
    expect(v.prewarm(["en-IN"], 10_000)).toBe(false);
    expect(synth.queue).toHaveLength(0);
  });
});
