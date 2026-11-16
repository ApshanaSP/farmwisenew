import { afterEach, describe, expect, it } from "vitest";
import { serverClock } from "@/lib/thunai/stagetime";
import { resetTrace, stamp, stampServer, traceLane, traceRows, traces, traceStart } from "./trace";

afterEach(() => resetTrace());

describe("the per-stage trace (v5 6.4)", () => {
  it("measures from the last voiced sample, and the first stamp of a stage wins", () => {
    traceStart(1000);
    stamp("eou", 1300);
    stamp("uploadSent", 1310);
    stamp("uploadSent", 1900);
    traceLane("planner");
    const t = traces()[0];
    expect(traceRows(t)).toEqual([{ stage: "voicedEnd", ms: 0 }, { stage: "eou", ms: 300 }, { stage: "uploadSent", ms: 310 }]);
    expect(t.lane).toBe("planner");
  });

  it("places a server's offsets at the browser stage that sent the request", () => {
    traceStart(0);
    stamp("uploadSent", 150);
    stampServer("uploadSent", { sttSent: 5, sttBack: 470 });
    expect(traceRows(traces()[0]).map((r) => [r.stage, r.ms])).toEqual([["voicedEnd", 0], ["uploadSent", 150], ["sttSent", 155], ["sttBack", 620]]);
  });

  it("does nothing with no turn open, and keeps at most 20 turns", () => {
    stamp("eou", 5);
    expect(traces()).toEqual([]);
    for (let i = 0; i < 25; i++) traceStart(i);
    expect(traces().length).toBe(21);
  });

  it("holds timings only: a trace has numbers and a lane, never words", () => {
    traceStart(0);
    stamp("gateDone", 40);
    expect(JSON.stringify(traces()[0])).toMatch(/^\{"n":\d+,"zero":0,"at":\{"voicedEnd":0,"gateDone":40\},"lane":null\}$/);
  });

  it("a route's clock gives offsets from its receipt of the request", () => {
    const c = serverClock();
    c.mark("sttSent");
    c.mark("sttSent");
    const t = c.timing();
    expect(Object.keys(t)).toEqual(["sttSent"]);
    expect(t.sttSent).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Review voice-detector-latency-1: a stamp belongs to the turn that made it, not to whichever trace opened last. Every upload opens
 * a trace (side talk too), so a planner turn's answer stages (firstEvent, plannerSent, plannerBack, toolsDone, speakCalled, voiceStart)
 * landed on a side-talk trace opened while it ran, and a typed turn's on the last spoken turn's trace.
 */
describe("each stamp lands on its own turn's trace", () => {
  const trace = () => import("./trace");
  it("a numbered stamp lands on that turn's trace (open or kept), never on a newer one; null lands nowhere", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    // side talk while the planner runs: its upload opens a newer trace
    const t2 = t.traceStart(500);
    t.stamp("firstEvent", 900, t1.n);
    t.stampEpoch({ plannerSent: 1_000_700, plannerBack: 1_001_300 }, 1_000_000, t1.n);
    t.traceLane("planner", t1.n);
    expect(t1.at).toMatchObject({ firstEvent: 900, plannerSent: 700, plannerBack: 1300 });
    expect(t1.lane).toBe("planner");
    expect(t2.at).toEqual({ voicedEnd: 500 });
    expect(t2.lane).toBeNull();
    // a turn with no trace of its own (typed text): its stamps go nowhere
    t.stamp("firstEvent", 950, null);
    t.stampEpoch({ toolsDone: 1_002_000 }, 1_000_000, null);
    t.traceLane("planner", null);
    expect(t2.at).toEqual({ voicedEnd: 500 });
    expect(t2.lane).toBeNull();
  });
  it("a turn pushed out of the kept 20 gets nothing; a number never seen gets nothing", async () => {
    const t = await trace();
    const old = t.traceStart(0);
    for (let i = 1; i <= 21; i++) t.traceStart(i);
    t.stamp("firstEvent", 99, old.n);
    t.stamp("firstEvent", 99, 9_999);
    expect(old.at.firstEvent).toBeUndefined();
    expect(t.traces().some((x) => x.at.firstEvent != null)).toBe(false);
  });
  it("once the console says which turn it is answering, the voice's un-numbered stamps land on that turn, not on side talk's trace", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    t.traceAnswer(t1.n);
    const t2 = t.traceStart(500);
    // the mouth stamps with no number (mouth.ts): the answer's first sentence handed to speak, then its first sample
    t.stamp("speakCalled", 1000);
    t.stamp("firstEvent", 980);
    t.stamp("voiceStart", 1200);
    expect(t1.at).toMatchObject({ speakCalled: 1000, firstEvent: 980, voiceStart: 1200 });
    expect(t2.at).toEqual({ voicedEnd: 500 });
    // the ears' own stages still go to the open trace (they are stamped as it opens)
    t.stamp("hearBack", 1300);
    expect(t2.at.hearBack).toBe(1300);
    expect(t1.at.hearBack).toBeUndefined();
  });
  it("a typed turn (null) after a spoken rules turn that said nothing: its answer's stamps land nowhere", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    t.traceAnswer(t1.n);
    t.traceLane("rules", t1.n);
    t.traceAnswerDone(t1.n);
    t.traceAnswer(null);
    t.stamp("firstEvent", 20_000);
    t.stampEpoch({ plannerSent: 1_020_100 }, 1_000_000);
    t.stamp("speakCalled", 21_000);
    t.stamp("voiceStart", 21_400);
    expect(t1.at).toEqual({ voicedEnd: 0 });
  });
  it("the turn's handling over (traceAnswerDone), an unprompted line's stamps land nowhere; its own voice, already handed to speak, still lands", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    t.traceAnswer(t1.n);
    t.stamp("speakCalled", 800);
    t.traceAnswerDone(t1.n);
    // the voice starts after the turn's handling ended: it is still that answer's voice
    t.stamp("voiceStart", 1100);
    expect(t1.at).toMatchObject({ speakCalled: 800, voiceStart: 1100 });
    // an interjection later: handed to speak with no turn, its voice belongs to none
    const t2 = t.traceStart(30_000);
    t.stamp("speakCalled", 31_000);
    t.stamp("voiceStart", 31_300);
    expect(t2.at).toEqual({ voicedEnd: 30_000 });
  });
  it("traceAnswerDone releases only its own turn: a newer turn's claim stands", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    t.traceAnswer(t1.n);
    const t2 = t.traceStart(100);
    t.traceAnswer(t2.n);
    t.traceAnswerDone(t1.n);
    expect(t.traceAnswering()).toBe(t2.n);
    t.stamp("speakCalled", 400);
    expect(t2.at.speakCalled).toBe(400);
    expect(t1.at.speakCalled).toBeUndefined();
  });
  it("with no console saying (the mouth's own tests, before Jarvis mode), an un-numbered stamp goes to the open trace, as before", async () => {
    const t = await trace();
    expect(t.traceAnswering()).toBeUndefined();
    const t1 = t.traceStart(0);
    t.stamp("speakCalled", 10);
    t.stamp("voiceStart", 20);
    expect(t1.at).toMatchObject({ speakCalled: 10, voiceStart: 20 });
  });
  it("the round's reader stamps firstEvent and the planner's stages on the turn it is given, or on none", async () => {
    const t = await trace();
    const { readRound } = await import("./turnstream");
    const json = () => new Response(JSON.stringify({ done: true, timing: { plannerSent: performance.timeOrigin + 700 } }), { status: 200, headers: { "content-type": "application/json" } });
    const t1 = t.traceStart(0);
    const t2 = t.traceStart(500);
    await readRound(json(), { turnId: "t-a", live: () => true, trace: t1.n });
    expect(typeof t1.at.firstEvent).toBe("number");
    expect(t1.at.plannerSent).toBeCloseTo(700, 3);
    expect(t2.at.firstEvent).toBeUndefined();
    await readRound(json(), { turnId: "t-b", live: () => true, trace: null });
    expect(t2.at).toEqual({ voicedEnd: 500 });
  });
  it("timings only, still: no words in any trace", async () => {
    const t = await trace();
    const t1 = t.traceStart(0);
    t.traceAnswer(t1.n);
    t.stamp("speakCalled", 5);
    expect(JSON.stringify(t.traces())).toMatch(/^\[\{"n":\d+,"zero":0,"at":\{"voicedEnd":0,"speakCalled":5\},"lane":null\}\]$/);
  });
});

describe("the server's stage times on the browser clock", () => {
  it("epoch times are placed at their offset from the time origin; unknown stages and non-numbers are left out", async () => {
    const { stampEpoch } = await import("./trace");
    traceStart(100);
    stampEpoch({ plannerSent: 1_000_200, plannerBack: 1_001_400, bogus: 5, toolsDone: Number.NaN } as Record<string, number>, 1_000_000);
    expect(traceRows(traces()[0]).map((r) => [r.stage, r.ms])).toEqual([["voicedEnd", 0], ["plannerSent", 100], ["plannerBack", 1300]]);
  });
});
