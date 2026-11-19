/**
 * E2 (early speech-to-text): the numbers in TUNING, and the quiet each detector has heard inside a sentence that has not ended (the
 * ears' pause at TUNING.earlySttMs is read from it). The end of utterance itself is unchanged.
 */
import { describe, expect, it } from "vitest";
import { EnergyVad, ProbVad, TUNING } from "./vad";

describe("E2's numbers", () => {
  it("the early upload at 150 ms of quiet, never for a sentence over 10 s, at most 2 requests a sentence", () => {
    expect(TUNING.earlySttMs).toBe(150);
    expect(TUNING.earlySttMaxMs).toBe(10_000);
    expect(TUNING.earlySttAttempts).toBe(2);
  });
  it("the end of utterance is as it was: 300 ms, 300 ms complete, 650 ms open", () => {
    expect(TUNING.endOfUtteranceMs).toBe(300);
    expect(TUNING.eouCompleteMs).toBe(300);
    expect(TUNING.eouOpenMs).toBe(650);
  });
});

describe("the quiet inside a sentence", () => {
  it("EnergyVad: 0 outside speech; the quiet so far inside it; 0 again when the voice comes back; 0 after the end", () => {
    const v = new EnergyVad();
    let at = 0;
    const push = (n: number, db: number) => { for (let i = 0; i < n; i++) { v.push(db, at); at += 20; } };
    expect(v.quiet).toBe(0);
    push(50, -60);
    expect(v.quiet).toBe(0);
    push(10, -30);
    expect(v.speaking).toBe(true);
    expect(v.quiet).toBe(0);
    push(8, -60);
    expect(v.quiet).toBe(160);
    push(1, -30);
    expect(v.quiet).toBe(0);
    push(15, -60);
    expect(v.speaking).toBe(false);
    expect(v.quiet).toBe(0);
  });
  it("ProbVad: the same on 32 ms frames", () => {
    const v = new ProbVad();
    let at = 0;
    const push = (n: number, p: number) => { for (let i = 0; i < n; i++) { at += 32; v.push(p, at); } };
    push(5, 0.1);
    expect(v.quiet).toBe(0);
    push(10, 0.9);
    expect(v.speaking).toBe(true);
    push(5, 0.1);
    expect(v.quiet).toBe(160);
    push(1, 0.6);
    expect(v.quiet).toBe(0);
    push(10, 0.1);
    expect(v.speaking).toBe(false);
    expect(v.quiet).toBe(0);
  });
});
