import { afterEach, describe, expect, it } from "vitest";
import { addressed } from "../addressed";
import { newsRequest, pickStory, rankStories, type StoryItem } from "./news8";
import { understandV8 } from "./flag8";
import { callLlm } from "../llm";
import { Ledger, MemoryStore } from "../ledger";
import { z } from "zod";

// The independent wiring, privacy and spend review (18-19 Nov): each finding as a failing test first.
const gate = (text: string, o: { awaiting?: boolean } = {}) => addressed({ text, lastTurnAt: 1_000_000 - 5000, now: 1_000_000, rulesSure: false, districtNoun: false, awaitingAnswer: o.awaiting ?? false });

describe("wiring 1: an answer to Jarvis's own question is never silenced", () => {
  for (const t of ["rendavadhu", "mudhal", "இரண்டாவது", "இரண்டும்", "rendum", "Yes, tell them.", "Ok, call him"]) {
    it(`'${t}' while Jarvis waits for an answer`, () => { const g = gate(t, { awaiting: true }); expect(g.act, g.why).toBe(true); });
  }
  for (const t of ["rendavadhu", "இரண்டாவது"]) it(`'${t}' (an ordinal follow-up) inside the conversation`, () => { const g = gate(t); expect(g.act, g.why).toBe(true); });
});

describe("wiring 2: a request at the schema's limits cannot hold the server", () => {
  it("400 characters of words, 250 long screen titles and 3,000 stored stories rank in under 3 s", () => {
    const words = Array.from({ length: 70 }, (_, i) => `w${(i * 7919) % 997}x`).join(" ");
    const q = `open the ${words}`.slice(0, 390);
    const long = (i: number) => Array.from({ length: 60 }, (_, k) => `t${(i * 31 + k) % 503}y`).join(" ").slice(0, 400);
    const items: StoryItem[] = [...Array.from({ length: 250 }, (_, i) => ({ id: `scr${i}`, title: long(i), onScreen: i + 1 })),
      ...Array.from({ length: 3000 }, (_, i) => ({ id: `st${i}`, title: long(i + 9000), outlets: ["The Hindu"] }))];
    const req = newsRequest(`${q} news`, { onScreen: true })!;
    const t0 = performance.now();
    pickStory(rankStories(req, items, { places: ["Adyar", "Pallikaranai"] }));
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(req.words.length).toBeLessThanOrEqual(12);
  });
});

describe("wiring 3: the server's JARVIS_UNDERSTAND=v7 holds whatever the browser build says", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; delete process.env.NEXT_PUBLIC_JARVIS_UNDERSTAND; });
  it("JARVIS_UNDERSTAND=v7 with a NEXT_PUBLIC_ value of v8 is v7", () => {
    process.env.NEXT_PUBLIC_JARVIS_UNDERSTAND = "v8"; process.env.JARVIS_UNDERSTAND = "v7";
    expect(understandV8()).toBe(false);
  });
});

describe("wiring 4: a deep call cut by its own time limit still counts in Jarvis's day cap", () => {
  it("a Claude rung that fails with no billed usage is recorded at its estimate", async () => {
    const l = new Ledger(new MemoryStore());
    const generate = (async (c: { only?: { provider: string } }) => {
      if (c.only?.provider === "anthropic") { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; }
      return { object: { ok: true }, info: { step: "x", provider: "groq", model: "qwen/qwen3.8-27b", ms: 3, inputTokens: 10, outputTokens: 5, attempts: 1 } };
    }) as never;
    await callLlm({ name: "t", system: "s".repeat(800), prompt: "p", schema: z.object({ ok: z.boolean() }), maxOutputTokens: 50, user: "u", lane: "planner", until: Date.now() + 20_000, deep: true },
      { generate, ledger: l, claudeOk: () => true, bedrockOk: () => false });
    expect(l.spent("anthropic", "claude-sonnet-5-5", 86_400_000).tokens).toBeGreaterThan(0);
  });
});
