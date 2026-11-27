/**
 * 27 Nov, the topic guard (lib/topicguard) in Jarvis's other lanes: the older /agent route (agentServer.ts), the v1 /plan brain
 * (brain.ts, plan.ts), the decision record (decisions.ts), and the words the fallback models read (router.ts, v16/reader.ts). Every model
 * call is a stand-in: no provider is reached.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as { name: string; system: string }[], answer: null as unknown }));
vi.mock("@/lib/ai/gateway", async (orig) => ({
  ...(await orig<object>()),
  generateJson: vi.fn(async (c: { name: string; system: string }) => {
    h.calls.push({ name: c.name, system: c.system });
    if (h.answer == null) throw new Error("no model in this test");
    return { object: h.answer, info: { step: c.name, provider: "groq", model: "test-model", ms: 1, inputTokens: 1, outputTokens: 1, attempts: 1 } };
  })
}));

import { WORLD, START } from "./fixture";
import { fakeHands } from "./stagefake";
import { handleAgent } from "./agentServer";
import { declinedPlan, offTopicVerdict, think } from "./brain";
import { systemPrompt } from "./plan";
import { daySummary, decisionEvent, DecisionBody, logDecision, readToday } from "./decisions";
import { GENERAL_SYSTEM, GeneralSchema, ROUTER_SYSTEM } from "./router";
import { readerSystem } from "./v16/reader";
import { allowedSet, gateChunk } from "./numbergate";

const SORRY_EN = /^Sorry, that is outside what I cover\./;
const SORRY_TA = /^மன்னிக்கவும், அது என் பணிக்கு வெளியே உள்ளது\./;
const state = { ...START, now: Date.now() } as never;

beforeEach(() => { h.calls.length = 0; h.answer = null; });

describe("the older /agent route", () => {
  it("declines a question outside District IQ in the fixed sentence, as a chat, with no model", async () => {
    for (const text of ["When was Dhoni's retirement?", "Virat Kohli innings", "explain deep learning", "tell me a joke"]) {
      const r = await handleAgent({ text, state: { ...START } } as never, WORLD, fakeHands(), "t");
      expect(r, text).toMatchObject({ kind: "chat", lang: "en", note: "offtopic" });
      expect(r.reply, text).toMatch(SORRY_EN);
    }
    const ta = await handleAgent({ text: "தோனி எப்போது ஓய்வு பெற்றார்?", state: { ...START } } as never, WORLD, fakeHands(), "t");
    expect(ta).toMatchObject({ kind: "chat", lang: "ta", note: "offtopic" });
    expect(ta.reply).toMatch(SORRY_TA);
    expect(h.calls).toEqual([]);
  });
  it("the model's off-topic verdict, however it is written, is the fixed decline, never its word", async () => {
    for (const reply of ["OFFTOPIC", "Off-topic.", "off topic"]) {
      h.answer = { kind: "chat", lang: "en", reply, steps: [], options: [] };
      const r = await handleAgent({ text: "who painted the Mona Lisa", state: { ...START } } as never, WORLD, fakeHands(), "t");
      expect(r, reply).toMatchObject({ kind: "chat", note: "offtopic" });
      expect(r.reply, reply).toMatch(SORRY_EN);
    }
  });
  it("keeps a district question that names a match, and the civic terms the old word list declined", async () => {
    h.answer = { kind: "chat", lang: "en", reply: "Looking at it.", steps: [], options: [] };
    for (const text of ["traffic near Chepauk stadium for the IPL match", "what is a cusec", "how do I export this table"]) {
      const r = await handleAgent({ text, state: { ...START } } as never, WORLD, fakeHands(), "t");
      expect(r.note, text).not.toBe("offtopic");
    }
  });
});

describe("the v1 /plan brain", () => {
  it("declines in code before any model, in the language asked (Tamil script for Tanglish)", async () => {
    const r = await think("When was Dhoni's retirement?", state, WORLD, {}, "u");
    expect(r).toMatchObject({ model: null, plan: { kind: "chat", lang: "en" } });
    expect((r.plan as { reply: string }).reply).toMatch(SORRY_EN);
    const t = await think("dhoni eppo retire aanaru", state, WORLD, {}, "u");
    expect((t.plan as { reply: string; lang: string })).toMatchObject({ kind: "chat", lang: "ta" });
    expect((t.plan as { reply: string }).reply).toMatch(SORRY_TA);
    expect(h.calls).toEqual([]);
  });
  it("the model's OFFTOPIC verdict is the fixed decline, never its word; the prompt carries the scope rule", async () => {
    h.answer = { kind: "chat", lang: "en", reply: "OFFTOPIC", steps: [], options: [] };
    const r = await think("who painted the Mona Lisa", state, WORLD, {}, "u");
    expect(h.calls.map((c) => c.name)).toEqual(["thunai_plan"]);
    expect(r.model).toBe("test-model");
    expect((r.plan as { reply: string }).reply).toMatch(SORRY_EN);
    expect(systemPrompt(WORLD)).toMatch(/7b\. Answer only about Chennai district's records/);
    expect(systemPrompt(WORLD)).toMatch(/reply exactly "OFFTOPIC"/);
    // a district question with a match in it goes to the model as before
    h.answer = { kind: "do", lang: "en", reply: null, steps: [{ action: "page", page: "overview" }], options: [] };
    await think("traffic near Chepauk stadium for the IPL match", state, WORLD, {}, "u");
    expect(h.calls.length).toBe(2);
  });
  it("a follow-up let past the code check for the thread: the model's chat on off-topic words is never said", async () => {
    // (as round.ts does with the planner's chat: "and tell me a joke" leans on the thread, so the model reads it; its joke is not said)
    h.answer = { kind: "chat", lang: "en", reply: "Why did the drain cross the road?", steps: [], options: [] };
    const turns = [{ heard: "severe cases in Adyar", did: "showed them" }];
    const r = await think("and tell me a joke", state, WORLD, { turns } as never, "u");
    expect(h.calls.map((c) => c.name)).toEqual(["thunai_plan"]);
    expect((r.plan as { reply: string }).reply).toMatch(SORRY_EN);
    const a = await handleAgent({ text: "and tell me a joke", turns, state: { ...START } } as never, WORLD, fakeHands(), "t");
    expect(a).toMatchObject({ kind: "chat", note: "offtopic" });
    expect(a.reply).toMatch(SORRY_EN);
    // small talk is still said as the model wrote it
    h.answer = { kind: "chat", lang: "en", reply: "Good morning, Collector.", steps: [], options: [] };
    expect(((await think("good morning", state, WORLD, { turns } as never, "u")).plan as { reply: string }).reply).toBe("Good morning, Collector.");
  });
  it("reads the verdict loosely, and nothing else as one", () => {
    expect(offTopicVerdict({ kind: "chat", reply: "off-topic." })).toBe(true);
    expect(offTopicVerdict({ kind: "chat", reply: "Good morning." })).toBe(false);
    expect(offTopicVerdict({ kind: "refuse", reply: "OFFTOPIC" })).toBe(false);
    expect(declinedPlan("tell me a joke", "writing")).toMatchObject({ kind: "chat", lang: "en" });
  });
});

describe("the decision record", () => {
  let d = "";
  beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), "tg-dec-")); vi.stubEnv("THUNAI_DIR", d); });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(d, { recursive: true, force: true }); });
  it("names a declined question as declined (off-topic), and counts it apart from the answers", () => {
    expect(DecisionBody.safeParse({ kind: "answer", query: "q", lane: "declined" }).success).toBe(true);
    expect(decisionEvent({ kind: "answer", query: "When was Dhoni's retirement?", lane: "declined", model: "rules", ms: 3 }, "c@x").outcome).toBe("declined (off-topic)");
    expect(decisionEvent({ kind: "answer", query: "q", lane: "rules" }, "c@x").outcome).toBe("answered (rules)");
    const now = new Date(Date.UTC(2026, 10, 27, 6, 30));
    logDecision("c@x", { kind: "answer", query: "severe cases", lane: "rules", tools: ["incidents"], ms: 800 }, now);
    logDecision("c@x", { kind: "answer", query: "dhoni", lane: "declined", model: "rules", ms: 2 }, now);
    logDecision("c@x", { kind: "answer", query: "kohli", lane: "declined", model: "claude-haiku-5-5", ms: 900 }, now);
    const { records, intact } = readToday(now.getTime());
    const s = daySummary(records, intact);
    expect(s.en).toMatch(/^Today I answered 1 question: 1 from the rules and 0 with the planner\./);
    expect(s.en).toMatch(/I declined 2 questions outside what I cover\./);
    expect(s.ta).toMatch(/2 கேள்விகளுக்கு பதில் சொல்லல/);
    const allowed = allowedSet(Object.values(s.values));
    expect(gateChunk(s.en, allowed).ok).toBe(true);
    expect(gateChunk(s.ta, allowed).ok).toBe(true);
    expect(daySummary(records.filter((r) => r.lane === "declined"), true).en).toMatch(/haven't answered anything today yet.*I declined 2 questions/);
  });
});

describe("the words the fallback models read", () => {
  it("the general lane asks for a verdict first, under the scope rule", () => {
    expect(Object.keys(GeneralSchema.shape)).toEqual(["scope", "reply"]);
    expect(GeneralSchema.safeParse({ scope: "offtopic", reply: "" }).success).toBe(true);
    expect(GeneralSchema.safeParse({ reply: "x" }).success).toBe(false);
    expect(GENERAL_SYSTEM).toMatch(/Answer only about Chennai district's records/);
    expect(GENERAL_SYSTEM).toMatch(/scope offtopic: anything else/);
    expect(ROUTER_SYSTEM).toMatch(/traffic around Chepauk for an IPL match\) is district/);
  });
  it("the reader never takes a joke or a fact for small talk, and keeps the event inside a district question", () => {
    const s = readerSystem(WORLD);
    expect(s).toMatch(/never a joke, a story, a song or a fact: those are general/);
    expect(s).toMatch(/traffic around Chepauk for an IPL match\) is that district ask, never general/);
  });
});
