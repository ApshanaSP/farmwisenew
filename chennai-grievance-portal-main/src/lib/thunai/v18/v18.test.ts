/**
 * v18 (24 Nov): any window for every question, a summary of everything about one subject, and a way into every insight. The owner's own
 * sentences of 24 Nov: "summary of Anna Nagar", "summary of crimes", "last 2 days", "last 48 hours", "last 4 days", a particular date.
 */
import { describe, expect, it } from "vitest";
import { WORLD, START } from "../fixture";
import { buildScreen, emptySlots, type Hands, type Slots } from "../screens";
import { checkScreen } from "../agent";
import { checkStage, figuresOf, figuresOk, type StageDocT } from "../stage";
import { fakeHands } from "../stagefake";
import { agoSpec, beforeRecords, dateWords, daySpec, hoursSpec, isToday, readerSpec, turnWhen, windowOf, windowOnly } from "./when";
import { TOPICS, topicCats, topicOf } from "./topics";
import { namedIn, withDrills } from "./drills";
import { wholeDays } from "../recipes/window18";
import type { WinHands, WinIncidents } from "./window";
import type { ScopeT } from "../stage";

const NOW = "2026-11-24 15:05:00";

describe("any window the Collector names", () => {
  it("reads counts back from now, in hours or days", () => {
    expect(turnWhen("summary of Anna Nagar for the last 2 days", null, NOW)).toEqual({ kind: "hours", hours: 48, n: 2, unit: "day" });
    expect(turnWhen("what happened in the last 48 hours", null, NOW)).toMatchObject({ kind: "hours", hours: 48 });
    expect(turnWhen("crimes in the last 4 days", null, NOW)).toMatchObject({ kind: "hours", hours: 96 });
    expect(turnWhen("கடந்த 3 நாட்களில் அண்ணா நகர்ல என்ன நடந்தது", null, NOW)).toMatchObject({ kind: "hours", hours: 72 });
  });
  it("reads a particular date, a range of dates and days ago", () => {
    expect(turnWhen("what happened in Adyar on 20 November", null, NOW)).toEqual({ kind: "days", from: { day: 20, month: 10, year: null }, to: { day: 20, month: 10, year: null } });
    expect(turnWhen("cases between 15 Nov and 20 Nov", null, NOW)).toMatchObject({ kind: "days", from: { day: 15, month: 10 }, to: { day: 20, month: 10 } });
    expect(turnWhen("severe cases from two days ago", null, NOW)).toEqual({ kind: "days", from: { day: 22, month: 10, year: 2026 }, to: { day: 22, month: 10, year: 2026 } });
    expect(agoSpec("rendu naal munnadi enna nadandhuchu", NOW)).toMatchObject({ kind: "days", from: { day: 22 } });
    expect(agoSpec("இரண்டு நாட்களுக்கு முன் என்ன நடந்தது", NOW)).toMatchObject({ kind: "days", from: { day: 22 } });
    expect(turnWhen("yesterday's incidents", null, NOW)).toEqual({ kind: "day", back: 1 });
  });
  it("leaves the console's own four windows, 'now' and comparisons to the period and the lanes", () => {
    expect(turnWhen("this week in Adyar", null, NOW)).toBeNull();
    expect(turnWhen("what is open now", null, NOW)).toBeNull();
    expect(turnWhen("is garbage up or down from last month", null, NOW)).toBeNull();
    expect(turnWhen("summary of Anna Nagar", null, NOW)).toBeNull();
  });
  it("takes what code cannot read from the reader, checked against today", () => {
    // "last weekend", "on the 20th": the reader's own dates
    expect(turnWhen("how was last weekend", { said: "last weekend", from: "2026-11-21", to: "2026-11-22", hours: null }, NOW))
      .toEqual({ kind: "days", from: { day: 21, month: 10, year: 2026 }, to: { day: 22, month: 10, year: 2026 } });
    expect(turnWhen("and Adyar?", { said: "last 2 days", from: null, to: null, hours: 48 }, NOW)).toMatchObject({ kind: "hours", hours: 48 });
    // the future is today at most; wholly in the future, none; the order is mended
    expect(readerSpec({ said: null, from: "2026-11-30", to: "2026-12-02", hours: null }, NOW)).toBeNull();
    expect(readerSpec({ said: null, from: "2026-11-23", to: "2026-11-29", hours: null }, NOW)).toEqual({ kind: "days", from: { day: 23, month: 10, year: 2026 }, to: { day: 24, month: 10, year: 2026 } });
    expect(readerSpec({ said: null, from: "2026-11-20", to: "2026-11-18", hours: null }, NOW)).toMatchObject({ from: { day: 18 }, to: { day: 20 } });
    expect(readerSpec({ said: null, from: "2026-02-31", to: null, hours: null }, NOW)).toBeNull();
    expect(readerSpec({ said: null, from: null, to: null, hours: 168 }, NOW)).toEqual({ kind: "window", key: "weekly" });
    expect(hoursSpec(6)).toEqual({ kind: "hours", hours: 6, n: 6, unit: "hour" });
  });
  it("puts exact bounds on a window, and the window of the same length before it", () => {
    const w = windowOf({ kind: "hours", hours: 48, n: 2, unit: "day" }, "weekly", NOW);
    expect(w).toMatchObject({ from: "2026-11-22 15:05:00", hours: 48, custom: true, key: "weekly" });
    expect(w.prev).toMatchObject({ from: "2026-11-20 15:05:00", to: "2026-11-22 15:05:00" });
    const d = windowOf({ kind: "days", from: { day: 20, month: 10, year: 2026 }, to: { day: 20, month: 10, year: 2026 } }, "weekly", NOW);
    expect(d).toMatchObject({ from: "2026-11-20 00:00:00", to: "2026-11-21 00:00:00", hours: 24, partial: false });
    expect(d.label.en).toBe("20 Nov");
    expect(d.prev.label.en).toBe("the day before (19 Nov)");
    expect(windowOf(null, "monthly", NOW)).toMatchObject({ hours: 720, custom: false });
    expect(isToday({ kind: "day", back: 0 })).toBe(true);
    expect(daySpec("2026-11-21")).toEqual({ kind: "days", from: { day: 21, month: 10, year: 2026 }, to: { day: 21, month: 10, year: 2026 } });
  });
});

