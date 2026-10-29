/** Thunai's Stage: the catalog's checks, the insight rules, the local commands, the spoken briefing and the exports. */
import { describe, expect, it } from "vitest";
import { aggregate, change, largestGaps, median, peak, rank, share, spoken, unusualPoints, vsMedian } from "./insight";
import { buildScreen, caseRow, emptySlots, metres, safeText } from "./screens";
import { checkStage, figuresOf, figuresOk, stageContext, type StageDocT } from "./stage";
import { ackFor, caseBrief, caseIds, filterStage, localStageCommand, narrationOf, sortStage, toCsv } from "./stagelocal";
import { WORLD } from "./fixture";
import { fakeHands } from "./stagefake";

const SCOPE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const severe = async () => (await buildScreen("cases", { ...emptySlots(), sev: "Severe" }, SCOPE, WORLD, fakeHands(), "severe cases", "st-1")).doc;

describe("the catalog", () => {
  it("accepts what the builders make and refuses anything else", async () => {
    expect(checkStage(await severe()).ok).toBe(true);
    expect(checkStage({ v: 1, id: "x", recipe: "cases", title: "t", takeaway: null, say: { en: "", ta: "" }, blocks: [{ kind: "Script", id: "s", code: "alert(1)" }],
      scope: SCOPE, slots: {}, sources: [], asOf: null, notes: [] }).ok).toBe(false);
    expect(checkStage({ v: 1, id: "x", recipe: "cases", title: "t", takeaway: null, say: { en: "", ta: "" }, blocks: [], scope: SCOPE, slots: {}, sources: [], asOf: null, notes: [] }).ok).toBe(false);
  });
  it("every builder's document passes the catalog, and its spoken line uses only figures on it", async () => {
    const recipes = [["cases", { sev: "Severe" }], ["news", {}], ["readings", { metric: "lakes" }], ["ranking", { measure: "rain", n: 3 }], ["compare", { zones: [13, 7] }],
      ["trend", { cat: "VECTOR_DISEASE" }], ["why", { zones: [14] }], ["performance", { by: "dept" }], ["performance", { by: "zone" }], ["dashboard", { cat: "FLOOD_WATERLOGGING" }],
      ["map", { what: "hotspots" }], ["nearby", { q: "schools within 1 km of flooding" }], ["brief", {}], ["drafts", {}], ["case", { id: "INC-A3" }]] as const;
    for (const [recipe, slots] of recipes) {
      const { doc } = await buildScreen(recipe, { ...emptySlots(), ...slots } as never, SCOPE, WORLD, fakeHands(), recipe);
      const c = checkStage(doc);
      expect(c.ok, `${recipe}: ${c.ok ? "" : c.why}`).toBe(true);
      for (const lang of ["en", "ta"] as const) expect(figuresOk(doc.say[lang], figuresOf(doc)), `${recipe} ${lang}: ${doc.say[lang]}`).toBe(true);
    }
  });
  it("a tool failure becomes a note on the screen, not a crash", async () => {
    const { doc } = await buildScreen("why", { ...emptySlots(), zones: [14] }, SCOPE, WORLD, fakeHands({ change_drivers: () => { throw new Error("store offline"); } }), "why");
    expect(doc.blocks[0]).toMatchObject({ kind: "Note" });
    expect(doc.say.en).toMatch(/could not get/);
  });
  it("the spoken-figure check: figures from the screen pass, invented ones fail, the Collector's own pass", () => {
    const d = { blocks: [{ kind: "Kpis", id: "k", title: "", items: [{ key: "a", label: "x", value: 40.24, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }] }] } as unknown as StageDocT;
    const f = figuresOf(d);
    expect(figuresOk("40 cases", f)).toBe(true);
    expect(figuresOk("40.2 mm", f)).toBe(true);
    expect(figuresOk("41 cases", f)).toBe(false);
    expect(figuresOk("the 6 severe cases", f, "show me the 6 severe cases")).toBe(true);
    expect(figuresOk("1,234 incidents", figuresOf({ blocks: [{ kind: "Kpis", items: [{ value: 1234 }] }] } as unknown as StageDocT))).toBe(true);
  });
  it("the open Stage goes back to the agent as kinds and ids only", async () => {
    const ctx = stageContext(await severe(), 2);
    expect(ctx.blocks.find((b) => b.kind === "CaseList")).toEqual({ kind: "CaseList", ids: ["INC-A1", "INC-A2", "INC-A3", "INC-A4", "INC-A5", "INC-A6"] });
    expect(JSON.stringify(ctx)).not.toMatch(/Chetpet|Respected/);
  });
});

