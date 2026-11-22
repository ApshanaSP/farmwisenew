/**
 * v12 (21 Nov), the conductor after the 06:30-06:45 report (stale-and-double RC1, RC2, RC3, RC9, RC10 and the critic's corrections), in
 * node: the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address gate are real. Invented sentences.
 *  - A line said while a question is in flight that is no request (a filler, a thanks, the name alone, side talk) replaces nothing: no new
 *    sentence, no cancel; a real request is handed on; a continuation ("in Adyar") is joined to the question in flight.
 *  - Nothing cancelled is ever asked again (the old re-ask, backOn, is gone).
 *  - answered(id) belongs to the sentence handed on, not to the machine's generation.
 *  - A transcript for an older sentence has no side effects but opening the call window for the name; onMissed only for the current one.
 *  - A voice asked for and not yet heard is cut when a new request is handed on.
 *  - The wake reply waits for 400 ms of quiet after the name; a request that follows after a shorter pause gets the earcon only.
 *  - Every line let go is reported words-free (onDropped).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void; onRequest?: (ack: boolean) => void }, speaking: false, calls: [] as string[] }));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onQuickOnset?: (w: number) => void; onFrame?: (l: number, h: number) => void; onWakeWord?: (at: number, score: number) => void };
  quietMs: number; inSpeech: boolean;
}
vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false; quietMs = 0; inSpeech = false; wakeWordLive = true;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* open */ }
    stop() { this.live = false; }
    capture() { this.cap = true; }
    drop() { this.cap = false; }
    peek() { return null; }
    take() { if (!this.cap) return null; this.cap = false; return new Blob([new Uint8Array(2000)], { type: "audio/wav" }); }
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
  nowSaying: () => null,
  canContinue: () => false,
  continueAnswer: () => false,
  stopVoice: () => { mouth.calls.push("stop"); const was = mouth.speaking; mouth.speaking = false; if (was) mouth.hooks.onEnd?.(false); },
  duckVoice: () => { mouth.calls.push("duck"); },
  unduckVoice: () => { mouth.calls.push("unduck"); }
}));

import { Conductor, CONTINUE_MS, noRequest, wakeQuietMs, type ConductorHooks, type Dropped, type HeardLine } from "./conductor";

interface Post { res: (r: Response) => void }
let posts: Post[] = [];
const reply = (text: string) => new Response(JSON.stringify({ text, lang: "en", conf: { speech: 0.97, logprob: -0.2 } }), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  posts = []; mouth.speaking = false; mouth.calls = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [], cancels: number[] = [], dropped: Dropped[] = [], ignored: string[] = [], named: unknown[] = [], wake: unknown[] = [], missed: string[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => cancels.push(1), onIgnored: (t) => ignored.push(t),
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now() - 2000,
    onDropped: (d) => dropped.push(d), onNameOnly: (x) => named.push(x), onWakeReply: (x) => wake.push(x ?? {}), onMissed: (w) => missed.push(w), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, cancels, dropped, ignored, named, wake, missed };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };
/** a sentence said and read back as `text` */
const hear = async (e: FakeEars, text: string, start = 1000) => { say(e, start); posts[posts.length - 1].res(reply(text)); await flush(); };