describe("groups of kinds", () => {
  it("counts every crime together, never one kind for all", () => {
    expect(topicCats("CRIME")).toEqual(["CRIME_VIOLENT", "CRIME_PROPERTY", "CRIMES_AGAINST_WOMEN", "DRUGS_LIQUOR", "MISSING_PERSON", "SUICIDE_SELF_HARM"]);
    expect(topicCats("CRIME", WORLD.cats)).toEqual(["CRIME_PROPERTY"]);
    expect(topicOf("FLOOD_RELIEF")).toBe("FLOOD");
    expect(Object.keys(TOPICS)).toContain("ROADS_TRAFFIC");
  });
});

// ------------------------------------------------------------------ the summary, with stand-in window reads --

const INC: WinIncidents = {
  n: 34, prev: 28, severe: 5, prevSevere: 3, open: 20, overdue: 6, resolved: 9, dead: 1, injured: 2, complaints: 41, rain: 0,
  kinds: [{ cat: "SOLID_WASTE", label: "Garbage & solid waste", n: 12, prev: 10, severe: 0, open: 8 }, { cat: "STREETLIGHT_ELECTRICAL", label: "Street lights & electrical hazards", n: 6, prev: 1, severe: 0, open: 4 },
    { cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 5, prev: 0, severe: 2, open: 3 }],
  zones: [{ zone: 8, name: "Anna Nagar", n: 34, prev: 28, severe: 5, open: 20, overdue: 6 }],
  depts: [{ code: "GCC-SWM", name: "Solid Waste Management", n: 12, open: 8, overdue: 4, severe: 0 }, { code: "GCC-ELE", name: "GCC Electrical", n: 6, open: 4, overdue: 2, severe: 0 }],
  places: [{ place: "Shanthi Colony", zone: 8, n: 5, open: 2, severe: 1 }, { place: "Thirumangalam", zone: 8, n: 3, open: 1, severe: 0 }],
  buckets: [{ at: "2026-11-22 16:00", n: 3, severe: 0 }, { at: "2026-11-23 09:00", n: 20, severe: 3 }, { at: "2026-11-24 10:00", n: 11, severe: 2 }], byHour: true,
  top: [{ id: "INC-A1", title: "Waterlogging on 2nd Avenue", sev: "Severe", status: "Open", zone: 8, zone_name: "Anna Nagar", loc: "2nd Avenue, Anna Nagar", dept: "GCC-SWD", dept_name: "Storm Water Drain", complaints: 4, t: "2026-11-23 09:10:00", open: true, overdue: true, lat: 13.08, lon: 80.21 }],
  points: [{ id: "INC-A1", lat: 13.08, lon: 80.21, sev: "Severe", title: "Waterlogging on 2nd Avenue" }]
};
function winFake(over: Partial<WinHands> = {}): WinHands & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    now: async () => NOW,
    incidents: async (w, s) => { asked.push({ w, s }); return INC; },
    news: async () => ({ rows: [{ id: "D1", title: "Anna Nagar residents protest garbage pile-up", title_en: null, publisher: "The Hindu", url: "https://example.org/a", loc: "Anna Nagar", t: "2026-11-23 10:00", summary: "Residents of Anna Nagar..." }], total: 3 }),
    readings: async (m) => ({ rows: m === "aqi" ? [{ id: "CPCB-1", name: "Arumbakkam, Chennai - TNPCB", zone: 8, lat: 13.07, lon: 80.21, avg: 85, max: 120, min: 40, first: 60, last: 40, lastAt: "2026-11-24 12:00", count: 3, inWindow: true }] : [], nearest: null }),
    warning: async () => null,
    prices: async () => ({ market: "Anna Nagar", rows: [{ commodity: "Tomato", perKg: 28, firstPerKg: 32, lo: 25, hi: 30, markets: 1, date: "2026-11-22", firstDate: "2026-11-21" }], latest: "2026-11-22", inWindow: true, held: { from: "2026-09-15", to: "2026-11-22" }, fetched: false, keyed: false }),
    traffic: async () => null,
    ...over
  };
}
const BASE: ScopeT = { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null };
const slotsOf = (o: Partial<Slots>): Slots => ({ ...emptySlots(), ...o });
const hands = (win: WinHands, extra: Partial<Hands> = {}): Hands => ({ ...fakeHands(), win, ...extra });

