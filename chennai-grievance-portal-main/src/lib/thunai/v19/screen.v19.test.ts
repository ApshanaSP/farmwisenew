// v19 (25 Nov): the analyst's screen holds what was asked and nothing else, what is said is held to it, and the turn reaches it whatever the reader
// called the question. The results are stand-ins (run.ts counts them live: integrity19.live.ts)
import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { clearCaches, planRound, RoundBody } from "../round";
import { fakeHands } from "../stagefake";
import { buildScreen, emptySlots, type Hands, type Slots } from "../screens";
import { checkScreen } from "../agent";
import { PLANNER_RECIPES, checkStage, type BlockT, type StageDocT } from "../stage";
import type { World } from "../types";
import { referenceWorld } from "../world";
import type { Reading } from "../v16/reader";
import { checkOf, factsOf, sayOf, verdictOf } from "./doc";
import type { Group, Measures, Result } from "./run";
import { leadOk, sayAnswer, sentenceOk } from "./say";
import { cut } from "./run";
import type { Plan, Query } from "./shape";
import { askZoneSlots, stageDigest } from "../stagelocal";

const W: World = { ...WORLD, ...referenceWorld() };
const Q = (x: Partial<Query> = {}): Query => ({ of: "incidents", zones: [], place: null, ward: null, taluk: null, depts: [], not: [], group: null, cats: [], sev: [], status: null, from: null, harm: null, words: [], item: null, time: null, clock_from: null, clock_to: null, older_days: null, level: null, measure: "count", by: null, per: null,
  order: "most", rank: null, take: null, list: false, sort: "priority", before: false, ...x });
