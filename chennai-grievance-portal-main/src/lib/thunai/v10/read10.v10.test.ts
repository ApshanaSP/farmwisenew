/**
 * v10 (docs/jarvis/JARVIS_V10.md 4.5 and 4.9 feature 1): "read" is a brief, not a recital (the owner, 19 Nov: "When I ask to read, it's simply like
 * reading"). Through the news route's events (web/serve.ts), with the console's tools faked and the model mocked (no live model, no store):
 *   - the brief: at most four sentences, what / why / the console's own records / one offer, each model sentence checked before it is said;
 *   - "read it fully": the whole story, its own language read as written, the other language said by the model part by part;
 *   - another language: a Tamil story briefed in English, an English one in Tamil;
 *   - news to ground truth: what the console holds on the story, its cases on the screen, an offer to map them or draft a note;
 *   - privacy: the cases' own words never reach the model.
 * Fixtures are made up (no real citizen's words). The Tamil lines are MODEL-DRAFTED and need a Tamil speaker's review.
 */
import { describe, expect, it } from "vitest";
import type { ToolResult } from "@/lib/assistant/types";
import { WORLD } from "../fixture";
import type { Rung } from "../llm";
import type { OpenRung, RungCall } from "../aide7/stream";
import { NewsBody, newsEvents, type NewsEvent, type StoredDoc } from "../web/serve";
import { briefSheet, newsBrief10 } from "./brief10";
import { consoleFacts, consoleOn, countLine, groundLines, offerOf, stormy, storyTopic } from "./ground10";
import { offerAct, offerOf as keptOffer } from "./offer10";

const BODY = "Residents of Kotturpuram said sewage had been overflowing from a manhole near the bus stop for a week. Commuters said they had to wade through the sewage to board buses. Residents said they had complained to the water board several times without a reply. An official said a team would inspect the sewer line soon.";
const DOC: StoredDoc = { id: "d1", url: "https://www.thehindu.com/news/cities/chennai/x.ece", title: "Sewage overflows on streets near Kotturpuram bus stop", publisher: "The Hindu",
  publisher_domain: "thehindu.com", body: BODY, t: "2026-11-19 08:10:00", place: "Kotturpuram", cat: "DRAINAGE_SEWAGE" };
const TA_BODY = "கோட்டூர்புரம் பேருந்து நிறுத்தம் அருகே ஒரு வாரமாகக் கழிவுநீர் வழிந்தோடுவதாகக் குடியிருப்பவர்கள் தெரிவித்தனர். பேருந்தில் ஏறப் பயணிகள் கழிவுநீரில் நடந்து செல்ல வேண்டியுள்ளது என்று அவர்கள் கூறினர். பலமுறை புகார் அளித்தும் பதில் இல்லை என்று குடியிருப்பவர்கள் தெரிவித்தனர். விரைவில் ஆய்வு செய்யப்படும் என்று அதிகாரி ஒருவர் கூறினார்.";
const TA_DOC: StoredDoc = { id: "d2", url: "https://www.dinamani.com/x", title: "கோட்டூர்புரத்தில் சாலையில் வழிந்தோடும் கழிவுநீர்", title_en: "Sewage flows on the road in Kotturpuram", publisher: "Dinamani",
  publisher_domain: "dinamani.com", body: TA_BODY, t: "2026-11-19 07:30:00", place: "Kotturpuram", cat: "DRAINAGE_SEWAGE" };
const STORM_DOC: StoredDoc = { id: "d3", url: "https://www.dtnext.in/x", title: "Cyclone Akvan: heavy rain likely in Chennai on Saturday", publisher: "DT Next", publisher_domain: "dtnext.in",
  body: "The Regional Meteorological Centre said Cyclone Akvan was likely to bring heavy rain to Chennai on Saturday. Fishermen were advised not to venture into the sea till Sunday.", t: "2026-11-19 09:00:00", place: "Chennai", cat: "FLOOD_RISK_SIGNAL" };
const NOW = Date.parse("2026-11-19T12:00:00+05:30");
const SECRET = "Raw sewage enters my house at 4th street, my mother is sick";

