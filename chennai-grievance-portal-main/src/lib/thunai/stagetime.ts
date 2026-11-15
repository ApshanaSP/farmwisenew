/**
 * The stages of a spoken turn's trace (v5 build, section 6.4), shared by the browser's trace (ui/trace.ts) and the routes that
 * report their own server times. Timings only: no audio, no words (rule 3).
 */
export const TRACE_STAGES = [
  "voicedEnd", // the last voiced sample (zero)
  "eou", // the end-of-utterance decision
  "uploadSent", // the speech-to-text upload sent
  "sttSent", // server: the speech-to-text request(s) sent to the provider
  "sttBack", // server: the decode that won came back
  "hearBack", // the browser has the transcript
  "gateDone", // the address gate and the rules are done
  "plannerSent", // server: the planner call sent
  "plannerBack", // server: the planner call back
  "toolsDone", // server: tools run, first sentence built
  "firstEvent", // the first streamed event received in the browser
  "speakCalled", // speak() called for the first sentence
  "voiceStart" // the voice's onstart (or the PCM path's first sample scheduled)
] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

/** Absolute times (epoch ms) of server stages: on one machine the browser places them exactly (performance.timeOrigin); across machines, clock skew applies. */
export type EpochTiming = Partial<Record<TraceStage, number>>;

/** Offsets in ms from the server's receipt of the request, as a route returns them (timings only). */
export type ServerTiming = Partial<Record<TraceStage, number>>;

/** A server-side clock for a route: offsets in ms from the route's receipt of the request. */
export function serverClock(): { mark: (stage: TraceStage) => void; timing: () => ServerTiming } {
  const t0 = Date.now();
  const out: ServerTiming = {};
  return { mark: (stage) => { if (out[stage] == null) out[stage] = Date.now() - t0; }, timing: () => ({ ...out }) };
}
