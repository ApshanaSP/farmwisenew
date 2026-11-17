/**
 * v6, the on-device wake word. "Hey Jarvis" is caught in the browser, in its own worker (public/thunai/kws.worker.js), from the same
 * microphone audio the ears already have: no audio leaves the page for it. The model is LiveKit WakeWord's `hey_jarvis.onnx`
 * (Apache-2.0, code and weights: public/thunai/LICENSE-livekit-wakeword.txt), run by the onnxruntime-web the page already serves
 * (/thunai-ort/), loaded by the worker itself, so nothing is installed and Silero's runtime is not touched (v5's C5 clash came from
 * installing the npm package).
 *
 * Measured offline on the v6 clips (scripts/jarvis6/kws-offline.mjs, eval/v6/kws/): "Hey Jarvis" in three synthetic voices caught 3/3,
 * 30-40 ms after the last voiced sample, no fire on 48 commands and questions; "Hi Jarvis" and "Hello Jarvis" score 0.003-0.144 and
 * are NOT caught (the model was trained on "hey jarvis"). "Hi Jarvis" keeps its own path (the browser's recogniser while closed,
 * Whisper while open); a "hi jarvis" model needs LiveKit's training (a LiveKit Cloud account and a CUDA GPU): the owner's decision.
 *
 * NEXT_PUBLIC_JARVIS_KWS: "all" (default: open, and while closed alongside the browser's own wake), "open" (only while Jarvis is
 * open), "off" (v5). NEXT_PUBLIC_JARVIS_KWS_THRESHOLD: the score that wakes, default 0.5 (LiveKit's default).
 */

import { flag } from "@/lib/thunai/flags";

export type KwsMode = "all" | "open" | "off";
export function kwsMode(v: string | undefined = flag("NEXT_PUBLIC_JARVIS_KWS", process.env.NEXT_PUBLIC_JARVIS_KWS)): KwsMode {
  const s = (v ?? "").trim().toLowerCase();
  return s === "off" || s === "0" ? "off" : s === "open" ? "open" : "all";
}
export function kwsThreshold(v: string | undefined = flag("NEXT_PUBLIC_JARVIS_KWS_THRESHOLD", process.env.NEXT_PUBLIC_JARVIS_KWS_THRESHOLD)): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.5;
}
export const KWS_MODEL = "/thunai/hey_jarvis.onnx";
/** after a wake, the same phrase cannot wake again for this long (it is one call, not two) */
export const KWS_COOLDOWN_MS = 1500;

/**
 * Streaming decimation to 16 kHz by averaging (as the ears do for Silero), kept apart from Silero's own so neither disturbs the other.
 * Returns the new 16 kHz samples of this frame.
 */
export class To16k {
  private sum = 0; private n = 0; private pos = 0;
  constructor(private rate: number) {}
  push(x: Float32Array): Float32Array {
    const r = this.rate / 16000, out: number[] = [];
    for (let i = 0; i < x.length; i++) {
      this.sum += x[i]; this.n++; this.pos++;
      if (this.pos >= r) { out.push(this.sum / this.n); this.sum = 0; this.n = 0; this.pos -= r; }
    }
    return Float32Array.from(out);
  }
}

export interface KwsHooks {
  /** "Hey Jarvis" was heard: `end` is the 16 kHz sample count the model had heard up to; `score` its confidence */
  onWake: (end: number, score: number) => void;
  /** the worker could not start (no WebAssembly, the model missing): the wake word is simply off */
  onFail?: (why: string) => void;
}

/** One wake-word listener: feed it 16 kHz audio as it comes; it says when it heard the name. */
export class Kws {
  private w: Worker | null = null;
  private ready = false;
  private count = 0;
  private buf: number[] = [];
  constructor(private hooks: KwsHooks, private threshold = kwsThreshold()) {}

