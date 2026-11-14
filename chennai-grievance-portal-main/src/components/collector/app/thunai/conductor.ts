/**
 * The conductor: the one object between the ears, the turn machine (lib/thunai/turn.ts), the mouth and the console while
 * Jarvis mode is on. It feeds events to turn() and carries out its actions; the rules are all in turn.ts and addressed.ts,
 * tested without a browser. Here: the microphone, transcripts going out and coming back under a generation id, the
 * self-hearing guard, the address gate, and the listening budget.
 *
 * v4 (lane L4, "ears"):
 *  - /hear gives up after TUNING.hearTimeoutMs (6 s): the sentence counts as not heard (onMissed), so "Working on it" never hangs.
 *  - A sentence that goes on while its first part is still at Whisper is never posted again: the first part's reading is kept
 *    (not aborted) and joined to the second part's (lib/thunai/heard.ts). The browser no longer re-posts an unsure named sentence:
 *    the server reads it once more in the other language itself (stt.ts).
 *  - Each line carries the server's language and an honest confidence (confOf), and the open Stage's names go with the audio.
 *  - Captions only while hearing: onSpeechStart at the onset (with whether the turn is engaged) and onSpeechEnd at its end, on
 *    stop and on close, so the browser's recogniser runs only then. Its live words come back through partial(): they set when the
 *    sentence ends (eou.ts) and can stop Jarvis's voice (two words that are not backchannels).
 *  - Barge-in ducks the voice (mouth.ts duckVoice) and stops it only for a real bid for the turn (turn.ts). Earcons never count.
 */
import { addressed, levelAllowed, namedIn, selfHeard, type Addressed } from "@/lib/thunai/addressed";
import { eouFor, tails, type EouWhy } from "@/lib/thunai/eou";
import { confOf, joinHeard, type HearReply } from "@/lib/thunai/heard";
import { turn, turnStart, type TurnEvent, type TurnModel, type TurnState } from "@/lib/thunai/turn";
import { TUNING } from "@/lib/thunai/vad";
import { Ears, type EarsError, type EchoMode } from "./ears";
import { canContinue, continueAnswer, duckVoice, EARCON_GUARD_MS, nowSaying, setMouthHooks, speaking, stopVoice, unduckVoice, type VoicePath } from "./mouth";
import { canWake, startWake } from "./wake";

export const AMBIENT_PER_MIN = 8;
/** the browser's recogniser gives no usable confidence in continuous mode: its lines are marked unsure */
const CAPTIONS_CONF = 0.5;

export interface HeardLine {
  text: string;
  /** the language the server heard it in (Whisper's forced decode that won, or the captions' script) */
  lang: "en" | "ta";
  gate: Addressed;
  /** "whisper" or typed text can say yes to a level B card; browser captions never can (they can catch Jarvis's own voice) */
  source: "whisper" | "captions";
  /**
   * how sure the transcriber was, 0..1: P(speech) x exp(Whisper's mean log-probability) (lib/thunai/heard.ts confOf); about
   * 0.73-0.89 for a clean decode, 0.47 when only the third racer was sure, 0.5 for the browser's captions, 0.95 when the server
   * sent none
   */
  conf: number;
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
  /** names on the open Stage (zones, localities, departments; at most 30, short): sent with the audio so Whisper and Gemini expect them */
  vocab?: () => string[];
  /** an ask card is waiting for a yes: a "yes" said over Jarvis's voice is then an answer, not a backchannel */
  wantsYes?: () => boolean;
  /** speech began (VAD onset): the browser's captions may start now. `engaged`: the turn is engaged by the lane's reckoning */
  onSpeechStart?: (o: { engaged: boolean }) => void;
  /** the speech ended (also on stop and close): the captions stop */
  onSpeechEnd?: () => void;
  /** a sentence the transcriber did not answer in time: it counts as not heard (a calm "I didn't catch that" is the console's) */
  onMissed?: (why: "timeout") => void;
}

