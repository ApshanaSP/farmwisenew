/**
 * Phase 7 review, lane F1 (Voice 3): on the PCM path the duck leaves the voice at 20 %, and Silero holds p >= 0.35 on that residue of
 * Jarvis's own voice, so the speech "held" grew to 600 ms and Jarvis cancelled itself. While Jarvis's voice plays (echo), only frames
 * a voice over it would give (p >= 0.7 for Silero, over the full gate for the energy detector) count as held, for the ticks and for
 * the sentence's end alike; a person talking over it still reaches 600 ms. Each check failed on the code before the fix.
 */
import { describe, expect, it } from "vitest";
import { turn, turnStart, type TurnEvent, type TurnModel } from "./turn";
import { EnergyVad, ProbVad, TUNING } from "./vad";

const frames = (v: ProbVad, ps: number[], t0: number, echo: boolean) => {
  let at = t0, most = 0, end: ReturnType<ProbVad["push"]> = null;
  for (const p of ps) { at += 32; const e = v.push(p, at, echo); if (e?.type === "end") end = e; most = Math.max(most, v.heldMs(at)); }
  return { at, most, end };
};

describe("Silero over Jarvis's own voice", () => {
  it("the ducked voice's residue (p 0.4-0.6) after a short onset never adds up to the 600 ms barge-in", () => {
    const v = new ProbVad();
    // an "mm-hmm" over the voice: two frames at 0.8 start it (the echo bar), then a second of Jarvis's own words, ducked, at 0.45
    const r = frames(v, [0.8, 0.8, 0.85, ...new Array(32).fill(0.45), ...new Array(4).fill(0.55)], 0, true);
    expect(r.most).toBeLessThan(TUNING.bargeHoldMs);
  });
  it("a person talking over it still reaches 600 ms", () => {
    const v = new ProbVad();
    const r = frames(v, new Array(24).fill(0.9), 0, true);
    expect(r.most).toBeGreaterThanOrEqual(TUNING.bargeHoldMs);
  });
  it("with no voice playing nothing changes: speech a little under the in-threshold still counts", () => {
    const v = new ProbVad();
    const r = frames(v, [0.9, 0.9, 0.9, ...new Array(30).fill(0.4)], 0, false);
    expect(r.most).toBeGreaterThan(900);
  });
  it("the sentence's end says how much of it was a voice over the voice (strong)", () => {
    const v = new ProbVad();
    const r = frames(v, [0.8, 0.8, 0.85, ...new Array(30).fill(0.45), ...new Array(12).fill(0.1)], 0, true);
    expect(r.end).toMatchObject({ type: "end", short: false });
    const end = r.end as Extract<NonNullable<typeof r.end>, { type: "end" }>;
    expect(end.ms).toBeGreaterThan(900);
    expect(end.strong).toBeLessThan(TUNING.bargeHoldMs);
  });
});

describe("the energy gate over Jarvis's own voice", () => {
  it("counts only frames over the full gate while the voice plays, not the hysteresis band below it", () => {
    const v = new EnergyVad();
    let at = 0;
    for (let i = 0; i < 50; i++) v.push(-60, (at += 20), true);
    // a short voice over the gate (floor -60 + 12 + 8 = -40), then the voice's residue just under it, inside the hysteresis band
    for (let i = 0; i < 4; i++) v.push(-35, (at += 20), true);
    let most = 0;
    for (let i = 0; i < 50; i++) { v.push(-42, (at += 20), true); most = Math.max(most, v.heldMs(at)); }
    expect(most).toBeLessThan(TUNING.bargeHoldMs);
  });
});

describe("the turn machine reads the strong part of a sentence said over the voice", () => {
  const SPEAKING: TurnEvent[] = [{ type: "open" }, { type: "vadStart", at: 0 }, { type: "vadEnd", at: 1000, ms: 700, short: false }, { type: "text", text: "show me the severe cases", gen: 1 }, { type: "ttsStart" }];
  const play = (evs: TurnEvent[], m0: TurnModel = turnStart()) => evs.reduce((s, e) => { const r = turn(s.m, e); return { m: r.m, act: r.act }; }, { m: m0, act: [] as ReturnType<typeof turn>["act"] });
  it("a long stretch held only by the voice's own residue is read by Whisper with the voice still ducked, never a barge-in", () => {
    const r = play([...SPEAKING, { type: "quickOnset", at: 2000 }, { type: "vadStart", at: 2000 }, { type: "vadEnd", at: 4000, ms: 1700, short: false, strong: 120 }]);
    expect(r.act.some((a) => a.a === "cancelVoice")).toBe(false);
    expect(r.m.state).toBe("paused");
    expect(r.act).toEqual([{ a: "transcribe", gen: r.m.gen }]);
  });
  it("a sentence that really held 600 ms over the voice still stops it", () => {
    const r = play([...SPEAKING, { type: "quickOnset", at: 2000 }, { type: "vadStart", at: 2000 }, { type: "vadEnd", at: 3200, ms: 900, short: false, strong: 800 }]);
    expect(r.act[0]).toEqual({ a: "cancelVoice" });
    expect(r.m.state).toBe("thinking");
  });
  it("an end with no strong part given reads as before", () => {
    const r = play([...SPEAKING, { type: "quickOnset", at: 2000 }, { type: "vadStart", at: 2000 }, { type: "vadEnd", at: 3200, ms: 900, short: false }]);
    expect(r.act[0]).toEqual({ a: "cancelVoice" });
  });
});
