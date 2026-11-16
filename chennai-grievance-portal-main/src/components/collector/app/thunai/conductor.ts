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
 *
 * Phase 7 review (lane F1):
 *  - The earcon's guard drops only what the earcon itself can cause (earconDrops): the energy gate's onset, any onset over the voice,
 *    and the energy gate's onset while the tone sounds. Silero's onset elsewhere is the Collector's, so a sentence that goes on after
 *    a short pause is captured whole (the guard used to drop every onset for 400 ms after an engaged sentence ended).
 *  - A /hear timeout is said ("I didn't catch that") only for an engaged sentence: side talk that timed out is silent.
 *  - The browser's recogniser stands in for Whisper only on a real outage (a network error or a 503, hearOutage), and only from the
 *    speech start to the speech end of an engaged turn, as HearingCaptions runs: never continuously, never for side talk.
 *  - Every onset and end (side talk too) is when the Collector last spoke (lastSpeechAt): nothing unprompted lands in a pause.
 *
 * v5 build (lane 2):
 *  - C3: inWindow() is the one test of "woken or engaged": within ENGAGED_MS (addressed.ts) of the wake or of Jarvis's last turn,
 *    or while Jarvis speaks. The console's captions start only inside it (captions.ts asks it before every start).
 *  - C4: a sentence begun or ended inside that window goes to /hear with ?engaged=1. With NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 a
 *    sentence outside it is never uploaded (and the route refuses audio without the mark); default off, as before.
 *  - The trace (section 6.4, trace.ts): a sentence sent to /hear opens a turn whose zero is its last voiced sample (the ears give
 *    it), then "eou" (the detector's decision), "uploadSent", the server's sttSent/sttBack offsets and "hearBack". The HeardLine
 *    carries the trace's number so the console stamps "gateDone" and the lane on that turn only. Timings only, never words.
 *  - E2, early speech-to-text (NEXT_PUBLIC_JARVIS_EARLY_STT, on unless "0"): at the ears' pause (TUNING.earlySttMs, 150 ms of quiet
 *    inside a sentence whose end is not decided yet) an engaged sentence goes to /hear at once. The end of utterance is decided as
 *    before (300 ms, or eou.ts's values) and the turn machine is unchanged: at the end, that request is the sentence's transcription
 *    (the audio is not sent again). If the voice comes back first it is aborted and the whole sentence goes at its end, so a
 *    sentence makes at most TUNING.earlySttAttempts (2) requests: 0 extra when the voice does not come back, 1 when it does. Only
 *    when woken or engaged (inWindow, the engaged lane: rule 3), heard fresh or after a barge-in (over the ducked voice its words
 *    decide the duck after its end, as before), 250 ms to TUNING.earlySttMaxMs (10 s) of speech so far, with Whisper reachable.
 *    The trace still opens at the last voiced sample; its "uploadSent" is the request the words came from.
 */
import { addressed, ENGAGED_MS, levelAllowed, namedIn, selfHeard, type Addressed } from "@/lib/thunai/addressed";
import { eouFor, tails, type EouWhy } from "@/lib/thunai/eou";
import { confOf, joinHeard, type HearReply } from "@/lib/thunai/heard";
import { turn, turnStart, type TurnEvent, type TurnModel, type TurnState } from "@/lib/thunai/turn";
import { TUNING } from "@/lib/thunai/vad";
import { Ears, type EarsError, type EchoMode } from "./ears";
import { canContinue, continueAnswer, duckVoice, EARCON_GUARD_MS, nowSaying, setMouthHooks, speaking, stopVoice, unduckVoice, type VoicePath } from "./mouth";
import { stamp, stampServer, traces, traceStart, type ServerTiming, type TurnTrace } from "./trace";
import { canWake, startWake } from "./wake";

/** this turn's trace is still the open one: a stamp for an older turn never lands on a newer turn's trace */
const isCurrent = (tr: TurnTrace | null): boolean => !!tr && traces().at(-1) === tr;

export const AMBIENT_PER_MIN = 8;
/**
 * v5 (C4): NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 sends no audio to /hear unless Jarvis is woken or engaged (inWindow). Default off:
 * the capped ambient lane still uploads, so a name said late in a sentence is found in the transcript.
 */
const strictAudioGate = () => process.env.NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE === "1";
/** v5 (E2): NEXT_PUBLIC_JARVIS_EARLY_STT=0 sends every sentence at its end, as before; anything else (unset too) sends it at its pause */
// E2 ships OFF: in the second real run (16 Nov, Edge, synthetic English clips) two clips that Whisper's race reads right whole came
// back as Tamil when their early upload was used, and right in the run before E2; until the real-room check clears it, "1" turns it on
const earlyStt = () => process.env.NEXT_PUBLIC_JARVIS_EARLY_STT === "1";
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
  /** the number of this sentence's own trace (trace.ts): the console stamps "gateDone" and the lane on it, and on no other */
  trace?: number;
}