const res = (tool: string, data: unknown, asOf = "2026-11-19 12:00:00"): ToolResult => ({ tool, args: {}, scope: null, asOf, data, facts: [], sources: [], incidentIds: [], testData: false, caveats: [] });
const row = (id: string, t: string, overdue = false) => ({ id, title: SECRET, t, dept: "CMWSSB", dept_name: "Metro Water (CMWSSB)", zone: 13, zone_name: "Adyar", loc: "Kotturpuram", sev: "High", status: "Open", open: true, complaints: 2, overdue, lat: null, lon: null });
/** the console's tools, faked: Kotturpuram resolves to Adyar zone; `cases` open drainage cases there */
function tools(o: { cases?: number; zoneCases?: number; calls?: { name: string; args: Record<string, unknown> }[] } = {}) {
  const cases = o.cases ?? 4;
  return async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    o.calls?.push({ name, args });
    if (name === "resolve_place") return res(name, /kotturpuram|கோட்டூர்புர/i.test(String(args.text)) ? { place: "Kotturpuram", zone: 13, zone_name: "Adyar" } : null);
    if (name === "incidents") {
      const n = args.q ? cases : o.zoneCases ?? cases;
      const rows = [row("INC-OLD", "2026-11-07 09:00:00", true), row("INC-2", "2026-11-12 10:00:00", true), row("INC-3", "2026-11-15 10:00:00"), row("INC-4", "2026-11-18 10:00:00")].slice(0, n);
      return res(name, { rows, total: n, incidents: n, complaints: n ? 9 : 0, page: 0, pageSize: 12 });
    }
    if (name === "environment") return res(name, args.metric === "rainfall_24h_mm" ? { rows: [{ place: "Nungambakkam", value: 84 }, { place: "Meenambakkam", value: 40 }, { place: "Ennore", value: 0 }] } : { warning: { level: 2, t: "2026-11-19 06:00:00" }, ahead: [] });
    return res(name, null);
  };
}
const RUNGS: Rung[] = [{ provider: "groq", model: "qwen/qwen3.8-27b" }];
const factId = (prompt: string, re: RegExp) => [...prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)].find((m) => re.test(m[2]))?.[1] ?? "F99";
/** a model that writes the brief from the facts it finds in the prompt (`lines` builds its S lines from the fact ids) */
const model = (calls: RungCall[], lines: (f: (re: RegExp) => string) => string[]): OpenRung => async (rung, c, onText) => {
  calls.push(c);
  onText("GAP: none\n");
  for (const l of lines((re) => factId(c.prompt, re))) onText(`${l}\n`);
  return { provider: rung.provider, model: rung.model, tokens: 60, firstMs: 1, ms: 2, stop: null };
};
const GOOD_EN = (f: (re: RegExp) => string) => [
  `S: The Hindu reports that sewage has been overflowing near the Kotturpuram bus stop for a week. [${f(/reported/)},${f(/overflowing from a manhole/)}]`,
  `S: Commuters there have to wade through it to board their buses. [${f(/wade through/)}]`,
  `S: The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water. [${f(/on the console now: 4/)},${f(/oldest of these/)},${f(/held by/)}]`
];
async function collect(it: AsyncGenerator<NewsEvent>): Promise<NewsEvent[]> { const out: NewsEvent[] = []; for await (const e of it) out.push(e); return out; }
const deps = (o: { calls?: RungCall[]; open?: OpenRung; rungs?: Rung[]; docs?: StoredDoc[]; cases?: number; zoneCases?: number; toolCalls?: { name: string; args: Record<string, unknown> }[] } = {}) => {
  const tool = tools({ cases: o.cases, zoneCases: o.zoneCases, calls: o.toolCalls });
  const docs = o.docs ?? [DOC, TA_DOC, STORM_DOC];
  return {
    loadDoc: async (id: string) => docs.find((x) => x.id === id) ?? null, related: false as const,
    brief10: newsBrief10({ world: WORLD, user: "t", tool, now: () => NOW, write: { open: o.open ?? model(o.calls ?? [], GOOD_EN), rungs: () => o.rungs ?? RUNGS },
      weather: async () => (await import("./weather10")).weatherLines(tool), placeTa: (n: string) => (/kotturpuram/i.test(n) ? "கோட்டூர்புரம்" : null) })
  };
};
const briefs = (ev: NewsEvent[]) => ev.filter((e): e is Extract<NewsEvent, { type: "brief" }> => e.type === "brief");
const lastBrief = (ev: NewsEvent[], lang: "en" | "ta" = "en") => briefs(ev).pop()?.brief[lang] ?? [];

