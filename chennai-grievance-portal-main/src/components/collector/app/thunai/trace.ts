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
 */

import { TRACE_STAGES, type ServerTiming, type TraceStage } from "@/lib/thunai/stagetime";

export { TRACE_STAGES, type ServerTiming, type TraceStage };

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

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

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

/** Stamp a stage of the current turn (first stamp wins). No turn open: nothing happens. */
export function stamp(stage: TraceStage, t: number = now()): void {
  if (!cur || cur.at[stage] != null) return;
  cur.at[stage] = t;
  mirror();
}

/** Place a server's offsets on the browser clock at the stage that sent the request (see the header on accuracy). */
export function stampServer(base: TraceStage, timing: ServerTiming | null | undefined): void {
  if (!cur || !timing) return;
  const at = cur.at[base];
  if (at == null) return;
  for (const [k, v] of Object.entries(timing)) if (typeof v === "number" && Number.isFinite(v)) stamp(k as TraceStage, at + v);
}

/** Which lane the current turn took. */
export function traceLane(lane: string): void {
  if (cur && !cur.lane) { cur.lane = lane; mirror(); }
}

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
}