const P = (q: Partial<Query>, x: Partial<Plan> = {}): Plan => ({ understood: "u", kind: "answer", view: null, gap: null, title: "Areas with most severe incidents", title_ta: "பகுதிகள்", queries: [Q(q)], ...x });
const M = (n: number, x: Partial<Measures> = {}): Measures => ({ n, severe: 0, open: 0, overdue: 0, resolved: 0, dead: 0, injured: 0, complaints: 0, received: 0, closeDays: null, openDays: null, closed: 0, ...x });
const G = (key: string, label: string, value: number): Group => ({ key, label, ta: label, zone: Number(key) || null, lat: null, lon: null, value, m: M(value), sub: null, inside: Q({ zones: [Number(key)], list: true }) });
const row = (id: string, title: string) => ({ id, title, sev: "Severe", status: "Open", zone: 13, zone_name: "Adyar", loc: "Besant Nagar", dept: "POL-GCP", dept_name: "Greater Chennai Police", complaints: 1, t: "2026-11-25 08:00:00", lat: 13, lon: 80.2, open: true });
const res = (q: Partial<Query>, x: Partial<Result> = {}): Result => {
  const full = Q(q);
  return { q: full, win: null, live: false, asOf: "2026-11-25 09:30:00", what: { en: "severe incidents", ta: "கடுமையான சம்பவங்கள்" }, over: { en: "last 2 days", ta: "கடந்த 2 நாட்கள்" }, measure: { en: "severe incidents", ta: "கடுமையானவை" }, unit: "severe incidents", groupNoun: { en: "area", ta: "பகுதி" },
    total: 0, totals: M(0), prev: null, groups: [], shown: [], from: 1, rows: [], rowsTotal: 0, news: [], newsTotal: 0, readings: [], method: null, notes: [], sources: ["incidents"], cannot: null, ...x };
};
const ZONES = [G("5", "Royapuram", 4), G("10", "Kodambakkam", 3), G("13", "Adyar", 2), G("8", "Anna Nagar", 2), G("2", "Manali", 0)];
const ranked = (q: Partial<Query>): Result => { const r = res({ by: "zone", measure: "severe", ...q }, { groups: ZONES.map((g) => ({ ...g })) }); cut(r); return r; };
const build = async (plan: Plan, results: Result[], slots: Partial<Slots> = {}, lang: "en" | "ta" = "en"): Promise<StageDocT> => {
  let k = 0;
  const hands: Hands = { ...fakeHands(), ask: async () => results[k++] ?? results[0] };
  return (await buildScreen("ask", { ...emptySlots(), plan, ...slots }, { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, W, hands, "q", "st", lang)).doc;
};
const of = <K extends BlockT["kind"]>(d: StageDocT, k: K) => d.blocks.filter((b): b is Extract<BlockT, { kind: K }> => b.kind === k);

describe("the order, the position and the number", () => {
  it("two asked is two, in order", () => expect(ranked({ take: 2 }).shown.map((g) => g.label)).toEqual(["Royapuram", "Kodambakkam"]));
  it("the second is the second alone", () => { const r = ranked({ rank: 2 }); expect([r.shown.map((g) => g.label), r.from]).toEqual([["Kodambakkam"], 2]); });
  it("the fewest first when the fewest are asked, the ones with none among them", () => expect(ranked({ order: "least", take: 1 }).shown.map((g) => g.label)).toEqual(["Manali"]));
  it("the most never names one with none of it, and a position past the end is said to be", () => {
    expect(ranked({}).shown.map((g) => g.label)).not.toContain("Manali");
    const r = ranked({ rank: 9 });
    expect(r.shown).toEqual([]);
    expect(r.notes[0].en).toBe("There are only 4 to rank.");
  });
  it("what stands level with the last one shown is named", () => expect(ranked({ take: 3 }).notes.map((x) => x.en)).toEqual([`The same figure: ${ranked({ take: 3 }).shown.at(-1)!.label === "Adyar" ? "Anna Nagar" : "Adyar"}.`]));
  it("days stay in time order until a most is asked", () => {
    const days = [G("2026-11-20", "20 Nov", 3), G("2026-11-18", "18 Nov", 9), G("2026-11-19", "19 Nov", 1)];
    const a = res({ by: "day" }, { groups: days.map((g) => ({ ...g })) }); cut(a);
    expect(a.shown.map((g) => g.key)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
    const b = res({ by: "day", take: 1 }, { groups: days.map((g) => ({ ...g })) }); cut(b);
    expect(b.shown.map((g) => g.label)).toEqual(["18 Nov"]);
  });
});

describe("the screen is the answer alone", () => {
  it("two areas: a ranking of those two, each leading to its own cases, and no other part", async () => {
    const d = await build(P({ by: "zone", measure: "severe", take: 2 }), [ranked({ take: 2 })]);
    expect(checkStage(d).ok).toBe(true);
    expect(of(d, "Ranking")[0].items.map((x) => [x.rank, x.label, x.value])).toEqual([[1, "Royapuram", 4], [2, "Kodambakkam", 3]]);
    expect(d.blocks.every((b) => b.kind === "Ranking" || b.kind === "MapView")).toBe(true);
    const drill = of(d, "Ranking")[0].items[0].drill!;
    expect(drill.recipe).toBe("ask");
    expect((drill.slots.plan as Plan).queries[0]).toMatchObject({ zones: [5], list: true });
    expect(checkScreen({ recipe: "ask", ...drill.slots }, W, null)?.recipe).toBe("ask");
  });
  it("the second: that one at its own place, with its own cases", async () => {
    const r = { ...ranked({ rank: 2 }), rows: [row("INC-1", "Chain snatched")], rowsTotal: 1 };
    const d = await build(P({ by: "zone", measure: "severe", rank: 2 }), [r]);
    expect(of(d, "Ranking")[0].items.map((x) => [x.rank, x.label])).toEqual([[2, "Kodambakkam"]]);
    expect(of(d, "CaseList")[0].rows.map((x) => x.id)).toEqual(["INC-1"]);
  });
  it("a number: its tile, and exactly the records it counts", async () => {
    const r = res({ depts: ["POL-GCP"], zones: [13], list: true }, { total: 2, totals: M(2), what: { en: "incidents handled by Greater Chennai Police in Adyar", ta: "x" }, rows: [row("INC-1", "A"), row("INC-2", "B")], rowsTotal: 2, prev: { total: 5, label: { en: "the 2 days before", ta: "x" }, held: true } });
    const d = await build(P({ depts: ["POL-GCP"], zones: [13], list: true }, { title: "Police incidents in Adyar, last 2 days" }), [r]);
    expect(of(d, "Kpis")[0].items).toHaveLength(1);
    expect(of(d, "Kpis")[0].items[0]).toMatchObject({ value: 2, prev: 5, delta: -3 });
    expect(of(d, "CaseList")[0]).toMatchObject({ total: 2 });
    expect(d.title).toBe("Police incidents in Adyar, last 2 days");
    expect(d.slots.plan).toBeTruthy();
  });
  it("a heading never says a figure the answer does not hold ('Seven severe events' over eight)", async () => {
    const r = res({ sev: ["Severe"], list: true }, { total: 8, totals: M(8), rows: [row("INC-1", "A")], rowsTotal: 8, over: { en: "last 24 hours", ta: "x" } });
    expect((await build(P({ sev: ["Severe"] }, { title: "Seven severe events today" }), [r])).title).toBe("Severe incidents, last 24 hours");
  });
  it("two sides stand side by side, each named by what sets it apart", async () => {
    const a = res({ zones: [13], sev: ["Severe"] }, { total: 7, totals: M(7), what: { en: "severe incidents in Adyar", ta: "அடையாறு பகுதியில் கடுமையான சம்பவங்கள்" } }), b = res({ zones: [8], sev: ["Severe"] }, { total: 2, totals: M(2), what: { en: "severe incidents in Anna Nagar", ta: "அண்ணா நகர் பகுதியில் கடுமையான சம்பவங்கள்" } });
    const d = await build({ ...P({}), queries: [Q({ zones: [13], sev: ["Severe"] }), Q({ zones: [8], sev: ["Severe"] })] }, [a, b]);
    expect(of(d, "Kpis")[0].items.map((x) => [x.label, x.value])).toEqual([["Adyar", 7], ["Anna Nagar", 2]]);
    expect(of(d, "Chart")[0].values).toEqual([7, 2]);
    expect(checkStage(d).ok).toBe(true);
  });
  it("nothing is said to be nothing, never filled", async () => {
    const d = await build(P({ by: "zone" }), [res({ by: "zone" }, { what: { en: "incidents handled by Greater Chennai Police", ta: "x" } })]);
    expect(of(d, "Note")[0].text).toMatch(/^Nothing to rank: no incidents handled by Greater Chennai Police over the last 2 days/);
  });
  it("is Tamil on a Tamil turn", async () => {
    const d = await build(P({ by: "zone", measure: "severe", take: 2 }), [ranked({ take: 2 })], {}, "ta");
    expect(d.title).toMatch(/[஀-௿]/);
    expect(of(d, "Ranking")[0].title).toMatch(/[஀-௿]/);
  });
  it("is never a screen a planner model may name, and needs a real plan", () => {
    expect(PLANNER_RECIPES as readonly string[]).not.toContain("ask");
    expect(checkScreen({ recipe: "ask" }, W, null)).toBeNull();
    expect(checkScreen({ recipe: "ask", plan: { queries: [{ of: "secrets" }] } }, W, null)).toBeNull();
  });
});

describe("what is said", () => {
  const facts = factsOf([ranked({ take: 2 })], W);
  it("code's own line answers first, and only what was asked", () => {
    expect(sayOf(ranked({ rank: 2 }), W).en).toBe("Second is Kodambakkam, with 3 severe incidents over the last 2 days.");
    expect(sayOf(ranked({ take: 2 }), W).en).toBe("Severe incidents over the last 2 days: Royapuram, 4 severe incidents; then Kodambakkam, 3 severe incidents.");
  });
  it("a sentence may say only the result's figures and places (no structure given)", () => {
    expect(sentenceOk("Royapuram has the most, with 4, then Kodambakkam with 3.", facts, "top two areas", W)).toBeNull();
    expect(sentenceOk("Royapuram has 77.", facts, "", W)).toMatch(/77 is not/);
    expect(sentenceOk("Six of them are in Royapuram.", facts, "", W)).toMatch(/Six/);
    expect(sentenceOk("Teynampet is the worst.", facts, "", W)).toMatch(/Teynampet/);
    expect(sentenceOk("The data shows Royapuram.", facts, "", W)).toMatch(/never what the data/);
    expect(sentenceOk("ராயபுரம் முதலிடம்.", facts, "", W, "en")).toMatch(/English/);
  });
  it("the first sentence names the answer first, and never against the ranking's direction", () => {
    const two = { first: ["Royapuram"], others: ["Adyar"], strict: true };
    expect(leadOk("Adyar is worse, with 35 against Royapuram's 37.", two)).toMatch(/Royapuram/);
    expect(leadOk("Royapuram is worse, with 37 against Adyar's 35.", two)).toBeNull();
    const r = [ranked({ order: "least", take: 1 })], least = factsOf(r, W), c = checkOf(r, W, least, "");
    expect(sentenceOk("Manali has the most incidents.", least, "", W, "en", c)).toMatch(/least first/);
    expect(sentenceOk("Manali is the worst.", least, "", W, "en", c)).toMatch(/best one/);
    expect(sentenceOk("Manali has the fewest incidents.", least, "", W, "en", c)).toBeNull();
  });
  it("a name said in other words is still the first ('Garbage and solid waste' of Garbage & solid waste, an area in spoken Tamil)", () => {
    expect(leadOk("Garbage and solid waste leads with 14, followed by road accidents.", { first: ["Garbage & solid waste"], others: ["Road accident"], strict: false })).toBeNull();
    expect(leadOk("Metro Water has the most, then Storm Water Drains.", { first: ["Metro Water (CMWSSB)"], others: ["Storm Water Drains"], strict: false })).toBeNull();
    expect(leadOk("அடையாறில் 12 சம்பவங்கள், அடுத்து அண்ணா நகர் 10.", { first: ["Adyar", "அடையாறு"], others: ["Anna Nagar", "அண்ணா நகர்"], strict: true })).toBeNull();
    expect(leadOk("அண்ணா நகரில் அதிகம்.", { first: ["Adyar", "அடையாறு"], others: ["Anna Nagar", "அண்ணா நகர்"], strict: true })).toMatch(/Adyar/);
  });
  it("a figure said of an area is that area's, and one that only stands in a time or a headline is no count", () => {
    const r = [ranked({})], facts3 = factsOf(r, W), c = checkOf(r, W, facts3, "");
    expect(sentenceOk("Royapuram has the most, with 4, then Kodambakkam with 3 and Adyar with 2.", facts3, "", W, "en", c, true)).toBeNull();
    expect(sentenceOk("Royapuram has the most, with 3, then Kodambakkam with 4.", facts3, "", W, "en", c, true)).toMatch(/figure/);
    expect(sentenceOk("Royapuram and Kodambakkam have 4 and 3.", facts3, "", W, "en", c, true)).toBeNull();
    const list = [res({ sev: ["Severe"], list: true }, { total: 8, totals: M(8), rows: [{ ...row("INC-1", "Fire at 47th Street kills dog"), t: "2026-11-25 08:53:00" }], rowsTotal: 8, over: { en: "last 24 hours", ta: "x" } })];
    const f2 = factsOf(list, W), c2 = checkOf(list, W, f2, "what are the seven severe events");
    const ok = (s: string, first = true) => sentenceOk(s, f2, "what are the seven severe events", W, "en", c2, first);
    expect(ok("There are 8 severe incidents in the last 24 hours.")).toBeNull();
    for (const s of ["There are 53 severe incidents.", "There are 25 severe incidents.", "The seven severe incidents are these.", "There are no severe incidents.", "There is only one severe incident.", "It was reported at 9:53 AM."]) expect([s, ok(s) != null]).toEqual([s, true]);
    expect(ok("A fire at 47th Street was reported at 8:53 AM on 25 November.", false)).toBeNull();
    expect(ok("Metro Water have the most.", false)).toMatch(/not in the result/i);
  });
  it("the second read of the review: the one number, figures before a name, plurals, Tamil names ending in ம்", () => {
    const r1 = [res({ sev: ["Severe"], list: true }, { total: 8, totals: M(8, { overdue: 3 }), rows: [{ ...row("INC-1", "Fire"), t: "2026-11-25 08:53:00" }], rowsTotal: 8, over: { en: "last 24 hours", ta: "கடந்த 24 மணி நேரம்" } })];
    const f1 = factsOf(r1, W), c1 = checkOf(r1, W, f1, "how many severe");
    const ok = (s: string, lang: "en" | "ta" = "en") => sentenceOk(s, f1, "how many severe", W, lang, c1, true);
    for (const s of ["There are 24 severe incidents.", "There are 3 severe incidents.", "There are 3 severe incidents in the last 24 hours, 8 of them past their deadline.", "One severe incident was reported.", "In the last 24 hours there were no severe incidents.", "The last 24 hours saw no severe incidents."]) expect([s, ok(s) != null]).toEqual([s, true]);
    expect(ok("கடுமையான சம்பவங்கள் இல்லை.", "ta")).not.toBeNull();
    for (const s of ["There are 8 severe incidents in the last 24 hours, 3 of them past their deadline.", "3 of the 8 severe incidents are past their deadline.", "Eight severe incidents were reported in the last 24 hours."]) expect([s, ok(s)]).toEqual([s, null]);
    expect(ok("கடந்த 24 மணி நேரத்தில் 8 கடுமையான சம்பவங்கள்.", "ta")).toBeNull();
    const r2 = [ranked({})], f2 = factsOf(r2, W), c2 = checkOf(r2, W, f2, "");
    const ok2 = (s: string) => sentenceOk(s, f2, "", W, "en", c2, true);
    for (const s of ["There are 4 in Royapuram, 3 in Kodambakkam and 2 in Adyar.", "Royapuram has the most, 4, ahead of 3 in Kodambakkam."]) expect([s, ok2(s)]).toEqual([s, null]);
    for (const s of ["There are 3 in Royapuram, 4 in Kodambakkam.", "Royapuram has the most with 3, then Kodambakkam with 4."]) expect([s, ok2(s) != null]).toEqual([s, true]);
    expect(leadOk("கோடம்பாக்கத்தில் 12 சம்பவங்கள், அடுத்து அண்ணா நகரில் 10.", { first: ["Kodambakkam", "கோடம்பாக்கம்"], others: ["Anna Nagar", "அண்ணா நகர்"], strict: true })).toBeNull();
    expect(leadOk("Road accidents lead with 12, then garbage.", { first: ["Road accident"], others: ["Garbage & solid waste"], strict: false })).toBeNull();
    const low = factsOf([ranked({ order: "least", take: 1 })], W);
    expect(sentenceOk("Royapuram is the least safe area.", f2, "", W, "en", c2)).toBeNull();
    expect(sentenceOk("Chennai ponnu, ippothu kaathirukkum police vazhakku, inum nadakkiradhu.", low, "", W, "en")).not.toBeNull();
    expect(sentenceOk("This is a concern for the Collector.", f1, "", W, "en", c1)).toMatch(/Collector/);
  });
  it("an amount in a headline may be said, and the number of reports asked for", () => {
    const r = [res({ list: true, sort: "oldest" }, { total: 1060, totals: M(1060), rows: [row("INC-1", "Anna Nagar: fake bank call costs resident Rs 1,31,500")], rowsTotal: 1060 })];
    const f1 = factsOf(r, W), c1 = checkOf(r, W, f1, "which police cases are waiting the longest");
    expect(sentenceOk("The one waiting the longest is a fake bank call that cost a resident Rs 1,31,500.", f1, "which police cases are waiting the longest", W, "en", c1, true)).toBeNull();
    expect(sentenceOk("There are 1,31,500 incidents.", f1, "which police cases are waiting the longest", W, "en", c1, true)).not.toBeNull();
    const n = [res({ of: "news", take: 3, sort: "oldest", list: true }, { newsTotal: 36, news: [1, 2, 3].map((k) => ({ id: `n${k}`, title: `New park ${k}`, t: "2026-11-18 22:26" })) as never })];
    const f2 = factsOf(n, W);
    expect(sentenceOk("The oldest three reports on Adyar begin with a new park.", f2, "oldest three news on Adyar", W, "en", checkOf(n, W, f2, ""), true)).toBeNull();
  });
  it("which has fewer, or is better, is the smaller side; officers (அதிகாரி) are no contest", () => {
    const a = res({ zones: [13] }, { total: 12, totals: M(12), what: { en: "incidents in Adyar", ta: "அடையாறு பகுதியில் சம்பவங்கள்" } }), b = res({ zones: [8] }, { total: 20, totals: M(20), what: { en: "incidents in Anna Nagar", ta: "அண்ணா நகர் பகுதியில் சம்பவங்கள்" } });
    for (const q of ["Which has fewer, Adyar or Anna Nagar", "Which is better, Adyar or Anna Nagar"]) expect(verdictOf([a, b], W, q)).toMatchObject({ en: expect.stringMatching(/^Adyar has fewer/), names: expect.arrayContaining(["Adyar"]) });
    expect(verdictOf([a, b], W, "Which is worse, Adyar or Anna Nagar")?.en).toMatch(/^Anna Nagar has more/);
    for (const q of ["how many incidents between 6 and 9 pm in Adyar and in Anna Nagar", "அதிகாரிகளுக்கு எத்தனை"]) expect(verdictOf([a, b], W, q)).toBeNull();
  });
  it("closed roads are closed, never 'under a minute of delay'", () => {
    const g = { ...G("s1", "Anna Salai", 0), spot: {} as never };
    const r = res({ of: "traffic", by: "road", level: "closed", measure: "delay" }, { live: true, groups: [g], shown: [g], what: { en: "closed roads", ta: "மூடப்பட்ட சாலைகள்" } });
    expect(sayOf(r, W).en).toBe("Anna Salai: closed right now.");
    expect(checkOf([r], W, factsOf([r], W), "").zero).toBe(false);
  });
  it("which side has more is worked out by code", () => {
    const a = res({ zones: [13] }, { total: 35, totals: M(35), what: { en: "incidents in Adyar", ta: "x" } }), b = res({ zones: [8] }, { total: 37, totals: M(37), what: { en: "incidents in Anna Nagar", ta: "x" } });
    expect(verdictOf([a, b], W)?.en).toBe("Anna Nagar has more over the last 2 days: Anna Nagar 37 incidents, Adyar 35 incidents.");
    expect(verdictOf([a, { ...b, total: 35 }], W)?.en).toMatch(/^They are level/);
    expect(verdictOf([a, b], W, "how many in Adyar and how many in Anna Nagar")).toBeNull();
    // a total and its part are no contest
    expect(verdictOf([a, res({ zones: [13], sev: ["Severe"] }, { total: 8, totals: M(8) })], W, "compare")).toBeNull();
  });
  it("a first sentence that fails is asked for once more, then code's line is said", async () => {
    const calls: string[] = [];
    const open = (lines: string[]) => async (_r: unknown, c: { prompt: string }, on: (t: string) => void) => { const l = lines[calls.length] ?? ""; calls.push(c.prompt); on(`${l}\n`); return { provider: "x", model: "m", tokens: 5, firstMs: 1, ms: 1, stop: null }; };
    const ask = (lines: string[]) => sayAnswer({ question: "top two areas", lang: "en", facts, fallback: "Code's own line.", world: W }, { user: "t", until: Date.now() + 8000, firstBy: Date.now() + 7000, open: open(lines) as never, rungs: () => [{ provider: "anthropic", model: "m" }] });
    const ok = await ask(["Royapuram has 99.", "Royapuram has the most, with 4."]);
    expect([ok.by, ok.sentences]).toEqual(["model", ["Royapuram has the most, with 4."]]);
    expect(calls[1]).toMatch(/NOT USED: the figure 99/);
    calls.length = 0;
    const bad = await ask(["Royapuram has 99.", "It has 98."]);
    expect([bad.by, bad.sentences]).toEqual(["code", ["Code's own line."]]);
  });
});

describe("the turn", () => {
  const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
  const body = (text: string, x: Record<string, unknown> = {}) => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, heard: { lang: "en", conf: 0.9, source: "whisper" }, ...x });
  const read = (ask: Reading["ask"]): Reading => ({ ask, zones: [], place: null, cat: null, sev: null, period: null, lenses: [], about: null, one: false, page: null, lang_wanted: null, status: null, measure: null, request: "r", reply: "Hello.", dataset: null, time: null, dept: null, topic: null });
  const asked: Query[] = [];
  const hands = (): Hands => ({ ...fakeHands(), ask: async (q) => { asked.push(q); const r = ranked(q); return { ...r, q }; } });
  const run = (text: string, ask: Reading["ask"], plan: Plan | null, x: Record<string, unknown> = {}) => { clearCaches(); asked.length = 0;
    return planRound(body(text, x), W, hands(), "t", undefined, undefined, { llm: { generate: async () => { throw new Error("no model in a test"); } }, reader: async () => ({ reading: read(ask), model: "m", tokens: 1, ms: 1 }), analyst: async () => (plan ? { plan, model: "m", tokens: 1, ms: 1 } : null) }); };
  it.each(["ranking", "focus", "summary", "city", "other"] as const)("a question the records answer is the analyst's, read as %s", async (ask) => {
    const o = await run("top two areas with most severe incidents", ask, P({ by: "zone", measure: "severe", take: 2 }));
    expect([o.lane, o.result?.stage?.recipe]).toEqual(["analyst", "ask"]);
    expect(o.result?.stage?.blocks.find((b) => b.kind === "Ranking")).toMatchObject({ items: [{ label: "Royapuram" }, { label: "Kodambakkam" }] });
    expect(o.result?.steps).toEqual([]);
  });
  it("a greeting is not", async () => expect((await run("thank you", "chat", P({ by: "zone" }))).lane).not.toBe("analyst"));
  it("with no plan from the model, a plain follow-up of the last one is still answered as asked", async () => {
    const last = P({ by: "zone", measure: "severe", take: 1 });
    const stage = { recipe: "ask", title: "t", blocks: [], slots: { plan: last, period: "daily" }, focus: null };
    const o = await run("the second?", "follow_up", null, { stage });
    expect([o.lane, asked[0]?.rank]).toEqual(["analyst", 2]);
  });
  // (the review: the frame lane rebuilt the open screen with its old requests, so Anna Nagar's figure was said as Adyar's)
  const ANNA = P({ zones: [8], sev: ["Severe"], time: { said: "this week", from: null, to: null, hours: null } }, { title: "Severe incidents in Anna Nagar this week" });
  const onAsk = (plan: Plan) => ({ stage: { recipe: "ask", title: "t", blocks: [], slots: { plan, period: "daily" }, focus: null } });
  it.each([["And in Adyar?", { zones: [13], sev: ["Severe"], time: { said: "this week" } }], ["for the police alone", { zones: [8], sev: ["Severe"], depts: ["POL-GCP"] }], ["what about last month", { zones: [8], sev: ["Severe"], time: { said: "what about last month" } }]] as const)("with no model, %s changes that one thing", async (text, want) => {
    const o = await run(text, "follow_up", null, onAsk(ANNA));
    expect(o.lane).toBe("analyst");
    expect(asked[0]).toMatchObject(want);
  });
  it("after its screen is closed, 'and the third?' is still of the same ranking, a thank you between or not", async () => {
    await run("top area with severe incidents", "ranking", P({ by: "zone", measure: "severe", take: 1 }));
    const t = [{ heard: "top area", did: "ask", recipe: "ask", slots: { period: "daily" }, result: "Royapuram" }, { heard: "thank you", did: "chat", recipe: null, result: "" }];
    const o = await run("and the third?", "follow_up", null, { turns: t });
    expect([o.lane, asked[0]?.rank]).toEqual(["analyst", 3]);
  });
  it("with no model at all the exact request is still made", async () => {
    clearCaches(); asked.length = 0;
    const was = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const o = await planRound(body("top two areas with most severe incidents last two days"), W, hands(), "t2", undefined, undefined, { llm: { generate: async () => { throw new Error("no model"); } } });
      expect(o.lane).toBe("analyst");
      expect(asked[0]).toMatchObject({ by: "zone", take: 2, sev: ["Severe"] });
    } finally { if (was != null) process.env.ANTHROPIC_API_KEY = was; }
  });
});

