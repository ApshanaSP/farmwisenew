/**
 * Whose turn it is: the conversation's turn-taking, as a pure state machine (ported from thunai/v3's turn(), with its race
 * fixes, then extended for Jarvis mode). It takes events from the ears, the mouth and the transcriber, and returns the next
 * model and the actions the browser must take, in order. No timers, no browser objects: every rule is unit-tested.
 *
 * Barge-in that ignores "mm-hmm" (v4; the patterns of Pipecat's MinWordsInterruptionStrategy and LiveKit's false-interruption
 * resume, no dependency): while Jarvis talks, an onset (the energy gate's, or Silero's) DUCKS the voice at once; it is never
 * paused. The voice stops, and the turn with it, only when the speech is a bid for the turn: Silero-confirmed speech held
 * TUNING.bargeHoldMs (600 ms; over the voice only frames a voice over it gives count, vad.ts `strong`), or live caption words with at least TUNING.bargeWords words that are not backchannels
 * (backchannel.ts), or a sentence that lasted that long. A cough, or an energy onset Silero never confirms, brings the voice
 * back up where it was. A shorter sentence is read by Whisper while the voice stays ducked ("overVoice"): "mm-hmm", சரி,
 * "seri" or nothing at all bring it back up and it carries on; a hold word, the name alone or a request stop it. Earcons never
 * duck it.
 *
 * Every question sent out carries a generation (gen); anything that comes back under an older one is dropped, so an old
 * answer can never speak after an interruption. After a cancel the query frame stays (frame.ts), so "no, Anna Nagar"
 * refines the last request.
 *
 * v12 (21 Nov, the 06:30-06:45 report, stale-and-double RC1 and RC3): speech while Jarvis thinks is PROVISIONAL, never a cancel by
 * itself. 200 ms of any sound used to cancel the question in flight before anyone knew what the sound was ("okay", a cough, the second
 * half of the same request), so questions went unanswered or were worked out twice. Now the question goes on while the speech is read
 * (`provisional`), and only its words decide: the conductor drops a line that is no request (a filler, a backchannel, a thanks, the name
 * alone, side talk, Jarvis's own voice), and a real request handed on replaces the question in Thunai.tsx handle(). Stop and hold words
 * still stop at once, and so does speech over Jarvis's voice. An answer's voice that begins while the Collector is talking is ducked
 * under them; held TUNING.bargeMs (800 ms, was 200) it is cut. A new request handed on while a voice plays, or was asked for and has not
 * started yet (`voiceWanted`), cuts that older voice first, so the last answer is never said over the new question.
 *
 * v13 (21 Nov, the adversarial review of v12): speech over the spoken acknowledgement is provisional as well (`handling`: its question is
 * still in flight): a barge-in, a cut, a hold or the name alone over it stop the voice only, and a continuation said over it is joined to the
 * question (conductor.ts continued()). An answer's voice that began under the Collector is cut without cancelling the turn, which has already
 * answered. A sentence said during the turn and still at the transcriber stays provisional after the answer lands. "Sorry, one second." holds.
 *
 * v14 (21 Nov, the adversarial review of v13): a sentence said during the turn that is still being said when the answer lands stays provisional
 * too, and an answer's voice that begins under the speech that cut the acknowledgement is ducked under it and left to its words.
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
  /** `strong`: how much of it was a voice even over Jarvis's own (vad.ts): over the voice, only that part may stop it */
  | { type: "vadStart"; at: number; earcon?: boolean } | { type: "vadEnd"; at: number; ms: number; short: boolean; strong?: number }
  /** time passes with speech held (for barge-in confirmation) */
  | { type: "tick"; at: number; heldMs: number }
  /** the browser captions' live words for the speech being heard (never acted on; they only decide a barge-in) */
  | { type: "words"; text: string }
  /** ack: the acknowledgement, while the question it stands for may still be in flight */
  | { type: "ttsStart"; ack?: boolean } | { type: "ttsEnd"; ack?: boolean }
  /** v12: a voice was asked for (mouth.ts speakLines, speakAck, continueAnswer); its sound may still be some way off (the server's voice) */
  | { type: "ttsWant"; ack?: boolean }
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
  /**
   * speech held this long under an answer's voice that began while the Collector was talking cuts that voice (v12: 800 ms, and only with a
   * voice: speech while Jarvis thinks with nothing playing no longer cancels anything; its words decide)
   */
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
  /**
   * v5 D3: speech over the voice cut it (a barge-in) and that speech's words are still to come. Words that hold no bid for the turn
   * (only a backchannel) make it a false interruption: the answer is said again from the start of the sentence it was cut on
   * (resumeAnswer: mouth.ts continueAnswer, a cancel and a fresh utterance, never pause/resume). No words at all is conductor.ts's
   * (backOn, v4), so the machine does nothing more there and the answer is never said twice.
   */
  cut?: boolean;
  /**
   * v12 (RC1): the sentence being read began while a question was in flight (handling): nothing was cancelled for it. The conductor drops
   * its line when it is no request (a filler, a thanks, the name alone), and the question goes on; a request handed on replaces it.
   */
  provisional?: boolean;
  /** v12 (RC3): a voice was asked for and has neither started nor ended (the server's voice can take seconds to arrive) */
  voiceWanted?: boolean;
}

