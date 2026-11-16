/**
 * The conductor's v5 items, in node: the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address
 * gate are real. No model and no network: /hear is a stub that records its requests. Sentences are invented.
 *  - C3: the window the captions may run in (inWindow): within ENGAGED_MS of the wake or of Jarvis's last turn, or while it speaks.
 *  - C4: the strict audio gate, and the engaged mark on the request.
 *  - Section 6.4: the trace's stamps (voicedEnd as zero, eou, uploadSent, the server's offsets, hearBack), timings only.
 *  - E2: early speech-to-text (NEXT_PUBLIC_JARVIS_EARLY_STT): an engaged sentence goes to /hear at the ears' pause (150 ms of quiet),
 *    before its end is decided; aborted if the voice comes back, and then the whole sentence is read; at most 2 requests a sentence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGED_MS } from "@/lib/thunai/addressed";
import { resetTrace, traces } from "./trace";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void }, speaking: false, saying: null as string | null, bookmark: false }));

interface FakeEars {
  hooks: {
    onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onQuickOnset?: (w: number) => void; onQuickEnd?: (w: number) => void; onFrame?: (l: number, h: number) => void;
    /** E2: the deciding detector heard 150 ms of quiet inside a sentence that has not ended (speech so far `ms`) */
    onPause?: (wall: number, voicedEnd: number, ms: number) => void;
    /** E2: the voice came back before the sentence ended */
    onResume?: (wall: number) => void;
  };
  takes: number; peeks: number; capturing: boolean;
}

vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false; takes = 0; peeks = 0;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* the microphone is open */ }
    stop() { this.live = false; }
    capture() { this.cap = true; }
    drop() { this.cap = false; }
    get capturing() { return this.cap; }
    // the sentence so far (1000 bytes) while the capture goes on; take() gives the whole of it (2000 bytes)
    peek() { if (!this.cap) return null; this.peeks++; return new Blob([new Uint8Array(1000)], { type: "audio/wav" }); }
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
  // a cut answer's bookmark (mouth.ts stopVoice keeps it for "continue"): set by the test that needs one
  canContinue: () => mouth.bookmark,
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
  mouth.speaking = false; mouth.saying = null; mouth.bookmark = false;
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

/**
 * Review gate-captions-wake-3: talking over Jarvis's answer cuts it and keeps its bookmark (mouth.ts) until Jarvis speaks again, and
 * bargeIns never falls back. The lane counted every later sentence as engaged on that alone (uncapped, two forced decodes, "didn't
 * catch that" on a timeout, and the stand-in recogniser in an outage). Now that reckoning lasts ENGAGED_MS from the cut.
 */
