/**
 * The conductor's v5 items, in node: the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address
 * gate are real. No model and no network: /hear is a stub that records its requests. Sentences are invented.
 *  - C3: the window the captions may run in (inWindow): within ENGAGED_MS of the wake or of Jarvis's last turn, or while it speaks.
 *  - C4: the strict audio gate, and the engaged mark on the request.
 *  - Section 6.4: the trace's stamps (voicedEnd as zero, eou, uploadSent, the server's offsets, hearBack), timings only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGED_MS } from "@/lib/thunai/addressed";
import { resetTrace, traces } from "./trace";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void }, speaking: false, saying: null as string | null }));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onQuickOnset?: (w: number) => void; onQuickEnd?: (w: number) => void; onFrame?: (l: number, h: number) => void };
  takes: number;
}

vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false; takes = 0;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* the microphone is open */ }
    stop() { this.live = false; }
    capture() { this.cap = true; }
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
  stopVoice: () => { mouth.speaking = false; mouth.saying = null; },
  duckVoice: () => undefined,
  unduckVoice: () => undefined
}));

import { Conductor, type ConductorHooks, type HeardLine } from "./conductor";

interface Post { url: string; init: RequestInit; res: (r: Response) => void }
let posts: Post[] = [];
const reply = (o: Record<string, unknown>) => new Response(JSON.stringify(o), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  posts = [];
  mouth.speaking = false; mouth.saying = null;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ url, init, res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [], ignored: string[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => undefined, onIgnored: (t) => ignored.push(t),
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now(), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, ignored };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };

describe("C3: the window the captions may run in", () => {
  it("idle and unengaged (no wake, no turn, Jarvis silent) it is shut", async () => {
    const { c } = await boot({ lastTurnAt: () => null });
    expect(c.inWindow()).toBe(false);
    c.close();
  });
  it("the name alone (a wake) opens it", async () => {
    const { c, e } = await boot({ lastTurnAt: () => null });
    say(e, 1000);
    posts[0].res(reply({ text: "Jarvis", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }));
    await flush();
    expect(c.inWindow()).toBe(true);
    c.close();
  });
  it("inside ENGAGED_MS of Jarvis's last turn it is open; a millisecond past it, shut", async () => {
    let last: number | null = null;
    const { c } = await boot({ lastTurnAt: () => last });
    const now = Date.now();
    last = now - 5_000;
    expect(c.inWindow(now)).toBe(true);
    last = now - ENGAGED_MS;
    expect(c.inWindow(now)).toBe(true);
    last = now - ENGAGED_MS - 1;
    expect(c.inWindow(now)).toBe(false);
    c.close();
  });
  it("while Jarvis is speaking it is open, however long ago the last turn ended", async () => {
    const { c } = await boot({ lastTurnAt: () => Date.now() - 10 * ENGAGED_MS });
    expect(c.inWindow()).toBe(false);
    mouth.speaking = true;
    expect(c.inWindow()).toBe(true);
    c.close();
  });
});

const param = (p: Post, k: string) => new URL(p.url, "http://x").searchParams.get(k);

describe("C4: the strict audio gate, NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 (default off)", () => {
  it("on: a sentence neither woken nor in the window makes no /hear request at all, and Jarvis listens on", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE", "1");
    const { c, e } = await boot({ lastTurnAt: () => null });
    say(e, 1000, 900);
    await flush();
    expect(posts.length).toBe(0);
    expect(e.takes).toBe(0);
    expect(c.state).toBe("listening");
    c.close();
  });
  it("on: inside the window the sentence goes, carrying the engaged mark", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE", "1");
    const { c, e } = await boot({ lastTurnAt: () => Date.now() - 5_000 });
    say(e, 1000);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "engaged")).toBe("1");
    c.close();
  });
  it("on: over Jarvis's voice, long after its last turn, the sentence still goes (speaking is inside the window)", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE", "1");
    const { c, e } = await boot({ lastTurnAt: () => Date.now() - 10 * ENGAGED_MS });
    mouth.speaking = true; mouth.saying = "an invented answer being read out";
    say(e, 1000);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "engaged")).toBe("1");
    c.close();
  });
  it("off (the default): side talk still goes on the capped ambient lane, with no engaged mark", async () => {
    const { c, e } = await boot({ lastTurnAt: () => null });
    say(e, 1000, 900);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "lane")).toBe("ambient");
    expect(param(posts[0], "engaged")).toBeNull();
    c.close();
  });
  it("off: an engaged sentence carries the mark as well (a strict server takes it); the body is as before", async () => {
    const { c, e } = await boot({ vocab: () => ["Velachery"] });
    say(e, 1000);
    expect(param(posts[0], "engaged")).toBe("1");
    expect(param(posts[0], "lane")).toBe("engaged");
    expect(posts[0].init.body).toBeInstanceOf(FormData);
    c.close();
  });
});