describe("v10 reading: the brief is what happened, why it matters, what the console says, and an offer", () => {
  it("four sentences at most, in order, the model's checked and the offer said by code", async () => {
    const calls: RungCall[] = [];
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read the Kotturpuram sewage story", lang: "en" } }, deps({ calls })));
    const said = lastBrief(ev);
    expect(said.length).toBeLessThanOrEqual(4);
    expect(said[0]).toMatch(/^The Hindu reports that sewage .*Kotturpuram/);
    expect(said[2]).toMatch(/4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water/);
    expect(said[3]).toBe("Shall I show them on the map, or draft a note to the officer?");
    // streamed: one more sentence each brief event
    expect(briefs(ev).map((b) => b.brief.en.length)).toEqual([1, 2, 3, 4]);
    // one model call, with the brief's own instructions and the console's facts as [dashboard]
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toMatch(/Do not read it out: brief it/);
    expect(calls[0].prompt).toMatch(/\[dashboard\] Open drainage and sewage cases at Kotturpuram on the console now: 4/);
    expect(calls[0].prompt).toMatch(/\[dashboard\] The oldest of these open cases has been open 12 days/);
    expect(calls[0].prompt).toMatch(/\[dashboard\] All of these open cases are held by Metro Water \(CMWSSB\)/);
  });

  it("the offer the browser keeps: the cases on the map, a note on the oldest, the zone to follow", async () => {
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps()));
    const o = ev.find((e) => e.type === "offer") as Extract<NewsEvent, { type: "offer" }>;
    expect(o).toMatchObject({ story: "d1", offers: ["map", "draft"], map: "open drainage complaints near Kotturpuram", draft: ["INC-OLD"], follow: { zone: 13, en: "Adyar" }, civic: true });
    expect(ev[ev.length - 1].type).toBe("done");
  });

  it("privacy: the cases' own words never reach the model (counts, places, departments and ages only)", async () => {
    const calls: RungCall[] = [];
    await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ calls })));
    expect(calls[0].prompt).not.toContain(SECRET);
    expect(calls[0].prompt).not.toMatch(/4th street|my mother/);
  });

  it("a model sentence that fails its check is never said: a wrong figure is dropped and the console's sentence is said by code", async () => {
    const bad = (f: (re: RegExp) => string) => [GOOD_EN(f)[0], GOOD_EN(f)[1], `S: The console has 7 open sewage cases at Kotturpuram, all with Metro Water. [${f(/on the console now/)},${f(/held by/)}]`];
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ open: model([], bad) })));
    const said = lastBrief(ev);
    expect(said.join(" ")).not.toMatch(/\b7 open/);
    expect(said).toContain("The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water.");
    expect(said.length).toBe(4);
  });

  it("no model answers: a code template says the same four parts", async () => {
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ rungs: [] })));
    expect(lastBrief(ev)).toEqual([
      "The Hindu reports this morning: Sewage overflows on streets near Kotturpuram bus stop.",
      "It touches Kotturpuram in Adyar zone, where drainage and sewage falls to Metro Water.",
      "The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water.",
      "Shall I show them on the map, or draft a note to the officer?"
    ]);
  });

  it("nothing at the place by its name: the zone's cases; none at all: said honestly, and the zone offered to follow", async () => {
    const zone = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ rungs: [], cases: 0, zoneCases: 2 })));
    expect(lastBrief(zone)[2]).toBe("The console has 2 open drainage and sewage cases in Adyar zone, the oldest open 12 days, all with Metro Water.");
    const none = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ rungs: [], cases: 0, zoneCases: 0 })));
    expect(lastBrief(none)[2]).toBe("The console has no open drainage and sewage case in Adyar zone; few reports may only mean few were filed, not that all is well.");
    expect(lastBrief(none)[3]).toBe("Shall I show the area on the map, or follow Adyar zone for you?");
  });

  it("a storm: the rain gauges are the console's part, said once (no second weather line)", async () => {
    const ev = await collect(newsEvents({ find: { q: "tell me about cyclone akvan", lang: "en", weather: true } }, { ...deps({ rungs: [] }),
      find: async () => ({ kind: "story" as const, words: ["akvan"], pick: { id: "d3", title: STORM_DOC.title ?? "", outlet: "DT Next" }, other: null, stories: [] }),
      weather: async () => ({ en: ["The rain gauges: the most in the last 24 hours is 84 mm at Nungambakkam; 2 of 3 gauges had rain."], ta: ["மழைமானிகள்: x"] }) }));
    const said = lastBrief(ev);
    expect(said.filter((l) => /gauges/.test(l))).toHaveLength(1);
    expect(said[2]).toMatch(/^The rain gauges: the most in the last 24 hours is 84 mm at Nungambakkam/);
    expect(said[3]).toBe("Shall I show the flooding complaints on the map, or read the whole story?");
    expect(ev.some((e) => e.type === "weather")).toBe(false);
  });
});

