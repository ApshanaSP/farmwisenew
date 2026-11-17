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

import { flag } from "./flags";

/** The constants to change after a real-room try (docs/thunai/HANDOVER.md has the five-minute checklist). */
export const TUNING = {
  /** the gate's margin above the noise floor, dB */
  marginDb: 12,
  /** extra margin while Jarvis speaks, dB: raise this if Jarvis stops itself */
  echoMarginDb: 8,
  /** a sentence ends after this much quiet, ms (also the value whenever the browser's captions are not running) */
  endOfUtteranceMs: 300,
  /**
   * v6: a SHORT sentence (under shortUtteranceMs of speech so far: "Hi Jarvis", "Go to trends") ends after this much quiet instead, ms;
   * NEXT_PUBLIC_JARVIS_SHORT_EOU_MS overrides it (0 turns it off). A longer sentence, or one whose live words set its own end, is as before.
   * A short sentence cut at a pause is joined to its next part as before (conductor.ts carry), and a name said alone is a call either way
   */
  shortEouMs: 180,
  shortUtteranceMs: 1200,
  /** the captions' words already read as a whole command (the rules are sure, or it ends on a place or a department): ends after this much quiet, ms */
  eouCompleteMs: 300,
  /** the words end on "and", "matrum", "apram", "um", a preposition or an article: the sentence is still going, ends after this much quiet, ms */
  eouOpenMs: 650,
  /** after a hold word the sentence may rest this much longer, ms */
  holdExtendMs: 4000,
  /** the longest single sentence, ms */
  maxUtteranceMs: 14_000,
  /** shorter than this at the end event is a cough, not a sentence, ms */
  minSpeechMs: 250,
  /** speech held this long while Jarvis thinks (no voice yet) cancels the question in flight, ms */
  bargeMs: 200,
  /** speech over Jarvis's voice ducks it; held this long it stops the voice and the turn, ms (shorter speech is read first: "mm-hmm" is not a barge-in) */
  bargeHoldMs: 600,
  /** ...or as soon as the captions' live words hold this many words that are not backchannels ("mm-hmm", "okay", சரி, "seri") */
  bargeWords: 2,
  /** the browser gives up on /hear after this long and the sentence counts as not heard, ms */
  hearTimeoutMs: 6000,
  /** an ambient sentence shorter than this is never sent to transcription, ms */
  ambientMinMs: 400,
  /**
   * v5 (E2, NEXT_PUBLIC_JARVIS_EARLY_STT): an engaged sentence goes to /hear after this much quiet inside it, before its end is decided
   * (the end itself is still endOfUtteranceMs, or eou.ts's values); if the voice comes back first, that request is aborted, ms
   */
  earlySttMs: 150,
  /** ...never for a sentence longer than this so far: it goes at its end, as before, ms */
  earlySttMaxMs: 10_000,
  /** ...and a sentence makes at most this many /hear requests: the last one is kept for the whole sentence at its end */
  earlySttAttempts: 2
} as const;

/** v6: the short sentence's end-of-utterance quiet, ms (TUNING.shortEouMs, or NEXT_PUBLIC_JARVIS_SHORT_EOU_MS; 0 = off) */
export function shortEouMs(v: string | undefined = flag("NEXT_PUBLIC_JARVIS_SHORT_EOU_MS", process.env.NEXT_PUBLIC_JARVIS_SHORT_EOU_MS)): number {
  if (v == null || v.trim() === "") return TUNING.shortEouMs;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, TUNING.endOfUtteranceMs) : TUNING.shortEouMs;
}

/** v6: how much speech still counts as a short sentence, ms (TUNING.shortUtteranceMs, or NEXT_PUBLIC_JARVIS_SHORT_UTT_MS, 0-4000) */
export function shortUtteranceMs(v: string | undefined = flag("NEXT_PUBLIC_JARVIS_SHORT_UTT_MS", process.env.NEXT_PUBLIC_JARVIS_SHORT_UTT_MS)): number {
  const n = v == null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 4000 ? n : TUNING.shortUtteranceMs;
}
/** v6: any other sentence's end-of-utterance quiet, ms (TUNING.endOfUtteranceMs, or NEXT_PUBLIC_JARVIS_EOU_MS, 150-1000) */
export function eouBaseMs(v: string | undefined = flag("NEXT_PUBLIC_JARVIS_EOU_MS", process.env.NEXT_PUBLIC_JARVIS_EOU_MS)): number {
  const n = v == null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 150 && n <= 1000 ? n : TUNING.endOfUtteranceMs;
}

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

/**
 * `strong` (end): how much of the sentence was a voice even over Jarvis's own (frames over the full gate, or Silero at its echo bar,
 * while the voice played; any speech frame when it did not). A ducked voice's residue keeps a detector "in speech" without being a
 * person: only the strong part may stop the voice (turn.ts).
 */