describe("clicks and controls on it (the review)", () => {
  const stage = async (plan: Plan, r: Result[]) => build(plan, r);
  it("'the worst area of each department' is a screen (its pairs are no area's number)", async () => {
    const r = res({ by: "zone", per: "dept" }, { groups: [{ ...G("5", "x", 4), key: "POL-GCP:5", label: "Police: Royapuram", ta: "போலீஸ்: ராயபுரம்" }] }); cut(r);
    const d = await stage(P({ by: "zone", per: "dept" }), [r]);
    expect(checkStage(d)).toMatchObject({ ok: true });
    expect(of(d, "Ranking")[0].items[0].action).toBe("none");
  });
  it("a click on a Tamil screen opens a Tamil heading", async () => {
    const d = await build(P({ by: "zone", measure: "severe", take: 1 }), [ranked({ take: 1 })], {}, "ta");
    const drill = of(d, "Ranking")[0].items[0].drill!;
    expect((drill.slots.plan as Plan).title_ta).toMatch(/கடுமையான/);
    expect(drill.label).toMatch(/கடுமையான/);
  });
  it("an area clicked on the map keeps the department, the severity and the window asked", async () => {
    const plan = P({ depts: ["POL-GCP"], sev: ["Severe"], time: { said: "last two days", from: null, to: null, hours: null }, list: true });
    const d = await build(plan, [res({ ...plan.queries[0] }, { total: 2, totals: M(2) })]);
    const s = askZoneSlots(d, 13)!;
    expect((s.plan as Plan).queries).toEqual([expect.objectContaining({ zones: [13], depts: ["POL-GCP"], sev: ["Severe"], time: expect.objectContaining({ said: "last two days" }), list: true, by: null })]);
    expect(checkScreen({ recipe: "ask", ...s }, W, null)?.recipe).toBe("ask");
    expect(askZoneSlots({ ...d, recipe: "cases" }, 13)).toBeNull();
  });
  it("a backlog's own 90 days stay with the request, for what is asked next", async () => {
    const plan = P({ by: "zone", measure: "overdue" });
    const r = { ...ranked({ measure: "overdue" }) };
    r.q = { ...r.q, time: { said: "last 90 days", from: null, to: null, hours: null } };
    const d = await build(plan, [r]);
    expect(((d.slots as { plan?: Plan }).plan as Plan).queries[0].time?.said).toBe("last 90 days");
  });
  it("what the screen shows is told to the next turn, not its own requests", async () => {
    const d = await build(P({ by: "zone", measure: "severe", take: 2 }), [ranked({ take: 2 })]);
    const dig = stageDigest({ doc: d, back: [], views: {}, filter: null, narr: 0 });
    expect(dig).toMatch(/#1 Royapuram, #2 Kodambakkam/);
    expect(dig).not.toMatch(/"queries"/);
  });
});
