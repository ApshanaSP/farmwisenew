/**
 * v16 (22 Nov): the reader decides what was asked before any word lane acts, and the focus screen answers the shape asked. The sentences are
 * the owner's own of 21-22 Nov (data/thunai/audit.jsonl) and the probe's hard questions; the reader itself is a stand-in here (its live run is
 * probe16.live.ts).
 */
import { describe, expect, it } from "vitest";
import type { ToolResult } from "@/lib/assistant/types";
import { START, WORLD } from "../fixture";
import { clearCaches, firstCaseOf, planRound, pointedZone, RoundBody } from "../round";
import { fakeHands } from "../stagefake";
import type { StageDocT } from "../stage";
import { referenceWorld } from "../world";
import type { World } from "../types";
import { analyseFocus, focusAsk, type FocusRows } from "../v15/focus";
import { districtSay } from "../recipes/focus";
import { checkReading, fits, focusSlots, stageFits, type ReadFn, type Reading } from "./reader";
import { busy, quietFor, TICK_QUIET_MS, untilQuietFor } from "../keepwarm";
import { asksBeyondMove } from "../plan";
import { browserLaneV8 } from "../v8/browser";

const REAL: World = { ...WORLD, ...referenceWorld() };
const R = (o: Partial<Reading>): Reading => ({ ask: "other", zones: [], place: null, cat: null, sev: null, period: null, lenses: [], about: null, one: false, page: null, lang_wanted: null, status: null, measure: null, request: "", reply: null, ...o });

describe("the reading, checked", () => {
  it("drops unknown zones and kinds, and a reply with a figure", () => {
    const r = checkReading(R({ ask: "focus", zones: [13, 99, 13], cat: "NOT_A_KIND", reply: "There are 5 of them", place: "Velachery" }), REAL);
    expect(r.zones).toEqual([13]);
    expect(r.cat).toBeNull();
    expect(r.reply).toBeNull();
    expect(r.place).toBe("Velachery");
  });
  it("the lanes that may answer each reading", () => {
    expect(fits(R({ ask: "news" }), "focus")).toBe(false);
    expect(fits(R({ ask: "news" }), "news")).toBe(true);
    expect(fits(R({ ask: "meta" }), "why")).toBe(false);
    expect(fits(R({ ask: "other" }), "why")).toBe(true);
    expect(fits(null, "why")).toBe(true);
    expect(stageFits(R({ ask: "meta" }))).toBe(false);
    expect(stageFits(R({ ask: "stage_op" }))).toBe(true);
  });
  it("a focus reading's slots: the zones, the lenses, places for what keeps coming back, today as the week", () => {
    expect(focusSlots(R({ ask: "focus", zones: [12, 13], lenses: ["attention"] }))).toMatchObject({ zones: [12, 13], lens: ["attention"], about: "areas", fresh: true });
    expect(focusSlots(R({ ask: "focus", lenses: ["repeat"] }))).toMatchObject({ about: "places" });
    expect(focusSlots(R({ ask: "focus", period: "daily" })).period).toBe("weekly");
    expect(focusSlots(R({ ask: "focus", zones: [13], place: "Velachery", cat: "FLOOD_WATERLOGGING", lenses: ["worsening"] }))).toMatchObject({ q: "Velachery", cat: "FLOOD_WATERLOGGING" });
  });
});

describe("the word lane's own guard (when the reader is off)", () => {
  it("two zones in the Collector's own Tamil spellings are a comparison, not the district's list (11:55)", () => {
    expect(focusAsk("அலந்தூர் and அடையார்ல இருக்கிற incidents எல்லாம் compare பண்ணு. எதுக்கு நான் நிறைய concentrate பண்ணனும்னு சொல்லு.", REAL)).toBeNull();
  });
  it("the district's question stays a focus question", () => {
    expect(focusAsk("Okay now which area I have to concentrate most?", REAL)?.lenses).toEqual(["attention"]);
  });
});

