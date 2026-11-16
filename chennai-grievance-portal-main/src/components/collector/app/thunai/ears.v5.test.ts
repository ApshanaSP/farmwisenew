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

describe("the trace's zero (section 6.4): the ears give the end of the last voiced frame, on the browser's clock", () => {
  it("the end event carries the last voiced sample's time, not the decision's (300 ms of quiet later)", async () => {
    const b = stubBrowser();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const h = hooks();
    const e = new Ears(h);
    await e.start();
    const n = 960; // 20 ms at 48 kHz
    let total = 0;
    const push = (i: number, amp: number) => { total += n; clock = 1000 + 20 * i; b.port.onmessage?.({ data: { frame: new Float32Array(n).fill(amp), total } }); };
    let i = 0;
    for (; i < 50; i++) push(i, 0); // a second of quiet: the floor
    for (; i < 70; i++) push(i, 0.5); // 400 ms of voice: frames 50..69, the last ends at 1400 ms of audio
    for (; i < 100; i++) push(i, 0);
    const ends = h.onVad.mock.calls.filter((c) => (c[0] as { type: string }).type === "end");
    expect(ends.length).toBe(1);
    const [, wall, voiced] = ends[0] as [unknown, number, number];
    // each frame arrives 980 ms after its audio began on this clock: the last voiced sample is at 1400 + 980
    expect(voiced).toBe(2380);
    expect(wall).toBe(voiced + 300);
    e.stop();
  });
  it("a frame that reaches the page late (a busy main thread) does not move the clock later", async () => {
    const b = stubBrowser();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const h = hooks();
    const e = new Ears(h);
    await e.start();
    const n = 960;
    let total = 0;
    const push = (i: number, amp: number, late = 0) => { total += n; clock = 1000 + 20 * i + late; b.port.onmessage?.({ data: { frame: new Float32Array(n).fill(amp), total } }); };
    let i = 0;
    for (; i < 50; i++) push(i, 0);
    for (; i < 70; i++) push(i, 0.5, i === 69 ? 150 : 0);
    for (; i < 100; i++) push(i, 0);
    const end = h.onVad.mock.calls.find((c) => (c[0] as { type: string }).type === "end") as [unknown, number, number];
    expect(Math.abs(end[2] - 2380)).toBeLessThanOrEqual(1);
    e.stop();
  });
});

describe("E2: the pause inside a sentence (the early upload's moment), and the sentence so far", () => {
  /** the ears on a stand-in browser, the page's clock driven by the frames: 20 ms frames at 48 kHz, each 980 ms after its audio began */
  async function rig() {
    const b = stubBrowser();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const log: string[] = [];
    const h = {
      onVad: vi.fn((ev: { type: string }) => log.push(ev.type)),
      onPause: vi.fn(() => log.push("pause")),
      onResume: vi.fn(() => log.push("resume"))
    };
    const e = new Ears(h);
    await e.start();
    const n = 960;
    let total = 0, i = 0;
    const push = (frames: number, amp: number) => { for (const last = i + frames; i < last; i++) { total += n; clock = 1000 + 20 * i; b.port.onmessage?.({ data: { frame: new Float32Array(n).fill(amp), total } }); } };
    return { e, h, log, push, now: () => clock };
  }
  it("the energy gate: onPause at the first frame with 150 ms or more of quiet (160 ms on 20 ms frames), before the end, with the last voiced sample and the speech so far", async () => {
    const { e, h, log, push } = await rig();
    push(50, 0); // a second of quiet: the floor
    push(20, 0.5); // 400 ms of voice, frames 50..69: the last voiced sample at 1400 ms of audio, 2380 on the page's clock
    push(7, 0); // 140 ms of quiet: no pause yet
    expect(h.onPause).not.toHaveBeenCalled();
    push(1, 0); // 160 ms
    expect(h.onPause).toHaveBeenCalledTimes(1);
    const [wall, voiced, ms] = h.onPause.mock.calls[0] as unknown as [number, number, number];
    expect(voiced).toBe(2380);
    expect(wall).toBe(voiced + 160);
    push(30, 0);
    expect(log).toEqual(["start", "pause", "end"]);
    // the end is decided as today (300 ms of quiet), and its speech span is the pause's
    const end = h.onVad.mock.calls.find((c) => (c[0] as { type: string }).type === "end") as unknown as [{ ms: number }, number, number];
    expect(end[1]).toBe(voiced + 300);
    expect(end[0].ms).toBe(ms);
    e.stop();
  });
  it("the voice back before the end: onResume, the pause comes again in the next quiet, one end", async () => {
    const { e, log, push } = await rig();
    push(50, 0);
    push(20, 0.5);
    push(10, 0); // 200 ms of quiet: the pause
    push(10, 0.5); // the voice is back before 300 ms of quiet
    push(30, 0);
    expect(log).toEqual(["start", "pause", "resume", "pause", "end"]);
    e.stop();
  });
  it("a quiet shorter than 150 ms inside the sentence gives neither", async () => {
    const { e, log, push } = await rig();
    push(50, 0);
    push(20, 0.5);
    push(5, 0); // 100 ms
    push(10, 0.5);
    push(30, 0);
    expect(log).toEqual(["start", "pause", "end"]);
    e.stop();
  });
  it("peek(): the sentence so far as a WAV while the capture goes on; take() then gives the whole sentence", async () => {
    const { e, h, push } = await rig();
    // a holder, not a let: tsc would narrow a let assigned only inside the hook to null
    const got: { early: Blob | null } = { early: null };
    h.onPause.mockImplementation(() => { got.early = e.peek(); return 0; });
    expect(e.peek()).toBeNull();
    push(50, 0);
    push(3, 0.5);
    const start = (h.onVad.mock.calls[0][0] as unknown as { at: number }).at;
    e.capture(start);
    push(17, 0.5);
    push(8, 0); // the pause, 78 frames in
    expect(got.early).toBeInstanceOf(Blob);
    expect(e.capturing).toBe(true);
    push(7, 0); // the end, 85 frames in
    const whole = e.take();
    expect(e.capturing).toBe(false);
    // from 350 ms before the start (48 kHz), cut to 16 kHz 16-bit: 44 bytes of header and 2 bytes a sample
    const from = Math.round(((start - 350) / 1000) * 48000);
    expect(got.early!.size).toBe(44 + 2 * Math.floor((78 * 960 - from) / 3));
    expect(whole!.size).toBe(44 + 2 * Math.floor((85 * 960 - from) / 3));
    e.stop();
  });
});
