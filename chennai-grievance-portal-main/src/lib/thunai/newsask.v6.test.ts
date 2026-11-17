/**
 * v6, Phase 4: when a sentence is the news reader's (newsask.ts) and what its screen holds. The console's own questions stay the
 * console's ("how many complaints online", "rainfall readings", "show the weekly report"); a news list or a case on screen gives the
 * report to read; a forecast or "look it up" goes to the web.
 */
import { describe, expect, it } from "vitest";

import { failLine, newestNewsDoc, newsAsk, newsScreen, readNdjson } from "./newsask";
import { checkStage } from "./stage";

const list = { items: [{ id: "doc-11", source: "The Hindu" }, { id: "doc-12", source: "DT Next" }, { id: "doc-13", source: "The New Indian Express" }] };

describe("a report on screen is read", () => {
  it("English, Tamil and Tanglish asks over a news list read the item meant", () => {
    expect(newsAsk("Read the article", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("What does the report say?", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("Read the second article", list)).toEqual({ kind: "read", body: { id: "doc-12" } });
    expect(newsAsk("read article 3", list)).toEqual({ kind: "read", body: { id: "doc-13" } });
    expect(newsAsk("Read DT Next's report", list)).toEqual({ kind: "read", body: { id: "doc-12" } });
    expect(newsAsk("What are other papers saying?", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("இந்த செய்தியைப் படி", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("பத்திரிகையில் என்ன சொல்கிறார்கள்", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("article padichu sollu", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
    expect(newsAsk("news la enna solraanga", list)).toEqual({ kind: "read", body: { id: "doc-11" } });
  });
  it("the item being read aloud is the one meant when no other is named", () => {
    expect(newsAsk("read the full article", { ...list, reading: "doc-13" })).toEqual({ kind: "read", body: { id: "doc-13" } });
  });
  it("over a case, the incident's own news report", () => {
    expect(newsAsk("Read the news report", { incident: "INC-77" })).toEqual({ kind: "read", body: { incident: "INC-77" } });
    expect(newsAsk("what are other outlets saying about it", { incident: "INC-77" })).toEqual({ kind: "read", body: { incident: "INC-77" } });
  });
  it("Jarvis's own sources list is links, not reports: it is never sent as an id", () => {
    expect(newsAsk("read the article", { items: [{ id: "web-1", source: "The Hindu" }] })).toEqual({ kind: "which" });
  });
  it("nothing on screen: 'which report?' only when the press is meant; 'the weekly report' stays the planner's", () => {
    expect(newsAsk("read the article")).toEqual({ kind: "which" });
    expect(newsAsk("read the weekly report")).toBeNull();
    expect(newsAsk("go through the monthly report")).toBeNull();
  });
  it("the Stage's own reading commands are not taken ('read them', 'read it', 'next')", () => {
    for (const t of ["read them", "read it", "read this", "next", "open 3", "read out"]) expect(newsAsk(t, list), t).toBeNull();
  });
  it("an id that is not a stored id is never sent", () => {
    expect(newsAsk("read the article", { items: [{ id: "../etc/passwd", source: null }] })).toEqual({ kind: "which" });
    expect(newsAsk("read the article", { incident: "1; DROP TABLE x" })).toEqual({ kind: "which" });
  });
});

describe("a public question goes to the web", () => {
  it("a forecast, a warning or the Met department; a plain 'look it up'", () => {
    for (const t of ["What did the Met department say about tonight's rain?", "Will it rain tonight?", "Any red alert for Chennai?", "What's the latest on the cyclone?",
      "look it up", "Search the web for the Adyar river level", "வானிலை ஆய்வு மையம் என்ன சொல்கிறது", "நாளை மழை வருமா", "google pannu"]) {
      expect(newsAsk(t)?.kind, t).toBe("lookup");
    }
    expect(newsAsk("Will it rain tonight?")).toEqual({ kind: "lookup", body: { question: "Will it rain tonight?" } });
  });
  it("the console's own questions stay the console's", () => {
    for (const t of ["How many complaints came online today?", "Show the rainfall readings", "show complaints about the cyclone", "How much rain fell in Adyar?",
      "Show the severe cases", "Which department has the most overdue cases?", "what's happening in Royapuram", "Open the news", "show me the news"]) {
      expect(newsAsk(t), t).toBeNull();
    }
  });
});

describe("the screen", () => {
  it("what was said as a Note and every source as a link; checked against the Stage's schema; no duplicate links", () => {
    const d = newsScreen({ lang: "en", kind: "read", title: "Cyclone Akvan nears the coast", en: ["The Hindu reported this morning: landfall is expected on 20 November."], ta: ["தி இந்து: புயல்"],
      links: [{ outlet: "The Hindu", title: "Cyclone Akvan", url: "https://www.thehindu.com/a", publishedAt: "2026-11-17T03:00:00Z" },
        { outlet: "The Hindu", title: "Cyclone Akvan", url: "https://www.thehindu.com/a", publishedAt: null },
        { outlet: "DT Next", title: "Akvan", url: "https://www.dtnext.in/b", publishedAt: null },
        { outlet: "Bad", title: "x", url: "javascript:alert(1)", publishedAt: null }], now: 1 });
    expect(d).not.toBeNull();
    expect(checkStage(d).ok).toBe(true);
    expect(d!.blocks[0]).toMatchObject({ kind: "Note", text: "The Hindu reported this morning: landfall is expected on 20 November." });
    const nr = d!.blocks.find((b) => b.kind === "NewsReader");
    expect(nr?.kind === "NewsReader" && nr.items.map((x) => x.url)).toEqual(["https://www.thehindu.com/a", "https://www.dtnext.in/b"]);
    expect(nr?.kind === "NewsReader" && nr.items.every((x) => x.incidentId === null && /^web-\d/.test(x.id))).toBe(true);
    expect(d!.notes.join(" ")).toMatch(/From the web/);
    expect(d!.slots).toEqual({ web: true });
  });
  it("a lookup's screen is titled 'From the web', in Tamil too", () => {
    expect(newsScreen({ lang: "en", kind: "lookup", title: null, en: ["From the web: no warning."], ta: ["x"], links: [] })?.title).toBe("From the web");
    expect(newsScreen({ lang: "ta", kind: "lookup", title: null, en: ["x"], ta: ["இணையத்திலிருந்து: எச்சரிக்கை இல்லை."], links: [] })?.title).toBe("இணையத்திலிருந்து");
  });
  it("a failure is said plainly, the no-news case as what it is", () => {
    expect(failLine("no_news", "en")).toMatch(/no news report/);
    expect(failLine("failed", "ta")).toMatch(/இணைய/);
  });
});

describe("the stream", () => {
  it("each line handed over as it comes, a line split across chunks joined, a broken line skipped", async () => {
    const enc = new TextEncoder();
    const parts = ['{"type":"first","en":"Reading"}\n{"type":"br', 'ief","n":1}\nnot json\n', '{"type":"done"}'];
    const body = new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } });
    const got: string[] = [];
    await readNdjson(body, (e) => got.push(String(e.type)));
    expect(got).toEqual(["first", "brief", "done"]);
  });
});

describe("an incident's report", () => {
  it("the newest news report among its reports; complaints alone give none", () => {
    expect(newestNewsDoc([{ source: "news", docId: "d1", t: "2026-11-16 09:00" }, { source: "news", docId: "d2", t: "2026-11-17 08:00" }, { source: "grievance", docId: null, t: "2026-11-17 10:00" }])).toBe("d2");
    expect(newestNewsDoc([{ source: "grievance", docId: null, t: "2026-11-17 10:00" }])).toBeNull();
    expect(newestNewsDoc(null)).toBeNull();
  });
});
