// v4 (H2's ask, wired by the client lane): the mouth tells the bar's caption which piece it is saying, exactly as it says it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedSet } from "@/lib/thunai/numbergate";
import { FakeCtx, FakeSynth, FakeUtterance, wavReply, type FakeVoice } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
// MOUTH_UNDER_TEST points the same tests at another copy of the module (how the failing-first run was made)
const load = async (): Promise<Mouth> => { vi.resetModules(); m = (await import(/* @vite-ignore */ process.env.MOUTH_UNDER_TEST ?? "./mouth")) as Mouth; return m; };
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
let m: Mouth | null = null;
let synth: FakeSynth | null = null;

function env(voices: FakeVoice[] | null) {
  synth = voices ? new FakeSynth(voices) : null;
  vi.stubGlobal("window", synth ? { AudioContext: FakeCtx, speechSynthesis: synth } : { AudioContext: FakeCtx });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
}
beforeEach(() => { FakeCtx.all = []; FakeCtx.decodedSeconds = 2; vi.stubGlobal("fetch", vi.fn(async () => wavReply())); });
afterEach(() => { m?.stopVoice(); m = null; vi.unstubAllGlobals(); });

describe("SpeakOpts.onPiece", () => {
  it("browser voice: each gated piece, just before it is spoken, as the voice says it (lakh wording, a refused chunk never)", async () => {
    env([NEERJA]);
    const mouth = await load();
    const pieces: [string, number][] = [];
    mouth.speakLines(["There are 1,23,456 complaints this month. Flood deaths 300.", "The list is on the screen."], "en-IN", { allowed: allowedSet([123_456]), onPiece: (t, l) => pieces.push([t, l]) });
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    expect(pieces).toEqual([["There are 1.2 lakh complaints this month.", 0]]);
    expect(synth!.said[0]).toBe(pieces[0][0]);
    synth!.finish();
    await vi.waitFor(() => expect(synth!.said.length).toBe(2));
    expect(pieces).toEqual([["There are 1.2 lakh complaints this month.", 0], ["The list is on the screen.", 1]]);
  });
  it("server voice: the piece the audio has reached", async () => {
    env(null);
    const mouth = await load();
    const pieces: string[] = [];
    mouth.speakLines(["The drains near the bridge are blocked.", "The list is on the screen."], "en-IN", { onPiece: (t) => pieces.push(t) });
    await vi.waitFor(() => expect(pieces[0]).toBe("The drains near the bridge are blocked."));
  });
});
