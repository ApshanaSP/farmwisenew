/**
 * v5 G3, memory write rules (docs/jarvis/JARVIS_V5_BUILD_2.md, Phase 6). Invented sentences only: no citizen's text.
 *   (a) In a turn whose Stage showed news or complaint text, a note is kept only when the Collector says it in his own words: it comes
 *       from his spoken sentence and is not a span read off the screen (a headline, a complaint's title). Checked where every note is
 *       written (store.ts changeMemory, given the texts the Stage showed) and on the planner's own remember step (agent.ts finish).
 *   (c) Each note stores source "collector-spoken", the time and the turn id; a note without that source never reaches a prompt
 *       (plan.ts memoryLines, and store.ts readMemory, the prompt-building read). Old notes on disk without it stay on disk and listed.
 *   Rule (b) (a habit only after the same correction twice) is not built in v5.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteRefusedError, changeMemory, readMemory, readMemoryStrict, rememberList } from "./store";
import { memoryLines, ownWords } from "./plan";
import { finish, type AgentPlan } from "./agent";
import { START, WORLD } from "./fixture";
import { fakeHands } from "./stagefake";
import type { StageContext } from "./stage";

let d = "";
beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), "memw5-")); vi.stubEnv("THUNAI_DIR", d); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(d, { recursive: true, force: true }); });

const NOW = new Date("2026-11-15T09:30:00.000Z");
const file = () => path.join(d, "memory-7.json");
const refused = (fn: () => unknown): string => {
  try { fn(); } catch (e) { if (e instanceof NoteRefusedError) return e.why; throw e; }
  return "kept";
};

// what the Stage showed this turn: two invented headlines and two invented complaint titles
const SHOWN = [
  "Drain work stalled on Kodambakkam high road",
  "Metro rail closes two lanes near Guindy",
  "Garbage not cleared near Perambur market",
  "Street light out"
];

describe("G3 (c) every note stores who said it, when and in which turn", () => {
  it("a remember write stores source collector-spoken, the time and the turn id", () => {
    changeMemory(7, { op: "remember", text: "Adyar drains come first this week", said: "Jarvis, remember that Adyar drains come first this week", yes: true, turn: "t-abc123" } as never, NOW);
    const [n] = readMemoryStrict(7).notes as unknown as Record<string, unknown>[];
    expect(n).toMatchObject({ text: "Adyar drains come first this week", source: "collector-spoken", at: NOW.toISOString(), turn: "t-abc123" });
  });
  it("the older note op stores the same, and a write with no turn id stores null for it, never a made-up one", () => {
    changeMemory(7, { op: "note", text: "Brief me on Tondiarpet first" } as never, NOW);
    const [n] = readMemoryStrict(7).notes as unknown as Record<string, unknown>[];
    expect(n).toMatchObject({ source: "collector-spoken", at: NOW.toISOString(), turn: null });
  });
  it("memoryLines drops a note entry without the source; a sourced entry reaches the prompt", () => {
    const lines = memoryLines([
      { text: "Adyar drains come first", source: "collector-spoken", at: NOW.toISOString(), turn: "t-1" },
      { text: "an old unchecked note", at: "2026-10-01T00:00:00.000Z" },
      { text: "a note from somewhere else", source: "screen", at: NOW.toISOString(), turn: "t-2" }
    ] as never, {}).join("\n");
    expect(lines).toMatch(/Adyar drains come first/);
    expect(lines).not.toMatch(/old unchecked|somewhere else|object Object/);
    expect(memoryLines([{ text: "an old unchecked note", at: "2026-10-01T00:00:00.000Z" }] as never, {})).toEqual([]);
  });
  it("old notes on disk without a source: kept on disk and listed, never in the prompt read, and the next write keeps them", () => {
    const old = { id: "old1", text: "an old note from before v5", at: "2026-10-01T00:00:00.000Z" };
    fs.writeFileSync(file(), JSON.stringify({ notes: [old], habits: {}, pending: {}, prefs: {}, reminders: [], recent: [], pins: [] }));
    // the prompt-building read (what the plan, agent and round routes map to text for the planner) leaves it out
    expect(readMemory(7).notes).toEqual([]);
    // the Collector still sees it ("what do you remember", the memory panel) and can forget it
    expect(readMemoryStrict(7).notes.map((n) => n.text)).toEqual([old.text]);
    expect(rememberList(readMemoryStrict(7)).items.map((i) => i.text)).toEqual([old.text]);
    changeMemory(7, { op: "remember", text: "Velachery pumps need a check", said: "remember Velachery pumps need a check", yes: true, turn: "t-2" } as never, NOW);
    expect(readMemoryStrict(7).notes.map((n) => n.text)).toEqual([old.text, "Velachery pumps need a check"]);
    expect(readMemory(7).notes.map((n) => n.text)).toEqual(["Velachery pumps need a check"]);
    changeMemory(7, { op: "forget", id: "old1" });
    expect(readMemoryStrict(7).notes.map((n) => n.text)).toEqual(["Velachery pumps need a check"]);
  });
  it("a note list holding something that is not a note does not crash the prompt read or the list", () => {
    fs.writeFileSync(file(), JSON.stringify({ notes: [null, 5, "text", { id: "x" }, { id: "y", text: 7, source: "collector-spoken" },
      { id: "z", text: "a kept note", at: "2026-11-15T09:00:00.000Z", source: "collector-spoken", turn: "t-9" }] }));
    expect(readMemory(7).notes.map((n) => n.text)).toEqual(["a kept note"]);
    expect(() => rememberList(readMemoryStrict(7))).not.toThrow();
    expect(rememberList(readMemoryStrict(7)).items.filter((i) => i.kind === "note").map((i) => i.text)).toEqual(["a kept note"]);
  });
});

describe("G3 (a) with news or complaint text on the Stage, only the Collector's own words are kept", () => {
  it("ownWords: from the spoken sentence and not a run read off the screen", () => {
    // read off the screen: four words in a row from a headline, though he did say them
    expect(ownWords("drain work stalled on Kodambakkam high road", "Jarvis remember drain work stalled on Kodambakkam high road", SHOWN)).toBe(false);
    // a short title read out whole
    expect(ownWords("street light out", "remember street light out", SHOWN)).toBe(false);
    // his own words about the same place
    expect(ownWords("Kodambakkam needs a site visit before Friday", "remember that Kodambakkam needs a site visit before Friday", SHOWN)).toBe(true);
    // not from what he said at all (a model's or the screen's wording)
    expect(ownWords("Kodambakkam needs a site visit before Friday", "remember this for me", SHOWN)).toBe(false);
    // nothing shown: only the spoken-sentence part applies
    expect(ownWords("garbage not cleared near Perambur market", "remember garbage not cleared near Perambur market", [])).toBe(true);
    // place names alone never make a run
    expect(ownWords("Guindy Kodambakkam Perambur Adyar first", "remember Guindy Kodambakkam Perambur Adyar first", ["Guindy Kodambakkam Perambur Adyar"], ["Guindy", "Kodambakkam", "Perambur", "Adyar"])).toBe(true);
  });
  it("the store refuses a note read off the screen in such a turn, and writes nothing", () => {
    const why = refused(() => changeMemory(7, { op: "remember", text: "garbage not cleared near Perambur market", said: "Jarvis remember garbage not cleared near Perambur market", shown: SHOWN, yes: true, turn: "t-3" } as never, NOW));
    expect(why).toBe("copied");
    expect(fs.existsSync(file())).toBe(false);
  });
  it("the refusal asks for his own words, in both languages, with no figure", () => {
    try {
      changeMemory(7, { op: "remember", text: "street light out", said: "remember street light out", shown: SHOWN, yes: true } as never, NOW);
      throw new Error("kept");
    } catch (e) {
      expect(e).toBeInstanceOf(NoteRefusedError);
      const r = (e as NoteRefusedError).reply;
      expect(r.en).toMatch(/own words/i);
      expect(r.ta).toMatch(/[஀-௿]/);
      expect(`${r.en} ${r.ta}`).not.toMatch(/\d/);
    }
  });
  it("in such a turn a note with no spoken sentence to check is refused", () => {
    expect(refused(() => changeMemory(7, { op: "remember", text: "Perambur needs a sanitation check", shown: SHOWN, yes: true } as never, NOW))).toBe("not-said");
    expect(fs.existsSync(file())).toBe(false);
  });
  it("the same turn, his own words, is kept with its source", () => {
    changeMemory(7, { op: "remember", text: "Perambur needs a sanitation check on Monday", said: "remember that Perambur needs a sanitation check on Monday", shown: SHOWN, yes: true, turn: "t-4" } as never, NOW);
    expect(readMemory(7).notes.map((n) => n.text)).toEqual(["Perambur needs a sanitation check on Monday"]);
  });
  it("Tamil: a complaint title read out is refused, his own Tamil sentence is kept", () => {
    const shownTa = ["பெரம்பூர் சந்தை அருகே குப்பை அகற்றப்படவில்லை"];
    expect(refused(() => changeMemory(7, { op: "remember", text: "பெரம்பூர் சந்தை அருகே குப்பை அகற்றப்படவில்லை", said: "ஜார்விஸ் நினைவில் வை பெரம்பூர் சந்தை அருகே குப்பை அகற்றப்படவில்லை", shown: shownTa, yes: true } as never, NOW))).toBe("copied");
    changeMemory(7, { op: "remember", text: "பெரம்பூர் சுத்தத்தை திங்கள் பார்க்கணும்", said: "நினைவில் வை பெரம்பூர் சுத்தத்தை திங்கள் பார்க்கணும்", shown: shownTa, yes: true } as never, NOW);
    expect(readMemory(7).notes.map((n) => n.text)).toEqual(["பெரம்பூர் சுத்தத்தை திங்கள் பார்க்கணும்"]);
  });
  it("no news or complaint text on the Stage: the note is kept as in v4", () => {
    changeMemory(7, { op: "remember", text: "garbage not cleared near Perambur market", said: "remember garbage not cleared near Perambur market", shown: [], yes: true } as never, NOW);
    expect(readMemory(7).notes.map((n) => n.text)).toEqual(["garbage not cleared near Perambur market"]);
  });
});

describe("G3 (a) on the planner's own remember step (agent.ts finish)", () => {
  const step = (text: string) => ({ action: "remember", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null, mapMode: null,
    layer: null, on: null, item: null, which: null, option: null, n: null, text, when: null });
  const plan = (text: string) => ({ kind: "do", lang: "en", reply: null, say: null, screen: null, stage: null, calls: [], options: [], done: true, steps: [step(text)] }) as unknown as AgentPlan;
  const run = { t0: Date.now(), rounds: 1, model: "mock", results: [], clock: Date.now, until: Date.now() + 5000 };
  const newsStage: StageContext = { recipe: "news", title: "Latest news", focus: null, slots: {}, blocks: [{ kind: "NewsReader", ids: ["n1", "n2"] }] };
  const newsDigest = JSON.stringify({ recipe: "news", title: "Latest news", slots: {}, filter: null, views: {}, focus: null,
    items: "news: 1=Drain work stalled on Kodambakkam road; 2=Metro rail closes two lanes near Guindy" });
  const caseStage: StageContext = { recipe: "cases", title: "Open cases", focus: null, slots: {}, blocks: [{ kind: "CaseList", ids: ["INC-1"], labels: ["Sewage overflow outside Saidapet school gate"] }] };
  const rankStage: StageContext = { recipe: "ranking", title: "Zones by attention", focus: null, slots: {}, blocks: [{ kind: "Ranking", ids: ["Adyar", "Teynampet"] }] };
  const kept = async (said: string, text: string, stage: StageContext | null, screen: string[] = []) => {
    const input = { text: said, state: { ...START, now: Date.now() }, ctx: { turns: [], notes: [], habits: {}, now: Date.now() }, stage, screen };
    const r = await finish(plan(text), input, { world: WORLD, hands: fakeHands(), llm: async () => { throw new Error("no model in this test"); } }, run);
    return (r.steps ?? []).filter((s) => s.a === "remember").map((s) => (s as { text: string }).text);
  };

  it("a headline on the Stage, read out as the note: the remember step is dropped", async () => {
    expect(await kept("can you remember drain work stalled on Kodambakkam road", "drain work stalled on Kodambakkam road", newsStage, [newsDigest])).toEqual([]);
  });
  it("a complaint title on the Stage (its label), read out as the note: dropped", async () => {
    expect(await kept("can you remember sewage overflow outside Saidapet school gate", "sewage overflow outside Saidapet school gate", caseStage)).toEqual([]);
  });
  it("news on the Stage, a note in the Collector's own words: kept", async () => {
    expect(await kept("can you remember that Kodambakkam needs a site visit before Friday", "Kodambakkam needs a site visit before Friday", newsStage, [newsDigest]))
      .toEqual(["Kodambakkam needs a site visit before Friday"]);
  });
  it("news on the Stage, a note the model wrote that is not in the sentence: dropped", async () => {
    expect(await kept("can you remember this for me", "Kodambakkam needs a site visit before Friday", newsStage, [newsDigest])).toEqual([]);
  });
  it("no news or complaint text on the Stage: the step is kept as in v4", async () => {
    expect(await kept("can you remember drain work stalled on Kodambakkam road", "drain work stalled on Kodambakkam road", rankStage)).toEqual(["drain work stalled on Kodambakkam road"]);
    expect(await kept("can you remember drain work stalled on Kodambakkam road", "drain work stalled on Kodambakkam road", null)).toEqual(["drain work stalled on Kodambakkam road"]);
  });
});
