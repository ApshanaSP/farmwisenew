/**
 * 27 Nov, the hosted copy in Chrome (the investigation hosted-jarvis, B1, B3, B4, B10), in node: the microphone (./ears) and the voice (./mouth)
 * are stand-ins; the turn machine and the address gate are real; /hear is a stub. Sentences are invented.
 *  - B3: a start that stays on one step for MIC_START_LIMIT_MS is given up ("stalled"), reported words-free (onStall), and open() rejects;
 *    the browser's own question about the microphone is never a stall; a step that moved on gets its own time.
 *  - B1: a context still suspended GESTURE_GRACE_MS after the start asks for a click (onFail "gesture"); one that starts does not.
 *  - B4: an open by the Collector's hand (the page calls called() and engages it) takes the first plain question on the engaged lane;
 *    an open with no call (a tab coming back) stays on the ambient lane, as before.
 *  - B10: /hear's 401 or 403 is "signed out" (onSignedOut), never "I didn't catch that".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({ e: null as null | FakeEarsT, start: null as null | (() => Promise<void>), gesture: false, awake: true }));
interface FakeEarsT {
  hooks: { onVad: (e: unknown, wall: number, voicedEnd?: number) => void };
  /** the step the start is on, and (as the real ears record it) when each step began, ms from the start */
  stage: string; stageAt: Record<string, number>; ctxState: string; stopped: boolean;
}

vi.mock("./ears", () => {
  class Ears {
    hooks: unknown; kind = "silero"; live = true; echoMode = "on"; echo = false; stage = "gum"; stageAt: Record<string, number> = {}; ctxState = "none"; stopped = false;
    private cap = false;
    constructor(h: unknown) { this.hooks = h; box.e = this as unknown as FakeEarsT; }
    get needsGesture() { return box.gesture; }
    async awake() { return box.awake; }
    start() { return box.start ? box.start() : Promise.resolve(); }
    stop() { this.live = false; this.stopped = true; }
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
  EARCON_GUARD_MS: 400, setMouthHooks: () => undefined, speaking: () => false, nowSaying: () => null, canContinue: () => false,
  continueAnswer: () => false, stopVoice: () => undefined, duckVoice: () => undefined, unduckVoice: () => undefined, stopWakeReply: () => false
}));

import { Conductor, GESTURE_GRACE_MS, MIC_START_LIMIT_MS, signedOutStatus, stallCode, type ConductorHooks, type StallInfo } from "./conductor";

interface Post { url: string; init: RequestInit; res: (r: Response) => void }
let posts: Post[] = [];
let perm = "granted";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const param = (p: Post, k: string) => new URL(p.url, "http://x").searchParams.get(k);
/** the clock the watchdog reads (timers, Date and performance.now) is the test's */
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });

