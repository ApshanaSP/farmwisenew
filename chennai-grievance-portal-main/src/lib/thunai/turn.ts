/**
 * Whose turn it is: the conversation's turn-taking, as a pure state machine (ported from thunai/v3's turn(), with its race
 * fixes, then extended for Jarvis mode). It takes events from the ears, the mouth and the transcriber, and returns the next
 * model and the actions the browser must take, in order. No timers, no browser objects: every rule is unit-tested.
 *
 * Barge-in that ignores "mm-hmm" (v4; the patterns of Pipecat's MinWordsInterruptionStrategy and LiveKit's false-interruption
 * resume, no dependency): while Jarvis talks, an onset (the energy gate's, or Silero's) DUCKS the voice at once; it is never
 * paused. The voice stops, and the turn with it, only when the speech is a bid for the turn: Silero-confirmed speech held
 * TUNING.bargeHoldMs (600 ms), or live caption words with at least TUNING.bargeWords words that are not backchannels
 * (backchannel.ts), or a sentence that lasted that long. A cough, or an energy onset Silero never confirms, brings the voice
 * back up where it was. A shorter sentence is read by Whisper while the voice stays ducked ("overVoice"): "mm-hmm", சரி,
 * "seri" or nothing at all bring it back up and it carries on; a hold word, the name alone or a request stop it. Earcons never
 * duck it.
 *
 * Every question sent out carries a generation (gen); anything that comes back under an older one is dropped, so an old
 * answer can never speak after an interruption. After a cancel the query frame stays (frame.ts), so "no, Anna Nagar"
 * refines the last request.
 */
import { TUNING } from "./vad";
import { isStopWord } from "./addressed";
import { bargesIn, isBackchannel } from "./backchannel";

/** "paused" is the voice DUCKED under speech (it still plays, quietly), kept under its old name for the HUD's states. */
export type TurnState = "off" | "listening" | "hearing" | "thinking" | "speaking" | "paused" | "interrupted" | "holding";

export type TurnEvent =
  | { type: "open" } | { type: "close" }
  /** the energy gate's onset while Jarvis talks: duck now, Silero decides. `earcon`: one of Jarvis's own earcons is playing */
  | { type: "quickOnset"; at: number; earcon?: boolean }
  /** the energy gate fell quiet and Silero never confirmed */
  | { type: "quickEnd"; at: number }
  | { type: "vadStart"; at: number; earcon?: boolean } | { type: "vadEnd"; at: number; ms: number; short: boolean }
  /** time passes with speech held (for barge-in confirmation) */
  | { type: "tick"; at: number; heldMs: number }
  /** the browser captions' live words for the speech being heard (never acted on; they only decide a barge-in) */
  | { type: "words"; text: string }
  /** ack: the acknowledgement, while the question it stands for may still be in flight */
  | { type: "ttsStart"; ack?: boolean } | { type: "ttsEnd"; ack?: boolean }
  /**
   * the transcriber's words for the sentence of generation `gen` (typed text passes through handle directly). `yesWanted`: an
   * ask card is waiting for a yes, so a "yes" said over the voice is an answer, not a backchannel
   */
  | { type: "text"; text: string; gen?: number; yesWanted?: boolean }
  /** the transcriber heard only the name ("Jarvis", and a pause) */
  | { type: "nameOnly"; gen?: number }
  | { type: "answered" }
  /** the hold's extra listening time ran out */
  | { type: "holdOver" }
  /** Esc, or the HUD's stop */
  | { type: "stop" };

export type TurnAction =
  /** the voice to about a fifth of its level (mouth.ts), and back up */
  | { a: "duckVoice" } | { a: "unduckVoice" } | { a: "cancelVoice" }
  /** abort the in-flight question and bump the turn generation */
  | { a: "cancelTurn" }
  | { a: "capture" } | { a: "dropCapture" } | { a: "transcribe"; gen: number }
  /** go silent, change nothing on screen, listen this long before ending the sentence */
  | { a: "hold"; ms: number }
  | { a: "resumeAnswer" }
  | { a: "endSession" } | { a: "handle"; text: string; gen: number };

