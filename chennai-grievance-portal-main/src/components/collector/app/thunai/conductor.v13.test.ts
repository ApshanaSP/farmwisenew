/**
 * v13 (21 Nov), the conductor after the adversarial review of v12 (review 1, findings 0, 1, 2, 3, 9, 10, 11 and 13), in node: the microphone
 * (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address gate are real. Invented sentences.
 *  - Speech over the spoken acknowledgement never cancels its question ("okay thank you Jarvis" over "On it.").
 *  - A continuation said over the acknowledgement is joined to its question; a fresh question after "and" or "a" never is.
 *  - "Sorry.", "Excuse me.", "Huh?", "Ahem." while Jarvis thinks replace nothing; "Sorry, one second." holds.
 *  - "Okay." said while Jarvis thinks and read after the answer landed is still dropped, and the answer's voice is not stopped.
 *  - An answer's voice that began under the Collector is cut, not its turn; "Thank you Jarvis" then brings the answer back.
 *  - A dropped line says whether a question was in flight (`busy`).
 *  - A request begun over the wake reply stops it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({
  hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void; onRequest?: (ack: boolean) => void; onWakeSound?: (ms: number) => void },
  speaking: false, calls: [] as string[], canContinue: false
}));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onQuickOnset?: (w: number) => void; onFrame?: (l: number, h: number) => void };
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
  canContinue: () => mouth.canContinue,
  continueAnswer: () => { mouth.calls.push("continue"); const ok = mouth.canContinue; mouth.canContinue = false; return ok; },
  stopVoice: () => { mouth.calls.push("stop"); const was = mouth.speaking; mouth.speaking = false; if (was) mouth.hooks.onEnd?.(false); },
  duckVoice: () => { mouth.calls.push("duck"); },
  unduckVoice: () => { mouth.calls.push("unduck"); },
  stopWakeReply: () => { mouth.calls.push("stopWake"); return true; }
}));

import { Conductor, noRequest, onlyNoise, startsNoTurn, type ConductorHooks, type Dropped, type HeardLine } from "./conductor";

interface Post { res: (r: Response) => void }
let posts: Post[] = [];
const reply = (text: string) => new Response(JSON.stringify({ text, lang: "en", conf: { speech: 0.97, logprob: -0.2 } }), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  posts = []; mouth.speaking = false; mouth.calls = []; mouth.canContinue = false;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [], cancels: number[] = [], dropped: Dropped[] = [], states: string[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => cancels.push(1), onIgnored: () => undefined,
    onState: (s) => states.push(s), rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now() - 2000,
    onDropped: (d) => dropped.push(d), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences, cancels, dropped, states };
}
const say = (e: FakeEars, start: number, ms = 700) => { e.hooks.onVad({ type: "start", at: start }, 0); e.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };
const hear = async (e: FakeEars, text: string, start = 1000) => { say(e, start); posts[posts.length - 1].res(reply(text)); await flush(); };
/** the acknowledgement ("On it.") starts for the question in flight */
const ack = () => { mouth.speaking = true; mouth.hooks.onStart?.("browser", true); };
/** speech over the voice: the energy gate's onset, Silero's, then its end after `ms` (its strong part as long) */
const over = (e: FakeEars, ms: number, held = 0) => {
  e.hooks.onQuickOnset?.(0);
  e.hooks.onVad({ type: "start", at: 5000 }, 0);
  if (held) e.hooks.onFrame?.(0.5, held);
  e.hooks.onVad({ type: "end", at: 5000 + ms + 300, ms, short: false, strong: ms }, 0);
};