describe("the trace's stamps (section 6.4): zero is the last voiced sample, not the detector's decision", () => {
  beforeEach(() => resetTrace());
  const conf = { speech: 0.98, logprob: -0.1 };
  it("an utterance's end opens a turn at its last voiced sample; then eou, the upload, the server's offsets and the transcript", async () => {
    const { c, e, sentences } = await boot();
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 5000, 4700);
    expect(traces().length).toBe(1);
    const t = traces()[0];
    expect(t.zero).toBe(4700);
    expect(t.at.voicedEnd).toBe(4700);
    expect(t.at.eou).toBe(5000);
    expect(typeof t.at.uploadSent).toBe("number");
    expect(t.at.hearBack).toBeUndefined();
    posts[0].res(reply({ text: "show the trends page", lang: "en", conf, timing: { sttSent: 4, sttBack: 290 } }));
    await flush();
    expect(t.at.sttSent).toBe((t.at.uploadSent as number) + 4);
    expect(t.at.sttBack).toBe((t.at.uploadSent as number) + 290);
    expect(t.at.hearBack).toBeGreaterThanOrEqual(t.at.uploadSent as number);
    expect(sentences.length).toBe(1);
    expect(sentences[0].trace).toBe(t.n);
    // timings only: no words in the trace
    expect(JSON.stringify(traces())).not.toMatch(/trends/);
    c.close();
  });
  it("ears that give no last voiced sample: zero is the decision itself", async () => {
    const { c, e } = await boot();
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 5000);
    expect(traces()[0].zero).toBe(5000);
    c.close();
  });
  it("a cough, and side talk too short to send, open no turn", async () => {
    const { c, e } = await boot({ lastTurnAt: () => null });
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 1400, ms: 100, short: true }, 3000, 2900);
    say(e, 5000, 300);
    expect(posts.length).toBe(0);
    expect(traces().length).toBe(0);
    c.close();
  });
  it("a sentence said in two parts: the second part's turn gets only its own reading's stamps", async () => {
    const { c, e, sentences } = await boot();
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 5000, 4700);
    e.hooks.onVad({ type: "start", at: 2300 }, 0);
    e.hooks.onFrame?.(0.5, 300);
    e.hooks.onVad({ type: "end", at: 3400, ms: 800, short: false }, 6400, 6100);
    expect(posts.length).toBe(2);
    const [t1, t2] = traces();
    expect(t2.zero).toBe(6100);
    posts[0].res(reply({ text: "Jarvis, show", lang: "en", conf, timing: { sttSent: 1, sttBack: 999 } }));
    await flush();
    expect(t2.at.sttBack).toBeUndefined();
    expect(t1.at.sttBack).toBeUndefined();
    posts[1].res(reply({ text: "the trends page", lang: "en", conf, timing: { sttSent: 2, sttBack: 250 } }));
    await flush();
    expect(t2.at.sttBack).toBe((t2.at.uploadSent as number) + 250);
    expect(typeof t2.at.hearBack).toBe("number");
    expect(sentences.map((s) => s.trace)).toEqual([t2.n]);
    c.close();
  });
});

describe("B2's context reaches the echo guard: the speech span, and a clarifying question pending", () => {
  it("the upload carries the detector's speech span (ms), and clarify=1 only while a question is pending", async () => {
    const pending = { q: false };
    const { c, e } = await boot({ clarifyPending: () => pending.q } as Partial<ConductorHooks>);
    say(e, 1000, 450);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "speechMs")).toBe("450");
    expect(param(posts[0], "clarify")).toBeNull();
    posts[0].res(reply({ text: "", lang: "en" }));
    await flush();
    pending.q = true;
    say(e, 5000, 600);
    expect(posts.length).toBe(2);
    expect(param(posts[1], "clarify")).toBe("1");
    expect(param(posts[1], "speechMs")).toBe("600");
    c.close();
  });
});