export type VadEvent = { type: "start"; at: number } | { type: "end"; at: number; ms: number; short: boolean; strong?: number } | null;

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
  /** the quiet that ends this sentence, set from its live words (eou.ts); null: the fixed hangover */
  private eou: number | null = null;
  /** the strong part of this sentence (VadEvent's `strong`), and whether Jarvis's voice played at the last frame */
  private strong = 0;
  private echoNow = false;
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
    this.echoNow = echo;
    if (!this.speaking) {
      this.above = db > gate ? this.above + 1 : 0;
      if (this.above >= o.onsetFrames) {
        this.speaking = true;
        this.quietMs = 0;
        // speech began when the level first crossed the gate
        this.startAt = at - (o.onsetFrames - 1) * o.frameMs;
        this.strong = at - this.startAt;
        return { type: "start", at: this.startAt };
      }
      return null;
    }
    // in speech: a lower gate to stay in (hysteresis), so soft word endings do not cut the sentence
    this.quietMs = db > gate - 4 ? 0 : this.quietMs + o.frameMs;
    // over Jarvis's voice only a frame over the full gate is a voice: the band below it is where the voice's own residue sits
    if (echo ? db > gate : db > gate - 4) this.strong += o.frameMs;
    const len = at - this.startAt;
    if (this.quietMs >= (this.eou ?? o.hangoverMs) + this.extraMs || len >= o.maxSpeechMs) {
      this.speaking = false;
      this.above = 0;
      this.extraMs = 0;
      this.eou = null;
      const ms = len - this.quietMs;
      return { type: "end", at, ms, short: ms < o.minSpeechMs, strong: Math.min(ms, this.strong) };
    }
    return null;
  }

  /** The speech so far, ms (0 when quiet); while Jarvis's voice plays, only its strong part (VadEvent's `strong`). */
  heldMs(at: number): number {
    if (!this.speaking) return 0;
    const all = at - this.startAt - this.quietMs;
    return this.echoNow ? Math.min(all, this.strong) : all;
  }
  /** v5 (E2): the quiet heard so far inside a sentence that has not ended, ms (0 outside speech, and when the voice is back) */
  get quiet(): number { return this.speaking ? this.quietMs : 0; }
  /** Listen longer before ending the current or next sentence (a hold word). */
  extend(ms: number) { this.extraMs = ms; }
  /** The quiet that ends the current sentence, from its live words (null: the fixed value). It lasts until that sentence ends. */
  endAfter(ms: number | null) { this.eou = ms; }
  reset() { this.speaking = false; this.above = 0; this.quietMs = 0; this.extraMs = 0; this.eou = null; this.strong = 0; this.echoNow = false; }
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
  private eou: number | null = null;
  /** the strong part of this sentence (VadEvent's `strong`), and whether Jarvis's voice played at the last frame */
  private strong = 0;
  private echoNow = false;
  speaking = false;
  constructor(o: Partial<ProbOpts> = {}) { this.o = { ...PROB_DEFAULTS, ...o }; }
  /** One frame's speech probability (0..1) ending at `at` ms. */
  push(p: number, at: number, echo = false): VadEvent {
    const o = this.o;
    this.echoNow = echo;
    if (!this.speaking) {
      const pos = echo ? o.echoPos : o.pos;
      if (p >= pos) { if (!this.run) this.runStart = at - o.frameMs; this.run++; } else if (p < o.neg) this.run = 0;
      if (this.run >= (echo ? o.echoOnsetFrames : o.onsetFrames)) { this.speaking = true; this.quietMs = 0; this.startAt = this.runStart; this.strong = at - this.runStart; this.run = 0; return { type: "start", at: this.startAt }; }
      return null;
    }
    this.quietMs = p >= o.neg ? 0 : this.quietMs + o.frameMs;
    // over Jarvis's voice (ducked to 20 % on the PCM path, its residue still reads as speech at 0.35 to 0.7) only a frame at the echo
    // bar is a voice over it; with no voice playing, any speech frame counts, as before
    if (p >= (echo ? o.echoPos : o.neg)) this.strong += o.frameMs;
    const len = at - this.startAt;
    // v6: a short sentence ends sooner (shortEou), unless its live words set its end or a hold made it longer
    const shortEou = this.eou == null && !this.extraMs && len - this.quietMs < shortUtteranceMs() ? shortEouMs() : 0;
    // the default hangover follows NEXT_PUBLIC_JARVIS_EOU_MS (a measuring build sets it per run); a VAD made with its own keeps that
    const base = o.hangoverMs === TUNING.endOfUtteranceMs ? eouBaseMs() : o.hangoverMs;
    if (this.quietMs >= (this.eou ?? (shortEou || base)) + this.extraMs || len >= o.maxSpeechMs) {
      this.speaking = false;
      this.extraMs = 0;
      this.eou = null;
      const ms = len - this.quietMs;
      return { type: "end", at, ms, short: ms < o.minSpeechMs, strong: Math.min(ms, this.strong) };
    }
    return null;
  }
  /** The speech so far, ms (0 when quiet); while Jarvis's voice plays, only its strong part, so the voice's own residue never adds up to a barge-in. */
  heldMs(at: number): number {
    if (!this.speaking) return 0;
    const all = at - this.startAt - this.quietMs;
    return this.echoNow ? Math.min(all, this.strong) : all;
  }
  /** v5 (E2): the quiet heard so far inside a sentence that has not ended, ms (0 outside speech, and when the voice is back) */
  get quiet(): number { return this.speaking ? this.quietMs : 0; }
  extend(ms: number) { this.extraMs = ms; }
  endAfter(ms: number | null) { this.eou = ms; }
  reset() { this.speaking = false; this.run = 0; this.quietMs = 0; this.extraMs = 0; this.eou = null; this.strong = 0; this.echoNow = false; }
}
