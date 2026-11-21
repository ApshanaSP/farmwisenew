/**
 * v13 (21 Nov), the mouth after the adversarial review of v12, with the fake Web Audio context (fakeaudio.testkit.ts):
 *  - review 1-11: the wake reply can be stopped (stopWakeReply: a 15 ms fade on its own gain, then its source stops), and the ears are told
 *    how long it sounds (onWakeSound), so a request begun over it stops it.
 *  - review 0-13: the server voice's request times out on a controller and a timer the call holds, never on AbortSignal.timeout (which the
 *    page's fetch wrapper would hold only through AbortSignal.any).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCtx, FakeSource } from "./fakeaudio.testkit";

type Mouth = typeof import("./mouth");
const load = async (): Promise<Mouth> => { vi.resetModules(); return (await import("./mouth")) as Mouth; };

beforeEach(() => {
  FakeCtx.all = [];
  FakeCtx.decodedSeconds = 0.6;
  vi.stubGlobal("window", { AudioContext: FakeCtx });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("review 1-11: the wake reply can be stopped", () => {
  const manifest = () => vi.fn(async (url: string) => (String(url).endsWith("manifest.json")
    ? new Response(JSON.stringify({ files: { en: [{ file: "yes.wav" }], ta: [] } }), { status: 200, headers: { "content-type": "application/json" } })
    : new Response(new Uint8Array(64), { status: 200, headers: { "content-type": "audio/wav" } })));
  it("it tells the ears how long it sounds; stopWakeReply fades its own gain and stops its source, once", async () => {
    vi.stubGlobal("fetch", manifest());
    const m = await load();
    const sounds: number[] = [];
    m.setMouthHooks({ onEarcon: () => undefined, onWakeSound: (ms) => sounds.push(ms) });
    await m.loadWakeReplies();
    const r = m.wakeReply("en-IN");
    expect(r?.ms).toBe(600);
    expect(sounds).toEqual([605]);
    const c = FakeCtx.all.find((x) => x.sources.length)!;
    const s = c.sources[0] as FakeSource;
    c.currentTime = 0.2;
    expect(m.stopWakeReply()).toBe(true);
    expect(s.stopped).toBeCloseTo(0.215, 5);
    // its own gain (the one the source feeds) goes to nothing
    const g = c.gains.find((x) => s.out.includes(x))!;
    expect(g.gain.calls.some((x) => x[0] === "target" && x[1] === 0)).toBe(true);
    // nothing sounds now: a second stop does nothing, and the HUD no longer reads the reply's level
    expect(m.stopWakeReply()).toBe(false);
    expect(m.voiceLevel()).toBe(0);
  });
  it("a reply that played to its end is not stopped", async () => {
    vi.stubGlobal("fetch", manifest());
    const m = await load();
    m.setMouthHooks({ onEarcon: () => undefined });
    await m.loadWakeReplies();
    m.wakeReply("en-IN");
    const s = FakeCtx.all.find((x) => x.sources.length)!.sources[0] as FakeSource;
    s.end();
    expect(m.stopWakeReply()).toBe(false);
    expect(s.stopped).toBeNull();
  });
});

describe("review 0-13: the server voice's request has its own timer", () => {
  it("a stalled request is aborted after 30 s on a controller this call holds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | null = null;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? null;
      return new Promise<Response>((_res, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
    }));
    const m = await load();
    // no browser voice in this window: the server's voice (PCM) is asked for the answer
    m.speakLines(["The drains near the bridge are blocked."], "en-IN");
    for (let i = 0; i < 50 && !signal; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(10); }
    expect(signal).not.toBeNull();
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(signal!.aborted).toBe(true);
    m.stopVoice();
  });
  it("the source has no AbortSignal.timeout left", () => {
    const src = fs.readFileSync(path.join(__dirname, "mouth.ts"), "utf8");
    expect(src).not.toMatch(/AbortSignal\.timeout\(/);
    expect(src).toMatch(/const timer = setTimeout\(\(\) => ctl\.abort\(\), 30_000\);/);
    expect(src).toMatch(/finally \{ clearTimeout\(timer\); \}/);
  });
});
