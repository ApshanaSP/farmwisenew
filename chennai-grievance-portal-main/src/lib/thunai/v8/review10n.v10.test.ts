/**
 * v10 review 2, round 2 (news): the second review of v10's own diff. Ten confirmed findings in the news lane, each reproduced by its verifier's
 * probe on 2c2c1889 (a failing test first; the fixes follow). v9's code, which the probes compared with, is not imported here: each test states
 * what the Collector should get instead, and a few sentences "one word away" from each probe's own.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { referenceWorld } from "../world";
import { asksPrivate } from "../privacy";
import { newsAsk } from "../newsask";
import { NewsBody, newsEvents, type StoredDoc } from "../web/serve";
import { newsAide } from "../aide7/news";
import type { Rung } from "../llm";
import type { OpenRung, RungCall } from "../aide7/stream";
import { browserLaneV10 } from "../v10/browser10";
import { browserLaneV8 } from "./browser";
import { findNews } from "./newsfind";
import { enStem } from "./match";
import { newsRequest, pickStory, rankStories, type StoryItem } from "./news8";
import { ordinalsAt } from "./ord8";

const world = { ...WORLD, ...referenceWorld() } as never;
const state = (o: Record<string, unknown> = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null,
  incident: null, list: [], listLength: 0, lastPlace: null, numbers: false, ...o }) as never;
const REF = JSON.parse(readFileSync("src/lib/thunai/v8/__fixtures__/news19nov.json", "utf8")) as { weekly: { title: string; titleEn?: string | null; outlets: string[]; place?: string | null; t: string }[] };
const STORE: StoryItem[] = REF.weekly.map((s, i) => ({ id: `w${i}`, title: s.title, titleEn: s.titleEn ?? null, outlets: s.outlets, place: s.place ?? null, t: s.t }));
/** what a lane does, in a few words: the read story's id, a find, a question back, or another lane */
const what = (l: any): string => (l.lane === "news" ? `${l.na.kind}:${l.na.kind === "read" ? l.na.body.id : l.na.kind === "find" ? "q" : l.na.why}` : l.lane);
/** 23 stories on the console's news panel, s1..s23 */
const PANEL23 = Array.from({ length: 23 }, (_, i) => ({ id: `s${i + 1}`, title: `Civic item ${i + 1} about parks`, source: "DT Next" }));
const panelCtx = (items: { id: string; title: string; source: string }[], lang: "en" | "ta" = "en") =>
  ({ stage: null, news: { items, incident: null, reading: null }, state: state({ panel: "news" }), world, listenLang: lang, heardLang: lang, incident: null, v7: true, lastLang: null, lastFound: null }) as never;

