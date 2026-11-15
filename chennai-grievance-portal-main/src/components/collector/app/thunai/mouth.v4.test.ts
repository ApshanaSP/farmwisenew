import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedSet } from "@/lib/thunai/numbergate";
import { FakeCtx, FakeSynth, FakeUtterance, l16Reply, wavReply, type FakeVoice } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
// MOUTH_UNDER_TEST points the same tests at another copy of the module (how the failing-first run was made)
const load = async (): Promise<Mouth> => { vi.resetModules(); m = (await import(/* @vite-ignore */ process.env.MOUTH_UNDER_TEST ?? "./mouth")) as Mouth; return m; };

/** a reply long enough to talk over, with no figures in it (the e2e specs' answer) */
const LONG = "The drains near the bridge are blocked and the main roads are under water. The department has the list on screen beside the map. Most of it can wait for the morning crew, though the bridge cannot.";
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
const HINDI_ONLY: FakeVoice = { name: "Microsoft Swara Online (Natural) - Hindi (India)", lang: "hi-IN" };

let m: Mouth | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
let synth: FakeSynth | null = null;
const voiceCtx = () => FakeCtx.all.find((c) => c.sources.length || c.gains.length > 1) ?? FakeCtx.all[FakeCtx.all.length - 1];
const sent = (i: number) => JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body)) as { text: string; lang: string; stream?: boolean };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function env(o: { voices?: FakeVoice[] | null } = {}) {
  synth = o.voices ? new FakeSynth(o.voices) : null;
  vi.stubGlobal("window", synth ? { AudioContext: FakeCtx, speechSynthesis: synth } : { AudioContext: FakeCtx });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
}

beforeEach(() => {
  FakeCtx.all = [];
  FakeCtx.decodedSeconds = 2;
  fetchMock = vi.fn(async () => wavReply());
  vi.stubGlobal("fetch", fetchMock);
  env();
});
afterEach(() => { m?.stopVoice(); m = null; vi.unstubAllGlobals(); });

