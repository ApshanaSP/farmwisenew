/**
 * The streamed turn (v4): `/agent/round` answers with NDJSON, one event a line, when the browser asks for it (`stream: true` in the
 * body). The event names follow AG-UI's vocabulary (ag-ui-protocol/ag-ui, MIT); no package is added. Order within a round:
 *   RUN_STARTED -> CUSTOM ack -> CUSTOM heard -> STEP_STARTED/STEP_FINISHED (the real work, with times) -> CUSTOM steps (console
 *   steps the browser runs before the next round) -> STATE_SNAPSHOT (the screen, built by code) -> TEXT_MESSAGE_CONTENT (the
 *   spoken sentences, each already filled and gated by code) -> RUN_FINISHED (the round's whole answer, as the JSON reply was).
 * Every event carries the turn id and the round; the browser drops an event whose turn id is not the turn in flight, so an old
 * answer can never speak. An ack is code-templated and holds no figure. Pure: types, the encoder and the reader.
 */
import type { AgentResult } from "./agent";
import type { StageDocT } from "./stage";
import type { Lang, Step } from "./types";

interface Base { turnId: string; round: number }
export type TurnEvent =
  | (Base & { type: "RUN_STARTED"; at: number })
  /** said or shown at once, before any model: code-templated, numberless */
  | (Base & { type: "CUSTOM"; name: "ack"; value: { text: string; lang: Lang } })
  /**
   * how the server read the sentence: its language, the lane it took, the speech confidence it was given; `speed` and `budgetMs` (v4,
   * optional): a command has 8 s, an analysis question or a mission 25 s (round.ts turnSpeed), so the browser waits that long. The ack
   * and heard events come in round 0 only.
   */
  | (Base & { type: "CUSTOM"; name: "heard"; value: { lang: Lang; lane: string; conf: number | null; speed?: "command" | "analysis"; budgetMs?: number } })
  /**
   * a step of the work begins. `elapsedMs` (v4, optional): the same step is still running after this long; a waiting analysis turn
   * sends one every few seconds (round.ts PROGRESS_EVERY_MS) so the browser can show, or say, that it is still working
   */
  | (Base & { type: "STEP_STARTED"; stepName: string; id: string; elapsedMs?: number })
  | (Base & { type: "STEP_FINISHED"; stepName: string; id: string; ms: number; ok: boolean })
  /** console steps the plan runs before it looks again; how they went comes back as observations in the next round */
  | (Base & { type: "CUSTOM"; name: "steps"; value: { steps: Step[] } })
  | (Base & { type: "STATE_SNAPSHOT"; snapshot: { stage: StageDocT } })
  /**
   * one spoken sentence, filled from code's values and passed by the number gate on the server. `figures` (v7): the figures of an aide sentence,
   * each checked on the server against the facts it cites (aide7/ground.ts); the browser's gate allows them for this sentence
   */
  | (Base & { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string; lang: Lang; figures?: number[] })
  /** the round's whole answer: what the JSON reply was ({ done, result, steps, trace, tokens, calls, hops, lane, cached }) */
  | (Base & { type: "RUN_FINISHED"; out: RoundOutWire })
  | (Base & { type: "RUN_ERROR"; message: string });

/** The wire form of a round's answer (round.ts RoundOut); `result` is the AgentResult the JSON reply carried. */
export interface RoundOutWire {
  done: boolean; result: AgentResult | null; steps: Step[]; trace: { label: string; ms: number; ok: boolean }[];
  tokens: number; calls: number; hops: string[]; lane: string; cached: boolean;
  /** v5 trace: the server's stage times (epoch ms), timings only */
  timing?: Partial<Record<string, number>>;
}

export const NDJSON = "application/x-ndjson";

/** One event as a line. */
export const encodeEvent = (e: TurnEvent): string => `${JSON.stringify(e)}\n`;

/**
 * Read an NDJSON body as it arrives and hand over each event in order. A line that is not JSON is skipped. Resolves when the body
 * ends; rejects only when the stream itself fails (an abort included, as fetch does).
 */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: TurnEvent) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let e: TurnEvent;
    try { e = JSON.parse(t) as TurnEvent; } catch { return; }
    onEvent(e);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  buf += dec.decode();
  flush(buf);
}
