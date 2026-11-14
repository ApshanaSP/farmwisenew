/**
 * Jarvis's numbers for the build report: one JSON line per event in data/thunai/telemetry.ndjson (THUNAI_DIR moves it; the
 * folder is git-ignored). Append-only. Timings, providers, codes and token counts only: never a transcript, never a citizen's
 * words. Server only. A failure here never reaches a turn.
 *
 * Two guards keep text out: only the keys in FIELDS are written, and a string value is written only when it reads as a code
 * (letters, digits and . _ : / # @ + -, no spaces, at most 80 characters). A sentence, a Tamil word or a phone number with
 * spaces is dropped, whatever key it came under.
 */
import fs from "fs";
import path from "path";

/** The events other parts of Jarvis write (any other name is accepted too, under the same field rules). */
export type TelemetryEvent =
  | "llm" | "hedge" | "warm" | "turn" | "resolve" | "bundle_miss"
  | "stt" | "stt_decode" | "stt_budget" | "tts" | "fallback_429" | "barge_in" | "self_heard" | "gate" | "signal";

/**
 * Every field telemetry keeps. Each is optional; none may hold a citizen's words (strings must be codes, see above).
 */
export interface TelemetryFields {
  // ---- common
  ms?: number;
  provider?: string;
  model?: string;
  tokens?: number;
  lane?: string;
  round?: number;
  calls?: number;
  ok?: boolean;
  why?: string;
  turn?: string;
  lang?: string;
  bytes?: number;
  hop?: number;
  cached?: boolean;
  count?: number;
  kind?: string;
  // ---- the model ladder (llm.ts) and Claude (claude.ts)
  /** how a Claude answer was asked for: structured outputs (format), a strict tool (tool), plain JSON (json), a cache warm (warm) */
  path?: string;
  /** usage.cache_read_input_tokens of a Claude call */
  cacheRead?: number;
  /** usage.cache_creation_input_tokens of a Claude call */
  cacheWrite?: number;
  /** a call stopped by Jarvis (the loser of a hedge, or the turn's deadline): its ms is a lower bound, never a completed sample */
  aborted?: boolean;
  /** a second model was asked while the first was still thinking */
  hedged?: boolean;
  /** who answered a hedged call: main, hedge or none */
  winner?: string;
  /** the model a hedge went to (provider/model) */
  into?: string;
  /** ms after the first call that the hedge fired */
  after?: number;
  // ---- ears (stt.ts)
  /** the STT model of one decode (also in `model`), and the decode it was: ta, en, gemini */
  decode?: string;
  /** a decode's average log-probability or confidence, a number only */
  conf?: number;
  /** the decode whose text was used */
  sttWinner?: string;
  // ---- voice (mouth.ts, /api/jarvis/say)
  /** characters spoken (a count, never the text) */
  chars?: number;
  // ---- rate limits
  /** HTTP status that caused a fallback (429) */
  status?: number;
  /** where the call went instead (provider/model) */
  fallback?: string;
  // ---- barge-in and echo
  /** how speech was cut off: pcm-duck, pcm-stop, browser-pause, browser-cancel */
  barge?: string;
  /** an utterance dropped as Jarvis hearing itself */
  selfHeard?: boolean;
  // ---- the address gate
  tier?: number;
  /** did the gate let the sentence act */
  act?: boolean;
  // ---- the watch and interjections
  /** a signal's kind (overdue, rise, rain...) */
  signal?: string;
  /** was the signal spoken aloud (or only queued) */
  spoken?: boolean;
  severity?: string;
  // ---- entity resolution (round.ts)
  entity?: string;
  via?: string;
  // ---- speculative reads (round.ts)
  hit?: boolean;
  tool?: string;
}

type Scalar = string | number | boolean | null | undefined;

const KEYS: (keyof TelemetryFields)[] = ["ms", "provider", "model", "tokens", "lane", "round", "calls", "ok", "why", "turn", "lang", "bytes", "hop", "cached", "count", "kind",
  "path", "cacheRead", "cacheWrite", "aborted", "hedged", "winner", "into", "after", "decode", "conf", "sttWinner", "chars", "status", "fallback", "barge", "selfHeard",
  "tier", "act", "signal", "spoken", "severity", "entity", "via", "hit", "tool"];
/** Only these keys are written: a stray `text` field cannot reach the file. */
export const FIELDS: ReadonlySet<string> = new Set<string>(["event", ...KEYS]);

/** A string is kept only when it reads as a code or an id: no spaces, no sentence, nothing over 80 characters. */
const CODE = /^[A-Za-z0-9._:/#@+-]{0,80}$/;
const keep = (v: Scalar): boolean => v !== undefined && (typeof v !== "string" || CODE.test(v)) && (typeof v !== "number" || Number.isFinite(v));

export function telemetry(event: TelemetryEvent | (string & {}), data: TelemetryFields | Record<string, Scalar> = {}) {
  try {
    const dir = process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");
    fs.mkdirSync(dir, { recursive: true });
    const row: Record<string, unknown> = { at: new Date().toISOString(), event };
    for (const [k, v] of Object.entries(data as Record<string, Scalar>)) if (FIELDS.has(k) && k !== "event" && keep(v)) row[k] = v;
    fs.appendFileSync(path.join(dir, "telemetry.ndjson"), `${JSON.stringify(row)}\n`);
  } catch { /* telemetry never reaches a turn */ }
}
