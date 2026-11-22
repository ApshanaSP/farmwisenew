/**
 * Phase 7 review, lane F1 (the conductor's voice fixes), in node: the microphone (./ears) and the voice (./mouth) are stand-ins,
 * the turn machine, the address gate and the rules are real. Each check failed on the code before the fix:
 *  - the end-of-speech earcon no longer drops the next onset for 400 ms (a follow-up after a short pause is heard whole);
 *  - a /hear timeout on the ambient lane is silent ("I didn't catch that" only for an engaged sentence);
 *  - the browser's recogniser stands in only on a real outage (a network error or a 503), and only from speech start to speech end
 *    of an engaged turn, never continuously and never for a 401 or a 502;
 *  - every VAD onset and end, side talk too, is the Collector speaking (so nothing unprompted lands in a conversation's pause).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void; onEarcon?: (ms: number, tone?: number) => void }, speaking: false, saying: null as string | null, calls: [] as string[] }));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number) => void; onQuickOnset?: (w: number) => void; onQuickEnd?: (w: number) => void; onFrame?: (l: number, h: number) => void };
  captured: (number | null)[]; takes: number; kind: string;
}

vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "all"; echo = false;
    captured: (number | null)[] = []; takes = 0;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* the microphone is open */ }
    stop() { this.live = false; }
    capture(s?: number | null) { if (this.cap) return; this.cap = true; this.captured.push(s ?? null); }
    drop() { this.cap = false; }
    take() { if (!this.cap) return null; this.cap = false; this.takes++; return new Blob([new Uint8Array(2000)], { type: "audio/wav" }); }
    extend() { /* hold */ }
    endAfter() { /* eou */ }
    resume() { return Promise.resolve(); }
  }
  return { Ears };
});
vi.mock("./mouth", () => ({
  EARCON_GUARD_MS: 400,
  setMouthHooks: (h: typeof mouth.hooks) => { mouth.hooks = h; },
  speaking: () => mouth.speaking,
  nowSaying: () => mouth.saying,
  canContinue: () => false,
  continueAnswer: () => false,
  stopVoice: () => { mouth.calls.push("stop"); const was = mouth.speaking; mouth.speaking = false; mouth.saying = null; if (was) mouth.hooks.onEnd?.(false); },
  duckVoice: () => { mouth.calls.push("duck"); },
  unduckVoice: () => { mouth.calls.push("unduck"); },
  pauseVoice: () => { mouth.calls.push("pause"); },
  resumeVoice: () => { mouth.calls.push("resume"); }
}));

import { Conductor, earconDrops, hearOutage, type ConductorHooks, type HeardLine } from "./conductor";
import { TUNING } from "@/lib/thunai/vad";

interface Post { url: string; init: RequestInit; res: (r: Response) => void; rej: (e: unknown) => void }
let posts: Post[] = [];
const reply = (o: Record<string, unknown>) => new Response(JSON.stringify(o), { status: 200 });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

/** the browser's recogniser, as a stand-in: what was made, started, stopped and aborted */
interface FakeRec { lang: string; continuous: boolean; interimResults: boolean; started: boolean; stopped: boolean; aborted: boolean;
  onresult: ((e: unknown) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; final: (t: string) => void }
let recs: FakeRec[] = [];
class SR implements Partial<FakeRec> {
  lang = ""; continuous = false; interimResults = false; started = false; stopped = false; aborted = false;
  onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { recs.push(this as unknown as FakeRec); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
  final(t: string) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] }); }
}

beforeEach(() => {
  posts = []; recs = [];
  mouth.speaking = false; mouth.saying = null; mouth.calls = [];
  vi.stubGlobal("window", { SpeechRecognition: SR });
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ url, init, res, rej });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [], missed: string[] = [], speech: string[] = [], reach: boolean[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now(),
    onMissed: (w) => missed.push(w), onReach: (ok) => reach.push(ok),
    onSpeechStart: (x) => speech.push(`start:${x.engaged}${x.fallback ? ":fallback" : ""}`), onSpeechEnd: () => speech.push("end"), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, missed, speech, reach };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };

describe("the end-of-speech earcon (Voice 1)", () => {
  it("a follow-up after a short pause is heard whole: Silero's onset inside the guard is the Collector's, and it joins the first part", async () => {
    const { c, e, sentences } = await boot();
    say(e, 1000);
    expect(posts.length).toBe(1);
    // the earcon at the end of speech (mouth.earconEnd tells the ears first): 400 ms of guard, a 260 ms tone
    mouth.hooks.onEarcon?.(400, 260);
    // the sentence goes on 150 ms later, while its first part is still at Whisper
    e.hooks.onVad({ type: "start", at: 2150 }, 0);
    e.hooks.onVad({ type: "end", at: 3200, ms: 750, short: false }, 0);
    expect(e.captured).toEqual([1000, 2150]);
    expect(posts.length).toBe(2);
    posts[1].res(reply({ text: "the trends page", lang: "en", conf: { speech: 0.97, logprob: -0.2 } }));
    posts[0].res(reply({ text: "Jarvis, show", lang: "en", conf: { speech: 0.99, logprob: -0.1 } }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  it("over the voice the guard still holds: neither the energy gate's onset nor Silero's ducks it", async () => {
    const { c, e } = await boot();
    mouth.speaking = true; mouth.saying = "The drains near the bridge are blocked.";
    mouth.hooks.onStart?.("pcm", false);
    c.earcon(400);
    e.hooks.onQuickOnset?.(0);
    e.hooks.onVad({ type: "start", at: 5000 }, 0);
    expect(mouth.calls).toEqual([]);
    expect(c.state).toBe("speaking");
    c.close();
  });
  it("the rule: only the quick onset, an onset over the voice, or the energy gate's onset while the tone itself sounds is dropped", () => {
    const at = (o: Partial<Parameters<typeof earconDrops>[1]>) => ({ guard: true, tone: true, state: "thinking" as const, detector: "silero" as const, ...o });
    expect(earconDrops("quickOnset", at({}))).toBe(true);
    expect(earconDrops("vadStart", at({ state: "speaking" }))).toBe(true);
    expect(earconDrops("vadStart", at({}))).toBe(false);
    expect(earconDrops("vadStart", at({ state: "listening" }))).toBe(false);
    expect(earconDrops("vadStart", at({ detector: "energy" }))).toBe(true);
    expect(earconDrops("vadStart", at({ detector: "energy", tone: false }))).toBe(false);
    expect(earconDrops("vadStart", at({ guard: false, state: "speaking" }))).toBe(false);
    expect(earconDrops("quickOnset", at({ guard: false }))).toBe(false);
  });
});

describe("a /hear timeout (Voice 4)", () => {
  it("on the ambient lane is silent: no \"I didn't catch that\" for side talk", async () => {
    vi.useFakeTimers();
    const { c, e, missed } = await boot({ lastTurnAt: () => null });
    say(e, 1000, 900);
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain("lane=ambient");
    await vi.advanceTimersByTimeAsync(TUNING.hearTimeoutMs + 200);
    expect(missed).toEqual([]);
    expect(c.state).toBe("listening");
    c.close();
  });
  it("on the engaged lane is still said calmly", async () => {
    vi.useFakeTimers();
    const { c, e, missed } = await boot();
    say(e, 1000);
    await vi.advanceTimersByTimeAsync(TUNING.hearTimeoutMs + 200);
    expect(missed).toEqual(["timeout"]);
    c.close();
  });
});

describe("the captions fallback after a /hear error (Voice 5)", () => {
  it("what counts as an outage: a network error or a 503, never a 401 or a 502", () => {
    expect(hearOutage(new TypeError("Failed to fetch"))).toBe(true);
    expect(hearOutage({ status: 503 })).toBe(true);
    expect(hearOutage({ status: 401 })).toBe(false);
    expect(hearOutage({ status: 502 })).toBe(false);
    expect(hearOutage({ status: 500 })).toBe(false);
  });
  it("a 502 (the transcriber failed on this audio) starts no recogniser and does not say the ears are offline", async () => {
    const { c, e, reach } = await boot();
    say(e, 1000);
    posts[0].res(new Response(JSON.stringify({ error: "stt-failed" }), { status: 502 }));
    await flush();
    expect(recs.length).toBe(0);
    expect(reach).toEqual([]);
    // the next engaged sentence: still no recogniser
    e.hooks.onVad({ type: "start", at: 3000 }, 0);
    expect(recs.length).toBe(0);
    c.close();
  });
  it("a 401 starts no recogniser either", async () => {
    const { c, e } = await boot();
    say(e, 1000);
    posts[0].res(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    await flush();
    e.hooks.onVad({ type: "start", at: 3000 }, 0);
    expect(recs.length).toBe(0);
    c.close();
  });
  it("an outage: nothing listens at once; the recogniser runs from the next engaged speech start to its end, and its words are heard", async () => {
    const { c, e, sentences, reach, speech } = await boot();
    say(e, 1000);
    posts[0].rej(new TypeError("Failed to fetch"));
    await flush();
    expect(reach).toEqual([false]);
    // not continuous: no room audio goes to the browser's service between sentences
    expect(recs.length).toBe(0);
    e.hooks.onVad({ type: "start", at: 3000 }, 0);
    expect(recs.length).toBe(1);
    expect(recs[0].started).toBe(true);
    expect(recs[0].lang).toBe("en-IN");
    // the console's own live captions stand aside for it
    expect(speech.at(-1)).toBe("start:true:fallback");
    e.hooks.onVad({ type: "end", at: 4200, ms: 900, short: false }, 0);
    expect(recs[0].stopped).toBe(true);
    // its final words arrive after the stop
    recs[0].final("show me the severe cases");
    await flush();
    expect(sentences.map((s) => [s.text, s.source])).toEqual([["show me the severe cases", "captions"]]);
    c.close();
  });
  it("an outage: side talk (the ambient lane) never starts it", async () => {
    let engagedAt: number | null = Date.now();
    const { c, e } = await boot({ lastTurnAt: () => engagedAt });
    say(e, 1000);
    posts[0].rej(new TypeError("Failed to fetch"));
    await flush();
    engagedAt = null;
    e.hooks.onVad({ type: "start", at: 3000 }, 0);
    expect(recs.length).toBe(0);
    c.close();
  });
  it("Whisper back: the fallback ends", async () => {
    const { c, e } = await boot();
    say(e, 1000);
    posts[0].res(new Response(JSON.stringify({ error: "no-stt" }), { status: 503 }));
    await flush();
    say(e, 3000);
    expect(recs.length).toBe(1);
    posts[1].res(reply({ text: "show the trends page", lang: "en" }));
    await flush();
    e.hooks.onVad({ type: "start", at: 6000 }, 0);
    expect(recs.length).toBe(1);
    c.close();
  });
});

describe("the last line's language goes with the next sentence (Voice 2, the client part)", () => {
  it("none before anything was heard; then the language the server heard the last line in", async () => {
    const { c, e } = await boot();
    say(e, 1000);
    expect(posts[0].url).not.toContain("lastLang");
    posts[0].res(reply({ text: "அடையாறு புகார்கள் காட்டு", lang: "ta", conf: { speech: 0.98, logprob: -0.2 } }));
    await flush();
    say(e, 4000);
    expect(new URL(posts[1].url, "http://x").searchParams.get("lastLang")).toBe("ta");
    c.close();
  });
  it("with the open Stage's names (the multipart body) it is a field of the body", async () => {
    const { c, e } = await boot({ vocab: () => ["Velachery"] });
    say(e, 1000);
    expect((posts[0].init.body as FormData).get("lastLang")).toBeNull();
    posts[0].res(reply({ text: "show Velachery", lang: "en", conf: { speech: 0.98, logprob: -0.2 } }));
    await flush();
    say(e, 4000);
    expect((posts[1].init.body as FormData).get("lastLang")).toBe("en");
    expect(posts[1].url).not.toContain("lastLang");
    c.close();
  });
});

describe("the Collector speaking (Proactive 3)", () => {
  it("every onset and end counts, side talk the gate turns away too", async () => {
    const { c, e } = await boot({ lastTurnAt: () => null });
    expect(c.lastSpeechAt).toBeNull();
    const t0 = Date.now();
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    expect(c.lastSpeechAt).toBeGreaterThanOrEqual(t0);
    e.hooks.onVad({ type: "end", at: 2300, ms: 1000, short: false }, 0);
    expect(c.lastSpeechAt).toBeGreaterThanOrEqual(t0);
    c.close();
  });
});