describe("v10 reading: another language", () => {
  it("an English story asked in Tamil is briefed in Tamil, with the Tamil offer", async () => {
    const calls: RungCall[] = [];
    const ta = (f: (re: RegExp) => string) => [
      `S: கோட்டூர்புரம் பேருந்து நிறுத்தம் அருகே ஒரு வாரமாகக் கழிவுநீர் வழிந்தோடுவதாக தி இந்து செய்தி வெளியிட்டிருக்கிறது. [${f(/reported/)},${f(/overflowing from a manhole/)}]`,
      `S: பேருந்தில் ஏறப் பயணிகள் கழிவுநீரில் நடந்து போக வேண்டியிருக்கிறது. [${f(/wade through/)}]`,
      `S: கன்சோலில் கோட்டூர்புரத்தில் 4 கழிவுநீர் புகார்கள் திறந்த நிலையில் உள்ளன, பழையது 12 நாட்களாக, எல்லாமே சென்னை குடிநீர் வாரியம் வசம். [${f(/on the console now: 4/)},${f(/oldest of these/)},${f(/held by/)}]`
    ];
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "கோட்டூர்புரம் செய்தியைப் படிங்க", lang: "ta" } }, deps({ open: model(calls, ta) })));
    const said = lastBrief(ev, "ta");
    expect(calls[0].prompt).toMatch(/ANSWER IN: Tamil/);
    expect(calls[0].system).toMatch(/The same good brief in Tamil/);
    expect(said).toHaveLength(4);
    expect(said[2]).toMatch(/4 கழிவுநீர் புகார்கள்/);
    expect(said[3]).toMatch(/வரைபடத்தில் காட்டட்டுமா/);
  });

  it("a Tamil story asked in English is briefed in English, from its own text and the English headline", async () => {
    const calls: RungCall[] = [];
    const en = (f: (re: RegExp) => string) => [
      `S: Dinamani reports that sewage has been flowing on the road near the Kotturpuram bus stop for a week. [${f(/headline in English/)},${f(/வழிந்தோடுவதாக/)}]`,
      `S: The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water. [${f(/on the console now: 4/)},${f(/oldest of these/)},${f(/held by/)}]`
    ];
    const ev = await collect(newsEvents({ id: "d2", ask: { q: "read the Kotturpuram story", lang: "en" } }, deps({ open: model(calls, en) })));
    expect(calls[0].prompt).toMatch(/ANSWER IN: English/);
    expect(calls[0].prompt).toMatch(/Dinamani's headline in English: Sewage flows on the road in Kotturpuram/);
    const said = lastBrief(ev);
    expect(said[0]).toMatch(/^Dinamani reports that sewage/);
    expect(said.join(" ")).not.toMatch(/[஀-௿]/u);
    expect(said[said.length - 1]).toBe("Shall I show them on the map, or draft a note to the officer?");
  });

  it("no model: the Tamil template for an English story, the English one for a Tamil story (its English headline)", async () => {
    const ta = lastBrief(await collect(newsEvents({ id: "d1", ask: { q: "படிங்க", lang: "ta" } }, deps({ rungs: [] }))), "ta");
    expect(ta[0]).toMatch(/கோட்டூர்புரம் பகுதியில் கழிவுநீர் பிரச்சினை குறித்துச் செய்தி வெளியிட்டிருக்கிறது/);
    expect(ta[2]).toBe("கன்சோலில் கோட்டூர்புரம் பகுதியில் கழிவுநீர் தொடர்பான 4 புகார்கள் திறந்த நிலையில் உள்ளன, பழையது 12 நாட்களாகத் திறந்திருக்கிறது; எல்லாமே சென்னை குடிநீர் வாரியம் வசம் உள்ளன.");
    const en = lastBrief(await collect(newsEvents({ id: "d2", ask: { q: "read it", lang: "en" } }, deps({ rungs: [] }))));
    expect(en[0]).toBe("Dinamani reports this morning: Sewage flows on the road in Kotturpuram.");
  });
});

describe("v10 reading: \"read it fully\"", () => {
  it("its own language: the whole story as written, no model, the brief marked full", async () => {
    const calls: RungCall[] = [];
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read it fully", lang: "en" }, full: true }, deps({ calls })));
    const b = briefs(ev).pop()!;
    expect(b.full).toBe(true);
    expect(calls).toHaveLength(0);
    expect(b.brief.en[0]).toBe("The Hindu's report, in full: about 1 minute. Say stop any time.");
    expect(b.brief.en).toContain("Commuters said they had to wade through the sewage to board buses.");
    expect(b.brief.en[b.brief.en.length - 1]).toBe("An official said a team would inspect the sewer line soon.");
    expect(ev.some((e) => e.type === "offer")).toBe(true);
  });

  it("the other language: the model says it part by part, each sentence checked against the one it renders", async () => {
    const calls: RungCall[] = [];
    const tr: OpenRung = async (rung, c, onText) => {
      calls.push(c);
      onText("GAP: none\n");
      const facts = [...c.prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)];
      const say: Record<string, string> = { "வழிந்தோடுவதாகக்": "Residents said sewage had been flowing near the Kotturpuram bus stop for a week.", "பேருந்தில்": "They said commuters had to walk through the sewage to board buses.",
        "பலமுறை": "Residents said there was no reply despite several complaints.", "அதிகாரி": "An official said it would be inspected soon." };
      for (const [, id, text] of facts) { const k = Object.keys(say).find((w) => text.includes(w)); if (k) onText(`S: ${say[k]} [${id}]\n`); }
      return { provider: rung.provider, model: rung.model, tokens: 50, firstMs: 1, ms: 2, stop: null };
    };
    const ev = await collect(newsEvents({ id: "d2", ask: { q: "read it fully", lang: "en" }, full: true }, deps({ open: tr })));
    const said = briefs(ev).pop()!.brief.en;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].system).toMatch(/in a language other than the report's own/);
    expect(said[0]).toBe("Dinamani's report, in full, in English: about 1 minute. Say stop any time.");
    expect(said).toContain("Residents said sewage had been flowing near the Kotturpuram bus stop for a week.");
    expect(said).toContain("An official said it would be inspected soon.");
    expect(said.join(" ")).not.toMatch(/[஀-௿]/u);
  });

  it("the other language and no model: said plainly, nothing made up", async () => {
    const ev = await collect(newsEvents({ id: "d2", ask: { q: "read it fully", lang: "en" }, full: true }, deps({ rungs: [] })));
    expect(briefs(ev).pop()!.brief.en).toContain("I can't put the whole report into English just now; its link is on the screen.");
  });
});

