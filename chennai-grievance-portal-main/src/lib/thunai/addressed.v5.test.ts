/**
 * v5 C1: the command tier is cut. With no name, a sentence the rules resolve, or an imperative with a district noun, no longer acts
 * at tier 3, outside the 20 s after Jarvis's last turn or inside it: in a room, an officer saying a console-shaped line to a colleague
 * is side talk. Only the bare stop word still acts at tier 3 (level A); inside the window a request-shaped line still acts at tier 2.
 * JARVIS_GATE_COMMAND_TIER=1 (in the browser NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1), or the gate's own input `commandTier`, brings
 * v4's tier 3 back.
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
/** six words and no request word: tier 2's shape test passes it by, and v4's command tier took it ("rules"), engaged or not */
const SHAPELESS = SURE[2];
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
  it("each request-shaped look-alike still acts when engaged (tier 2), and every one acts with the name", () => {
    for (const t of [...SURE, ...IMPERATIVE]) {
      expect(gate(`Jarvis, ${t}`), t).toMatchObject({ tier: 1, act: true, maxLevel: "C" });
      if (t === SHAPELESS) continue;
      expect(gate(t, { lastTurnAt: NOW - 5000 }), t).toMatchObject({ tier: 2, act: true, maxLevel: "C", why: "engaged" });
    }
  });
});

/**
 * Review gate-captions-wake-1: C1 cuts both command returns everywhere, inside the 20 s window too (the brief's item text); only the
 * command tier (JARVIS_GATE_COMMAND_TIER=1, NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1, or `commandTier: true`) brings them back. Inside the
 * window a line that tier 2's shape test passes by was the "rules" return's only way in (an imperative is request-shaped, so tier 2
 * takes it or the side and chore tests refuse it first): such a line is now refused unless it is named or asked as a request.
 */
describe("C1 inside the window: the command tier is cut there too", () => {
  const near = { lastTurnAt: NOW - 5000 };
  it("a sure line with a district noun and no request shape, said 5 s after Jarvis's turn, is refused by default", () => {
    const t = SHAPELESS;
    expect(rules(t)).toEqual({ rulesSure: true, districtNoun: true });
    const g = gate(t, near);
    expect(g).toMatchObject({ tier: 0, act: false, maxLevel: null, why: "unaddressed" });
    expect(levelAllowed(g, "A")).toBe(false);
    // the input field set to false, and the env set to anything but "1", leave it cut
    expect(gate(t, { ...near, commandTier: false })).toMatchObject({ tier: 0, act: false });
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "0");
    expect(gate(t, near)).toMatchObject({ tier: 0, act: false });
  });
  it("named, or asked as a request, the same words act inside the window", () => {
    expect(gate(`Jarvis, ${SHAPELESS}`, near)).toMatchObject({ tier: 1, act: true, maxLevel: "C" });
    expect(gate(`show ${SHAPELESS}`, near)).toMatchObject({ tier: 2, act: true, maxLevel: "C", why: "engaged" });
    expect(gate(`${SHAPELESS}?`, near)).toMatchObject({ tier: 2, act: true });
  });
  it("the command tier brings v4's in-window reading back (level A only): the field, and either env flag", () => {
    const v4 = { tier: 3, act: true, maxLevel: "A", why: "rules" };
    expect(gate(SHAPELESS, { ...near, commandTier: true })).toMatchObject(v4);
    expect(levelAllowed(gate(SHAPELESS, { ...near, commandTier: true }), "B")).toBe(false);
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "1");
    expect(gate(SHAPELESS, near)).toMatchObject(v4);
    vi.stubEnv("JARVIS_GATE_COMMAND_TIER", "");
    vi.stubEnv("NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER", "1");
    expect(gate(SHAPELESS, near)).toMatchObject(v4);
    // and the field still overrides the env
    expect(gate(SHAPELESS, { ...near, commandTier: false })).toMatchObject({ tier: 0, act: false });
  });
  it("rule 4: the Tanglish \"kaattunga\" (show, please) is a request's shape, so the cut never refuses it in the window where English \"show\" acts", () => {
    // v4's list had kaattu, kaatunga and kattunga but not this spelling: the line reached the console only by the command tier
    const t = "Ambattur la garbage complaints kaattunga";
    expect(isImperative(t)).toBe(true);
    expect(gate(t, near)).toMatchObject({ tier: 2, act: true, why: "engaged" });
    // unengaged and unnamed it stays refused (C1), as its English twin does
    expect(gate(t)).toMatchObject({ tier: 0, act: false });
    expect(gate("show garbage complaints in Ambattur")).toMatchObject({ tier: 0, act: false });
  });
  it("the stop word still acts inside the window and out of it, whatever the switch", () => {
    for (const commandTier of [undefined, false, true]) {
      for (const lastTurnAt of [null, NOW - 5000]) expect(gate("stop", { lastTurnAt, commandTier })).toMatchObject({ tier: 3, act: true, maxLevel: "A", why: "stop" });
    }
  });
  it("outside the window it stays refused, as before", () => {
    expect(gate(SHAPELESS, { lastTurnAt: NOW - ENGAGED_MS - 1 })).toMatchObject({ tier: 0, act: false });
  });
});