export interface TurnModel {
  state: TurnState;
  bargeAt: number | null;
  bargeIns: number;
  minSpeechMs: number;
  /** speech held this long while Jarvis thinks (no voice) cancels the question in flight */
  bargeMs: number;
  /** speech over the voice held this long stops it (shorter speech only ducks it) */
  bargeHoldMs: number;
  /** live words holding this many non-backchannel words stop the voice */
  bargeWords: number;
  /** a sentence was sent to speech-to-text and its words are still to come (the acknowledgement may be playing meanwhile) */
  awaiting: boolean;
  /** the generation of the sentence being transcribed or answered */
  gen: number;
  /** Silero has confirmed the speech that ducked the voice */
  confirmed: boolean;
  /** what was going on when speech started, to go back to if it turns out to be noise */
  before: "thinking" | null;
  /** an answer was interrupted, or held, and "continue" can bring it back */
  canContinue: boolean;
  /** the voice was ducked by a noise-or-voice onset, and has not been cancelled */
  held: boolean;
  /** a sentence was handed on and its answer has not begun: speech now is speech over a question in flight */
  handling: boolean;
  /** the voice is playing, whatever the state says (an answer can begin while someone is talking) */
  voice: boolean;
  /** a transcript that came back while a sound was still being judged: it counts if the sound was only noise */
  parked: string | null;
  /** a short sentence said over the ducked voice is at the transcriber: its words decide whether the voice stops or comes back up */
  overVoice: boolean;
}

export const turnStart = (o: { minSpeechMs?: number; bargeMs?: number; bargeHoldMs?: number; bargeWords?: number } = {}): TurnModel =>
  ({ state: "off", bargeAt: null, bargeIns: 0, minSpeechMs: o.minSpeechMs ?? TUNING.minSpeechMs, bargeMs: o.bargeMs ?? TUNING.bargeMs, bargeHoldMs: o.bargeHoldMs ?? TUNING.bargeHoldMs,
    bargeWords: o.bargeWords ?? TUNING.bargeWords, awaiting: false, gen: 0, confirmed: false, before: null, canContinue: false, held: false, handling: false, voice: false, parked: null, overVoice: false });

/** Words that hold Jarvis without being a request. */
const HOLD = /^(stop|wait|wait a (sec|second|minute|moment)|hold on|hold|one (sec|second|minute|moment)|just a (sec|second|minute|moment)|pause|shh+|quiet|enough for now|nirutthu|niruthu|nillu|iru|oru nimisham|oru nimisham iru|wait pannu|konjam iru|நிறுத்து|நில்லு|இரு|இருங்க|ஒரு நிமிஷம்|ஒரு நிமிடம்|கொஞ்சம் இரு)[.!,]?$/i;
/** The same words at the head of a sentence that goes on: hold plus command is a command. */
const HOLD_LEAD = /^(?:(?:no,?\s+)?(?:wait|hold on|one (?:sec|second|minute)|stop)|நில்லு|இரு|ஒரு நிமிஷம்)[,.!\s]+(.+)$/i;
const CONTINUE = /^(continue|go on|carry on|resume|keep going|go ahead|thodaru|thodarunga|sollunga|தொடரு|தொடருங்க|தொடருங்கள்|சொல்லுங்க)[.!]?$/i;
const GOODBYE = /^(jarvis,?\s+)?(go to sleep|bye|goodbye|good bye|bye bye|that'?s all|that is all|thanks,? that'?s all|thank you,? that'?s all|we'?re done|stop listening|sleep now|pothum|podhum|போதும்|போதும் நன்றி|சரி போதும்|தூங்கு|bye jarvis)[.!]?$/i;
export const isHoldOnly = (t: string) => HOLD.test(t.trim().replace(/^jarvis[,\s]+/i, "")) || isStopWord(t);
export const isStopOnly = isHoldOnly;
export const isContinue = (t: string) => CONTINUE.test(t.trim().replace(/^jarvis[,\s]+/i, ""));
export const isGoodbye = (t: string) => GOODBYE.test(t.trim());
/** "wait, show Anna Nagar" is a command: the rest of the sentence, or null when it does not start with a hold word */
export function afterHold(t: string): string | null {
  const m = HOLD_LEAD.exec(t.trim());
  return m ? m[1].trim() : null;
}

