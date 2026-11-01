/**
 * Jarvis's ears. One microphone stream, three jobs:
 *   - asleep: the browser's recogniser listens for the name ("Hi Jarvis", wake.ts). Nothing is sent anywhere.
 *   - awake (a conversation): a voice detector cuts each spoken sentence out of the stream (it learns the room's noise
 *     level, so a fan, traffic or a door is not speech) and sends only that sentence to api/jarvis/hear (Whisper),
 *     which returns the words and whether they were Tamil or English. Clips Whisper calls noise come back empty and
 *     are dropped, so Jarvis answers only what was said to it.
 *   - muted while Jarvis thinks or speaks, so it never answers itself.
 * The sentence in which the name was said is kept: "Hi Jarvis, அடையாறு நிலவரம் சொல்லு" in one breath is heard whole,
 * in its own language. Where the microphone or Whisper is not available, the browser's recogniser does the hearing
 * (in the site's language).
 */
import { canWake, startWake, wakeIn } from "./wake";
import { micBusy } from "../assistant/speech";

export type EarsMode = "off" | "asleep" | "awake";
export interface Heard { text: string; lang: "en" | "ta"; ms: number }
export interface EarsOpts {
  /** the name was heard while asleep (the conversation starts) */
  onWake: () => void;
  /** a sentence said to Jarvis while awake (the name, if said with it, already taken out) */
  onHeard: (h: Heard) => void;
  /** speech started / a sentence is being read by Whisper / done: for the panel's "Hearing…" */
  onActivity?: (a: "speech" | "reading" | "idle") => void;
  /** the microphone level, 0-1, about 20 times a second while awake */
  onLevel?: (v: number) => void;
  onFail?: (why: string) => void;
  /** the Collector started talking over Jarvis (clearly louder than the room, for half a second): Jarvis should stop */
  onBargeIn?: () => void;
  siteLang: () => "en" | "ta";
}

const RATE = 16000;
/** the ears listening on this page now */
let live: Ears | null = null;
const FRAME = 2048;

/** 16 kHz mono WAV from the captured samples (resampled from the device's rate) */
function toWav(chunks: Float32Array[], from: number): ArrayBuffer {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = from / RATE, len = Math.floor(n / ratio);
  const buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
  const w = (p: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    // a simple average over the samples each output sample stands for (enough for speech)
    const a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio));
    let s = 0; for (let k = a; k < b; k++) s += all[k];
    const x = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

export class Ears {
  mode: EarsMode = "off";
  private o: EarsOpts;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private stopWake: (() => void) | null = null;
  private muted = false;
  private floor = 0.004;
  private speaking = false;
  private loud = 0;
  private quiet = 0;
  private voiced = 0;
  private chunks: Float32Array[] = [];
  private pre: Float32Array[] = [];
  /** the last sentence heard while asleep, kept a few seconds in case the name was in it */
  private last: { chunks: Float32Array[]; at: number } | null = null;
  private whisperOk = true;
  private fallbackStop: (() => void) | null = null;
  private levelT = 0;
  private over = 0;

  constructor(o: EarsOpts) { this.o = o; }

  /** Open the microphone and listen for the name. False when the microphone is blocked or missing. */
  async start(): Promise<boolean> {
    if (this.mode !== "off" || this.dead) return !this.dead;
    if (this.starting) return this.starting;
    this.starting = this.open();
    const ok = await this.starting;
    this.starting = null;
    return ok;
  }
  private starting: Promise<boolean> | null = null;
  /** stopped for good (a start still opening the microphone releases it) */
  private dead = false;

