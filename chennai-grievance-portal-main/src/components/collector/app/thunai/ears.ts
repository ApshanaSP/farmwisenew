/**
 * Jarvis's ears in the browser: one microphone for the whole of Jarvis mode, opened with the browser's echo canceller (the classic
 * one, true, by default; with NEXT_PUBLIC_JARVIS_ECHO=all, "all" of the system's playout where the browser has it, Chromium/Edge
 * 141+, else true: echoAsks; echoMode is what the track reports it got), noise suppression and gain control, an AudioWorklet that cuts it into 20 ms frames, the voice detectors of lib/thunai/vad.ts on
 * every frame, and a short rolling recording so a sentence can be cut out from just before it began and sent to Whisper as
 * a 16 kHz WAV. Nothing is decided here: events go to the turn machine (lib/thunai/turn.ts), driven by the conductor.
 *
 * Two detectors. The energy gate's onset is the fastest thing there is (60 ms): while Jarvis talks it only pauses the voice.
 * Silero VAD v5 (run here by onnxruntime-web on 32 ms frames at 16 kHz, each with the 64 samples before it: sileroRunner) decides
 * what is speech; where the model cannot load the energy gate decides alone.
 *
 * stop() stops the microphone's tracks: off and muted mean nothing listens. Audio is never stored: the ring holds the last
 * 25 seconds in memory and is dropped at stop(). On the dev console a test stream can stand in for the microphone, so the
 * detector and barge-in are exercised end to end from a known speech start.
 *
 * v5 (E2, early speech-to-text): onPause when the deciding detector has heard TUNING.earlySttMs (150 ms) of quiet inside a sentence
 * whose end is not decided yet, onResume if the voice comes back first, and peek() gives the sentence so far without ending the
 * capture. The conductor decides what to do with them; the end of utterance is decided here exactly as before.
 */
import { EnergyVad, frameDb, ProbVad, TUNING, type VadEvent } from "@/lib/thunai/vad";
import { Kws, kwsMode, QuietMeter, To16k } from "./kws";

export type EarsError = "blocked" | "nomic" | "unsupported" | "failed";

export interface EarsHooks {
  /**
   * the deciding detector's start or end, at `wall` (performance.now() of the decision); an end also gives `voicedEnd`, the
   * performance.now() of its last voiced sample (the v5 trace's zero, section 6.4)
   */
  onVad: (e: Exclude<VadEvent, null>, wall: number, voicedEnd?: number) => void;
  /** while Jarvis talks: the fast energy gate heard a possible voice (pause now; the model confirms or it resumes) */
  onQuickOnset?: (wall: number) => void;
  /** the energy gate fell quiet again */
  onQuickEnd?: (wall: number) => void;
  /**
   * v5 (E2): the deciding detector has heard TUNING.earlySttMs of quiet inside a sentence whose end is not decided yet (once a quiet
   * run): `voicedEnd` is its last voiced sample (performance.now()), `ms` the speech so far (as an end event's `ms` would give it)
   */
  onPause?: (wall: number, voicedEnd: number, ms: number) => void;
  /** v5 (E2): after onPause the voice came back before the sentence ended */
  onResume?: (wall: number) => void;
  /** every frame: the level (0..1) for the HUD, and the speech held so far (ms) */
  onFrame?: (level: number, heldMs: number) => void;
  /** the microphone went away (unplugged, permission taken back) */
  onDead?: () => void;
  /**
   * v6: the on-device wake word heard "Hey Jarvis" (kws.ts): `at` is the performance.now() of the end of the audio the model had heard
   * when it fired (the audio clock on the page's clock), `score` its confidence
   */
  onWakeWord?: (at: number, score: number) => void;
}

declare global {
  interface Window { __jarvisTestStream?: () => Promise<MediaStream> }
}

const KEEP_S = 25;
const PREROLL_MS = 350;

/** Which echo canceller the microphone got: "all" removes all of the system's playout, speechSynthesis too (Chromium/Edge 141+). */
export type EchoMode = "all" | "remote-only" | "on" | "off" | "unknown" | "test";

/**
 * v5 (D2): the echo cancellation to ask for, in order. The classic canceller (true) by default: on Windows 11 "all" selects a
 * system-loopback canceller that delays the microphone (about 170 ms by default). NEXT_PUBLIC_JARVIS_ECHO=all asks for "all" first
 * (a plain value, never `exact`), then true where the browser refuses it. Whatever is asked, the track's own reading is what counts.
 */
export function echoAsks(flag: string | undefined): ("all" | true)[] {
  return flag === "all" ? ["all", true] : [true];
}