beforeEach(() => {
  posts = []; perm = "granted"; box.start = null; box.gesture = false; box.awake = true;
  vi.stubGlobal("navigator", { permissions: { query: async () => ({ state: perm }) } });
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((res, rej) => {
    posts.push({ url, init, res });
    init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function make(o: Partial<ConductorHooks> = {}) {
  const fails: string[] = [], stalls: StallInfo[] = [], sentences: string[] = [], missed: string[] = [];
  let signedOut = 0;
  const c = new Conductor({
    hearUrl: () => "/api/jarvis/hear", siteLang: () => "en", onSentence: (h) => sentences.push(h.text), cancelTurn: () => undefined, onIgnored: () => undefined,
    onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }), lastTurnAt: () => null,
    onFail: (w) => fails.push(w), onStall: (s) => stalls.push(s), onSignedOut: () => { signedOut++; }, onMissed: (w) => missed.push(w), ...o
  } as ConductorHooks);
  return { c, fails, stalls, sentences, missed, signedOut: () => signedOut };
}
const say = (start: number, ms = 900) => { box.e!.hooks.onVad({ type: "start", at: start }, 0); box.e!.hooks.onVad({ type: "end", at: start + ms + 300, ms, short: false }, 0); };

describe("B3: the start watchdog", () => {
  it("a start stuck on one step is given up at MIC_START_LIMIT_MS: reported, said as \"stalled\", and open() rejects", async () => {
    fake();
    box.start = () => new Promise<void>(() => undefined);
    const { c, fails, stalls } = make();
    const opened = c.open().then(() => "resolved", (e: Error) => e.message);
    // stuck on the worklet from the start's first moment (its step began at 0 ms)
    box.e!.stage = "worklet"; box.e!.stageAt = { gum: 0, worklet: 0 }; box.e!.ctxState = "suspended";
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS - 100);
    expect(stalls).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(await opened).toBe("stalled");
    expect(fails).toEqual(["stalled"]);
    expect(stalls).toHaveLength(1);
    expect(stalls[0]).toMatchObject({ stage: "worklet", ctx: "suspended", permission: "granted" });
    expect(stalls[0].ms).toBeGreaterThanOrEqual(MIC_START_LIMIT_MS);
    expect(box.e!.stopped).toBe(true);
    expect(c.micLive).toBe(false);
    expect(c.starting).toBe(false);
  });
  it("the browser's own question (the permission still \"prompt\") is never a stall; once allowed, a step stuck past the limit is", async () => {
    fake();
    perm = "prompt";
    box.start = () => new Promise<void>(() => undefined);
    const { c, fails } = make();
    void c.open().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS * 3);
    expect(fails).toEqual([]);
    perm = "granted";
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS + 100);
    expect(fails).toEqual(["stalled"]);
  });
  it("a step that moved on gets its own time (a slow model then a slow worklet is slow, not stuck)", async () => {
    fake();
    box.start = () => new Promise<void>(() => undefined);
    const { c, fails } = make();
    void c.open().catch(() => undefined);
    box.e!.stage = "silero";
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS - 1000);
    box.e!.stage = "worklet";
    await vi.advanceTimersByTimeAsync(2000);
    expect(fails).toEqual([]);
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS);
    expect(fails).toEqual(["stalled"]);
  });
  it("a step is timed from when it began, as the ears record it (the worklet began at 6 s: given up at 16 s, not at 10 or 20)", async () => {
    fake();
    box.start = () => new Promise<void>(() => undefined);
    const { c, fails } = make();
    void c.open().catch(() => undefined);
    box.e!.stage = "worklet"; box.e!.stageAt = { gum: 0, silero: 100, ctx: 6000, worklet: 6000 };
    await vi.advanceTimersByTimeAsync(15_900);
    expect(fails).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(fails).toEqual(["stalled"]);
  });
  it("a start that finishes in time leaves no watchdog behind", async () => {
    fake();
    let go: () => void = () => undefined;
    box.start = () => new Promise<void>((r) => { go = r; });
    const { c, fails, stalls } = make();
    const opened = c.open();
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS - 500);
    go();
    await opened;
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS * 3);
    expect(fails).toEqual([]);
    expect(stalls).toEqual([]);
    expect(c.state).toBe("listening");
    c.close();
  });
  it("closed while still starting: no stall is said later", async () => {
    fake();
    box.start = () => new Promise<void>(() => undefined);
    const { c, fails, stalls } = make();
    void c.open().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    c.close();
    await vi.advanceTimersByTimeAsync(MIC_START_LIMIT_MS * 2);
    expect(fails).toEqual([]);
    expect(stalls).toEqual([]);
  });
  it("the report is one telemetry code /api/jarvis/ignored takes ([a-z0-9-], 40 characters at most)", () => {
    const WHY = /^[a-z][a-z0-9-]{0,39}$/;
    const codes = [
      stallCode({ stage: "worklet", ms: 12_400, ctx: "suspended", permission: "granted" }),
      stallCode({ stage: "silero", ms: 999_999_999, ctx: "closed", permission: "unknown" }),
      stallCode({ stage: "Weird Stage!", ms: Number.NaN, ctx: "x", permission: "maybe" })
    ];
    expect(codes[0]).toBe("open-stall-worklet-t12-susp-granted");
    expect(codes[1]).toBe("open-stall-silero-t999-closed-unknown");
    expect(codes[2]).toBe("open-stall-unknown-t0-none-unknown");
    for (const c of codes) expect(c).toMatch(WHY);
  });
});