describe("v10 news to ground truth: \"what do we have on this?\"", () => {
  it("the console's cases near the story's place, of its kind, how old and who holds them; the cases go to the screen; an offer", async () => {
    const ev = await collect(newsEvents({ ground: { id: "d1", lang: "en", q: "what do we have on this?" } }, deps()));
    const g = ev.find((e) => e.type === "ground") as Extract<NewsEvent, { type: "ground" }>;
    expect(g.en).toEqual([
      "The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water.",
      "9 citizen complaints are linked to them, and 2 are past their deadline; they're on your screen.",
      "Shall I show them on the map, or draft a note to the officer?"
    ]);
    expect(g.ta[0]).toMatch(/4 புகார்கள்/);
    expect(g.ta[2]).toMatch(/வரைபடத்தில் காட்டட்டுமா/);
    expect(g.rows.map((r) => r.id)).toEqual(["INC-OLD", "INC-2", "INC-3", "INC-4"]);
    expect(ev.find((e) => e.type === "offer")).toMatchObject({ offers: ["map", "draft"], draft: ["INC-OLD"] });
  });

  it("searches by the story's kind and place: open drainage cases at Kotturpuram, then the zone", async () => {
    const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
    await collect(newsEvents({ ground: { id: "d1", lang: "en" } }, deps({ toolCalls, cases: 0, zoneCases: 0 })));
    const inc = toolCalls.filter((c) => c.name === "incidents").map((c) => c.args);
    expect(inc[0]).toMatchObject({ status: "open", q: "Kotturpuram", allTime: true, scope: { zone: 13, cat: "DRAINAGE_SEWAGE" } });
    expect(inc[1]).toMatchObject({ status: "open", q: null, scope: { zone: 13, cat: "DRAINAGE_SEWAGE" } });
  });

  it("a storm: the district's open flooding cases (never the monitor's 'weather warnings' kind), then the gauges", async () => {
    const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
    const ev = await collect(newsEvents({ ground: { id: "d3", lang: "en" } }, deps({ toolCalls })));
    expect(toolCalls.find((c) => c.name === "incidents")?.args).toMatchObject({ scope: { zone: null, cat: "FLOOD_WATERLOGGING" } });
    const g = ev.find((e) => e.type === "ground") as Extract<NewsEvent, { type: "ground" }>;
    expect(g.en[0]).toBe("The console has 4 open flooding and waterlogging cases in the district, the oldest open 12 days, all with Metro Water.");
    expect(g.en.some((l) => /rain gauges/.test(l))).toBe(true);
    expect(g.en.join(" ")).not.toMatch(/warnings cases/);
  });

  it("a story it cannot place: said so, nothing counted", async () => {
    const doc: StoredDoc = { ...DOC, id: "d9", title: "City corporation plans new budget", body: "The corporation council met on Tuesday to discuss the budget for the coming year in detail.", place: null, cat: null };
    const ev = await collect(newsEvents({ ground: { id: "d9", lang: "en" } }, deps({ docs: [doc] })));
    const g = ev.find((e) => e.type === "ground") as Extract<NewsEvent, { type: "ground" }>;
    expect(g.en[0]).toBe("I can't place this story in the district, so I have no console records to match it with.");
    expect(g.rows).toEqual([]);
  });

  it("only a news outlet's stored report can be asked about", async () => {
    const social: StoredDoc = { ...DOC, id: "s1", publisher: "Twitter", publisher_domain: "x.com", publisher_tier: "social" };
    const ev = await collect(newsEvents({ ground: { id: "s1", lang: "en" } }, deps({ docs: [social] })));
    expect(ev).toEqual([{ type: "error", why: "not_found" }]);
  });
});

