/**
 * v16 (22 Nov, the owner: "the voice reply is very late, delayed. It's overlapping."), the conductor's floor (floorHeld), in node: the
 * microphone (./ears) and the voice (./mouth) are stand-ins, the turn machine and the address gate are real. The mouth asks floorHeld before a
 * speech starts (mouth.ts floorFree): the Collector holds the floor while speech is heard and while a sentence of theirs is at the transcriber.
 * Invented sentences only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({
  hooks: {} as { onStart?: (p: string, ack: boolean) => void; onEnd?: (ack: boolean) => void; onRequest?: (ack: boolean) => void; floorHeld?: () => boolean },
  speaking: false, calls: [] as string[]
}));
interface FakeEars { hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void } }
vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false; quietMs = 0; inSpeech = false; wakeWordLive = true;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { await Promise.resolve(); }
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
  unduckVoice: () => { mouth.calls.push("unduck"); },
  stopWakeReply: () => true
}));

import { Conductor, type ConductorHooks, type HeardLine } from "./conductor";

let posts: { res: (r: Response) => void }[] = [];
const reply = (text: string) => new Response(JSON.stringify({ text, lang: "en", conf: { speech: 0.97, logprob: -0.2 } }), { status: 200 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  posts = []; mouth.speaking = false; mouth.calls = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const sentences: HeardLine[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => Date.now() - 2000, ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, sentences };
}
const floor = () => mouth.hooks.floorHeld?.() ?? false;

describe("v16: the Collector's floor", () => {
  it("the mouth is given the floor: free when nothing is said, held while speech is heard and while its words are at the transcriber", async () => {
    const b = await boot();
    expect(typeof mouth.hooks.floorHeld).toBe("function");
    expect(floor()).toBe(false);
    b.e.hooks.onVad({ type: "start", at: 1000 }, 0);
    expect(floor()).toBe(true);
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    // the sentence ended, its words are not in yet
    expect(posts.length).toBe(1);
    expect(floor()).toBe(true);
    posts[0].res(reply("show me the flooded roads"));
    await flush();
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads"]);
    expect(floor()).toBe(false);
    b.c.close();
    expect(floor()).toBe(false);
  });

  it("an answer's voice asked for while the Collector says 'Okay.': held until those words are in, then free, and the voice is not stopped", async () => {
    const b = await boot();
    b.e.hooks.onVad({ type: "start", at: 1000 }, 0);
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    posts[0].res(reply("show me the flooded roads"));
    await flush();
    // the answer's voice is asked for as the Collector begins a backchannel
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    mouth.hooks.onRequest?.(false);
    expect(floor()).toBe(true);
    b.e.hooks.onVad({ type: "end", at: 5600, ms: 400, short: false }, 0);
    expect(floor()).toBe(true);
    mouth.calls = [];
    posts.at(-1)!.res(reply("Okay."));
    await flush();
    expect(floor()).toBe(false);
    expect(mouth.calls).not.toContain("stop");
    b.c.close();
  });

  it("a request said then: the voice asked for is stopped as it is handed on, so the old answer is never heard over the new question", async () => {
    const b = await boot();
    b.e.hooks.onVad({ type: "start", at: 1000 }, 0);
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    posts[0].res(reply("show me the flooded roads"));
    await flush();
    b.e.hooks.onVad({ type: "start", at: 5000 }, 0);
    mouth.hooks.onRequest?.(false);
    b.e.hooks.onVad({ type: "end", at: 6500, ms: 1200, short: false }, 0);
    mouth.calls = [];
    posts.at(-1)!.res(reply("show the severe cases in Adyar"));
    await flush();
    expect(b.sentences.map((s) => s.text)).toEqual(["show me the flooded roads", "show the severe cases in Adyar"]);
    expect(mouth.calls).toContain("stop");
    expect(floor()).toBe(false);
    b.c.close();
  });
});