export interface ConductorHooks {
  hearUrl: () => string;
  /** v5 B2: a clarifying question is pending on the page: a short answer to it is never taken for a prompt echo (stt.ts) */
  clarifyPending?: () => boolean;
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
  /**
   * speech began (VAD onset): the browser's captions may start now. `engaged`: the turn is engaged by the lane's reckoning;
   * `fallback`: Whisper is out and the conductor's own recogniser hears this speech (the console's live captions stand aside)
   */
  onSpeechStart?: (o: { engaged: boolean; fallback?: boolean }) => void;
  /** the speech ended (also on stop and close): the captions stop */
  onSpeechEnd?: () => void;
  /**
   * an engaged sentence the transcriber did not answer in time, or could not read (a 502, a 401): it counts as not heard (a calm "I
   * didn't catch that" is the console's). Never for side talk
   */
  onMissed?: (why: "timeout" | "error") => void;
}

type Own = "ok" | "timeout" | "abort" | "error" | "outage";
/** one sentence's transcription: its own request, and the reading of the part before it when the sentence was said in two */
interface Post {
  gen: number; ctl: AbortController; p: Promise<HearReply | null>;
  /** the lane it was posted on: a timeout is said only for an engaged sentence */
  lane: "engaged" | "ambient";
  /** its words go with the next part of the sentence (that part's transcription joins them) */
  carried: boolean; done: boolean; delivered: boolean;
  /** the trace opened for this part of the sentence (null: nothing of its own was uploaded) */
  tr: TurnTrace | null;
  out: { j: HearReply | null; own: Own } | null;
}
type HearJson = HearReply & { timing?: ServerTiming };
/** v5 (E2): a sentence sent to /hear at its pause, before its end was decided */
interface Early {
  ctl: AbortController;
  /** never rejects: the reply (null when none) and how the request went */
  p: Promise<{ j: HearJson | null; own: Own }>;
  /** performance.now() as the request went: the trace's "uploadSent" when its words are the sentence's */
  sentAt: number;
  lane: "engaged";
  /** the speech span it carried: the end's is the same when the voice did not come back */
  speechMs: number;
}
class HearTimeout extends Error { constructor() { super("timeout"); this.name = "HearTimeout"; } }
/** /hear answered, but not with words */
class HearHttp extends Error { constructor(readonly status: number) { super(String(status)); this.name = "HearHttp"; } }
/** how a /hear request that threw went */
const ownOf = (err: unknown): Own => err instanceof HearTimeout ? "timeout" : (err as Error)?.name === "AbortError" ? "abort" : hearOutage(err) ? "outage" : "error";

/**
 * Whisper is really out: the network failed (fetch rejects with a TypeError), or the server has no transcriber (503). A 401, a 502
 * (the transcriber failed on this audio) or a 500 is not an outage: the next sentence goes to Whisper as usual.
 */
export function hearOutage(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  return (err as { status?: unknown } | null)?.status === 503;
}

