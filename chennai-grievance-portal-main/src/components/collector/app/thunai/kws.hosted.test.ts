/**
 * B6 (27 Nov, the hosted copy): one wake-word worker for the page, owned by one listener at a time (the open ears or the closed listener). The
 * worker is a stand-in that records what it is sent; the model is not loaded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Kws, resetKwsShare, SHARED_IDLE_MS } from "./kws";

class FakeWorker {
  static made: FakeWorker[] = [];
  sent: { type: string; samples?: Float32Array; end?: number }[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null; onerror: (() => void) | null = null;
  constructor() { FakeWorker.made.push(this); }
  postMessage(m: { type: string; samples?: Float32Array; end?: number }) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  audio() { return this.sent.filter((m) => m.type === "audio"); }
}
afterEach(() => { resetKwsShare(); FakeWorker.made = []; vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const batch = () => new Float32Array(1280);

describe("B6: one worker for the page, one owner at a time", () => {
  it("the next listener takes the same worker: no second init, ready at once, its session from the warm state", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const a = new Kws({ onWake: () => undefined });
    a.start();
    const w = FakeWorker.made[0];
    w.emit({ type: "ready" });
    a.feed(batch());
    a.stop();
    expect(w.terminated).toBe(false);
    const wakes: number[] = [];
    const b = new Kws({ onWake: (end) => wakes.push(end) });
    b.start();
    expect(FakeWorker.made).toHaveLength(1);
    expect(w.sent.filter((m) => m.type === "init")).toHaveLength(1);
    expect(w.sent.at(-1)).toEqual({ type: "reset" });
    expect(b.live).toBe(true);
    // its count goes on from the last one's with a gap; a wake comes back in its own count
    b.feed(batch());
    const end = w.audio().at(-1)!.end!;
    expect(end).toBeGreaterThan(1280);
    w.emit({ type: "wake", score: 0.9, end });
    expect(wakes).toEqual([1280]);
    b.stop();
  });
  it("a late wake from the owner before (its count under the new base) is never heard by the new one", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const a = new Kws({ onWake: () => undefined });
    a.start();
    const w = FakeWorker.made[0];
    w.emit({ type: "ready" });
    a.feed(batch());
    a.stop();
    const wakes: number[] = [];
    const b = new Kws({ onWake: (end) => wakes.push(end) });
    b.start();
    w.emit({ type: "wake", score: 0.95, end: 1280 });
    expect(wakes).toEqual([]);
  });
  it("a new owner while the old one is still up: the old one goes quiet (not fed, not heard, not told it failed)", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const fails: string[] = [];
    const a = new Kws({ onWake: () => undefined, onFail: (w) => fails.push(w) });
    a.start();
    const w = FakeWorker.made[0];
    w.emit({ type: "ready" });
    const b = new Kws({ onWake: () => undefined });
    b.start();
    expect(a.live).toBe(false);
    const before = w.audio().length;
    a.feed(batch());
    expect(w.audio().length).toBe(before);
    // the quiet one stopping later never takes the worker from the owner
    a.stop();
    expect(w.terminated).toBe(false);
    expect(b.live).toBe(true);
    expect(fails).toEqual([]);
    b.stop();
  });
  it("an error ends the worker: the owner is told, and the next start makes a new one", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const fails: string[] = [];
    const a = new Kws({ onWake: () => undefined, onFail: (w) => fails.push(w) });
    a.start();
    FakeWorker.made[0].emit({ type: "error", why: "no model" });
    expect(fails).toEqual(["no model"]);
    expect(a.live).toBe(false);
    expect(FakeWorker.made[0].terminated).toBe(true);
    const b = new Kws({ onWake: () => undefined });
    b.start();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1].sent[0]).toMatchObject({ type: "init" });
    b.stop();
  });
  it("nobody owning it for SHARED_IDLE_MS, it is let go; taken back before then, it stays", () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const a = new Kws({ onWake: () => undefined });
    a.start();
    const w = FakeWorker.made[0];
    a.stop();
    vi.advanceTimersByTime(SHARED_IDLE_MS - 1000);
    const b = new Kws({ onWake: () => undefined });
    b.start();
    vi.advanceTimersByTime(SHARED_IDLE_MS * 2);
    expect(w.terminated).toBe(false);
    b.stop();
    vi.advanceTimersByTime(SHARED_IDLE_MS + 10);
    expect(w.terminated).toBe(true);
  });
  it("NEXT_PUBLIC_JARVIS_KWS_SHARE=0: each listener its own worker, terminated at its stop (v6)", () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_KWS_SHARE", "0");
    vi.stubGlobal("Worker", FakeWorker);
    const a = new Kws({ onWake: () => undefined });
    a.start();
    a.stop();
    const b = new Kws({ onWake: () => undefined });
    b.start();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[0].terminated).toBe(true);
    b.stop();
  });
});