/**
 * The microphone's constraints, with one echo ask (echoAsks) as a plain value wherever the browser knows the constraint at all: a
 * browser that does not know the string "all" reads it as true (WebIDL turns a string into a boolean for ConstrainBoolean), and
 * one that rejects it is asked again with true (Ears.start). Unverified on a real Edge 141 here: no browser is run in this lane.
 */
export function echoAudio(supported: MediaTrackSupportedConstraints | undefined, echo: "all" | true): MediaTrackConstraints {
  return { ...(supported?.echoCancellation ? { echoCancellation: echo as unknown as ConstrainBoolean } : {}), noiseSuppression: true, autoGainControl: true, channelCount: 1 };
}
/** What the track says it got (its settings), for the strip. */
export function echoApplied(settings: MediaTrackSettings | Record<string, unknown> | undefined): EchoMode {
  const v = (settings as { echoCancellation?: unknown } | undefined)?.echoCancellation;
  return v === "all" ? "all" : v === "remote-only" ? "remote-only" : v === true ? "on" : v === false ? "off" : "unknown";
}

interface Silero { run: (x: Float32Array) => Promise<number>; reset: () => void }
interface OrtLike { Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => { data: unknown } }
interface SessLike { run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: unknown }>> }
/** Silero v5 at 16 kHz looks back this many samples before each 512-sample frame (upstream utils_vad.py and vad-web silero.ts) */
export const SILERO_CONTEXT = 64;
/**
 * Silero v5 on one session: its recurrent state carries from frame to frame, and reset() zeroes it (a new session of Jarvis mode).
 * v5 (D1): each frame goes in as [1, 576], the last 64 samples of the frame before (zeros at the start and after reset()) and then
 * the frame itself, as upstream feeds it; v4 fed [1, 512] with no context. NEXT_PUBLIC_JARVIS_VAD_CONTEXT=0 feeds [1, 512] again.
 * A reset() while a frame is still at the model is not undone when that frame comes back.
 */
