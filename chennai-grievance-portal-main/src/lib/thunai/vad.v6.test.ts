/**
 * v6: a short sentence ("Hi Jarvis", "Go to trends": under TUNING.shortUtteranceMs of speech) ends after TUNING.shortEouMs of quiet
 * instead of endOfUtteranceMs; a longer one, one whose live words set its own end (eou.ts), or one held longer is as before.
 * NEXT_PUBLIC_JARVIS_SHORT_EOU_MS=0 turns it off.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eouBaseMs, ProbVad, shortEouMs, shortUtteranceMs, TUNING } from "./vad";

afterEach(() => vi.unstubAllEnvs());

/** speech for `speechMs`, then quiet: when (ms after the last voiced frame) the end event comes */
function endAfter(v: ProbVad, speechMs: number, opts: { eou?: number; extend?: number } = {}): number | null {
  let at = 0;
  const f = v.o.frameMs;
  for (; at < speechMs; at += f) v.push(0.9, at + f);
  if (opts.eou != null) v.endAfter(opts.eou);
  if (opts.extend != null) v.extend(opts.extend);
  const lastVoiced = at;
  for (let q = 0; q < 6000; q += f) { const e = v.push(0.05, at + q + f); if (e?.type === "end") return at + q + f - lastVoiced; }
  return null;
}

describe("v6: the short sentence's end", () => {
  it("a short sentence ends after about shortEouMs of quiet, a long one after endOfUtteranceMs", () => {
    const short = endAfter(new ProbVad(), 700)!;
    expect(short).toBeGreaterThanOrEqual(TUNING.shortEouMs);
    expect(short).toBeLessThan(TUNING.shortEouMs + 40);
    const long = endAfter(new ProbVad(), 2000)!;
    expect(long).toBeGreaterThanOrEqual(TUNING.endOfUtteranceMs);
    expect(long).toBeLessThan(TUNING.endOfUtteranceMs + 40);
  });
  it("the captions' own end (eou.ts) and a hold win over it", () => {
    expect(endAfter(new ProbVad(), 700, { eou: 650 })!).toBeGreaterThanOrEqual(650);
    expect(endAfter(new ProbVad(), 700, { extend: 1000 })!).toBeGreaterThanOrEqual(1000 + TUNING.endOfUtteranceMs);
  });
  it("NEXT_PUBLIC_JARVIS_SHORT_EOU_MS: 0 is off (the v5 end), a number sets it (never above endOfUtteranceMs)", () => {
    expect(shortEouMs(undefined)).toBe(TUNING.shortEouMs);
    expect(shortEouMs("0")).toBe(0);
    expect(shortEouMs("120")).toBe(120);
    expect(shortEouMs("900")).toBe(TUNING.endOfUtteranceMs);
    vi.stubEnv("NEXT_PUBLIC_JARVIS_SHORT_EOU_MS", "0");
    const off = endAfter(new ProbVad(), 700)!;
    expect(off).toBeGreaterThanOrEqual(TUNING.endOfUtteranceMs);
  });
  it("NEXT_PUBLIC_JARVIS_SHORT_UTT_MS and NEXT_PUBLIC_JARVIS_EOU_MS (measuring knobs): unset is as before; out of range is ignored", () => {
    expect(shortUtteranceMs(undefined)).toBe(TUNING.shortUtteranceMs);
    expect(shortUtteranceMs("1800")).toBe(1800);
    expect(shortUtteranceMs("9000")).toBe(TUNING.shortUtteranceMs);
    expect(eouBaseMs(undefined)).toBe(TUNING.endOfUtteranceMs);
    expect(eouBaseMs("250")).toBe(250);
    expect(eouBaseMs("50")).toBe(TUNING.endOfUtteranceMs);
    // a 1.5 s sentence is short with 1800, long without
    expect(endAfter(new ProbVad(), 1500)!).toBeGreaterThanOrEqual(TUNING.endOfUtteranceMs);
    vi.stubEnv("NEXT_PUBLIC_JARVIS_SHORT_UTT_MS", "1800");
    expect(endAfter(new ProbVad(), 1500)!).toBeLessThan(TUNING.shortEouMs + 40);
    vi.stubEnv("NEXT_PUBLIC_JARVIS_EOU_MS", "250");
    const long = endAfter(new ProbVad(), 2500)!;
    expect(long).toBeGreaterThanOrEqual(250);
    expect(long).toBeLessThan(250 + 40);
  });
});
