/**
 * Jarvis's voice detectors, as pure code (no browser objects, so every rule is unit-tested). Ported from the thunai/v3
 * branch, which measured them: an adaptive energy gate over 20 ms frames (pause p50 about 90 ms from known speech start) and
 * thresholds over Silero's speech probability per 32 ms frame (p50 about 250 ms alone). Barge-in uses both: the gate pauses
 * at once, Silero confirms (turn.ts). While Jarvis is talking the margin is raised (the echo canceller leaves some of its
 * voice in the microphone).
 *
 * All the tuning lives in TUNING, in milliseconds; the frame counts are derived from the real frame length, so they do not
 * drift with the device's sample rate.
 */

/** The constants to change after a real-room try (docs/thunai/HANDOVER.md has the five-minute checklist). */
export const TUNING = {
  /** the gate's margin above the noise floor, dB */
  marginDb: 12,
  /** extra margin while Jarvis speaks, dB: raise this if Jarvis stops itself */
  echoMarginDb: 8,
  /** a sentence ends after this much quiet, ms */
  endOfUtteranceMs: 300,
  /** after a hold word the sentence may rest this much longer, ms */
  holdExtendMs: 4000,
  /** the longest single sentence, ms */
  maxUtteranceMs: 14_000,
  /** shorter than this at the end event is a cough, not a sentence, ms */
  minSpeechMs: 250,
  /** speech held this long while Jarvis talks cancels the turn, ms */
  bargeMs: 200,
  /** an ambient sentence shorter than this is never sent to transcription, ms */
  ambientMinMs: 400
} as const;

export interface VadOpts {
  /** frame length, ms */
  frameMs: number;
  /** dB above the noise floor that counts as voice */
  margin: number;
  /** extra margin while Jarvis is speaking */
  echoMargin: number;
  /** frames above the gate before speech starts */
  onsetFrames: number;
  /** quiet after speech before it ends, ms */
  hangoverMs: number;
  /** the floor window, ms */
  floorMs: number;
  /** a floor never below this (digital silence would make every breath "speech") */
  minFloorDb: number;
  /** speech shorter than this is a noise, not a sentence */
  minSpeechMs: number;
  /** the longest single sentence, ms (the turn is closed at this length) */
  maxSpeechMs: number;
}

export const VAD_DEFAULTS: VadOpts = {
  frameMs: 20, margin: TUNING.marginDb, echoMargin: TUNING.echoMarginDb, onsetFrames: 3, hangoverMs: TUNING.endOfUtteranceMs, floorMs: 1500, minFloorDb: -70,
  minSpeechMs: TUNING.minSpeechMs, maxSpeechMs: TUNING.maxUtteranceMs
};

export type VadEvent = { type: "start"; at: number } | { type: "end"; at: number; ms: number; short: boolean } | null;