describe("v12 RC1: a line said while a question is in flight", () => {
  it("that is no request (a filler, a thanks, a greeting) replaces nothing: no new sentence, no cancel, the question stays in flight", async () => {
    for (const w of ["Okay.", "Thank you.", "Thanks a lot", "Hmm.", "Jarvis, are you there?"]) {
      const b = await boot();
      await hear(b.e, "show me the flooded roads");
      expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads"]);
      await hear(b.e, w, 5000);
      expect(b.sentences.length, w).toBe(1);
      expect(b.cancels, w).toEqual([]);
      expect(b.c.state, w).toBe("thinking");
      // its answer still lets the machine go, by its own number
      b.c.answered(b.sentences[0].id);
      expect(b.c.state, w).toBe("listening");
      b.c.close();
    }
  });
  it("the name alone said over it cancels nothing (it only opens the call window)", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, "Jarvis.", 5000);
    expect(b.named.length).toBe(1);
    expect(b.cancels).toEqual([]);
    expect(b.sentences.length).toBe(1);
    expect(b.c.state).toBe("thinking");
    b.c.close();
  });
  it("a real request is handed on (the page replaces the question with it); the machine sends no cancel of its own", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, "show me the severe cases this week", 5000);
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads", "show me the severe cases this week"]);
    expect(b.cancels).toEqual([]);
    b.c.close();
  });
  it("a clip that continues the question in flight (a preposition, a conjunction, an article) is joined to it and handed on whole", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, "in Adyar zone", 5000);
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads", "show me the flooded roads in Adyar zone"]);
    b.c.close();
  });
  it("never joined: a remark of its own, a fresh request, or a clip begun past CONTINUE_MS", async () => {
    const a = await boot();
    await hear(a.e, "show me the flooded roads");
    await hear(a.e, "what about the drains", 5000);
    expect(a.sentences.at(-1)?.text).toBe("what about the drains");
    a.c.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    vi.setSystemTime(Date.now() + CONTINUE_MS + 500);
    await hear(b.e, "in Adyar zone", 5000);
    expect(b.sentences.at(-1)?.text).toBe("in Adyar zone");
    b.c.close();
  });
  it("noRequest: backchannels, fillers, a thanks, praise and a greeting; never a request", () => {
    for (const t of ["okay", "Mm-hmm.", "சரி", "thank you", "Okay thanks.", "good job", "Hi Jarvis"]) expect(noRequest(t), t).toBe(true);
    for (const t of ["show me the traffic", "okay show the traffic", "thanks, now open trends", "what can you do"]) expect(noRequest(t), t).toBe(false);
    // over the voice a greeting is a call (the name alone holds the voice there): not dropped
    expect(noRequest("Hi Jarvis", { greeting: false })).toBe(false);
  });
  it("over Jarvis's voice: a thanks leaves the answer playing (ducked, then back up); a greeting with the name is handed on as a call", async () => {
    const over = async (w: string) => {
      const b = await boot();
      mouth.speaking = true;
      mouth.hooks.onStart?.("browser", false);
      b.e.hooks.onQuickOnset?.(0);
      b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
      b.e.hooks.onVad({ type: "end", at: 5700, ms: 400, short: false, strong: 400 }, 0);
      posts.at(-1)!.res(reply(w));
      await flush();
      return b;
    };
    const t = await over("Thank you.");
    expect(t.sentences).toEqual([]);
    expect(mouth.calls).toContain("unduck");
    expect(mouth.calls).not.toContain("stop");
    expect(t.c.state).toBe("speaking");
    t.c.close();
    mouth.calls = [];
    const g = await over("Jarvis, are you there?");
    expect(g.sentences.length).toBe(1);
    expect(mouth.calls).toContain("stop");
    g.c.close();
    // ("Hi Jarvis" alone is the name alone: it stops the voice and listens, as before)
    mouth.calls = [];
    const n = await over("Hi Jarvis.");
    expect(n.named.length).toBe(1);
    expect(mouth.calls).toContain("stop");
    n.c.close();
  });
});

describe("v12 RC2: nothing cancelled is ever asked again", () => {
  it("speech held long over a question in flight, then side talk: the question is neither cancelled nor sent again", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    // (900 ms of speech: before v12 the tick at 200 ms cancelled the question and a gated-away line asked it again, as `again`)
    b.e.hooks.onFrame?.(0.5, 900);
    b.e.hooks.onVad({ type: "end", at: 6200, ms: 900, short: false }, 0);
    posts.at(-1)!.res(reply("he said the contractor will finish the drain work by Friday"));
    await flush();
    expect(b.cancels).toEqual([]);
    expect(b.sentences.length).toBe(1);
    expect((b.sentences[0] as unknown as { again?: boolean }).again).toBeUndefined();
    b.c.close();
  });
});

describe("v12 RC10: answered(id) belongs to the sentence handed on", () => {
  it("an older sentence finishing late lets nothing go while a newer one is handled", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, "show me the severe cases this week", 5000);
    b.c.answered(b.sentences[0].id);
    expect(b.c.state).toBe("thinking");
    b.c.answered(b.sentences[1].id);
    expect(b.c.state).toBe("listening");
    b.c.close();
  });
  it("a backchannel over the acknowledgement moves the generation on, and the finished sentence still lets the machine go", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    const gen0 = b.c.generation;
    mouth.speaking = true;
    mouth.hooks.onStart?.("browser", true);
    b.e.hooks.onQuickOnset?.(0);
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    b.e.hooks.onVad({ type: "end", at: 5600, ms: 300, short: false, strong: 300 }, 0);
    posts.at(-1)!.res(reply("mm-hmm"));
    await flush();
    mouth.speaking = false;
    mouth.hooks.onEnd?.(true);
    expect(b.c.generation).toBeGreaterThan(gen0);
    expect(b.c.state).toBe("thinking");
    b.c.answered(b.sentences[0].id);
    expect(b.c.state).toBe("listening");
    b.c.close();
  });
});

