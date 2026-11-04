/**
 * Jarvis's ears in the browser: one microphone for the whole of Jarvis mode, opened with the browser's echo canceller, noise
 * suppression and gain control, an AudioWorklet that cuts it into 20 ms frames, the voice detectors of lib/thunai/vad.ts on
 * every frame, and a short rolling recording so a sentence can be cut out from just before it began and sent to Whisper as
 * a 16 kHz WAV. Nothing is decided here: events go to the turn machine (lib/thunai/turn.ts), driven by the conductor.
 *
 * Two detectors. The energy gate's onset is the fastest thing there is (60 ms): while Jarvis talks it only pauses the voice.
 * Silero VAD v5 (run here by onnxruntime-web on 32 ms frames at 16 kHz) decides what is speech; where the model cannot load
 * the energy gate decides alone.
 *
 * stop() stops the microphone's tracks: off and muted mean nothing listens. Audio is never stored: the ring holds the last
 * 25 seconds in memory and is dropped at stop(). On the dev console a test stream can stand in for the microphone, so the
 * detector and barge-in are exercised end to end from a known speech start.
 */
import { EnergyVad, frameDb, ProbVad, type VadEvent } from "@/lib/thunai/vad";

export type EarsError = "blocked" | "nomic" | "unsupported" | "failed";

export interface EarsHooks {
  onVad: (e: Exclude<VadEvent, null>, wall: number) => void;
  /** while Jarvis talks: the fast energy gate heard a possible voice (pause now; the model confirms or it resumes) */
  onQuickOnset?: (wall: number) => void;
  /** the energy gate fell quiet again */
  onQuickEnd?: (wall: number) => void;
  /** every frame: the level (0..1) for the HUD, and the speech held so far (ms) */
  onFrame?: (level: number, heldMs: number) => void;
}

declare global {
  interface Window { __jarvisTestStream?: () => Promise<MediaStream> }
}

const KEEP_S = 25;
const PREROLL_MS = 350;

interface Silero { run: (x: Float32Array) => Promise<number> }
let sileroLoad: Promise<Silero | null> | null = null;
/** Load Silero VAD once per page (the runtime's files come from /thunai-ort, the model from /thunai). */
export function loadSilero(): Promise<Silero | null> {
  if (sileroLoad) return sileroLoad;
  sileroLoad = (async () => {
    try {
      const url = "/thunai-ort/ort.wasm.min.mjs";
      const ort = await import(/* webpackIgnore: true */ url);
      ort.env.wasm.wasmPaths = "/thunai-ort/";
      ort.env.wasm.numThreads = 1; // no SharedArrayBuffer, no COOP/COEP
      const sess = await ort.InferenceSession.create("/thunai/silero_vad_v5.onnx", { executionProviders: ["wasm"] });
      const sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(16000)]), []);
      let state = new ort.Tensor("float32", new Float32Array(256), [2, 1, 128]);
      return {
        run: async (x: Float32Array) => {
          const r = await sess.run({ input: new ort.Tensor("float32", x, [1, 512]), state, sr });
          state = r.stateN;
          return Number((r.output.data as Float32Array)[0]);
        }
      };
    } catch (e) {
      console.warn("Jarvis: Silero VAD unavailable, using the energy gate", e);
      return null;
    }
  })();
  return sileroLoad;
}

export class Ears {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private ring: Float32Array[] = [];
  private ringStart = 0; // sample index of ring[0][0]
  private total = 0; // samples seen
  private capFrom: number | null = null;
  private vad = new EnergyVad();
  private prob = new ProbVad();
  private silero: Silero | null = null;
  private s16: number[] = [];
  private acc = { sum: 0, n: 0, pos: 0 };
  private t16 = 0;
  private busy = false;
  private gen = 0;
  /** which detector is deciding */
  kind: "silero" | "energy" = "energy";
  /** the model's last speech probability (dev metrics) */
  p = 0;
  /** Jarvis's own voice is playing (the detectors raise their bar) */
  echo = false;
  level = 0;
  rate = 48000;

  constructor(private hooks: EarsHooks) {}

  /** the browser wants a click before it plays or captures audio */
  get needsGesture() { return this.ctx?.state === "suspended"; }
  resume() { return this.ctx?.resume().catch(() => undefined); }
  /** the tracks are live (the test for "off and muted mean nothing listens") */
  get live() { return !!this.stream?.getTracks().some((t) => t.readyState === "live"); }

