/**
 * The streamed turn in the browser (v4). One round of `/agent/round` asked with `stream: true` comes back as NDJSON events
 * (lib/thunai/events.ts): the work timeline, console steps, the screen, the spoken sentences, then RUN_FINISHED with the
 * round's whole answer. readRound hands each event on as it arrives and returns that whole answer, so the turn loop goes on as
 * it did with the JSON reply; a plain JSON reply (an older server, an error, a 429) is read exactly as before.
 * An event of another turn, or one that arrives after the turn stopped being the one in flight, is dropped: an old answer
 * can never show or speak. SayQueue speaks the first sentence at once and queues the rest; settleStream says what is left to
 * do when RUN_FINISHED repeats a screen and words that already streamed (nothing is shown or said twice).
 */
import { NDJSON, readEvents, type RoundOutWire, type TurnEvent } from "@/lib/thunai/events";
import type { StageDocT } from "@/lib/thunai/stage";
import type { Lang, Step } from "@/lib/thunai/types";
import type { VoicePath } from "./mouth";
import { stamp, stampEpoch } from "./trace";

/**
 * Are a streamed answer's sentences spoken as they come (SayQueue)? Only on the browser's own voice, which is free and at once. On the
 * server's voice each queued run would be its own speech request (3 a minute) and could come back in another voice mid-answer, so
 * there the words show as they stream and the whole answer is said once, at RUN_FINISHED (Phase 7 review, Planner 3).
 */
export const queuesSentences = (path: VoicePath | null): boolean => path === "browser";

export interface RoundHooks {
  /** the work timeline: a step began, or ended with the time it really took (the server's ms) */
  step?: (s: { id: string; label: string; state: "running" | "done" | "failed"; ms: number | null }) => void;
  /** console steps the plan runs before it looks again */
  steps?: (steps: Step[]) => void;
  /** the screen, built by code: it can be shown now */
  screen?: (doc: StageDocT) => void;
  /** one spoken sentence, filled and gated by code on the server (the browser gates it again as it speaks); `figures` (v7): the server-checked figures of an aide sentence */
  sentence?: (text: string, lang: Lang, figures?: number[]) => void;
  /** how the server read the sentence (and, from a v4 server, how long the turn may take: `budgetMs`) */
  heard?: (v: Extract<TurnEvent, { type: "CUSTOM"; name: "heard" }>["value"]) => void;
}

/** the turn's budget in the browser: 8 s for a command; a v4 server may give an analysis question or a mission up to 25 s */
export const COMMAND_MS = 8000, LONGEST_MS = 25_000;
export const budgetOf = (budgetMs: unknown): number =>
  (typeof budgetMs === "number" && Number.isFinite(budgetMs) ? Math.max(COMMAND_MS, Math.min(LONGEST_MS, budgetMs)) : COMMAND_MS);

export interface RoundRead {
  /** the round's whole answer, as the JSON reply was */
  out: RoundOutWire;
  /** it came as events */
  streamed: boolean;
  /** the timeline arrived as steps (the answer's trace need not be drawn again) */
  timeline: boolean;
  /** the console steps arrived as an event (they are not to be run again from the answer) */
  stepsSent: boolean;
  screen: StageDocT | null;
  sentences: string[];
}

/** The turn stopped being the one in flight while its round was read. */
export class StaleRound extends Error { constructor() { super("stale"); this.name = "AbortError"; } }

/**
 * Read one round's reply. NDJSON: every event of this turn is handed on in order while `live()` holds; resolves with
 * RUN_FINISHED's answer, rejects on RUN_ERROR, on a stream that ends without one, or when the turn went stale. Anything else
 * is read as JSON, as `post()` did: a reply that is not ok rejects with its error.
 * `trace`: the trace number of the turn this round answers (null: a turn with no trace, typed text): firstEvent and the planner's
 * stages land on that turn only, never on a trace that side talk opened while the round ran (trace.ts; review voice-detector-latency-1).
 */
