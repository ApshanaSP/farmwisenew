/**
 * The ears' v5 items, in node, with stand-ins for the model's runtime (no model file is loaded, nothing leaves the process).
 *  - D1: Silero v5 at 16 kHz is fed [1, 576]: the last 64 samples of the frame before (zeros at the start) and then the 512-sample
 *    frame, as upstream does (silero-vad utils_vad.py, vad-web silero.ts). NEXT_PUBLIC_JARVIS_VAD_CONTEXT=0 restores [1, 512].
 *  - D2: the echo canceller asked for is the classic one (true) by default; NEXT_PUBLIC_JARVIS_ECHO=all asks for "all" first (a
 *    plain value, never exact) and true where the browser refuses it. What the track reports is what is stored and shown.
 * The browser (getUserMedia, AudioContext, the worklet) is a stand-in too: no microphone is opened.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { echoApplied, echoAsks, echoAudio, Ears, sileroRunner } from "./ears";

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

/** a browser with a microphone, an AudioContext and the worklet node, all stand-ins; `refuse` names the error for a constraint it will not take */
function stubBrowser(o: { refuse?: (c: MediaTrackConstraints) => string | null; settings?: Record<string, unknown> } = {}) {
  const asked: MediaTrackConstraints[] = [];
  const track = { readyState: "live", onended: null as unknown, stop: vi.fn(), getSettings: () => o.settings ?? { echoCancellation: true } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const getUserMedia = vi.fn(async (c: { audio: MediaTrackConstraints }) => {
    asked.push(c.audio);
    const n = o.refuse?.(c.audio);
    if (n) throw Object.assign(new Error(n), { name: n });
    return stream;
  });
  const port = { onmessage: null as null | ((ev: { data: { frame: Float32Array; total: number } }) => void) };
  class AC {
    state = "running"; sampleRate = 48000; audioWorklet = { addModule: async () => undefined };
    createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  class Node { port = port; disconnect() { /* gone */ } }
  vi.stubGlobal("window", { AudioContext: AC });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, getSupportedConstraints: () => ({ echoCancellation: true }) } });
  vi.stubGlobal("AudioWorkletNode", Node);
  // the model's runtime is not served in node: the energy gate decides, and the warning is not printed
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  return { asked, port, getUserMedia };
}
const hooks = () => ({ onVad: vi.fn() });

describe("D2: which echo canceller is asked for, by NEXT_PUBLIC_JARVIS_ECHO", () => {
  it("unset (the default) or anything but \"all\": the classic canceller, true, alone", () => {
    for (const f of [undefined, "", "true", "on", "ALL ", "1"]) expect(echoAsks(f)).toEqual([true]);
  });
  it("\"all\": all of the system's playout first, then true", () => expect(echoAsks("all")).toEqual(["all", true]));
  it("each ask is a plain value in the constraints, never { exact }", () => {
    expect(echoAudio({ echoCancellation: true }, echoAsks(undefined)[0]).echoCancellation).toBe(true);
    expect(echoAudio({ echoCancellation: true }, echoAsks("all")[0]).echoCancellation).toBe("all");
  });
});

describe("D2: the microphone as Ears.start opens it", () => {
  it("default: one ask, echoCancellation true; the track's own reading is stored", async () => {
    const b = stubBrowser({ settings: { echoCancellation: true } });
    const e = new Ears(hooks());
    await e.start();
    expect(b.asked.map((a) => a.echoCancellation)).toEqual([true]);
    expect(e.echoMode).toBe("on");
    e.stop();
  });
  it("NEXT_PUBLIC_JARVIS_ECHO=all: \"all\" is asked for, and stored when the track says so", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_ECHO", "all");
    const b = stubBrowser({ settings: { echoCancellation: "all" } });
    const e = new Ears(hooks());
    await e.start();
    expect(b.asked.map((a) => a.echoCancellation)).toEqual(["all"]);
    expect(e.echoMode).toBe("all");
    e.stop();
  });
  it("\"all\" refused by the browser: asked again with true", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_ECHO", "all");
    const b = stubBrowser({ refuse: (c) => (c.echoCancellation === ("all" as unknown) ? "OverconstrainedError" : null) });
    const e = new Ears(hooks());
    await e.start();
    expect(b.asked.map((a) => a.echoCancellation)).toEqual(["all", true]);
    expect(e.echoMode).toBe("on");
    e.stop();
  });
  it("\"all\" asked, but the track reads true: it is a true run, and says so", async () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_ECHO", "all");
    stubBrowser({ settings: { echoCancellation: true } });
    const e = new Ears(hooks());
    await e.start();
    expect(e.echoMode).toBe("on");
    expect(echoApplied({ echoCancellation: true })).toBe("on");
    e.stop();
  });
  it("a blocked microphone is still \"blocked\", not asked again", async () => {
    const b = stubBrowser({ refuse: () => "NotAllowedError" });
    const e = new Ears(hooks());
    await expect(e.start()).rejects.toThrow("blocked");
    expect(b.asked.length).toBe(1);
  });
});