/**
 * What the earcon's guard drops (it is Jarvis's own sound, never a barge-in): the energy gate's quick onset; any onset over the
 * voice; and the energy gate's onset (no Silero) while the tone itself sounds. Silero's onset anywhere else is a voice (a sine is
 * not speech), so a sentence that goes on after a short pause is never cut in half.
 */
export function earconDrops(kind: "quickOnset" | "vadStart", o: { guard: boolean; tone: boolean; state: TurnState; detector: "silero" | "energy" | null }): boolean {
  if (!o.guard) return false;
  if (kind === "quickOnset" || o.state === "speaking") return true;
  return o.detector !== "silero" && o.tone;
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
  /** the latest transcription, while its words are still to come */
  private live: Post | null = null;
  /** an earlier part of the sentence, still at Whisper when the next part began */
  private carry: Post | null = null;
  private posts = new Set<Post>();
  private wakeStop: (() => void) | null = null;
  private budgetLow = false;
  private budgetT: ReturnType<typeof setTimeout> | null = null;
  /** Whisper is out (hearOutage): the browser's recogniser hears each engaged speech instead, until a transcription comes back */
  private whisperOut = false;
  /** the recogniser for the speech being heard, while Whisper is out */
  private fb: SR | null = null;
  /** every recogniser still alive (one that was stopped still sends its last words) */
  private fbAll = new Set<SR>();
  private earconUntil = 0;
  /** the earcon's own tone (with the output's latency): the energy gate cannot tell it from a voice */
  private toneUntil = 0;
  /** when the Collector (or anyone in the room) last began or ended speaking: a VAD onset or end, whatever the gate said */
  private spokeAt: number | null = null;
  /** the language of the last line heard (Whisper's, or the captions' script): /hear's translation guard expects it (stt.ts lastLang) */
  private lastLang: "en" | "ta" | null = null;
  /** speech is being heard (between onSpeechStart and onSpeechEnd) */
  private speechOpen = false;
  /** the speech being heard (or just ended) began inside the window (inWindow at its onset): a sentence begun engaged stays so (C4) */
  private onsetInWindow = false;
  /** the sentence just ended: its last voiced sample and the end-of-utterance decision (performance.now()), for its trace */
  private endMark: { voiced: number; eou: number } | null = null;
  private partialText = "";
  private eou: EouWhy | null = null;
  /** v5 (E2): the sentence being heard went to /hear at its pause; null when it did not (or that request was dropped) */
  private early: Early | null = null;
  /** v5 (E2): the /hear requests made early for the sentence being heard (an aborted one counts) */
  private tries = 0;
  starting = false;

  constructor(private h: ConductorHooks) {
    setMouthHooks({
      onStart: (p, ack) => { this.h.onVoice?.("start", p, ack); this.dispatch({ type: "ttsStart", ack }); },
      onEnd: (ack) => { this.h.onVoice?.("end"); this.dispatch({ type: "ttsEnd", ack }); },
      // the end-of-speech earcon plays only once the ears know it is Jarvis's own sound
      onEarcon: (ms, tone) => this.earcon(ms, tone),
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
  /** when speech last began or ended in the room (Date.now()), side talk too; null before any */
  get lastSpeechAt(): number | null { return this.spokeAt; }

  /** Open the microphone. Throws an EarsError message when it cannot. */
  async open(): Promise<void> {
    if (this.ears) return;
    this.starting = true;
    const e = new Ears({
      onVad: (ev, wall, voicedEnd) => {
        if (!ev) return;
        if (ev.type === "start") {
          // Jarvis's own earcon is not the Collector's voice; Silero's onset after it is (earconDrops)
          if (earconDrops("vadStart", { guard: this.earconOn(), tone: performance.now() < this.toneUntil, state: this.m.state, detector: this.ears?.kind ?? null })) return;
          this.spokeAt = Date.now();
          // a new sentence: its own early request and its own count (E2)
          this.earlyAbort(); this.tries = 0;
          // each part of a sentence is captured from its own start: a part still at Whisper is joined, never posted again
          this.speechStart = ev.at;
          this.h.mark?.("vadStart", wall); this.noteOnset(); this.speechBegan(); this.dispatch({ type: "vadStart", at: ev.at }); this.h.onHearing?.("speech");
        } else {
          this.spokeAt = Date.now();
          // the trace's zero is the last voiced sample (the ears give it; older ears only the decision), its "eou" the decision
          this.endMark = { voiced: voicedEnd ?? wall, eou: wall };
          this.lastEnd = { ms: ev.ms, start: this.speechStart }; this.h.mark?.("vadEnd", wall); this.dispatch({ type: "vadEnd", at: ev.at, ms: ev.ms, short: ev.short, strong: ev.strong });
          // E2: an early request the end did not take as the sentence's transcription (transcribe adopts it at once) goes no further
          this.earlyAbort();
          this.speechEnded();
        }
      },
      // E2: 150 ms of quiet inside the sentence: an engaged one goes to /hear now; the voice back before its end aborts that request
      onPause: (_wall, _voiced, ms) => this.earlyUpload(ms),
      onResume: () => this.earlyAbort(),
      // speech over the voice: the capture starts here, not at the start of the sentence before
      onQuickOnset: (wall) => {
        if (earconDrops("quickOnset", { guard: this.earconOn(), tone: performance.now() < this.toneUntil, state: this.m.state, detector: this.ears?.kind ?? null })) return;
        this.spokeAt = Date.now();
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
      this.starting = false;
      // closed while it was still starting (Jarvis turned off as the microphone opened): the closed audio context's rejection is not a
      // microphone failure, so nothing is said and the mode is not turned to muted (v4 spec finding: mode.spec "off and muted")
      if (this.ears !== e) return;
      this.ears = null;
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
    this.earlyAbort(); this.tries = 0;
    this.wakeStop?.(); this.wakeStop = null;
    this.abortFallback();
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
    // what the stand-in recogniser still holds was said before the stop: it is not acted on
    this.abortFallback();
    this.cancelled = null;
    if (this.holdT) { clearTimeout(this.holdT); this.holdT = null; }
    this.ears?.extend(0);
  }
  /**
   * An earcon is playing: it must not count as speech. For `ms` the energy gate's onset and any onset over the voice are taken as
   * the earcon's; for `toneMs` (the tone with the output's latency) the energy gate's onset is, wherever it comes (earconDrops).
   */
  earcon(ms: number = EARCON_GUARD_MS, toneMs: number = ms) {
    const now = performance.now();
    this.earconUntil = Math.max(this.earconUntil, now + ms);
    this.toneUntil = Math.max(this.toneUntil, now + Math.min(ms, toneMs));
  }
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
    this.onsetInWindow = this.inWindow();
    this.partialText = "";
    this.eou = null;
    const engaged = this.laneNow() === "engaged";
    // Whisper out: the browser's recogniser hears this speech, an engaged one only, from here to its end
    const fallback = this.whisperOut && engaged && this.startFallback();
    this.h.onSpeechStart?.(fallback ? { engaged, fallback } : { engaged });
  }
  private speechEnded() {
    if (!this.speechOpen) return;
    this.speechOpen = false;
    this.partialText = "";
    this.stopFallback();
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
        case "dropCapture": this.ears?.drop(); this.h.onHearing?.("idle"); this.sayingAtOnset = null; this.uncarry(); this.earlyAbort(); break;
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
    const last = this.engagedAt ?? 0, spokenOver = !!this.sayingAtOnset || this.m.bargeIns > 0 && canContinue();
    return spokenOver || (last > 0 && Date.now() - last <= ENGAGED_MS) ? "engaged" : "ambient";
  }

  /** when the name was last heard (the wake) or Jarvis last finished a turn, whichever is later (Date.now()); null before either */
  get engagedAt(): number | null {
    const t = Math.max(this.h.lastTurnAt() ?? 0, this.engaged);
    return t > 0 ? t : null;
  }
  /**
   * Woken or engaged (v5, C3 and C4): within ENGAGED_MS of the wake or of Jarvis's last turn, or while Jarvis is speaking (or was
   * as this speech began). The browser's captions run only then; with the strict audio gate nothing goes to /hear otherwise.
   */
  inWindow(now: number = Date.now()): boolean {
    if (speaking() || this.sayingAtOnset) return true;
    const at = this.engagedAt;
    return at != null && now - at <= ENGAGED_MS;
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
    this.lastLang = lang;
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
    // woken or engaged (C4), by the captions' own test, as this speech began or now: the request carries the mark, and with the strict
    // audio gate on nothing else leaves this browser (the route refuses audio without the mark)
    const engaged = this.inWindow() || this.onsetInWindow;
    // E2: the sentence went to /hear at its pause and the voice did not come back: that request is its transcription, and the audio
    // is not sent again. Otherwise it was dropped already, or is dropped here, and the sentence goes as before
    const early = this.adoptEarly(lane, engaged);
    let wav: Blob | null = null;
    if (early) e.drop();
    else if (strictAudioGate() && !engaged) e.drop();
    else if (lane === "ambient") {
      // an ambient sentence too short to be a request, or over the budget, never leaves this browser
      const now = Date.now();
      this.ambient = this.ambient.filter((t) => now - t < 60_000);
      if (this.lastEnd.ms < TUNING.ambientMinMs) e.drop();
      else if (this.budgetLow || this.ambient.length >= AMBIENT_PER_MIN) { e.drop(); this.setBudgetLow(this.ambient.length); }
      else { this.ambient.push(now); this.h.onBudget?.({ low: false, ambient: this.ambient.length }); wav = e.take(); }
    } else wav = e.take();
    const mark = this.endMark;
    this.endMark = null;
    if (!wav && !early && !first) { this.dispatch({ type: "text", text: "", gen }); this.h.onHearing?.("idle"); return; }
    // a sentence that goes to the transcriber is a turn: its trace opens at its last voiced sample (section 6.4; timings only)
    const tr = (wav || early) && mark ? traceStart(mark.voiced) : null;
    if (tr && mark) stamp("eou", mark.eou);
    // sent early, its words come from the request made at the pause, before the end was decided: "uploadSent" is then
    if (tr && early) stamp("uploadSent", early.sentAt);
    this.h.onHearing?.("reading");
    const ctl = early?.ctl ?? new AbortController();
    let own: Own = "ok";
    const speechMs = Math.max(0, Math.round(this.lastEnd.ms));
    const mine: Promise<HearReply | null> = early
      ? early.p.then((o) => { own = o.own; if (o.j && isCurrent(tr)) stampServer("uploadSent", o.j.timing); return o.j; })
      : wav ? this.post(wav, lane, ctl.signal, engaged, tr, speechMs).catch((err: unknown) => { own = ownOf(err); return null; }) : Promise.resolve(null);
    const rec: Post = { gen, ctl, lane, carried: false, done: false, delivered: false, out: null, p: Promise.resolve(null), tr };
    rec.p = Promise.all([first ? first.p : Promise.resolve(null), mine]).then(([a, b]) => joinHeard(a, b));
    this.inflight = ctl;
    this.live = rec;
    this.posts.add(rec);
    const j = await rec.p;
    // the sentence's words are here (both parts of one said in two); a newer turn's trace is not this one's
    if (j && isCurrent(tr)) stamp("hearBack");
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
      // too slow, or unreadable (a 502, a 401): not heard, and Jarvis listens again. The console says so calmly for an engaged
      // sentence only: side talk that was not transcribed is nobody's business
      if ((own === "timeout" || own === "error") && rec.lane === "engaged") this.h.onMissed?.(own);
      // Whisper is not reachable (the network, or no transcriber): from the next engaged speech the browser's recogniser hears it,
      // in the site's language, only while it is said (speechBegan); typed text always works
      if (own === "outage") { this.whisperOut = true; this.h.onReach?.(false); }
      this.dispatch({ type: "text", text: "", gen });
      return;
    }
    // Whisper is back: the fallback stops, or a sentence would be handled twice
    if (own === "ok") { this.h.onReach?.(true); this.whisperOut = false; this.abortFallback(); }
    if (j.budget === "low" && !j.text?.trim()) { this.setBudgetLow(this.ambient.length); this.dispatch({ type: "text", text: "", gen }); return; }
    this.h.mark?.("transcribed", performance.now());
    this.accept(j.text ?? "", j.lang ?? this.h.siteLang(), gen, "whisper", confOf(j.conf), rec.tr?.n);
  }

  /**
   * E2: the ears heard TUNING.earlySttMs of quiet inside the sentence. It goes to /hear now, before its end is decided, only when it
   * is engaged (inWindow, the captions' and the strict gate's test, and the engaged lane: never unengaged room audio, rule 3), heard
   * fresh or after a barge-in (state hearing or interrupted; over the ducked voice it is read after its end, as before), 250 ms to
   * TUNING.earlySttMaxMs of speech so far, with Whisper reachable, and while a request is left for the whole sentence at its end.
   */
  private earlyUpload(ms: number) {
    const e = this.ears;
    if (!earlyStt() || !e || this.early || !this.speechOpen || this.whisperOut) return;
    if (this.m.state !== "hearing" && this.m.state !== "interrupted") return;
    if (!(this.inWindow() || this.onsetInWindow) || this.laneNow() !== "engaged") return;
    if (ms < TUNING.minSpeechMs || ms > TUNING.earlySttMaxMs || this.tries + 1 >= TUNING.earlySttAttempts) return;
    const wav = e.peek();
    if (!wav) return;
    this.tries++;
    const ctl = new AbortController();
    const speechMs = Math.max(0, Math.round(ms));
    const sentAt = performance.now();
    // no trace yet (the end is not decided): transcribe stamps "uploadSent" at sentAt, and the server's offsets, if it is adopted
    const p = this.post(wav, "engaged", ctl.signal, true, null, speechMs).then(
      (j) => ({ j: j as HearJson, own: "ok" as Own }),
      (err: unknown) => ({ j: null, own: ownOf(err) })
    );
    this.early = { ctl, p, sentAt, lane: "engaged", speechMs };
    this.h.mark?.("sttEarly", sentAt);
  }
  /**
   * E2, at the end of the sentence: the early request is its transcription when the voice did not come back after it (the end's
   * speech span is the one it carried) and the sentence is still engaged on the same lane. Otherwise it is aborted (null).
   */
  private adoptEarly(lane: "engaged" | "ambient", engaged: boolean): Early | null {
    const x = this.early;
    if (!x) return null;
    this.early = null;
    if (lane === x.lane && engaged && Math.max(0, Math.round(this.lastEnd.ms)) === x.speechMs) { this.h.mark?.("sttEarlyUsed", performance.now()); return x; }
    x.ctl.abort();
    this.h.mark?.("sttEarlyAbort", performance.now());
    return null;
  }
  /** E2: the voice came back, or the sentence was dropped, stopped or closed, before its early request was taken: it is aborted. */
  private earlyAbort() {
    const x = this.early;
    if (!x) return;
    this.early = null;
    x.ctl.abort();
    this.h.mark?.("sttEarlyAbort", performance.now());
  }

  /** One POST to /hear, given up after TUNING.hearTimeoutMs. The open Stage's names go with the audio (multipart) when there are any. */
  private async post(wav: Blob, lane: string, signal: AbortSignal, engaged = false, tr: TurnTrace | null = null, speechMs: number | null = null): Promise<HearReply> {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TUNING.hearTimeoutMs);
    const off = () => ctl.abort();
    if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", off, { once: true });
    try {
      const vocab = (this.h.vocab?.() ?? []).filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 40)).slice(0, 30);
      // the last line's language, so the server's first good decode in the site's language does not win over a Tamil sentence that it
      // only translated (stt.ts readHear `lastLang`: a field of the multipart body, or ?lastLang= with the bare WAV; an older server ignores it)
      const last = this.lastLang;
      // the engaged mark (C4): set only when Jarvis is woken or engaged; a server with the strict audio gate refuses audio without it
      let url = `${this.h.hearUrl()}?lane=${lane}&lang=${this.h.siteLang()}${engaged ? "&engaged=1" : ""}`;
      // B2: the echo guard's context, a mark and a number (never words): a clarifying question pending, and the detector's speech span
      if (this.h.clarifyPending?.()) url += "&clarify=1";
      if (speechMs != null) url += `&speechMs=${speechMs}`;
      let init: RequestInit;
      if (vocab.length) {
        const f = new FormData();
        f.append("audio", wav, "speech.wav");
        f.append("vocab", JSON.stringify(vocab));
        if (last) f.append("lastLang", last);
        init = { method: "POST", body: f, signal: ctl.signal };
      } else {
        if (last) url += `&lastLang=${last}`;
        init = { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav, signal: ctl.signal };
      }
      if (isCurrent(tr)) stamp("uploadSent");
      const r = await fetch(url, init);
      if (r.status === 429) return { text: "", lang: this.h.siteLang(), budget: "low" };
      if (!r.ok) throw new HearHttp(r.status);
      const j = (await r.json()) as HearReply & { timing?: ServerTiming };
      // the server's own stages (speech-to-text sent and back), as offsets from its receipt, placed at this upload (trace.ts)
      if (isCurrent(tr)) stampServer("uploadSent", j.timing);
      return j;
    } catch (err) {
      if (timedOut) throw new HearTimeout();
      throw err;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", off);
    }
  }

  private accept(text: string, lang: "en" | "ta", gen: number, source: "whisper" | "captions", conf: number, trace?: number) {
    const saying = this.sayingAtOnset ?? nowSaying();
    const interrupted = !!this.sayingAtOnset;
    this.sayingAtOnset = null;
    const t = text.trim();
    // Jarvis's own voice, heard back: not a sentence
    if (t && selfHeard(t, saying)) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    if (!t) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    this.lastLang = lang;
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
    this.pending = { lang, source, gate, conf, ...(trace != null ? { trace } : {}) };
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

  /**
   * Whisper out: the browser's recogniser, in the site's language, for this one engaged speech (speechBegan to speechEnded, as
   * HearingCaptions runs), never continuously: room audio goes to the browser's service only while a sentence to Jarvis is said. Its
   * words go through the same gate as Whisper's, and its "yes" never counts. False where the browser has no recogniser.
   */
  private startFallback(): boolean {
    if (this.fb) return true;
    const W = (typeof window === "undefined" ? {} : window) as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return false;
    let r: SR;
    try { r = new R(); } catch { return false; }
    r.lang = this.h.siteLang() === "ta" ? "ta-IN" : "en-IN";
    r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      if (!this.fbAll.has(r)) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal && t.length > 1 && !speaking()) this.fromCaptions(t);
      }
    };
    r.onend = () => { this.fbAll.delete(r); if (this.fb === r) this.fb = null; };
    r.onerror = () => undefined;
    this.fb = r;
    this.fbAll.add(r);
    try { r.start(); } catch { /* already */ }
    return true;
  }
  /** The speech ended: the recogniser stops listening and sends its last words (it is let go after a few seconds if it never ends). */
  private stopFallback() {
    const r = this.fb;
    this.fb = null;
    if (!r) return;
    try { r.stop(); } catch { /* ended */ }
    setTimeout(() => { if (this.fbAll.delete(r)) { try { r.abort(); } catch { /* ended */ } } }, 4000);
  }
  /** Whisper is back, or the microphone closed: every recogniser goes, and nothing it still holds is heard. */
  private abortFallback() {
    this.fb = null;
    for (const r of this.fbAll) { try { r.abort(); } catch { /* ended */ } }
    this.fbAll.clear();
  }
}
export { levelAllowed };

type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
