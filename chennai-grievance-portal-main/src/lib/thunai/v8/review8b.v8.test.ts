import { afterEach, describe, expect, it } from "vitest";
import { addressed } from "../addressed";
import { newsRequest, pickStory, rankStories, type StoryItem } from "./news8";
import { findNews } from "./newsfind";
import { newsLane8 } from "./browser";
import { WORLD } from "../fixture";
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

describe("the live dev re-check (19 Nov, 00:20): the 40-word cap counted the Tamil headline and the English one together", () => {
  // a stored story's Tamil headline can run long; its English headline must still be matched (d-nt-3, d-na-5, d-na-6, d-fu-10 missed)
  const ta = Array.from({ length: 44 }, (_, i) => `சொல்${"அஆஇஈஉஊ"[i % 6]}${i}`).join(" ");
  const items: StoryItem[] = [
    { id: "a", title: ta, titleEn: "Two arrested for assaulting traffic police constable near R.K. Salai in Chennai", outlets: ["The Hindu"], onScreen: 1 },
    { id: "b", title: "Officials remove Vinayagar temple near Chennai; residents protest", outlets: ["Dinamalar"], onScreen: 2 },
    { id: "c", title: ta + " நீர்", titleEn: "Chennai Metropolitan Area faces 500 MLD water deficit; another desal plant planned at Minjur", outlets: ["DT Next"] },
  ];
  it("'Open the one about the traffic constable.' finds the English headline behind a long Tamil one", () => {
    const req = newsRequest("Open the one about the traffic constable.", { onScreen: true })!;
    expect(pickStory(rankStories(req, items), "en").pick?.id).toBe("a");
  });
  it("'What are the papers saying about the water deficit?' too", () => {
    const req = newsRequest("What are the papers saying about the water deficit?")!;
    expect(pickStory(rankStories(req, items), "en").pick?.id).toBe("c");
  });
});

describe("the live dev re-check (19 Nov, 00:20): a short news question that names its topic, with no word 'news' (the owner's example 2)", () => {
  for (const t of ["Any update on the Supreme Court bench for Chennai?", "What happened at the IOCL plant?", "What are the papers saying about the water deficit?",
    "What is the media saying about the Metro phase two?"]) {
    it(`'${t}' searches the news`, () => expect(newsRequest(t)?.kind).toBe("ask"));
  }
  for (const t of ["Any update from the Collector?", "What happened at the Adyar office?", "Any update on the DRO's inspection?", "What happened to the drain work?",
    "Any word from Ramesh?"]) {
    it(`'${t}' stays the console's`, () => expect(newsRequest(t)).toBeNull());
  }
});

describe("the live dev re-check (19 Nov, 00:20): a panel row whose first stored report is another story (a merged cluster)", () => {
  const temple = { id: "t", title: "சென்னை அருகே விநாயகர் கோவிலை அகற்றிய அதிகாரிகள்; தர்ணாவில் ஈடுபட்ட மக்கள்", titleEn: null, outlets: ["Dinamalar"] };
  const assault = { id: "c", title: "Two arrested for assaulting traffic police constable near R.K. Salai in Chennai", titleEn: "Two arrested for assaulting traffic police constable near R.K. Salai in Chennai", outlets: ["The Hindu"] };
  const world = { zones: [], places: [] } as never;
  it("'the one about the traffic constable' opens the report whose headline the panel shows, not the row's first report", async () => {
    const f = await findNews({ q: "Open the one about the traffic constable.", lang: "en", screen: [{ id: "t", title: assault.title, source: "The Hindu" }] },
      { world, stories: async () => [temple, assault] });
    expect(f?.picked.pick?.id).toBe("c");
  });
  it("a screen story the store does not hold keeps its own id and title", async () => {
    const f = await findNews({ q: "Open the one about the traffic constable.", lang: "en", screen: [{ id: "x9", title: assault.title, source: "The Hindu" }] },
      { world, stories: async () => [temple] });
    expect(f?.picked.pick?.id).toBe("x9");
  });
});

describe("the live dev re-check (19 Nov, 00:20): 'what else is in the news about it?' searches the Collector's own topic again", () => {
  const first = { id: "f1", title: "Pallikaranai marsh construction ban: Madras HC asks litigants to approach Supreme Court for interim relief", titleEn: null, outlets: ["The Hindu"] };
  const second = { id: "f2", title: "Construction Ban In Chennai's Pallikaranai: HC Gives Liberty To Petitioners To Approach SC", titleEn: null, outlets: ["LawChakra"] };
  const noise = { id: "n1", title: "Madras High Court protects personality rights of CSK fan popular for his unique yellow look", titleEn: null, outlets: ["DT Next"] };
  const world8 = { zones: [], places: [] } as never;
  it("after 'open the Pallikaranai marsh story', another outlet's report of it is found", async () => {
    const last = { id: "f1", title: first.title, q: "open the Pallikaranai marsh story", other: null };
    const more = newsLane8("What else is in the news about it?", { news: { items: [] }, world: WORLD, lang: "en", lastFound: last });
    expect(more?.kind).toBe("find");
    if (more?.kind !== "find") return;
    const f = await findNews(more.body.find, { world: world8, stories: async () => [first, second, noise] });
    expect(f?.picked.pick?.id).toBe("f2");
  });
});
