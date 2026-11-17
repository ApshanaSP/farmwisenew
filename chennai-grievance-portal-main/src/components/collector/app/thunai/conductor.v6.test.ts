/**
 * The conductor's v6 wake word, in node: the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address
 * gate are real. No model and no network. Sentences are invented.
 *  - "Hey Jarvis" from the on-device wake word engages at once and tells the console (the HUD reacts now).
 *  - The spoken reply waits for the Collector to pause (WAKE_QUIET_MS of quiet, or the sentence ended), and never comes when the request
 *    follows straight on for longer than WAKE_REPLY_GIVE_UP_MS, nor over Jarvis's own voice.
 *  - The same call's transcript ("hey jarvis", name only) comes back marked as already answered, so nothing is said twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEars }));
const mouth = vi.hoisted(() => ({ hooks: {} as Record<string, unknown>, speaking: false }));

interface FakeEars {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void; onFrame?: (l: number, h: number) => void; onWakeWord?: (at: number, score: number) => void };
  quietMs: number; inSpeech: boolean; wakeWordLive: boolean;
}
vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; needsGesture = false; echoMode = "on"; echo = false;
    quietMs = 0; inSpeech = false; wakeWordLive = true;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEars; }
    async start() { /* open */ }
    stop() { this.live = false; }
    capture() { this.cap = true; }
    drop() { this.cap = false; }
    get capturing() { return this.cap; }
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
  setMouthHooks: (h: Record<string, unknown>) => { mouth.hooks = h; },
  speaking: () => mouth.speaking,
  nowSaying: () => null,
  canContinue: () => false,
  continueAnswer: () => false,
  stopVoice: () => { mouth.speaking = false; },
  duckVoice: () => undefined,
  unduckVoice: () => undefined
}));

import { Conductor, wakeQuietMs, WAKE_REPLY_GIVE_UP_MS, type ConductorHooks } from "./conductor";
const WAKE_QUIET_MS = wakeQuietMs(undefined);

interface Post { url: string; res: (r: Response) => void }
let posts: Post[] = [];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  posts = []; mouth.speaking = false;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ url, res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function boot(o: Partial<ConductorHooks> = {}) {
  const ev: string[] = [], named: { replied: boolean }[] = [], marks: string[] = [];
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: () => ev.push("sentence"), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => null,
    onWakeWord: () => ev.push("wakeWord"), onWakeReply: () => ev.push("reply"), onNameOnly: (x) => named.push(x ?? { replied: false }),
    mark: (n) => marks.push(n), ...o
  } as ConductorHooks);
  await c.open();
  return { c, e: box.e!, ev, named, marks };
}
const frame = (e: FakeEars) => e.hooks.onFrame?.(0.1, 0);

describe("v6: the on-device wake word in the conductor", () => {
  it("engages at once and tells the console; with the sentence already over, the reply comes on the next frame", async () => {
    const { c, e, ev, marks } = await boot();
    expect(c.inWindow()).toBe(false);
    e.hooks.onWakeWord?.(performance.now(), 0.96);
    expect(ev).toEqual(["wakeWord"]);
    expect(c.inWindow()).toBe(true);
    expect(marks).toContain("kws");
    e.inSpeech = false;
    frame(e);
    expect(ev).toEqual(["wakeWord", "reply"]);
    frame(e);
    expect(ev.filter((x) => x === "reply")).toHaveLength(1);
    c.close();
  });
  it("while the Collector is still speaking, the reply waits for WAKE_QUIET_MS of quiet", async () => {
    const { c, e, ev } = await boot();
    e.inSpeech = true; e.quietMs = 0;
    e.hooks.onWakeWord?.(performance.now(), 0.9);
    frame(e);
    e.quietMs = WAKE_QUIET_MS - 20;
    frame(e);
    expect(ev).not.toContain("reply");
    e.quietMs = WAKE_QUIET_MS;
    frame(e);
    expect(ev).toContain("reply");
    c.close();
  });
  it("a request said straight on (no pause for WAKE_REPLY_GIVE_UP_MS) gets no wake reply: the answer is the reply", async () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    const { c, e, ev } = await boot();
    e.inSpeech = true; e.quietMs = 0;
    e.hooks.onWakeWord?.(performance.now(), 0.9);
    vi.advanceTimersByTime(WAKE_REPLY_GIVE_UP_MS + 50);
    frame(e);
    e.quietMs = 400;
    frame(e);
    expect(ev).not.toContain("reply");
    c.close();
  });
  it("over Jarvis's own voice there is no wake reply (the name is a bid for the turn)", async () => {
    const { c, e, ev } = await boot();
    mouth.speaking = true;
    e.hooks.onWakeWord?.(performance.now(), 0.9);
    e.inSpeech = false;
    frame(e);
    expect(ev).toEqual(["wakeWord"]);
    c.close();
  });
  it("over Jarvis's voice no reply is due, so the call's transcript is not marked answered and the name still gets its reply (the independent check, 17 Nov)", async () => {
    const { c, e, named } = await boot();
    mouth.speaking = true;
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    e.hooks.onWakeWord?.(performance.now(), 0.9);
    mouth.speaking = false;
    posts[posts.length - 1].res(new Response(JSON.stringify({ text: "Hey Jarvis.", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }), { status: 200 }));
    await flush();
    expect(named).toEqual([{ replied: false }]);
    c.close();
  });
  it("the call's own transcript (the name alone) comes back marked as answered; a name heard with no wake word is not", async () => {
    const { c, e, named } = await boot();
    e.hooks.onVad({ type: "start", at: 1000 }, 0);
    e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    e.hooks.onWakeWord?.(performance.now(), 0.9);
    posts[0].res(new Response(JSON.stringify({ text: "Hey Jarvis.", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }), { status: 200 }));
    await flush();
    expect(named).toEqual([{ replied: true }]);
    c.close();
    const b = await boot();
    b.e.hooks.onVad({ type: "start", at: 1000 }, 0);
    b.e.hooks.onVad({ type: "end", at: 2000, ms: 700, short: false }, 0);
    posts[posts.length - 1].res(new Response(JSON.stringify({ text: "Hi Jarvis.", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }), { status: 200 }));
    await flush();
    expect(b.named).toEqual([{ replied: false }]);
    b.c.close();
  });
});
