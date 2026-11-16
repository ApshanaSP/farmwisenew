// v5 F1 (no digit reaches any voice) and the voice's trace stamps (section 6.4), on the mouth. Invented sentences only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spoken } from "@/lib/thunai/insight";
import { allowedSet, gateChunk } from "@/lib/thunai/numbergate";
import { FakeCtx, FakeSynth, FakeUtterance, wavReply, type FakeVoice } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
type Trace = typeof import("./trace");
// MOUTH_UNDER_TEST points the same tests at another copy of the module (how a failing-first run can be made)
const load = async (): Promise<Mouth> => { vi.resetModules(); m = (await import(/* @vite-ignore */ process.env.MOUTH_UNDER_TEST ?? "./mouth")) as Mouth; return m; };
/** the trace the mouth just loaded (resetModules gives each load its own) */
const loadTrace = async (): Promise<Trace> => (await import("./trace")) as Trace;

const DIGIT = /\p{N}/u;
const LONG = "The drains near the bridge are blocked and the main roads are under water. The department has the list on screen beside the map.";
const NEERJA: FakeVoice = { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" };
const PALLAVI: FakeVoice = { name: "Microsoft Pallavi Online (Natural) - Tamil (India)", lang: "ta-IN" };

let m: Mouth | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
let synth: FakeSynth | null = null;
const voiceCtx = () => FakeCtx.all.find((c) => c.sources.length || c.gains.length > 1) ?? FakeCtx.all[FakeCtx.all.length - 1];
const sent = (i: number) => JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body)) as { text: string; lang: string };