  start(): void {
    if (this.w || typeof Worker === "undefined") return;
    try {
      const w = new Worker("/thunai/kws.worker.js", { type: "module" });
      this.w = w;
      w.onmessage = (ev: MessageEvent<{ type: string; score?: number; end?: number; why?: string }>) => {
        const m = ev.data;
        if (m.type === "ready") this.ready = true;
        else if (m.type === "error") { this.hooks.onFail?.(m.why ?? "error"); this.stop(); }
        else if (m.type === "wake" && m.end != null) this.hooks.onWake(m.end, m.score ?? 1);
      };
      w.onerror = () => { this.hooks.onFail?.("worker"); this.stop(); };
      w.postMessage({ type: "init", model: KWS_MODEL, ort: "/thunai-ort/", threshold: this.threshold, cooldownMs: KWS_COOLDOWN_MS });
    } catch (e) {
      this.hooks.onFail?.((e as Error).message ?? "worker");
      this.w = null;
    }
  }

  /** 16 kHz samples, in order; sent to the worker in 80 ms batches (one model step each) */
  feed(x: Float32Array): void {
    if (!this.w) return;
    for (let i = 0; i < x.length; i++) this.buf.push(x[i]);
    this.count += x.length;
    if (this.buf.length < 1280 || !this.ready) { if (!this.ready && this.buf.length > 16000) this.buf.splice(0, this.buf.length - 16000); return; }
    const samples = Float32Array.from(this.buf);
    this.buf = [];
    this.w.postMessage({ type: "audio", samples, end: this.count }, [samples.buffer]);
  }

  /** forget what was heard (a new session) */
  reset(): void { this.buf = []; this.w?.postMessage({ type: "reset" }); }
  get samples(): number { return this.count; }
  get live(): boolean { return !!this.w && this.ready; }

  stop(): void {
    try { this.w?.terminate(); } catch { /* gone */ }
    this.w = null; this.ready = false; this.buf = [];
  }
}

/**
 * v6 (the independent check, 17 Nov): closed, the on-device wake word fires at the name. If the Collector then pauses, Jarvis opens and
 * replies at once; if they go straight on ("Hey Jarvis, show the severe cases"), the sentence is the browser recogniser's to bring whole
 * (its `rest`, as v5 did), so Jarvis does not open over it and lose its words. QuietMeter tells the two apart on the wake listener's own
 * audio: quiet since the last frame well above the room's floor.
 */
export class QuietMeter {
  private lastVoiced: number | null = null;
  /** the quietest frame of each 100 ms over the last 2 s: the room's floor is their minimum (a fresh track's digital silence is left out:
   *  the v6c closed run's floor started 60 dB low on it and the room read as speech for seconds) */
  private mins: { at: number; db: number }[] = [];
  /** one frame of audio at `now` (ms, the page clock) */
  push(frame: Float32Array, now: number) {
    let s = 0;
    for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
    const db = 10 * Math.log10(s / Math.max(1, frame.length) + 1e-12);
    if (db < -100) return;
    const slot = Math.floor(now / 100) * 100;
    const last = this.mins[this.mins.length - 1];
    if (last && last.at === slot) last.db = Math.min(last.db, db); else this.mins.push({ at: slot, db });
    while (this.mins.length && this.mins[0].at < slot - 2000) this.mins.shift();
    const floor = Math.min(...this.mins.map((m) => m.db));
    if (db > floor + 15) this.lastVoiced = now;
  }
  /** ms since the last voiced frame (Infinity: none yet) */
  quietMs(now: number): number { return this.lastVoiced == null ? Infinity : Math.max(0, now - this.lastVoiced); }
}
/** how long after the name a pause still means "the name alone", ms; and how long the recogniser may take to bring a sentence */
export const WAKE_NAME_ALONE_MS = 400;
export const WAKE_SENTENCE_WAIT_MS = 4000;
/** open now (and reply), or wait for the recogniser's sentence */
export function wakeWait(o: { sinceKws: number; quietMs: number; recogniser: boolean; quietNeeded: number }): "open" | "wait" {
  if (!o.recogniser) return "open";
  if (o.sinceKws <= WAKE_NAME_ALONE_MS && o.quietMs >= o.quietNeeded) return "open";
  if (o.sinceKws >= WAKE_SENTENCE_WAIT_MS) return "open";
  return "wait";
}
