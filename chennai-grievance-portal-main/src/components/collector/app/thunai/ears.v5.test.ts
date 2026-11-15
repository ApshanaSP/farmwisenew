/**
 * The ears' v5 items, in node, with stand-ins for the model's runtime (no model file is loaded, nothing leaves the process).
 *  - D1: Silero v5 at 16 kHz is fed [1, 576]: the last 64 samples of the frame before (zeros at the start) and then the 512-sample
 *    frame, as upstream does (silero-vad utils_vad.py, vad-web silero.ts). NEXT_PUBLIC_JARVIS_VAD_CONTEXT=0 restores [1, 512].
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { sileroRunner } from "./ears";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

class Tensor { constructor(public type: string, public data: Float32Array | BigInt64Array, public dims: number[]) {} }
/** a session that keeps a copy of every input it is fed */
function fakeSession() {
  const feeds: { data: Float32Array; dims: number[] }[] = [];
  const sess = {
    run: async (f: Record<string, Tensor>) => {
      feeds.push({ data: Float32Array.from(f.input.data as Float32Array), dims: [...f.input.dims] });
      return { output: { data: new Float32Array([0.5]) }, stateN: new Tensor("float32", new Float32Array(256), [2, 1, 128]) };
    }
  };
  return { feeds, sess };
}
const frame = (k: number) => Float32Array.from({ length: 512 }, (_, i) => k + i / 1024);
const arr = (x: Float32Array) => Array.from(x);
const zeros = (n: number) => new Array<number>(n).fill(0);

describe("D1: Silero's 64-sample context", () => {
  it("the input is [1, 576]: the previous frame's last 64 samples (zeros on the first frame), then the frame", async () => {
    const { feeds, sess } = fakeSession();
    const s = sileroRunner({ Tensor } as never, sess as never);
    await s.run(frame(1));
    await s.run(frame(2));
    await s.run(frame(3));
    expect(feeds.map((f) => f.dims)).toEqual([[1, 576], [1, 576], [1, 576]]);
    expect(arr(feeds[0].data.subarray(0, 64))).toEqual(zeros(64));
    expect(arr(feeds[0].data.subarray(64))).toEqual(arr(frame(1)));
    expect(arr(feeds[1].data.subarray(0, 64))).toEqual(arr(frame(1).subarray(448)));
    expect(arr(feeds[1].data.subarray(64))).toEqual(arr(frame(2)));
    expect(arr(feeds[2].data.subarray(0, 64))).toEqual(arr(frame(2).subarray(448)));
  });
  it("reset() zeroes the context (with the recurrent state)", async () => {
    const { feeds, sess } = fakeSession();
    const s = sileroRunner({ Tensor } as never, sess as never);
    await s.run(frame(1));
    await s.run(frame(2));
    s.reset();
    await s.run(frame(3));
    expect(arr(feeds[2].data.subarray(0, 64))).toEqual(zeros(64));
    expect(arr(feeds[2].data.subarray(64))).toEqual(arr(frame(3)));
  });
  it("a reset while a frame is still at the model is not undone when that frame comes back", async () => {
    const { feeds, sess } = fakeSession();
    const s = sileroRunner({ Tensor } as never, sess as never);
    const p = s.run(frame(1));
    s.reset();
    await p;
    await s.run(frame(2));
    expect(arr(feeds[1].data.subarray(0, 64))).toEqual(zeros(64));
  });
  it("the caller's frame is left as it was", async () => {
    const { sess } = fakeSession();
    const s = sileroRunner({ Tensor } as never, sess as never);
    const x = frame(7), copy = arr(x);
    await s.run(x);
    expect(arr(x)).toEqual(copy);
  });
  it("NEXT_PUBLIC_JARVIS_VAD_CONTEXT=0 switches it off: [1, 512], the frame alone, as in v4", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_VAD_CONTEXT", "0");
    const { feeds, sess } = fakeSession();
    const s = sileroRunner({ Tensor } as never, sess as never);
    await s.run(frame(1));
    await s.run(frame(2));
    expect(feeds.map((f) => f.dims)).toEqual([[1, 512], [1, 512]]);
    expect(arr(feeds[1].data)).toEqual(arr(frame(2)));
  });
});