describe("v10 reading: the report's time in the facts", () => {
  it("is Chennai's: a time the route hands in UTC (08:10 IST as 02:40Z) is not read as IST (it was 'early this morning')", () => {
    const story = { id: "d1", outlet: "The Hindu", outletTa: "தி இந்து", title: DOC.title ?? "", titleEn: null, publishedAt: "2026-11-19T02:40:00.000Z", text: BODY, place: null, cat: null };
    const none = { place: null, topic: null, storm: false, area: null, n: null, complaints: 0, oldestDays: null, dept: null, overdue: null, ids: [], rows: [], gauges: null };
    const sheet = briefSheet(story, none, "en", { world: WORLD }, NOW);
    expect(sheet.facts[0].text).toMatch(/^The Hindu reported this morning: Sewage overflows/);
  });
});

describe("v10 reading: the console's own tools take what ground10 asks (a refused argument would count nothing, silently)", () => {
  it("resolve_place, incidents and environment validate the arguments sent", async () => {
    const { TOOLS } = await import("@/lib/assistant/tools");
    const sent: { name: string; args: Record<string, unknown> }[] = [];
    await collect(newsEvents({ ground: { id: "d1", lang: "en" } }, deps({ toolCalls: sent, cases: 0, zoneCases: 0 })));
    await collect(newsEvents({ ground: { id: "d3", lang: "en" } }, deps({ toolCalls: sent })));
    expect(new Set(sent.map((c) => c.name))).toEqual(new Set(["resolve_place", "incidents", "environment"]));
    for (const c of sent) {
      const t = TOOLS.find((x) => x.name === c.name);
      expect(t, c.name).toBeTruthy();
      expect(t!.args.safeParse(c.args).success, `${c.name} ${JSON.stringify(c.args)}`).toBe(true);
    }
  });
});

describe("v10 review 2 (reading): the console's sentence says the console's own count", () => {
  const SAID_4 = "The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 12 days, all with Metro Water.";
  it("'no open cases' when the console has 4 is never said: the code's count is (v10 review 2, finding 1)", async () => {
    const none = (f: (re: RegExp) => string) => [GOOD_EN(f)[0], GOOD_EN(f)[1], `S: The console has no open drainage and sewage cases at Kotturpuram. [${f(/story's place/)}]`];
    const said = lastBrief(await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ open: model([], none) }))));
    expect(said.join(" ")).not.toMatch(/has no open/);
    expect(said[2]).toBe(SAID_4);
    expect(said).toHaveLength(4);
  });
  it("the linked complaints' figure said as the cases' count is never said (v10 review 2, finding 4)", async () => {
    const nine = (f: (re: RegExp) => string) => [GOOD_EN(f)[0], GOOD_EN(f)[1], `S: The console has 9 open drainage and sewage cases there, all with Metro Water. [${f(/Citizen complaints/)},${f(/held by/)}]`];
    const said = lastBrief(await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps({ open: model([], nine) }))));
    expect(said.join(" ")).not.toMatch(/\b9 open/);
    expect(said[2]).toBe(SAID_4);
  });
});

describe("v10 review 2 (reading): a storm is the weather's, not a drain's or a row's (finding 3)", () => {
  it.each([["Storm water drain works across Chennai to be completed before monsoon", null], ["Political storm erupts over Chennai Corporation's property tax hike", "Chennai"]])(
    "%s: no rain gauges, no flooding offer", async (title, place) => {
      const doc: StoredDoc = { id: "s1", url: "https://www.thehindu.com/z", title, publisher: "The Hindu", publisher_domain: "thehindu.com",
        body: "The Greater Chennai Corporation said the works were progressing in several wards. Residents complained of dug-up roads and dust.", t: "2026-11-19 08:00:00", place, cat: null };
      const said = lastBrief(await collect(newsEvents({ id: "s1", ask: { q: "read it", lang: "en" } }, deps({ rungs: [], docs: [doc] }))));
      expect(said.join(" ")).not.toMatch(/rain gauges|flooding/i);
    });
  it("a storm said with the weather is still one", () => {
    expect(stormy("Storm water drain works across Chennai to be completed before monsoon")).toBe(false);
    expect(stormy("Political storm erupts over Chennai Corporation's property tax hike")).toBe(false);
    expect(stormy("Cyclone Akvan: heavy rain likely in Chennai on Saturday")).toBe(true);
    expect(stormy("Storm lashes Chennai", "Heavy rain and strong winds uprooted trees across the city.")).toBe(true);
  });
});

