/**
 * The conductor: the one object between the ears, the turn machine (lib/thunai/turn.ts), the mouth and the console while
 * Jarvis mode is on. It feeds events to turn() and carries out its actions; the rules are all in turn.ts and addressed.ts,
 * tested without a browser. Here: the microphone, transcripts going out and coming back under a generation id, the
 * self-hearing guard, the address gate, and the listening budget.
 *
 * v4 (lane L4, "ears"):
 *  - /hear gives up after TUNING.hearTimeoutMs (6 s; v16: 8 s, room for the server's Whisper hedge): the sentence counts as not heard (onMissed), so "Working on it" never hangs.
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
 *  - E2, early speech-to-text (NEXT_PUBLIC_JARVIS_EARLY_STT, off unless "1"): at the ears' pause (TUNING.earlySttMs, 150 ms of quiet
 *    inside a sentence whose end is not decided yet) an engaged sentence goes to /hear at once. The end of utterance is decided as
 *    before (300 ms, or eou.ts's values) and the turn machine is unchanged: at the end, that request is the sentence's transcription
 *    (the audio is not sent again). If the voice comes back first it is aborted and the whole sentence goes at its end, so a
 *    sentence makes at most TUNING.earlySttAttempts (2) requests: 0 extra when the voice does not come back, 1 when it does. Only
 *    when woken or engaged (inWindow, the engaged lane: rule 3), heard fresh or after a barge-in (over the ducked voice its words
 *    decide the duck after its end, as before), 250 ms to TUNING.earlySttMaxMs (10 s) of speech so far, with Whisper reachable.
 *    The trace still opens at the last voiced sample; its "uploadSent" is the request the words came from.
 *
 * v12 (21 Nov, the 06:30-06:45 report, stale-and-double RC1, RC2, RC9, RC10 and the critic's corrections):
 *  - Speech while a question is in flight cancels nothing (turn.ts `provisional`). Its line is dropped here when it is no request (a
 *    backchannel, a filler, a thanks, a greeting; the gate already drops side talk, Jarvis's own voice and the name alone), and the
 *    question goes on; a request is handed on and replaces it. A clip that begins as a continuation of the question in flight (a
 *    conjunction, a preposition or an article, within CONTINUE_MS) is joined to it: one request said in two breaths is answered whole.
 *  - The old re-ask is gone (backOn sent a cancelled question again as a new turn, out of context, minutes later on a cough): nothing
 *    cancelled is ever asked again. A cut voice still goes on after a false interruption (continueAnswer), as before.
 *  - answered(id) belongs to the sentence handed on, not to the machine's generation (a backchannel over the acknowledgement bumped the
 *    generation, the answered was skipped, and Jarvis stayed "thinking" over a finished turn).
 *  - A transcript for an older sentence has no side effects (no wake reply, no held cut, no "I didn't catch that"); only the name alone
 *    still opens the call window. A /hear failure is said only for the sentence now being read.
 *  - Every line let go goes to the page as a words-free event (onDropped: why, language, confidence, engaged) for its telemetry and cue.
 *  - The wake reply waits for 400 ms of quiet after the name (was 90: "Yes?" played over the start of the request); when the request
 *    follows after a shorter pause, only the earcon says the name was heard.
 *
 * v13 (21 Nov, the adversarial review of v12): an apology, a call for attention or a throat-clear alone ("Sorry.", "Excuse me.", "Huh?",
 * "Ahem.") replaces nothing either (noRequest, onlyNoise); a fresh question after "and", "the" or "a" is never glued onto the one in flight
 * (FRESH_AFTER); a line said as it cut an answer's voice that began under it brings that answer back when it is no request; a dropped line
 * says whether a question was in flight (`busy`), so the page gives no "I didn't catch that" over it; and a request begun over the wake
 * reply stops that reply.
 *
 * v14 (21 Nov, the adversarial review of v13): a lone "Okay." or "Sorry." never stops an answer's voice that plays or is on its way; a tail that
 * points back at the question in flight ("and how many are there?") is joined to it again (freshTail); "Sorry?" asked as a question is
 * asksAgain (the page repeats the last answer); and the closed listener's device wake can leave the reply to the quiet here (replyWhenQuiet).
 *
 * 27 Nov (the hosted copy in Chrome sat on "Opening the microphone" with nothing said):
 *  - B3: a start watchdog. A start that stays on one step for MIC_START_LIMIT_MS is given up (onFail "stalled": the page says the microphone
 *    did not start and how to try again), and its step, how long it ran, the audio context's state and the microphone permission go to the
 *    page as a words-free report (onStall). The browser's own question is never a stall: while the microphone is not allowed yet the wait goes on.
 *  - B1: the ears no longer wait for a click to start their context; when it is still suspended GESTURE_GRACE_MS after the start, onFail
 *    "gesture" (the page asks for a click). This check could never fire before: the start waited on resume() for ever.
 *  - B10: /hear answering 401 or 403 is a signed-out session (onSignedOut), not "I didn't catch that".
 */
import { addressed, ENGAGED_MS, isStatement, levelAllowed, namedIn, selfHeard, type Addressed } from "@/lib/thunai/addressed";
import { isBackchannel, words } from "@/lib/thunai/backchannel";
import { isGreeting } from "@/lib/thunai/greet";
import { smallTalk } from "@/lib/thunai/v11/smalltalk";
import { eouFor, tails, type EouWhy } from "@/lib/thunai/eou";
import { confOf, joinHeard, type HearReply } from "@/lib/thunai/heard";
import { turn, turnStart, type TurnEvent, type TurnModel, type TurnState } from "@/lib/thunai/turn";
import { TUNING } from "@/lib/thunai/vad";
import { Ears, type EarsError, type EchoMode } from "./ears";
import { canContinue, continueAnswer, duckVoice, EARCON_GUARD_MS, nowSaying, setMouthHooks, speaking, stopVoice, stopWakeReply, unduckVoice, type VoicePath } from "./mouth";
import { flag } from "@/lib/thunai/flags";
import { stamp, stampServer, traces, traceStart, type ServerTiming, type TurnTrace } from "./trace";
import { canWake, startWake } from "./wake";
import { WAKE_QUIET_DEFAULT_MS, wakeQuietMs } from "./kws";
import { understandV10 } from "@/lib/thunai/v10/flag10";
import { cutOff, joinCut } from "@/lib/thunai/v10/browser10";

/** this turn's trace is still the open one: a stamp for an older turn never lands on a newer turn's trace */
const isCurrent = (tr: TurnTrace | null): boolean => !!tr && traces().at(-1) === tr;

export const AMBIENT_PER_MIN = 8;
/**
 * v5 (C4): NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE=1 sends no audio to /hear unless Jarvis is woken or engaged (inWindow). Default off:
 * the capped ambient lane still uploads, so a name said late in a sentence is found in the transcript.
 */
