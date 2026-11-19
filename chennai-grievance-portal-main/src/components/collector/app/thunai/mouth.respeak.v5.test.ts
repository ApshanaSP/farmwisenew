/**
 * v5 D3, re-speak after a false interruption (docs/jarvis/JARVIS_V5_BUILD_2.md, Phase 5), on the mouth. Invented sentences only.
 * Where the duck stops the browser's voice (NEXT_PUBLIC_JARVIS_DUCK_PAUSE=1, as in v4), it is cut with cancel() and the piece it
 * was on is kept. A false interruption (unduckVoice: a cough, a door, "mm-hmm"), or no bid for the turn within the timeout
 * (NEXT_PUBLIC_JARVIS_FALSE_CUT_MS), says that piece again from its start. speechSynthesis.pause() and resume() are never the mechanism.
 */
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCtx, FakeSynth, FakeUtterance, wavReply, type FakeVoice } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
const load = async (): Promise<Mouth> => { vi.resetModules(); m = (await import(/* @vite-ignore */ process.env.MOUTH_UNDER_TEST ?? "./mouth")) as Mouth; return m; };

const FIRST = "The drains near the bridge are blocked and the main roads are under water.";
const SECOND = "The department has the list on screen beside the map.";
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let m: Mouth | null = null;
let synth: FakeSynth;
beforeEach(() => {
  FakeCtx.all = [];
  vi.stubGlobal("fetch", vi.fn(async () => wavReply()));
  synth = new FakeSynth([NEERJA]);
  vi.stubGlobal("window", { AudioContext: FakeCtx, speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.spyOn(synth, "pause");
  vi.spyOn(synth, "resume");
});
afterEach(() => { m?.stopVoice(); m = null; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

/** the answer, with the browser's voice on its second sentence */
async function onSecond(mouth: Mouth) {
  mouth.setDuckPause(true);
  mouth.speakLines([`${FIRST} ${SECOND}`], "en-IN");
  await vi.waitFor(() => expect(synth.said).toEqual([FIRST]));
  synth.finish();
  await vi.waitFor(() => expect(synth.said).toEqual([FIRST, SECOND]));
}

describe("D3: the browser voice's duck is a cut, never a pause", () => {
  it("the duck cancels the utterance, keeps the answer on, and never calls pause()", async () => {
    const mouth = await load();
    await onSecond(mouth);
    const cancels = synth.cancels;
    mouth.duckVoice();
    expect(synth.pause).not.toHaveBeenCalled();
    expect(synth.paused).toBe(false);
    expect(synth.cancels).toBe(cancels + 1);
    expect(mouth.lastDuck()).toMatchObject({ path: "browser", how: "cut" });
    expect(mouth.speaking()).toBe(true);
  });
  it("a false interruption (unduck) says the cut sentence again from its start, with no resume()", async () => {
    const mouth = await load();
    await onSecond(mouth);
    mouth.duckVoice();
    mouth.unduckVoice();
    await vi.waitFor(() => expect(synth.said).toEqual([FIRST, SECOND, SECOND]));
    expect(synth.resume).not.toHaveBeenCalled();
    let ended = false;
    mouth.setMouthHooks({ onEnd: () => { ended = true; } });
    synth.finish();
    await vi.waitFor(() => expect(ended).toBe(true));
  });
  it("no bid for the turn within the timeout: the cut sentence is said again on its own", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_FALSE_CUT_MS", "40");
    const mouth = await load();
    await onSecond(mouth);
    mouth.duckVoice();
    await wait(10);
    expect(synth.said).toEqual([FIRST, SECOND]);
    await vi.waitFor(() => expect(synth.said).toEqual([FIRST, SECOND, SECOND]), { timeout: 2000 });
    expect(synth.resume).not.toHaveBeenCalled();
    expect(synth.pause).not.toHaveBeenCalled();
  });
  it("a real barge-in after the cut (stopVoice): nothing is said again by the timer; continue says the cut sentence from its start", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_FALSE_CUT_MS", "40");
    const mouth = await load();
    await onSecond(mouth);
    mouth.duckVoice();
    mouth.stopVoice();
    await wait(120);
    expect(synth.said).toEqual([FIRST, SECOND]);
    expect(mouth.canContinue()).toBe(true);
    expect(mouth.continueAnswer()).toBe(true);
    await vi.waitFor(() => expect(synth.said).toEqual([FIRST, SECOND, SECOND]));
  });
  it("the timeout is 2,000 ms unless the flag says otherwise", async () => {
    const mouth = await load();
    expect(mouth.FALSE_CUT_MS).toBe(2000);
  });
  it("mouth.ts never pauses or resumes the browser's voice", () => {
    const src = fs.readFileSync(path.join(__dirname, "mouth.ts"), "utf8");
    expect(src).not.toMatch(/browser\.(?:pause|resume)\(|speechSynthesis\.(?:pause|resume)\(/);
  });
});