/** One step of the conversation. Pure: returns the next model and the actions the client must take, in order. */
export function turn(m: TurnModel, e: TurnEvent): { m: TurnModel; act: TurnAction[] } {
  const to = (state: TurnState, act: TurnAction[] = [], patch: Partial<TurnModel> = {}) => ({ m: { ...m, ...patch, state }, act });
  /** the ducked voice comes back up where it was; if it ended meanwhile, back to what Jarvis was doing */
  const unduck = (patch: Partial<TurnModel> = {}) => {
    const n = { ...m, ...patch };
    return to(n.voice ? "speaking" : n.handling || n.awaiting ? "thinking" : "listening", [{ a: "dropCapture" }, { a: "unduckVoice" }], { ...patch, bargeAt: null, confirmed: false, held: false });
  };
  /** a bid for the turn while Jarvis talks: the voice stops, and the turn in flight with it */
  const barge = () => to("interrupted", [{ a: "cancelVoice" }, { a: "cancelTurn" }], { bargeIns: m.bargeIns + 1, canContinue: true, held: false, gen: m.gen + 1, handling: false, voice: false, parked: null, overVoice: false });
  if (e.type === "close") return to("off", m.state === "speaking" || m.state === "paused" ? [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }] : [{ a: "cancelTurn" }, { a: "dropCapture" }], { bargeAt: null, awaiting: false, confirmed: false, before: null, held: false, canContinue: false, handling: false, voice: false, parked: null, overVoice: false });
  if (m.state === "off") return e.type === "open" ? to("listening") : { m, act: [] };
  switch (e.type) {
    case "stop":
      // Esc: everything stops at once; the frame stays
      return to("listening", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }], { bargeAt: null, awaiting: false, confirmed: false, before: null, held: false, canContinue: m.state === "speaking" || m.state === "paused" || m.canContinue, gen: m.gen + 1, handling: false, voice: false, parked: null, overVoice: false });
    case "quickOnset":
      // an earcon is Jarvis's own sound: it never ducks the voice
      if (m.state === "speaking" && !e.earcon) return to("paused", [{ a: "duckVoice" }, { a: "capture" }], { bargeAt: e.at, confirmed: false, held: true });
      return { m, act: [] };
    case "quickEnd":
      // the gate heard something, Silero never agreed: it was not a voice, so the voice comes back up where it was
      if (m.state === "paused" && !m.confirmed && !m.overVoice) return unduck();
      return { m, act: [] };
    case "vadStart":
      if (m.state === "listening" || m.state === "holding") return to("hearing", [{ a: "capture" }], { before: null });
      if (m.state === "speaking") return e.earcon ? { m, act: [] } : to("paused", [{ a: "duckVoice" }, { a: "capture" }], { bargeAt: e.at, confirmed: true, held: true });
      // more speech while a short sentence said over the voice is being read: it is captured too (the conductor joins the two)
      if (m.state === "paused") return m.overVoice ? to("paused", [{ a: "capture" }], { confirmed: true }) : { m: { ...m, confirmed: true }, act: [] };
      // speech while Jarvis thinks: captured, and the question is not cancelled until it is held long enough to be a person
      if (m.state === "thinking") return to("hearing", [{ a: "capture" }], { before: "thinking", confirmed: true });
      return { m, act: [] };
    case "tick":
      if (m.state === "paused" && m.confirmed && e.heldMs >= m.bargeHoldMs) return barge();
      if (m.state === "hearing" && m.before === "thinking" && e.heldMs >= m.bargeMs) return to("hearing", [...(m.voice ? [{ a: "cancelVoice" } as TurnAction] : []), { a: "cancelTurn" }], { before: null, bargeIns: m.bargeIns + 1, awaiting: false, gen: m.gen + 1, handling: false, voice: false, parked: null });
      return { m, act: [] };
    case "words":
      // the captions' live words: two that are not backchannels are a bid for the turn ("mm-hmm", சரி, "seri" are not).
      // Once a short sentence is with Whisper, its words decide instead
      if (m.state === "paused" && !m.overVoice && bargesIn(e.text, m.bargeWords)) return barge();
      return { m, act: [] };
    case "vadEnd": {
      const short = e.short || e.ms < m.minSpeechMs;
      if (m.state === "paused") {
        const gen = m.gen + 1;
        // a sentence held long enough is a barge-in, whatever the ticks said: the voice and the turn stop, and it is read
        const cut = () => to("thinking", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "transcribe", gen }], { bargeAt: null, bargeIns: m.bargeIns + 1, awaiting: true, confirmed: false, held: false, canContinue: true, gen, handling: false, voice: false, parked: null, overVoice: false });
        if (m.overVoice) {
          // a cough while the short sentence is read: the voice stays ducked until its words come back
          if (short) return to("paused", [{ a: "dropCapture" }], { confirmed: false });
          if (e.ms >= m.bargeHoldMs) return cut();
          return to("paused", [{ a: "transcribe", gen }], { gen, awaiting: true, confirmed: false });
        }
        if (short) return unduck();
        if (e.ms >= m.bargeHoldMs) return cut();
        // shorter, and no live words claimed the turn: Whisper reads it while the voice plays on, ducked (LiveKit's false-interruption resume)
        return to("paused", [{ a: "transcribe", gen }], { gen, awaiting: true, overVoice: true, confirmed: false, bargeAt: null });
      }
      if (m.state === "hearing" || m.state === "interrupted") {
        if (short) {
          // a noise while Jarvis was thinking: the question goes on, and a transcript that came back meanwhile counts
          if (m.before === "thinking" && m.parked) {
            const r = turn({ ...m, state: "thinking", awaiting: true, before: null, confirmed: false, parked: null }, { type: "text", text: m.parked });
            return { m: r.m, act: [{ a: "dropCapture" }, ...r.act] };
          }
          return to(m.voice ? "speaking" : m.handling || m.awaiting ? "thinking" : "listening", [{ a: "dropCapture" }], { bargeAt: null, before: null, confirmed: false, parked: null });
        }
        const gen = m.gen + 1;
        return to("thinking", [...(m.voice ? [{ a: "cancelVoice" } as TurnAction] : []), ...(m.before === "thinking" ? [{ a: "cancelTurn" } as TurnAction] : []), { a: "transcribe", gen }], { bargeAt: null, awaiting: true, before: null, confirmed: false, gen, handling: false, voice: false, parked: null });
      }
      return { m, act: [] };
    }
    case "text": {
      // a transcript for an older sentence is dropped: the newer one wins
      if (e.gen != null && e.gen !== m.gen) return { m, act: [] };
      // a late transcript (the Collector has already begun another sentence, or closed) is dropped: the new one wins
      // (the acknowledgement may already be playing, "speaking": the words still count)
      if (!m.awaiting || m.state === "hearing" || m.state === "interrupted") return { m: { ...m, awaiting: m.state === "hearing" ? false : m.awaiting, parked: m.state === "hearing" && m.before === "thinking" && m.awaiting && e.text.trim() ? e.text.trim() : m.parked }, act: [] };
      const t = e.text.trim();
      const done = { awaiting: false };
      if (m.state === "paused" && m.overVoice) {
        const over = { ...done, overVoice: false };
        // nothing, a backchannel ("mm-hmm", சரி, "seri") or "continue": the voice comes back up and carries on
        if (!t || isContinue(t) || (!e.yesWanted && isBackchannel(t))) return unduck(over);
        const stopped = { ...over, bargeAt: null, confirmed: false, held: false, bargeIns: m.bargeIns + 1, voice: false, handling: false };
        if (isGoodbye(t)) return to("off", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "endSession" }], { ...stopped, canContinue: false });
        // "wait", "stop", இரு: silent, nothing on screen changes, a little longer to think; "continue" brings the answer back
        if (isHoldOnly(t)) return to("holding", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }], { ...stopped, canContinue: true });
        // a request, or "wait, show Anna Nagar": the voice and the turn stop, and the words are acted on
        return to("thinking", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }, { a: "handle", text: afterHold(t) ?? t, gen: m.gen }], { ...stopped, canContinue: false, handling: true });
      }
      // the acknowledgement was ducked by a noise at that moment: it is cut, and the words are acted on
      if (m.state === "paused" && t && !isGoodbye(t) && !isHoldOnly(t) && !isContinue(t)) return to("thinking", [{ a: "cancelVoice" }, { a: "dropCapture" }, { a: "handle", text: t, gen: m.gen }], { ...done, bargeAt: null, confirmed: false, held: false, handling: true, voice: false });
      // nothing was said after all: a ducked voice comes back up, it is never left waiting
      const goOn = () => unduck(done);
      if (!t) return m.state === "paused" ? goOn() : to(m.state === "speaking" ? "speaking" : m.handling ? "thinking" : "listening", [], done);
      if (isGoodbye(t)) return to("off", [{ a: "cancelVoice" }, { a: "endSession" }], { ...done, canContinue: false, handling: false, voice: false });
      // "wait": silent, nothing on screen changes, and a little longer to think; the hold word itself gets no answer
      if (isHoldOnly(t)) return to("holding", [{ a: "cancelVoice" }, ...(isStopWord(t) ? [{ a: "cancelTurn" } as TurnAction] : []), { a: "hold", ms: TUNING.holdExtendMs }], { ...done, voice: false });
      if (isContinue(t)) return m.canContinue ? to("speaking", [{ a: "resumeAnswer" }], { ...done, canContinue: false }) : m.state === "paused" ? goOn() : to("listening", [], done);
      const rest = afterHold(t);
      return to("thinking", [{ a: "handle", text: rest ?? t, gen: m.gen }], { ...done, canContinue: false, handling: true });
    }
    case "nameOnly":
      if (e.gen != null && e.gen !== m.gen) return { m, act: [] };
      // "Jarvis" said over the voice: it stops talking and listens (a hold, so "continue" can bring the answer back)
      if (m.state === "paused" && m.overVoice && m.awaiting) {
        return to("holding", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }], { awaiting: false, overVoice: false, bargeAt: null, confirmed: false, held: false, bargeIns: m.bargeIns + 1, voice: false, handling: false, canContinue: true });
      }
      // anywhere else the name alone is not a request: as an empty sentence
      return turn(m, { type: "text", text: "", gen: e.gen });
    case "holdOver":
      if (m.state === "holding") return to("listening");
      return { m, act: [] };
    case "ttsStart":
      {
        const v = { voice: true, handling: e.ack ? m.handling : false };
        if (m.state === "thinking" || m.state === "listening" || m.state === "holding") return to("speaking", [], v);
        return { m: { ...m, ...v }, act: [] };
      }
    case "ttsEnd":
      // the acknowledgement ended and the question is still out: Jarvis is thinking, and speech can still cancel it
      if (m.state === "speaking") return e.ack && (m.handling || m.awaiting) ? to("thinking", [], { voice: false }) : to("listening", [], { canContinue: false, voice: false });
      if (m.state === "thinking" && !m.handling && !m.awaiting) return to("listening", [], { voice: false });
      return { m: { ...m, voice: false }, act: [] };
    case "answered":
      // an answer with nothing to say goes straight back to listening
      if (m.state === "thinking" && !m.voice) return to("listening", [], { handling: false });
      return { m: { ...m, handling: false }, act: [] };
    default:
      return { m, act: [] };
  }
}