// the focus tool's rows (as v15's test): Teynampet getting worse and overdue, Adyar improving, Royapuram steady
const now = "2026-11-22 10:00:00";
const day = (back: number) => new Date(Date.parse("2026-11-22T00:00:00+05:30") - back * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
const ROWS: FocusRows = {
  days: [
    ...Array.from({ length: 56 }, (_, b) => ({ zone: 9, name: "Teynampet", d: day(b), n: b < 28 ? 6 : 3, severe: b < 28 ? 1 : 0, rep: 1 })),
    ...Array.from({ length: 56 }, (_, b) => ({ zone: 13, name: "Adyar", d: day(b), n: b < 28 ? 2 : 5, severe: 0, rep: 0 })),
    ...Array.from({ length: 56 }, (_, b) => ({ zone: 5, name: "Royapuram", d: day(b), n: 4, severe: 1, rep: 0 }))
  ],
  kinds: [
    { zone: 9, cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", now: 120, prev: 40 }, { zone: 9, cat: "SOLID_WASTE", label: "Garbage", now: 48, prev: 44 },
    { zone: 13, cat: "ROAD_DAMAGE", label: "Road damage", now: 30, prev: 100 }, { zone: 13, cat: "SOLID_WASTE", label: "Garbage", now: 26, prev: 40 },
    { zone: 5, cat: "SOLID_WASTE", label: "Garbage", now: 112, prev: 110 }
  ],
  backlog: [{ zone: 9, open: 150, overdue: 30, severeOpen: 5 }, { zone: 13, open: 20, overdue: 2, severeOpen: 0 }, { zone: 5, open: 130, overdue: 25, severeOpen: 6 }],
  repeats: [{ zone: 9, name: "Teynampet", place: "TTK Road", cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 7, open: 3 },
    { zone: 2, name: "Manali", place: "Manali, Chennai - TNPCB", cat: "AIR_POLLUTION", label: "Air pollution", n: 20, open: 9 }],
  owners: [{ zone: 9, dept: "GCC-SWD", n: 18 }, { zone: 9, dept: "POL-GCP", n: 12 }, { zone: 5, dept: "GCC-SWM", n: 20 }]
};
const focusTool = (): ToolResult => {
  const a = analyseFocus(ROWS, now, 28, { zones: [] });
  return { scope: null, asOf: now, tool: "focus_trends", args: {}, data: { days: 28, weekLabels: a.weekLabels, district: a.district, zones: a.zones, attention: a.attention.map((x) => x.zone),
    worse: a.worse.map((x) => x.zone), better: a.better.map((x) => x.zone), spots: a.spots, kinds: a.kinds }, facts: [], sources: [], incidentIds: [], testData: true, caveats: [] } as unknown as ToolResult;
};

describe("districtSay: the reason, not just the name", () => {
  const a = analyseFocus(ROWS, now, 28, { zones: REAL.zones });
  const w = { kindEn: (_: string | undefined, l: string) => l, kindTa: (_: string | undefined, l: string) => l, deptEn: (d: string) => (d === "GCC-SWD" ? "Storm Water Drain" : d), deptTa: (d: string) => d };
  it("where to concentrate says why, what drives it and who holds the overdue cases", () => {
    const s = districtSay(a, ["attention"], w).en;
    expect(s).toMatch(/^Concentrate first on Teynampet: 30 open past their deadline/);
    expect(s).toMatch(/mostly Flooding & waterlogging/);
    expect(s).toMatch(/Storm Water Drain holds 18 of its cases past their deadline/);
  });
  it("better or worse overall starts with the district's own change", () => {
    expect(districtSay(a, ["improving", "worsening"], w).en).toMatch(/^Across the district, reports are /);
  });
  it("a kind asked is not said again as what drives it", () => {
    expect(districtSay(a, ["attention"], { ...w, kindAsked: true }).en).not.toMatch(/mostly/);
  });
});

describe("planRound with the reader: the owner's sentences go where they mean", () => {
  void START;
  const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
  const body = (text: string, o: Record<string, unknown> = {}) => RoundBody.parse({ turnId: `t16-${Math.random().toString(36).slice(2, 7)}`, round: 0, text, state: STATE, turns: [], stage: null, ...o });
  const reader = (r: Partial<Reading>): ReadFn => async () => ({ reading: R(r), model: "stand-in", tokens: 10, ms: 1 });
  // no planner in these tests: a sentence that reaches it gets no model
  const llm = { generate: async () => { throw new Error("no planner here"); } } as never;
  const hands = () => fakeHands({ focus_trends: () => focusTool() });

  it("two zones and 'which should I concentrate on' is those two side by side, and which needs the Collector more (11:55)", async () => {
    clearCaches();
    const text = "அலந்தூர் and அடையார்ல இருக்கிற incidents எல்லாம் compare பண்ணு. எதுக்கு நான் நிறைய concentrate பண்ணனும்னு சொல்லு.";
    const o = await planRound(body(text), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", zones: [9, 13], lenses: ["attention"], request: "Compare Teynampet and Adyar and say which needs more attention." }) });
    expect(o.lane).toBe("reader");
    expect(o.result?.note).toBe("reader:focus:attention:2");
    expect(o.result?.stage?.recipe).toBe("focus");
    expect(o.result?.stage?.blocks.some((b) => b.kind === "Compare")).toBe(true);
    // the key points carry what is said, so every figure said is on the screen
    expect(o.result?.stage?.blocks.some((b) => b.kind === "Brief" && b.id === "points")).toBe(true);
    expect(o.result?.stage?.say.en).toMatch(/^Of Teynampet and Adyar, concentrate on Teynampet first: /);
    expect(o.understood).toMatch(/Compare Teynampet and Adyar/);
  });

  it("'which of the two is getting worse' answers the trends first", async () => {
    clearCaches();
    const o = await planRound(body("Rendu la edhu worse aagudhu?"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", zones: [13, 9], lenses: ["worsening"] }) });
    expect(o.result?.stage?.say.en).toMatch(/^Teynampet is getting worse beyond ordinary ups and downs/);
  });

  it("a monitoring station's readings are not a place where problems keep coming back", async () => {
    clearCaches();
    const o = await planRound(body("எந்த road-ல பிரச்சனை திரும்பத் திரும்ப வந்துகிட்டே இருக்கு?"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", lenses: ["repeat"], about: "places" }) });
    expect(o.result?.stage?.say.en).toMatch(/^Problems keep coming back most at TTK Road in Teynampet/);
    expect(o.result?.stage?.say.en).not.toMatch(/TNPCB/);
  });

  it("'Why did you stop now?' is about Jarvis: its own short line, never a screen of why incidents rose (01:45)", async () => {
    clearCaches();
    const o = await planRound(body("Why did you stop now?"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "meta", reply: "I stopped because I heard something; say continue and I will carry on." }) });
    expect(o.lane).toBe("reader");
    expect(o.result?.kind).toBe("chat");
    expect(o.result?.stage).toBeFalsy();
    expect(o.result?.reply).toMatch(/say continue/);
  });

  it("a word lane that disagrees with the reading is skipped: 'improving' in a news question is not the focus screen", async () => {
    clearCaches();
    const o = await planRound(body("Tell me the news about which areas are improving their roads"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "news" }) });
    expect(o.result?.stage?.recipe ?? null).not.toBe("focus");
  });

  it("garbled speech is asked again, never guessed into a screen", async () => {
    clearCaches();
    const o = await planRound(body("LMI ABOICOL TUNEWS"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "unclear", reply: null }) });
    expect(o.result?.kind).toBe("chat");
    expect(o.result?.reply).toMatch(/say it again/);
    expect(o.result?.stage).toBeFalsy();
  });

  it("a misheard page name goes to the page the reader heard ('டிரஞ்ச் பேஜுக்கு போ' is the trends page, not the drafts tray)", async () => {
    clearCaches();
    const o = await planRound(body("டிரஞ்ச் பேஜுக்கு போ."), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "navigate", page: "trends" }) });
    expect(o.result?.steps).toContainEqual({ a: "page", page: "trends" });
    expect(o.result?.stage).toBeFalsy();
  });

  it("'go to the trends page and tell me where to concentrate' answers and moves the page too", async () => {
    clearCaches();
    const o = await planRound(body("Go to the trends page and tell me where to concentrate"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", lenses: ["attention"], page: "trends" }) });
    expect(o.result?.stage?.recipe).toBe("focus");
    expect(o.result?.steps[0]).toEqual({ a: "page", page: "trends" });
  });

  it("a move read as navigate that also asks something is answered too, with the page step first (the browser drive)", async () => {
    clearCaches();
    const o = await planRound(body("Go to the trends page and tell me which areas are getting worse."), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "navigate", page: "trends" }) });
    expect(o.result?.stage?.recipe).toBe("focus");
    expect(o.result?.steps[0]).toEqual({ a: "page", page: "trends" });
    // the line under the title answers the question asked, not "Concentrate first on ..."
    expect(o.result?.stage?.takeaway?.en).toMatch(/^Getting worse beyond ordinary ups and downs/);
  });

  it("'say it in Tamil' says the open screen again in Tamil", async () => {
    clearCaches();
    const first = await planRound(body("Okay now which area I have to concentrate most?"), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", lenses: ["attention"] }) });
    const doc = first.result!.stage!;
    const stage = { recipe: doc.recipe, title: doc.title, blocks: doc.blocks.map((x) => ({ kind: x.kind, ids: [] })), slots: doc.slots, focus: null };
    const o = await planRound(body("தமிழ்ல சொல்லு", { stage }), REAL, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "repeat", lang_wanted: "ta" }) });
    expect(o.result?.note).toBe("reader:repeat");
    // (the test world has no Tamil zone names: the zone is said by its English name)
    expect(o.result?.stage?.say.ta).toMatch(/^முதல்ல Teynampet-ல கவனம் செலுத்தணும்/);
    expect(o.result?.lang).toBe("ta");
  });

  it("with no reading (the reader timed out), the lanes answer as before", async () => {
    clearCaches();
    const o = await planRound(body("Okay now which area I have to concentrate most?"), REAL, hands(), "t", undefined, undefined, { llm, reader: async () => null });
    expect(o.result?.stage?.recipe).toBe("focus");
    expect(o.lane).toBe("quick");
  });

  it("a zone the sentence names, which the reading left out, is added by code (Velachery is in Adyar)", async () => {
    clearCaches();
    // (a locality the reference gives a zone; Velachery has none there, so the reader's own zone stands for it)
    const W2: World = { ...REAL, places: [{ name: "Thoraipakkam", aliases: [], zone: 14 }, ...REAL.places] };
    const o = await planRound(body("Is flooding getting worse in Thoraipakkam?"), W2, hands(), "t", undefined, undefined, { llm, reader: reader({ ask: "focus", lenses: ["worsening"], cat: "FLOOD_WATERLOGGING" }) });
    expect(o.result?.note).toBe("reader:focus:worsening:1");
    expect(o.result?.stage?.title).toMatch(/^Perungudi/);
    expect(o.result?.stage?.say.en).toMatch(/^Thoraipakkam is in Perungudi zone/);
  });
});

