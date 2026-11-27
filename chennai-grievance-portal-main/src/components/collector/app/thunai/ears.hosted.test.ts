/**
 * 27 Nov, the hosted copy in Chrome (docs: the investigation hosted-jarvis, B1, B2, B7): the ears' start never waits for a click and never
 * waits for the speech model without a limit. In node, with stand-ins for the browser (getUserMedia, AudioContext, the worklet): no microphone
 * is opened, no model is loaded.
 *  - B1: a context the browser holds (suspended, its resume() pending until a click) no longer holds up Ears.start or WakeEars.start; the ears
 *    say so (needsGesture, earsAsleep) and resumeEars, the page's click handler, starts them.
 *  - B2: Silero gets SILERO_WAIT_MS; past it the energy gate decides and the model comes in when it arrives, between sentences, on the clock
 *    of the samples heard so far.
 *  - B3: the start says which step it is on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ears, earsAsleep, resumeEars, RESUME_WAIT_MS, SILERO_WAIT_MS, setSileroLoaderForTest, WakeEars } from "./ears";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setSileroLoaderForTest(null); });
/** the test's own clock for the start's waits (timers and performance.now; Date is left real) */
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });

/** a browser whose AudioContext starts "suspended" when `held`, with a resume() that stays pending until click() (as Chrome's does) */
function stubBrowser(o: { held?: boolean } = {}) {
  const track = { readyState: "live", onended: null as unknown, stop: vi.fn(), getSettings: () => ({ echoCancellation: true }) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const ports: { onmessage: null | ((ev: { data: { frame: Float32Array; total: number } }) => void) }[] = [];
  let clicked = !o.held;
  const waiting: (() => void)[] = [];
  const made: AC[] = [];
  class AC {
    state: "running" | "suspended" | "closed" = clicked ? "running" : "suspended";
    sampleRate = 48000;
    audioWorklet = { addModule: async () => undefined };
    constructor() { made.push(this); }
    createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
    resume() {
      if (clicked) { this.state = "running"; return Promise.resolve(); }
      return new Promise<void>((r) => waiting.push(() => { this.state = "running"; r(); }));
    }
    close() { this.state = "closed"; return Promise.resolve(); }
  }
  class Node { port = { onmessage: null }; constructor() { ports.push(this.port); } disconnect() { /* gone */ } }
  vi.stubGlobal("window", { AudioContext: AC });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => stream, getSupportedConstraints: () => ({ echoCancellation: true }) } });
  vi.stubGlobal("AudioWorkletNode", Node);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  return {
    made, ports,
    /** the Collector clicks: the browser lets audio start, and every pending resume() resolves */
    click: () => { clicked = true; for (const f of waiting.splice(0)) f(); }
  };
}

describe("B1: the start never waits for a click", () => {
  it("Ears.start resolves with its context suspended after RESUME_WAIT_MS; needsGesture says so; resumeEars starts it", async () => {
    fake();
    setSileroLoaderForTest(async () => null);
    const b = stubBrowser({ held: true });
    const e = new Ears({ onVad: vi.fn() });
    let done = false;
    const p = e.start().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS - 50);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(done).toBe(true);
    expect(e.stage).toBe("live");
    expect(e.needsGesture).toBe(true);
    expect(e.ctxState).toBe("suspended");
    expect(earsAsleep()).toBe(true);
    // awake(): not by itself
    const a = e.awake(500);
    await vi.advanceTimersByTimeAsync(600);
    expect(await a).toBe(false);
    // the page's click handler
    b.click();
    await resumeEars();
    expect(e.needsGesture).toBe(false);
    expect(earsAsleep()).toBe(false);
    e.stop();
  });
  it("a context the browser lets start is running when the start resolves (as on the PC): nothing to ask", async () => {
    setSileroLoaderForTest(async () => null);
    stubBrowser();
    const e = new Ears({ onVad: vi.fn() });
    await e.start();
    expect(e.needsGesture).toBe(false);
    expect(await e.awake(100)).toBe(true);
    expect(earsAsleep()).toBe(false);
    e.stop();
  });
  it("a stopped start leaves no context behind for the click handler", async () => {
    setSileroLoaderForTest(async () => null);
    stubBrowser({ held: true });
    const e = new Ears({ onVad: vi.fn() });
    await e.start();
    expect(earsAsleep()).toBe(true);
    e.stop();
    expect(earsAsleep()).toBe(false);
  });
  it("WakeEars.start (the closed listener) goes on too, and says it waits for a click", async () => {
    fake();
    vi.stubGlobal("Worker", class { postMessage() { /* init */ } terminate() { /* gone */ } onmessage = null; onerror = null; });
    const b = stubBrowser({ held: true });
    const w = new WakeEars(() => undefined);
    const p = w.start();
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS + 50);
    expect(await p).toBe(true);
    expect(w.needsGesture).toBe(true);
    b.click();
    await resumeEars();
    expect(w.needsGesture).toBe(false);
    w.stop();
    expect(earsAsleep()).toBe(false);
  });
});

describe("B2: Silero within SILERO_WAIT_MS, or later between sentences", () => {
  const fakeSilero = () => ({ run: vi.fn(async () => 0), reset: vi.fn() });
  it("a slow model: the start goes on with the energy gate, and the model decides once it is in, outside a sentence", async () => {
    fake();
    const s = fakeSilero();
    setSileroLoaderForTest(() => new Promise((r) => setTimeout(() => r(s), SILERO_WAIT_MS + 3000)));
    const b = stubBrowser();
    const e = new Ears({ onVad: vi.fn() });
    let done = false;
    const p = e.start().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(SILERO_WAIT_MS - 100);
    expect(done).toBe(false);
    expect(e.stage).toBe("silero");
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(e.kind).toBe("energy");
    expect(e.stage).toBe("live");
    // frames come; the model arrives 3 s later and is taken at the next frame (nothing is being said)
    let total = 0;
    const push = () => { total += 960; b.ports[0].onmessage?.({ data: { frame: new Float32Array(960), total } }); };
    for (let i = 0; i < 10; i++) push();
    await vi.advanceTimersByTimeAsync(3100);
    push();
    expect(e.kind).toBe("silero");
    expect(s.reset).toHaveBeenCalled();
    e.stop();
  });
  it("a model in time decides from the start, as before", async () => {
    const s = fakeSilero();
    setSileroLoaderForTest(async () => s);
    stubBrowser();
    const e = new Ears({ onVad: vi.fn() });
    await e.start();
    expect(e.kind).toBe("silero");
    e.stop();
  });
  it("a model that arrives after the ears were stopped is never taken", async () => {
    fake();
    const s = fakeSilero();
    setSileroLoaderForTest(() => new Promise((r) => setTimeout(() => r(s), SILERO_WAIT_MS + 1000)));
    stubBrowser();
    const e = new Ears({ onVad: vi.fn() });
    const p = e.start();
    await vi.advanceTimersByTimeAsync(SILERO_WAIT_MS + 100);
    await p;
    e.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(e.kind).toBe("energy");
  });
});