describe("v13 review 1-0: speech over the acknowledgement", () => {
  it("\"okay thank you Jarvis\" held over it stops the voice only: no cancel, no new sentence, the question's answer still lets the machine go", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    ack();
    over(b.e, 900, 700);
    expect(mouth.calls).toContain("stop");
    posts.at(-1)!.res(reply("okay thank you Jarvis"));
    await flush();
    expect(b.cancels).toEqual([]);
    expect(b.sentences.length).toBe(1);
    expect(b.c.state).toBe("thinking");
    b.c.answered(b.sentences[0].id);
    expect(b.c.state).toBe("listening");
    b.c.close();
  });
  it("\"Wait.\" or the name alone over it: Jarvis holds and listens, and the question is not cancelled", async () => {
    for (const w of ["Wait.", "Jarvis."]) {
      const b = await boot();
      await hear(b.e, "show me the flooded roads");
      ack();
      over(b.e, 400);
      posts.at(-1)!.res(reply(w));
      await flush();
      expect(b.cancels, w).toEqual([]);
      expect(b.c.state, w).toBe("holding");
      expect(b.sentences.length, w).toBe(1);
      b.c.close();
    }
  });
});

describe("v13 review 1-3 and 1-13: the continuation join", () => {
  it("a continuation said over the acknowledgement is joined to its question and handed on whole, with no cancel", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    ack();
    over(b.e, 400);
    posts.at(-1)!.res(reply("in Adyar zone"));
    await flush();
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads", "show me the flooded roads in Adyar zone"]);
    expect(b.cancels).toEqual([]);
    b.c.close();
  });
  it("a fresh question after \"and\" or \"a\" is never glued on; a phrase's tail still is", async () => {
    for (const [fresh, joined] of [["And where are the flooded roads?", false], ["a different question: how many cases came in", false], ["and show the drains", false], ["and the drains", true]] as const) {
      const b = await boot();
      await hear(b.e, "show me the flooded roads");
      await hear(b.e, fresh, 5000);
      const last = b.sentences.at(-1)?.text ?? "";
      expect(b.sentences.length, fresh).toBe(2);
      if (joined) expect(last, fresh).toBe(`show me the flooded roads ${fresh}`);
      else expect(last, fresh).toBe(fresh);
      b.c.close();
    }
  });
});

describe("v13 review 1-2: an apology or a throat-clear while Jarvis thinks", () => {
  it("replaces nothing: no new sentence, no cancel, the question in flight", async () => {
    for (const w of ["Sorry.", "Excuse me.", "Huh?", "Ahem.", "Oh, sorry.", "(coughs)", "Sorry Jarvis"]) {
      const b = await boot();
      await hear(b.e, "show me the flooded roads");
      await hear(b.e, w, 5000);
      expect(b.sentences.length, w).toBe(1);
      expect(b.cancels, w).toEqual([]);
      expect(b.c.state, w).toBe("thinking");
      b.c.close();
    }
  });
  it("\"Sorry, one second.\" holds, with the question still in flight", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    await hear(b.e, "Sorry, one second.", 5000);
    expect(b.sentences.length).toBe(1);
    expect(b.cancels).toEqual([]);
    expect(b.c.state).toBe("holding");
    b.c.close();
  });
  it("onlyNoise and noRequest: apologies, attention words and bracketed sounds; never a request", () => {
    for (const t of ["Sorry.", "Excuse me.", "Huh?", "Ahem.", "I'm so sorry", "Excuse me, sorry", "hmm sorry", "(coughs)", "[cough]", "மன்னிக்கவும்"]) {
      expect(onlyNoise(t), t).toBe(true);
      expect(noRequest(t), t).toBe(true);
    }
    for (const t of ["Excuse me, show me the traffic", "sorry, what about Adyar", "Sorry, one second.", "show me", "the drains"]) expect(onlyNoise(t), t).toBe(false);
  });
  it("startsNoTurn: a lone backchannel or an apology; never a greeting, a thanks or praise", () => {
    for (const t of ["Okay.", "Mm-hmm.", "சரி", "Yes.", "Sorry."]) expect(startsNoTurn(t), t).toBe(true);
    for (const t of ["Hi Jarvis", "Thank you.", "Nice.", "okay show trends", "Okay Jarvis"]) expect(startsNoTurn(t), t).toBe(false);
  });
});