describe("insight rules", () => {
  it("rank, median, change, share, peak", () => {
    expect(rank([{ v: 3 }, { v: 9 }, { v: 9 }, { v: null }], (x) => x.v, 2).map((r) => [r.value, r.rank])).toEqual([[9, 1], [9, 2]]);
    expect(rank([{ v: 3 }, { v: 9 }], (x) => x.v, 1, "bottom")[0].value).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(vsMedian(10, [2, 5, 10])).toEqual({ median: 5, ratio: 2 });
    expect(change(59, 40)).toEqual({ delta: 19, pct: 48 });
    expect(change(5, 0)).toEqual({ delta: 5, pct: null });
    expect(change(5, null)).toEqual({ delta: null, pct: null });
    expect(share(25, 100)).toBe(25);
    expect(peak([1, 7, 7, 2])).toEqual({ i: 1, value: 7 });
    expect(spoken(40.24)).toBe("40.2");
  });
  it("largest gaps: by ratio, then size; ties dropped", () => {
    const g = largestGaps([{ label: "A", values: { severe: 8, open: 100, flat: 3 } }, { label: "B", values: { severe: 2, open: 90, flat: 3 } }], ["severe", "open", "flat"]);
    expect(g.map((x) => x.metric)).toEqual(["severe", "open"]);
    expect(g[0]).toMatchObject({ hi: "A", lo: "B", ratio: 4, gap: 6 });
  });
  it("unusual points: above the usual band, or 2 standard deviations without one", () => {
    expect(unusualPoints([5, 20, 9], { lo: 4, hi: 18 })).toEqual([1]);
    expect(unusualPoints([1, 1, 1, 1, 1, 1, 1, 30])).toEqual([7]);
    expect(unusualPoints([1, 2, 3])).toEqual([]);
  });
  it("aggregation says its method by its name", () => {
    expect(aggregate([{ z: 1, v: 2 }, { z: 1, v: 6 }, { z: 2, v: 1 }], (x) => x.z, (x) => x.v, "max")).toEqual([{ key: 1, value: 6, n: 2 }, { key: 2, value: 1, n: 1 }]);
    expect(aggregate([{ z: 1, v: 2 }, { z: 1, v: 6 }], (x) => x.z, (x) => x.v, "mean")[0].value).toBe(4);
  });
  it("distance", () => {
    expect(metres({ lat: 13, lon: 80.2 }, { lat: 13.009, lon: 80.2 })).toBeGreaterThan(990);
    expect(metres({ lat: 13, lon: 80.2 }, { lat: 13.009, lon: 80.2 })).toBeLessThan(1010);
  });
});

describe("what Thunai shows and says about a case", () => {
  it("no phone numbers, e-mail or letter openings", () => {
    expect(safeText("Respected sir, water stagnation near 4th street, call 98765 43210 or a.b@x.com", 200)).toBe("water stagnation near 4th street, call or");
    expect(caseRow({ id: "INC-1", title: "Dear Sir: pothole", sev: "High" }, WORLD).title).toBe("pothole");
  });
  it("briefs a case like an aide: where, what, how long, deadline, who; never its id", async () => {
    const d = await severe();
    const b = narrationOf(d, "en");
    expect(b[0].text).toBe("First, in Royapuram: Wall collapse at Chetpet. Open 23 hours and past its deadline. PWD Water Resources has it.");
    expect(b.map((x) => x.text).join(" ")).not.toMatch(/INC-|Respected|9876/);
    expect(caseBrief(caseRow({ id: "INC-9", title: "Tree fall", zone_name: "Adyar", t: "2026-10-27 07:00:00", complaints: 3 }, WORLD), 1, "2026-10-29 07:00:00", "en"))
      .toBe("Second, in Adyar: Tree fall. Open 2 days. 3 citizens have complained.");
    expect(narrationOf(d, "ta")[0].text).toMatch(/^முதலாவது, Royapuram: Wall collapse at Chetpet/);
  });
  it("news is read with a lead-in, and the highlight knows where the headline starts", async () => {
    const { doc } = await buildScreen("news", emptySlots(), SCOPE, WORLD, fakeHands(), "news");
    const n = narrationOf(doc, "en");
    expect(n[0].text).toBe(`${n[0].lead}Velachery lake overflows after night rain, flooding on 100 Feet Road.`);
    expect(n[0].lead).toBe("First, from The Hindu: ");
    expect(n[2].lead).toMatch(/^And finally/);
  });
});

