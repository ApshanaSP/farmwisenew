/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.2, "Cross-lingual meaning"): a Tamil request about an English headline in words no gloss covers (RESULTS v9,
 * "Where v9 still misses" 5) is found by meaning, a second ranker under the lexical guards. Calibrated on v8's dev set and the build's own cases
 * on the real store (19 Nov): right stories scored 0.80-0.86 and absent topics up to 0.83, so the meaning pick is taken only when the matcher
 * found nothing, at 0.835 or more, 0.03 over the next story, with a word of the request in it (by sound or gloss) unless the request is in
 * Tamil letters, never against a district place the request names, never for a thing named by ear or a soft find. The model is injected here.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { findNews } from "../v8/newsfind";

const world = { ...WORLD, ...referenceWorld() };
const items = [
  { id: "iocl", title: "Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", t: "2026-11-18 02:47" },
  { id: "akv", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai", t: "2026-11-19 11:36" },
  { id: "rail", title: "Special train to Kollam via Salem announced", t: "2026-11-19 10:00" },
  { id: "adyar", title: "Sewage overflow near Adyar bus depot irks commuters", t: "2026-11-19 09:00" }
];
const sem = (scores: Record<string, number>) => async () => new Map(Object.entries(scores));
const find = (q: string, scores: Record<string, number>, extra: Record<string, unknown> = {}) =>
  findNews({ q, lang: /[஀-௿]/u.test(q) ? "ta" : "en", ...extra }, { world, stories: async () => items, sem: sem(scores) } as never);

describe("v10: the meaning of a request, a second ranker under the lexical guards", () => {
  it("a Tamil request the matcher cannot place is found by meaning when clear", async () => {
    const r = await find("ஆலையில் வெடிப்பு ஒரு தொழிலாளி பலி செய்தி", { iocl: 0.854, rail: 0.794, akv: 0.79, adyar: 0.78 });
    expect(r?.picked.pick?.id).toBe("iocl");
  });
  it.each([
    ["too low: an absent topic", { rail: 0.813, akv: 0.806, iocl: 0.8, adyar: 0.79 }],
    ["no margin over the next story", { iocl: 0.84, rail: 0.825, akv: 0.8, adyar: 0.79 }]
  ])("not taken: %s", async (_why, scores) => {
    const r = await find("டெல்லி காற்று மாசு செய்தி", scores);
    expect(r?.picked.pick ?? null).toBeNull();
  });
  it("an English request needs a word of it in the story (no word in common: not taken)", async () => {
    const r = await find("any news about the metro fare hike", { rail: 0.85, iocl: 0.8, akv: 0.79, adyar: 0.78 });
    expect(r?.picked.pick ?? null).toBeNull();
  });
  it("a district place the request names vetoes a story that lacks it", async () => {
    const r = await find("அண்ணா நகர் கழிவுநீர் செய்தி", { adyar: 0.86, iocl: 0.8, rail: 0.79, akv: 0.78 });
    expect(r?.picked.pick ?? null).toBeNull();
  });
  it("never for a thing named by ear (its spellings are the evidence) or a soft find", async () => {
    const r = await find("Tell me about Cyclone Zorbo", { akv: 0.9, rail: 0.8, iocl: 0.79, adyar: 0.78 }, { entity: { name: "Cyclone Zorbo", kind: "storm", spellings: ["Zorbo"] } });
    expect(r?.picked.pick ?? null).toBeNull();
  });
  it("the matcher's own pick stands (the meaning is asked only when it found nothing)", async () => {
    const r = await find("read the Akvan cyclone story", { iocl: 0.9, akv: 0.8, rail: 0.79, adyar: 0.78 });
    expect(r?.picked.pick?.id).toBe("akv");
  });
});
