/**
 * The per-stage trace of one spoken turn (v5 build, section 6.4). Timings only: no audio, no words, no transcript (rule 3).
 *
 * Zero is the LAST VOICED SAMPLE of the utterance (the end of the last frame the detector heard as speech), not the moment the
 * detector decided the utterance had ended. Every browser stage is a performance.now() time; the server's stages arrive as
 * offsets from the server's own receipt of the request and are placed on the browser's clock at the browser stage that sent
 * that request (the upload for speech-to-text, the round request for the planner): on one machine the up-link time is about 0,
 * so this placement is close but not exact, and is labelled so wherever it is reported.
 *
 * The first stamp of a stage in a turn wins (a retried upload does not move "uploadSent"). The last 20 turns are kept in
 * memory only, for the measurement view and the specs (window.__jv.trace when the spec hooks are on).
 *
 * Each stamp belongs to its own turn (review voice-detector-latency-1). Every upload opens a trace, side talk too, so "the open
 * trace" is only the ears' own stages' home (eou, uploadSent, the server's offsets, hearBack: stamped as the trace opens). A stamp
 * that carries a turn number lands on that turn's trace, open or kept, and nowhere else; a null number (a turn with no trace: typed
 * text, an unprompted line) lands nowhere. The answer's stages (ANSWER) stamped with no number go to the turn the console says it is
 * answering (traceAnswer), and a voice's start to the turn whose answer was last handed to speak; before the console says anything
 * (the mouth's own tests, no Jarvis mode) they go to the open trace, as before.
 */

import { TRACE_STAGES, type EpochTiming, type ServerTiming, type TraceStage } from "@/lib/thunai/stagetime";

export { TRACE_STAGES, type EpochTiming, type ServerTiming, type TraceStage };

export interface TurnTrace {
  /** a running number, never a turn's words */
  n: number;
  /** performance.now() of the last voiced sample */
  zero: number;
  /** performance.now() of each stage, first stamp wins */
  at: Partial<Record<TraceStage, number>>;
  /** which lane the turn took, once known: "rules" | "planner" | "other" */
  lane: string | null;
}

const KEEP = 20;
const done: TurnTrace[] = [];
let cur: TurnTrace | null = null;
let count = 0;
/** the turn the console is answering (traceAnswer): a trace number, null for none; undefined until the console says */
let answering: number | null | undefined;
/** the turn whose answer was last handed to speak ("speakCalled"): its voice's start is that turn's; undefined until then */
let voicing: number | null | undefined;

/** the stages after the gate: the turn being answered owns them, never whatever utterance opened a trace since */
const ANSWER: ReadonlySet<TraceStage> = new Set<TraceStage>(["firstEvent", "plannerSent", "plannerBack", "toolsDone", "speakCalled", "voiceStart"]);

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** a kept or open trace by its number; null for none (a turn with no trace, or one pushed out of the kept 20) */
const byNumber = (n: number | null): TurnTrace | null => (n == null ? null : cur?.n === n ? cur : done.find((t) => t.n === n) ?? null);
/** where a stamp goes: a numbered one to its own turn only; an answer stage to the turn being answered once the console says; else the open trace */
function target(stage: TraceStage, turn: number | null | undefined): TurnTrace | null {
  if (turn !== undefined) return byNumber(turn);
  if (stage === "voiceStart" && voicing !== undefined) return byNumber(voicing);
  if (ANSWER.has(stage) && answering !== undefined) return byNumber(answering);
  return cur;
}
/** first stamp of a stage wins */
function put(tr: TurnTrace | null, stage: TraceStage, t: number): void {
  if (!tr || tr.at[stage] != null) return;
  tr.at[stage] = t;
  mirror();
}

function mirror() {
  try {
    const w = window as unknown as { __jv?: { trace?: TurnTrace[] } };
    if (w.__jv) w.__jv.trace = [...done, ...(cur ? [cur] : [])].map((t) => ({ ...t, at: { ...t.at } }));
  } catch { /* no window (server, tests) */ }
}

/** A new turn's trace, zero at the last voiced sample (a performance.now() time). The previous one is kept as done. */
export function traceStart(lastVoiced: number): TurnTrace {
  if (cur) { done.push(cur); if (done.length > KEEP) done.shift(); }
  cur = { n: ++count, zero: lastVoiced, at: { voicedEnd: lastVoiced }, lane: null };
  mirror();
  return cur;
}

/**
 * Stamp a stage (first stamp wins). `turn`: the trace number of the turn it belongs to (it lands there only, open or kept), or null
 * for a turn with no trace (it lands nowhere); left out, see the header (the turn being answered, or the open trace). No such turn:
 * nothing happens.
 */
export function stamp(stage: TraceStage, t: number = now(), turn?: number | null): void {
  const tr = target(stage, turn);
  // the answer handed to speak now is this turn's (or none's): its voice's start goes with it, whoever speaks next
  if (stage === "speakCalled" && (turn !== undefined || answering !== undefined)) voicing = tr ? tr.n : null;
  put(tr, stage, t);
}

/** Place a server's offsets on the browser clock at the stage that sent the request (see the header on accuracy). */
export function stampServer(base: TraceStage, timing: ServerTiming | null | undefined, turn?: number | null): void {
  const tr = target(base, turn);
  if (!tr || !timing) return;
  const at = tr.at[base];
  if (at == null) return;
  for (const [k, v] of Object.entries(timing)) if (typeof v === "number" && Number.isFinite(v)) put(tr, k as TraceStage, at + v);
}

/**
 * Place a server's absolute stage times (epoch ms) on the browser clock (performance.timeOrigin): exact on one machine, off by the
 * clock skew across machines. A time that is not a number is left out. `turn` as for stamp().
 */
export function stampEpoch(timing: EpochTiming | Partial<Record<string, number>> | null | undefined, origin?: number, turn?: number | null): void {
  if (!timing) return;
  const o = origin ?? (typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : null);
  if (o == null) return;
  for (const [k, v] of Object.entries(timing)) if ((TRACE_STAGES as readonly string[]).includes(k) && typeof v === "number" && Number.isFinite(v)) stamp(k as TraceStage, v - o, turn);
}

/** Which lane a turn took (once): `turn` its trace number (null: none); left out, the open trace. */
export function traceLane(lane: string, turn?: number | null): void {
  const tr = turn === undefined ? cur : byNumber(turn);
  if (tr && !tr.lane) { tr.lane = lane; mirror(); }
}

/**
 * The console says which turn it is answering now: a spoken sentence's trace number, or null (typed text, an unprompted line, nothing
 * yet). The answer's stages stamped with no number go there from now on.
 */
export function traceAnswer(turn: number | null): void {
  answering = turn;
}
/** That turn's handling is over: nothing more is answered for it (unless a newer turn has taken over since, which stands). */
export function traceAnswerDone(turn: number): void {
  if (answering === turn) answering = null;
}
/** The turn being answered: a number, null for none, undefined before the console said anything. */
export const traceAnswering = (): number | null | undefined => answering;

/** A trace as ms from zero, stage by stage (missing stages left out). */
export function traceRows(t: TurnTrace): { stage: TraceStage; ms: number }[] {
  return TRACE_STAGES.filter((s) => t.at[s] != null).map((s) => ({ stage: s, ms: Math.round((t.at[s] as number) - t.zero) }));
}

/** The kept traces, oldest first, the open one last. */
export function traces(): TurnTrace[] {
  return [...done, ...(cur ? [cur] : [])];
}

/** Forget everything (tests). */
export function resetTrace(): void {
  done.length = 0;
  cur = null;
  count = 0;
  answering = undefined;
  voicing = undefined;
}