export const turnStart = (o: { minSpeechMs?: number; bargeMs?: number; bargeHoldMs?: number; bargeWords?: number } = {}): TurnModel =>
  ({ state: "off", bargeAt: null, bargeIns: 0, minSpeechMs: o.minSpeechMs ?? TUNING.minSpeechMs, bargeMs: o.bargeMs ?? TUNING.bargeMs, bargeHoldMs: o.bargeHoldMs ?? TUNING.bargeHoldMs,
    bargeWords: o.bargeWords ?? TUNING.bargeWords, awaiting: false, gen: 0, confirmed: false, before: null, canContinue: false, held: false, handling: false, voice: false, parked: null, overVoice: false, cut: false,
    provisional: false, voiceWanted: false });

/**
 * v13 (21 Nov, review 1-2): "Sorry, one second." is a hold too: an apology in front of the hold words ("sorry," "excuse me,") is stripped
 * before the test, and "sorry, wait, show Adyar" is hold plus command as "wait, show Adyar" is (HOLD_LEAD)
 */
const SORRY_LEAD = /^(?:(?:oh,?\s+)?sorry|excuse me|pardon(?: me)?)[,.!\s]+/i;
/** Words that hold Jarvis without being a request. */
const HOLD = /^(stop|wait|wait a (sec|second|minute|moment)|hold on|hold|one (sec|second|minute|moment)|just a (sec|second|minute|moment)|pause|shh+|quiet|enough for now|nirutthu|niruthu|nillu|iru|oru nimisham|oru nimisham iru|wait pannu|konjam iru|நிறுத்து|நில்லு|இரு|இருங்க|ஒரு நிமிஷம்|ஒரு நிமிடம்|கொஞ்சம் இரு)[.!,]?$/i;
/** The same words at the head of a sentence that goes on: hold plus command is a command. */
const HOLD_LEAD = /^(?:(?:(?:oh,?\s+)?sorry,?\s+|excuse me,?\s+)?(?:no,?\s+)?(?:wait|hold on|one (?:sec|second|minute)|stop)|நில்லு|இரு|ஒரு நிமிஷம்)[,.!\s]+(.+)$/i;
const CONTINUE = /^(continue|go on|carry on|resume|keep going|go ahead|thodaru|thodarunga|sollunga|தொடரு|தொடருங்க|தொடருங்கள்|சொல்லுங்க)[.!]?$/i;
const GOODBYE = /^(jarvis,?\s+)?(go to sleep|bye|goodbye|good bye|bye bye|that'?s all|that is all|thanks,? that'?s all|thank you,? that'?s all|we'?re done|stop listening|sleep now|pothum|podhum|போதும்|போதும் நன்றி|சரி போதும்|தூங்கு|bye jarvis)[.!]?$/i;
export const isHoldOnly = (t: string) => HOLD.test(t.trim().replace(/^jarvis[,\s]+/i, "").replace(SORRY_LEAD, "")) || isStopWord(t);
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
  /**
   * a bid for the turn while Jarvis talks: the voice stops, and the turn in flight with it. v13 (21 Nov, review 1-0): over the
   * acknowledgement (`handling`: the question it stands for is still in flight) only the voice stops; the speech is provisional, so its
   * words decide as they do while Jarvis thinks ("okay thank you Jarvis" over "On it." cancelled the question, and no answer ever came)
   */
  const barge = () => m.handling
    ? to("interrupted", [{ a: "cancelVoice" }], { bargeIns: m.bargeIns + 1, held: false, gen: m.gen + 1, voice: false, parked: null, overVoice: false, cut: false, provisional: true, voiceWanted: false })
    : to("interrupted", [{ a: "cancelVoice" }, { a: "cancelTurn" }], { bargeIns: m.bargeIns + 1, canContinue: true, held: false, gen: m.gen + 1, handling: false, voice: false, parked: null, overVoice: false, cut: true, provisional: false, voiceWanted: false });
  if (e.type === "close") return to("off", m.state === "speaking" || m.state === "paused" ? [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }] : [{ a: "cancelTurn" }, { a: "dropCapture" }], { bargeAt: null, awaiting: false, confirmed: false, before: null, held: false, canContinue: false, handling: false, voice: false, parked: null, overVoice: false, cut: false, provisional: false, voiceWanted: false });
  if (m.state === "off") return e.type === "open" ? to("listening") : { m, act: [] };
  switch (e.type) {
    case "stop":
      // Esc: everything stops at once; the frame stays
      return to("listening", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "dropCapture" }], { bargeAt: null, awaiting: false, confirmed: false, before: null, held: false, canContinue: m.state === "speaking" || m.state === "paused" || m.canContinue, gen: m.gen + 1, handling: false, voice: false, parked: null, overVoice: false, cut: false, provisional: false, voiceWanted: false });
    case "quickOnset":
      // an earcon is Jarvis's own sound: it never ducks the voice
      if (m.state === "speaking" && !e.earcon) return to("paused", [{ a: "duckVoice" }, { a: "capture" }], { bargeAt: e.at, confirmed: false, held: true });
      return { m, act: [] };
    case "quickEnd":
      // the gate heard something, Silero never agreed: it was not a voice, so the voice comes back up where it was
      if (m.state === "paused" && !m.confirmed && !m.overVoice) return unduck();
      return { m, act: [] };
    case "vadStart":
      // (v13, review 1-0: a hold said over the acknowledgement keeps its question in flight: what is said next is provisional, as while thinking)
      if (m.state === "listening" || m.state === "holding") return to("hearing", [{ a: "capture" }], { before: m.state === "holding" && m.handling ? "thinking" : null });
      if (m.state === "speaking") return e.earcon ? { m, act: [] } : to("paused", [{ a: "duckVoice" }, { a: "capture" }], { bargeAt: e.at, confirmed: true, held: true });
      // more speech while a short sentence said over the voice is being read: it is captured too (the conductor joins the two)
      if (m.state === "paused") return m.overVoice ? to("paused", [{ a: "capture" }], { confirmed: true }) : { m: { ...m, confirmed: true }, act: [] };
      // speech while Jarvis thinks: captured, and the question is not cancelled until it is held long enough to be a person
      if (m.state === "thinking") return to("hearing", [{ a: "capture" }], { before: "thinking", confirmed: true });
      return { m, act: [] };
    case "tick":
      if (m.state === "paused" && m.confirmed && e.heldMs >= m.bargeHoldMs) return barge();
      // v12 (RC1): speech while Jarvis thinks, with nothing playing, cancels nothing however long it is held: its words decide (the conductor
      // drops a line that is no request; a request handed on replaces the question). Only a voice that began under the Collector's speech
      // is cut once the speech is held bargeMs (800 ms, was 200): Jarvis does not talk over a person. An acknowledgement (the question
      // still in flight, `handling`) is cut alone and the question goes on; the answer's own voice is a barge-in over it, as over the voice
      if (m.state === "hearing" && m.voice && e.heldMs >= m.bargeMs) {
        if (m.handling) return to("hearing", [{ a: "cancelVoice" }], { voice: false, voiceWanted: false, held: false });
        // v13 (21 Nov, review 1-10): the answer's voice began under the Collector: the turn has answered, so only that voice stops (kept for
        // "continue"), never the turn (it was cancelled here, the answer left the bar and "Thank you Jarvis" got "You're welcome" instead).
        // It is a cut like a barge-in's (`cut`): a backchannel brings the answer back from its chunk, a line that is no request too
        // (conductor.ts accept), and a request is handed on and replaces it
        return to("interrupted", [{ a: "cancelVoice" }], { before: null, bargeIns: m.bargeIns + 1, canContinue: true, cut: true, handling: false, voice: false, voiceWanted: false, held: false, parked: null, provisional: false });
      }
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
        // a sentence held long enough is a barge-in, whatever the ticks said: the voice and the turn stop, and it is read. Only its
        // strong part counts: the ducked voice's own residue can keep a detector in speech for as long as the answer lasts
        const held = e.strong ?? e.ms;
        // v13 (review 1-0): over the acknowledgement (`handling`) only the voice stops: the question goes on and the words decide (provisional)
        const cut = () => m.handling
          ? to("thinking", [{ a: "cancelVoice" }, { a: "transcribe", gen }], { bargeAt: null, bargeIns: m.bargeIns + 1, awaiting: true, confirmed: false, held: false, gen, voice: false, parked: null, overVoice: false, cut: false, provisional: true })
          : to("thinking", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "transcribe", gen }], { bargeAt: null, bargeIns: m.bargeIns + 1, awaiting: true, confirmed: false, held: false, canContinue: true, gen, handling: false, voice: false, parked: null, overVoice: false, cut: true });
        if (m.overVoice) {
          // a cough while the short sentence is read: the voice stays ducked until its words come back
          if (short) return to("paused", [{ a: "dropCapture" }], { confirmed: false });
          if (held >= m.bargeHoldMs) return cut();
          return to("paused", [{ a: "transcribe", gen }], { gen, awaiting: true, confirmed: false });
        }
        if (short) return unduck();
        if (held >= m.bargeHoldMs) return cut();
        // shorter, and no live words claimed the turn: Whisper reads it while the voice plays on, ducked (LiveKit's false-interruption resume).
        // v13 (review 1-3): over the acknowledgement it is provisional too, so "in Adyar zone" said over "On it." is joined to its question
        return to("paused", [{ a: "transcribe", gen }], { gen, awaiting: true, overVoice: true, confirmed: false, bargeAt: null, provisional: m.handling });
      }
      if (m.state === "hearing" || m.state === "interrupted") {
        // v12: a voice that began under this speech was ducked (ttsStart): it comes back up when the speech was nothing
        const up = m.voice && m.held ? [{ a: "unduckVoice" } as TurnAction] : [];
        if (short) {
          // a noise while Jarvis was thinking: the question goes on, and a transcript that came back meanwhile counts
          if (m.before === "thinking" && m.parked) {
            const r = turn({ ...m, state: "thinking", awaiting: true, before: null, confirmed: false, parked: null }, { type: "text", text: m.parked });
            return { m: r.m, act: [{ a: "dropCapture" }, ...up, ...r.act] };
          }
          // (v14: a noise is no sentence: `provisional` stays only for a transcript still due, never for the next sentence)
          return to(m.voice ? "speaking" : m.handling || m.awaiting ? "thinking" : "listening", [{ a: "dropCapture" }, ...up], { bargeAt: null, before: null, confirmed: false, parked: null, cut: false, held: false, provisional: m.awaiting && !!m.provisional });
        }
        const gen = m.gen + 1;
        // v12 (RC1): an answer's voice began under this sentence and plays on ducked: the sentence is read as one said over the voice is
        // (overVoice), so its words decide whether that voice stops; it is never cut for the sentence alone
        // (v13, review 1-3: under the acknowledgement, `handling`, the question is in flight: provisional, so a continuation is joined to it)
        // v14 (review turns 1): also when the speech had cut the acknowledgement (interrupted) and the answer began under it; and a sentence begun
        // during the turn stays provisional after its answer landed (answered), so "okay thank you Jarvis" is dropped and the answer plays on
        if ((m.state === "hearing" || m.state === "interrupted") && m.voice) {
          return to("paused", [{ a: "transcribe", gen }], { bargeAt: null, awaiting: true, before: null, confirmed: false, gen, parked: null, overVoice: true, held: true, cut: false, provisional: m.handling || !!m.provisional });
        }
        // the speech that cut the voice (interrupted) is read now: its words decide (D3); a new sentence after listening was no cut.
        // v12 (RC1): a sentence said while a question is in flight cancels nothing: the question goes on (`handling` stays) and the words
        // decide (`provisional`: the conductor drops a line that is no request; a request handed on replaces the question)
        // (v13, review 1-0: or the speech cut the acknowledgement, which made it provisional: barge())
        const over = m.handling && (m.before === "thinking" || !!m.provisional);
        // v14 (review turns 0): or begun during the turn, which answered while it went on (answered keeps `provisional`): the question is no longer
        // in flight (`handling` goes), but a line that is no request ("Okay.", "Sorry.") is still dropped, and never stops the answer's voice
        return to("thinking", [...(m.voice ? [{ a: "cancelVoice" } as TurnAction] : []), { a: "transcribe", gen }], { bargeAt: null, awaiting: true, before: null, confirmed: false, gen, handling: over, voice: false, parked: null,
          cut: m.state === "interrupted" && !!m.cut, provisional: over || !!m.provisional });
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
      const done = { awaiting: false, cut: false, provisional: false };
      // v5 D3: the speech that cut the voice held only a backchannel ("mm-hmm", "okay", சரி, "seri"): a false interruption. The answer
      // is said again from the start of the sentence it was cut on. A yes an ask card waits for is an answer, never a backchannel
      if (m.cut && m.canContinue && t && !e.yesWanted && isBackchannel(t)) return to("speaking", [{ a: "resumeAnswer" }], { ...done, canContinue: false, handling: false });
      if (m.state === "paused" && m.overVoice) {
        const over = { ...done, overVoice: false };
        // nothing, a backchannel ("mm-hmm", சரி, "seri") or "continue": the voice comes back up and carries on
        if (!t || isContinue(t) || (!e.yesWanted && isBackchannel(t))) return unduck(over);
        const stopped = { ...over, bargeAt: null, confirmed: false, held: false, bargeIns: m.bargeIns + 1, voice: false, voiceWanted: false, handling: false };
        if (isGoodbye(t)) return to("off", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "endSession" }], { ...stopped, canContinue: false });
        // "wait", "stop", இரு: silent, nothing on screen changes, a little longer to think; "continue" brings the answer back
        // v13 (review 1-0): over the acknowledgement (`handling`) a hold stops the voice only and the question goes on, as a hold said while
        // Jarvis thinks does; a stop word still ends it. (A goodbye still ends everything: the session ends with it)
        if (isHoldOnly(t) && m.handling) {
          const stop = isStopWord(t);
          return to("holding", [{ a: "cancelVoice" }, ...(stop ? [{ a: "cancelTurn" } as TurnAction] : []), { a: "hold", ms: TUNING.holdExtendMs }], { ...stopped, handling: !stop });
        }
        if (isHoldOnly(t)) return to("holding", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }], { ...stopped, canContinue: true });
        // a request, or "wait, show Anna Nagar": the voice and the turn stop, and the words are acted on. v12 (RC1): when the voice was an
        // acknowledgement (the question still in flight, `handling`), only the voice stops here: the page's handle() replaces the question
        // (or keeps it, for a line that only waits for its rest)
        return to("thinking", [{ a: "cancelVoice" }, ...(m.handling ? [] : [{ a: "cancelTurn" } as TurnAction]), { a: "dropCapture" }, { a: "handle", text: afterHold(t) ?? t, gen: m.gen }], { ...stopped, canContinue: false, handling: true });
      }
      // the acknowledgement was ducked by a noise at that moment: it is cut, and the words are acted on
      if (m.state === "paused" && t && !isGoodbye(t) && !isHoldOnly(t) && !isContinue(t)) return to("thinking", [{ a: "cancelVoice" }, { a: "dropCapture" }, { a: "handle", text: t, gen: m.gen }], { ...done, bargeAt: null, confirmed: false, held: false, handling: true, voice: false });
      // nothing was said after all: a ducked voice comes back up, it is never left waiting
      const goOn = () => unduck(done);
      if (!t) return m.state === "paused" ? goOn() : to(m.state === "speaking" ? "speaking" : m.handling ? "thinking" : "listening", [], done);
      if (isGoodbye(t)) return to("off", [{ a: "cancelVoice" }, { a: "endSession" }], { ...done, canContinue: false, handling: false, voice: false, voiceWanted: false });
      // "wait": silent, nothing on screen changes, and a little longer to think; the hold word itself gets no answer
      if (isHoldOnly(t)) return to("holding", [{ a: "cancelVoice" }, ...(isStopWord(t) ? [{ a: "cancelTurn" } as TurnAction] : []), { a: "hold", ms: TUNING.holdExtendMs }], { ...done, voice: false, voiceWanted: false });
      if (isContinue(t)) return m.canContinue ? to("speaking", [{ a: "resumeAnswer" }], { ...done, canContinue: false }) : m.state === "paused" ? goOn() : to("listening", [], done);
      const rest = afterHold(t);
      // v12 (RC3): a voice still playing, or asked for and not yet started (the server's voice can take seconds), is an older turn's: it
      // stops as the new request is handed on, so the last answer is never said over (or after) the new question. (Before v12 this kept
      // the voice when it had started while the words were at the transcriber: the 06:42 morning heard the old answer over the new one)
      const older = m.state === "speaking" || m.voice || m.voiceWanted ? [{ a: "cancelVoice" } as TurnAction] : [];
      return to("thinking", [...older, { a: "handle", text: rest ?? t, gen: m.gen }], { ...done, canContinue: false, handling: true, voice: false, voiceWanted: false });
    }
    case "nameOnly":
      if (e.gen != null && e.gen !== m.gen) return { m, act: [] };
      // "Jarvis" said over the voice: it stops talking and listens (a hold, so "continue" can bring the answer back)
      // v13 (review 1-0): over the acknowledgement (`handling`) only the voice stops and Jarvis listens: the question goes on
      if (m.state === "paused" && m.overVoice && m.awaiting && m.handling) {
        return to("holding", [{ a: "cancelVoice" }, { a: "hold", ms: TUNING.holdExtendMs }], { awaiting: false, overVoice: false, bargeAt: null, confirmed: false, held: false, bargeIns: m.bargeIns + 1, voice: false, voiceWanted: false, provisional: false });
      }
      if (m.state === "paused" && m.overVoice && m.awaiting) {
        return to("holding", [{ a: "cancelVoice" }, { a: "cancelTurn" }, { a: "hold", ms: TUNING.holdExtendMs }], { awaiting: false, overVoice: false, bargeAt: null, confirmed: false, held: false, bargeIns: m.bargeIns + 1, voice: false, handling: false, canContinue: true });
      }
      // anywhere else the name alone is not a request: as an empty sentence
      return turn(m, { type: "text", text: "", gen: e.gen });
    case "holdOver":
      if (m.state === "holding") return to("listening");
      return { m, act: [] };
    case "ttsWant":
      // v12 (RC3): the voice is on its way; until it starts or ends, a new request handed on stops it (text, above)
      return { m: { ...m, voiceWanted: true }, act: [] };
    case "ttsStart":
      {
        const v = { voice: true, voiceWanted: false, handling: e.ack ? m.handling : false };
        if (m.state === "thinking" || m.state === "listening" || m.state === "holding") return to("speaking", [], v);
        // v12 (RC1): a voice that begins while the Collector is talking is ducked under them at once: their words decide (vadEnd), or
        // their speech held bargeMs cuts it (tick)
        // v14 (review turns 1): and while the speech that cut the acknowledgement goes on (interrupted: v13 keeps its question in flight, so its
        // answer can begin under it): ducked as well, never full over the Collector; their words decide (vadEnd reads it as said over the voice)
        if (m.state === "hearing" || m.state === "interrupted") return to(m.state, [{ a: "duckVoice" }], { ...v, held: true });
        return { m: { ...m, ...v }, act: [] };
      }
    case "ttsEnd":
      // the acknowledgement ended and the question is still out: Jarvis is thinking, and speech can still cancel it
      if (m.state === "speaking") return e.ack && (m.handling || m.awaiting) ? to("thinking", [], { voice: false, voiceWanted: false }) : to("listening", [], { canContinue: false, voice: false, voiceWanted: false });
      if (m.state === "thinking" && !m.handling && !m.awaiting) return to("listening", [], { voice: false, voiceWanted: false });
      return { m: { ...m, voice: false, voiceWanted: false, held: m.state === "hearing" ? false : m.held }, act: [] };
    case "answered": {
      // an answer with nothing to say goes straight back to listening. v12: a sentence still at the transcriber keeps it thinking (its
      // words are on their way). v13 (21 Nov, review 1-1): and they stay provisional: they were said during the turn, so a line that is no
      // request ("Okay.", a thanks) is still dropped when it lands after the answer. (v12 cleared it here: that "Okay." was handed on, its
      // hand-on stopped the answer's voice, and Jarvis greeted instead)
      // v14 (review turns 0): and so does a sentence begun during the turn and still being said (hearing, paused, interrupted): its words are still
      // to come. v13 kept it only once the sentence had ended, so an "Okay." begun while Jarvis thought and ended after the answer landed was
      // handed on, cut the answer's voice, and handle() then said nothing for it
      const going = (m.state === "hearing" || m.state === "paused" || m.state === "interrupted") && (m.before === "thinking" || m.handling || !!m.provisional);
      const p = { handling: false, provisional: (m.awaiting && !!m.provisional) || going };
      if (m.state === "thinking" && !m.voice) return to(m.awaiting ? "thinking" : "listening", [], p);
      return { m: { ...m, ...p }, act: [] };
    }
    default:
      return { m, act: [] };
  }
}
