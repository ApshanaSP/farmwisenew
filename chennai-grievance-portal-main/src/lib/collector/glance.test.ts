/**
 * "Today at a glance" (26 Nov 2026): the Collector's key points, composed by code. Every figure is the tile's, every point opens something,
 * the filters are honoured (the district's weather is never a filtered view's), an empty view says so, and the Tamil states
 * the same numbers as the English.
 */
import { describe, expect, it } from "vitest";
import { dayWords } from "@/lib/period/day";
import { composeGlance, glanceNumbers, nm, plain, say, short, type GlanceIn, type GlancePoint } from "./glance";

const NOW = "2026-11-26 14:00:00";
const base = (o: Partial<GlanceIn> = {}): GlanceIn => ({
  scope: { zone: null, taluk: null, dept: null, cat: null, words: "District-wide" }, period: "daily", now: NOW,
  cur: { reported: 172, ongoing: 168, urgent: 38, severe: 8, severe_open: 7, resolved: 175 }, prev: { reported: 176, ongoing: 167, severe: 12, resolved: 190 },
  overdue: 13, deaths: 3, injured: 26, awaiting: 2, unchecked: 15,
  kinds: [{ cat: "CRIME_PROPERTY", label: "Theft", n: 24, prev: 16 }, { cat: "FLOOD_WATERLOGGING", label: "Flooding", n: 15, prev: 15 }],
  zones: [{ zone: 8, name: "Anna Nagar", n: 21, prev: 15 }, { zone: 13, name: "Adyar", n: 18, prev: 22 }],
  depts: [{ code: "POL-GCP", name: "Greater Chennai Police", n: 77, overdue: 6 }, { code: "PWD-WRD", name: "PWD Water Resources", n: 16, overdue: 7 }],
  cases: [{ id: "INC-1", title: "Wall collapse at Kellys", type: "Unsafe buildings & walls", sev: "Severe", zone: "Anna Nagar", loc: "Kellys", dept: "PWD-BLD", deptName: "PWD Buildings", dead: 1 }],
  fatal: { id: "INC-2", title: "Two men killed in hit-and-run", dead: 2 },
  news: { title: "Fish stalls on the Loop Road", outlets: 2, act: true, key: "DOC-1", incident: null }, story: { id: "T1", title: "Library books case", events: 4 },
  differ: { n: 1, title: "Blast at a godown", field: "Deaths" }, newsOnly: { n: 6, deptName: "Fire and Rescue", deptN: 4 },
  rise: { cat: "AIR_POLLUTION", label: "Air pollution", zone: 8, zoneName: "Anna Nagar", n: 9, times: 12, date: "2026-11-26" },
  warning: { title: "Thunderstorms & Lightning · yellow for Chennai", agreement: "agree", rain: true }, env: { rainMm: 2.5, aqi: 80, lakesPct: 39 }, ...o
});
const filtered = (o: Partial<GlanceIn["scope"]>, x: Partial<GlanceIn> = {}) => base({ scope: { zone: null, taluk: null, dept: null, cat: null, words: "Adyar · Police", ...o }, ...x });
const points = (g: ReturnType<typeof composeGlance>): GlancePoint[] => [...g.happening, ...g.needs, ...g.next];
const nums = (t: string) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).sort();

describe("figures are the tiles'", () => {
  it("each figure is the number it was given, and opens its own list", () => {
    const g = composeGlance(base());
    expect(Object.fromEntries(g.figures.map((f) => [f.key, f.v]))).toEqual({ reported: 172, open: 168, overdue: 13, severe: 8, resolved: 175 });
    expect(g.figures.find((f) => f.key === "overdue")?.open).toMatchObject({ k: "list", preset: { status: "overdue" } });
    expect(g.figures.find((f) => f.key === "severe")?.sub).toBe("7 still open");
    expect(plain(g.situation.en)).toBe(`172 incidents were reported ${dayWords(NOW).en.inWords}, 4 fewer than ${dayWords(NOW).en.prev}; 168 still open, 175 resolved; 3 people died, 26 injured.`);
  });
  it("the week, month and quarter are named, and Daily follows the desk's day", () => {
    expect(plain(composeGlance(base({ period: "weekly" })).situation.en)).toContain("in the last 7 days, 4 fewer than the previous week");
    expect(plain(composeGlance(base({ now: "2026-11-26 01:30:00" })).situation.en)).toContain(dayWords("2026-11-26 01:30:00").en.inWords);
  });
});