const strictAudioGate = () => process.env.NEXT_PUBLIC_JARVIS_STRICT_AUDIO_GATE === "1";
/** v5 (E2): NEXT_PUBLIC_JARVIS_EARLY_STT=1 sends a sentence at its pause; anything else (unset too) sends every sentence at its end, as before */
// E2 ships OFF: in the second real run (16 Nov, Edge, synthetic English clips) two clips that Whisper's race reads right whole came
// back as Tamil when their early upload was used, and right in the run before E2; until the real-room check clears it, "1" turns it on
// (v6: read through flag(), so a measuring build can turn it on per run: window.__jvFlags; a normal build reads the env only)
const earlyStt = () => flag("NEXT_PUBLIC_JARVIS_EARLY_STT", process.env.NEXT_PUBLIC_JARVIS_EARLY_STT) === "1";
/** the browser's recogniser gives no usable confidence in continuous mode: its lines are marked unsure */
const CAPTIONS_CONF = 0.5;
/**
 * v6: after the on-device wake word fires, the spoken reply waits for this much quiet (ms); NEXT_PUBLIC_JARVIS_WAKE_QUIET_MS, 60 to 600.
 * Measured 17 Nov (eval/v6/latency/v6a-hey*-wake.json, v6a-wakecmd-q*): "Hey Jarvis" -> the reply p50 200 / p90 216 ms at
 * 90, p50 263 / p90 285 at 150 (n 12 each); but "Hey Jarvis, show the severe cases" said in one breath got the reply in its comma pause
 * at BOTH settings (4/4 each; the command was still heard right and acted on, 8/8). Past WAKE_REPLY_GIVE_UP_MS of speech the request
 * itself is the reply.
 * v12 (21 Nov, the critic of the 06:30 report: "if I say Jarvis, and within that it's replying"): default 400, was 90. The natural pause
 * after "Jarvis," is longer than 90 ms, so "Yes?" played over the start of the request and the Collector then talked over Jarvis's voice.
 * A request that follows the name after a shorter pause gets only the earcon (wakeReplyTick); the closed listener's wakeWait reads the same.
 */
// (v14: WAKE_QUIET_DEFAULT_MS and wakeQuietMs live in kws.ts now, so the closed listener, wake.ts, reads the same quiet; re-exported here)
export { WAKE_QUIET_DEFAULT_MS, wakeQuietMs };
export const WAKE_REPLY_GIVE_UP_MS = 1500;
/** v12: a pause after the name at least this long, then speech again before the wake's quiet: the request is under way (an earcon only) */
export const WAKE_PAUSE_MS = 120;
/** v12 (the critic of RC1): a clip said while a question is in flight, begun this soon after that question was handed on, may be its rest */
export const CONTINUE_MS = 2500;
/** v12: a clip that starts as a continuation: a conjunction, a preposition or an article ("in Adyar", "and the drains", "the ones near the lake") */
const CONTINUES = /^(?:and|or|but|plus|in|on|at|for|of|with|from|to|near|around|by|under|along|within|the|a|an|matrum|maththum|apram|appuram|aprm|மற்றும்|அப்புறம்)(?=[\s,.!?…]|$)/iu;
/**
 * v13 (21 Nov, review 1-13): after its connective, a request or a question of its own ("And where are the flooded roads?", "and show the drains",
 * "A different question: ..."): a fresh one, never glued onto the question in flight (only a phrase's tail is: "in Adyar", "and the drains")
 */
