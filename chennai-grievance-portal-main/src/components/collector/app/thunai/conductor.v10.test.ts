/**
 * v10 review 2, finding 20: the conductor's hold of a cut-off line, in node (the microphone and the voice are stand-ins; the gate is real).
 * Holding "And the real problem is the" in the engaged window keeps the window open for its rest, but it is no call: the next remark to a
 * colleague is side talk as it was, never taken at tier 1 as if "Hey Jarvis" had been said.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./ears", () => ({ Ears: class { live = true; } }));
vi.mock("./mouth", () => ({
  EARCON_GUARD_MS: 400, setMouthHooks: () => undefined, speaking: () => false, nowSaying: () => null, canContinue: () => false,
  continueAnswer: () => false, stopVoice: () => undefined, duckVoice: () => undefined, unduckVoice: () => undefined
}));

import { addressed, type Addressed } from "@/lib/thunai/addressed";
import { Conductor, type ConductorHooks } from "./conductor";

type Inner = { gateFor(t: string): Addressed; ignored(t: string, g: Addressed): void; inWindow(now?: number): boolean };
const boot = (ig: [string, string | undefined][], lastTurn: number) => new Conductor({
  hearUrl: () => "/x", siteLang: () => "en", onSentence: () => undefined, cancelTurn: () => undefined,
  onIgnored: (t: string, why?: string) => ig.push([t, why]), onState: () => undefined, rules: () => ({ sure: false, districtNoun: false }),
  lastTurnAt: () => lastTurn
} as unknown as ConductorHooks) as unknown as Inner;

describe("v10 review 2: a held cut-off line is no call (finding 20)", () => {
  it("side talk after the held line is still side talk", () => {
    const lastTurn = Date.now() - 3000;
    const side = "he said the contractor will finish the drain work by Friday";
    const ig: [string, string | undefined][] = [];
    const before = boot(ig, lastTurn).gateFor(side);
    expect(before.act).toBe(false);
    const c = boot(ig, lastTurn);
    const g = c.gateFor("And the real problem is the");
    expect(g.why).toBe("cut-off");
    c.ignored("And the real problem is the", g);
    expect(ig.at(-1)?.[1]).toBe("cut-off-held");
    const after = c.gateFor(side);
    expect(`${after.act} ${after.why} tier${after.tier}`).toBe(`${before.act} ${before.why} tier${before.tier}`);
  });
  it("the hold still keeps the window open for the line's rest", () => {
    const lastTurn = Date.now() - 19_000;
    const c = boot([], lastTurn);
    c.ignored("Tell me about the", c.gateFor("Tell me about the"));
    // 19 s after Jarvis spoke plus the hold: the rest, said a few seconds on, is still in the window
    expect(c.inWindow(Date.now() + 5000)).toBe(true);
    expect(c.gateFor("fast news").act).toBe(true);
  });
});

describe("v10 review 2, round 2: the rest of a held cut-off line is gated with it (finding 20)", () => {
  // v10 review 2, round 2: once the hold stopped being a call, the rest was gated alone, and a rest with a past-tense or people word ("yesterday",
  // "say") was dropped as side talk although the whole request passes the gate; the gate now reads the held line and its rest together
  it.each([
    ["Tell me about the", "accident in Velachery yesterday"],
    ["What did the", "Commissioner say about the drains"],
    ["Show me the", "complaints that came in yesterday"],
    ["Tell me about the", "fire in Tondiarpet last night"],
    ["Show me the", "cases the AE closed yesterday"]
  ])("'%s' ... '%s' is acted on", (held, rest) => {
    const ig: [string, string | undefined][] = [];
    const c = boot(ig, Date.now() - 3000);
    const g = c.gateFor(held);
    expect(g.why).toBe("cut-off");
    c.ignored(held, g);
    expect(ig.at(-1)?.[1]).toBe("cut-off-held");
    // (the line said whole, in the same window, is acted on: the rest is gated as its part)
    expect(addressed({ text: `${held} ${rest}`, lastTurnAt: Date.now() - 3000, now: Date.now(), rulesSure: false, districtNoun: false }).act).toBe(true);
    expect(c.gateFor(rest).act).toBe(true);
  });
  it("with nothing held, the same rest is not ('accident in Velachery yesterday' alone is side talk)", () => {
    expect(boot([], Date.now() - 3000).gateFor("accident in Velachery yesterday").act).toBe(false);
  });
  it("a rest said to someone else is still theirs ('Alexa, play some music'; 'Sir, the car is ready')", () => {
    for (const rest of ["Alexa, play some music", "Sir, the car is ready"]) {
      const c = boot([], Date.now() - 3000);
      c.ignored("Tell me about the", c.gateFor("Tell me about the"));
      expect(c.gateFor(rest).act, rest).toBe(false);
    }
  });
  it("the held line is used once: the line after the rest is gated alone", () => {
    const c = boot([], Date.now() - 3000);
    c.ignored("Tell me about the", c.gateFor("Tell me about the"));
    expect(c.gateFor("accident in Velachery yesterday").act).toBe(true);
    expect(c.gateFor("he said the contractor will finish the drain work by Friday").act).toBe(false);
  });
});