describe("points", () => {
  it("at most four a group, each with something to open and a plain sentence", () => {
    const g = composeGlance(base());
    for (const x of [g.happening, g.needs, g.next]) { expect(x.length).toBeGreaterThanOrEqual(2); expect(x.length).toBeLessThanOrEqual(4); }
    for (const p of points(g)) {
      expect(p.open, p.key).toBeTruthy();
      expect(p.act.length, p.key).toBeGreaterThan(3);
      for (const t of [plain(p.en), plain(p.ta)]) { expect(t, p.key).not.toMatch(/undefined|NaN|null|\[object/); expect(t.length, p.key).toBeLessThan(170); }
    }
  });
  it("the Tamil says the same numbers as the English, in every point and the sentence", () => {
    for (const f of [base(), base({ period: "monthly" }), filtered({ zone: "Adyar" }), base({ warning: null, env: { rainMm: 22.4, aqi: 240, lakesPct: 95 } })]) {
      const g = composeGlance(f);
      for (const p of points(g)) expect(nums(plain(p.ta)), p.key).toEqual(nums(plain(p.en)));
    }
  });
  it("names are their own pieces, so the translator can put each in Tamil", () => {
    const k = composeGlance(base()).happening.find((p) => p.key === "kinds")!;
    expect(k.ta).toContainEqual(nm("Theft"));
    expect(plain(k.en)).toContain("Theft 24 (was 16), Flooding 15 (same as before)");
  });
  it("lives, weather and news are never dropped: the kinds and areas are said in one point", () => {
    const g = composeGlance(base());
    expect(g.happening.map((p) => p.key)).toEqual(["kinds", "lives", "weather", "news"]);
    expect(plain(g.happening[0].en)).toContain("Most from: Anna Nagar 21");
    expect(plain(g.happening[1].en)).toBe("3 deaths reported; the worst (2): Two men killed in hit-and-run.");
  });
  it("a death already led with under 'What needs you' is not said twice", () => {
    const g = composeGlance(base({ fatal: { id: "INC-1", title: "Wall collapse at Kellys", dead: 1 } }));
    expect(g.happening.map((p) => p.key)).not.toContain("lives");
    expect(plain(g.needs[0].en)).toBe("Most serious open case: Wall collapse at Kellys, Anna Nagar, 1 dead.");
  });
  it("what to do next names the owner; a case already instructed is not asked for again", () => {
    expect(plain(composeGlance(base()).next.find((p) => p.key === "instruct")!.en)).toBe("Instruct PWD Buildings on the unsafe buildings & walls case at Kellys.");
    expect(composeGlance(base()).next.find((p) => p.key === "clear")?.open).toMatchObject({ preset: { dept: "PWD-WRD", status: "overdue" } });
    const c = base().cases[0];
    expect(composeGlance(base({ cases: [{ ...c, acted: true }] })).next.map((p) => p.key)).not.toContain("instruct");
  });
  it("a department is asked only for its own share of what is only in the news", () => {
    const g = composeGlance(base({ awaiting: 0, warning: null }));
    expect(plain(g.next.find((p) => p.key === "pass")!.en)).toBe("Ask Fire and Rescue to record its 4 incidents that are only in the news.");
    expect(plain(composeGlance(base({ awaiting: 0, unchecked: 0 })).needs.find((p) => p.key === "newsonly")!.en)).toContain("6 incidents are only in the news");
  });
  it("a share of a rise is never called times the usual", () => {
    const r = base().rise!;
    const quiet = { deaths: 0, warning: null, news: null, story: null };
    expect(plain(composeGlance(base({ ...quiet })).happening.find((p) => p.key === "rise")!.en)).toContain("about 12 times the usual");
    expect(plain(composeGlance(base({ ...quiet, rise: { ...r, times: null } })).happening.find((p) => p.key === "rise")!.en)).toBe("Unusual rise: Air pollution in Anna Nagar, 9 reports.");
    expect(plain(composeGlance(base({ ...quiet, rise: { ...r, times: 180 } })).happening.find((p) => p.key === "rise")!.en)).toContain("far above the usual");
  });
});

describe("filters", () => {
  it.each([["zone", { zone: "Adyar" }], ["taluk", { taluk: "Mylapore" }], ["dept", { dept: "Police" }], ["cat", { cat: "Road accident" }]] as const)("under a %s filter the district's weather, air and reservoirs are left out", (_k, s) => {
    const g = composeGlance(filtered(s, { env: { rainMm: 90, aqi: 400, lakesPct: 98 } }));
    const keys = points(g).map((p) => p.key);
    for (const k of ["weather", "prepare"]) expect(keys).not.toContain(k);
    expect(plain(g.situation.en)).toMatch(/^Adyar · Police: /);
  });
  it("a zone's view does not rank zones; a category's does not rank kinds; a department's does not name itself as the one that is late", () => {
    expect(composeGlance(filtered({ zone: "Adyar" })).happening.map((p) => p.key)).not.toContain("zones");
    expect(composeGlance(filtered({ zone: "Adyar" })).happening.find((p) => p.key === "depts")?.open).toEqual({ k: "dept", code: "POL-GCP" });
    expect(composeGlance(filtered({ cat: "Road accident" })).happening.map((p) => p.key)).not.toContain("kinds");
    expect(plain(composeGlance(filtered({ dept: "Police" })).needs.find((p) => p.key === "overdue")!.en)).toBe("13 open cases are past deadline.");
  });
  it("a filter that leaves nothing says so, with no point of the district's", () => {
    const g = composeGlance(filtered({ zone: "Adyar", dept: "Police" }, { cur: { reported: 0, ongoing: 0, urgent: 0, severe: 0, severe_open: 0, resolved: 0 }, prev: {}, overdue: 0, deaths: 0, injured: 0,
      awaiting: 0, unchecked: 0, kinds: [], zones: [], depts: [], cases: [], fatal: null, news: null, story: null, differ: null, newsOnly: null, rise: null }));
    expect(g.empty).toBe(true);
    expect(points(g)).toEqual([]);
    expect(plain(g.situation.en)).toBe(`Adyar · Police: nothing was reported ${dayWords(NOW).en.inWords}.`);
    expect(plain(composeGlance(base({ cur: { reported: 0, resolved: 0 }, prev: {} })).situation.en)).toBe(`Nothing was reported ${dayWords(NOW).en.inWords}.`);
  });
  it("'not yet checked' is of any date and says so", () => {
    expect(plain(composeGlance(base()).needs.find((p) => p.key === "unchecked")!.en)).toContain("of any date");
  });
});

describe("helpers", () => {
  it("say joins text and keeps names apart", () => {
    expect(say`${nm("Adyar")} had ${1200}${" reports"}.`).toEqual([{ nm: "Adyar" }, " had 1,200 reports."]);
  });
  it("a long headline is cut at a word", () => {
    const t = short("Severe stench emanating due to accumulation of plastic garbage and waste in the Peeliamman temple pond");
    expect(t.length).toBeLessThanOrEqual(67);
    expect(t).toMatch(/\w…$/);
    expect(short("Short one.")).toBe("Short one");
  });
  it("an AI wording may use only the numbers the glance states", () => {
    expect(glanceNumbers(composeGlance(base()))).toEqual(expect.arrayContaining([172, 176, 13, 24, 16, 7]));
  });
});