describe("the engaged lane after a cut answer lasts ENGAGED_MS from the cut, not until Jarvis speaks again", () => {
  const conf = { speech: 0.98, logprob: -0.1 };
  afterEach(() => vi.restoreAllMocks());
  /** Jarvis reads a long answer, the Collector talks over it ("okay show trends"), the voice is cut and its bookmark kept */
  async function cutAnswer() {
    const clock = { t: 5_000_000 };
    vi.spyOn(Date, "now").mockImplementation(() => clock.t);
    const starts: boolean[] = [];
    // the console's last turn is left out (null): this is the lane's own reckoning of having been spoken over
    const b = await boot({ lastTurnAt: () => null, onSpeechStart: (o) => { starts.push(o.engaged); } });
    mouth.speaking = true; mouth.saying = "an invented long answer about the drains near the bridge being read out";
    mouth.hooks.onStart?.("browser", false);
    b.e.hooks.onQuickOnset?.(0);
    b.c.partial("okay show trends");
    expect(b.c.state).toBe("interrupted");
    // mouth.ts stopVoice kept what was being said for "continue"
    mouth.bookmark = true;
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "lane")).toBe("engaged");
    // the words were not for Jarvis after all: nothing comes of them, and the bookmark stays (nothing was said since)
    posts[0].res(reply({ text: "", lang: "en", conf }));
    await flush();
    return { ...b, clock, starts };
  }
  it("30 s after the cut, with the bookmark still kept, room speech goes on the capped ambient lane, unengaged", async () => {
    const { c, e, clock, starts } = await cutAnswer();
    clock.t += 30_000;
    expect(c.inWindow()).toBe(false);
    say(e, 9000, 900);
    expect(posts.length).toBe(2);
    expect(param(posts[1], "lane")).toBe("ambient");
    expect(param(posts[1], "engaged")).toBeNull();
    // the speech start told the console it was not engaged (no captions, no stand-in recogniser)
    expect(starts.at(-1)).toBe(false);
    c.close();
  });
  it("inside ENGAGED_MS of the cut it is still engaged, as in v4 (the bookmark is kept for \"continue\")", async () => {
    const { c, e, clock, starts } = await cutAnswer();
    clock.t += ENGAGED_MS - 1_000;
    say(e, 9000, 900);
    expect(posts.length).toBe(2);
    expect(param(posts[1], "lane")).toBe("engaged");
    expect(starts.at(-1)).toBe(true);
    c.close();
  });
  it("a millisecond past ENGAGED_MS from the cut it is ambient", async () => {
    const { c, e, clock } = await cutAnswer();
    clock.t += ENGAGED_MS + 1;
    say(e, 9000, 900);
    expect(param(posts[1], "lane")).toBe("ambient");
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

describe("E2: early speech-to-text, NEXT_PUBLIC_JARVIS_EARLY_STT=1 (default off since the second real run)", () => {
  const conf = { speech: 0.98, logprob: -0.1 };
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_JARVIS_EARLY_STT", "1"));
  afterEach(() => vi.restoreAllMocks());
  it("unset: off, today's path (one request at the end)", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_EARLY_STT", "");
    const { c, e } = await boot({ lastTurnAt: () => Date.now() - 5_000 });
    begin(e);
    pause(e, 900);
    expect(posts.length).toBe(0);
    c.close();
  });
  /** a sentence begins (the deciding detector's start) */
  const begin = (e: FakeEars, start = 1000) => e.hooks.onVad({ type: "start", at: start }, 0);
  /** the ears' pause: 150 ms of quiet inside the sentence, `ms` of speech so far (today's ears never send it) */
  const pause = (e: FakeEars, ms: number, wall = 0, voiced = 0) => e.hooks.onPause?.(wall, voiced, ms);
  /** the voice came back before the sentence ended */
  const resume = (e: FakeEars) => e.hooks.onResume?.(0);
  /** the end of utterance, decided as today (300 ms of quiet, or eou.ts's 650 ms) */
  const end = (e: FakeEars, ms: number, wall = 0, voiced?: number) => e.hooks.onVad({ type: "end", at: 9000, ms, short: false }, wall, voiced);

  it("(1) engaged: the upload starts at the pause, before the end event; the end makes no second request, and its words are the sentence's", async () => {
    const { c, e, sentences } = await boot();
    begin(e);
    pause(e, 700);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "lane")).toBe("engaged");
    expect(param(posts[0], "engaged")).toBe("1");
    expect(param(posts[0], "speechMs")).toBe("700");
    // the sentence so far, the capture going on: nothing is decided yet
    expect(e.peeks).toBe(1);
    expect(e.takes).toBe(0);
    expect(e.capturing).toBe(true);
    expect(c.state).toBe("hearing");
    expect(sentences).toEqual([]);
    end(e, 700);
    expect(posts.length).toBe(1);
    expect(e.takes).toBe(0);
    expect(e.capturing).toBe(false);
    expect(c.state).toBe("thinking");
    posts[0].res(reply({ text: "show the trends page", lang: "en", conf }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  it("(1) a reply back before the end is decided (eou.ts's 650 ms) waits for the end: nothing is handed on until then", async () => {
    const { c, e, sentences } = await boot();
    begin(e);
    pause(e, 900);
    posts[0].res(reply({ text: "show the severe cases", lang: "en", conf }));
    await flush();
    expect(sentences).toEqual([]);
    expect(c.state).toBe("hearing");
    end(e, 900);
    await flush();
    expect(posts.length).toBe(1);
    expect(sentences.map((s) => s.text)).toEqual(["show the severe cases"]);
    c.close();
  });
  it("(2) the voice resumes after the early upload: that request is aborted, and the sentence is the whole utterance's, read by one more request", async () => {
    const { c, e, sentences } = await boot();
    begin(e);
    pause(e, 600);
    expect(posts.length).toBe(1);
    resume(e);
    expect(posts[0].init.signal?.aborted).toBe(true);
    // the capture goes on: the whole sentence is still kept
    expect(e.capturing).toBe(true);
    end(e, 1500);
    expect(posts.length).toBe(2);
    expect(e.takes).toBe(1);
    // the whole utterance (take: 2000 bytes), not the part sent early (peek: 1000)
    expect((posts[1].init.body as Blob).size).toBe(2000);
    expect(param(posts[1], "speechMs")).toBe("1500");
    posts[1].res(reply({ text: "show the trends page for Adyar zone", lang: "en", conf }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page for Adyar zone"]);
    c.close();
  });
  it("(2) a reply already back when the voice resumes is never used: the whole utterance's words are", async () => {
    const { c, e, sentences } = await boot();
    begin(e);
    pause(e, 600);
    posts[0].res(reply({ text: "show the trends", lang: "en", conf }));
    await flush();
    resume(e);
    end(e, 1400);
    await flush();
    expect(sentences).toEqual([]);
    expect(posts.length).toBe(2);
    posts[1].res(reply({ text: "show the trends page for Adyar zone", lang: "en", conf }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page for Adyar zone"]);
    c.close();
  });
  it("(3) never more than 2 requests a sentence: after one early request is aborted, the rest waits for the end", async () => {
    const { c, e, sentences } = await boot();
    begin(e);
    for (let i = 0; i < 4; i++) { pause(e, 500 + i * 400); resume(e); }
    expect(posts.length).toBe(1);
    pause(e, 2400);
    expect(posts.length).toBe(1);
    end(e, 2400);
    expect(posts.length).toBe(2);
    expect(e.peeks).toBe(1);
    expect(e.takes).toBe(1);
    posts[1].res(reply({ text: "show the trends page for Adyar zone", lang: "en", conf }));
    await flush();
    expect(sentences.length).toBe(1);
    c.close();
  });
  it("(3) each sentence has its own two: said in two parts, each part goes early, the first part's reading is kept and joined", async () => {
    const { c, e, sentences } = await boot();
    begin(e, 1000);
    pause(e, 700);
    end(e, 700);
    expect(posts.length).toBe(1);
    // the sentence goes on while its first part is at Whisper
    e.hooks.onVad({ type: "start", at: 2300 }, 0);
    e.hooks.onFrame?.(0.5, 300);
    pause(e, 800);
    expect(posts.length).toBe(2);
    expect(posts[0].init.signal?.aborted).toBe(false);
    end(e, 800);
    expect(posts.length).toBe(2);
    posts[1].res(reply({ text: "the trends page", lang: "en", conf }));
    await flush();
    expect(sentences).toEqual([]);
    posts[0].res(reply({ text: "Jarvis, show", lang: "en", conf }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  it("(4) an utterance over 10 s takes today's path: no early request, one at the end", async () => {
    const { c, e } = await boot();
    begin(e);
    pause(e, 10_001);
    expect(posts.length).toBe(0);
    expect(e.peeks).toBe(0);
    end(e, 10_001);
    expect(posts.length).toBe(1);
    expect(e.takes).toBe(1);
    c.close();
  });
  it("(4) at 10 s exactly it still goes early", async () => {
    const { c, e } = await boot();
    begin(e);
    pause(e, 10_000);
    expect(posts.length).toBe(1);
    c.close();
  });
  it("(5) unengaged (idle, never woken): no early request; the capped ambient lane at the end, as today", async () => {
    const { c, e } = await boot({ lastTurnAt: () => null });
    begin(e);
    pause(e, 900);
    expect(posts.length).toBe(0);
    expect(e.peeks).toBe(0);
    end(e, 900);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "lane")).toBe("ambient");
    expect(param(posts[0], "engaged")).toBeNull();
    c.close();
  });
  it("(5) a millisecond past the follow-up window: no early request", async () => {
    const { c, e } = await boot({ lastTurnAt: () => Date.now() - ENGAGED_MS - 1 });
    begin(e);
    pause(e, 900);
    expect(posts.length).toBe(0);
    end(e, 900);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "lane")).toBe("ambient");
    c.close();
  });
  it("(5) inside the window it goes (the same test as the captions and the strict gate)", async () => {
    const { c, e } = await boot({ lastTurnAt: () => Date.now() - ENGAGED_MS + 1_000 });
    begin(e);
    pause(e, 900);
    expect(posts.length).toBe(1);
    expect(param(posts[0], "engaged")).toBe("1");
    c.close();
  });
  it("over Jarvis's ducked voice the sentence is read after its end, as today (its words decide the duck)", async () => {
    const { c, e } = await boot();
    mouth.speaking = true; mouth.saying = "an invented answer being read out";
    mouth.hooks.onStart?.("browser", false);
    begin(e);
    expect(c.state).toBe("paused");
    pause(e, 500);
    expect(posts.length).toBe(0);
    c.close();
  });
  it("speech too short to be a sentence (under 250 ms so far) sends nothing early", async () => {
    const { c, e } = await boot();
    begin(e);
    pause(e, 200);
    expect(posts.length).toBe(0);
    c.close();
  });
  it("Esc during the pause, or the microphone closing, aborts the early request; nothing is handed on", async () => {
    const a = await boot();
    begin(a.e);
    pause(a.e, 700);
    a.c.stop();
    expect(posts[0].init.signal?.aborted).toBe(true);
    a.c.close();
    posts = [];
    const b = await boot();
    begin(b.e);
    pause(b.e, 700);
    b.c.close();
    expect(posts[0].init.signal?.aborted).toBe(true);
    expect(b.sentences).toEqual([]);
  });
  it("(6) flag off (NEXT_PUBLIC_JARVIS_EARLY_STT=0): exactly today's behaviour, one request at the end with the whole sentence", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_EARLY_STT", "0");
    const { c, e, sentences } = await boot();
    begin(e);
    pause(e, 600);
    resume(e);
    pause(e, 900);
    expect(posts.length).toBe(0);
    expect(e.peeks).toBe(0);
    end(e, 900);
    expect(posts.length).toBe(1);
    expect(e.takes).toBe(1);
    expect((posts[0].init.body as Blob).size).toBe(2000);
    posts[0].res(reply({ text: "show the trends page", lang: "en", conf }));
    await flush();
    expect(sentences.map((s) => s.text)).toEqual(["show the trends page"]);
    c.close();
  });
  describe("the trace stays honest: zero at the last voiced sample, uploadSent at the request the words came from", () => {
    beforeEach(() => resetTrace());
    it("used early: no turn opens at the pause; at the end it opens at the last voiced sample, with uploadSent at the early upload (before eou)", async () => {
      let clock = 1_000;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      const { c, e, sentences } = await boot();
      begin(e);
      clock = 4_860;
      pause(e, 700, 4_860, 4_700);
      expect(traces().length).toBe(0);
      clock = 5_000;
      end(e, 700, 5_000, 4_700);
      expect(traces().length).toBe(1);
      const t = traces()[0];
      expect(t.zero).toBe(4_700);
      expect(t.at.uploadSent).toBe(4_860);
      expect(t.at.eou).toBe(5_000);
      clock = 5_400;
      posts[0].res(reply({ text: "show the trends page", lang: "en", conf, timing: { sttSent: 4, sttBack: 290 } }));
      await flush();
      expect(t.at.sttSent).toBe(4_864);
      expect(t.at.sttBack).toBe(5_150);
      expect(t.at.hearBack).toBe(5_400);
      expect(sentences[0].trace).toBe(t.n);
      expect(JSON.stringify(traces())).not.toMatch(/trends/);
      c.close();
    });
    it("resumed: uploadSent is the whole utterance's upload at its end, never the aborted one's", async () => {
      let clock = 1_000;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      const { c, e } = await boot();
      begin(e);
      clock = 3_000;
      pause(e, 600, 3_000, 2_840);
      clock = 3_100;
      resume(e);
      clock = 6_000;
      end(e, 1_800, 6_000, 5_700);
      const t = traces()[0];
      expect(traces().length).toBe(1);
      expect(t.zero).toBe(5_700);
      expect(t.at.uploadSent).toBe(6_000);
      c.close();
    });
  });
});