export function sileroRunner(ort: OrtLike, sess: SessLike, context: boolean = process.env.NEXT_PUBLIC_JARVIS_VAD_CONTEXT !== "0"): Silero {
  const sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(16000)]), []);
  const zero = () => new ort.Tensor("float32", new Float32Array(256), [2, 1, 128]);
  let state = zero();
  let ctx = new Float32Array(SILERO_CONTEXT);
  let gen = 0;
  return {
    run: async (x: Float32Array) => {
      const my = gen;
      let input: Float32Array = x;
      if (context) {
        input = new Float32Array(SILERO_CONTEXT + x.length);
        input.set(ctx, 0);
        input.set(x, SILERO_CONTEXT);
        // the next frame's context is this frame's tail (set now: a reset() while this frame is at the model wins)
        ctx = input.slice(input.length - SILERO_CONTEXT);
      }
      const r = await sess.run({ input: new ort.Tensor("float32", input, [1, input.length]), state, sr });
      if (my === gen) state = r.stateN;
      return Number((r.output.data as Float32Array)[0]);
    },
    reset: () => { gen++; state = zero(); ctx = new Float32Array(SILERO_CONTEXT); }
  };
}

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
      return sileroRunner(ort as OrtLike, sess as SessLike);
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
  /**
   * The audio clock on the page's clock (v5 trace, section 6.4): performance.now() minus the audio time (ms) at each frame's arrival,
   * at its smallest (a frame that reaches the page late is not the clock), let up by 0.02 ms a frame so a slow drift is followed.
   */
  private off: number | null = null;
  /** the deciding detector's last speech start, ms of audio: with an end's `ms`, the end of its last voiced frame */
  private vStart = 0;
  /** v5 (E2): onPause was given for the quiet run going on now (onResume or the end clears it) */
  private inPause = false;
  /** v6: the on-device wake word (kws.ts), fed its own 16 kHz copy of the audio; null when NEXT_PUBLIC_JARVIS_KWS is off or it failed */
  private kws: Kws | null = null;
  private k16: To16k | null = null;
  /** which detector is deciding */
  kind: "silero" | "energy" = "energy";
  /** the model's last speech probability (dev metrics) */
  p = 0;
  /** Jarvis's own voice is playing (the detectors raise their bar) */
  echo = false;
  /** which echo canceller the microphone got (null before it opens) */
  echoMode: EchoMode | null = null;
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
    const test = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_JARVIS_SPEC === "1" ? window.__jarvisTestStream : undefined;
    if (test) { this.stream = await test(); this.echoMode = "test"; }
    else {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const md = navigator.mediaDevices;
      const supported = (() => { try { return md.getSupportedConstraints?.(); } catch { return undefined; } })();
      try {
        // the classic canceller by default; with NEXT_PUBLIC_JARVIS_ECHO=all, all of the system's playout (the browser's own voices too)
        // where the browser can, and the classic one where it refuses that (D2)
        const asks = echoAsks(process.env.NEXT_PUBLIC_JARVIS_ECHO);
        let got: MediaStream | null = null;
        for (let i = 0; !got; i++) {
          try { got = await md.getUserMedia({ audio: echoAudio(supported, asks[i]) }); }
          catch (e) {
            const n = (e as DOMException).name;
            if (i + 1 >= asks.length || (n !== "OverconstrainedError" && n !== "TypeError")) throw e;
          }
        }
        this.stream = got;
      } catch (e) {
        const n = (e as DOMException).name;
        throw new Error(n === "NotAllowedError" || n === "SecurityError" ? "blocked" : n === "NotFoundError" || n === "OverconstrainedError" ? "nomic" : "failed");
      }
      this.echoMode = echoApplied(this.stream?.getAudioTracks()[0]?.getSettings?.());
    }
    // stopped while the browser's prompt was open: the microphone goes straight back
    if (my !== this.gen) { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
    const silero = await loadSilero();
    if (my !== this.gen) { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; return; }
    this.stream?.getTracks().forEach((t) => { t.onended = () => { if (my === this.gen) this.hooks.onDead?.(); }; });
    // a new session of Jarvis mode: the model's memory of the last session's audio is gone
    silero?.reset();
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
    if (this.hooks.onWakeWord && kwsMode() !== "off") {
      this.k16 = new To16k(this.rate);
      const k = new Kws({
        // the sample count the model heard up to, on the page's clock (16 samples a ms from the first frame)
        onWake: (end, score) => { if (my === this.gen) this.hooks.onWakeWord?.(this.off == null ? performance.now() : end / 16 + this.off, score); },
        onFail: () => { if (this.kws === k) { this.kws = null; this.k16 = null; } }
      });
      this.kws = k;
      k.start();
    }
  }
  /** v6: the wake word is listening (its worker is up) */
  get wakeWordLive(): boolean { return !!this.kws?.live; }
  /** v6: ms of quiet the deciding detector has heard since the last voiced frame of the speech going on (0 while voiced or idle) */
  get quietMs(): number { return (this.silero ? this.prob : this.vad).quiet; }
  /** v6: the deciding detector is inside a sentence */
  get inSpeech(): boolean { return (this.silero ? this.prob : this.vad).speaking; }

  private frame(x: Float32Array, total: number) {
    this.ring.push(x);
    this.total = total;
    // keep the last KEEP_S seconds, but never drop what a capture still needs (and never more than KEEP_S + 16 s)
    const keepFrom = Math.max(this.total - (KEEP_S + 16) * this.rate, Math.min(this.total - KEEP_S * this.rate, this.capFrom ?? Infinity));
    while (this.ring.length && this.ringStart + this.ring[0].length < keepFrom) { this.ringStart += this.ring[0].length; this.ring.shift(); }
    const at = (this.total / this.rate) * 1000;
    const off = performance.now() - at;
    this.off = this.off == null ? off : Math.min(off, this.off + 0.02);
    if (this.silero) { this.to16(x); this.pump(); }
    if (this.kws && this.k16) this.kws.feed(this.k16.push(x));
    const db = frameDb(x);
    this.level = Math.max(0, Math.min(1, (db + 60) / 45));
    const e = this.vad.push(db, at, this.echo);
    if (e && !this.silero) this.decided(e);
    // with the model deciding, the energy gate's onset (faster than 2 model frames) only pauses Jarvis's voice
    else if (e?.type === "start" && this.silero && this.echo) this.hooks.onQuickOnset?.(performance.now());
    else if (e?.type === "end" && this.silero) this.hooks.onQuickEnd?.(performance.now());
    if (!this.silero) this.quietWatch(this.vad, at);
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
      if (e) this.decided(e);
      this.quietWatch(this.prob, this.t16 / 16);
    }).catch(() => { this.silero = null; this.kind = "energy"; }).finally(() => { this.busy = false; this.pump(); });
  }
  /**
   * The deciding detector's event, with the decision's time; an end also carries its last voiced sample on the page's clock (the
   * start plus the speech's length is the end of its last voiced frame, before the quiet that ended it): the trace's zero.
   */
  private decided(e: Exclude<VadEvent, null>) {
    const wall = performance.now();
    if (e.type === "start") { this.vStart = e.at; this.hooks.onVad(e, wall); return; }
    const voiced = this.off == null ? wall : Math.min(wall, this.vStart + e.ms + this.off);
    this.hooks.onVad(e, wall, voiced);
  }
  /**
   * v5 (E2): the deciding detector's quiet inside a sentence whose end is not decided yet. At TUNING.earlySttMs of it, onPause (once a
   * quiet run) with the last voiced sample and the speech so far, both as the end event would give them; the voice back first,
   * onResume. Nothing here decides the end: the detector does, as before.
   */
  private quietWatch(d: { speaking: boolean; quiet: number }, at: number) {
    if (!d.speaking) { this.inPause = false; return; }
    const q = d.quiet;
    if (q <= 0) {
      if (this.inPause) { this.inPause = false; this.hooks.onResume?.(performance.now()); }
      return;
    }
    if (this.inPause || q < TUNING.earlySttMs) return;
    this.inPause = true;
    const wall = performance.now();
    this.hooks.onPause?.(wall, this.off == null ? wall - q : Math.min(wall, at - q + this.off), Math.max(0, at - q - this.vStart));
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
  /** The quiet that ends the current sentence, from its live words (eou.ts); null: the fixed value. */
  endAfter(ms: number | null) { this.vad.endAfter(ms); this.prob.endAfter(ms); }

  /** The captured sentence as a 16 kHz mono 16-bit WAV (null when nothing was captured). */
  take(): Blob | null {
    if (this.capFrom == null) return null;
    const from = this.capFrom;
    this.capFrom = null;
    return this.wavFrom(from);
  }
  /**
   * v5 (E2): the sentence captured so far, as take() would give it now, while the capture goes on (an early upload): take() at the
   * end still gives the whole sentence. Null when nothing is being captured.
   */
  peek(): Blob | null {
    return this.capFrom == null ? null : this.wavFrom(this.capFrom);
  }
  private wavFrom(from: number): Blob | null {
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
    this.off = null; this.vStart = 0; this.inPause = false;
    this.kws?.stop(); this.kws = null; this.k16 = null;
  }
}