describe("B1: the browser holding the audio until a click", () => {
  it("still suspended after the grace: onFail \"gesture\" (the page asks for a click); the microphone stays open", async () => {
    box.gesture = true; box.awake = false;
    const { c, fails } = make();
    await c.open();
    await flush();
    expect(fails).toEqual(["gesture"]);
    expect(c.micLive).toBe(true);
    expect(c.state).toBe("listening");
    c.close();
  });
  it("one that starts within the grace (as on the PC) asks nothing", async () => {
    box.gesture = true; box.awake = true;
    const { c, fails } = make();
    await c.open();
    await flush();
    expect(fails).toEqual([]);
    expect(GESTURE_GRACE_MS).toBeGreaterThan(0);
    c.close();
  });
});

describe("B4: an open by the Collector's hand is a call", () => {
  it("called() (what the page does on a click, a shortcut or Unmute): the first plain question goes on the engaged lane and is answered", async () => {
    const { c, sentences } = make();
    await c.open();
    c.called();
    say(1000);
    expect(posts).toHaveLength(1);
    expect(param(posts[0], "lane")).toBe("engaged");
    expect(param(posts[0], "engaged")).toBe("1");
    posts[0].res(new Response(JSON.stringify({ text: "How many severe cases are open in Adyar?", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }), { status: 200 }));
    await flush();
    expect(sentences).toEqual(["How many severe cases are open in Adyar?"]);
    c.close();
  });
  it("the page's own order (engagedNow, then called(), in one millisecond, and both again once the microphone is live): a loosely said first request is still the call's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let last: number | null = null;
    const { c, sentences } = make({ lastTurnAt: () => last });
    // setMode("on"): engagedNow(); called(): the same millisecond
    last = Date.now(); c.called();
    await c.open();
    vi.setSystemTime(Date.now() + 700);
    // openMic's then, the microphone live: engagedNow(); called() again
    last = Date.now(); c.called();
    say(1000);
    expect(param(posts[0], "lane")).toBe("engaged");
    posts[0].res(new Response(JSON.stringify({ text: "that bus stand thing near Guindy", lang: "en", conf: { speech: 0.98, logprob: -0.1 } }), { status: 200 }));
    await flush();
    expect(sentences).toEqual(["that bus stand thing near Guindy"]);
    c.close();
  });
  it("an open with no call (a tab coming back) stays on the capped ambient lane, as before", async () => {
    const { c } = make();
    await c.open();
    say(1000);
    expect(param(posts[0], "lane")).toBe("ambient");
    c.close();
  });
});

describe("B10: a signed-out session is said as that", () => {
  it("401 and 403 are signed out; 500 and 502 are not", () => {
    expect([401, 403, 500, 502, 503].map(signedOutStatus)).toEqual([true, true, false, false, false]);
  });
  it.each([401, 403])("/hear %i on an engaged sentence: onSignedOut, no \"I didn't catch that\"", async (status) => {
    const { c, missed, signedOut } = make();
    await c.open();
    c.called();
    say(1000);
    posts[0].res(new Response(JSON.stringify({ error: "Not authenticated" }), { status }));
    await flush();
    expect(signedOut()).toBe(1);
    expect(missed).toEqual([]);
    expect(c.state).toBe("listening");
    c.close();
  });
  it("on the ambient lane too (every later sentence would fail the same way)", async () => {
    const { c, signedOut } = make();
    await c.open();
    say(1000);
    posts[0].res(new Response("{}", { status: 401 }));
    await flush();
    expect(signedOut()).toBe(1);
    c.close();
  });
  it("a 502 is still \"not heard\" for an engaged sentence, not signed out", async () => {
    const { c, missed, signedOut } = make();
    await c.open();
    c.called();
    say(1000);
    posts[0].res(new Response("{}", { status: 502 }));
    await flush();
    expect(signedOut()).toBe(0);
    expect(missed).toEqual(["error"]);
    c.close();
  });
});