/** RMS of a frame of samples, in dBFS (-100 for silence). */
export function frameDb(samples: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  const rms = Math.sqrt(s / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export class EnergyVad {
  readonly o: VadOpts;
  private hist: number[] = [];
  private above = 0;
  private quietMs = 0;
  private startAt = 0;
  /** a hold word gave the Collector longer to think: the end of this sentence waits this much more */
  private extraMs = 0;
  speaking = false;
  /** the current noise floor, dB */
  floor = -60;
  constructor(o: Partial<VadOpts> = {}) { this.o = { ...VAD_DEFAULTS, ...o }; }

  /** One frame's level (dBFS) at time `at` (ms); `echo` while Jarvis's own voice is playing. */
  push(db: number, at: number, echo = false): VadEvent {
    const o = this.o;
    // the floor learns only from frames that are not speech, so a long sentence does not raise it
    if (!this.speaking) {
      this.hist.push(db);
      const keep = Math.round(o.floorMs / o.frameMs);
      if (this.hist.length > keep) this.hist.splice(0, this.hist.length - keep);
      const sorted = [...this.hist].sort((a, b) => a - b);
      this.floor = Math.max(o.minFloorDb, sorted[Math.floor(sorted.length * 0.1)] ?? db);
    }
    const gate = this.floor + o.margin + (echo ? o.echoMargin : 0);
    if (!this.speaking) {
      this.above = db > gate ? this.above + 1 : 0;
      if (this.above >= o.onsetFrames) {
        this.speaking = true;
        this.quietMs = 0;
        // speech began when the level first crossed the gate
        this.startAt = at - (o.onsetFrames - 1) * o.frameMs;
        return { type: "start", at: this.startAt };
      }
      return null;
    }
    // in speech: a lower gate to stay in (hysteresis), so soft word endings do not cut the sentence
    this.quietMs = db > gate - 4 ? 0 : this.quietMs + o.frameMs;
    const len = at - this.startAt;
    if (this.quietMs >= o.hangoverMs + this.extraMs || len >= o.maxSpeechMs) {
      this.speaking = false;
      this.above = 0;
      this.extraMs = 0;
      const ms = len - this.quietMs;
      return { type: "end", at, ms, short: ms < o.minSpeechMs };
    }
    return null;
  }

  /** The speech so far, ms (0 when quiet). */
  heldMs(at: number): number { return this.speaking ? at - this.startAt - this.quietMs : 0; }
  /** Listen longer before ending the current or next sentence (a hold word). */
  extend(ms: number) { this.extraMs = ms; }
  reset() { this.speaking = false; this.above = 0; this.quietMs = 0; this.extraMs = 0; }
}

/**
 * The same events from a neural detector's speech probability per frame (Silero VAD v5: 512 samples at 16 kHz = 32 ms).
 * On thunai/v3 it missed 0 of 14 sentences in 5 dB noise where the gate missed 13, and a 120 ms burst or a step in the
 * noise did not trigger it. In at 0.5, out below 0.35; while Jarvis speaks, in at 0.7 after 2 frames.
 */
export interface ProbOpts { frameMs: number; pos: number; neg: number; echoPos: number; onsetFrames: number; echoOnsetFrames: number; hangoverMs: number; minSpeechMs: number; maxSpeechMs: number }
export const PROB_DEFAULTS: ProbOpts = { frameMs: 32, pos: 0.5, neg: 0.35, echoPos: 0.7, onsetFrames: 3, echoOnsetFrames: 2, hangoverMs: TUNING.endOfUtteranceMs, minSpeechMs: TUNING.minSpeechMs, maxSpeechMs: TUNING.maxUtteranceMs };

export class ProbVad {
  readonly o: ProbOpts;
  private run = 0;
  private runStart = 0;
  private quietMs = 0;
  private startAt = 0;
  private extraMs = 0;
  speaking = false;
  constructor(o: Partial<ProbOpts> = {}) { this.o = { ...PROB_DEFAULTS, ...o }; }
  /** One frame's speech probability (0..1) ending at `at` ms. */
  push(p: number, at: number, echo = false): VadEvent {
    const o = this.o;
    if (!this.speaking) {
      const pos = echo ? o.echoPos : o.pos;
      if (p >= pos) { if (!this.run) this.runStart = at - o.frameMs; this.run++; } else if (p < o.neg) this.run = 0;
      if (this.run >= (echo ? o.echoOnsetFrames : o.onsetFrames)) { this.speaking = true; this.quietMs = 0; this.startAt = this.runStart; this.run = 0; return { type: "start", at: this.startAt }; }
      return null;
    }
    this.quietMs = p >= o.neg ? 0 : this.quietMs + o.frameMs;
    const len = at - this.startAt;
    if (this.quietMs >= o.hangoverMs + this.extraMs || len >= o.maxSpeechMs) {
      this.speaking = false;
      this.extraMs = 0;
      const ms = len - this.quietMs;
      return { type: "end", at, ms, short: ms < o.minSpeechMs };
    }
    return null;
  }
  heldMs(at: number): number { return this.speaking ? at - this.startAt - this.quietMs : 0; }
  extend(ms: number) { this.extraMs = ms; }
  reset() { this.speaking = false; this.run = 0; this.quietMs = 0; this.extraMs = 0; }
}