/**
 * v6: the wake word while Jarvis is closed (NEXT_PUBLIC_JARVIS_KWS=all, the default). A microphone, the same worklet and the on-device
 * wake word only: no detector, no ring, no recording, nothing uploaded; the audio goes nowhere but the wake word's worker on this
 * page. The browser's own recogniser (wake.ts) still listens beside it for "Hi Jarvis", which this model does not catch.
 */
export class WakeEars {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private kws: Kws | null = null;
  private off: number | null = null;
  private gen = 0;
  private meter = new QuietMeter();
  constructor(private onWake: (at: number) => void) {}
  get live(): boolean { return !!this.kws?.live; }
  /** v6: ms since the last voiced frame on this listener's own audio (whether the Collector paused after the name) */
  get quietMs(): number { return this.meter.quietMs(performance.now()); }
  async start(): Promise<boolean> {
    if (typeof window === "undefined" || kwsMode() !== "all") return false;
    const W = window as unknown as { AudioContext?: typeof AudioContext };
    if (!W.AudioContext) return false;
    const my = ++this.gen;
    try {
      const test = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_JARVIS_SPEC === "1" ? window.__jarvisTestStream : undefined;
      this.stream = test ? await test() : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (my !== this.gen) { this.release(); return false; }
      const ctx = new W.AudioContext();
      this.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      await ctx.audioWorklet.addModule("/thunai/ears.worklet.js");
      if (my !== this.gen) { this.release(); return false; }
      const k16 = new To16k(ctx.sampleRate), rate = ctx.sampleRate;
      const k = new Kws({ onWake: (end) => { if (my === this.gen) this.onWake(this.off == null ? performance.now() : end / 16 + this.off); }, onFail: () => this.stop() });
      this.kws = k;
      k.start();
      const node = new AudioWorkletNode(ctx, "jarvis-ears", { numberOfInputs: 1, numberOfOutputs: 0 });
      this.node = node;
      ctx.createMediaStreamSource(this.stream).connect(node);
      node.port.onmessage = (ev: MessageEvent<{ frame: Float32Array; total: number }>) => {
        const off = performance.now() - (ev.data.total / rate) * 1000;
        this.off = this.off == null ? off : Math.min(off, this.off + 0.02);
        k.feed(k16.push(ev.data.frame));
        this.meter.push(ev.data.frame, performance.now());
      };
      return true;
    } catch {
      this.release();
      return false;
    }
  }
  private release() {
    try { this.node?.disconnect(); } catch { /* gone */ }
    if (this.node) this.node.port.onmessage = null;
    this.kws?.stop();
    // the page's test stream is shared with the ears: only a real microphone's tracks are stopped here
    if (this.stream && !(typeof window !== "undefined" && window.__jarvisTestStream)) this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null; this.stream = null; this.node = null; this.kws = null; this.off = null;
  }
  stop() { this.gen++; this.release(); }
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