describe("summary of an area", () => {
  it("takes out everything for Anna Nagar over the last 2 days: incidents, kinds, days, localities, departments, cases, map, news, air, prices", async () => {
    const win = winFake();
    const { doc } = await buildScreen("summary", slotsOf({ zones: [8], span: { kind: "hours", hours: 48, n: 2, unit: "day" } }), BASE, WORLD, hands(win), "summary of Anna Nagar for the last 2 days", "t1", "en");
    expect(checkStage(doc).ok).toBe(true);
    const kinds = doc.blocks.map((b) => `${b.kind}:${b.id}`);
    expect(kinds).toEqual(["Kpis:kpis", "Brief:points", "Chart:kinds", "Trend:days", "Ranking:places", "Ranking:depts", "CaseList:top", "MapView:map", "NewsReader:news", "Readings:aqi", "Answer:prices"]);
    expect(doc.title).toBe("Summary · Anna Nagar · last 2 days");
    expect(doc.when).toMatchObject({ en: "last 2 days", from: "2026-11-22 15:05:00" });
    // the window asked, counted for the zone
    expect(win.asked[0]).toMatchObject({ w: { hours: 48, custom: true }, s: { zone: 8 } });
    // every figure said is on the screen
    expect(figuresOk(doc.say.en, figuresOf(doc))).toBe(true);
    expect(doc.say.en).toMatch(/^In Anna Nagar, 34 incidents came in over the last 2 days \(since 22 Nov, 3:05 PM\), against 28 in the 2 days before\./);
  });
  it("leads every tile, point, bar, day, locality and department to its records, in the same window", async () => {
    const { doc } = await buildScreen("summary", slotsOf({ zones: [8], span: { kind: "hours", hours: 48, n: 2, unit: "day" } }), BASE, WORLD, hands(winFake()), "summary of Anna Nagar", "t2", "en");
    const kpis = doc.blocks.find((b) => b.kind === "Kpis")!;
    // (round 2's review: deaths, injured and complaints have no list that holds exactly what they count: no drill on them)
    expect(kpis.kind === "Kpis" && kpis.items.every((k) => (["dead", "injured", "complaints"].includes(k.key) ? !k.drill : k.drill?.recipe === "summary"))).toBe(true);
    expect(kpis.kind === "Kpis" && kpis.items.find((k) => k.key === "severe")?.drill?.slots).toMatchObject({ zones: [8], sev: "Severe", view: "cases", span: { kind: "hours", hours: 48 } });
    const chart = doc.blocks.find((b) => b.kind === "Chart");
    expect(chart?.kind === "Chart" && chart.drills?.[0]?.slots).toMatchObject({ cat: "SOLID_WASTE", zones: [8] });
    const trend = doc.blocks.find((b) => b.kind === "Trend");
    expect(trend?.kind === "Trend" && trend.drills?.[1]?.slots).toMatchObject({ span: { kind: "days", from: { day: 23, month: 10, year: 2026 } } });
    const brief = doc.blocks.find((b) => b.kind === "Brief");
    expect(brief?.kind === "Brief" && brief.points.filter((p) => p.drill || p.incidentId).length).toBeGreaterThanOrEqual(5);
    // a drill's slots pass the checker as they are (it keeps the place, the group, the list view)
    const sc = checkScreen({ recipe: "summary", ...(kpis.kind === "Kpis" ? kpis.items[1].drill!.slots : {}) }, WORLD, null);
    expect(sc?.slots).toMatchObject({ zones: [8], sev: "Severe", view: "cases" });
  });
  it("opens the records behind a tile: the list, then the map", async () => {
    const { doc } = await buildScreen("summary", slotsOf({ zones: [8], sev: "Severe", view: "cases" }), BASE, WORLD, hands(winFake()), "Severe incidents", "t3", "en");
    expect(doc.blocks.map((b) => b.kind)).toEqual(["Kpis", "CaseList", "MapView"]);
    expect(doc.say.en).toMatch(/^In Anna Nagar, 34 severe incidents over the last 7 days\. The most urgent is Waterlogging on 2nd Avenue/);
  });
  it("says so when the window reads are not there", async () => {
    const { doc } = await buildScreen("summary", slotsOf({ zones: [8] }), BASE, WORLD, fakeHands(), "summary of Anna Nagar", "t4", "en");
    expect(doc.blocks[0]).toMatchObject({ kind: "Note", id: "nowin" });
  });
});

