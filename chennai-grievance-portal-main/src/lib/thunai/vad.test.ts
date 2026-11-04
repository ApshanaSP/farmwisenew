import { describe, expect, it } from "vitest";
import { EnergyVad, frameDb, ProbVad, TUNING } from "./vad";

/** Feed a level track (dB per 20 ms frame) and collect the events with their frame times. */
function run(vad: EnergyVad, track: number[], echo = false) {
  const out: { type: string; at: number; ms?: number; short?: boolean }[] = [];
  track.forEach((db, i) => { const e = vad.push(db, i * 20, echo); if (e) out.push(e); });
  return out;
}
const fill = (n: number, db: number) => Array.from({ length: n }, () => db);

describe("frameDb", () => {
  it("is -100 for silence and about -3 dB for a full-scale sine", () => {
    expect(frameDb(new Float32Array(320))).toBe(-100);
    const s = Float32Array.from({ length: 320 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
    expect(frameDb(s)).toBeCloseTo(-3, 0);
  });
});

describe("EnergyVad", () => {
  it("starts on a level above the floor, dates the start back to the first frame over the gate", () => {
    const ev = run(new EnergyVad(), [...fill(50, -60), ...fill(10, -30)]);
    expect(ev[0]).toEqual({ type: "start", at: 1000 });
  });
  it("ends after the end-of-utterance quiet, and reports how long the speech was", () => {
    const ev = run(new EnergyVad(), [...fill(50, -60), ...fill(40, -30), ...fill(40, -60)]);
    expect(ev.map((e) => e.type)).toEqual(["start", "end"]);
    expect(ev[1].at - 1000 - (ev[1].ms ?? 0)).toBeGreaterThanOrEqual(TUNING.endOfUtteranceMs);
    expect(ev[1].short).toBe(false);
  });
  it("calls a short burst short", () => {
    const ev = run(new EnergyVad(), [...fill(50, -60), ...fill(6, -30), ...fill(40, -60)]);
    expect(ev[1]).toMatchObject({ type: "end", short: true });
  });
  it("needs a higher level while Jarvis is talking (the echo margin)", () => {
    expect(run(new EnergyVad(), [...fill(50, -60), ...fill(10, -44)], true).length).toBe(0);
    expect(run(new EnergyVad(), [...fill(50, -60), ...fill(10, -44)], false)[0]?.type).toBe("start");
    expect(run(new EnergyVad(), [...fill(50, -60), ...fill(10, -30)], true)[0]?.type).toBe("start");
  });
  it("a hold word gives four seconds more before the sentence ends", () => {
    const v = new EnergyVad();
    run(v, [...fill(50, -60), ...fill(20, -30)]);
    v.extend(TUNING.holdExtendMs);
    const events: (string | undefined)[] = [];
    for (let i = 0; i < 100; i++) { const e = v.push(-60, 1400 + i * 20); if (e) events.push(e.type); }
    expect(events).toEqual([]);
    for (let i = 0; i < 120; i++) { const e = v.push(-60, 3400 + i * 20); if (e) events.push(e.type); }
    expect(events).toEqual(["end"]);
  });
  it("closes a sentence at the hard maximum", () => {
    const ev = run(new EnergyVad(), [...fill(50, -60), ...fill(800, -30)]);
    expect(ev[1]?.type).toBe("end");
    expect(ev[1].at - ev[0].at).toBeGreaterThanOrEqual(TUNING.maxUtteranceMs);
  });
  it("learns the floor only from frames that are not speech", () => {
    const v = new EnergyVad();
    run(v, [...fill(50, -60), ...fill(400, -30)]);
    expect(v.floor).toBeLessThan(-55);
  });
  it("the floor never goes below the minimum (digital silence would make every breath speech)", () => {
    const v = new EnergyVad();
    run(v, fill(100, -100));
    expect(v.floor).toBe(-70);
  });
});

describe("ProbVad", () => {
  const push = (v: ProbVad, ps: number[], echo = false, t0 = 0) => ps.map((p, i) => v.push(p, t0 + (i + 1) * 32, echo)).filter(Boolean);
  it("starts on three frames at 0.5, dated back to the first", () => {
    const ev = push(new ProbVad(), [0.1, 0.9, 0.9, 0.9, 0.9]);
    expect(ev[0]).toEqual({ type: "start", at: 32 });
  });
  it("while Jarvis talks: two frames, at 0.7", () => {
    expect(push(new ProbVad(), [0.6, 0.6, 0.6, 0.6], true)).toEqual([]);
    expect(push(new ProbVad(), [0.8, 0.8], true)[0]?.type).toBe("start");
  });
  it("ends below 0.35 after the hangover and marks a burst short", () => {
    const v = new ProbVad();
    const ev = push(v, [0.9, 0.9, 0.9, 0.9, ...new Array(12).fill(0.1)]);
    expect(ev[1]).toMatchObject({ type: "end", short: true });
  });
  it("speech a little under the in-threshold keeps the sentence open", () => {
    const v = new ProbVad();
    const ev = push(v, [0.9, 0.9, 0.9, ...new Array(30).fill(0.4)]);
    expect(ev.map((e) => e!.type)).toEqual(["start"]);
    expect(v.heldMs(33 * 32)).toBeGreaterThan(900);
  });
});

describe("speech held", () => {
  it("does not count the quiet after a short sound, so a cough never reaches the barge-in's 200 ms", () => {
    const v = new ProbVad();
    let at = 0, most = 0;
    for (let i = 0; i < 5; i++) { at += 32; v.push(0.9, at, true); most = Math.max(most, v.heldMs(at)); }
    for (let i = 0; i < 6; i++) { at += 32; v.push(0.05, at, true); most = Math.max(most, v.heldMs(at)); }
    expect(most).toBeLessThan(200);
  });
  it("still reaches it for a person", () => {
    const v = new ProbVad();
    let at = 0;
    for (let i = 0; i < 10; i++) { at += 32; v.push(0.9, at, true); }
    expect(v.heldMs(at)).toBeGreaterThanOrEqual(200);
  });
});
