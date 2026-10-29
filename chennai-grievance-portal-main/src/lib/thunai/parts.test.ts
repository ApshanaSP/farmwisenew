import { describe, expect, it } from "vitest";
import { brokenAt, chain, GENESIS, type AuditEvent, type AuditLine } from "./audit";
import { WORLD } from "./fixture";
import { normalise, taMatch } from "./normalise";
import { confirmGate, planRisk, riskOf } from "./risk";
import { numberGuard, say } from "./say";
import { describe as describeStep } from "./understand";
import { band, canSpeak, remember, score, type Signal, type WatchMemory } from "./watch";

describe("normalise", () => {
  it("turns number words into digits in three languages", () => {
    expect(normalise("zone seven").text).toBe("zone 7");
    expect(normalise("ஏழாவது மண்டலம்").text).toBe("7 மண்டலம்");
    expect(normalise("padhinanju zone").text).toBe("15 zone");
    expect(normalise("பதினஞ்சுக்கு").text).toBe("15");
  });
  it("keeps a river name ending in ஆறு (six) as a name", () => expect(normalise("அடையாறு").text).toBe("அடையாறு"));
  it("keeps 'one' as a pronoun except after a counting word", () => {
    expect(normalise("the next one").text).toBe("the next one");
    expect(normalise("confirm one").text).toBe("confirm 1");
  });
  it("drops politeness, keeps plural nouns", () => {
    expect(normalise("please show Adyar sir").text).toBe("show adyar");
    expect(normalise("மாவட்டங்கள் காட்டுங்க").tokens).toEqual(["மாவட்டங்கள்", "காட்டு"]);
  });
  it("matches Tamil names with case endings", () => {
    expect(taMatch("அடையாற்றில்", "அடையாறு")).toBe(true);
    expect(taMatch("அம்பத்தூரைக்", "அம்பத்தூர்")).toBe(true);
    expect(taMatch("மணலியில்", "மணலி")).toBe(true);
    expect(taMatch("வாரத்துக்கு", "வாரம்")).toBe(true);
    expect(taMatch("வாரியம்", "வாரம்")).toBe(false);
  });
});

describe("say: templates and the number guard", () => {
  it("fills a template with computed numbers", () => {
    expect(say("reservoir", "en", { name: "Puzhal", pct: 72, asOf: "28 Oct" })).toBe("Puzhal is 72 percent full, as of 28 Oct.");
    expect(say("zone", "ta", { n: 7, name: "அம்பத்தூர்" })).toBe("மண்டலம் 7, அம்பத்தூர்.");
  });
  it("refuses a number that was not handed to it", () => {
    expect(numberGuard("Puzhal is 92 percent full", { pct: 72 }, "{name} is {pct} percent full")).toBe(false);
    expect(numberGuard("Puzhal is 72 percent full", { pct: 72 }, "{name} is {pct} percent full")).toBe(true);
  });
  it("throws rather than speak an invented number", () => {
    expect(() => say("item", "en", { title: "Flooding at 3 places" })).not.toThrow();
  });
});

describe("risk levels and the confirm gate", () => {
  it("rates actions", () => {
    expect(riskOf({ a: "view", view: { zone: 7 } })).toBe("A");
    expect(riskOf({ a: "workspace", op: "save", name: "x" })).toBe("B");
    expect(riskOf({ a: "workspace", op: "open", name: "x" })).toBe("A");
    expect(riskOf({ a: "send" })).toBe("C");
    expect(planRisk([{ a: "page", page: "trends" }, { a: "remember", text: "x" }])).toBe("B");
  });
  it("sends only on the matching count, after the drafts were shown for 2 s", () => {
    expect(confirmGate(null, 3, 0, 10_000)).toEqual({ ok: false, why: "count" });
    expect(confirmGate(2, 3, 0, 10_000)).toEqual({ ok: false, why: "mismatch" });
    expect(confirmGate(3, 3, 9_000, 10_000)).toEqual({ ok: false, why: "early" });
    expect(confirmGate(3, 0, 0, 10_000)).toEqual({ ok: false, why: "nothing" });
    expect(confirmGate(3, 3, 0, 10_000)).toEqual({ ok: true, why: null });
  });
});

describe("audit trail", () => {
  const ev = (i: number): AuditEvent => ({ id: `e${i}`, at: `2026-10-29T0${i}:00:00Z`, actor: "collector", heard: "zone 7", plan: [{ a: "view" }], risk: "A", approval: null, outcome: "done" });
  it("chains each line to the one before", () => {
    const lines: AuditLine[] = [];
    let prev = GENESIS;
    for (let i = 0; i < 4; i++) { const l = chain(ev(i), prev); lines.push(l); prev = l.hash; }
    expect(brokenAt(lines)).toBe(-1);
    const edited = lines.map((l, i) => (i === 2 ? { ...l, outcome: "changed" } : l));
    expect(brokenAt(edited)).toBe(2);
    expect(brokenAt([lines[0], lines[2], lines[3]])).toBe(1);
  });
});

describe("watch: speaking first, rarely", () => {
  const sig = (over: Partial<Signal> = {}): Signal => ({ key: "k", kind: "severe", lifeSafety: false, impact: 1, urgency: 1, confidence: 0.9, novelty: 1,
    actionability: 0.8, level: 1, text: { en: "x", ta: "x" }, ...over });
  const empty: WatchMemory = { spoken: [], last: {} };
  const noon = new Date(2026, 9, 29, 12, 0).getTime();
  it("bands by score", () => {
    expect(score(sig())).toBeCloseTo(0.72);
    expect(band(sig())).toBe("speak");
    expect(band(sig({ urgency: 0.4 }))).toBe("chip");
    expect(band(sig({ urgency: 0.2 }))).toBe("digest");
    expect(band(sig({ lifeSafety: true, confidence: 1, actionability: 1 }))).toBe("interrupt");
  });
  it("keeps a budget and a cooldown", () => {
    const ctx = { quiet: false, lastUserSpeech: null };
    expect(canSpeak(sig(), empty, noon, ctx)).toBe(true);
    const m1 = remember(sig(), empty, noon);
    expect(canSpeak(sig({ key: "other" }), m1, noon + 10 * 60_000, ctx)).toBe(false);
    expect(canSpeak(sig(), m1, noon + 30 * 60_000, ctx)).toBe(false);
    expect(canSpeak(sig({ level: 2 }), m1, noon + 30 * 60_000, ctx)).toBe(true);
    expect(canSpeak(sig(), empty, noon, { quiet: true, lastUserSpeech: null })).toBe(false);
    expect(canSpeak(sig(), empty, noon, { quiet: false, lastUserSpeech: noon - 10_000 })).toBe(false);
    expect(canSpeak(sig(), empty, new Date(2026, 9, 29, 23, 0).getTime(), ctx)).toBe(false);
  });
});

describe("step descriptions", () => {
  it("names a view in English and Tamil", () => {
    expect(describeStep({ a: "view", view: { zone: 7, sev: "Severe" } }, WORLD)).toBe("Zone 7 · Ambattur · Severe");
    expect(describeStep({ a: "period", period: "weekly" }, WORLD, "ta")).toBe("கடந்த 7 நாட்கள்");
  });
});