/** one sentence's transcription: its own request, and the reading of the part before it when the sentence was said in two */
interface Post {
  gen: number; ctl: AbortController; p: Promise<HearReply | null>;
  /** its words go with the next part of the sentence (that part's transcription joins them) */
  carried: boolean; done: boolean; delivered: boolean;
  out: { j: HearReply | null; own: "ok" | "timeout" | "abort" | "error" } | null;
}
class HearTimeout extends Error { constructor() { super("timeout"); this.name = "HearTimeout"; } }

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
  /** the latest transcription, while its words are still to come */
  private live: Post | null = null;
  /** an earlier part of the sentence, still at Whisper when the next part began */
  private carry: Post | null = null;
  private posts = new Set<Post>();
  private wakeStop: (() => void) | null = null;
  private budgetLow = false;
  private budgetT: ReturnType<typeof setTimeout> | null = null;
  private captionsStop: (() => void) | null = null;
  private earconUntil = 0;
  /** speech is being heard (between onSpeechStart and onSpeechEnd) */
  private speechOpen = false;
  private partialText = "";
  private eou: EouWhy | null = null;
  starting = false;

  constructor(private h: ConductorHooks) {
    setMouthHooks({
      onStart: (p, ack) => { this.h.onVoice?.("start", p, ack); this.dispatch({ type: "ttsStart", ack }); },
      onEnd: (ack) => { this.h.onVoice?.("end"); this.dispatch({ type: "ttsEnd", ack }); },
      // the end-of-speech earcon plays only once the ears know it is Jarvis's own sound
      onEarcon: (ms) => this.earcon(ms),
      onDuck: (d) => this.h.mark?.(`duck:${d.path}:${d.how}`, performance.now())
    });
  }

  get state(): TurnState { return this.m.state; }
  get micLive(): boolean { return !!this.ears?.live; }
  get needsGesture(): boolean { return !!this.ears?.needsGesture; }
  get detector(): "silero" | "energy" | null { return this.ears?.kind ?? null; }
  /** which echo canceller the microphone got: "all" (all of the system's playout, Chromium/Edge 141+), "on" (the classic one)... */
  get echoCancel(): EchoMode | null { return this.ears?.echoMode ?? null; }
  /** what decided the end of the current or last sentence: the captions' words (open, complete, neutral) or none */
  get endReason(): EouWhy | null { return this.eou; }
  get generation(): number { return this.m.gen; }

  /** Open the microphone. Throws an EarsError message when it cannot. */
  async open(): Promise<void> {
    if (this.ears) return;
    this.starting = true;
    const e = new Ears({
      onVad: (ev, wall) => {
        if (!ev) return;
        if (ev.type === "start") {
          // Jarvis's own earcon is not the Collector's voice
          if (this.earconOn()) return;
          // each part of a sentence is captured from its own start: a part still at Whisper is joined, never posted again
          this.speechStart = ev.at;
          this.h.mark?.("vadStart", wall); this.noteOnset(); this.speechBegan(); this.dispatch({ type: "vadStart", at: ev.at }); this.h.onHearing?.("speech");
        } else {
          this.lastEnd = { ms: ev.ms, start: this.speechStart }; this.h.mark?.("vadEnd", wall); this.dispatch({ type: "vadEnd", at: ev.at, ms: ev.ms, short: ev.short });
          this.speechEnded();
        }
      },
      // speech over the voice: the capture starts here, not at the start of the sentence before
      onQuickOnset: (wall) => {
        if (this.earconOn()) return;
        const was = this.m.state;
        if (was === "speaking") this.speechStart = 0;
        this.h.mark?.("quickOnset", wall); this.noteOnset(); this.dispatch({ type: "quickOnset", at: wall });
        if (was === "speaking" && this.m.state === "paused") this.speechBegan();
      },
      onQuickEnd: (wall) => {
        const was = this.m.state;
        this.dispatch({ type: "quickEnd", at: wall });
        // the gate's sound was not a voice: the voice is back up and nothing is being heard
        if (was === "paused" && this.m.state !== "paused") this.speechEnded();
      },
      onDead: () => { if (this.ears === e) this.h.onFail?.("failed"); },
      onFrame: (level, held) => {
        this.h.onLevel?.(level);
        if (this.ears) this.ears.echo = speaking() || this.earconOn();
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
    this.speechEnded();
    this.ears?.stop();
    this.ears = null;
    this.inflight?.abort();
    this.inflight = null;
    for (const p of this.posts) p.ctl.abort();
    this.posts.clear(); this.carry = null; this.live = null;
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
    this.speechEnded();
    this.cancelled = null;
    if (this.holdT) { clearTimeout(this.holdT); this.holdT = null; }
    this.ears?.extend(0);
  }
  /** An earcon is playing: it must not count as speech (VAD onsets inside the window are ignored). */
  earcon(ms: number = EARCON_GUARD_MS) { this.earconUntil = performance.now() + ms; }
  private earconOn() { return performance.now() < this.earconUntil; }
  /** The answer had nothing to say. */
  answered() { this.dispatch({ type: "answered" }); }

  /**
   * The browser captions' live words for the speech being heard (the console runs the recogniser between onSpeechStart and
   * onSpeechEnd). Never acted on: they set when the sentence ends (eou.ts), and over Jarvis's voice two words that are not
   * backchannels stop it (turn.ts). Jarvis's own words caught by the captions are left out.
   */
  partial(text: string) {
    const t = text.trim();
    if (!this.speechOpen || !this.ears || !t || t === this.partialText) return;
    if (selfHeard(t, this.sayingAtOnset ?? nowSaying())) return;
    this.partialText = t;
    if (this.m.state === "paused") this.dispatch({ type: "words", text: t });
    const r = this.h.rules(t);
    // "ends in a district noun": a place or department in the sentence that is also its last word or two
    const endsInNoun = !r.sure && r.districtNoun && tails(t).some((x) => this.h.rules(x).districtNoun);
    const end = eouFor(t, { sure: r.sure, endsInNoun });
    this.eou = end.why;
    this.ears?.endAfter(end.ms);
  }

  private noteOnset() {
    const now = nowSaying();
    if (now) this.sayingAtOnset = now;
  }
  private speechBegan() {
    if (this.speechOpen) return;
    this.speechOpen = true;
    this.partialText = "";
    this.eou = null;
    this.h.onSpeechStart?.({ engaged: this.laneNow() === "engaged" });
  }
  private speechEnded() {
    if (!this.speechOpen) return;
    this.speechOpen = false;
    this.partialText = "";
    this.h.onSpeechEnd?.();
  }

  dispatch(e: TurnEvent) {
    const before = this.m.state, wasHandling = this.m.handling;
    const r = turn(this.m, e);
    this.m = r.m;
    for (const a of r.act) {
      switch (a.a) {
        // the barge-in specs time the first reaction under its old name, "paused"
        case "duckVoice": { duckVoice(); const t = performance.now(); this.h.mark?.("paused", t); this.h.mark?.("ducked", t); break; }
        case "unduckVoice": unduckVoice(); this.sayingAtOnset = null; break;
        case "cancelVoice": stopVoice(); this.h.mark?.("cancelled", performance.now()); break;
        case "cancelTurn":
          this.inflight?.abort(); this.inflight = null; this.h.cancelTurn();
          if (this.live?.ctl.signal.aborted) this.live = null;
          if (wasHandling && this.current) this.cancelled = this.current;
          break;
        case "capture": this.carryLive(); this.ears?.capture(this.speechStart || null); break;
        case "dropCapture": this.ears?.drop(); this.h.onHearing?.("idle"); this.sayingAtOnset = null; this.uncarry(); break;
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

  /** Speech began while the sentence before it is still at Whisper: that reading is kept for this one (it is never posted again). */
  private carryLive() {
    const p = this.live;
    if (!p || p.carried || p.delivered || this.carry || !this.m.awaiting || p.gen !== this.m.gen || p.ctl.signal.aborted) return;
    p.carried = true;
    this.carry = p;
    // a barge-in's cancel does not abort it now: its words are part of the sentence
    if (this.inflight === p.ctl) this.inflight = null;
  }
  /** The next part was only a noise: the earlier part is the sentence after all. */
  private uncarry() {
    const p = this.carry;
    if (!p) return;
    this.carry = null;
    p.carried = false;
    if (!p.done) { if (!this.inflight) this.inflight = p.ctl; return; }
    queueMicrotask(() => { if (this.m.gen === p.gen && this.m.awaiting) this.finish(p); });
  }

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
    // Jarvis's own voice, heard back by the captions, is not a sentence (as for Whisper's words: accept())
    if (selfHeard(text.trim(), this.sayingAtOnset ?? nowSaying())) return;
    // the same gate as Whisper's words: side talk goes no further than this browser
    const gate = this.gateFor(text);
    if (!gate.act) { this.h.onIgnored(text); return; }
    this.pending = { lang, source: "captions", gate, conf: CAPTIONS_CONF };
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
    // the part of the sentence before this one, still at Whisper when this part began: its reading is joined to this one
    const first = this.carry;
    this.carry = null;
    const lane = this.laneNow();
    let wav: Blob | null = null;
    if (lane === "ambient") {
      // an ambient sentence too short to be a request, or over the budget, never leaves this browser
      const now = Date.now();
      this.ambient = this.ambient.filter((t) => now - t < 60_000);
      if (this.lastEnd.ms < TUNING.ambientMinMs) e.drop();
      else if (this.budgetLow || this.ambient.length >= AMBIENT_PER_MIN) { e.drop(); this.setBudgetLow(this.ambient.length); }
      else { this.ambient.push(now); this.h.onBudget?.({ low: false, ambient: this.ambient.length }); wav = e.take(); }
    } else wav = e.take();
    if (!wav && !first) { this.dispatch({ type: "text", text: "", gen }); this.h.onHearing?.("idle"); return; }
    this.h.onHearing?.("reading");
    const ctl = new AbortController();
    let own: "ok" | "timeout" | "abort" | "error" = "ok";
    const mine = wav ? this.post(wav, lane, ctl.signal).catch((err: unknown) => {
      own = err instanceof HearTimeout ? "timeout" : (err as Error).name === "AbortError" ? "abort" : "error";
      return null;
    }) : Promise.resolve(null);
    const rec: Post = { gen, ctl, carried: false, done: false, delivered: false, out: null, p: Promise.resolve(null) };
    rec.p = Promise.all([first ? first.p : Promise.resolve(null), mine]).then(([a, b]) => joinHeard(a, b));
    this.inflight = ctl;
    this.live = rec;
    this.posts.add(rec);
    const j = await rec.p;
    rec.done = true;
    rec.out = { j, own };
    this.posts.delete(rec);
    if (this.inflight === ctl) this.inflight = null;
    if (this.live === rec) this.live = null;
    // its words go with the next part of the sentence: that part's transcription says them
    if (rec.carried) return;
    this.h.onHearing?.("idle");
    this.finish(rec);
  }

  /** A transcription is back (or gave up): its words go to the gate and the turn machine. */
  private finish(rec: Post) {
    if (rec.delivered || !rec.out) return;
    rec.delivered = true;
    const { j, own } = rec.out, gen = rec.gen;
    // cancelled: a newer sentence, a stop or a close took over
    if (own === "abort") return;
    if (!j) {
      // too slow: not heard, and Jarvis listens again (the console says so calmly)
      if (own === "timeout") { this.h.onMissed?.("timeout"); this.dispatch({ type: "text", text: "", gen }); return; }
      // Whisper is not reachable: the browser's recogniser hears in the site's language, typed text always works
      if (own === "error") { this.h.onReach?.(false); this.startCaptions(); }
      this.dispatch({ type: "text", text: "", gen });
      return;
    }
    // Whisper is back: the fallback stops, or a sentence would be handled twice
    if (own === "ok") { this.h.onReach?.(true); this.captionsStop?.(); this.captionsStop = null; }
    if (j.budget === "low" && !j.text?.trim()) { this.setBudgetLow(this.ambient.length); this.dispatch({ type: "text", text: "", gen }); return; }
    this.h.mark?.("transcribed", performance.now());
    this.accept(j.text ?? "", j.lang ?? this.h.siteLang(), gen, "whisper", confOf(j.conf));
  }

  /** One POST to /hear, given up after TUNING.hearTimeoutMs. The open Stage's names go with the audio (multipart) when there are any. */
  private async post(wav: Blob, lane: string, signal: AbortSignal): Promise<HearReply> {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TUNING.hearTimeoutMs);
    const off = () => ctl.abort();
    if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", off, { once: true });
    try {
      const vocab = (this.h.vocab?.() ?? []).filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 40)).slice(0, 30);
      const url = `${this.h.hearUrl()}?lane=${lane}&lang=${this.h.siteLang()}`;
      let init: RequestInit;
      if (vocab.length) {
        const f = new FormData();
        f.append("audio", wav, "speech.wav");
        f.append("vocab", JSON.stringify(vocab));
        init = { method: "POST", body: f, signal: ctl.signal };
      } else init = { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav, signal: ctl.signal };
      const r = await fetch(url, init);
      if (r.status === 429) return { text: "", lang: this.h.siteLang(), budget: "low" };
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as HearReply;
    } catch (err) {
      if (timedOut) throw new HearTimeout();
      throw err;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", off);
    }
  }

  private accept(text: string, lang: "en" | "ta", gen: number, source: "whisper" | "captions", conf: number) {
    const saying = this.sayingAtOnset ?? nowSaying();
    const interrupted = !!this.sayingAtOnset;
    this.sayingAtOnset = null;
    const t = text.trim();
    // Jarvis's own voice, heard back: not a sentence
    if (t && selfHeard(t, saying)) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    if (!t) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    // "Jarvis" and a pause: the end of utterance is short, so the name often arrives alone. It is not a request (said over the
    // voice, it stops the voice and listens: turn.ts)
    if (namedIn(t) === "") {
      this.engage();
      this.h.onNameOnly?.();
      this.dispatch({ type: "nameOnly", gen });
      return;
    }
    const gate = this.gateFor(t);
    if (!gate.act) {
      this.h.onIgnored(t);
      this.dispatch({ type: "text", text: "", gen });
      this.backOn(interrupted);
      return;
    }
    this.pending = { lang, source, gate, conf };
    this.forgetCancelled();
    this.dispatch({ type: "text", text: gate.text, gen, yesWanted: this.h.wantsYes?.() ?? false });
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