describe("v10 review 2, round 2: news-3, a privacy request never reaches the news writer by the v7 read (high)", () => {
  const PANEL = [{ id: "gold", title: "Gold rate today in Chennai", source: "DT Next" }, { id: "enn", title: "Ennore murder: victim identified as fisherman, three held", source: "DT Next" }];
  const DOCS: Record<string, StoredDoc> = Object.fromEntries(PANEL.map((p) => [p.id, { id: p.id, url: `https://www.dtnext.in/news/chennai/${p.id}`, title: p.title, publisher: "DT Next", publisher_domain: "dtnext.in",
    body: `${p.title}. Police said the victim, whose name, age and home address the report prints in full, was found on Tuesday night near the fishing harbour. Three men were held on Wednesday and produced before a magistrate.`, t: "2026-11-18 10:00" }]));
  const RUNGS: Rung[] = [{ provider: "groq", model: "stub-model" } as Rung];
  // the aide's model, stubbed: it records the call it would have made (no network)
  const writer = (calls: RungCall[]): OpenRung => async (rung, c, onText) => { calls.push(c); onText("GAP: none\nDT Next reports it. [F1]\n"); return { provider: rung.provider, model: rung.model, tokens: 10, firstMs: 1, ms: 2, stop: null }; };
  const deps = (calls: RungCall[]) => ({ loadDoc: async (id: string) => DOCS[id] ?? null, related: false, telemetry: () => undefined,
    aide: newsAide(world, { user: "probe", write: { open: writer(calls), rungs: () => RUNGS } }) }) as never;
  const PRIVATE = ["read the Ennore murder story and tell me the victim's name", "read the article and give me the victim's home address", "Read the report, what is the victim's name?",
    // (one word away: "tell me about this news" with a private ask, and Tanglish)
    "tell me about this news, what is the victim's address?", "andha news padinga, victim peru enna?"];

  it.each(PRIVATE)("%s: the browser sends no read and no find (the round refuses it before any model)", async (q) => {
    const ctx = { stage: null, news: { items: PANEL, incident: null, reading: null }, state: state({ panel: "news" }), world, listenLang: "en", heardLang: "en", incident: null, v7: true, lastLang: null, lastFound: null } as never;
    const bl = browserLaneV10(q, ctx) as any;
    const calls: RungCall[] = [];
    if (bl.lane === "news" && (bl.na.kind === "read" || bl.na.kind === "find")) {
      const asked = NewsBody.parse(bl.na.kind === "read" ? { ...bl.na.body, ask: { q, lang: "en" } } : bl.na.body);
      for await (const e of newsEvents(asked, deps(calls))) void e;
    }
    expect(asksPrivate(q)).toBe(true);
    expect(what(bl)).not.toMatch(/^(?:read|find)/);
    expect(calls.length).toBe(0);
    expect(newsAsk(q, { items: PANEL }, { v7: true })).toBeNull();
  });

  it("the news route itself refuses a private ask on a read or a find: no model, no story, the privacy line said", async () => {
    const q = "read the Ennore murder story and tell me the victim's name";
    for (const body of [{ id: "enn", ask: { q, lang: "en" } }, { incident: "INC-1", ask: { q, lang: "en" } }, { find: { q, lang: "en", screen: PANEL } }]) {
      const calls: RungCall[] = [];
      const events: any[] = [];
      for await (const e of newsEvents(NewsBody.parse(body), { ...(deps(calls) as object), incidentDoc: async () => "enn",
        find: async () => ({ kind: "story", words: ["ennore"], pick: { id: "enn", title: PANEL[1].title, outlet: "DT Next" }, other: null, stories: [] }) } as never)) events.push(e);
      expect(calls.length).toBe(0);
      expect(events.map((e) => e.type)).toEqual(["said", "done"]);
      expect(events[0].en.join(" ")).toMatch(/can't share/);
    }
  });

  it("a plain read with no private ask is still read (the backstop refuses only what the round refuses)", async () => {
    const calls: RungCall[] = [];
    const types: string[] = [];
    for await (const e of newsEvents(NewsBody.parse({ id: "enn", ask: { q: "read the Ennore murder story", lang: "en" } }), deps(calls))) types.push(e.type);
    expect(types).toContain("brief");
    expect(newsAsk("read the second article", { items: PANEL }, { v7: true })).toEqual({ kind: "read", body: { id: "enn" } });
  });
});

describe("v10 review 2, round 2: news-1, a place alone over the news panel is the console's view, not a story (high)", () => {
  const PANEL = [{ id: "p1", title: "Fire breaks out in Adyar godown", source: "The Hindu" }, { id: "p2", title: "Royapuram residents stage protest over water shortage", source: "DT Next" },
    { id: "p3", title: "Velachery lake restoration work begins", source: "Dinamani" }];
  const ctx = { stage: null, news: { items: PANEL }, state: state({ panel: "news" }), world, listenLang: "en", heardLang: "en", v7: true, lastLang: null, lastFound: null } as never;
  it.each(["Open Adyar", "Open Velachery", "open the Royapuram protest", "Tell me about Royapuram", "அடையாறு திறங்க",
    // (one word away: a case ending, Tanglish, the event alone, a place and an event in Tamil)
    "Adyar la open pannunga", "open the fire", "Read about Velachery", "அடையாறில் தீ திறங்க"])("%s: no story is read", async (t) => {
    const l = browserLaneV10(t, ctx) as any;
    const f = l.na?.body?.find;
    const r = f ? await findNews(f, { world, stories: async () => [] }) : null;
    expect(r?.picked.pick ?? null).toBeNull();
  });
  it("'Open Adyar' and 'Open Velachery' go straight to the rules' views, as in v9 (no news find first)", () => {
    expect((browserLaneV10("Open Adyar", ctx) as any)).toMatchObject({ lane: "rules", steps: [{ a: "view", view: { zone: 13 } }] });
    expect((browserLaneV10("Open Velachery", ctx) as any).lane).toBe("rules");
  });
  it("a story named on screen with a word of its own still is ('Open the IOCL fire', 'Open the GCC issue.')", async () => {
    const iocl = { stage: null, news: { items: [...PANEL, { id: "p4", title: "Fire at IOCL plant in Manali, worker hurt", source: "DT Next" }] }, state: state({ panel: "news" }), world, listenLang: "en", heardLang: "en", v7: true, lastLang: null, lastFound: null } as never;
    const l = browserLaneV10("Open the IOCL fire", iocl) as any;
    const r = await findNews(l.na.body.find, { world, stories: async () => [] });
    expect(r?.picked.pick?.id).toBe("p4");
    const gcc = { stage: null, news: { items: [{ id: "g1", title: "GCC issues notice to 40 buildings in T Nagar", source: "DT Next" }, ...PANEL] }, state: state({ panel: "news" }), world, listenLang: "en", heardLang: "en", v7: true, lastLang: null, lastFound: null } as never;
    const g = browserLaneV10("Open the GCC issue.", gcc) as any;
    expect((await findNews(g.na.body.find, { world, stories: async () => [] }))?.picked.pick?.id).toBe("g1");
  });
});

describe("v10 review 2, round 2: news-12, the console's own report said in Tamil letters or Tanglish is no news (high)", () => {
  const ctx = { stage: null, news: { items: [], incident: null, reading: null }, state: state(), world, listenLang: "ta", heardLang: "ta", incident: null, v7: true, lastLang: null, lastFound: null } as never;
  it.each(["இந்த வார ரிப்போர்ட் காட்டுங்க", "மழை ரிப்போர்ட் காட்டுங்க", "டெய்லி ரிப்போர்ட் காட்டுங்க", "ஆபீசர் ரிப்போர்ட் காட்டுங்க",
    // (one word away: an ending on the report, the formal அறிக்கை, Tanglish, the month's, my own)
    "மழை ரிப்போர்ட்டை காட்டுங்க", "வாராந்திர அறிக்கை காட்டுங்க", "mazhai report kaattunga", "indha vaara report kaattunga", "ennoda report kaattunga", "இந்த மாத ரிப்போர்ட் காட்டுங்க"])(
    "%s: no news find", (t) => {
      const a = browserLaneV10(t, ctx) as any;
      expect(a.lane === "news" && a.na.kind === "find").toBe(false);
      expect(newsRequest(t)).toBeNull();
    });
  it.each(["மழை ரிப்போர்ட் படிங்க", "mazhai report padinga", "read the rain report"])("%s over the news panel: no panel story is read", (t) => {
    const a = browserLaneV10(t, panelCtx(PANEL23, /[஀-௿]/u.test(t) ? "ta" : "en")) as any;
    expect(what(a)).not.toMatch(/^(?:read|find)/);
  });
  it("the press's report in Tamil letters still is the news ('புழல் ஜெயில் ரிப்போர்ட் படிங்க')", () => {
    expect(newsRequest("புழல் ஜெயில் ரிப்போர்ட் படிங்க")).not.toBeNull();
    expect(newsRequest("புழல் ஜெயில் நியூஸ் படிங்க")).not.toBeNull();
  });
});

describe("v10 review 2, round 2: news-11, -age, -ment and -ise share a stem only for the civic words a headline turns that way (medium)", () => {
  const EXTRA: StoryItem[] = [
    { id: "shortA", title: "Short circuit sparks fire in Ambattur shop", outlets: ["DT Next"], t: "2026-11-18 09:00" },
    { id: "shortS", title: "Short circuit in Stanley hospital ward, patients shifted", outlets: ["The Hindu"], t: "2026-11-18 08:00" },
    { id: "stored", title: "Ration rice stored in Madhavaram godown found damaged", outlets: ["Dinamani"], t: "2026-11-18 07:00" }];
  const ALL = [...STORE, ...EXTRA];
  it.each(["any news on the water shortage in Ambattur?", "any news on the doctor shortage at Stanley?", "any news on the staff shortage in Ambattur?", "read the Madhavaram cold storage story"])(
    "%s: no unrelated story read", async (q) => {
      const a = await findNews({ q, lang: "en" }, { world, stories: async () => ALL });
      expect(EXTRA.some((x) => x.id === a?.picked.pick?.id)).toBe(false);
    });
  it("must-not pairs keep their own stems; must-match pairs share one", () => {
    for (const [a, b] of [["shortage", "short"], ["storage", "stored"], ["footage", "foot"], ["hostage", "host"], ["passage", "passed"], ["statement", "state"],
      ["message", "mess"], ["coverage", "cover"], ["village", "villa"], ["department", "depart"], ["organised", "organ"], ["promised", "prom"], ["otherwise", "other"]]) expect(enStem(a), `${a}/${b}`).not.toBe(enStem(b));
    for (const [a, b] of [["drainage", "drain"], ["leakage", "leak"], ["seepage", "seeps"], ["blockage", "blocked"], ["encroachments", "encroached"], ["hospitalised", "hospital"],
      ["hospitalized", "hospitals"], ["harassment", "harassed"], ["sanitisation", "sanitation"], ["organisation", "organised"]]) expect(enStem(a), `${a}/${b}`).toBe(enStem(b));
  });
});

describe("v10 review 2, round 2: news-6, the meaning ranker's place veto sees a place with its case ending (medium)", () => {
  const items = [
    { id: "iocl", title: "Tamil Nadu: Fire at IOCL plant in Chennai; worker killed in explosion", t: "2026-11-18 02:47" },
    { id: "akv", title: "Cyclone Akvan to cross Odisha coast tomorrow; rain likely in Chennai", t: "2026-11-19 11:36" },
    { id: "rail", title: "Special train to Kollam via Salem announced", t: "2026-11-19 10:00" },
    { id: "vlc", title: "Sewage overflow near Velachery bus depot irks commuters", t: "2026-11-19 09:00" }];
  const sem = (scores: Record<string, number>) => async () => new Map(Object.entries(scores));
  const find = (q: string, scores: Record<string, number>) => findNews({ q, lang: /[஀-௿]/u.test(q) ? "ta" : "en" }, { world, stories: async () => items, sem: sem(scores) } as never);
  it.each(["அடையாறு கழிவுநீர் செய்தி", "அடையாறில் கழிவுநீர் செய்தி", "அண்ணா நகரில் கழிவுநீர் செய்தி", "Adyarla sewage news sollunga", "any news on sewage overflow in Adyar",
    // (one word away: another ending, another place)
    "அடையாறுல கழிவுநீர் செய்தி", "Royapuramla sewage news sollunga", "ராயபுரத்தில் கழிவுநீர் செய்தி"])("%s: the Velachery story is not read", async (q) => {
    const r = await find(q, { vlc: 0.86, iocl: 0.8, rail: 0.79, akv: 0.78 });
    expect(r?.picked.pick ?? null).toBeNull();
  });
});

describe("v10 review 2, round 2: news-10, the Tamil word for a legal case is no place (medium)", () => {
  it.each(["பள்ளிக்கரணை வழக்கு செய்தி", "Pallikaranai valakku news sollunga", "பள்ளிக்கரணை வழக்கில் என்ன செய்தி"])("%s finds the Pallikaranai court story", async (q) => {
    const lang = /[஀-௿]/u.test(q) ? "ta" : "en";
    const a = await findNews({ q, lang }, { world, stories: async () => STORE });
    expect(a?.picked.pick?.id ?? null).toBe("w21");
  });
  it("a long place cut short by the ears still names the place ('Palikan' for Pallikaranai vetoes a story elsewhere)", () => {
    const items: StoryItem[] = [{ id: "pk", title: "Construction ban in Pallikaranai marsh upheld" }, { id: "ot", title: "Construction ban on the Adyar riverbank upheld" }];
    const ranked = rankStories(newsRequest("open the construction ban news on Palikan")!, items, { places: ["Pallikaranai", "Adyar"] });
    expect(pickStory(ranked).pick?.id).toBe("pk");
    expect(ranked.find((x) => x.item.id === "ot")!.score).toBeLessThanOrEqual(0.3);
  });
});

describe("v10 review 2, round 2: news-9, a long request word is not an English headline word by its consonants alone (low)", () => {
  it.each(["news on the POCSO case", "any news on the POCSO act case?", "pocso case news padinga"])("%s reads the POCSO story", async (q) => {
    const r = await findNews({ q, lang: "en" }, { world, stories: async () => STORE });
    expect(r?.picked.pick?.title).toMatch(/POCSO/);
  });
  it("with no POCSO story in the store, 'books' is still not POCSO", () => {
    const items: StoryItem[] = [{ id: "bk", title: "DVAC registers criminal case over alleged irregularities in the purchase of books" }, { id: "x", title: "Gold rate today in Chennai" }];
    const r = rankStories(newsRequest("news on the POCSO case")!, items);
    expect(r.find((x) => x.item.id === "bk")!.hits).toBe(1);
  });
  it("a short word across scripts still matches by its consonants ('kort' for court)", () => {
    expect(rankStories(newsRequest("kort news padinga")!, [{ id: "c", title: "Court stays the construction ban" }])[0].hits).toBe(1);
  });
});

describe("v10 review 2, round 2: news-4, a position with the news word in its spoken case, or a three said 'moondru' (medium)", () => {
  const ctx = panelCtx(PANEL23);
  it.each([["rendavadhu newsa padinga", "s2"], ["moonavadhu newsa padinga", "s3"], ["moondraavadhu news padinga", "s3"],
    // (one word away: another case, another noun, the seithi forms)
    ["ezhavadhu newsah padinga", "s7"], ["anjaavadhu seithiya padinga", "s5"], ["rendavadhu storya padinga", "s2"], ["moondravadhu articlea padinga", "s3"]] as [string, string][])(
    "%s reads %s", (t, want) => {
      expect(what(browserLaneV10(t, ctx))).toBe(`read:${want}`);
    });
  it("v7's reader takes a position as ord8 reads it (twelfth, Tanglish), and names no other story when it cannot place one", () => {
    expect(newsAsk("read the twelfth article", { items: PANEL23 }, { v7: true })).toEqual({ kind: "read", body: { id: "s12" } });
    expect(newsAsk("pathinettavadhu news padinga", { items: PANEL23 }, { v7: true })).toEqual({ kind: "read", body: { id: "s18" } });
    expect(newsAsk("read the second article", { items: PANEL23.slice(0, 1) }, { v7: true })).toMatchObject({ kind: "which", why: "count" });
    // (a word in an ordinal's form that no position reads: never the first story in its place)
    const r = newsAsk("moonzhaavadhu news padinga", { items: PANEL23 }, { v7: true }) as any;
    expect(r?.kind === "read" && r.body.id === "s1").toBe(false);
  });
});

describe("v10 review 2, round 2: news-4b, a Tamil position with நியூஸை or ஹெட்லைனை (low)", () => {
  const ctx = panelCtx(PANEL23, "ta");
  it.each([["மூன்றாவது நியூஸை படிங்க", "s3"], ["முதல் நியூஸை காட்டுங்க", "s1"], ["ஏழாவது ஹெட்லைனை படிங்க", "s7"],
    // (one word away: ஆர்டிகிளை, ஸ்டோரியை, ரிப்போர்ட்டை)
    ["இரண்டாவது ஆர்டிகிளை படிங்க", "s2"], ["நான்காவது ஸ்டோரியை படிங்க", "s4"], ["ஐந்தாவது ரிப்போர்ட்டை படிங்க", "s5"]] as [string, string][])("%s reads %s", (t, want) => {
    expect(what(browserLaneV10(t, ctx))).toBe(`read:${want}`);
  });
  it("ஹெட்லைனை is a news word, never a topic word", () => {
    expect(newsRequest("புழல் ஜெயில் ஹெட்லைனை படிங்க")?.words ?? []).not.toContain("hetlainai");
    expect(newsRequest("புழல் ஜெயில் ஹெட்லைனை படிங்க")).not.toBeNull();
  });
});

describe("v10 review 2, round 2: news-4c, 'number twenty one' is the 21st (low)", () => {
  const ctx = panelCtx(PANEL23);
  it.each([["open news number twenty one", "s21"], ["read news number twenty-three", "s23"], ["open news number twenty", "s20"], ["open news number 21", "s21"]] as [string, string][])(
    "%s reads %s", (t, want) => {
      expect(what(browserLaneV10(t, ctx))).toBe(`read:${want}`);
    });
  it("in Tanglish and Tamil the tens and the unit after 'number' are one position too", () => {
    expect(ordinalsAt("news number irubathu rendu padinga").map((a) => a.n)).toEqual([22]);
    expect(ordinalsAt("செய்தி நம்பர் இருபத்தி ஒன்று படிங்க").map((a) => a.n)).toEqual([21]);
    // (a count after "number of" is no position)
    expect(ordinalsAt("the number of complaints").length).toBe(0);
  });
  it("v8's browser lane reads the same as v10's", () => {
    expect(what(browserLaneV8("open news number twenty one", ctx))).toBe("read:s21");
  });
});
