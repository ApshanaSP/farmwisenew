/**
 * v12 (21 Nov): the deadline helper (deadline.ts). The planner's 6 s cap did not fire on 21 Nov (calls ran 25 and 44 s): a timer signal held
 * only through AbortSignal.any is collected on Node 22.14. These pin that the helper's deadline fires, also after a full garbage collection,
 * that a parent's abort is forwarded with its reason, and that done() stops both.
 */
import { describe, expect, it } from "vitest";
import v8 from "node:v8";
import vm from "node:vm";
import { deadline, isTimeout } from "./deadline";

/** a real garbage collection, without starting vitest with --expose-gc */
function gcNow(): () => void {
  v8.setFlagsFromString("--expose_gc");
  return vm.runInNewContext("gc") as () => void;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("v12: deadline", () => {
  it("aborts at its time with a TimeoutError, and says it timed out", async () => {
    const dl = deadline(60);
    const t0 = Date.now();
    await new Promise<void>((r) => dl.signal.addEventListener("abort", () => r(), { once: true }));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    expect(dl.timedOut).toBe(true);
    expect(isTimeout(dl.signal.reason)).toBe(true);
    expect((dl.signal.reason as DOMException).name).toBe("TimeoutError");
  });

  it("still fires after a full garbage collection, when only the signal is kept (the 21 Nov hang)", async () => {
    const gc = gcNow();
    const parent = new AbortController();
    // kept: only the signal, as the SDKs keep it (no listener added yet)
    const signal = deadline(150, parent.signal).signal;
    for (let i = 0; i < 3; i++) { gc(); await wait(10); }
    await wait(400);
    gc();
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
    expect(parent.signal.aborted).toBe(false);
  });

  it("forwards a parent's abort with the parent's reason, not as a timeout", () => {
    const a = new AbortController(), b = new AbortController();
    const dl = deadline(10_000, a.signal, null, b.signal);
    expect(dl.signal.aborted).toBe(false);
    const why = new DOMException("stopped", "AbortError");
    b.abort(why);
    expect(dl.signal.aborted).toBe(true);
    expect(dl.signal.reason).toBe(why);
    expect(dl.timedOut).toBe(false);
    expect(isTimeout(dl.signal.reason)).toBe(false);
  });

  it("a parent that has already aborted aborts it at once", () => {
    const a = new AbortController();
    a.abort(new DOMException("gone", "AbortError"));
    const dl = deadline(10_000, a.signal);
    expect(dl.signal.aborted).toBe(true);
    expect((dl.signal.reason as DOMException).name).toBe("AbortError");
  });

  it("done() stops the timer and lets go of the parents", async () => {
    const a = new AbortController();
    const dl = deadline(40, a.signal);
    dl.done();
    await wait(80);
    a.abort();
    expect(dl.signal.aborted).toBe(false);
    expect(dl.timedOut).toBe(false);
  });

  it("Infinity: no timer, the parents only", async () => {
    const a = new AbortController();
    const dl = deadline(Infinity, a.signal);
    await wait(20);
    expect(dl.signal.aborted).toBe(false);
    a.abort();
    expect(dl.signal.aborted).toBe(true);
  });

  it("a fetch-like consumer rejects with the TimeoutError (what the STT and model callers read as 'timeout')", async () => {
    const dl = deadline(30);
    const work = new Promise((_res, rej) => dl.signal.addEventListener("abort", () => rej(dl.signal.reason), { once: true }));
    await expect(work).rejects.toMatchObject({ name: "TimeoutError" });
    dl.done();
  });
});