describe("local Stage commands (no model)", () => {
  it("understands the instant commands in English, Tamil and Tanglish", () => {
    const c = (t: string) => localStageCommand(t);
    expect(c("next")).toEqual({ op: "next" });
    expect(c("அடுத்தது")).toEqual({ op: "next" });
    expect(c("stop")).toEqual({ op: "stop" });
    expect(c("niruthu")).toEqual({ op: "stop" });
    expect(c("read them")).toEqual({ op: "read" });
    expect(c("only the ones in Adyar")).toEqual({ op: "filter", text: "adyar" });
    expect(c("Adyar mattum")).toEqual({ op: "filter", text: "adyar" });
    expect(c("sort by complaints")).toEqual({ op: "sort", by: "complaints" });
    expect(c("show it as a table")).toEqual({ op: "view", view: "table" });
    expect(c("switch to map")).toEqual({ op: "view", view: "map" });
    expect(c("table-aa kaattu")).toEqual({ op: "view", view: "table" });
    expect(c("open 3")).toEqual({ op: "open", n: 3 });
    expect(c("open the third one")).toEqual({ op: "open", n: 3 });
    expect(c("draft action for 2")).toEqual({ op: "draft", n: 2, first: false });
    expect(c("draft for the first three")).toEqual({ op: "draft", n: 3, first: true });
    expect(c("pin this")).toEqual({ op: "pin" });
    expect(c("export this")).toEqual({ op: "export", what: null });
    expect(c("export as csv")).toEqual({ op: "export", what: "csv" });
    expect(c("close")).toEqual({ op: "close" });
    expect(c("மூணாவது கேஸைத் திறந்து காட்டு")).toEqual({ op: "open", n: 3 });
    expect(c("complaints vechu sort pannu")).toEqual({ op: "sort", by: "complaints" });
    expect(c("இதை எக்ஸ்போர்ட் பண்ணு")).toEqual({ op: "export", what: null });
    expect(c("open the news panel")).toBeNull();
  });
  it("leaves real requests to the agent", () => {
    for (const t of ["only severe", "add Perungudi", "make it monthly", "compare Adyar and Ambattur", "why is it so high", "show me the severe cases", "now show last year"])
      expect(localStageCommand(t), t).toBeNull();
  });
  it("filters and sorts what is shown, and says how many were kept", async () => {
    const d = await severe();
    const f = filterStage(d, "Adyar");
    expect(f.kept).toBe(2);
    expect(f.of).toBe(6);
    expect(caseIds(f.doc)).toEqual(["INC-A4", "INC-A5"]);
    expect(caseIds(sortStage(d, "complaints"))[0]).toBe("INC-A4");
  });
  it("CSV keeps the numbers as shown and defuses spreadsheet formulas", async () => {
    const d = await severe();
    const csv = toCsv({ ...d, title: "=HYPERLINK(1)" });
    expect(csv).toMatch(/INC-A1/);
    const evil = toCsv({ ...d, blocks: [{ kind: "Ranking", id: "r", title: "x", unit: null, method: "m", order: "top", items: [{ key: "a", label: "=cmd|' /C calc'!A0", value: 1, rank: 1, sub: null, zone: null, lat: null, lon: null, action: "none" }] }] });
    expect(evil).toMatch(/'=cmd/);
  });
  it("acknowledges at once, without a figure", () => {
    expect(ackFor("show me the 6 severe cases", "en")).toBe("Checking the severe cases.");
    expect(ackFor("இன்றைய செய்திகளைப் படி", "ta")).toMatch(/செய்தி/);
    expect(ackFor("anything", "en")).not.toMatch(/\d/);
  });
});

describe("what Thunai suggests next", () => {
  it("anticipates from what the screen shows: drafts for the late cases, a map, the slow departments", async () => {
    const d = await severe();
    expect(d.next!.map((x) => x.label.en)).toEqual(["Draft for the 2 past deadline", "Show them on a map", "Which department is slowest?"]);
    expect(d.next![0]).toMatchObject({ kind: "draft", ids: ["INC-A1", "INC-A3"] });
  });
  it("a comparison suggests asking why the higher area is higher", async () => {
    const { doc } = await buildScreen("compare", { ...emptySlots(), zones: [13, 7], period: "weekly" }, SCOPE, WORLD, fakeHands(), "compare");
    expect(doc.next![0]).toMatchObject({ kind: "direct", recipe: "why", slots: { zones: [13] } });
  });
});

describe("review fixes: local commands", () => {
  it("'show' is not 'open', zones are not items, the map pattern wins", () => {
    for (const t of ["show zone 7", "show me 3 severe cases", "show top 5", "மண்டலம் 3 திற"]) expect(localStageCommand(t), t).toBeNull();
    expect(localStageCommand("show 2 on the map")).toEqual({ op: "map", n: 2 });
    expect(localStageCommand("கடுமையான சம்பவங்கள் மட்டும்")).toBeNull();
  });
});

describe("long real-world values stay within the catalog", () => {
  it("a very long news link is kept (or dropped), never breaks the screen", async () => {
    const long = `https://example.org/${"a".repeat(900)}`;
    const hands = fakeHands();
    const news = hands.news;
    hands.news = async (s) => { const r = await news(s); return { ...r, rows: r.rows.map((x) => ({ ...x, url: long })) }; };
    const { doc } = await buildScreen("news", emptySlots(), SCOPE, WORLD, hands, "news");
    expect(checkStage(doc).ok).toBe(true);
  });
});

describe("news is district-wide unless asked otherwise", () => {
  it("ignores a category the console still has on", async () => {
    let seen: unknown = null;
    const hands = fakeHands();
    const news = hands.news;
    hands.news = async (s) => { seen = s; return news(s); };
    await buildScreen("news", emptySlots(), { ...SCOPE, cat: "FLOOD_WATERLOGGING", zone: 7 }, WORLD, hands, "news");
    expect(seen).toMatchObject({ cat: null, zone: null });
  });
});

describe("filters left on the console", () => {
  it("an empty list says which filters emptied it and offers the whole district", async () => {
    const hands = fakeHands();
    hands.severe = async () => ({ rows: [], counts: { Severe: 0 }, asOf: "2026-10-29 07:00:00" });
    const { doc } = await buildScreen("cases", { ...emptySlots(), sev: "Severe" }, { ...SCOPE, cat: "FLOOD_WATERLOGGING" }, WORLD, hands, "severe cases");
    expect(doc.say.en).toMatch(/console's filters \(Flooding & waterlogging/);
    expect(doc.next![0]).toMatchObject({ kind: "direct", recipe: "cases", slots: { fresh: true, cat: null } });
    expect(localStageCommand("all of Chennai")).toEqual({ op: "everywhere" });
  });
  it("a fresh screen ignores the console's filters", async () => {
    let seen: unknown = null;
    const hands = fakeHands();
    const sev = hands.severe;
    hands.severe = async (s) => { seen = s; return sev(s); };
    await buildScreen("cases", { ...emptySlots(), sev: "Severe", fresh: true }, { ...SCOPE, cat: "FLOOD_WATERLOGGING", zone: 7 }, WORLD, hands, "x");
    expect(seen).toMatchObject({ cat: null, zone: null });
  });
});

describe("a request that names its own place starts clean", () => {
  it("'why is Perungudi so bad' is not narrowed by a category left on the console", async () => {
    const { doc } = await buildScreen("why", { ...emptySlots(), zones: [14] }, { ...SCOPE, cat: "VECTOR_DISEASE" }, WORLD, fakeHands(), "why");
    expect(doc.scope).toMatchObject({ zone: 14, cat: null });
  });
  it("one that names nothing keeps the console's filters", async () => {
    const { doc } = await buildScreen("cases", { ...emptySlots(), sev: "Severe" }, { ...SCOPE, zone: 7 }, WORLD, fakeHands(), "severe");
    expect(doc.scope.zone).toBe(7);
  });
});