describe("v13 review 1-1: \"Okay.\" said while Jarvis thinks, read after the answer landed", () => {
  it("is still dropped, and the answer's voice is not stopped", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    say(b.e, 5000, 400);
    // the answer lands while "Okay." is at the transcriber: the page's out() asks for its voice, handle() resolves, the voice starts
    mouth.hooks.onRequest?.(false);
    b.c.answered(b.sentences[0].id);
    mouth.speaking = true;
    mouth.hooks.onStart?.("browser", false);
    mouth.calls = [];
    posts.at(-1)!.res(reply("Okay."));
    await flush();
    expect(b.sentences.length).toBe(1);
    expect(mouth.calls).not.toContain("stop");
    expect(b.c.state).toBe("speaking");
    b.c.close();
  });
  it("a request read then is still handed on (and stops the older voice)", async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    say(b.e, 5000, 400);
    b.c.answered(b.sentences[0].id);
    mouth.speaking = true;
    mouth.hooks.onStart?.("browser", false);
    posts.at(-1)!.res(reply("show me the severe cases this week"));
    await flush();
    expect(b.sentences.length).toBe(2);
    expect(mouth.calls).toContain("stop");
    b.c.close();
  });
});

describe("v13 review 1-10: an answer's voice that began under the Collector", () => {
  const under = async () => {
    const b = await boot();
    await hear(b.e, "show me the flooded roads");
    // the Collector is talking when the answer's voice starts: it is ducked, then cut once the speech is held 800 ms
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    mouth.speaking = true;
    mouth.hooks.onStart?.("browser", false);
    mouth.canContinue = true;
    b.e.hooks.onFrame?.(0.5, 850);
    b.e.hooks.onVad({ type: "end", at: 6500, ms: 1200, short: false }, 0);
    return b;
  };
  it("is cut, not its turn; \"Thank you Jarvis\" then brings the answer back from its chunk (no \"You're welcome\")", async () => {
    const b = await under();
    expect(mouth.calls).toContain("stop");
    expect(b.cancels).toEqual([]);
    posts.at(-1)!.res(reply("Thank you Jarvis."));
    await flush();
    expect(b.sentences.length).toBe(1);
    expect(mouth.calls).toContain("continue");
    expect(b.c.state).toBe("speaking");
    b.c.close();
  });
  it("a request said over it is handed on", async () => {
    const b = await under();
    posts.at(-1)!.res(reply("show me the severe cases this week"));
    await flush();
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads", "show me the severe cases this week"]);
    expect(mouth.calls).not.toContain("continue");
    b.c.close();
  });
});

describe("v13 review 1-9: a dropped line says whether a question was in flight", () => {
  it("side talk while Jarvis thinks is busy; with nothing in flight it is not", async () => {
    const b = await boot();
    await hear(b.e, "he said the contractor will finish the drain work by Friday");
    expect(b.dropped.at(-1)?.busy).toBe(false);
    await hear(b.e, "show me the flooded roads", 3000);
    await hear(b.e, "he said the contractor will finish the drain work by Friday", 6000);
    expect(b.dropped.at(-1)?.busy).toBe(true);
    b.c.close();
  });
});

describe("v13 review 1-11: a request begun over the wake reply stops it", () => {
  it("Silero's onset while the reply sounds stops it; after it, or with none, nothing is stopped", async () => {
    const b = await boot();
    mouth.hooks.onWakeSound?.(1000);
    b.e.hooks.onVad({ type: "start", at: 100 }, 0);
    expect(mouth.calls).toEqual(["stopWake"]);
    b.e.hooks.onVad({ type: "end", at: 900, ms: 500, short: false }, 0);
    mouth.calls = [];
    // stopped once: the next onset stops nothing
    b.e.hooks.onVad({ type: "start", at: 2000 }, 0);
    expect(mouth.calls).not.toContain("stopWake");
    b.e.hooks.onVad({ type: "end", at: 2900, ms: 500, short: false }, 0);
    // a reply that has already ended
    mouth.hooks.onWakeSound?.(0);
    b.e.hooks.onVad({ type: "start", at: 4000 }, 0);
    expect(mouth.calls).not.toContain("stopWake");
    b.c.close();
  });
});
