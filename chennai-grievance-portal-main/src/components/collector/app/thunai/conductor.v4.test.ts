/**
 * The conductor's v4 ears, in node: the microphone (./ears) and the voice (./mouth) are stand-ins, the turn machine, the
 * address gate and the rules are real. What is checked: the /hear timeout, a split sentence posted once, no client re-post,
 * an honest confidence, the speech hooks for the captions, the adaptive end of utterance and the ducking barge-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void }, speaking: false, saying: null as string | null, calls: [] as string[] }));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number) => void; onQuickOnset?: (w: number) => void; onQuickEnd?: (w: number) => void; onFrame?: (l: number, h: number) => void };
  captured: (number | null)[]; ends: (number | null)[]; takes: number; echoMode: string;
}

vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "all"; echo = false;
    captured: (number | null)[] = []; ends: (number | null)[] = []; takes = 0;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* the microphone is open */ }
    stop() { this.live = false; }
    capture(s?: number | null) { if (this.cap) return; this.cap = true; this.captured.push(s ?? null); }
    drop() { this.cap = false; }
    take() { if (!this.cap) return null; this.cap = false; this.takes++; return new Blob([new Uint8Array(2000)], { type: "audio/wav" }); }
    extend() { /* hold */ }
    endAfter(ms: number | null) { this.ends.push(ms); }
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

import { Conductor, type ConductorHooks, type HeardLine } from "./conductor";

interface Post { url: string; init: RequestInit; res: (r: Response) => void }
let posts: Post[] = [];
const reply = (o: Record<string, unknown>) => new Response(JSON.stringify(o), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  posts = [];
  mouth.speaking = false; mouth.saying = null; mouth.calls = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ url, init, res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> & { missed?: string[] } = {}) {
  const sentences: HeardLine[] = [], states: string[] = [], speech: string[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: (s) => states.push(s), rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now(),
    onSpeechStart: (x) => speech.push(`start:${x.engaged}`), onSpeechEnd: () => speech.push("end"), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, states, speech };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };

describe("the /hear request", () => {
  it("gives up after 6 s: the sentence counts as not heard and Jarvis listens again, calmly", async () => {
    vi.useFakeTimers();
    const missed: string[] = [];
    const { c, e, sentences } = await boot({ onMissed: (w) => missed.push(w) });
    say(e, 1000);
    await vi.advanceTimersByTimeAsync(5900);
    expect(missed).toEqual([]);
    expect(c.state).toBe("thinking");
    await vi.advanceTimersByTimeAsync(200);
    expect(missed).toEqual(["timeout"]);
    expect(c.state).toBe("listening");
    expect(sentences).toEqual([]);
    c.close();
  });
  it("a sentence that goes on after a pause: the first part is not posted again, and the two readings are joined", async () => {
    const { c, e, sentences } = await boot();
    say(e, 1000);
    expect(posts.length).toBe(1);
    // the sentence goes on while its first part is at Whisper
    e.hooks.onVad({ type: "start", at: 2300 }, 0);
    e.hooks.onFrame?.(0.5, 300);
    e.hooks.onVad({ type: "end", at: 3400, ms: 800, short: false }, 0);
    expect(posts.length).toBe(2);
    expect(e.captured[1]).toBe(2300);
    expect(posts[0].init.signal?.aborted).toBe(false);
    posts[1].res(reply({ text: "the trends page", lang: "en", conf: { speech: 0.97, logprob: -0.2 } }));
    await flush();
    expect(sentences).toEqual([]);
    posts[0].res(reply({ text: "Jarvis, show", lang: "en", conf: { speech: 0.99, logprob: -0.1 } }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  it("the second part was only a cough: the first part is the sentence", async () => {
    const { c, e, sentences } = await boot();
    say(e, 1000);
    e.hooks.onVad({ type: "start", at: 2300 }, 0);
    e.hooks.onVad({ type: "end", at: 2500, ms: 90, short: true }, 0);
    posts[0].res(reply({ text: "show the trends page", lang: "en", conf: { speech: 0.97, logprob: -0.2 } }));
    await flush();
    expect(posts.length).toBe(1);
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  it("an ambient sentence with the name and an unsure reading is not posted a second time by the browser", async () => {
    const { c, e, sentences } = await boot({ lastTurnAt: () => null });
    say(e, 1000, 900);
    posts[0].res(reply({ text: "Jarvis, show the trends page", lang: "en", conf: { speech: 0.9, logprob: -0.9 } }));
    await flush();
    expect(posts.length).toBe(1);
    expect(sentences.length).toBe(1);
    c.close();
  });
  it("the line carries the server's language and an honest confidence: P(speech) x exp(mean log-probability)", async () => {
    const { c, e, sentences } = await boot();
    say(e, 1000);
    posts[0].res(reply({ text: "அடையாறு புகார்கள் காட்டு", lang: "ta", conf: { speech: 0.98, logprob: -0.2 } }));
    await flush();
    expect(sentences[0].lang).toBe("ta");
    expect(sentences[0].conf).toBeCloseTo(0.98 * Math.exp(-0.2), 2);
    c.close();
  });
  it("the open Stage's names go with the audio; with none, the body is the WAV as before", async () => {
    const a = await boot({ vocab: () => ["Velachery", "Storm Water Drains"] });
    say(a.e, 1000);
    const body = posts[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(body.get("vocab")))).toEqual(["Velachery", "Storm Water Drains"]);
    expect(body.get("audio")).toBeInstanceOf(Blob);
    a.c.close();
    posts = [];
    const b = await boot();
    say(b.e, 1000);
    expect(posts[0].init.body).toBeInstanceOf(Blob);
    b.c.close();
  });
});

describe("captions only while hearing, and the end of the sentence they decide", () => {
  it("the speech hooks fire at onset and at the end, with whether the turn is engaged; close ends an open one", async () => {
    const a = await boot();
    say(a.e, 1000);
    expect(a.speech).toEqual(["start:true", "end"]);
    a.c.close();
    const b = await boot({ lastTurnAt: () => null });
    b.e.hooks.onVad({ type: "start", at: 1000 }, 0);
    b.c.close();
    expect(b.speech).toEqual(["start:false", "end"]);
  });
  it("live words set the end of the sentence: open on a connective, short on a whole command, ignored after the end", async () => {
    const { c, e } = await boot({ rules: (t) => ({ sure: /severe cases$/.test(t), districtNoun: /adyar/i.test(t) }) });
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    c.partial("show Adyar and");
    expect(e.ends.at(-1)).toBe(650);
    c.partial("show the severe cases");
    expect(e.ends.at(-1)).toBe(300);
    c.partial("what about Adyar");
    expect(e.ends.at(-1)).toBe(300);
    e.hooks.onVad({ type: "end", at: 2500, ms: 1200, short: false }, 0);
    const n = e.ends.length;
    c.partial("and then");
    expect(e.ends.length).toBe(n);
    c.close();
  });
});

describe("barge-in ducks; two real words or 600 ms stop it", () => {
  const talking = async () => {
    const b = await boot();
    mouth.speaking = true; mouth.saying = "The drains near the bridge are blocked and the main roads are under water.";
    mouth.hooks.onStart?.("browser", false);
    expect(b.c.state).toBe("speaking");
    return b;
  };
  it("an onset ducks the voice and never pauses it; mm-hmm in the live words changes nothing", async () => {
    const { c, e, speech } = await talking();
    e.hooks.onQuickOnset?.(0);
    expect(mouth.calls).toEqual(["duck"]);
    expect(speech).toEqual(["start:true"]);
    c.partial("mm-hmm okay");
    expect(mouth.calls).toEqual(["duck"]);
    c.partial("okay show trends");
    expect(mouth.calls).toContain("stop");
    c.close();
  });
  it("Jarvis's own words caught by the captions do not stop it", async () => {
    const { c, e } = await talking();
    e.hooks.onQuickOnset?.(0);
    c.partial("the drains near the bridge are blocked");
    expect(mouth.calls).toEqual(["duck"]);
    e.hooks.onQuickEnd?.(0);
    expect(mouth.calls).toEqual(["duck", "unduck"]);
    c.close();
  });
  it("an earcon playing over the voice never ducks it", async () => {
    const { c, e } = await talking();
    c.earcon(400);
    e.hooks.onQuickOnset?.(0);
    e.hooks.onVad({ type: "start", at: 5000 }, 0);
    expect(mouth.calls).toEqual([]);
    expect(c.state).toBe("speaking");
    c.close();
  });
  it("which echo canceller the microphone got is on the conductor, beside the detector", async () => {
    const { c } = await boot();
    expect(c.echoCancel).toBe("all");
    expect(c.detector).toBe("silero");
    c.close();
  });
});
