/**
 * The conductor: the one object between the ears, the turn machine (lib/thunai/turn.ts), the mouth and the console while
 * Jarvis mode is on. It feeds events to turn() and carries out its actions; the rules are all in turn.ts and addressed.ts,
 * tested without a browser. Here: the microphone, transcripts going out and coming back under a generation id, the
 * self-hearing guard, the address gate, and the listening budget.
 */
import { addressed, levelAllowed, namedIn, selfHeard, type Addressed } from "@/lib/thunai/addressed";
import { turn, turnStart, type TurnEvent, type TurnModel, type TurnState } from "@/lib/thunai/turn";
import { TUNING } from "@/lib/thunai/vad";
import { Ears, type EarsError } from "./ears";
import { canContinue, continueAnswer, nowSaying, pauseVoice, resumeVoice, setMouthHooks, speaking, stopVoice, type VoicePath } from "./mouth";
import { canWake, startWake } from "./wake";

export const AMBIENT_PER_MIN = 8;

export interface HeardLine {
  text: string; lang: "en" | "ta"; gate: Addressed;
  /** "whisper" or typed text can say yes to a level B card; browser captions never can (they can catch Jarvis's own voice) */
  source: "whisper" | "captions";
  gen: number;
  /** a question cancelled for speech that turned out not to be for Jarvis, asked again with its own gate */
  again?: boolean;
}

export interface ConductorHooks {
  hearUrl: () => string;
  siteLang: () => "en" | "ta";
  /** a sentence that passed the gate */
  onSentence: (h: HeardLine) => void;
  /** abort the question in flight and bump the turn's generation */
  cancelTurn: () => void;
  /** a sentence the gate turned away: a faint line for two seconds, not logged */
  onIgnored: (text: string) => void;
  onState: (s: TurnState) => void;
  /** mic level, 0..1, every frame */
  onLevel?: (v: number) => void;
  /** what has been heard so far, or that a sentence is being read */
  onHearing?: (what: "speech" | "reading" | "idle") => void;
  onBudget?: (b: { low: boolean; ambient: number }) => void;
  onFail?: (why: EarsError | "gesture") => void;
  onEndSession?: () => void;
  onHold?: () => void;
  /** the name alone ("Jarvis", and a pause): it listens on, engaged; the next sentence is the request */
  onNameOnly?: () => void;
  /** does the rules layer resolve this sentence with confidence and slots, and does it name something of the district? */
  rules: (text: string) => { sure: boolean; districtNoun: boolean };
  /** when Jarvis last finished a turn */
  lastTurnAt: () => number | null;
  onVoice?: (e: "start" | "end", path?: VoicePath, ack?: boolean) => void;
  /** whether the transcriber could be reached */
  onReach?: (ok: boolean) => void;
  /** dev metrics: barge-in marks, the detector's fire times */
  mark?: (name: string, t: number) => void;
}

export class Conductor {
  private m: TurnModel = turnStart();
  private ears: Ears | null = null;
  private ambient: number[] = [];
  private lastEnd: { ms: number; start: number } = { ms: 0, start: 0 };
  private speechStart = 0;
  private holdT: ReturnType<typeof setTimeout> | null = null;
  /** what Jarvis was saying when the speech began (for the self-hearing guard, once the voice has stopped) */
  private sayingAtOnset: string | null = null;
  private inflight: AbortController | null = null;
  private wakeStop: (() => void) | null = null;
  private budgetLow = false;
  private budgetT: ReturnType<typeof setTimeout> | null = null;
  private captionsStop: (() => void) | null = null;
  private earconUntil = 0;
  starting = false;

  constructor(private h: ConductorHooks) {
    setMouthHooks({
      onStart: (p, ack) => { this.h.onVoice?.("start", p, ack); this.dispatch({ type: "ttsStart", ack }); },
      onEnd: (ack) => { this.h.onVoice?.("end"); this.dispatch({ type: "ttsEnd", ack }); }
    });
  }

  get state(): TurnState { return this.m.state; }
  get micLive(): boolean { return !!this.ears?.live; }
  get needsGesture(): boolean { return !!this.ears?.needsGesture; }
  get detector(): "silero" | "energy" | null { return this.ears?.kind ?? null; }
  get generation(): number { return this.m.gen; }