describe("summary of a department and of a group of kinds", () => {
  it("counts every crime kind together for 'summary of crimes', with no prices and no air", async () => {
    const win = winFake();
    const { doc } = await buildScreen("summary", slotsOf({ family: "CRIME" }), BASE, WORLD, hands(win), "summary of crimes", "t5", "en");
    expect(win.asked[0]).toMatchObject({ s: { cats: ["CRIME_PROPERTY"] } });
    expect(doc.title).toBe("Summary · Crime · last 7 days");
    expect(doc.say.en).toMatch(/^Across the district, 34 crime incidents came in over the last 7 days/);
    expect(doc.blocks.some((b) => b.id === "prices" || b.id === "aqi")).toBe(false);
  });
  it("reads one department's incidents for 'summary of the police'", async () => {
    const win = winFake();
    const { doc } = await buildScreen("summary", slotsOf({ dept: "POL-GCP" }), BASE, WORLD, hands(win), "summary of the police department", "t6", "ta");
    expect(win.asked[0]).toMatchObject({ s: { dept: "POL-GCP" } });
    expect(doc.lang).toBe("ta");
    expect(doc.blocks.some((b) => b.id === "depts")).toBe(false);
  });
});

describe("every screen honours the window", () => {
  it("hands a screen that knows only the four windows to the summary over the window named", async () => {
    const { doc } = await buildScreen("why", slotsOf({ zones: [13], span: { kind: "hours", hours: 96, n: 4, unit: "day" } }), BASE, WORLD, hands(winFake()), "why is Adyar bad in the last 4 days", "t7", "en");
    expect(doc.recipe).toBe("summary");
    expect(doc.when?.en).toBe("last 4 days");
  });
  it("keeps 'today' on the console's own screens", async () => {
    const { doc } = await buildScreen("advise", slotsOf({ span: { kind: "day", back: 0 } }), BASE, WORLD, hands(winFake()), "what are my tasks today", "t8", "en");
    expect(doc.recipe).toBe("advise");
  });
  it("counts the turn's window on any screen the turn builds, and a Stage click's own window wins over nothing", async () => {
    const h = hands(winFake(), { turnSpan: { kind: "days", from: { day: 20, month: 10, year: 2026 }, to: { day: 20, month: 10, year: 2026 } } });
    const { doc } = await buildScreen("news", slotsOf({ zones: [8] }), BASE, WORLD, h, "news in Anna Nagar on 20 November", "t9", "en");
    expect(doc.title).toBe("News · Anna Nagar · 20 Nov");
    expect(doc.when).toMatchObject({ from: "2026-11-20 00:00:00", to: "2026-11-21 00:00:00" });
  });
  it("compares two areas over the window", async () => {
    const { doc } = await buildScreen("compare", slotsOf({ zones: [13, 8], span: { kind: "hours", hours: 96, n: 4, unit: "day" } }), BASE, WORLD, hands(winFake()), "compare Adyar and Anna Nagar last 4 days", "t10", "en");
    expect(doc.blocks[0].kind).toBe("Compare");
    expect(doc.say.en).toMatch(/^Over the last 4 days, Adyar had 34/);
  });
  it("lists a group of kinds as the summary's list view", async () => {
    const { doc } = await buildScreen("cases", slotsOf({ family: "CRIME" }), BASE, WORLD, hands(winFake()), "show crime cases", "t11", "en");
    expect(doc.recipe).toBe("summary");
    expect((doc.slots as Record<string, unknown>).view).toBe("cases");
  });
});

