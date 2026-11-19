/**
 * Review (Phase 7, Planner 2): the plan cache was keyed by the sentence, its language, the bundle and the data version only, so one
 * Collector's plan (made with their own notes and habits, and the register of their screen and turns, in the prompt) was handed to
 * another Collector, or to the same one with other notes or another register. It is now keyed by the user and a hash of those lines.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: "turn1", round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });

function model() {
  const asked: string[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push(c.prompt);
    return { object: { kind: "do", lang: "en", reply: null, options: [], steps: [{ action: "panel", panel: "markets" }] } as U,
      info: { step: c.name, provider: "groq", model: "m", ms: 3, inputTokens: 100, outputTokens: 20, attempts: 1 } };
  };
  return { asked, deps: { llm: { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false }, dataVersion: async () => "v1" } };
}
const SAID = "Show the markets panel";
const NOTE = { notes: ["Adyar comes first in my reviews"], habits: {} };
const NONE = { notes: [], habits: {} };

describe("the plan cache is per user, per memory and per register", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-plancache-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it("two users, one with a note, the same sentence: no plan crosses from one to the other", async () => {
    const m = model();
    await planRound(body(SAID, { turnId: "a1" }), WORLD, fakeHands(), "alice", NOTE, undefined, m.deps);
    expect(m.asked.length).toBe(1);
    expect(m.asked[0]).toMatch(/Adyar comes first/);
    await planRound(body(SAID, { turnId: "b1" }), WORLD, fakeHands(), "bob", NONE, undefined, m.deps);
    // bob's own planner call, without alice's note
    expect(m.asked.length).toBe(2);
    expect(m.asked[1]).not.toMatch(/Adyar comes first/);
    // each one's repeat is still answered from the cache
    await planRound(body(SAID, { turnId: "a2" }), WORLD, fakeHands(), "alice", NOTE, undefined, m.deps);
    await planRound(body(SAID, { turnId: "b2" }), WORLD, fakeHands(), "bob", NONE, undefined, m.deps);
    expect(m.asked.length).toBe(2);
  });

  it("the same user with a new note, or the same note under another user, asks again", async () => {
    const m = model();
    await planRound(body(SAID, { turnId: "c1" }), WORLD, fakeHands(), "carol", NONE, undefined, m.deps);
    await planRound(body(SAID, { turnId: "c2" }), WORLD, fakeHands(), "carol", NOTE, undefined, m.deps);
    expect(m.asked.length).toBe(2);
    await planRound(body(SAID, { turnId: "d1" }), WORLD, fakeHands(), "dave", NOTE, undefined, m.deps);
    expect(m.asked.length).toBe(3);
  });

  it("a register line in the prompt (an earlier turn's screen) keys the plan too", async () => {
    const m = model();
    await planRound(body(SAID, { turnId: "e1" }), WORLD, fakeHands(), "erin", NONE, undefined, m.deps);
    const turns = [{ heard: "severe cases in Adyar", did: "showed them", recipe: "cases" as const, slots: { zones: [13], sev: "Severe" }, result: "Showed four severe cases." }];
    await planRound(body(SAID, { turnId: "e2", turns }), WORLD, fakeHands(), "erin", NONE, undefined, m.deps);
    expect(m.asked.length).toBe(2);
    expect(m.asked[1]).toMatch(/Register/);
    // the same register again: the cache answers
    await planRound(body(SAID, { turnId: "e3", turns }), WORLD, fakeHands(), "erin", NONE, undefined, m.deps);
    expect(m.asked.length).toBe(2);
  });
});