const FRESH_AFTER = /^(?:and|or|but|plus|the|a|an|matrum|maththum|apram|appuram|aprm|மற்றும்|அப்புறம்)[\s,]+(?:(?:also|then|now|so|please|tell me|can you|could you)[\s,]+)*(?:what|whats|where|wheres|which|who|whose|when|how|why|is|are|was|were|do|does|did|can|could|will|would|should|show|open|tell|go|give|list|find|read|zoom|close|compare|draft|explain|different|another|new|என்ன|எந்த|எங்கே|எங்க|யார்|எப்போ|எப்படி|காட்டு|திற|சொல்)(?=[\s,.!?…'’]|$)/iu;
/**
 * v14 (21 Nov, review turns 5): a tail that points back at the question in flight is its rest, even shaped as a question ("and how many are
 * there?", "and is it worse there?", "and how many?"): split off, it replaced that question and lost its subject. "new" is fresh only as "a new
 * question" ("the new ones in Adyar" is a refinement), and "a different question: ..." or "another thing" stay fresh whatever follows
 */
const POINTS_BACK = /(?:^|[\s,])(?:there|here|it|its|they|them|their|those|these|that|ones|அங்கே|அங்கு|அங்க|அது|அதில்|அதுல|அவை|இங்கே)(?=[\s,.!?…'’]|$)/iu;
const BARE_ASK = /^(?:and|or|but|plus|matrum|maththum|apram|appuram|aprm|மற்றும்|அப்புறம்)[\s,]+(?:how (?:many|much)|where|when|why|which|what|who|எத்தனை|எங்கே|எங்க|ஏன்|எப்போ)[\s,.!?…]*$/iu;
const FRESH_MARK = /^(?:and|or|but|plus|the|a|an|matrum|maththum|apram|appuram|aprm|மற்றும்|அப்புறம்)[\s,]+(?:(?:also|then|now|so|please)[\s,]+)*(?:(?:a|an|the)\s+)?(?:different|another|new (?:question|topic|thing|request))(?=[\s,.!?…:'’]|$)/iu;
/** v14: the tail is a fresh request of its own (FRESH_AFTER), unless it points back at the question in flight (POINTS_BACK, BARE_ASK) */
export function freshTail(t: string): boolean {
  const s = t.trim();
  if (FRESH_MARK.test(s)) return true;
  if (!FRESH_AFTER.test(s)) return false;
  // "new" alone ("and the new ones in Adyar") no longer makes it fresh; a question or a command after the connective still does
  if (/^\S+[\s,]+(?:(?:also|then|now|so|please|tell me|can you|could you)[\s,]+)*new(?=[\s,.!?…'’]|$)/iu.test(s)) return false;
  return !POINTS_BACK.test(s) && !BARE_ASK.test(s);
}
/**
 * v12 (RC1): words that only acknowledge, thank or greet. Said over a question in flight or over Jarvis's voice they replace nothing:
 * "okay", "thank you", "good job", "Jarvis, are you there?" while it works were cancels of the question before v12. `greeting: false`: over
 * Jarvis's voice a greeting ("Hi Jarvis") is a call, as the name alone is there (turn.ts holds the voice for it), so it is not dropped
 */
export function noRequest(t: string, o: { greeting?: boolean } = {}): boolean {
  if (isBackchannel(t) || (o.greeting !== false && isGreeting(t))) return true;
  // v13 (review 1-2): an apology, a call for attention or a throat-clear alone ("Sorry.", "Excuse me.", "Huh?", "Ahem.") replaces nothing
  if (onlyNoise(t)) return true;
  const s = smallTalk(t);
  return s === "thanks" || s === "praise";
}
/**
 * v13 (21 Nov, review 1-1): a spoken line that starts no turn even with nothing in flight: a lone backchannel ("Okay.", "Mm-hmm", சரி) or
 * an apology or a throat-clear alone. Never a greeting, a thanks or praise: those keep their instant reply (Thunai.tsx handle())
 */
export const startsNoTurn = (t: string): boolean => (isBackchannel(t) || onlyNoise(t)) && !smallTalk(t);
/**
 * v14 (21 Nov, review turns 6): "Sorry?", "Pardon?", "Huh?", "Excuse me?", "மன்னிக்கவும்?": an apology or a call for attention asked as a
 * question, which after an answer means "say that again" (Thunai.tsx handle() repeats the last answer). A throat-clear or "oops" never asks
 */
export const asksAgain = (t: string): boolean => {
  const s = t.trim();
  return /\?[\s"'’”]*$/u.test(s) && onlyNoise(s) && !/^\[|^\(|^\*/.test(s) && !words(s).some((w) => w === "ahem" || w === "ahm" || w === "oops" || w === "whoops");
};
/** v13: the words that make a line an apology, a call for attention or a throat-clear (at least one of them is in it) */
const SORRY_WORDS = new Set(["sorry", "excuse", "pardon", "huh", "eh", "ahem", "ahm", "oops", "whoops", "mannikkavum", "manniyungal", "மன்னிக்கவும்", "மன்னிச்சுக்கோங்க", "மன்னிச்சிடுங்க", "மன்னிக்கணும்", "சாரி"].map((w) => w.normalize("NFC")));
/** v13: the words that may go with them and hold no request ("I'm so sorry", "excuse me", "beg your pardon", "my bad", "sorry Jarvis") */
const SORRY_WITH = new Set(["i", "im", "am", "so", "very", "really", "me", "my", "bad", "beg", "your", "about", "that", "jarvis", "sir", "madam", "சார்"].map((w) => w.normalize("NFC")));
/**
 * v13 (21 Nov, review 1-2): a short line of nothing but an apology, a call for attention or a throat-clear, with backchannels around it
 * ("Sorry.", "Excuse me.", "Huh?", "Ahem.", "Oh sorry", "மன்னிக்கவும்"), or a sound the transcriber put in brackets ("(coughs)"). Said
 * while a question is in flight it is the room, not a new request: before v13 each of these replaced the question and went to the planner
 */
export function onlyNoise(t: string): boolean {
  const s = t.trim();
  if (/^[\[(*][^\])*]{1,30}[\])*][.!?]*$/u.test(s)) return true;
  const w = words(s);
  return w.length > 0 && w.length <= 6 && w.some((x) => SORRY_WORDS.has(x)) && w.every((x) => SORRY_WORDS.has(x) || SORRY_WITH.has(x) || isBackchannel(x));
}
/** v6: a name-only sentence that arrives this soon after an on-device wake is the same call (it was answered already) */
export const WAKE_SAME_CALL_MS = 5000;
/** B3 (27 Nov): a microphone start that stays this long on one step (the browser's question aside) is given up (ms) */
export const MIC_START_LIMIT_MS = 10_000;
/** B1 (27 Nov): an audio context still suspended this long after the start waits for a click (ms): one the browser lets start runs by then */
export const GESTURE_GRACE_MS = 1200;
/** B3: what the start watchdog reports when it gives a start up: words-free, timings and states only */
export interface StallInfo { stage: string; ms: number; ctx: string; permission: string }
/** B3: the microphone permission, as the browser says it ("unknown" where it cannot be asked: no Permissions API, or not for the microphone) */
export async function micPermission(): Promise<"granted" | "prompt" | "denied" | "unknown"> {
  try {
    const p = (typeof navigator !== "undefined" ? navigator.permissions : undefined) as Permissions | undefined;
    if (!p?.query) return "unknown";
    const st = await p.query({ name: "microphone" as PermissionName });
    return st.state === "granted" || st.state === "prompt" || st.state === "denied" ? st.state : "unknown";
  } catch { return "unknown"; }
}
/**
 * B3: the report as one telemetry code for POST /api/jarvis/ignored (its reason takes [a-z0-9-], 40 characters at most):
 * open-stall-<step>-t<seconds>-<context>-<permission>, e.g. "open-stall-worklet-t12-susp-granted"
 */
export function stallCode(s: StallInfo): string {
  const stage = /^[a-z]{1,8}$/.test(s.stage) ? s.stage : "unknown";
  const ctx = s.ctx === "running" ? "run" : s.ctx === "suspended" ? "susp" : s.ctx === "closed" ? "closed" : "none";
  const perm = s.permission === "granted" || s.permission === "prompt" || s.permission === "denied" ? s.permission : "unknown";
  const sec = Math.min(999, Math.max(0, Math.round((Number.isFinite(s.ms) ? s.ms : 0) / 1000)));
  return `open-stall-${stage}-t${sec}-${ctx}-${perm}`;
}
/** v8: how long after the name the first sentence still counts as the call's own request (the gate's `called`) */
export const CALL_MS = 12_000;

// v10 review 2, round 4: the rest of a held line that is shaped as a statement and is still the line's own (gateFor)
/** the words alone, lower case (a dash or an ellipsis the speech-to-text wrote for the pause is no word) */
const plain = (s: string): string => s.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
/** the held line opens a clause and stops before its subject: "Tell me what the", "Check whether the", "Tell me if the", "Tell me why" */
const OPENS_CLAUSE = /(?:^| )(?:what|whats|why|where|when|how|who|which|whether|if)(?: (?:the|a|an|this|these|those))?$/;
/** a rest whose subject is a person or the speaker's own thing is a remark of its own ("my phone is not working", "I will be back") */
const OWN_SUBJECT = /^(?:i|im|ive|ill|id|my|you|your|youre|he|she|his|her|him|we|our|they|their|them)(?: |$)/;
/** a noun with its relative clause, the verb inside it: "wards where water is stagnant", "complaints that are still open" */
const NOUN_RELATIVE = /^(?:(?:the|all|any|some|these|those) )?(?:(?!(?:is|are|was|were|will|has|have|had|it|its|this|i|im|my|you|your|he|she|we|our|they|their|there)(?: |$))\S+ ){1,3}(?:where|that|which|who|whose|when) /;

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
  /**
   * v12 (RC10): this sentence's own number, given as it is handed on: answered(id) lets the turn machine go only for the sentence it is
   * handling. (v12, RC2: `again`, a cancelled question asked once more, is gone: nothing cancelled is ever asked again)
   */
  id?: number;
  /** the number of this sentence's own trace (trace.ts): the console stamps "gateDone" and the lane on it, and on no other */
  trace?: number;
}

/** v12 (the critic's silent drops): a line let go, words-free: why (the gate's code, "over-turn", "self-heard"), its language and confidence */
export interface Dropped {
  why: string; lang: "en" | "ta"; conf: number; engaged: boolean; called: boolean;
  /** v13 (review 1-9): said while a question was in flight (provisional, handling) or over Jarvis's voice: no "didn't catch that" cue for it */
  busy?: boolean;
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
  /** a sentence the gate turned away: a faint line for two seconds, not logged. v10: `why` "cut-off-held", a line cut off before its point
   * said to Jarvis (called or engaged): kept a few seconds for its rest (Thunai.tsx joinCut), and the window stays open for it */
  onIgnored: (text: string, why?: string) => void;
  onState: (s: TurnState) => void;
  /** mic level, 0..1, every frame */
  onLevel?: (v: number) => void;
  /** what has been heard so far, or that a sentence is being read */
  onHearing?: (what: "speech" | "reading" | "idle") => void;
  onBudget?: (b: { low: boolean; ambient: number }) => void;
  /** the microphone could not open ("stalled": B3's watchdog gave the start up), or ("gesture") it waits for a click on the page */
  onFail?: (why: EarsError | "gesture") => void;
  /** B3: the start watchdog gave a start up: which step it was on, how long it ran, the context's state, the permission (words-free) */
  onStall?: (s: StallInfo) => void;
  /** B10: /hear said the session is gone (401 or 403): the Collector must sign in again; never "I didn't catch that" */
  onSignedOut?: () => void;
  onEndSession?: () => void;
  onHold?: () => void;
  /**
   * the name alone ("Jarvis", and a pause): it listens on, engaged; the next sentence is the request. `replied`: the on-device wake word
   * already answered this call (v6), so nothing is to be said again
   */
  onNameOnly?: (o?: { replied: boolean }) => void;
  /**
   * v6: the on-device wake word heard "Hey Jarvis" (kws.ts): `at` the end of the audio it had heard (performance.now()); `overVoice`
   * Jarvis was speaking. The HUD reacts now; the reply comes with onWakeReply
   */
  onWakeWord?: (o: { at: number; overVoice: boolean }) => void;
  /**
   * v6: the Collector paused after the wake word: say the wake reply now. v12: `tone`, the request followed the name after a short pause:
   * only the earcon, never a spoken "Yes?" over its start
   */
  onWakeReply?: (o?: { tone?: boolean }) => void;
  /** v12: a line let go (the gate, a line that replaces nothing over a question in flight, Jarvis's own voice), words-free: for telemetry and a cue */
  onDropped?: (d: Dropped) => void;
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
  /** v8: a next step is on offer ("Want the details?"): a yes or a no is its answer */
  offerPending?: () => boolean;
  /** v18 round 2: the Collector is working with Jarvis now (a screen of its open, or an answer moments ago): request-shaped speech is in the conversation */
  conversing?: () => boolean;
  /** v10: the line the page holds for its rest, and when (Thunai.tsx cutRef: the wake path's same-breath rest, "Hey Jarvis, tell me about the") */
  heldCut?: () => { text: string; at: number } | null;
  /**
   * speech began (VAD onset): the browser's captions may start now. `engaged`: the turn is engaged by the lane's reckoning;
   * `fallback`: Whisper is out and the conductor's own recogniser hears this speech (the console's live captions stand aside)
   */
  onSpeechStart?: (o: { engaged: boolean; fallback?: boolean }) => void;
  /** the speech ended (also on stop and close): the captions stop */
  onSpeechEnd?: () => void;
  /**
   * an engaged sentence the transcriber did not answer in time, or could not read (a 502, a 500): it counts as not heard (a calm "I
   * didn't catch that" is the console's). Never for side talk. (B10: a 401 or a 403 is onSignedOut, not this)
   */
  onMissed?: (why: "timeout" | "error") => void;
}

type Own = "ok" | "timeout" | "abort" | "error" | "outage" | "signedout";
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
/** B10: /hear refused the session (401: none or expired; 403: refused): the Collector is signed out on this tab */
export const signedOutStatus = (status: number): boolean => status === 401 || status === 403;
/** how a /hear request that threw went */
const ownOf = (err: unknown): Own => err instanceof HearTimeout ? "timeout" : (err as Error)?.name === "AbortError" ? "abort" : err instanceof HearHttp && signedOutStatus(err.status) ? "signedout" : hearOutage(err) ? "outage" : "error";

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
  /** v6: when the on-device wake word last fired (Date.now()); 0 before any */
  private kwsAt = 0;
  /** v6: the wake reply waits for the Collector to pause (performance.now() of the wake) */
  private replyDue: number | null = null;
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
      // v12 (RC3): a voice asked for, not yet heard: a new request handed on before it starts stops it (turn.ts voiceWanted)
      onRequest: (ack) => this.dispatch({ type: "ttsWant", ack }),
      // the end-of-speech earcon plays only once the ears know it is Jarvis's own sound
      onEarcon: (ms, tone) => this.earcon(ms, tone),
      onDuck: (d) => this.h.mark?.(`duck:${d.path}:${d.how}`, performance.now()),
      // v13 (review 1-11): the wake reply ("Yes, Collector?") is sounding for `ms`: the request begun over it stops it (onVad start)
      onWakeSound: (ms) => { this.wakeSoundUntil = performance.now() + ms; },
      // v16 (22 Nov): Jarvis's voice waits while the Collector holds the floor (floorHeld)
      floorHeld: () => this.floorHeld()
    });
  }

  /**
   * v16 (22 Nov, the owner: "the voice reply is very late ... it's overlapping"): the Collector holds the floor: speech is being heard now, or a
   * sentence of theirs is still at the transcriber (the turn machine awaits its words). A voice asked for meanwhile waits (mouth.ts floorFree):
   * when those words are a request it is cancelled as it is handed on (turn.ts voiceWanted), otherwise it starts. Before v16 a late answer
   * started at full volume over the next question, or between its end and its transcript, and was cut a moment later
   */
  floorHeld(): boolean {
    if (!this.ears) return false;
    return this.speechOpen || this.m.awaiting;
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
          // v12: when this clip began, for the continuation join (continued())
          this.onsetAt = this.spokeAt;
          // v13 (21 Nov, review 1-11): the Collector began the request while the wake reply still sounds ("Hi Jarvis", a pause, the question):
          // the reply stops at once (a 15 ms fade), never said over the question's start. (Silero's onset only: the energy gate's is taken as the
          // reply's own sound while it plays, earconDrops)
          if (performance.now() < this.wakeSoundUntil) { this.wakeSoundUntil = 0; stopWakeReply(); this.h.mark?.("wakeReplyStopped", performance.now()); }
          // a new sentence: its own early request and its own count (E2)
          this.earlyAbort(); this.tries = 0;
          // each part of a sentence is captured from its own start: a part still at Whisper is joined, never posted again
          this.speechStart = ev.at;
          this.h.mark?.("vadStart", wall); this.noteOnset(); this.speechBegan(); this.dispatch({ type: "vadStart", at: ev.at }); this.h.onHearing?.("speech");
        } else {
          this.spokeAt = Date.now();
          // the trace's zero is the last voiced sample (the ears give it; older ears only the decision), its "eou" the decision
          this.endMark = { voiced: voicedEnd ?? wall, eou: wall };
          // v12: the wake reply's quiet after a sentence that ended runs from its last voiced sample (wakeReplyTick)
          this.voicedAt = voicedEnd ?? wall;
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
      onWakeWord: (at) => this.wakeWord(at),
      onFrame: (level, held) => {
        this.h.onLevel?.(level);
        if (this.replyDue != null) this.wakeReplyTick();
        if (this.ears) this.ears.echo = speaking() || this.earconOn();
        if (held > 0 && (this.m.state === "paused" || this.m.state === "hearing")) this.dispatch({ type: "tick", at: performance.now(), heldMs: held });
      }
    });
    this.ears = e;
    // B3: a start that hangs on one step (the browser's question aside) is given up, said, and reported (watchStart)
    const watch = this.watchStart(e);
    try {
      await Promise.race([e.start(), watch.stalled]);
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
    } finally {
      watch.done();
    }
    this.starting = false;
    if (this.ears !== e) { e.stop(); return; }
    // B1: the ears no longer wait for a click to start their audio context. One the browser lets start runs within a moment; one still
    // suspended after GESTURE_GRACE_MS waits for a click on the page, and the page asks for it (no frame is heard until then)
    if (e.needsGesture) void e.awake(GESTURE_GRACE_MS).then((ok) => { if (!ok && this.ears === e) this.h.onFail?.("gesture"); }).catch(() => undefined);
    this.dispatch({ type: "open" });
    // the strip's count is this minute's, so it falls as the minute passes
    this.pruneT = setInterval(() => {
      const n = this.ambient.length;
      this.ambient = this.ambient.filter((t) => Date.now() - t < 60_000);
      if (this.ambient.length !== n) this.h.onBudget?.({ low: this.budgetLow, ambient: this.ambient.length });
    }, 5000);
  }

  /**
   * B3 (27 Nov): the start watchdog. A step of the start is given MIC_START_LIMIT_MS from when it began (the ears record it; else from when
   * the watchdog first saw it): a step that moved on gets its own time (a slow worklet after a slow model is slow, not stuck). Past it, still
   * asking for the microphone while the permission is not "granted" is the browser's own question (or one it cannot tell apart from it), and
   * the wait is counted again from then; any other step is a stall: reported (onStall) and `stalled` rejects with "stalled", so open() gives
   * the start up at once. done() ends it.
   */
  private watchStart(e: Ears): { stalled: Promise<never>; done: () => void } {
    let over = false, timer: ReturnType<typeof setTimeout> | null = null;
    let fail: (err: Error) => void = () => undefined;
    const stalled = new Promise<never>((_, rej) => { fail = rej; });
    stalled.catch(() => undefined);
    const t0 = performance.now();
    const stageOf = () => String(e.stage ?? "unknown");
    let seen = stageOf(), from = 0;
    const arm = (ms: number) => { timer = setTimeout(tick, Math.max(50, ms)); };
    const tick = () => {
      timer = null;
      if (over || this.ears !== e) return;
      const now = performance.now() - t0;
      const stage = stageOf();
      if (stage !== seen) { seen = stage; from = (e.stageAt as Record<string, number> | undefined)?.[stage] ?? now; }
      const left = MIC_START_LIMIT_MS - (now - from);
      if (left > 1) { arm(left); return; }
      void micPermission().then((permission) => {
        if (over || this.ears !== e) return;
        if (stageOf() !== stage) { tick(); return; }
        if (stage === "gum" && permission !== "granted") { from = performance.now() - t0; arm(MIC_START_LIMIT_MS); return; }
        over = true;
        try { this.h.onStall?.({ stage, ms: Math.round(performance.now() - t0), ctx: e.ctxState ?? "none", permission }); } catch { /* a report never stops the give-up */ }
        fail(new Error("stalled"));
      });
    };
    arm(MIC_START_LIMIT_MS);
    return { stalled, done: () => { over = true; if (timer) { clearTimeout(timer); timer = null; } } };
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
    this.current = null;
    this.handedAt = 0;
    this.replyDue = null;
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
    this.handedAt = 0;
    if (this.holdT) { clearTimeout(this.holdT); this.holdT = null; }
    this.ears?.extend(0);
  }
  /**
   * v12 (RC2): a typed or tapped question took over from what was said: nothing said before it is joined to what is said next (the
   * continuation join, a held cut-off line). The sentence being handled keeps its number, so its own answered() still lets the machine go
   */
  forgetTurn() { this.handedAt = 0; this.held = null; }
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
  /**
   * The sentence's handling is over (the answer had nothing to say, or has begun). v12 (RC10): `id`, the HeardLine's own number: an older
   * sentence finishing late lets nothing go while a newer one is handled; the machine's generation no longer decides (a backchannel over
   * the acknowledgement moved it on, and the finished turn was never let go)
   */
  answered(id?: number) {
    if (id != null && this.current && this.current.id !== id) return;
    this.dispatch({ type: "answered" });
  }

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
    // v6: only an open ending ("show Adyar and") lengthens the sentence; a complete or neutral one (300 ms, the detector's own value)
    // leaves the detector its own choice, so a short command still ends at the short end (vad.ts shortEouMs) with the captions running
    this.ears?.endAfter(end.why === "open" ? end.ms : null);
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
    const before = this.m.state;
    const r = turn(this.m, e);
    this.m = r.m;
    for (const a of r.act) {
      switch (a.a) {
        // the barge-in specs time the first reaction under its old name, "paused"
        case "duckVoice": { duckVoice(); const t = performance.now(); this.h.mark?.("paused", t); this.h.mark?.("ducked", t); break; }
        case "unduckVoice": unduckVoice(); this.sayingAtOnset = null; break;
        case "cancelVoice": stopVoice(); this.cutAt = Date.now(); this.h.mark?.("cancelled", performance.now()); break;
        case "cancelTurn":
          // (v12, RC2: the cancelled sentence is no longer kept to be asked again later)
          this.inflight?.abort(); this.inflight = null; this.h.cancelTurn();
          if (this.live?.ctl.signal.aborted) this.live = null;
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
          if (p) {
            // v12 (RC10): the sentence's own number, for answered(id); and when it was handed on, for the continuation join
            const id = ++this.lineSeq;
            this.current = { ...p, text: a.text, id };
            this.handedAt = Date.now();
            this.h.onSentence({ ...p, text: a.text, gen: a.gen, id });
          }
          break;
        }
      }
    }
    if (this.m.state !== before) this.h.onState(this.m.state);
    // (v12, RC2: a noise that was too short to be a sentence no longer brings back a cancelled question: nothing is cancelled for a noise)
  }
  private pending: Omit<HeardLine, "text" | "gen" | "id"> | null = null;
  /** the sentence handed on last, with its gate, its source and its number */
  private current: Omit<HeardLine, "gen"> | null = null;
  /** v12: the sentences handed on, counted (HeardLine.id); when the last one was handed on (Date.now()), and when the clip now heard began */
  private lineSeq = 0;
  private handedAt = 0;
  private onsetAt = 0;
  /** v12: the last voiced sample of the last sentence that ended (performance.now()): the wake reply's quiet runs from it */
  private voicedAt = 0;
  /** v12: the Collector paused after the name (WAKE_PAUSE_MS) while the wake reply was due */
  private wakePaused = false;
  /** v13 (review 1-11): until when the wake reply's clip sounds (performance.now(); mouth.ts onWakeSound); 0 when none */
  private wakeSoundUntil = 0;
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

  /**
   * The speech being heard is engaged: it began over Jarvis's voice, or it comes within ENGAGED_MS of the wake or of Jarvis's last
   * turn, or of the moment Jarvis's answer was cut while its bookmark is kept for "continue". The bookmark lasts until Jarvis speaks
   * again and bargeIns never falls back, so that last reckoning is bounded by the same window (review gate-captions-wake-3): room
   * talk after it goes on the capped ambient lane, unengaged (no stand-in recogniser, no "didn't catch that").
   */
  private laneNow(): "engaged" | "ambient" {
    const now = Date.now(), last = this.engagedAt ?? 0;
    const cutKept = this.m.bargeIns > 0 && canContinue() && this.cutAt > 0 && now - this.cutAt <= ENGAGED_MS;
    return !!this.sayingAtOnset || cutKept || (last > 0 && now - last <= ENGAGED_MS) ? "engaged" : "ambient";
  }
  /**
   * v18 round 2 (24 Nov, the owner: "Jarvis gets stuck on the listening screen; only closing and opening it again gets an answer"; the log of 18:54-
   * 18:55 IST: five questions in a row let go as unaddressed, 40 s after the last answer): while the Collector works with Jarvis (one of its
   * screens open, or an answer in the last two minutes: the host says so) a request-shaped sentence is in the conversation; the gate still
   * lets side talk, chores and statements go
   */
  private conversingNow(): number { return this.h.conversing?.() ? Date.now() : 0; }
  /** when the turn machine last cut Jarvis's voice (Date.now()); 0 before any */
  private cutAt = 0;

  /** when the name was last heard (the wake) or Jarvis last finished a turn, whichever is later (Date.now()); null before either */
  get engagedAt(): number | null {
    const t = Math.max(this.h.lastTurnAt() ?? 0, this.engaged, this.heldAt, this.conversingNow());
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
  /**
   * v6: "Hey Jarvis" from the on-device wake word. Engaged at once (the next sentence, or the rest of this one, is the request); over
   * Jarvis's own voice it is a bid for the turn (as two live words are); the reply waits for a pause (wakeReplyTick).
   */
  private wakeWord(at: number) {
    this.h.mark?.("kws", at);
    this.engage();
    const over = speaking();
    // the call counts as answered only when a reply is due for it: over Jarvis's voice none is, so its transcript still gets one (the
    // independent check, 17 Nov: it was marked answered and the Collector heard nothing)
    this.kwsAt = over ? 0 : Date.now();
    if (this.m.state === "paused") this.dispatch({ type: "words", text: "hey jarvis" });
    this.h.onWakeWord?.({ at, overVoice: over });
    this.replyDue = over ? null : performance.now();
    this.wakePaused = false;
  }
  /**
   * v6: every frame while a wake reply is due: the Collector paused (or the sentence ended), or went on talking.
   * v12 (the critic of the 06:30 report): the quiet after the name must last wakeQuietMs (400 ms), measured from the last voiced sample
   * when the detector has already ended the sentence (it ends a short one after 180 ms, which used to count as the pause at once). Speech
   * that comes back after a pause shorter than that is the request under way: the earcon alone says the name was heard, never "Yes?" over it.
   */
  private wakeReplyTick() {
    const e = this.ears, t0 = this.replyDue;
    if (!e || t0 == null) { this.replyDue = null; return; }
    // v14 (replyWhenQuiet): the ears are still taking the parked audio over (its frames all come at one moment): the quiet is read from the
    // first live frame on, and the give-up runs from there
    if (this.starting) return;
    const from = t0 < 0 ? (this.replyDue = performance.now()) : t0;
    const now = performance.now();
    const quiet = e.inSpeech ? e.quietMs : now - this.voicedAt;
    if (quiet >= wakeQuietMs()) { this.replyDue = null; this.h.mark?.("wakeReply", now); this.h.onWakeReply?.(); return; }
    if (e.inSpeech && e.quietMs === 0 && this.wakePaused) { this.replyDue = null; this.h.mark?.("wakeTone", now); this.h.onWakeReply?.({ tone: true }); return; }
    if (quiet >= WAKE_PAUSE_MS) this.wakePaused = true;
    if (now - from > WAKE_REPLY_GIVE_UP_MS) this.replyDue = null;
  }
  /**
   * v14 (21 Nov, review scenarios 2): the closed listener opened Jarvis on the device's wake word with no recogniser to bring the sentence
   * (kws.ts wakeWait "listen"): the wake reply waits for the same quiet after the name as an open wake (wakeReplyTick), measured on these ears
   * from the hand-over, so it never plays over a request said straight on. False when there are no ears to measure it (the page replies at once)
   */
  replyWhenQuiet(): boolean {
    if (!this.ears) return false;
    // -1: armed, and timed from the first live frame (wakeReplyTick); the quiet runs from now, the name's end, until speech is heard
    this.replyDue = -1; this.voicedAt = performance.now(); this.wakePaused = false;
    return true;
  }
  /** v6: the on-device wake word is listening */
  get wakeWordLive(): boolean { return !!this.ears?.wakeWordLive; }

  /** The name was heard: the next sentences are engaged. */
  private engaged = 0;
  private engage() { this.engaged = Date.now(); this.h.onBudget?.({ low: this.budgetLow, ambient: this.ambient.length }); }
  /** The name opened Jarvis from closed (the console's wake listener): the next sentence is the call's own request, as after kws */
  called() { this.engage(); }
  /** v10: when a cut-off line was last held for its rest (ignored()): it keeps the window open, but it is no call (the gate's `called` is the name's
   * alone; a hold that engaged took the next side talk at tier 1: v10 review 2, finding 20) */
  private heldAt = 0;
  private fromCaptions(text: string) {
    const lang = /[஀-௿]/.test(text) ? "ta" : "en";
    // Jarvis's own voice, heard back by the captions, is not a sentence (as for Whisper's words: accept())
    if (selfHeard(text.trim(), this.sayingAtOnset ?? nowSaying())) return;
    this.lastLang = lang;
    // the same gate as Whisper's words: side talk goes no further than this browser
    const gate = this.gateFor(text);
    if (!gate.act) { this.ignored(text, gate, { lang, conf: CAPTIONS_CONF }); return; }
    // v12 (RC1): over a question in flight or Jarvis's voice, a line that only acknowledges or thanks replaces nothing (as in accept())
    const g = { greeting: !this.m.overVoice };
    if ((this.m.provisional || this.m.overVoice) && !this.answerAwaited() && (noRequest(gate.text, g) || noRequest(text, g))) { this.dropped("over-turn", lang, CAPTIONS_CONF); return; }
    this.pending = { lang, source: "captions", gate, conf: CAPTIONS_CONF };
    if (this.m.state === "listening") this.m = { ...this.m, awaiting: true, state: "thinking" };
    this.dispatch({ type: "text", text: gate.text, gen: this.m.gen });
  }

  /**
   * A line the gate turned away. v10 (docs/jarvis/JARVIS_V10.md Part 3: "Tell me about the" was answered as a request): a line cut off before its
   * point that was said to Jarvis (just called, or in the conversation) is held for its rest: the window stays open, and the page joins the next
   * sentence to it. Said to no one in particular, it is let go as before.
   */
  private ignored(text: string, gate: Addressed, info: { lang: "en" | "ta"; conf: number } = { lang: this.lastLang ?? "en", conf: 0 }) {
    if (gate.why === "cut-off" && understandV10()) {
      const last = Math.max(this.h.lastTurnAt() ?? 0, this.engaged, this.heldAt, this.conversingNow()) || 0;
      if (last > 0 && Date.now() - last <= ENGAGED_MS) {
        this.heldAt = Date.now(); this.held = { text, at: this.heldAt }; this.h.onIgnored(text, "cut-off-held");
        this.dropped("cut-off-held", info.lang, info.conf);
        return;
      }
    }
    this.h.onIgnored(text, gate.why);
    // v12: every line let go is counted, words-free (why, language, confidence): "I asked and got no answer" can be looked into
    this.dropped(gate.why, info.lang, info.conf);
  }
  /** v10: the line held last for its rest, and when (ignored()); the page joins the same rest to it (Thunai.tsx cutRef, joinCut) */
  private held: { text: string; at: number } | null = null;

  private gateFor(text: string): Addressed {
    const g = this.gateOne(text);
    // v10 review 2, round 2: the rest of a line held as cut off is the line's own rest, so it is gated with it ("Tell me about the" ... "accident in
    // Velachery yesterday" is a request; the rest alone, with its "yesterday", is side talk and was dropped). Only a rest the gate let go as talk
    // (side, aside, unaddressed, unclear) is read again; one said to someone else (another assistant, a title, a name, an errand) or a filler
    // stays theirs, and a rest that is itself cut off is held in its turn (ignored())
    if (!understandV10()) return g;
    // round 3: a line said to Jarvis (named or engaged) and cut off before its point is held too, as the page holds it ("Jarvis, tell me about the"
    // ... "accident in Velachery yesterday": the rest was gated alone and dropped); the hold keeps the window open, as ignored()'s does
    if (g.act) {
      if (cutOff(g.text)) { this.heldAt = Date.now(); this.held = { text: g.text, at: this.heldAt }; } else this.held = null;
      return g;
    }
    // the line held here, or the page's own if newer (the wake path's same-breath rest goes to the page, not through this gate)
    const p = this.h.heldCut?.() ?? null;
    const h = p && (!this.held || p.at > this.held.at) ? p : this.held;
    if (!h) return g;
    if (!/^(?:side|aside|unaddressed|unclear)$/.test(g.why)) return g;
    // round 3: a statement of its own is no rest ("Tell me about the" ... "the driver is waiting downstairs" was acted on: the held request lent it
    // its shape). Round 4: but a held line that opens a clause ("Tell me what the", "Check whether the", "Tell me if the") waits for a subject and
    // its verb, so a rest shaped as a statement is that clause ("situation is in Velachery"), unless a person or the speaker's own thing is its
    // subject ("my phone is not working"); and a noun whose verb is in its relative clause ("Show me the" ... "wards where water is stagnant") is
    // no statement. Both were gated as asides and never answered
    if (isStatement(text) && !(OPENS_CLAUSE.test(plain(h.text)) && !OWN_SUBJECT.test(plain(text))) && !NOUN_RELATIVE.test(plain(text))) return g;
    const joined = joinCut(h, text, Date.now());
    if (joined === text.trim()) return g;
    const j = this.gateOne(joined);
    if (!j.act) return g;
    this.held = null;
    return j;
  }
  private gateOne(text: string): Addressed {
    const r = this.h.rules(text);
    // v8: a yes, a card or a question back waiting: a plain "okay" is its answer, not a filler
    const awaitingAnswer = !!(this.h.wantsYes?.() || this.h.clarifyPending?.() || this.h.offerPending?.());
    // (v18 round 2's review: a card waiting for its answer keeps its own 20 s from Jarvis's last turn; being in the conversation never stretches
    // it, or an "okay" said to someone else a minute later would press the card's button)
    const real = Math.max(this.h.lastTurnAt() ?? 0, this.engaged, this.heldAt) || null;
    const last = awaitingAnswer ? real : Math.max(real ?? 0, this.conversingNow()) || null;
    // talking over Jarvis counts as engaged: it was speaking a moment ago
    const over = this.sayingAtOnset ? Date.now() : last;
    return addressed({ text, lastTurnAt: over, now: Date.now(), rulesSure: r.sure, districtNoun: r.districtNoun, awaitingAnswer, called: this.calledNow() });
  }
  /**
   * v8: the first sentence after "Hey Jarvis" (the name heard, nothing answered since, within 12 s) is the call's own request.
   * 27 Nov (review): ">=": the page marks the call as a turn (engagedNow) and then calls called() in the same millisecond, so ">" left the call
   * uncounted most of the time (the closed listener's wake and, since B4, a click-open)
   */
  private calledNow(): boolean { return this.engaged > 0 && this.engaged >= (this.h.lastTurnAt() ?? 0) && Date.now() - this.engaged < CALL_MS; }
  /** v8: a yes, a card or a question back is waiting: a plain "okay" is its answer, not a filler */
  private answerAwaited(): boolean { return !!(this.h.wantsYes?.() || this.h.clarifyPending?.() || this.h.offerPending?.()); }
  /**
   * v12 (the critic of RC1): a clip begun soon after the question still in flight was handed on, starting as its continuation ("in Adyar",
   * "and the drains", "the ones near the lake"), is that question's rest: the two are gated and handed on as one request, which replaces the
   * half in flight. Only then: a remark of its own ("it's not answering") or a fresh request is never glued onto the question.
   */
  private continued(t: string): Addressed | null {
    const prev = this.current;
    // (v13, review 1-13: a fresh question after the connective is its own: FRESH_AFTER; v14, review turns 5: unless it points back: freshTail)
    if (!this.m.provisional || !prev?.text || !this.handedAt || !CONTINUES.test(t) || freshTail(t)) return null;
    if (this.onsetAt < this.handedAt || this.onsetAt - this.handedAt > CONTINUE_MS) return null;
    const j = this.gateOne(`${prev.text.replace(/[\s.!?…]+$/u, "")} ${t}`);
    return j.act ? j : null;
  }
  /** v12 (the critic's silent drops): a line let go, as a words-free event for the page (telemetry, and a soft cue when engaged) */
  private dropped(why: string, lang: "en" | "ta", conf: number) {
    // v13 (review 1-9): `busy`, said while a question was in flight or over Jarvis's voice: the page gives no "I didn't catch that" for it
    const busy = !!this.m.provisional || this.m.handling || this.m.overVoice;
    this.h.onDropped?.({ why, lang, conf: Number.isFinite(conf) ? conf : 0, engaged: this.inWindow() || this.onsetInWindow, called: this.calledNow(), busy });
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
    // B10 (27 Nov): the session is gone (401, 403): said as that, whatever the lane (every later sentence would fail the same way), never as
    // "I didn't catch that" for an engaged sentence and silence for the rest
    if (!j && own === "signedout") { this.h.onSignedOut?.(); this.dispatch({ type: "text", text: "", gen }); return; }
    if (!j) {
      // too slow, or unreadable (a 502, a 500): not heard, and Jarvis listens again. The console says so calmly for an engaged
      // sentence only: side talk that was not transcribed is nobody's business. v12 (RC9): and only for the sentence now being read: an
      // older one's "I didn't catch that" cut in over the newer answer
      if ((own === "timeout" || own === "error") && rec.lane === "engaged" && gen === this.m.gen) this.h.onMissed?.(own);
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
    const t = text.trim();
    // v12 (RC9): the words of an older sentence (a newer one began, or a stop or a close came) have no side effects: no wake reply, no line
    // held for its rest, no pending sentence overwritten (the turn machine drops them by their generation anyway). Only the name alone
    // still opens the call window, or the request after it would be gated away as unaddressed (the critic of RC9)
    if (gen !== this.m.gen) {
      if (t && namedIn(t) === "") this.engage();
      return;
    }
    const saying = this.sayingAtOnset ?? nowSaying();
    // v13 (review 1-10): the speech cut an answer's voice that began under it (turn.ts `cut`; nothing was being said at its onset): an
    // interruption too, so a line that replaces nothing brings the answer back from its chunk, as after a barge-in
    const cut = !!this.m.cut;
    const interrupted = !!this.sayingAtOnset || cut;
    this.sayingAtOnset = null;
    // Jarvis's own voice, heard back: not a sentence
    if (t && selfHeard(t, saying)) { this.dropped("self-heard", lang, conf); this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    if (!t) { this.dispatch({ type: "text", text: "", gen }); this.backOn(interrupted); return; }
    this.lastLang = lang;
    // v12 (RC1): said while a question is in flight (turn.ts `provisional`) or over Jarvis's voice: the words decide. A continuation of the
    // question in flight is joined to it (continued()); a line that only acknowledges, thanks or greets replaces nothing
    // v13 (review 1-10): or said as it cut Jarvis's voice (`cut`): a thanks there ("Thank you Jarvis" as the answer began) is no new turn
    // either. A backchannel still goes to the turn machine, which says the answer again from its chunk (turn.ts resumeAnswer)
    const over = !!this.m.provisional || this.m.overVoice || (cut && !isBackchannel(t));
    // "Jarvis" and a pause: the end of utterance is short, so the name often arrives alone. It is not a request (said over the
    // voice, it stops the voice and listens: turn.ts; said while a question is in flight, it cancels nothing: v12)
    // 28 Nov (the owner: "if I say Jarvis thank you it should answer that too"): a thanks with the name, said when nothing is in flight and
    // Jarvis is not speaking, is a turn of its own (handle() answers it at once from smalltalk.ts), not the name alone and a "Yes?"
    const thanksTurn = !over && !speaking() && !this.m.voice && smallTalk(t) === "thanks";
    if (namedIn(t) === "" && !thanksTurn) {
      // v13 (review 1-0, 1-10): a thanks or an "okay" around the name ("Thank you Jarvis.", "okay thank you Jarvis": the gate's name alone)
      // said over a question in flight or Jarvis's voice is no call: no "Yes?" for it, nothing stops, and an answer it cut comes back
      if (over && !this.answerAwaited() && noRequest(t, { greeting: false })) {
        this.dropped("over-turn", lang, conf);
        this.dispatch({ type: "text", text: "", gen });
        this.backOn(interrupted);
        return;
      }
      this.engage();
      this.h.onNameOnly?.({ replied: Date.now() - this.kwsAt < WAKE_SAME_CALL_MS });
      this.dispatch({ type: "nameOnly", gen });
      return;
    }
    const gate = this.continued(t) ?? this.gateFor(t);
    if (!gate.act) {
      this.ignored(t, gate, { lang, conf });
      this.dispatch({ type: "text", text: "", gen });
      this.backOn(interrupted);
      return;
    }
    // (the line as said, too: "Jarvis, are you there?" is a greeting with its name, "are you there?" without; over or cutting the voice a
    // greeting is a call)
    const g = { greeting: !this.m.overVoice && !cut };
    // v14 (review turns 0): an answer's voice plays, or was asked for and has not started: a lone "Okay." or "Sorry." handed on would only stop it
    // (turn.ts `older`) and handle() says nothing for it (startsNoTurn), so the answer was never heard. Dropped here, the voice left alone
    const voiceOn = speaking() || this.m.voice || !!this.m.voiceWanted;
    if ((over || voiceOn) && !this.answerAwaited() && (over ? noRequest(gate.text, g) || noRequest(t, g) : startsNoTurn(gate.text) || startsNoTurn(t))) {
      this.dropped("over-turn", lang, conf);
      this.dispatch({ type: "text", text: "", gen });
      this.backOn(interrupted);
      return;
    }
    this.pending = { lang, source, gate, conf, ...(trace != null ? { trace } : {}) };
    this.dispatch({ type: "text", text: gate.text, gen, yesWanted: this.h.wantsYes?.() ?? false });
  }

  /**
   * The speech that cut Jarvis off was not for it: the answer goes on from its chunk. v12 (RC2): a question cancelled earlier is never
   * asked again here (it came back out of context, its lanes skipped, on any later noise; with speech while thinking no longer a cancel,
   * nothing is cancelled for a sentence that turns out not to be for Jarvis)
   */
  private backOn(interrupted: boolean) {
    if (interrupted && continueAnswer()) { this.m = { ...this.m, state: "speaking" }; this.h.onState("speaking"); }
  }

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