  /** Open the microphone. Throws an EarsError message when it cannot. */
  async open(): Promise<void> {
    if (this.ears) return;
    this.starting = true;
    const e = new Ears({
      onVad: (ev, wall) => {
        if (!ev) return;
        if (ev.type === "start") { this.speechStart = ev.at; this.h.mark?.("vadStart", wall); this.noteOnset(); this.dispatch({ type: "vadStart", at: ev.at }); this.h.onHearing?.("speech"); }
        else { this.lastEnd = { ms: ev.ms, start: this.speechStart }; this.h.mark?.("vadEnd", wall); this.dispatch({ type: "vadEnd", at: ev.at, ms: ev.ms, short: ev.short }); }
      },
      // speech over the voice: the capture starts here, not at the start of the sentence before
      onQuickOnset: (wall) => { if (this.m.state === "speaking") this.speechStart = 0; this.h.mark?.("quickOnset", wall); this.noteOnset(); this.dispatch({ type: "quickOnset", at: wall }); },
      onQuickEnd: (wall) => { this.dispatch({ type: "quickEnd", at: wall }); },
      onDead: () => { if (this.ears === e) this.h.onFail?.("failed"); },
      onFrame: (level, held) => {
        this.h.onLevel?.(level);
        if (this.ears) this.ears.echo = speaking() || performance.now() < this.earconUntil;
        if (held > 0 && (this.m.state === "paused" || this.m.state === "hearing")) this.dispatch({ type: "tick", at: performance.now(), heldMs: held });
      }
    });
    this.ears = e;
    try {
      await e.start();
    } catch (err) {
      // the microphone may already be open when a later step fails: its tracks stop here
      e.stop();
      if (this.ears === e) this.ears = null;
      this.starting = false;
      this.h.onFail?.((err as Error).message as EarsError);
      throw err;
    }
    this.starting = false;
    if (this.ears !== e) { e.stop(); return; }
    if (e.needsGesture) this.h.onFail?.("gesture");
    this.dispatch({ type: "open" });
    // the strip's count is this minute's, so it falls as the minute passes
    this.pruneT = setInterval(() => {
      const n = this.ambient.length;
      this.ambient = this.ambient.filter((t) => Date.now() - t < 60_000);
      if (this.ambient.length !== n) this.h.onBudget?.({ low: this.budgetLow, ambient: this.ambient.length });
    }, 5000);
  }

  /** The microphone closes: tracks stopped, nothing listens. */
  close() {
    this.dispatch({ type: "close" });
    this.ears?.stop();
    this.ears = null;
    this.inflight?.abort();
    this.inflight = null;
    this.wakeStop?.(); this.wakeStop = null;
    this.captionsStop?.(); this.captionsStop = null;
    if (this.holdT) { clearTimeout(this.holdT); this.holdT = null; }
    if (this.budgetT) { clearTimeout(this.budgetT); this.budgetT = null; }
    if (this.pruneT) { clearInterval(this.pruneT); this.pruneT = null; }
    this.budgetLow = false;
    this.cancelled = null;
    this.current = null;
    this.h.onBudget?.({ low: false, ambient: this.ambient.length });
    this.h.onLevel?.(0);
  }

  resumeAudio() { return this.ears?.resume(); }
  /** Esc, or the HUD's stop: everything stops at once; the frame stays. */
  stop() {
    if (this.m.state !== "off") this.dispatch({ type: "stop" });
    this.cancelled = null;
    if (this.holdT) { clearTimeout(this.holdT); this.holdT = null; }
    this.ears?.extend(0);
  }
  /** An earcon is playing: it must not count as speech. */
  earcon(ms = 400) { this.earconUntil = performance.now() + ms; }
  /** The answer had nothing to say. */
  answered() { this.dispatch({ type: "answered" }); }

  private noteOnset() {
    const now = nowSaying();
    if (now) this.sayingAtOnset = now;
  }