describe("TTS, one request per answer (Pillar 5)", () => {
  it("a three-sentence answer is ONE request with the whole text, played as one voice to its end", async () => {
    const mouth = await load();
    const starts: string[] = [];
    let ended = false;
    mouth.setMouthHooks({ onStart: (p) => starts.push(p) });
    mouth.speakLines([LONG], "en-IN", { onEnd: () => { ended = true; } });
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent(0).text).toBe(LONG);
    expect(mouth.voicePath()).toBe("pcm");
    voiceCtx().sources[0].end();
    await vi.waitFor(() => expect(ended).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(starts).toEqual(["pcm"]);
  });

  it("lines of a narration go in the same request, a newline between them", async () => {
    const mouth = await load();
    mouth.speakLines(["The brief has three items.", "First, the drains near the bridge.", "Second, the water supply in Adyar."], "en-IN");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("The brief has three items.\nFirst, the drains near the bridge.\nSecond, the water supply in Adyar.");
  });

  it("the number gate still runs on every chunk: a refused chunk is never sent", async () => {
    const mouth = await load();
    const refused: string[][] = [];
    mouth.setMouthHooks({ onGateRefused: (b) => refused.push(b) });
    mouth.speakLines(["There are 47 severe cases. The list is on screen."], "en-IN", { allowed: new Set() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("The list is on screen.");
    expect(refused).toEqual([["47"]]);
  });

  it("a grouped count from a lakh up is said in lakh (English) and லட்சம் (Tamil), and still passes the gate", async () => {
    const mouth = await load();
    mouth.speakLines(["There are 1,23,456 complaints this month."], "en-IN", { allowed: allowedSet([123_456]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // v5 F1: the "1.2" of "1.2 lakh" now reaches the voice in words (mouth.v5.test.ts)
    expect(sent(0).text).toBe("There are one point two lakh complaints this month.");
    mouth.speakLines(["இந்த மாதம் 1,23,456 புகார்கள் வந்தன."], "ta-IN", { allowed: allowedSet([123_456]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(1).text).toBe("இந்த மாதம் ஒன்று புள்ளி இரண்டு லட்சம் புகார்கள் வந்தன.");
  });

  it("a streamed reply plays piece by piece as it arrives, end to end, in one voice", async () => {
    fetchMock.mockImplementation(async () => l16Reply([new Uint8Array(4800), new Uint8Array(4801), new Uint8Array(4799)]));
    const mouth = await load();
    const starts: string[] = [];
    let ended = false;
    mouth.setMouthHooks({ onStart: (p) => starts.push(p) });
    mouth.speakLines([LONG], "en-IN", { onEnd: () => { ended = true; } });
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(3));
    const st = voiceCtx().sources.map((s) => s.started![0]);
    // 2,400 samples at 24 kHz = 0.1 s each, scheduled back to back
    expect(st[1] - st[0]).toBeCloseTo(0.1, 6);
    expect(st[2] - st[1]).toBeCloseTo(0.1, 6);
    expect(sent(0).stream).toBe(true);
    for (const s of voiceCtx().sources) s.end();
    await vi.waitFor(() => expect(ended).toBe(true));
    expect(starts).toEqual(["pcm"]);
  });

  it("the server's voice fails before a sound: the WHOLE answer goes to the browser voice, never back to the server mid-answer", async () => {
    env({ voices: [HINDI_ONLY] }); // a browser voice exists, but none for English: the server's voice is chosen
    fetchMock.mockImplementationOnce(async () => new Response("down", { status: 500 }));
    const mouth = await load();
    const starts: string[] = [];
    let ended = false;
    mouth.setMouthHooks({ onStart: (p) => starts.push(p) });
    mouth.speakLines(["The drains near the bridge are blocked. The list is on screen beside the map."], "en-IN", { onEnd: () => { ended = true; } });
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    synth!.finish();
    await vi.waitFor(() => expect(synth!.said.length).toBe(2));
    synth!.finish();
    await vi.waitFor(() => expect(ended).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(starts).toEqual(["browser"]);
    expect(mouth.voicePath()).toBe("browser");
  });

  it("\"continue\" after a cut plays on from the piece it was on, from the same audio: no second request", async () => {
    const mouth = await load();
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(1));
    voiceCtx().currentTime = 1.0;
    await wait(150);
    mouth.stopVoice();
    // cut cleanly: a 15 ms fade on the answer's own gain, then the source stops
    expect(voiceCtx().sources[0].stopped).toBeCloseTo(1.015, 6);
    expect(mouth.canContinue()).toBe(true);
    expect(mouth.continueAnswer()).toBe(true);
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // the second sentence starts its share of the characters into the 2 s of audio
    const lens = LONG.split(/(?<=\.) /).map((x) => x.length + 1);
    expect(voiceCtx().sources[1].started![1]).toBeCloseTo((2 * lens[0]) / (lens[0] + lens[1] + lens[2]), 6);
  });
});

describe("the duck for barge-in", () => {
  it("PCM: the duck gain ramps to 20 % within 50 ms and the voice keeps playing; unduck brings it back", async () => {
    const mouth = await load();
    const ducks: unknown[] = [];
    mouth.setMouthHooks({ onDuck: (d) => ducks.push(d) });
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(1));
    const c = voiceCtx();
    c.currentTime = 0.5;
    mouth.duckVoice();
    const master = c.gains[0].gain;
    const ramp = master.calls.find((x) => x[0] === "linear")!;
    expect(ramp[1]).toBe(0.2);
    expect(ramp[2] - 0.5).toBeLessThanOrEqual(0.05);
    expect(ducks).toEqual([{ path: "pcm", how: "gain", ms: 30, outMs: 10 }]);
    expect(c.sources[0].stopped).toBeNull();
    expect(mouth.speaking()).toBe(true);
    mouth.unduckVoice();
    expect(master.calls.filter((x) => x[0] === "linear").pop()![1]).toBe(1);
  });

  it("browser voice, flag off (the default): it keeps speaking, never cancelled by a duck", async () => {
    env({ voices: [NEERJA] });
    const mouth = await load();
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    const cancels = synth!.cancels;
    mouth.duckVoice();
    expect(synth!.cancels).toBe(cancels);
    expect(synth!.paused).toBe(false);
    expect(mouth.lastDuck()).toEqual({ path: "browser", how: "kept", ms: null, outMs: null });
    expect(mouth.speaking()).toBe(true);
  });

  // v5 D3 (V5_EXPECTED_CHANGES.md): the flag's duck cuts the browser voice with cancel() and says the cut piece again; never pause()/resume()
  it("browser voice, flag on: the duck cuts it (cancel, never pause), how soon is measured; unduck says the cut piece again from its start", async () => {
    env({ voices: [NEERJA] });
    const mouth = await load();
    mouth.setDuckPause(true);
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    const cancels = synth!.cancels;
    mouth.duckVoice();
    expect(synth!.paused).toBe(false);
    expect(synth!.cancels).toBe(cancels + 1);
    expect(mouth.lastDuck()?.how).toBe("cut");
    expect(typeof mouth.lastDuck()?.ms).toBe("number");
    mouth.unduckVoice();
    await vi.waitFor(() => expect(synth!.said).toHaveLength(2));
    expect(synth!.said[1]).toBe(synth!.said[0]);
    expect(synth!.paused).toBe(false);
  });

  it("browser voice, flag on, a voice that ignores pause(): the cut does not depend on it, and stop still leaves it able to speak", async () => {
    env({ voices: [NEERJA] });
    synth!.pauseMode = "ignore";
    const mouth = await load();
    mouth.setDuckPause(true);
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    mouth.duckVoice();
    expect(mouth.lastDuck()).toMatchObject({ path: "browser", how: "cut", outMs: null });
    mouth.stopVoice();
    expect(synth!.paused).toBe(false);
    mouth.speakText("The list is on screen.", "en-IN");
    await vi.waitFor(() => expect(synth!.said[synth!.said.length - 1]).toBe("The list is on screen."));
  });
});

describe("honest latency masking", () => {
  it("earconEnd: no tone unless the ears are told first; then a tone of at most 120 ms, the guard set before it sounds", async () => {
    const mouth = await load();
    expect(mouth.earconEnd()).toBe(false);
    expect(FakeCtx.all.flatMap((c) => c.oscs)).toHaveLength(0);
    const order: string[] = [];
    mouth.setMouthHooks({ onEarcon: (ms) => { order.push(`guard ${ms}`); expect(FakeCtx.all.flatMap((c) => c.oscs)).toHaveLength(0); } });
    expect(mouth.earconEnd()).toBe(true);
    const o = FakeCtx.all.flatMap((c) => c.oscs)[0];
    expect(order).toEqual(["guard 400"]);
    expect(o.stops[0] - (o.starts[0] - 0.005)).toBeLessThanOrEqual(0.12 + 1e-9);
  });

  it("earconEnd: no tone over Jarvis's own voice", async () => {
    const mouth = await load();
    mouth.setMouthHooks({ onEarcon: () => undefined });
    mouth.speakLines([LONG], "en-IN");
    expect(mouth.earconEnd()).toBe(false);
  });

  it("speakAck refuses any text holding a figure", async () => {
    env({ voices: [NEERJA] });
    const mouth = await load();
    expect(mouth.speakAck("Looking at 3 zones now.", "en-IN")).toBe(false);
    expect(mouth.speakAck("Checking the two zones.", "en-IN")).toBe(false);
    expect(synth!.said).toEqual([]);
  });

  it("speakAck never cuts or delays an answer already speaking", async () => {
    env({ voices: [NEERJA] });
    const mouth = await load();
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    expect(mouth.speakAck("One moment.", "en-IN")).toBe(false);
    expect(synth!.said).toHaveLength(1);
    expect(mouth.speaking()).toBe(true);
  });

  it("speakAck speaks a numberless line with the natural voice, and the answer cuts it the moment it exists", async () => {
    env({ voices: [NEERJA] });
    const mouth = await load();
    const ev: string[] = [];
    mouth.setMouthHooks({ onStart: (p, ack) => ev.push(`start ${p} ${ack}`), onEnd: (ack) => ev.push(`end ${ack}`) });
    expect(mouth.speakAck("One moment.", "en-IN")).toBe(true);
    await vi.waitFor(() => expect(synth!.said).toEqual(["One moment."]));
    mouth.speakText("The drains near the bridge are blocked.", "en-IN");
    await vi.waitFor(() => expect(synth!.said).toEqual(["One moment.", "The drains near the bridge are blocked."]));
    expect(ev).toEqual(["start browser true", "end true", "start browser false"]);
    expect(mouth.canContinue()).toBe(false);
  });

  it("speakAck spends no request where only the server's voice could say it", async () => {
    const mouth = await load();
    expect(mouth.speakAck("One moment.", "en-IN")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warmVoice opens the audio contexts on mode-on without a sound or a request", async () => {
    const mouth = await load();
    mouth.warmVoice("ta-IN");
    await vi.waitFor(() => expect(FakeCtx.all).toHaveLength(2));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mouth.speaking()).toBe(false);
    expect(FakeCtx.all.flatMap((c) => c.sources)).toHaveLength(0);
  });
});
