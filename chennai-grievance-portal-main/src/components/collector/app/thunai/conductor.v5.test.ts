/**
 * The conductor's v5 items, in node: the microphone (./ears) and the voice (./mouth) are stand-ins; the turn machine and the address
 * gate are real. No model and no network: /hear is a stub that records its requests. Sentences are invented.
 *  - C3: the window the captions may run in (inWindow): within ENGAGED_MS of the wake or of Jarvis's last turn, or while it speaks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGED_MS } from "@/lib/thunai/addressed";

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