describe("v10 review 2 (reading): what the console says it holds, it holds", () => {
  const res0 = (tool: string, data: unknown) => res(tool, data);
  const mk = (id: string, t: string, dept: string, deptName: string) => ({ id, title: "x", t, dept, dept_name: deptName, zone: 13, zone_name: "Adyar", loc: "Kotturpuram", sev: "High", status: "Open", open: true, complaints: 1, overdue: false, lat: null, lon: null });
  const place = { place: "Kotturpuram", zone: 13, zone_name: "Adyar" };

  it("a story of no civic kind counts nothing: no unrelated case is offered for a note (v10 review 2, finding 5)", async () => {
    const tool = async (n: string) => (n === "resolve_place" ? res0(n, place)
      : n === "incidents" ? res0(n, { rows: [mk("INC-STREETLIGHT", "2026-08-01 09:00:00", "GCC-ELE", "GCC Electrical")], total: 1, incidents: 1, complaints: 1 }) : res0(n, null));
    const s = { id: "d1", outlet: "The Hindu", outletTa: null, title: "Minister inaugurates new public library at Kotturpuram", titleEn: null, publishedAt: null,
      text: "The minister inaugurated a new public library at Kotturpuram on Tuesday. Students welcomed the new reading room.", place: "Kotturpuram", cat: null };
    const c = await consoleOn(s, { world: WORLD, tool });
    expect(c.topic).toBeNull();
    expect(c.n).toBeNull();
    expect(offerOf(s, c).draft).toEqual([]);
    expect(groundLines(c, offerOf(s, c), "en")[0]).toBe("This story names no civic problem the console tracks, so I have no cases to match it with.");
  });

  const sewage = { id: "d1", outlet: "The Hindu", outletTa: null, title: "Sewage overflows near Kotturpuram bus stop", titleEn: null, publishedAt: null, text: "Residents said sewage overflowed.", place: "Kotturpuram", cat: "DRAINAGE_SEWAGE" };
  it("30 open and 12 read: never 'all with' over the cases not read (v10 review 2, finding 6)", async () => {
    const tool = async (n: string) => (n === "resolve_place" ? res0(n, place) : n === "incidents"
      ? res0(n, { rows: Array.from({ length: 12 }, (_, i) => mk(`INC-${i}`, `2026-11-${String(i + 1).padStart(2, "0")} 09:00:00`, "CMWSSB", "Metro Water (CMWSSB)")), total: 30, incidents: 30, complaints: 40 })
      : res0(n, null));
    const c = await consoleOn(sewage, { world: WORLD, tool });
    expect(countLine(c, "en")).toBe("The console has 30 open drainage and sewage cases at Kotturpuram, the oldest open 18 days, 12 of them with Metro Water.");
    expect(countLine(c, "ta")).not.toMatch(/எல்லாமே/);
    expect(consoleFacts(c).map((f) => f.text).join(" ")).not.toMatch(/All of these open cases/);
  });
  it("one case each with 4 departments: never 'most with' (v10 review 2, finding 6)", async () => {
    const ds: [string, string][] = [["CMWSSB", "Metro Water (CMWSSB)"], ["GCC-SWD", "Storm Water Drains"], ["GCC-ENG", "GCC Bus Route Roads"], ["GCC-SWM", "Solid Waste Management"]];
    const tool = async (n: string) => (n === "resolve_place" ? res0(n, place) : n === "incidents"
      ? res0(n, { rows: ds.map(([d, nm], i) => mk(`INC-${i}`, `2026-11-0${i + 1} 09:00:00`, d, nm)), total: 4, incidents: 4, complaints: 4 }) : res0(n, null));
    const c = await consoleOn(sewage, { world: WORLD, tool });
    expect(countLine(c, "en")).toBe("The console has 4 open drainage and sewage cases at Kotturpuram, the oldest open 18 days, spread across 4 departments.");
    expect(countLine(c, "ta")).not.toMatch(/பெரும்பாலானவை/);
  });
});