function env(voices: FakeVoice[] | null) {
  synth = voices ? new FakeSynth(voices) : null;
  vi.stubGlobal("window", synth ? { AudioContext: FakeCtx, speechSynthesis: synth } : { AudioContext: FakeCtx });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
}
beforeEach(() => {
  FakeCtx.all = [];
  FakeCtx.decodedSeconds = 2;
  fetchMock = vi.fn(async () => wavReply());
  vi.stubGlobal("fetch", fetchMock);
  env(null);
});
afterEach(() => { m?.stopVoice(); m = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("F1: no digit reaches any voice", () => {
  it("English, the server's voice: the figure goes in words, and the gate passed the chunk", async () => {
    const chunk = "There are 47 severe cases in 3 zones.";
    const allowed = allowedSet([47, 3]);
    expect(gateChunk(chunk, allowed).ok).toBe(true);
    const mouth = await load();
    mouth.speakLines([chunk], "en-IN", { allowed });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("There are forty-seven severe cases in three zones.");
    expect(sent(0).text).not.toMatch(DIGIT);
  });

  it("Tamil, the server's voice: Tamil number words, and the gate passed the chunk", async () => {
    const chunk = "இன்று 47 புகார்கள் 3 மண்டலங்களில் வந்தன.";
    const allowed = allowedSet([47, 3]);
    expect(gateChunk(chunk, allowed).ok).toBe(true);
    const mouth = await load();
    mouth.speakLines([chunk], "ta-IN", { allowed });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("இன்று நாற்பத்தேழு புகார்கள் மூன்று மண்டலங்களில் வந்தன.");
    expect(sent(0).text).not.toMatch(DIGIT);
  });

  it("lakh and crore keep their wording, the figure before them in words (English and Tamil)", async () => {
    const mouth = await load();
    mouth.speakLines(["There are 1,23,456 complaints this month."], "en-IN", { allowed: allowedSet([123_456]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("There are one point two lakh complaints this month.");
    mouth.speakLines(["இந்த மாதம் 1,23,456 புகார்கள் வந்தன."], "ta-IN", { allowed: allowedSet([123_456]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(1).text).toBe("இந்த மாதம் ஒன்று புள்ளி இரண்டு லட்சம் புகார்கள் வந்தன.");
  });

  it("the browser's voice, English: the utterance has no digit; the caption keeps the figure as shown, and a word's place maps back to it", async () => {
    env([NEERJA]);
    const mouth = await load();
    const pieces: string[] = [], words: number[] = [];
    mouth.speakLines(["There are 47 severe cases."], "en-IN", { allowed: allowedSet([47]), onPiece: (t) => pieces.push(t), onWord: (_, ch) => words.push(ch) });
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    expect(synth!.said[0]).toBe("There are forty-seven severe cases.");
    expect(pieces).toEqual(["There are 47 severe cases."]);
    const u = synth!.queue[0];
    u.onboundary?.({ name: "word", charIndex: u.text.indexOf("seven") });
    u.onboundary?.({ name: "word", charIndex: u.text.indexOf("severe") });
    expect(words).toEqual([pieces[0].indexOf("47"), pieces[0].indexOf("severe")]);
  });

  it("the browser's voice, Tamil (Edge's Pallavi): the utterance has no digit", async () => {
    env([PALLAVI]);
    const mouth = await load();
    mouth.speakLines(["இன்று 47 புகார்கள் வந்தன."], "ta-IN", { allowed: allowedSet([47]) });
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    expect(synth!.said[0]).toBe("இன்று நாற்பத்தேழு புகார்கள் வந்தன.");
  });

  it("a figure the gate refuses is still refused: neither its digits nor its words reach the voice (English and Tamil)", async () => {
    const mouth = await load();
    const refused: string[][] = [];
    mouth.setMouthHooks({ onGateRefused: (b) => refused.push(b) });
    mouth.speakLines(["There are 47 severe cases. The list is on screen."], "en-IN", { allowed: new Set() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("The list is on screen.");
    mouth.speakLines(["இன்று 47 புகார்கள் வந்தன. பட்டியல் திரையில் உள்ளது."], "ta-IN", { allowed: new Set() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(1).text).toBe("பட்டியல் திரையில் உள்ளது.");
    expect(refused).toEqual([["47"], ["47"]]);
    for (const i of [0, 1]) expect(sent(i).text).not.toMatch(/forty|நாற்பத்/u);
  });

  it("review numbers-privacy-1: a count code wrote with spoken() (no grouping commas) is said as a number, English and Tamil", async () => {
    const mouth = await load();
    const shown = `Open complaints went up: ${spoken(12345)} now against ${spoken(11800)} before.`;
    expect(shown).toContain("12345");
    mouth.speakLines([shown], "en-IN", { allowed: allowedSet([12345, 11800]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("Open complaints went up: twelve thousand three hundred and forty-five now against eleven thousand eight hundred before.");
    mouth.speakLines([`${spoken(120000)} cases this quarter.`], "en-IN");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(1).text).toBe("one lakh twenty thousand cases this quarter.");
    mouth.speakLines([`இந்த மாதம் ${spoken(28420)} சம்பவங்கள் பதிவாயின.`], "ta-IN", { allowed: allowedSet([28420]) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(sent(2).text).toBe("இந்த மாதம் இருபத்தெட்டாயிரத்து நானூற்று இருபது சம்பவங்கள் பதிவாயின.");
    for (const i of [0, 1, 2]) expect(sent(i).text).not.toMatch(DIGIT);
  });

  it("text built by code (no allowed set) is said in words too", async () => {
    const mouth = await load();
    mouth.speakLines(["Zone 13 has 4 open cases."], "en-IN");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("Zone thirteen has four open cases.");
  });

  it("a chunk that still holds a digit after the words is not said, and only a count is logged, never the text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mouth = await load();
    mouth.speakLines(["About ½ of the ratio is new. The list is on screen."], "en-IN");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(0).text).toBe("The list is on screen.");
    expect(mouth.digitRefused()).toBe(1);
    const logged = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toMatch(/1/);
    expect(logged).not.toMatch(/ratio|½/u);
  });

  it("the acknowledgement goes through the same check: a line with a code is said in words", async () => {
    env([NEERJA]);
    const mouth = await load();
    expect(mouth.speakAck("Checking Covid-19 wards.", "en-IN")).toBe(true);
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    expect(synth!.said[0]).toBe("Checking Covid-nineteen wards.");
  });
});

describe("the voice's trace stamps (section 6.4)", () => {
  it("the server's voice: speakCalled when the first sentence is handed to speak, voiceStart when its first sample is scheduled", async () => {
    const mouth = await load();
    const trace = await loadTrace();
    trace.resetTrace();
    trace.traceStart(performance.now());
    mouth.speakLines([LONG], "en-IN");
    const t = trace.traces().at(-1)!;
    expect(typeof t.at.speakCalled).toBe("number");
    expect(t.at.voiceStart).toBeUndefined();
    await vi.waitFor(() => expect(voiceCtx().sources.length).toBe(1));
    expect(typeof t.at.voiceStart).toBe("number");
    expect(t.at.voiceStart!).toBeGreaterThanOrEqual(t.at.speakCalled!);
  });

  it("the browser's voice: voiceStart when the voice starts (its first word, where the voice gives no start event)", async () => {
    env([NEERJA]);
    const mouth = await load();
    const trace = await loadTrace();
    trace.resetTrace();
    trace.traceStart(performance.now());
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    const t = trace.traces().at(-1)!;
    expect(typeof t.at.speakCalled).toBe("number");
    expect(t.at.voiceStart).toBeUndefined();
    synth!.queue[0].onboundary?.({ name: "word", charIndex: 0 });
    expect(t.at.voiceStart!).toBeGreaterThanOrEqual(t.at.speakCalled!);
  });
  // review voice-detector-latency-3: the browser voice's start is its utterance's onstart, not its first word
  it("the browser's voice: voiceStart at the utterance's onstart, before any word boundary", async () => {
    env([NEERJA]);
    const mouth = await load();
    const trace = await loadTrace();
    trace.resetTrace();
    trace.traceStart(performance.now());
    mouth.speakLines([LONG], "en-IN");
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    const t = trace.traces().at(-1)!;
    expect(t.at.voiceStart).toBeUndefined();
    (synth!.queue[0] as unknown as { onstart?: (() => void) | null }).onstart?.();
    expect(typeof t.at.voiceStart).toBe("number");
    expect(t.at.voiceStart!).toBeGreaterThanOrEqual(t.at.speakCalled!);
  });

  it("the acknowledgement stamps neither: the trace measures the answer", async () => {
    env([NEERJA]);
    const mouth = await load();
    const trace = await loadTrace();
    trace.resetTrace();
    trace.traceStart(performance.now());
    expect(mouth.speakAck("One moment.", "en-IN")).toBe(true);
    await vi.waitFor(() => expect(synth!.said.length).toBe(1));
    synth!.queue[0].onboundary?.({ name: "word", charIndex: 0 });
    const t = trace.traces().at(-1)!;
    expect(t.at.speakCalled).toBeUndefined();
    expect(t.at.voiceStart).toBeUndefined();
  });
});
