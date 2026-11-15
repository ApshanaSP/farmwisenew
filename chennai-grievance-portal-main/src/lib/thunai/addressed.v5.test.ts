/**
 * v5 C1: the unengaged command tier is cut. With no name and outside the 20 s after Jarvis's last turn, a sentence the rules
 * resolve, or an imperative with a district noun, no longer acts: in a room, an officer saying a console-shaped line to a colleague
 * is side talk. Only the bare stop word still acts there (level A). JARVIS_GATE_COMMAND_TIER=1 (in the browser
 * NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1), or the gate's own input `commandTier`, brings v4's tier 3 back.
 * Every sentence here is invented for this test: none is a row of any eval set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { START, WORLD } from "./fixture";
import { districtNounIn, quickScreen } from "./quick";
import { understand } from "./understand";
import { addressed, ENGAGED_MS, isImperative, levelAllowed, type GateInput } from "./addressed";

const state = { ...START, now: Date.parse("2026-11-15T10:00:00+05:30") };
const NOW = 1_000_000;
/** what the console's rules hook hands the gate (Thunai.tsx, `rules`) */
const rules = (t: string) => {
  const q = quickScreen(t, WORLD);
  const u = q ? null : understand(t, state, WORLD, { speechConf: 0.95 });
  return { rulesSure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(t, WORLD) };
};
const gate = (text: string, o: Partial<GateInput> = {}) => addressed({ text, lastTurnAt: null, now: NOW, ...rules(text), ...o });

/** one officer to another at the same table, in the shape of a console command: the rules resolve each one */
const SURE = [
  "open the Teynampet drainage complaints",
  "show garbage complaints in Royapuram",
  "severe cases in Perungudi this week",
  "list the street light complaints in Manali",
  "மாதவரம் புகார்கள் காட்டுங்க",
  "Ambattur la garbage complaints kaattunga"
];
/** an imperative and a district noun, with the rules not sure: v4's second command return */
const IMPERATIVE = ["compare Alandur and Kodambakkam", "pull up the Sholinganallur flooding list", "பெருங்குடி பட்டியல் காட்டு"];

const ENV = ["JARVIS_GATE_COMMAND_TIER", "NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER"] as const;
beforeEach(() => { for (const k of ENV) vi.stubEnv(k, ""); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("C1: the look-alike lines are what tier 3 acted on", () => {
  it.each(SURE)("%s: the rules resolve it, and it carries a district noun or an imperative", (t) => {
    const r = rules(t);
    expect(r.rulesSure).toBe(true);
    expect(r.districtNoun || isImperative(t)).toBe(true);
  });
  it.each(IMPERATIVE)("%s: an imperative with a district noun", (t) => {
    expect(isImperative(t)).toBe(true);
    expect(districtNounIn(t, WORLD)).toBe(true);
  });
});

describe("C1: with the command tier on (v4), each look-alike acts at level A", () => {
  it.each(SURE)("%s", (t) => {
    expect(gate(t, { commandTier: true })).toMatchObject({ tier: 3, act: true, maxLevel: "A", why: "rules" });
  });
  it.each(IMPERATIVE)("%s", (t) => {
    expect(gate(t, { rulesSure: false, commandTier: true })).toMatchObject({ tier: 3, act: true, maxLevel: "A", why: "imperative" });
  });
});

describe("C1: by default (v5), none of them acts", () => {
  it.each(SURE)("%s", (t) => {
    const g = gate(t);
    expect(g).toMatchObject({ tier: 0, act: false, maxLevel: null });
    expect(levelAllowed(g, "A")).toBe(false);
  });
  it.each(IMPERATIVE)("%s", (t) => {
    expect(gate(t, { rulesSure: false })).toMatchObject({ tier: 0, act: false, maxLevel: null });
    expect(gate(t, { rulesSure: true })).toMatchObject({ tier: 0, act: false, maxLevel: null });
  });
});

describe("C1: the switch", () => {
  const t = SURE[0];
  it("JARVIS_GATE_COMMAND_TIER=1 brings tier 3 back (the server, and the harness)", () => {
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "1");
    expect(gate(t)).toMatchObject({ tier: 3, act: true, maxLevel: "A" });
  });
  it("NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1 brings it back in the browser, where only NEXT_PUBLIC_ is inlined", () => {
    vi.stubEnv("NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER", "1");
    expect(gate(t)).toMatchObject({ tier: 3, act: true, maxLevel: "A" });
  });
  it("any other value leaves it cut", () => {
    for (const v of ["0", "true", "on", "yes"]) {
      vi.stubEnv("JARVIS_GATE_COMMAND_TIER", v);
      expect(gate(t), v).toMatchObject({ tier: 0, act: false });
    }
  });
  it("the input field overrides the env, both ways, so a harness can count both", () => {
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "1");
    expect(gate(t, { commandTier: false })).toMatchObject({ tier: 0, act: false });
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "");
    expect(gate(t, { commandTier: true })).toMatchObject({ tier: 3, act: true });
  });
});

describe("C1: what the cut leaves alone", () => {
  it.each(["stop", "stop it please", "Enough", "niruthunga", "stop pannunga", "நிறுத்து", "போதும் நிறுத்து"])("the bare stop word %s still acts at level A, unnamed and unengaged", (t) => {
    for (const commandTier of [undefined, false]) {
      const g = gate(t, { commandTier });
      expect(g).toMatchObject({ tier: 3, act: true, maxLevel: "A", why: "stop" });
      expect(levelAllowed(g, "A")).toBe(true);
      expect(levelAllowed(g, "B")).toBe(false);
    }
  });
  it("an unnamed command with no turn yet is refused; the same 5 s after Jarvis's last turn acts (tier 2, engaged)", () => {
    const t = "show the overdue drainage cases in Teynampet";
    expect(gate(t, { lastTurnAt: null })).toMatchObject({ tier: 0, act: false });
    expect(gate(t, { lastTurnAt: NOW - 5000 })).toMatchObject({ tier: 2, act: true, maxLevel: "C", why: "engaged" });
    // and just outside the window it is refused again
    expect(gate(t, { lastTurnAt: NOW - ENGAGED_MS - 1 })).toMatchObject({ tier: 0, act: false });
  });
  it("each look-alike still acts when engaged, and with the name", () => {
    for (const t of [...SURE, ...IMPERATIVE]) {
      const g = gate(t, { lastTurnAt: NOW - 5000 });
      expect(g.act, t).toBe(true);
      expect([2, 3], t).toContain(g.tier);
      expect(gate(`Jarvis, ${t}`), t).toMatchObject({ tier: 1, act: true, maxLevel: "C" });
    }
  });
  it("inside the window, a sure line with no request shape keeps v4's command reading (level A); outside it, refused", () => {
    // six words and no request word: tier 2's shape test passes it by, and the command tier took it while engaged in v4
    const t = "severe cases in Perungudi this week";
    expect(gate(t, { lastTurnAt: NOW - 5000 })).toMatchObject({ tier: 3, act: true, maxLevel: "A", why: "rules" });
    expect(gate(t, { lastTurnAt: NOW - ENGAGED_MS - 1 })).toMatchObject({ tier: 0, act: false });
    expect(gate(t, { lastTurnAt: NOW - 5000, commandTier: false })).toMatchObject({ tier: 3, act: true, maxLevel: "A" });
  });
});