  private async open(): Promise<boolean> {
    // one pair of ears per page: another one still listening is stopped first
    if (live && live !== this) live.stop();
    live = this;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      this.o.onFail?.((e as Error).name === "NotAllowedError" ? "not-allowed" : "no-mic");
      return false;
    }
    if (this.dead) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; return false; }
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext!;
    this.ctx = new AC();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(FRAME, 1, 1);
    this.node.onaudioprocess = (e) => this.frame(e.inputBuffer.getChannelData(0));
    src.connect(this.node);
    // a silent output keeps the processor running in every browser
    const g = this.ctx.createGain(); g.gain.value = 0; this.node.connect(g).connect(this.ctx.destination);
    this.mode = "asleep";
    this.listenForName();
    // the browser starts sound only after a click on the page: the first click (or key) lets Jarvis hear
    if (this.ctx.state !== "running") {
      const go = () => { void this.ctx?.resume(); };
      window.addEventListener("pointerdown", go, { once: true, capture: true });
      window.addEventListener("keydown", go, { once: true, capture: true });
    }
    return true;
  }
  /** a sentence is being said or read right now (Jarvis does not greet over it) */
  get busy() { return this.speaking || this.reading > 0; }
  private reading = 0;
  /** can the voice detector hear (false until the page has had a click, in some browsers) */
  get hearing() { return this.ctx?.state === "running"; }

  /** The conversation starts (the name was said, or the Jarvis button pressed). */
  wake() {
    if (this.mode === "off" || this.mode === "awake") return;
    void this.ctx?.resume();
    this.mode = "awake";
    this.stopWake?.(); this.stopWake = null;
    // a sentence still being said goes on being recorded (the name was in it)
    if (!this.speaking) this.reset();
    if (!this.whisperOk) this.startFallback();
  }
  /** The conversation ends: back to waiting for the name. */
  sleep() {
    if (this.mode === "off") return;
    this.mode = "asleep";
    this.fallbackStop?.(); this.fallbackStop = null;
    this.reset();
    this.o.onLevel?.(0);
    this.listenForName();
  }
  /** Not listening while Jarvis thinks or speaks (a sentence started then is dropped). */
  mute(on: boolean) {
    this.muted = on;
    if (on) { this.reset(); this.o.onActivity?.("idle"); }
  }
  stop() {
    this.dead = true;
    if (live === this) live = null;
    this.mode = "off";
    this.stopWake?.(); this.stopWake = null;
    this.fallbackStop?.(); this.fallbackStop = null;
    try { this.node?.disconnect(); } catch { /* gone */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.node = null; this.stream = null; this.ctx = null;
  }

  private reset() { this.speaking = false; this.loud = 0; this.quiet = 0; this.voiced = 0; this.chunks = []; }

  private listenForName() {
    if (this.stopWake || !canWake()) return;
    const go = () => {
      this.stopWake = startWake({
        onWake: (rest) => {
          this.stopWake = null;
          if (this.mode !== "asleep") return;
          const still = this.speaking;
          this.wake();
          this.o.onWake();
          // the sentence with the name in it is read whole, in its own language: when it ends if it is still being
          // said, at once if it has just ended; the recogniser's own words only when there is no recording
          if (still) { this.namedNext = true; this.restNext = rest; return; }
          if (this.last && Date.now() - this.last.at < 3500) { const l = this.last; this.last = null; void this.read(l.chunks, true, rest); }
          else if (rest) this.o.onHeard({ text: rest, lang: /[஀-௿]/.test(rest) ? "ta" : "en", ms: 0 });
        },
        onFail: (why) => { this.stopWake = null; this.o.onFail?.(why); }
      });
    };
    go();
  }
  /** the name was heard in the middle of a sentence: that sentence is read whole when it ends */
  private namedNext = false;
  private restNext = "";

  private frame(x: Float32Array) {
    if (this.mode === "off") return;
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / x.length);
    const copy = new Float32Array(x);
    const now = performance.now();
    // dev only: the detector's numbers, for the end-to-end test
    if (process.env.NODE_ENV !== "production") (window as unknown as { __jvEars?: unknown }).__jvEars = { mode: this.mode, rms: +rms.toFixed(4), floor: +this.floor.toFixed(4), speaking: this.speaking, muted: this.muted, max: Math.max(rms, ((window as unknown as { __jvEars?: { max?: number } }).__jvEars?.max ?? 0)) };
    if (this.mode === "awake" && now - this.levelT > 50) { this.levelT = now; this.o.onLevel?.(this.muted ? 0 : Math.min(1, rms * 12)); }
    if (this.muted && this.mode === "awake") {
      // talking over Jarvis: a voice clearly above the room (Jarvis's own voice is mostly taken out by echo cancellation)
      // for about half a second stops it, and the sentence is recorded from its start
      this.pre.push(copy); if (this.pre.length > 12) this.pre.shift();
      this.over = rms > Math.max(this.floor * 6, 0.035) ? this.over + 1 : Math.max(0, this.over - 1);
      if (this.over >= 11 && this.o.onBargeIn) {
        this.over = 0; this.muted = false;
        this.speaking = true; this.chunks = [...this.pre]; this.voiced = 11; this.quiet = 0;
        this.o.onActivity?.("speech");
        this.o.onBargeIn();
      }
      return;
    }
    this.over = 0;
    // the room's own noise level, learned while nobody speaks
    if (!this.speaking) this.floor = Math.max(0.0015, Math.min(0.05, this.floor * 0.97 + rms * 0.03));
    const on = rms > Math.max(this.floor * 3, 0.01), off = rms < Math.max(this.floor * 1.8, 0.006);
    if (!this.speaking) {
      this.pre.push(copy); if (this.pre.length > 8) this.pre.shift();
      this.loud = on ? this.loud + 1 : 0;
      if (this.loud >= 3) {
        this.speaking = true; this.chunks = [...this.pre]; this.voiced = this.loud; this.quiet = 0;
        if (this.mode === "awake") this.o.onActivity?.("speech");
      }
      return;
    }
    this.chunks.push(copy);
    if (on) { this.voiced++; this.quiet = 0; } else if (off) this.quiet++;
    const secs = (this.chunks.length * FRAME) / (this.ctx?.sampleRate ?? 48000);
    // the sentence ends after about 0.8 s of quiet, or at 14 s
    if (this.quiet >= 18 || secs > 14) {
      const chunks = this.chunks, voiced = this.voiced;
      this.reset();
      // too short to be a question: a cough, a click, a word in the next room
      if (voiced < 9) { if (this.mode === "awake") this.o.onActivity?.("idle"); return; }
      if (this.mode === "asleep") { this.last = { chunks, at: Date.now() }; void this.checkName(chunks); return; }
      const named = this.namedNext, rest = this.restNext;
      this.namedNext = false; this.restNext = "";
      void this.read(chunks, named, rest);
    }
  }

  private checks: number[] = [];
  /**
   * While resting: a short sentence (up to 5 s) is read by Whisper only to find the name ("Hi Jarvis", "ஹாய் ஜார்விஸ்").
   * At most one every 2 s and 15 a minute; a sentence without the name is thrown away. This does not depend on the
   * browser's own recogniser, which some PCs block while the microphone is in use.
   */
  private async checkName(chunks: Float32Array[]) {
    if (!this.ctx || !this.whisperOk) return;
    const secs = (chunks.length * FRAME) / this.ctx.sampleRate;
    const now = Date.now();
    this.checks = this.checks.filter((t) => now - t < 60_000);
    if (secs > 5.5 || this.checks.length >= 15 || (this.checks.length && now - this.checks[this.checks.length - 1] < 2000)) return;
    this.checks.push(now);
    const sent = Date.now();
    try {
      const r = await fetch(`/api/jarvis/hear?wake=1&lang=${this.o.siteLang()}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(chunks, this.ctx.sampleRate) });
      if (!r.ok || this.mode !== "asleep") return;
      const j = (await r.json()) as { text: string; lang: "en" | "ta"; noise: boolean };
      const rest = j.text ? wakeIn(j.text) : null;
      if (rest == null) return;
      this.stopWake?.(); this.stopWake = null;
      // a sentence said after the name, already finished while the name was being checked, is the question
      const after = this.last && this.last.at > sent ? this.last : null;
      this.last = null;
      this.wake();
      this.o.onWake();
      if (rest) this.o.onHeard({ text: rest, lang: j.lang, ms: 0 });
      else if (after) void this.read(after.chunks, false, "");
    } catch { /* offline: the browser's recogniser still listens */ }
  }

  /** Whisper reads one sentence; `named`: the name may be in it and is taken out */
  private async read(chunks: Float32Array[], named: boolean, rest: string) {
    this.reading++;
    try { await this.readOnce(chunks, named, rest); } finally { this.reading--; }
  }
  private async readOnce(chunks: Float32Array[], named: boolean, rest: string) {
    if (!this.ctx) return;
    this.o.onActivity?.("reading");
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/jarvis/hear?lang=${this.o.siteLang()}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(chunks, this.ctx.sampleRate) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { text: string; lang: "en" | "ta"; noise: boolean };
      this.o.onActivity?.("idle");
      let text = j.text;
      if (named) { const w = wakeIn(text); if (w != null) text = w; }
      if (!text || j.noise) { if (named && rest) this.o.onHeard({ text: rest, lang: "en", ms: 0 }); return; }
      // "bye Jarvis" and "that's all" end the conversation (Jarvis says so)
      this.o.onHeard({ text, lang: j.lang, ms: Math.round(performance.now() - t0) });
    } catch {
      this.o.onActivity?.("idle");
      // Whisper is not reachable: the browser's recogniser hears from now on, in the site's language
      this.whisperOk = false;
      if (named && rest) this.o.onHeard({ text: rest, lang: /[஀-௿]/.test(rest) ? "ta" : "en", ms: 0 });
      if (this.mode === "awake") this.startFallback();
    }
  }

  /** the browser's recogniser, continuous, while awake (only when Whisper cannot be used) */
  private startFallback() {
    if (this.fallbackStop) return;
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return;
    let stopped = false;
    const go = () => {
      if (stopped || this.mode !== "awake") return;
      const r = new R();
      r.lang = this.o.siteLang() === "ta" ? "ta-IN" : "en-IN";
      r.continuous = true; r.interimResults = false;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal && t.length > 1 && !this.muted) this.o.onHeard({ text: t, lang: /[஀-௿]/.test(t) ? "ta" : "en", ms: 0 });
        }
      };
      r.onend = () => { micBusy(false); if (!stopped) setTimeout(go, 200); };
      r.onerror = () => undefined;
      try { micBusy(true); r.start(); } catch { micBusy(false); }
      this.fallbackStop = () => { stopped = true; try { r.abort(); } catch { /* ended */ } };
    };
    go();
  }
}

type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