  async start(): Promise<void> {
    if (typeof window === "undefined") throw new Error("unsupported");
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) throw new Error("unsupported");
    const my = ++this.gen;
    const test = process.env.NODE_ENV !== "production" ? window.__jarvisTestStream : undefined;
    if (test) this.stream = await test();
    else {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        const n = (e as DOMException).name;
        throw new Error(n === "NotAllowedError" || n === "SecurityError" ? "blocked" : n === "NotFoundError" || n === "OverconstrainedError" ? "nomic" : "failed");
      }
    }
    // stopped while the browser's prompt was open: the microphone goes straight back
    if (my !== this.gen) { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
    const silero = await loadSilero();
    if (my !== this.gen) { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
    this.silero = silero;
    this.kind = this.silero ? "silero" : "energy";
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    this.rate = ctx.sampleRate;
    await ctx.audioWorklet.addModule("/thunai/ears.worklet.js");
    if (my !== this.gen) { void ctx.close().catch(() => undefined); this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
    const src = ctx.createMediaStreamSource(this.stream);
    this.src = src;
    const node = new AudioWorkletNode(ctx, "jarvis-ears", { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node = node;
    src.connect(node);
    node.port.onmessage = (ev: MessageEvent<{ frame: Float32Array; total: number }>) => this.frame(ev.data.frame, ev.data.total);
  }

  private frame(x: Float32Array, total: number) {
    this.ring.push(x);
    this.total = total;
    // keep the last KEEP_S seconds, but never drop what a capture still needs (and never more than KEEP_S + 16 s)
    const keepFrom = Math.max(this.total - (KEEP_S + 16) * this.rate, Math.min(this.total - KEEP_S * this.rate, this.capFrom ?? Infinity));
    while (this.ring.length && this.ringStart + this.ring[0].length < keepFrom) { this.ringStart += this.ring[0].length; this.ring.shift(); }
    if (this.silero) { this.to16(x); this.pump(); }
    const db = frameDb(x);
    const at = (this.total / this.rate) * 1000;
    this.level = Math.max(0, Math.min(1, (db + 60) / 45));
    const e = this.vad.push(db, at, this.echo);
    if (e && !this.silero) this.hooks.onVad(e, performance.now());
    // with the model deciding, the energy gate's onset (faster than 2 model frames) only pauses Jarvis's voice
    else if (e?.type === "start" && this.silero && this.echo) this.hooks.onQuickOnset?.(performance.now());
    else if (e?.type === "end" && this.silero) this.hooks.onQuickEnd?.(performance.now());
    this.hooks.onFrame?.(this.level, this.silero ? this.prob.heldMs(this.t16 / 16) : this.vad.heldMs(at));
  }

  /** Streaming averaging decimation to 16 kHz for the model. */
  private to16(x: Float32Array) {
    const r = this.rate / 16000, a = this.acc;
    for (let i = 0; i < x.length; i++) {
      a.sum += x[i]; a.n++; a.pos++;
      if (a.pos >= r) { this.s16.push(a.sum / a.n); a.sum = 0; a.n = 0; a.pos -= r; }
    }
  }
  /** Run the model on each full 32 ms frame, one at a time, in order. */
  private pump() {
    if (this.busy || !this.silero || this.s16.length < 512) return;
    this.busy = true;
    const x = Float32Array.from(this.s16.splice(0, 512));
    const my = this.gen;
    this.silero.run(x).then((p) => {
      if (my !== this.gen) return;
      this.t16 += 512;
      this.p = p;
      const e = this.prob.push(p, this.t16 / 16, this.echo);
      if (e) this.hooks.onVad(e, performance.now());
    }).catch(() => { this.silero = null; this.kind = "energy"; }).finally(() => { this.busy = false; this.pump(); });
  }

  /** Start keeping the sentence from just before the voice began. */
  capture(startMs?: number | null) {
    if (this.capFrom != null) return;
    // from when the detector says speech began (both clocks count from the first sample), else from now
    const from = startMs != null ? Math.round(((startMs - PREROLL_MS) / 1000) * this.rate) : this.total - Math.round((PREROLL_MS / 1000) * this.rate);
    this.capFrom = Math.max(this.ringStart, Math.min(this.total, from));
  }
  drop() { this.capFrom = null; }
  get capturing() { return this.capFrom != null; }
  /** Listen longer before the sentence ends (a hold word). */
  extend(ms: number) { this.vad.extend(ms); this.prob.extend(ms); }

  /** The captured sentence as a 16 kHz mono 16-bit WAV (null when nothing was captured). */
  take(): Blob | null {
    if (this.capFrom == null) return null;
    const from = this.capFrom;
    this.capFrom = null;
    const n = this.total - from;
    if (n <= 0) return null;
    const pcm = new Float32Array(n);
    let at = this.ringStart, w = 0;
    for (const c of this.ring) {
      const s = Math.max(0, from - at), e = c.length;
      if (s < e) { pcm.set(c.subarray(s, e), w); w += e - s; }
      at += c.length;
    }
    return toWav(downsample(pcm.subarray(0, w), this.rate, 16000), 16000);
  }

  stop() {
    this.gen++;
    try { this.node?.disconnect(); this.src?.disconnect(); } catch { /* already */ }
    if (this.node) this.node.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.ctx = null; this.stream = null; this.node = null; this.src = null; this.ring = []; this.ringStart = 0; this.total = 0; this.capFrom = null;
    this.vad.reset(); this.prob.reset(); this.s16 = []; this.t16 = 0; this.acc = { sum: 0, n: 0, pos: 0 }; this.busy = false; this.level = 0; this.echo = false;
  }
}

/** Averaging decimation to 16 kHz (speech needs nothing above 8 kHz). */
export function downsample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const r = from / to, n = Math.floor(x.length / r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r), b = Math.min(x.length, Math.floor((i + 1) * r));
    let s = 0;
    for (let j = a; j < b; j++) s += x[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

export function toWav(x: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}
