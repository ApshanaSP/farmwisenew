/**
 * v6, the on-device wake word's page side (kws.ts) and the wake reply's variant choice (mouth.ts): flags, the 16 kHz copy of the audio,
 * the batching to the worker (80 ms steps), the sample count that maps a detection back onto the page's clock. The worker itself is a
 * stand-in here; the model is measured offline (scripts/jarvis6/kws-offline.mjs) and in the real-path spec.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Kws, kwsMode, kwsThreshold, To16k } from "./kws";
import { nextVariant, wakeReplyMode } from "./mouth";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("v6 wake word flags", () => {
  it("NEXT_PUBLIC_JARVIS_KWS: all by default; open and off as said", () => {
    expect(kwsMode(undefined)).toBe("all");
    expect(kwsMode("")).toBe("all");
    expect(kwsMode("open")).toBe("open");
    expect(kwsMode("OFF")).toBe("off");
    expect(kwsMode("0")).toBe("off");
  });
  it("the threshold: 0.5 by default, a number between 0 and 1 when given", () => {
    expect(kwsThreshold(undefined)).toBe(0.5);
    expect(kwsThreshold("0.7")).toBe(0.7);
    expect(kwsThreshold("2")).toBe(0.5);
    expect(kwsThreshold("x")).toBe(0.5);
  });
  it("NEXT_PUBLIC_JARVIS_WAKE_REPLY: the clip by default, the v5 tone when asked", () => {
    expect(wakeReplyMode(undefined)).toBe("clip");
    expect(wakeReplyMode("tone")).toBe("tone");
  });
});

describe("To16k: the wake word's own copy of the audio at 16 kHz", () => {
  it("48 kHz in, a third as many samples out, the average of each three", () => {
    const d = new To16k(48000);
    const x = Float32Array.from({ length: 960 }, (_, i) => (i % 3 === 0 ? 0.3 : 0));
    const y = d.push(x);
    expect(y.length).toBe(320);
    expect(y[0]).toBeCloseTo(0.1, 5);
  });
  it("carries a partial step across frames (44.1 kHz)", () => {
    const d = new To16k(44100);
    let n = 0;
    for (let i = 0; i < 100; i++) n += d.push(new Float32Array(882)).length;
    expect(Math.abs(n - 32000)).toBeLessThanOrEqual(1);
  });
});

describe("Kws: the batches the worker gets, and what comes back", () => {
  class FakeWorker {
    static last: FakeWorker | null = null;
    sent: { type: string; samples?: Float32Array; end?: number }[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null; onerror: (() => void) | null = null;
    constructor() { FakeWorker.last = this; }
    postMessage(m: { type: string; samples?: Float32Array; end?: number }) { this.sent.push(m); }
    terminate() { /* gone */ }
    emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  }
  it("nothing goes before the worker is ready; then 80 ms batches with their sample count; a wake comes back with its count", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const wakes: [number, number][] = [];
    const k = new Kws({ onWake: (end, score) => wakes.push([end, score]) });
    k.start();
    const w = FakeWorker.last!;
    expect(w.sent[0]).toMatchObject({ type: "init", model: "/thunai/hey_jarvis.onnx", threshold: 0.5 });
    k.feed(new Float32Array(1280));
    expect(w.sent.filter((m) => m.type === "audio")).toHaveLength(0);
    w.emit({ type: "ready" });
    // what came while it loaded (up to a second) goes with the first batch, so the count stays the true sample count
    k.feed(new Float32Array(640));
    let a = w.sent.filter((m) => m.type === "audio");
    expect(a).toHaveLength(1);
    expect(a[0].samples?.length).toBe(1920);
    expect(a[0].end).toBe(1920);
    k.feed(new Float32Array(640));
    expect(w.sent.filter((m) => m.type === "audio")).toHaveLength(1);
    k.feed(new Float32Array(640));
    a = w.sent.filter((m) => m.type === "audio");
    expect(a).toHaveLength(2);
    expect(a[1].end).toBe(3200);
    w.emit({ type: "wake", score: 0.96, end: 3200 });
    expect(wakes).toEqual([[3200, 0.96]]);
    k.stop();
  });
  it("a worker that cannot start says so and the wake word is off (Jarvis works on without it)", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const fails: string[] = [];
    const k = new Kws({ onWake: () => undefined, onFail: (why) => fails.push(why) });
    k.start();
    FakeWorker.last!.emit({ type: "error", why: "no model" });
    expect(fails).toEqual(["no model"]);
    expect(k.live).toBe(false);
  });
});

describe("the wake reply's variant: never the same twice in a row", () => {
  it("any but the last one", () => {
    for (let last = 0; last < 5; last++) for (const r of [0, 0.2, 0.5, 0.79, 0.99]) {
      const v = nextVariant(5, last, r);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
    expect(nextVariant(1, 0, 0.5)).toBe(0);
    expect(nextVariant(4, -1, 0.99)).toBeLessThan(4);
  });
});