export async function readRound(res: Response, o: { turnId: string; live: () => boolean; hooks?: RoundHooks; trace?: number | null }): Promise<RoundRead> {
  const ct = res.headers.get("content-type") ?? "";
  if (!(res.ok && res.body && ct.toLowerCase().includes(NDJSON))) {
    const j = await res.json().catch(() => ({})) as RoundOutWire & { error?: string };
    if (!res.ok) throw new Error(j.error || "Request failed.");
    // the v5 trace: the answer is here (a plain JSON reply is its own first event), and the server's stage times
    stamp("firstEvent", undefined, o.trace);
    stampEpoch(j.timing, undefined, o.trace);
    return { out: j, streamed: false, timeline: false, stepsSent: false, screen: null, sentences: [] };
  }
  const h = o.hooks ?? {};
  const r: RoundRead = { out: null as unknown as RoundOutWire, streamed: true, timeline: false, stepsSent: false, screen: null, sentences: [] };
  let finished = false, error: string | null = null, stale = false;
  // a hook that throws (a screen that cannot be drawn) does not lose the round's answer
  const safe = (f: () => void) => { try { f(); } catch (e) { console.error("jarvis stream hook failed", e); } };
  await readEvents(res.body, (e: TurnEvent) => {
    if (finished || error != null || stale) return;
    if (!o.live()) { stale = true; return; }
    if (e.turnId !== o.turnId) return;
    // the v5 trace (6.4): the first event of this turn in the browser (first stamp wins), on this turn's own trace
    stamp("firstEvent", undefined, o.trace);
    switch (e.type) {
      case "STEP_STARTED": r.timeline = true; safe(() => h.step?.({ id: `${e.round}-${e.id}`, label: e.stepName, state: "running", ms: null })); return;
      case "STEP_FINISHED": r.timeline = true; safe(() => h.step?.({ id: `${e.round}-${e.id}`, label: e.stepName, state: e.ok ? "done" : "failed", ms: Number.isFinite(e.ms) ? Math.round(e.ms) : null })); return;
      case "STATE_SNAPSHOT": if (e.snapshot?.stage) { r.screen = e.snapshot.stage; safe(() => h.screen?.(e.snapshot.stage)); } return;
      case "TEXT_MESSAGE_CONTENT": if (e.delta?.trim()) { r.sentences.push(e.delta); safe(() => h.sentence?.(e.delta, e.lang, Array.isArray(e.figures) ? e.figures.filter((x) => typeof x === "number" && Number.isFinite(x)).slice(0, 20) : undefined)); } return;
      case "RUN_FINISHED": r.out = e.out; finished = true; stampEpoch(e.out?.timing, undefined, o.trace); return;
      case "RUN_ERROR": error = e.message || "The round failed."; return;
      case "CUSTOM":
        if (e.name === "steps") { r.stepsSent = true; safe(() => h.steps?.(e.value.steps ?? [])); }
        else if (e.name === "heard") safe(() => h.heard?.(e.value));
        return;
      default: return;
    }
  });
  if (stale || !o.live()) throw new StaleRound();
  if (error != null) throw new Error(error);
  if (!finished) throw new Error("The round ended without an answer.");
  return r;
}

/**
 * The streamed sentences, spoken in order: the first at once, the rest queued while it plays and said together when it ends.
 * `speak` is the page's own speak (every chunk passes the number gate in the mouth); it returns false when nothing can be
 * said. A cancelled speech never calls its onEnd (mouth.ts), so a queue whose voice was cut by a newer answer just stops.
 */
export class SayQueue {
  readonly said: string[] = [];
  private q: string[] = [];
  private busy = false;
  private waiters: (() => void)[] = [];
  constructor(private speak: (text: string, onEnd: () => void) => boolean, private live: () => boolean) {}
  get speaking() { return this.busy; }
  push(text: string) {
    const t = text.trim();
    if (!t) return;
    this.said.push(t);
    if (this.busy) { this.q.push(t); return; }
    this.go(t);
  }
  /** run `f` when everything queued has been said (at once when nothing is) */
  then(f: () => void) { if (this.busy) this.waiters.push(f); else f(); }
  /** a newer answer took the voice: nothing more is said from here */
  drop() { this.q = []; this.waiters = []; this.busy = false; }
  private go(text: string) {
    this.busy = true;
    const ok = this.speak(text, () => {
      if (!this.live() || !this.busy) return;
      const next = this.q.splice(0);
      if (next.length) this.go(next.join(" "));
      else this.idle();
    });
    if (!ok) { this.q = []; this.idle(); }
  }
  private idle() {
    this.busy = false;
    const w = this.waiters.splice(0);
    if (this.live()) for (const f of w) f();
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * RUN_FINISHED carries the whole answer again. What is left to do:
 *   show: "none" (the streamed screen is this one), "replace" (another screen streamed: this one takes its place without
 *   pushing it on the back stack), "full" (nothing streamed);
 *   speak: "all" (nothing was said yet), "rest" (the words that did not stream), "none" (all of it was said, or the final
 *   words differ from what was already said: never twice).
 */
export function settleStream(streamed: { screenId: string | null; said: string[] }, final: { stage: Pick<StageDocT, "id"> | null; say: string | null }):
  { show: "none" | "replace" | "full"; speak: "all" | "rest" | "none"; rest: string } {
  const show = !final.stage ? "none" : streamed.screenId == null ? "full" : streamed.screenId === final.stage.id ? "none" : "replace";
  const said = norm(streamed.said.join(" "));
  const say = norm(final.say ?? "");
  // another screen took the place of the one that streamed: its words are its own
  if (show === "replace" || !said) return { show, speak: say ? "all" : "none", rest: "" };
  if (!say || !say.startsWith(said)) return { show, speak: "none", rest: "" };
  const rest = say.slice(said.length).trim();
  return { show, speak: rest ? "rest" : "none", rest };
}