describe("v12 RC9: a transcript for an older sentence has no side effects", () => {
  type Inner = { accept(t: string, l: "en" | "ta", g: number, s: "whisper", c: number): void; finish(r: unknown): void; inWindow(now?: number): boolean };
  it("a late cut-off line is not held, the name alone is not answered (it still opens the call window), onMissed only for the current sentence", async () => {
    const b = await boot({ lastTurnAt: () => null });
    const c = b.c as unknown as Inner;
    say(b.e, 1000);
    const old = b.c.generation - 1;
    c.accept("Tell me about the", "en", old, "whisper", 0.9);
    expect(b.ignored).toEqual([]);
    expect(b.dropped).toEqual([]);
    expect(c.inWindow()).toBe(false);
    c.accept("Jarvis.", "en", old, "whisper", 0.9);
    expect(b.named).toEqual([]);
    expect(c.inWindow()).toBe(true);
    c.finish({ gen: old, delivered: false, lane: "engaged", out: { j: null, own: "timeout" } });
    expect(b.missed).toEqual([]);
    c.finish({ gen: b.c.generation, delivered: false, lane: "engaged", out: { j: null, own: "timeout" } });
    expect(b.missed).toEqual(["timeout"]);
    b.c.close();
  });
});

describe("v12 RC3: a voice asked for and not yet heard", () => {
  it("is cut when a new request is handed on", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    // the answer went to the voice (the page's out()), and the machine was let go before any sound
    mouth.speaking = true;
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    expect(b.c.state).toBe("listening");
    mouth.calls = [];
    await hear(b.e, "show me the severe cases this week", 5000);
    expect(mouth.calls).toContain("stop");
    expect(b.sentences.length).toBe(2);
    b.c.close();
  });
});

describe("v12: the wake reply (the critic: \"Yes?\" played over the start of the request)", () => {
  const frame = (e: FakeEars) => e.hooks.onFrame?.(0.1, 0);
  it("waits for 400 ms of quiet (was 90)", async () => {
    expect(wakeQuietMs(undefined)).toBe(400);
    expect(wakeQuietMs("150")).toBe(150);
    const b = await boot();
    b.e.inSpeech = true; b.e.quietMs = 0;
    b.e.hooks.onWakeWord?.(performance.now(), 0.95);
    b.e.quietMs = 200; frame(b.e);
    expect(b.wake).toEqual([]);
    b.e.quietMs = 400; frame(b.e);
    expect(b.wake).toEqual([{}]);
    b.c.close();
  });
  it("a sentence the detector already ended counts its quiet from the last voiced sample, not from its end", async () => {
    const b = await boot();
    b.e.inSpeech = true;
    b.e.hooks.onWakeWord?.(performance.now(), 0.95);
    b.e.inSpeech = false;
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 600, short: false }, performance.now(), performance.now());
    frame(b.e);
    expect(b.wake).toEqual([]);
    b.c.close();
  });
  it("the request follows the name after a short pause: the earcon only, never \"Yes?\" over it", async () => {
    const b = await boot();
    b.e.inSpeech = true; b.e.quietMs = 0;
    b.e.hooks.onWakeWord?.(performance.now(), 0.95);
    b.e.quietMs = 200; frame(b.e);
    b.e.quietMs = 0; frame(b.e);
    expect(b.wake).toEqual([{ tone: true }]);
    b.e.quietMs = 500; frame(b.e);
    expect(b.wake).toEqual([{ tone: true }]);
    b.c.close();
  });
});

describe("v12: every line let go is reported, words-free", () => {
  it("side talk and a line over a question in flight carry their code, language, confidence and lane, and no words", async () => {
    const b = await boot();
    await hear(b.e, "he said the contractor will finish the drain work by Friday");
    expect(b.dropped.length).toBe(1);
    // (v13, review 1-9: and `busy`, whether a question was in flight or Jarvis was talking, so the page gives no "I didn't catch that" then)
    expect(Object.keys(b.dropped[0]).sort()).toEqual(["busy", "called", "conf", "engaged", "lang", "why"]);
    expect(b.dropped[0].busy).toBe(false);
    expect(b.dropped[0].lang).toBe("en");
    expect(b.dropped[0].engaged).toBe(true);
    expect(b.dropped[0].conf).toBeGreaterThan(0.5);
    expect(JSON.stringify(b.dropped[0])).not.toMatch(/contractor/);
    await hear(b.e, "show me the flooded roads", 4000);
    await hear(b.e, "Jarvis, thank you.", 7000);
    expect(b.dropped.at(-1)?.why).toBe("over-turn");
    b.c.close();
  });
});