  dispatch(e: TurnEvent) {
    const before = this.m.state, wasHandling = this.m.handling;
    const r = turn(this.m, e);
    this.m = r.m;
    for (const a of r.act) {
      switch (a.a) {
        case "pauseVoice": pauseVoice(); this.h.mark?.("paused", performance.now()); break;
        case "resumeVoice": resumeVoice(); this.sayingAtOnset = null; break;
        case "cancelVoice": stopVoice(); this.h.mark?.("cancelled", performance.now()); break;
        case "cancelTurn": this.inflight?.abort(); this.inflight = null; this.h.cancelTurn(); if (wasHandling && this.current) this.cancelled = this.current; break;
        case "capture": this.ears?.capture(this.speechStart || null); break;
        case "dropCapture": this.ears?.drop(); this.h.onHearing?.("idle"); this.sayingAtOnset = null; break;
        case "transcribe": void this.transcribe(a.gen); break;
        case "hold":
          this.ears?.extend(a.ms);
          this.h.onHold?.();
          if (this.holdT) clearTimeout(this.holdT);
          // the longer listening is for this hold: it does not outlive it into the next sentence
          this.holdT = setTimeout(() => { this.holdT = null; if (this.m.state === "holding") this.ears?.extend(0); this.dispatch({ type: "holdOver" }); }, a.ms);
          break;
        case "resumeAnswer": if (!continueAnswer()) this.dispatch({ type: "ttsEnd" }); break;
        case "endSession": this.h.onEndSession?.(); break;
        case "handle": {
          const p = this.pending;
          this.pending = null;
          if (p) { this.current = { ...p, text: a.text }; this.h.onSentence({ ...p, text: a.text, gen: a.gen }); }
          break;
        }
      }
    }
    if (this.m.state !== before) this.h.onState(this.m.state);
    // a noise cancelled the question and was then too short to be a sentence: no transcript will come, so it is asked again here
    if (e.type === "vadEnd" && this.m.state === "listening" && this.cancelled) this.backOn(false);
  }
  private pending: Omit<HeardLine, "text" | "gen"> | null = null;
  /** the sentence handed on last, with its gate and source */
  private current: Omit<HeardLine, "gen"> | null = null;
  /** that sentence, when speech cancelled it in flight: it comes back only if the speech proves not to be for Jarvis */
  private cancelled: Omit<HeardLine, "gen"> | null = null;
  private pruneT: ReturnType<typeof setInterval> | null = null;

  private laneNow(): "engaged" | "ambient" {
    const last = Math.max(this.h.lastTurnAt() ?? 0, this.engaged), spokenOver = !!this.sayingAtOnset || this.m.bargeIns > 0 && canContinue();
    return spokenOver || (last > 0 && Date.now() - last <= 20_000) ? "engaged" : "ambient";
  }

  /** A low budget: tell the user once, and for a minute the browser's free recognition listens for the name only. */
  private setBudgetLow(ambient: number) {
    if (!this.budgetLow) {
      this.budgetLow = true;
      this.h.onBudget?.({ low: true, ambient });
      this.listenForName();
    }
    // the window is a minute from when it went low, and is not pushed back by more talk: nonstop talk must not keep unnamed
    // commands out for good
    if (!this.budgetT) this.budgetT = setTimeout(() => {
      this.budgetT = null;
      this.budgetLow = false;
      this.wakeStop?.(); this.wakeStop = null;
      this.h.onBudget?.({ low: false, ambient: 0 });
    }, 60_000);
  }
  private listenForName() {
    if (!canWake() || this.wakeStop) return;
    this.wakeStop = startWake({
      onWake: (rest) => {
        this.wakeStop = null;
        this.engage();
        // it said the name, so the gate sees the name
        if (rest) this.fromCaptions(`Jarvis, ${rest}`); else this.h.onNameOnly?.();
        if (this.budgetLow) this.listenForName();
      },
      onFail: () => { this.wakeStop = null; }
    });
  }
  /** The name was heard: the next sentences are engaged. */
  private engaged = 0;
  private engage() { this.engaged = Date.now(); this.h.onBudget?.({ low: this.budgetLow, ambient: this.ambient.length }); }
  private fromCaptions(text: string) {
    const lang = /[஀-௿]/.test(text) ? "ta" : "en";
    // the same gate as Whisper's words: side talk goes no further than this browser
    const gate = this.gateFor(text);
    if (!gate.act) { this.h.onIgnored(text); return; }
    this.pending = { lang, source: "captions", gate };
    if (this.m.state === "listening") this.m = { ...this.m, awaiting: true, state: "thinking" };
    this.dispatch({ type: "text", text: gate.text, gen: this.m.gen });
  }

  private gateFor(text: string): Addressed {
    const r = this.h.rules(text);
    const last = Math.max(this.h.lastTurnAt() ?? 0, this.engaged) || null;
    // talking over Jarvis counts as engaged: it was speaking a moment ago
    const over = this.sayingAtOnset ? Date.now() : last;
    return addressed({ text, lastTurnAt: over, now: Date.now(), rulesSure: r.sure, districtNoun: r.districtNoun });
  }

