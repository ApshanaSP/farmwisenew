/**
 * The streamed turn on the server (v4, lane L2): the spoken sentences of a round's answer, each passed by the number gate against the
 * screen's own figures before it is sent, and the NDJSON response the round routes answer with when the browser asks for `stream: true`
 * (events.ts holds the event names and the order). Server only; no package added.
 */
import type { AgentResult } from "./agent";
import { chunks } from "./chunker";
import { encodeEvent, NDJSON, type TurnEvent } from "./events";
import { gateChunk, zoneLabelsOut } from "./numbergate";
import { speakableFigures } from "./speakable";
import type { Lang, World } from "./types";

/**
 * What the round says aloud, a sentence at a time (chunker.ts): the screen's say, else the reply of an answer with no screen. A sentence
 * with a figure the screen does not hold (speakable.ts: its blocks and code's own text, never a model's free text) is not sent; a reply
 * with no screen may hold no figure at all. A zone's name ("Zone 13") is a label, not a figure.
 */
export function spokenSentences(r: AgentResult | null | undefined, w: World): { text: string; lang: Lang }[] {
  if (!r) return [];
  const text = r.say ?? (r.stage ? null : r.reply);
  if (!text?.trim()) return [];
  const lang: Lang = r.lang === "ta" ? "ta" : "en";
  const allowed = r.stage ? speakableFigures(r.stage, lang) : new Set<string>();
  const zones = w.zones.map((z) => z.n);
  return chunks(text).filter((s) => gateChunk(zoneLabelsOut(s, zones), allowed).ok).map((s) => ({ text: s, lang }));
}

/**
 * A round as an NDJSON response: `run` emits the events (round.ts planRound with `emit`), each written as one line the moment it happens.
 * A failure is one RUN_ERROR with no detail (the log keeps it); a stopped request (`signal`) just ends the stream.
 */
export function roundStream(run: (emit: (e: TurnEvent) => void) => Promise<unknown>, ids: { turnId: string; round: number }, signal?: AbortSignal): Response {
  const enc = new TextEncoder();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: TurnEvent) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(encodeEvent(e))); } catch { closed = true; }
      };
      try {
        await run(emit);
      } catch (e) {
        if (!signal?.aborted) {
          console.error("thunai round stream failed", e);
          emit({ ...ids, type: "RUN_ERROR", message: "failed" });
        }
      } finally {
        if (!closed) { closed = true; try { controller.close(); } catch { /* already gone */ } }
      }
    },
    cancel() { closed = true; }
  });
  return new Response(body, { headers: { "Content-Type": NDJSON, "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