describe("a way into every insight on the older screens", () => {
  const doc = (blocks: StageDocT["blocks"], slots: Record<string, unknown> = {}): StageDocT => ({ v: 1, id: "x", recipe: "focus", title: "t", takeaway: null, say: { en: "", ta: "" }, blocks,
    scope: { period: "monthly", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots, sources: [], asOf: null, notes: [] });
  it("gives zones, kinds, tiles and days their records", () => {
    const d = withDrills(doc([
      { kind: "Kpis", id: "k", title: "Key", items: [{ key: "severe", label: "Severe", value: 3, unit: null, prev: null, delta: null, tone: "bad", spark: [] }] },
      { kind: "Ranking", id: "r", title: "Zones", unit: "incidents", method: "m", order: "top", items: [{ key: "z13", label: "Adyar", value: 4, rank: 1, sub: null, zone: 13, lat: null, lon: null, action: "zone" }] },
      { kind: "Chart", id: "c", title: "Kinds", chart: "hbar", unit: "incidents", labels: ["Garbage & solid waste", "Unknown thing"], values: [3, 1] },
      { kind: "Trend", id: "t", title: "Days", unit: "incidents", labels: ["21 Oct", "22 Oct"], values: [1, 2], marks: [], normal: null },
      { kind: "Brief", id: "b", title: "Points", points: [{ text: "Adyar leads with flooding", incidentId: null }] }
    ]), WORLD);
    const [k, r, c, t, b] = d.blocks;
    expect(k.kind === "Kpis" && k.items[0].drill?.slots).toMatchObject({ sev: "Severe", view: "cases", period: "monthly" });
    expect(r.kind === "Ranking" && r.items[0].drill?.slots).toMatchObject({ zones: [13] });
    expect(c.kind === "Chart" && c.drills?.map((x) => x?.slots.cat ?? null)).toEqual(["SOLID_WASTE", null]);
    // (round 2's review: the older screens' trend points are rolling slices, not calendar days: no day drill on them)
    expect(t.kind === "Trend" && t.drills).toBeFalsy();
    expect(b.kind === "Brief" && b.points[0].drill?.slots).toMatchObject({ zones: [13] });
    expect(checkStage(d).ok).toBe(true);
  });
  it("never opens a list whose total is not the number clicked (round 2's review)", () => {
    const d = withDrills(doc([
      { kind: "Kpis", id: "k", title: "Key", items: [
        { key: "dead", label: "Deaths", value: 2, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "sh", label: "Severe or high, still open", value: 9, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "open", label: "Still open", value: 5, unit: null, prev: null, delta: null, tone: "bad", spark: [] },
        { key: "reported", label: "Reported", value: 12, unit: null, prev: null, delta: null, tone: "neutral", spark: [] }] },
      { kind: "Ranking", id: "taluks", title: "Taluks", unit: "incidents", method: "m", order: "top", items: [{ key: "t1", label: "Ambattur", value: 4, rank: 1, sub: null, zone: null, lat: null, lon: null, action: "none" }] },
      { kind: "Ranking", id: "hot", title: "Kinds", unit: "incidents", method: "m", order: "top", items: [{ key: "h1", label: "Garbage & solid waste · Guindy Estate", value: 4, rank: 1, sub: null, zone: null, lat: null, lon: null, action: "none" }] }
    ], { status: "overdue" }), WORLD);
    const [k, taluks, hot] = d.blocks;
    expect(k.kind === "Kpis" && k.items.map((x) => x.drill?.slots ?? null)).toEqual([null, null, expect.objectContaining({ status: "open" }), expect.objectContaining({ status: "overdue", view: "cases" })]);
    expect(taluks.kind === "Ranking" && taluks.items[0].drill).toBeFalsy();
    expect(hot.kind === "Ranking" && hot.items[0].drill).toBeFalsy();
  });
  it("finds the longest name a line names", () => {
    expect(namedIn("Flooding & waterlogging rose in Adyar", WORLD)).toMatchObject({ cat: "FLOOD_WATERLOGGING" });
    expect(namedIn("nothing here", WORLD)).toBeNull();
  });
});

describe("the checker keeps the summary's own slots", () => {
  it("keeps a locality, a group of kinds and the list view; drops anything else", () => {
    const sc = checkScreen({ recipe: "summary", zones: [13], place: "Velachery", family: "CRIME", view: "cases", span: { kind: "hours", hours: 48 } }, WORLD, null);
    expect(sc?.slots).toMatchObject({ zones: [13], place: "Velachery", family: "CRIME", view: "cases" });
    const bad = checkScreen({ recipe: "summary", family: "NOT_A_GROUP", place: "<script>" }, WORLD, null)?.slots;
    expect(bad).not.toHaveProperty("family");
    expect(bad).not.toHaveProperty("place");
    void START;
  });
});

// ------------------------------------------------------------------ round 2 (24 Nov evening): the owner's own sentences from the 18:52 IST session --

describe("dates as speech writes them", () => {
  it("reads 'From March 30, 2026 to April 30, 2026' and 'from um 20th March 2026 to. 20th April' as ranges", () => {
    expect(turnWhen("Give me. From March 30, 2026 to April 30, 2026.", null, NOW)).toEqual({ kind: "days", from: { day: 30, month: 2, year: 2026 }, to: { day: 30, month: 3, year: 2026 } });
    expect(turnWhen("Okay give me from um 20th March 2026 to. 20th April.", null, NOW)).toMatchObject({ kind: "days", from: { day: 20, month: 2, year: 2026 }, to: { day: 20, month: 3 } });
    expect(turnWhen("cases from 01/11/2026 till 05/11/2026", null, NOW)).toEqual({ kind: "days", from: { day: 1, month: 10, year: 2026 }, to: { day: 5, month: 10, year: 2026 } });
    expect(dateWords("From March 30, 2026 to. April 30, 2026.")).toBe("From March 30 2026 to April 30 2026.");
  });
  it("reads every way a range is said (the review of 24 Nov: each was one day, or 'since')", () => {
    const days = (a: [number, number, number | null], b: [number, number, number | null]) => ({ kind: "days", from: { day: a[0], month: a[1], year: a[2] }, to: { day: b[0], month: b[1], year: b[2] } });
    expect(turnWhen("1 November to 10 November", null, NOW)).toEqual(days([1, 10, null], [10, 10, null]));
    expect(turnWhen("summary from October 1 to October 15", null, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(turnWhen("October 1 to October 15", { said: "1 to 15 October", from: "2026-10-01", to: "2026-10-15", hours: null }, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(turnWhen("cases nov 1 to nov 10", null, NOW)).toEqual(days([1, 10, null], [10, 10, null]));
    expect(turnWhen("cases 1 nov - 10 nov", null, NOW)).toEqual(days([1, 10, null], [10, 10, null]));
    expect(turnWhen("30/03/2026 till 30-04-2026", null, NOW)).toEqual(days([30, 2, 2026], [30, 3, 2026]));
    expect(turnWhen("1st to 10th november", null, NOW)).toEqual(days([1, 10, null], [10, 10, null]));
    expect(turnWhen("traffic 20 to 23 November", null, NOW)).toEqual(days([20, 10, null], [23, 10, null]));
    expect(turnWhen("show severe cases from October 1st to 15th", null, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(turnWhen("between 1 October and 15th", null, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(turnWhen("from 25 October to 5th", null, NOW)).toEqual(days([25, 9, null], [5, 10, null]));
    expect(turnWhen("between 20 November and today", null, NOW)).toEqual({ kind: "since", month: 10, day: 20 });
    expect(turnWhen("from 15 Nov to yesterday", null, NOW)).toEqual({ ...days([15, 10, null], [15, 10, null]), end: "yesterday" });
    expect(windowOf(turnWhen("from 15 Nov to yesterday", null, NOW), "weekly", NOW)).toMatchObject({ from: "2026-11-15 00:00:00", to: "2026-11-24 00:00:00" });
    expect(turnWhen("அக்டோபர் 1 முதல் அக்டோபர் 15 வரை என்ன நடந்தது", null, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(turnWhen("October 1 la irundhu October 15 varaikkum", null, NOW)).toEqual(days([1, 9, null], [15, 9, null]));
    expect(windowOf(turnWhen("மார்ச் 30 முதல் ஏப்ரல் 30 வரை", null, NOW), "weekly", NOW)).toMatchObject({ outside: "all", from: "2026-03-30 00:00:00" });
    // (not a range: two days joined by "and" with no "from"; a count, not a day)
    expect(turnWhen("on 1 November and 15 November", null, NOW)).toEqual(days([1, 10, null], [1, 10, null]));
    expect(turnWhen("top 5 cases last week", null, NOW)?.kind === "days").toBe(false);
  });
  it("fills in a year left out one way: 'from 1 November to 30 November' on 24 Nov is this month to date", () => {
    const w = windowOf(turnWhen("from 1 November to 30 November", null, NOW), "weekly", NOW);
    expect(w).toMatchObject({ from: "2026-11-01 00:00:00", custom: true, outside: null });
    expect(w.to > "2026-11-24 15:00:00" && w.to <= "2026-11-24 15:05:01").toBe(true);
    // a range that crosses a new year, one year said
    expect(windowOf({ kind: "days", from: { day: 20, month: 11, year: 2025 }, to: { day: 5, month: 0, year: null } }, "weekly", NOW)).toMatchObject({ from: "2025-12-20 00:00:00", to: "2026-01-06 00:00:00", outside: "all" });
  });
  it("names a date to come, said with its year, and sets no change against a window before the records (the review of 24 Nov)", () => {
    const ahead = windowOf({ kind: "days", from: { day: 5, month: 11, year: 2026 }, to: { day: 5, month: 11, year: 2026 } }, "weekly", NOW);
    expect(ahead).toMatchObject({ outside: "future", custom: true, from: "2026-12-05 00:00:00" });
    expect(beforeRecords(ahead).en).toMatch(/^5 Dec 2026 has not come yet/);
    expect(windowOf({ kind: "month", month: 11, year: 2026 }, "weekly", NOW)).toMatchObject({ outside: "future" });
    // the records begin 28 May: the 4 days from 30 May have a window before that is not all held
    expect(windowOf({ kind: "days", from: { day: 30, month: 4, year: 2026 }, to: { day: 2, month: 5, year: 2026 } }, "weekly", NOW)).toMatchObject({ prevHeld: false });
    expect(windowOf(hoursSpec(48), "weekly", NOW)).toMatchObject({ prevHeld: true });
    // "today" is the dashboard's Daily window, set against the 24 hours before (25 Nov); the calendar day so far against the same hours before
    const today = windowOf({ kind: "day", back: 0 }, "daily", NOW);
    expect([today.rolling, today.hours, today.custom]).toEqual([true, 24, false]);
    const sofar = windowOf({ kind: "days", from: { day: 24, month: 10, year: 2026 }, to: { day: 24, month: 10, year: 2026 } }, "daily", NOW);
    expect(sofar.prev).toMatchObject({ from: "2026-11-23 00:00:00" });
    expect(sofar.prev.label.en).toMatch(/^the day before, to the same hour/);
  });
  it("says over which whole days the kept traffic is counted", () => {
    expect(wholeDays({ from: "2026-11-20 00:00:00", to: "2026-11-24 15:05:01", partial: true }, { dayFrom: "2026-11-20", dayTo: "2026-11-24" })).toBe("in this window");
    expect(wholeDays({ from: "2026-11-24 13:05:00", to: "2026-11-24 15:05:01", partial: true }, { dayFrom: "2026-11-24", dayTo: "2026-11-24" })).toMatch(/^on 24 Nov \(a stretch is kept by the whole day\)$/);
  });
  it("knows a sentence that names only a window (it was answered 'which one do you mean?')", () => {
    for (const s of ["Give me. From March 30, 2026 to April 30, 2026.", "what about the last four days?", "And from 1st to 15th November", "how was it yesterday",
      "Okay Jarvis, the past 48 hours please", "What's the summary for the last 2 days?", "and this week"]) expect(windowOnly(s), s).toBe(true);
    for (const s of ["prices from 1 to 5 November", "Adyar for the last 4 days", "crimes last week", "summary of Anna Nagar", "கடந்த 4 நாட்கள்", "", "top 5 last week"])
      expect(windowOnly(s), s).toBe(false);
  });
  it("says a window before the records is not held, never another window", () => {
    const w = windowOf({ kind: "days", from: { day: 30, month: 2, year: 2026 }, to: { day: 30, month: 3, year: 2026 } }, "weekly", NOW);
    expect(w).toMatchObject({ outside: "all", custom: true, from: "2026-03-30 00:00:00", to: "2026-05-01 00:00:00" });
    expect(beforeRecords(w).en).toMatch(/^Nothing is held for 30 Mar to 30 Apr 2026: the district's records begin on 28 May 2026/);
    const part = windowOf({ kind: "days", from: { day: 1, month: 4, year: 2026 }, to: { day: 10, month: 5, year: 2026 } }, "weekly", NOW);
    expect(part).toMatchObject({ outside: "part", from: w.heldFrom });
    expect(windowOf({ kind: "month", month: 3, year: 2026 }, "weekly", NOW)).toMatchObject({ outside: "all", label: { en: "April 2026" } });
  });
  it("puts it on the summary screen in words", async () => {
    const { doc } = await buildScreen("summary", slotsOf({ span: { kind: "days", from: { day: 30, month: 2, year: 2026 }, to: { day: 30, month: 3, year: 2026 } } }), BASE, WORLD, hands(winFake()), "from March 30 to April 30", "r2a", "en");
    expect(doc.blocks).toEqual([{ kind: "Note", id: "before", text: expect.stringMatching(/records begin on 28 May 2026/) }]);
    expect(doc.say.en).toMatch(/^Nothing is held for 30 Mar to 30 Apr 2026/);
    const news = await buildScreen("news", slotsOf({ span: { kind: "days", from: { day: 30, month: 2, year: 2026 }, to: { day: 30, month: 3, year: 2026 } } }), BASE, WORLD, hands(winFake()), "news in April", "r2b", "en");
    expect(news.doc.blocks[0]).toMatchObject({ kind: "Note", id: "before" });
  });
});
