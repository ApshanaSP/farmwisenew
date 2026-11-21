/**
 * v14 (21 Nov), the conductor after the adversarial review of v13 (lens "turns" findings 0, 1, 5 and 6; lens "scenarios" finding 2), in node:
 * the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address gate are real. Invented sentences only.
 *  - turns 0: "Okay." or "Sorry." begun while Jarvis thinks and ended after the answer landed (its voice asked for, or already playing), or said
 *    wholly after the answer's text before its voice: dropped, and the answer's voice is never stopped for it.
 *  - turns 1: after a barge-in over the acknowledgement, the answer's voice that begins under the Collector is ducked; "okay thank you Jarvis"
 *    brings it back up (no "Yes?"), a request stops it.
 *  - turns 5: a tail that points back at the question in flight ("and how many are there?") is joined to it again; a fresh one is not.
 *  - turns 6: "Sorry?", "Pardon?", "Huh?", "Excuse me?" ask to hear the answer again (asksAgain); "Sorry." and "Ahem?" do not.
 *  - scenarios 2: replyWhenQuiet, the closed device wake with no recogniser: the reply waits for the quiet on these ears, read from the first
 *    live frame after the hand-over, and gives up when the request follows straight on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars, pre: 0 }));
const mouth = vi.hoisted(() => ({
  hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void; onRequest?: (ack: boolean) => void },
  speaking: false, calls: [] as string[], canContinue: false
}));
interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onQuickOnset?: (w: number) => void; onFrame?: (l: number, h: number) => void };
  quietMs: number; inSpeech: boolean;
}
vi.mock("./ears", () => {
  class Ears {
    hooks: { onFrame?: (l: number, h: number) => void }; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false; quietMs = 0; inSpeech = false; wakeWordLive = true;
    private cap = false;
    constructor(h: { onFrame?: (l: number, h: number) => void }) { this.hooks = h; box.e = this as unknown as FakeEars; }
    // the parked wake listener's frames go through the detectors while the ears start (ears.ts Ears.start, after its awaits), all at one moment
    async start() { await Promise.resolve(); for (let i = 0; i < box.pre; i++) this.hooks.onFrame?.(0.1, 0); }
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
  canContinue: () => mouth.canContinue,
  continueAnswer: () => { mouth.calls.push("continue"); const ok = mouth.canContinue; mouth.canContinue = false; return ok; },
  stopVoice: () => { mouth.calls.push("stop"); const was = mouth.speaking; mouth.speaking = false; if (was) mouth.hooks.onEnd?.(false); },
  duckVoice: () => { mouth.calls.push("duck"); },
  unduckVoice: () => { mouth.calls.push("unduck"); },
  stopWakeReply: () => { mouth.calls.push("stopWake"); return true; }
}));

import { asksAgain, Conductor, freshTail, WAKE_REPLY_GIVE_UP_MS, wakeQuietMs, type ConductorHooks, type HeardLine } from "./conductor";

interface Post { res: (r: Response) => void }
let posts: Post[] = [];
const reply = (text: string) => new Response(JSON.stringify({ text, lang: "en", conf: { speech: 0.97, logprob: -0.2 } }), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  posts = []; mouth.speaking = false; mouth.calls = []; mouth.canContinue = false; box.pre = 0;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [], dropped: string[] = [], names: unknown[] = [], replies: unknown[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now() - 2000,
    onDropped: (d) => dropped.push(d.why), onNameOnly: (x) => names.push(x ?? true), onWakeReply: (x) => replies.push(x ?? "reply"), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, dropped, names, replies };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };
const hear = async (e: FakeEars, text: string, start = 1000) => { say(e, start); posts[posts.length - 1].res(reply(text)); await flush(); };
const texts = (b: { sentences: HeardLine[] }) => b.sentences.map((s) => s.text);

describe("v14 turns 0: a lone 'Okay.' or 'Sorry.' never stops the answer's voice", () => {
  for (const word of ["Okay.", "Sorry."]) {
    it(`'${word}' begun while thinking, ended after the answer landed (its voice asked for): dropped, the voice untouched`, async () => {
      const b = await boot();
      await hear(b.e, "show me the flooded roads");
      b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
      mouth.hooks.onRequest?.(false);
      b.c.answered(b.sentences[0].id);
      mouth.calls = [];
      b.e.hooks.onVad({ type: "end", at: 5700, ms: 400, short: false }, 0);
      posts.at(-1)!.res(reply(word));
      await flush();
      expect(texts(b)).toEqual(["show me the flooded roads"]);
      expect(mouth.calls).not.toContain("stop");
      expect(b.dropped).toContain("over-turn");
      b.c.close();
    });
  }
  it("the same when the voice starts while 'Okay.' is at the transcriber: it plays on", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    b.e.hooks.onVad({ type: "end", at: 5700, ms: 400, short: false }, 0);
    mouth.speaking = true; mouth.hooks.onStart?.("pcm", false);
    mouth.calls = [];
    posts.at(-1)!.res(reply("Okay."));
    await flush();
    expect(texts(b)).toEqual(["show me the flooded roads"]);
    expect(mouth.calls).not.toContain("stop");
    expect(b.c.state).toBe("speaking");
    b.c.close();
  });
  it("said wholly after the answer's text, before its voice starts: dropped too, never handed on to cut that voice", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    mouth.calls = [];
    await hear(b.e, "Okay.", 6000);
    expect(texts(b)).toEqual(["show me the flooded roads"]);
    expect(mouth.calls).not.toContain("stop");
    b.c.close();
  });
  it("a real request said then still stops the older voice and is handed on (v12 RC3 stands)", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    mouth.calls = [];
    await hear(b.e, "show the severe cases in Adyar", 6000);
    expect(texts(b)).toEqual(["show me the flooded roads", "show the severe cases in Adyar"]);
    expect(mouth.calls).toContain("stop");
    b.c.close();
  });
  it("with a yes awaited, the 'Okay.' is its answer and is handed on", async () => {
    const b = await boot({ wantsYes: () => true });
    await hear(b.e, "show me the flooded roads");
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    await hear(b.e, "Okay.", 6000);
    expect(texts(b)).toEqual(["show me the flooded roads", "Okay."]);
    b.c.close();
  });
});

describe("v14 turns 1: an answer that begins under the barge-in over the acknowledgement", () => {
  async function barged() {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    mouth.speaking = true; mouth.hooks.onStart?.("browser", true);
    b.e.hooks.onQuickOnset?.(0);
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    b.e.hooks.onFrame?.(0.5, 700);
    expect(mouth.calls).toContain("stop");
    // the answer lands while the Collector is still talking, and its voice starts
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    mouth.calls = [];
    mouth.speaking = true; mouth.canContinue = true; mouth.hooks.onStart?.("pcm", false);
    return b;
  }
  it("its voice is ducked at once; 'okay thank you Jarvis' brings it back up: no 'Yes?', never stopped", async () => {
    const b = await barged();
    expect(mouth.calls).toEqual(["duck"]);
    b.e.hooks.onVad({ type: "end", at: 6600, ms: 1300, short: false, strong: 1300 }, 0);
    expect(mouth.calls).not.toContain("stop");
    posts.at(-1)!.res(reply("okay thank you Jarvis"));
    await flush();
    expect(b.names).toEqual([]);
    expect(mouth.calls).not.toContain("stop");
    expect(mouth.calls).toContain("unduck");
    expect(b.c.state).toBe("speaking");
    expect(texts(b)).toEqual(["show me the flooded roads"]);
    b.c.close();
  });
  it("a request said over it stops it and is handed on", async () => {
    const b = await barged();
    b.e.hooks.onVad({ type: "end", at: 6600, ms: 1300, short: false, strong: 1300 }, 0);
    posts.at(-1)!.res(reply("show trends for Adyar"));
    await flush();
    expect(mouth.calls).toContain("stop");
    expect(texts(b)).toEqual(["show me the flooded roads", "show trends for Adyar"]);
    b.c.close();
  });
});

describe("v14 turns 5: a tail that points back is joined to the question in flight", () => {
  // ("and which of them are open?" is not fresh either, but the address gate takes that line for side talk, joined or not: freshTail below)
  const joined = ["and how many are there?", "and is it worse there?", "the new ones in Adyar", "and how many?", "and the drains", "in Adyar zone"];
  for (const tail of joined) it(`'${tail}' is the question's rest`, async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, tail, 2500);
    expect(texts(b)).toHaveLength(2);
    expect(texts(b)[1]).toBe(`show me the flooded roads ${tail}`);
    b.c.close();
  });
  for (const tail of ["And where are the flooded roads?", "and show the drains", "A different question: what is the weather there?", "and a new question, the reservoirs"]) it(`'${tail}' is fresh (v13 stands)`, () => {
    expect(freshTail(tail)).toBe(true);
  });
  it("the back-referring and bare forms are not fresh", () => {
    for (const t of [...joined, "and which of them are open?", "and show them on the map", "and what about those?"]) expect(freshTail(t)).toBe(false);
  });
});

describe("v14 turns 6: asking to hear it again", () => {
  it.each(["Sorry?", "Pardon?", "Huh?", "Excuse me?", "Pardon me?", "Sorry Jarvis?", "மன்னிக்கவும்?"])("'%s' asks again", (t) => expect(asksAgain(t)).toBe(true));
  it.each(["Sorry.", "Excuse me.", "Ahem?", "Oops?", "Okay?", "Sorry, show the drains?", "(coughs)"])("'%s' does not", (t) => expect(asksAgain(t)).toBe(false));
});

describe("v14 scenarios 2: the closed device wake with no recogniser leaves the reply to the quiet here", () => {
  it("no ears, no arming: the page replies at once", () => {
    const c = new Conductor({ hearUrl: () => "", siteLang: () => "en", onSentence: () => undefined, cancelTurn: () => undefined, onIgnored: () => undefined, onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => null } as ConductorHooks);
    expect(c.replyWhenQuiet()).toBe(false);
  });
  it("armed while the ears take the parked audio over: nothing during the hand-over's frames; the reply once the quiet is reached", async () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    box.pre = 5;
    const r: unknown[] = [];
    const c = new Conductor({ hearUrl: () => "", siteLang: () => "en", onSentence: () => undefined, cancelTurn: () => undefined, onIgnored: () => undefined, onState: () => undefined,
      rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => null, onWakeReply: (x) => r.push(x ?? "reply") } as ConductorHooks);
    const opening = c.open();
    expect(c.replyWhenQuiet()).toBe(true);
    vi.advanceTimersByTime(wakeQuietMs() + 100);
    await opening;
    // the hand-over's frames came while starting: no reply from them
    expect(r).toEqual([]);
    const e = box.e!;
    e.inSpeech = false;
    e.hooks.onFrame?.(0.1, 0);
    expect(r).toEqual(["reply"]);
    c.close();
  });
  it("speech straight on after the name: no reply while it lasts, none at all past the give-up (the answer is the reply)", async () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    const b = await boot();
    expect(b.c.replyWhenQuiet()).toBe(true);
    b.e.inSpeech = true; b.e.quietMs = 0;
    b.e.hooks.onFrame?.(0.1, 0);
    vi.advanceTimersByTime(200);
    b.e.hooks.onFrame?.(0.1, 0);
    expect(b.replies).toEqual([]);
    vi.advanceTimersByTime(WAKE_REPLY_GIVE_UP_MS + 50);
    b.e.hooks.onFrame?.(0.1, 0);
    b.e.quietMs = wakeQuietMs();
    b.e.hooks.onFrame?.(0.1, 0);
    expect(b.replies).toEqual([]);
    b.c.close();
  });
  it("a pause of the wake's quiet after the name: the spoken reply", async () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    const b = await boot();
    b.c.replyWhenQuiet();
    b.e.inSpeech = false;
    b.e.hooks.onFrame?.(0.1, 0);
    vi.advanceTimersByTime(wakeQuietMs() - 50);
    b.e.hooks.onFrame?.(0.1, 0);
    expect(b.replies).toEqual([]);
    vi.advanceTimersByTime(60);
    b.e.hooks.onFrame?.(0.1, 0);
    expect(b.replies).toEqual(["reply"]);
    b.c.close();
  });
});