  private async transcribe(gen: number) {
    const e = this.ears;
    if (!e) return;
    const lane = this.laneNow();
    if (lane === "ambient") {
      // an ambient sentence too short to be a request, or over the budget, never leaves this browser
      const now = Date.now();
      this.ambient = this.ambient.filter((t) => now - t < 60_000);
      if (this.lastEnd.ms < TUNING.ambientMinMs) { e.drop(); this.dispatch({ type: "text", text: "", gen }); this.h.onHearing?.("idle"); return; }
      if (this.budgetLow || this.ambient.length >= AMBIENT_PER_MIN) { e.drop(); this.setBudgetLow(this.ambient.length); this.dispatch({ type: "text", text: "", gen }); this.h.onHearing?.("idle"); return; }
      this.ambient.push(now);
      this.h.onBudget?.({ low: false, ambient: this.ambient.length });
    }
    const wav = e.take();
    if (!wav) { this.dispatch({ type: "text", text: "", gen }); return; }
    this.h.onHearing?.("reading");
    const ctl = new AbortController();
    this.inflight = ctl;
    const t0 = performance.now();
    try {
      let j = await this.post(wav, lane, ctl.signal);
      // Whisper is back: the fallback stops, or a sentence would be handled twice
      this.h.onReach?.(true);
      this.captionsStop?.(); this.captionsStop = null;
      if (j.budget === "low") { this.setBudgetLow(this.ambient.length); this.dispatch({ type: "text", text: "", gen }); return; }
      // said to Jarvis by name, read in one language only and unsure: read it again in both before acting
      if (lane === "ambient" && j.text && namedIn(j.text) != null && (j.conf?.logprob ?? 0) < -0.7) {
        const again = await this.post(wav, "named", ctl.signal).catch(() => j);
        if (again.text) j = again;
      }
      this.h.mark?.("transcribed", t0 + (performance.now() - t0));
      this.accept(j.text ?? "", j.lang ?? this.h.siteLang(), gen, "whisper");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // Whisper is not reachable: the browser's recogniser hears in the site's language, typed text always works
      this.h.onReach?.(false);
      this.startCaptions();
      this.dispatch({ type: "text", text: "", gen });
    } finally {
      this.h.onHearing?.("idle");
      if (this.inflight === ctl) this.inflight = null;
    }
  }

  private async post(wav: Blob, lane: string, signal: AbortSignal) {
    const r = await fetch(`${this.h.hearUrl()}?lane=${lane}&lang=${this.h.siteLang()}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav, signal });
    if (r.status === 429) return { text: "", lang: this.h.siteLang(), budget: "low" as const };
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as { text: string; lang: "en" | "ta"; noise?: boolean; budget?: "low"; conf?: { logprob: number } };
  }

  private accept(text: string, lang: "en" | "ta", gen: number, source: "whisper" | "captions") {
    const saying = this.sayingAtOnset ?? nowSaying();
    const interrupted = !!this.sayingAtOnset;
    this.sayingAtOnset = null;
    const t = text.trim();
    // Jarvis's own voice, heard back: not a sentence
    if (t && selfHeard(t, saying)) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    if (!t) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    // "Jarvis" and a pause: the end of utterance is short, so the name often arrives alone. It is not a request
    if (namedIn(t) === "") {
      this.engage();
      this.h.onNameOnly?.();
      this.dispatch({ type: "text", text: "", gen });
      return;
    }
    const gate = this.gateFor(t);
    if (!gate.act) {
      this.h.onIgnored(t);
      this.dispatch({ type: "text", text: "", gen });
      this.backOn(interrupted);
      return;
    }
    this.pending = { lang, source, gate };
    this.forgetCancelled();
    this.dispatch({ type: "text", text: gate.text, gen });
  }

  /** The speech that cut Jarvis off was not for it: the answer goes on from its chunk, a cancelled question is asked again. */
  private backOn(interrupted: boolean) {
    if (interrupted && continueAnswer()) { this.m = { ...this.m, state: "speaking" }; this.h.onState("speaking"); return; }
    const r = this.cancelled;
    this.cancelled = null;
    if (!r) return;
    this.current = r;
    this.m = { ...this.m, state: "thinking", handling: true };
    this.h.onState("thinking");
    this.h.onSentence({ ...r, gen: this.m.gen, again: true });
  }
  /** Tell the turn machine a new sentence was taken: nothing cancelled earlier comes back after it. */
  private forgetCancelled() { this.cancelled = null; }

  /** Whisper unavailable: the browser's recogniser, in the site's language, for as long as the mic is open. Its "yes" never counts. */
  private startCaptions() {
    if (this.captionsStop) return;
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return;
    let stopped = false;
    const go = () => {
      if (stopped) return;
      const r = new R();
      r.lang = this.h.siteLang() === "ta" ? "ta-IN" : "en-IN";
      r.continuous = true; r.interimResults = false;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal && t.length > 1 && !speaking()) this.fromCaptions(t);
        }
      };
      r.onend = () => { if (!stopped) setTimeout(go, 300); };
      r.onerror = () => undefined;
      try { r.start(); } catch { /* already */ }
      this.captionsStop = () => { stopped = true; try { r.abort(); } catch { /* ended */ } };
    };
    go();
  }
}
export { levelAllowed };

type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
