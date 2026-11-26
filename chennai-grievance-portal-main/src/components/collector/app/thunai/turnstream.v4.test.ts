// v4, Pillar 2 "stream the turn": the browser reads /agent/round's NDJSON events as they arrive, drops what belongs to another
// turn or arrives after the turn went stale, and falls back to the JSON reply of an older server. Nothing is shown or said twice.
import { describe, expect, it, vi } from "vitest";
import { encodeEvent, NDJSON, type RoundOutWire, type TurnEvent } from "@/lib/thunai/events";
import type { StageDocT } from "@/lib/thunai/stage";
import { budgetOf, readRound, SayQueue, settleStream } from "./turnstream";

const T = "t-now";
const doc = { v: 1, id: "s1", recipe: "cases", title: "Severe cases in Adyar", takeaway: null, say: { en: "Three need you.", ta: "மூன்று." }, blocks: [], scope: {}, slots: {}, sources: [], asOf: null, notes: [] } as unknown as StageDocT;
const out: RoundOutWire = { done: true, result: null, steps: [], trace: [{ label: "Reading the data", ms: 40, ok: true }], tokens: 10, calls: 1, hops: [], lane: "quick", cached: false };
const ev = (e: Record<string, unknown>, turnId = T): TurnEvent => ({ turnId, round: 0, ...e }) as unknown as TurnEvent;

