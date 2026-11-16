/**
 * Test doubles for the voice tests (mouth.v4.test.ts, pcmplay.v4.test.ts, voice.v4.test.ts): a Web Audio context whose clock and
 * "ended" events the test drives, and a speechSynthesis that speaks when the test says. Not used by the app.
 */
type Call = [string, ...number[]];

export class FakeParam {
  value = 1;
  calls: Call[] = [];
  cancelScheduledValues(t: number) { this.calls.push(["cancel", t]); }
  setValueAtTime(v: number, t: number) { this.calls.push(["set", v, t]); this.value = v; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(["linear", v, t]); }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push(["exp", v, t]); }
  setTargetAtTime(v: number, t: number, c: number) { this.calls.push(["target", v, t, c]); }
}
export class FakeNode {
  out: unknown[] = [];
  connect<T>(n: T): T { this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
export class FakeGain extends FakeNode { gain = new FakeParam(); }
export class FakeBuffer {
  data: Float32Array;
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) { this.data = new Float32Array(length); }
  get duration() { return this.length / this.sampleRate; }
  getChannelData() { return this.data; }
}
export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  started: [number, number] | null = null;
  stopped: number | null = null;
  constructor(private c: FakeCtx) { super(); }
  start(at = 0, off = 0) { this.started = [at, off]; this.c.sources.push(this); }
  stop(t = 0) { this.stopped = t; }
  /** the test says this clip has played to its end */
  end() { this.onended?.(); }
}
export class FakeOsc extends FakeNode {
  type = "";
  frequency = new FakeParam();
  starts: number[] = [];
  stops: number[] = [];
  start(t = 0) { this.starts.push(t); }
  stop(t = 0) { this.stops.push(t); }
}
export class FakeCtx {
  static all: FakeCtx[] = [];
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "running";
  baseLatency = 0.01;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  oscs: FakeOsc[] = [];
  /** seconds of audio decodeAudioData hands back */
  static decodedSeconds = 2;
  constructor() { FakeCtx.all.push(this); }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createAnalyser() { return Object.assign(new FakeNode(), { fftSize: 0, smoothingTimeConstant: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(0) }); }
  createBufferSource() { return new FakeSource(this); }
  createBuffer(ch: number, n: number, rate: number) { return new FakeBuffer(ch, n, rate); }
  createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o; }
  async decodeAudioData(_: ArrayBuffer) { return new FakeBuffer(1, Math.round(24_000 * FakeCtx.decodedSeconds), 24_000); }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

/** A voice the fake synthesiser lists. */
export interface FakeVoice { name: string; lang: string; localService?: boolean }
export class FakeUtterance {
  lang = ""; voice: FakeVoice | null = null; rate = 1; pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null; onboundary: ((e: { name: string; charIndex: number }) => void) | null = null;
  constructor(public text: string) {}
}
export class FakeSynth {
  queue: FakeUtterance[] = [];
  said: string[] = [];
  paused = false;
  cancels = 0;
  /** what `pause()` does: "honour" sets paused, "ignore" leaves it false (a voice that does not pause) */
  pauseMode: "honour" | "ignore" = "honour";
  constructor(public voices: FakeVoice[] = []) {}
  get speaking() { return this.queue.length > 0; }
  getVoices() { return this.voices; }
  addEventListener() { /* voices are listed at once */ }
  removeEventListener() { /* nothing */ }
  speak(u: FakeUtterance) { this.queue.push(u); this.said.push(u.text); }
  cancel() { this.cancels++; const q = this.queue; this.queue = []; for (const u of q) u.onerror?.({ error: "canceled" }); }
  pause() { if (this.pauseMode === "honour") this.paused = true; }
  resume() { this.paused = false; }
  /** the test says the utterance being spoken has ended */
  finish() { const u = this.queue.shift(); u?.onend?.(); }
}

/** A WAV reply (its bytes do not matter: the fake context decodes any to FakeCtx.decodedSeconds of audio). */
export const wavReply = () => new Response(new Uint8Array(64), { status: 200, headers: { "content-type": "audio/wav" } });

/** A streamed 16-bit PCM reply, in the pieces given (each piece's bytes as they arrive). */
export function l16Reply(pieces: Uint8Array[], rate = 24_000): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({ pull(c) { if (i < pieces.length) c.enqueue(pieces[i++]); else c.close(); } });
  return new Response(body, { status: 200, headers: { "content-type": `audio/l16; rate=${rate}` } });
}