describe("pointedZone: 'that area' is the area the last answer was about", () => {
  it("the open screen's one zone, else the first of a focus screen's list, else the last turn's one zone", () => {
    expect(pointedZone({ recipe: "advise", title: "x", blocks: [], slots: { zones: [13] }, focus: null }, [], REAL)).toBe(13);
    expect(pointedZone({ recipe: "focus", title: "x", blocks: [{ kind: "Brief", ids: [] }, { kind: "Compare", ids: ["Perungudi", "Adyar"] }, { kind: "Ranking", ids: ["Adyar", "Perungudi"] }], slots: { zones: [14, 13] }, focus: null }, [], REAL)).toBe(13);
    expect(pointedZone(null, [{ slots: { zones: [5] } }], REAL)).toBe(5);
    expect(pointedZone(null, [{ slots: { zones: [5, 6] } }], REAL)).toBeNull();
  });
});

describe("the browser's instant moves: a sentence that also asks something goes to the server (the browser drive, 22 Nov)", () => {
  const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as never;
  const lane = (said: string) => browserLaneV8(said, { stage: null, news: { items: [] }, state, world: REAL, listenLang: "en", heardLang: "en", v7: true }).lane;
  it("'Go to the trends page and tell me which areas are getting worse' is not just a page move", () => {
    expect(asksBeyondMove("Go to the trends page and tell me which areas are getting worse.")).toBe(true);
    expect(lane("Go to the trends page and tell me which areas are getting worse.")).toBe("server");
    expect(lane("go to environment and tell me the vegetable prices")).toBe("server");
  });
  it("a plain page move stays instant", () => {
    expect(asksBeyondMove("Go to the trends page.")).toBe(false);
    expect(lane("Go to the trends page.")).toBe("rules");
  });
});

describe("keep-warm ticks wait for a real pause in the conversation", () => {
  it("a question being answered, or one that ended under 20 s ago, is no pause", async () => {
    const done = busy();
    expect(quietFor(0)).toBe(false);
    done();
    expect(quietFor(TICK_QUIET_MS)).toBe(false);
    expect(quietFor(0)).toBe(true);
    expect(await untilQuietFor(TICK_QUIET_MS, 300, 50)).toBe(false);
  });
});

describe("firstCaseOf: the first case a 'what needs you first' screen names", () => {
  it("its first point's incident, else the first case listed", () => {
    const doc = { blocks: [{ kind: "Brief", id: "advise", title: "x", points: [{ text: "a", incidentId: null }, { text: "b", incidentId: "INC-7" }] }] } as unknown as StageDocT;
    expect(firstCaseOf(doc)).toBe("INC-7");
    const doc2 = { blocks: [{ kind: "CaseList", id: "open", title: "x", source: "list", sev: null, total: 1, rows: [{ id: "INC-9" }] }] } as unknown as StageDocT;
    expect(firstCaseOf(doc2)).toBe("INC-9");
  });
});