/** a body that arrives in pieces, lines split across chunks */
function ndjson(events: TurnEvent[], split = 7): Response {
  const text = events.map(encodeEvent).join("");
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += split) parts.push(text.slice(i, i + split));
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } });
  return new Response(body, { headers: { "Content-Type": `${NDJSON}; charset=utf-8` } });
}
const full = (turnId = T) => [
  ev({ type: "RUN_STARTED", at: 1 }, turnId),
  ev({ type: "CUSTOM", name: "heard", value: { lang: "en", lane: "quick", conf: 0.8 } }, turnId),
  ev({ type: "STEP_STARTED", stepName: "Reading the data", id: "a" }, turnId),
  ev({ type: "STEP_FINISHED", stepName: "Reading the data", id: "a", ms: 40, ok: true }, turnId),
  ev({ type: "STATE_SNAPSHOT", snapshot: { stage: doc } }, turnId),
  ev({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Three need you.", lang: "en" }, turnId),
  ev({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "The worst is in Adyar.", lang: "en" }, turnId),
  ev({ type: "RUN_FINISHED", out }, turnId)
];

describe("readRound: the streamed round", () => {
  it("hands on every event in order as it arrives, and returns the round's whole answer", async () => {
    const seen: string[] = [];
    const r = await readRound(ndjson(full()), { turnId: T, live: () => true, hooks: {
      step: (s) => seen.push(`step ${s.id} ${s.state} ${s.ms}`), screen: (d) => seen.push(`screen ${d.id}`),
      sentence: (t) => seen.push(`say ${t}`), heard: (h) => seen.push(`heard ${h.conf}`) } });
    expect(seen).toEqual(["heard 0.8", "step 0-a running null", "step 0-a done 40", "screen s1", "say Three need you.", "say The worst is in Adyar."]);
    expect(r.out).toEqual(out);
    expect(r).toMatchObject({ streamed: true, timeline: true, stepsSent: false, sentences: ["Three need you.", "The worst is in Adyar."] });
    expect(r.screen?.id).toBe("s1");
  });
  it("console steps that arrive as an event are handed on once and flagged, so they are not run again from the answer", async () => {
    const steps = vi.fn();
    const r = await readRound(ndjson([ev({ type: "CUSTOM", name: "steps", value: { steps: [{ a: "page", page: "trends" }] } }), ev({ type: "RUN_FINISHED", out: { ...out, done: false, steps: [{ a: "page", page: "trends" }] } })]),
      { turnId: T, live: () => true, hooks: { steps } });
    expect(steps).toHaveBeenCalledTimes(1);
    expect(r.stepsSent).toBe(true);
  });
  it("drops every event of another turn: an old answer never shows or speaks", async () => {
    const screen = vi.fn(), sentence = vi.fn();
    const events = [...full("t-old").slice(0, -1), ...full()];
    const r = await readRound(ndjson(events), { turnId: T, live: () => true, hooks: { screen, sentence } });
    expect(screen).toHaveBeenCalledTimes(1);
    expect(sentence).toHaveBeenCalledTimes(2);
    expect(r.sentences).toEqual(["Three need you.", "The worst is in Adyar."]);
  });
  it("a turn that went stale (a barge-in, a newer sentence) stops: nothing after it is handed on, and the round rejects", async () => {
    let live = true;
    const screen = vi.fn(), sentence = vi.fn(() => { live = false; });
    await expect(readRound(ndjson(full()), { turnId: T, live: () => live, hooks: { screen, sentence } })).rejects.toMatchObject({ name: "AbortError" });
    expect(screen).toHaveBeenCalledTimes(1);
    expect(sentence).toHaveBeenCalledTimes(1);
  });
  it("RUN_ERROR, or a stream that ends with no answer, is a failed round", async () => {
    await expect(readRound(ndjson([ev({ type: "RUN_ERROR", message: "planner failed" })]), { turnId: T, live: () => true })).rejects.toThrow("planner failed");
    await expect(readRound(ndjson(full().slice(0, -1)), { turnId: T, live: () => true })).rejects.toThrow(/without an answer/);
  });
  it("a hook that throws does not lose the answer", async () => {
    const r = await readRound(ndjson(full()), { turnId: T, live: () => true, hooks: { screen: () => { throw new Error("cannot draw"); } } });
    expect(r.out).toEqual(out);
  });
  it("an older server's JSON reply is read as before; an error reply rejects with its message", async () => {
    const ok = await readRound(new Response(JSON.stringify({ done: true, result: null }), { headers: { "Content-Type": "application/json" } }), { turnId: T, live: () => true });
    expect(ok).toMatchObject({ streamed: false, out: { done: true, result: null } });
    await expect(readRound(new Response(JSON.stringify({ error: "Busy." }), { status: 429, headers: { "Content-Type": "application/json" } }), { turnId: T, live: () => true })).rejects.toThrow("Busy.");
    await expect(readRound(new Response("oops", { status: 500 }), { turnId: T, live: () => true })).rejects.toThrow("Request failed.");
  });
});

describe("two speeds: the browser waits as long as the server's heard event allows", () => {
  it("8 s for a command, up to 36 s for an analysis question, never outside those", () => {
    expect(budgetOf(undefined)).toBe(8000);
    expect(budgetOf(25_000)).toBe(25_000);
    expect(budgetOf(90_000)).toBe(36_000);
    expect(budgetOf(100)).toBe(8000);
    expect(budgetOf(Number.NaN)).toBe(8000);
  });
});

describe("SayQueue: sentence 1 speaks at once, the rest queue", () => {
  function voice() {
    const calls: { text: string; end: () => void }[] = [];
    const speak = (text: string, end: () => void) => { calls.push({ text, end }); return true; };
    return { calls, speak };
  }
  it("the first sentence starts before the second arrives; the queued ones are said together when it ends", () => {
    const v = voice();
    const q = new SayQueue(v.speak, () => true);
    q.push("One.");
    expect(v.calls.map((c) => c.text)).toEqual(["One."]);
    q.push("Two."); q.push("Three.");
    expect(v.calls.length).toBe(1);
    v.calls[0].end();
    expect(v.calls.map((c) => c.text)).toEqual(["One.", "Two. Three."]);
    const after = vi.fn();
    q.then(after);
    expect(after).not.toHaveBeenCalled();
    v.calls[1].end();
    expect(after).toHaveBeenCalledTimes(1);
    expect(q.said).toEqual(["One.", "Two.", "Three."]);
    expect(q.speaking).toBe(false);
  });
  it("a stale turn says nothing more", () => {
    const v = voice();
    let live = true;
    const q = new SayQueue(v.speak, () => live);
    q.push("One."); q.push("Two.");
    live = false;
    v.calls[0].end();
    expect(v.calls.length).toBe(1);
  });
  it("when nothing can be said, the queue is idle and waiters run", () => {
    const q = new SayQueue(() => false, () => true);
    q.push("One.");
    const after = vi.fn();
    q.then(after);
    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe("settleStream: RUN_FINISHED repeats what streamed", () => {
  it("the same screen and words: nothing shown or said again", () => {
    expect(settleStream({ screenId: "s1", said: ["Three need you.", "The worst is in Adyar."] }, { stage: { id: "s1" }, say: "Three need you. The worst is in Adyar." })).toEqual({ show: "none", speak: "none", rest: "" });
  });
  it("words that did not stream are said, and only those", () => {
    expect(settleStream({ screenId: "s1", said: ["Three need you."] }, { stage: { id: "s1" }, say: "Three need you.  The worst is in Adyar." })).toEqual({ show: "none", speak: "rest", rest: "The worst is in Adyar." });
  });
  it("nothing streamed: the screen and its words as before", () => {
    expect(settleStream({ screenId: null, said: [] }, { stage: { id: "s1" }, say: "Three need you." })).toEqual({ show: "full", speak: "all", rest: "" });
  });
  it("a screen with no words streamed: shown once, said once", () => {
    expect(settleStream({ screenId: "s1", said: [] }, { stage: { id: "s1" }, say: "Three need you." })).toEqual({ show: "none", speak: "all", rest: "" });
  });
  it("a different final screen takes the place of the streamed one, with its own words", () => {
    expect(settleStream({ screenId: "s1", said: ["Three need you."] }, { stage: { id: "s2" }, say: "Nothing open." })).toEqual({ show: "replace", speak: "all", rest: "" });
  });
  it("final words that differ from what was said are never said on top of it", () => {
    expect(settleStream({ screenId: "s1", said: ["Three need you."] }, { stage: { id: "s1" }, say: "Four need you." })).toEqual({ show: "none", speak: "none", rest: "" });
  });
});
