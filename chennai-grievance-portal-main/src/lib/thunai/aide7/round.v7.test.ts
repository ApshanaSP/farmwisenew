import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "../events";
import { WORLD } from "../fixture";
import { Ledger, MemoryStore } from "../ledger";
import type { Rung } from "../llm";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "../round";
import { fakeHands } from "../stagefake";
import type { OpenRung, RungCall } from "./stream";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: "turn1", round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];

/** a writer that answers from the facts it is given: a sentence on the first fact holding a zone name and a figure, then a plain offer */
const writer = (calls: RungCall[] = []): OpenRung => async (rung, c, onText) => {
  calls.push(c);
  const facts = [...c.prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)];
  const hit = facts.map((m) => ({ id: m[1], zone: m[2].match(/\b(Adyar|Royapuram|Anna Nagar)\b/)?.[1], n: m[2].match(/\b(\d{1,4})\b/)?.[1] })).find((x) => x.zone && x.n);
  const lines = ["GAP: none", ...(hit ? [`S: ${hit.zone} shows ${hit.n} on this count. [${hit.id}]`] : []), "S: Want the details?"];
  for (const l of lines) onText(`${l}\n`);
  return { provider: rung.provider, model: rung.model, tokens: 50, firstMs: 1, ms: 2, stop: null };
};
const deps = (events: TurnEvent[], calls: RungCall[] = []) => ({ llm: { generate: (async () => { throw new Error("no planner in this test"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false },
  emit: (e: TurnEvent) => events.push(e), aide: { open: writer(calls), rungs: () => RUNGS } });

describe("v7: the aide answers a question in the round, a command keeps its line", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-aide-"))); });
  afterEach(() => vi.unstubAllEnvs());

  it("streams the screen first, then only checked sentences, and the final screen says what was said", async () => {
    const events: TurnEvent[] = [];
    const calls: RungCall[] = [];
    const o = await planRound(body("what is happening in Adyar"), WORLD, fakeHands(), "u", undefined, undefined, deps(events, calls));
    const kinds = events.map((e) => e.type);
    const snap = kinds.indexOf("STATE_SNAPSHOT"), text = kinds.indexOf("TEXT_MESSAGE_CONTENT");
    expect(snap).toBeGreaterThan(-1);
    expect(text).toBeGreaterThan(snap);
    const s = events[snap] as Extract<TurnEvent, { type: "STATE_SNAPSHOT" }>;
    expect(s.snapshot.stage.voice?.by).toBe("aide7");
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain("QUESTION: what is happening in Adyar");
    const said = events.filter((e): e is Extract<TurnEvent, { type: "TEXT_MESSAGE_CONTENT" }> => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta);
    expect(said.join(" ")).toBe(o.result?.say);
    expect(said.at(-1)).toBe("Want the details?");
    expect(said.join(" ")).not.toMatch(/\[F\d/);
    expect(o.result?.stage?.voice?.by).toBe("aide7");
    expect(o.result?.stage?.say.en).toBe(o.result?.say);
    expect(kinds.at(-1)).toBe("RUN_FINISHED");
  });
  it("a command builds its screen and says v6's own line: no writer is asked", async () => {
    const events: TurnEvent[] = [];
    const calls: RungCall[] = [];
    const o = await planRound(body("show the severe cases in Royapuram"), WORLD, fakeHands(), "u", undefined, undefined, deps(events, calls));
    expect(calls).toHaveLength(0);
    expect(o.result?.stage?.voice).toBeUndefined();
  });
  it("JARVIS_ANSWER=v6 restores v6's answers", async () => {
    vi.stubEnv("JARVIS_ANSWER", "v6");
    const events: TurnEvent[] = [];
    const calls: RungCall[] = [];
    const o = await planRound(body("what is happening in Adyar"), WORLD, fakeHands(), "u", undefined, undefined, deps(events, calls));
    expect(calls).toHaveLength(0);
    expect(o.result?.stage?.voice).toBeUndefined();
  });
  it("with no model configured at all the aide steps aside (the turn is v6's)", async () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(k, "");
    const o = await planRound(body("what is happening in Adyar"), WORLD, fakeHands(), "u", undefined, undefined, { llm: { generate: (async () => { throw new Error("x"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } });
    expect(o.result?.stage?.voice).toBeUndefined();
  });
});