describe("v10 review 2 (reading): \"read it fully\"", () => {
  it("the other language: a part the model cannot say is said so at once, and no more parts are asked (v10 review 2, finding 7)", async () => {
    const TA = ["கோட்டூர்புரம் பேருந்து நிறுத்தம் அருகே கழிவுநீர் வழிந்தோடுவதாகக் குடியிருப்பவர்கள் தெரிவித்தனர்.", "பேருந்தில் ஏறப் பயணிகள் கழிவுநீரில் நடந்து செல்ல வேண்டியுள்ளது என்று அவர்கள் கூறினர்.",
      "பலமுறை புகார் அளித்தும் பதில் இல்லை என்று குடியிருப்பவர்கள் தெரிவித்தனர்.", "விரைவில் ஆய்வு செய்யப்படும் என்று அதிகாரி ஒருவர் கூறினார்.", "சாலையோர கடைகளில் வியாபாரம் குறைந்துள்ளதாக வியாபாரிகள் கூறினர்.",
      "குழந்தைகள் பள்ளிக்குச் செல்வதில் சிரமம் உள்ளதாகப் பெற்றோர் தெரிவித்தனர்.", "துர்நாற்றம் தாங்க முடியவில்லை என்று அருகில் வசிப்பவர்கள் கூறினர்.", "இந்தப் பிரச்சினை நீண்ட காலமாகத் தொடர்வதாக அவர்கள் தெரிவித்தனர்.",
      "நிரந்தரத் தீர்வு வேண்டும் என்று குடியிருப்பவர்கள் கோரிக்கை விடுத்தனர்."];
    const story = { id: "d2", outlet: "Dinamani", outletTa: "தினமணி", title: "கோட்டூர்புரத்தில் சாலையில் வழிந்தோடும் கழிவுநீர்", titleEn: "Sewage flows on the road in Kotturpuram", publishedAt: null, text: TA.join(" "), place: null, cat: null };
    const calls: RungCall[] = [];
    // the first part renders; every later one makes a figure up, which the check refuses
    const open: OpenRung = async (r, c, on) => {
      calls.push(c);
      on("GAP: none\n");
      const p1 = c.prompt.includes("பேருந்து நிறுத்தம்");
      for (const [, id] of c.prompt.matchAll(/^(F\d+) \[[^\]]+\] (.*)$/gm)) on(p1 ? `S: Residents said the sewage was flowing on the road there. [${id}]\n` : `S: Residents said 99 streets were flooded. [${id}]\n`);
      return { provider: r.provider, model: r.model, tokens: 1, firstMs: 1, ms: 1, stop: null };
    };
    let last: string[] = [];
    for await (const l of newsBrief10({ world: WORLD, user: "t", now: () => 5000, write: { open, rungs: () => RUNGS } }).full({ question: "read it fully", lang: "en", story })) last = l;
    expect(last.join(" ")).not.toMatch(/99 streets/);
    expect(last[last.length - 1]).toBe("I couldn't put the next part into English; the full report is linked on the screen.");
    // the part that failed, and its one re-ask: no call for the parts after it
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  it("after the whole story nothing was offered aloud: 'Okay.' opens nothing, 'show them on the map' still does (v10 review 2, finding 8)", async () => {
    const ev = await collect(newsEvents({ id: "d1", ask: { q: "read it fully", lang: "en" }, full: true }, deps()));
    expect(briefs(ev).pop()!.brief.en.join(" ")).not.toMatch(/Shall I/);
    // the event as the browser reads it off the stream (Thunai.tsx keeps it with offer10's offerOf)
    const kept = (es: NewsEvent[]) => keptOffer({ ...es.find((e) => e.type === "offer") }, "en", NOW);
    const o = kept(ev);
    expect(offerAct("Okay.", o, NOW + 2000)).toBeNull();
    expect(offerAct("yes", o, NOW + 2000)).toBeNull();
    expect(offerAct("show them on the map", o, NOW + 2000)).toEqual({ act: "map", q: "open drainage complaints near Kotturpuram" });
    // after a brief, its offer was said: a yes takes it
    const b = await collect(newsEvents({ id: "d1", ask: { q: "read it", lang: "en" } }, deps()));
    expect(offerAct("yes", kept(b), NOW + 2000)).toEqual({ act: "map", q: "open drainage complaints near Kotturpuram" });
  });
});

describe("v10 reading: the request shapes and the story's kind", () => {
  it("the browser's read may carry full: true; a ground-truth ask names the story and its language", () => {
    expect(NewsBody.safeParse({ id: "d1", ask: { q: "read it fully", lang: "en" }, full: true }).success).toBe(true);
    expect(NewsBody.safeParse({ incident: "INC-1", full: true }).success).toBe(true);
    expect(NewsBody.safeParse({ ground: { id: "d1", lang: "ta", q: "இதைப் பற்றி நம்மகிட்ட என்ன இருக்கு?" } }).success).toBe(true);
    expect(NewsBody.safeParse({ ground: { id: "bad id!", lang: "en" } }).success).toBe(false);
    expect(NewsBody.safeParse({ ground: { id: "d1", lang: "en", extra: 1 } }).success).toBe(false);
  });
  it.each([
    ["Residents stage empty-pot protest over water shortage in Kodungaiyur", "WATER_SUPPLY"],
    ["Sewage overflows near Koyambedu bus stand", "DRAINAGE_SEWAGE"],
    ["Garbage piles up on Velachery Main Road", "SOLID_WASTE"],
    ["Potholes on Anna Salai trouble motorists", "ROAD_DAMAGE"],
    ["Streets inundated in Pallikaranai after rain", "FLOOD_WATERLOGGING"],
    ["கொடுங்கையூரில் குடிநீர் தட்டுப்பாடு: பொதுமக்கள் போராட்டம்", "WATER_SUPPLY"],
    ["Traders protest against eviction in T. Nagar", "PUBLIC_ORDER"]
  ])("%s -> %s", (title, cat) => {
    expect(storyTopic(title, null, WORLD)?.cat).toBe(cat);
  });
});
