// v19 (25 Nov): what code holds the analyst's plan to. The owner's log of 25 Nov, 09:23 to 09:28, and the slips the first live evaluation made
// (a time said and left out of the request, a stray "take 1", "two" read as the second, "police complaints" as citizens' complaints)
import { describe, expect, it } from "vitest";
import type { World } from "../types";
import { analystTakes, notHeldReply } from "./route";
import { checkPlan, clockSaid, codePlan, followByCode, howMany, kindOfWord, ordinalAsked, planFromSlots, planKey, type Plan, type Query } from "./shape";

const W = {
  zones: [{ n: 8, name: "Anna Nagar", ta: "அண்ணா நகர்" }, { n: 13, name: "Adyar", ta: "அடையாறு" }, { n: 9, name: "Teynampet", ta: "தேனாம்பேட்டை" }],
  depts: [{ code: "POL-GCP", name: "Greater Chennai Police" }, { code: "GCC-SWM", name: "Solid Waste Management" }],
  cats: [{ code: "SOLID_WASTE", label: "Garbage & solid waste" }, { code: "ROAD_ACCIDENT", label: "Road accident" }, { code: "CRIME_VIOLENT", label: "Violent crime" }, { code: "CRIME_PROPERTY", label: "Theft, snatching & fraud" },
    { code: "TRAFFIC_OBSTRUCTION", label: "Traffic obstruction & parking" }, { code: "FIRE_EXPLOSION", label: "Fire & explosion" }, { code: "ROAD_DAMAGE", label: "Roads, footpaths & bridges" }],
  taluks: [{ code: "TLK-VLC", name: "Velachery" }], places: [], reservoirs: []
} as unknown as World;
const Q = (x: Partial<Query> = {}): Query => ({ of: "incidents", zones: [], place: null, ward: null, taluk: null, depts: [], not: [], group: null, cats: [], sev: [], status: null, from: null, harm: null, words: [], item: null, time: null, clock_from: null, clock_to: null, older_days: null, level: null, measure: "count", by: null, per: null,
  order: "most", rank: null, take: null, list: false, sort: "priority", before: false, ...x });
const P = (q: Partial<Query> | Partial<Query>[], x: Partial<Plan> = {}): Plan => ({ understood: "", kind: "answer", view: null, gap: null, title: "t", title_ta: "t", queries: (Array.isArray(q) ? q : [q]).map(Q), ...x });
const one = (text: string, q: Partial<Query>, understood = text) => checkPlan(P(q, { understood }), W, text).queries[0];

describe("the position asked", () => {
  it.each([["Okay, tell me the. Second highest congested street now.", 2], ["third worst zone for garbage", 3], ["the 2nd most overdue department", 2], ["எந்த ஏரியால ரெண்டாவது அதிக குப்பை புகார்", 2], ["rendavadhu worst area", 2]] as const)("%s", (t, n) => expect(ordinalAsked(t)).toBe(n));
  it.each(["open the second one", "on the 3rd of October", "cases in Second Street", "the highest", "top two areas"])("not a position: %s", (t) => expect(ordinalAsked(t)).toBeNull());
  it("is in the request whatever the model wrote, and never with a number beside it", () => {
    expect(one("second highest congested street now", { of: "traffic", by: "road", measure: "delay", rank: null, take: 1 })).toMatchObject({ rank: 2, take: null });
  });
  it("is never made of a number: 'only two' is two of them, not the second", () => {
    expect(one("மொத்தமா 5-ன்னு காமிக்குது. 2-ன்னு கேட்டா 2 மட்டும் கொண்டு வர மாதிரி பண்ணு.", { by: "zone", rank: 2 }, "Show only two areas, not five.")).toMatchObject({ rank: null, take: 2 });
  });
});

describe("how many, and the list", () => {
  it("top two is two", () => expect(one("top two area with most severe incidents last two two days.", { by: "zone", measure: "severe" }).take).toBe(2));
  it("a list is never cut to a number nobody said", () => expect(one("Show me only the police incidents in Adyar for the last two days.", { list: true, zones: [13], depts: ["POL-GCP"], take: 1 }).take).not.toBe(1));
  it("the latest one is one", () => expect(one("show the latest police case", { list: true, depts: ["POL-GCP"], take: 1 }).take).toBe(1));
});

describe("how many of the split's things a request asks for", () => {
  it.each([["Which area has the most police incidents?", "zone", 1], ["Which department takes the longest to close its cases?", "dept", 1], ["Name the two zones with the fewest incidents in the last 7 days", "zone", 2], ["Tell me the three biggest traffic jams right now", "road", 3],
    ["cheapest vegetable in Anna Nagar market", "item", 1], ["Which day last week had the most incidents?", "day", 1], ["What is the one most congested road now?", "road", 1]] as const)("%s", (t, by, n) => expect(howMany(t, by)).toBe(n));
  it.each([["Which areas have the most police incidents?", "zone"], ["police incidents by area", "zone"], ["Show the trend day by day", "day"], ["all the jams in the city", "road"], ["zones with more than 5 cases", "zone"], ["garbage complaints zone wise", "zone"]] as const)("not said: %s", (t, by) => expect(howMany(t, by)).toBeNull());
  it("goes into the request when the model left it out", () => {
    expect(one("மூணு பெரிய டிராஃபிக் ஜாம் சொல்லு", { of: "traffic", by: "road", measure: "delay" }, "Tell me the three biggest traffic jams right now").take).toBe(3);
    expect(one("Which department takes the longest to close its cases?", { by: "dept", measure: "days_to_close" }).take).toBe(1);
    expect(one("which areas are worst for garbage", { by: "zone", take: 1 }).take).toBeNull();
  });
});

describe("hours of the clock", () => {
  it.each([["between 6 pm and 9 pm", [18, 21]], ["from 6 to 9 in the evening", [18, 21]], ["between 10 am and 1 pm", [10, 13]], ["from 9 pm to 12 am", [21, 24]]] as const)("%s", (t, c) => expect(clockSaid(t)).toEqual(c));
  it.each(["between 10 and 15 November", "from 1 to 5", "between Adyar and Guindy"])("not a clock: %s", (t) => expect(clockSaid(t)).toBeNull());
  it("go into the request", () => expect(one("how many cases came between 6 pm and 9 pm", {})).toMatchObject({ clock_from: 18, clock_to: 21 }));
});

describe("why", () => {
  it("asks the same limits three ways, so the answer can say what makes it up", () => {
    const p = checkPlan(P({ depts: ["POL-GCP"], zones: [13] }, { understood: "Why are there so many police cases in Adyar?" }), W, "why so many?");
    expect(p.queries.map((q) => q.by)).toEqual([null, "kind", "place"]);
    expect(p.queries.every((q) => q.depts[0] === "POL-GCP" && q.zones[0] === 13 && q.before)).toBe(true);
  });
});

describe("two sides", () => {
  it("both get the time the sentence says", () => {
    const p = checkPlan(P([{ depts: ["POL-GCP"] }, { cats: ["FIRE_EXPLOSION"] }], { understood: "Compare police and fire incidents in the last 7 days" }), W, "Compare police and fire incidents in the last 7 days");
    expect(p.queries.map((q) => !!q.time?.said)).toEqual([true, true]);
  });
  it("one area split by area is that area", () => expect(one("severe cases in Adyar this week", { zones: [13], by: "zone" }).by).toBeNull());
  it("'compared to last week' is the week against the one before", () => expect(one("Did severe incidents go up or down compared to last week?", { sev: ["Severe"] })).toMatchObject({ before: true, time: { said: "last 7 days" } }));
});

describe("what was said is in the request", () => {
  it("the police, when the model left them out", () => expect(one("How many police cases in Adyar?", { zones: [13] }).depts).toEqual(["POL-GCP"]));
  it("never from a police station named as a place", () => expect(one("complaints near the Adyar police station", {}).depts).toEqual([]));
  it("the area, when the model left it out", () => expect(one("how many cases in Teynampet", {}).zones).toEqual([9]));
  it.each([["How many police incidents happened in Teynampet in the last 48 hours?"], ["Top 4 localities for drainage problems this month"], ["Which day last week had the most incidents?"]])("the time, when the model left it out: %s", (t) => expect(one(t, { by: "zone" }).time?.said).toBeTruthy());
  it("a time with no words is no time (the model's hours 24 for a question that said none)", () => expect(one("Which area has higher police complaints?", { by: "zone", time: { said: null, from: null, to: null, hours: 24 } }).time).toBeNull());
  it("police complaints and garbage complaints are incidents; citizens' complaints are complaints", () => {
    expect(one("Which area has higher police complaints?", { depts: ["POL-GCP"], measure: "complaints", by: "zone" }).measure).toBe("count");
    expect(one("which area has the most citizen complaints", { measure: "complaints", by: "zone" }).measure).toBe("complaints");
  });
  it("a kind's own word is the kind, as the dashboard counts it; a narrower word stays a word", () => {
    expect(one("second worst zone for garbage complaints", { group: "WASTE_SANITATION", words: ["garbage", "waste"], by: "zone" })).toMatchObject({ cats: ["SOLID_WASTE"], group: null, words: [] });
    expect(one("what time do most accidents happen", { group: "ROADS_TRAFFIC", words: ["accident", "collision"], by: "hour" })).toMatchObject({ cats: ["ROAD_ACCIDENT"], words: [] });
    expect(one("how many murders this month", { cats: ["CRIME_VIOLENT"], words: ["murder", "killed"] })).toMatchObject({ cats: ["CRIME_VIOLENT"], group: null });
    expect(one("how many murders this month", { group: "CRIME", words: ["murder", "killed"] }).words).not.toContain("killed");
    expect(kindOfWord("chain snatching", W, null)).toBeNull();
  });
  it("a code no one knows is dropped", () => expect(one("x", { zones: [99], depts: ["NOPE"], cats: ["NOPE"], group: "NOPE", taluk: "NOPE" })).toMatchObject({ zones: [], depts: [], cats: [], group: null, taluk: null }));
});

describe("a click's plan", () => {
  it("is kept as it was built", () => {
    const p = P({ zones: [13], time: { said: null, from: "2026-11-20", to: "2026-11-20", hours: null }, list: true, rank: null });
    expect(checkPlan(p, W, "").queries[0]).toMatchObject({ zones: [13], time: { from: "2026-11-20" }, list: true });
  });
  it("reads back from a screen's slots, and nothing else does", () => {
    const p = P({ by: "zone", take: 2 });
    expect(planFromSlots(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(planFromSlots({ queries: [] })).toBeNull();
    expect(planFromSlots(null)).toBeNull();
    expect(planFromSlots({ ...p, queries: [{ ...p.queries[0], of: "passwords" }] })).toBeNull();
  });
});

describe("a follow-up with no model", () => {
  const last = P({ of: "traffic", by: "zone", measure: "jams", take: 1 });
  it("'tell me all' after the worst area is every jam", () => expect(followByCode("Tell me all.", last)?.queries[0]).toMatchObject({ by: "road", take: 99, rank: null }));
  it("'the second'", () => expect(followByCode("and the second?", last)?.queries[0]).toMatchObject({ rank: 2, take: null }));
  it("'only two'", () => expect(followByCode("only two", P({ by: "zone", measure: "severe" }))?.queries[0]).toMatchObject({ take: 2, rank: null }));
  it("another area, severity or window, when nothing else is said", () => {
    const p = P({ sev: ["Severe"], zones: [8], time: { said: "this week", from: null, to: null, hours: null } });
    expect(followByCode("And in Adyar?", p, W)?.queries[0]).toMatchObject({ zones: [13], sev: ["Severe"], time: { said: "this week" } });
    expect(followByCode("only the severe ones", P({ zones: [8] }), W)?.queries[0]).toMatchObject({ zones: [8], sev: ["Severe"] });
    expect(followByCode("what about last month", p, W)?.queries[0]).toMatchObject({ zones: [8], time: { said: "what about last month" } });
    expect(followByCode("only zone 5", P({ zones: [8] }), W)?.queries[0]).toMatchObject({ zones: [5] });
    for (const t of ["what about 3rd November deaths", "show all police cases in Adyar"]) expect(followByCode(t, P({ by: "zone", take: 5 }), W)).toBeNull();
  });
  it("a question of its own, or nothing before it, is not one", () => {
    expect(followByCode("How many murders were there in all of Chennai this month and where?", last)).toBeNull();
    expect(followByCode("tell me all", null)).toBeNull();
  });
});

describe("with no model at all, the words alone still make the exact request", () => {
  it.each([
    ["What are the seven severe events today?", { of: "incidents", sev: ["Severe"], list: true, by: null }],
    ["Which area is? Highly congested traffic.", { of: "traffic", by: "zone", measure: "jams" }],
    ["Tell me one area which is very congested now.", { of: "traffic", by: "zone", take: 1 }],
    ["Okay, tell me the. Second highest congested street now.", { of: "traffic", by: "road", rank: 2, take: null }],
    ["top two area with most severe incidents last two two days.", { of: "incidents", by: "zone", sev: ["Severe"], take: 2 }],
    ["Which area has higher police complaints?", { of: "incidents", by: "zone", depts: ["POL-GCP"] }],
    ["Show me only the police incidents in Adyar for the last two days.", { zones: [13], depts: ["POL-GCP"], list: true, by: null, take: null }],
    ["How many police incidents happened in Teynampet in the last 48 hours?", { zones: [9], depts: ["POL-GCP"], by: null }]
  ] as const)("%s", (t, want) => expect(codePlan(t, W)?.queries[0]).toMatchObject(want));
  it("keeps the time the sentence says", () => expect(codePlan("Show me only the police incidents in Adyar for the last two days.", W)?.queries[0].time?.said).toBeTruthy());
  it.each(["Give me the summary of Adyar", "why are there so many cases in Adyar", "open the news", "Where should I concentrate today?", "thank you Jarvis", "show the traffic on the map", "what is the weather"])("never for a whole screen, a move or talk: %s", (t) => expect(codePlan(t, W)).toBeNull());
  it("'2 மட்டும்' in a long sentence is two of the last answer", () => expect(followByCode("யா, மொத்தமா 5-ன்னு காமிக்குது. 2-ன்னு கேட்டா 2 மட்டும் கொண்டு வர மாதிரி பண்ணு.", P({ by: "zone", measure: "severe", take: 5 }))?.queries[0].take).toBe(2));
});

describe("which turns the analyst answers", () => {
  const a = P({ by: "zone" });
  it("every question the records answer, whatever the reader called it", () => { for (const ask of ["cases", "ranking", "city", "focus", "summary", "situation", "other", "follow_up", "tasks"] as const) expect(analystTakes({ ask }, a, "which area has the most police cases")).toBe("answer"); });
  it("never a chat, a move, an act on the screen, the Collector's own data or general knowledge", () => { for (const ask of ["chat", "meta", "navigate", "stage_op", "repeat", "unclear", "dataset", "nearby", "general"] as const) expect(analystTakes({ ask }, a, "x")).toBe("never"); });
  it("a whole ready screen stays with its lane", () => expect(analystTakes({ ask: "summary" }, P([], { kind: "view", view: "summary" }), "summary of Anna Nagar")).toBe("no"));
  it("live traffic on the map stays the Traffic view; the second worst road does not", () => {
    expect(analystTakes({ ask: "city" }, P({ of: "traffic", by: "road" }), "show live traffic on the map")).toBe("no");
    expect(analystTakes({ ask: "city" }, P({ of: "traffic", by: "road", rank: 2 }), "show the second worst jam on the map")).toBe("answer");
  });
  it("what the records do not hold is said, with no figure", () => {
    const p = P([], { kind: "not_held", gap: "the population of 12 zones" });
    expect(analystTakes({ ask: "cases" }, p, "population")).toBe("not_held");
    expect(analystTakes({ ask: "news" }, p, "population")).toBe("no");
    expect(notHeldReply(p, "en")).not.toMatch(/\d/);
    expect(notHeldReply(p, "ta")).toMatch(/இல்லை/);
  });
});

describe("the review's sentences (25 Nov): a guard never changes what was right", () => {
  const list = { list: true, cats: ["CRIME_PROPERTY"] };
  it.each(["Show me the latest theft cases in Adyar", "What are the latest fire incidents?", "What are the worst accident cases this month"])("a plural list stays a list: %s", (t) => expect(one(t, list).take).toBeNull());
  it("a death count stays one", () => expect(one("How many people died in the last month road accident cases", { measure: "deaths", cats: ["ROAD_ACCIDENT"] })).toMatchObject({ measure: "deaths", take: null }));
  it.each(["Apart from the police, which department has the most overdue cases?", "Which department has more pending cases than the police?", "Not only police, all departments"])("a department set apart is no filter: %s", (t) => expect(one(t, { by: "dept", measure: "overdue" }).depts).toEqual([]));
  it("a police station is a place, in Tamil too", () => expect(one("அண்ணா நகர் காவல் நிலையம் அருகே எத்தனை குப்பை புகார்", { cats: ["SOLID_WASTE"], zones: [8] }, "How many garbage complaints near the Anna Nagar police station").depts).toEqual([]));
  it("not only Adyar is the whole district", () => expect(one("Not only Adyar, the whole of Chennai", {}).zones).toEqual([]));
  it.each(["why is it showing five, I asked for two", "Which area has the most police cases and why?"])("why, about the screen or beside which: %s", (t) => expect(checkPlan(P({ by: "zone", measure: "severe", take: 2 }, { understood: t }), W, t).queries).toHaveLength(1));
  it("an attempted murder is not a murder, and தற்கொலை is a suicide", () => {
    expect(one("How many attempted murder cases this month?", { words: ["attempted murder"], cats: ["CRIME_VIOLENT"] }).words).toEqual(["attempted murder"]);
    expect(one("இந்த மாதம் எத்தனை தற்கொலை நடந்தது", { words: ["suicide", "தற்கொலை"] }, "How many suicides this month").words).not.toContain("murder");
  });
  it.each([["Between 6 pm and 9 pm which area has the most accidents?", 1], ["On 20 November which area had the most police incidents?", 1], ["In zone 9 which ward has the most garbage complaints?", 1]] as const)("a time, a date or a zone's number is no number of things: %s", (t, n) => expect(one(t, { by: /ward/.test(t) ? "ward" : "zone", take: 1 }).take).toBe(n));
  it("the highest and the second highest are two; not the second is the first", () => {
    expect(one("Tell me the highest and the second highest areas for theft", { by: "zone", take: 2 })).toMatchObject({ take: 2, rank: null });
    expect(one("No, not the second highest, the highest one", { by: "zone", take: 1 }).rank).toBeNull();
  });
  it("people who complained are citizens' complaints", () => expect(one("How many people have complained about garbage this week?", { measure: "complaints", from: "citizens", cats: ["SOLID_WASTE"] })).toMatchObject({ measure: "complaints", from: "citizens" }));
  it("two parts keep their own sources", () => expect(checkPlan(P([{ of: "lakes", item: "Chembarambakkam", measure: "latest" }, { place: "Chembarambakkam" }], { understood: "u" }), W, "How full is Chembarambakkam lake and are there any complaints about it?").queries.map((q) => q.of)).toEqual(["lakes", "incidents"]));
  it("two days set side by side, or a daily trend, are no one window", () => {
    expect(one("Are there more accidents on Saturday or Sunday?", { by: "weekday" }).time).toBeNull();
    expect(one("Show the daily trend of dengue cases", { by: "day" }).time).toBeNull();
    expect(one("show the thefts last weekend", { list: true }).time?.said).toMatch(/weekend/);
  });
  it("pending for more than a month is a wait, not a window", () => expect(one("how many cases are pending with PWD for more than a month", {}, "How many cases are pending with PWD for more than a month?")).toMatchObject({ older_days: 30, time: null, status: "open" }));
  it("one window for every part of a screen: a backlog's 90 days for the total beside its ranking", () => {
    expect(planKey(P([{ status: "overdue" }, { status: "overdue", by: "dept" }]), "daily")).toBe("quarterly");
    expect(planKey(P([{ sev: ["Severe"] }]), "daily")).toBe("daily");
    expect(planKey(P([{ sev: ["Severe"], time: { said: "last 7 days", from: null, to: null, hours: null } }]), "daily")).toBe("daily");
  });
});

describe("the second read of the review (25 Nov)", () => {
  it.each(["What are the latest theft, murder and fire cases", "Show me the latest accident list", "Which are the worst fire-related incidents", "How many cases came in the last one week"])("no single case: %s", (t) => expect(one(t, { list: true }).take).toBeNull());
  it.each(["the latest police case", "the oldest pending case", "Show me the last severe incident"])("a single case: %s", (t) => expect(one(t, { list: true }).take).toBe(1));
  it("after the police is the one after them", () => expect(one("After the police, which department has the most cases?", { by: "dept", rank: 2 })).toMatchObject({ rank: 2, depts: [] }));
  it.each(["How many cases not handled by the police this week", "How many non-police cases today"])("not the police's: %s", (t) => expect(one(t, {}).depts).toEqual([]));
  it("words about the police are the search, not only their department", () => expect(one("How many attacks on police officers this month", { words: ["attack on police", "police attacked"] }).words.length).toBeGreaterThan(0));
  it("a corporation building's collapse is no department filter", () => expect(one("corporation building collapse cases", { cats: ["BUILDING_SAFETY"] }).depts).toEqual([]));
  it("everywhere but Adyar is not Adyar", () => expect(one("cases everywhere but Adyar", {}).zones).toEqual([]));
  it.each(["Why is it all incidents? Only police", "Why are there five? give only one area", "ஏன் எல்லா டிபார்ட்மெண்டும் வருது, போலீஸ் மட்டும்"])("a correction is no reason question: %s", (t) => expect(checkPlan(P({ list: true, depts: ["POL-GCP"] }, { understood: t }), W, t).queries).toHaveLength(1));
  it("why keeps its own measure", () => expect(checkPlan(P({ measure: "days_to_close", depts: ["POL-GCP"] }, { understood: "Why do the police take so long to close cases" }), W, "Why do the police take so long to close cases").queries[0].measure).toBe("days_to_close"));
  it("the highest and the second highest are two, either way round", () => {
    for (const t of ["the top area and the second highest area for theft", "the second highest and the highest areas"]) expect(one(t, { by: "zone", take: 1 })).toMatchObject({ take: 2, rank: null });
    expect(checkPlan(P([{ by: "zone", rank: 2 }, { by: "zone", rank: 3 }], { understood: "u" }), W, "the second and third highest areas for theft").queries.map((q) => q.rank)).toEqual([2, 3]);
    expect(checkPlan(P([{ by: "zone", rank: 2, words: ["theft"] }, { by: "dept", rank: 2 }], { understood: "u" }), W, "Second highest area for theft and second highest department").queries.map((q) => q.rank)).toEqual([2, 2]);
  });
  it("two wheelers are no two", () => expect(one("Show two wheeler theft area wise", { by: "zone" }).take).toBeNull());
  it("a Tamil sentence of its own is no follow-up", () => {
    const last = P({ by: "zone", take: 5 });
    for (const t of ["அடையாறுல எல்லா போலீஸ் கேஸும் காட்டு", "மண்டலம் 5 மட்டும்", "அடுத்த வாரம் மழை வருமா"]) expect([t, followByCode(t, last)]).toEqual([t, null]);
    expect(followByCode("ரெண்டாவது எது?", last)?.queries[0].rank).toBe(2);
    expect(followByCode("எல்லாத்தையும் சொல்லு", last)?.queries[0].take).toBe(99);
  });
  it("people who complained, in spoken Tamil", () => expect(one("குப்பை பத்தி எத்தனை பேரு கம்ப்ளைன்ட் பண்ணாங்க", { measure: "complaints", cats: ["SOLID_WASTE"] }, "How many people complained about garbage").measure).toBe("complaints"));
  it("each request keeps its own wait and window", () => {
    const qs = checkPlan(P([{ status: "open", older_days: 30 }, { status: "resolved", time: { said: "this month", from: null, to: null, hours: null } }], { understood: "u" }), W, "How many cases pending for more than a month and how many are resolved this month").queries;
    expect(qs[0].older_days).toBe(30);
    expect(qs[1]).toMatchObject({ older_days: null, time: { said: "this month" } });
  });
  it.each(["garbage plus toilet complaints"])("two kinds stay two: %s", (t) => expect(one(t, { group: "WASTE_SANITATION" }).group).toBe("WASTE_SANITATION"));
  it.each(["Which month had the most thefts?", "Show thefts month on month"])("a split is no window: %s", (t) => expect(one(t, { by: "month" }).time).toBeNull());
  it("attempted murder keeps its words", () => expect(one("How many murder attempts", { words: ["murder attempt"], cats: ["CRIME_VIOLENT"] }).words).toEqual(["murder attempt"]));
});

describe("what is left out, and what a follow-up keeps", () => {
  it.each([["Which department other than the police has the most cases this week?", ["POL-GCP"]], ["incidents everywhere but Adyar", ["13"]], ["cases excluding the police", ["POL-GCP"]]] as const)("%s", (t, not) => expect(one(t, { by: /department/.test(t) ? "dept" : null })).toMatchObject({ not, depts: [], zones: [] }));
  it.each(["Which department has more pending cases than the police?", "show police cases in Adyar"])("nothing is left out of: %s", (t) => expect(one(t, { by: /department/.test(t) ? "dept" : null }).not).toEqual([]));
  it("a follow-up with no time of its own keeps the window of what it follows", () => {
    const last = P({ by: "zone", status: "overdue", time: { said: "last 90 days", from: null, to: null, hours: null } });
    expect(checkPlan(P({ zones: [13], status: "overdue" }, { understood: "How many overdue cases are there in Adyar now?" }), W, "and in Adyar?", { last }).queries[0].time?.said).toBe("last 90 days");
    expect(checkPlan(P({ zones: [13], sev: ["Severe"] }, { understood: "Severe cases in Adyar" }), W, "How many severe cases are there in Adyar", { last }).queries[0].time).toBeNull();
    expect(checkPlan(P({ zones: [13], status: "overdue" }, { understood: "in Adyar today" }), W, "and in Adyar today?", { last }).queries[0].time?.said).not.toBe("last 90 days");
  });
  it.each([["what are the three newest severe cases in Perungudi", 3], ["Show me the oldest three news reports on Adyar this week", 3]] as const)("a number said beside newest or oldest is kept: %s", (t, n) => expect(one(t, { list: true, of: /news/.test(t) ? "news" : "incidents" }).take).toBe(n));
  it("which cases have waited longest is the list, the oldest first", () => expect(one("which police cases are waiting the longest", { list: true, measure: "days_open", sort: "oldest", depts: ["POL-GCP"] }).measure).toBe("count"));
});

describe("with no model, a limit the words say is never dropped (25 Nov, the last live run)", () => {
  it.each([
    ["Which area has the most incidents on Anna Salai in the last 30 days?", { by: "zone", place: "Anna Salai", take: 1 }],
    ["What is the worst area for each department this month?", { by: "zone", per: "dept" }],
    ["What share of incidents does Adyar have in the last 7 days", { measure: "share", zones: [13] }],
    ["Which month since 15 August had the fewest incidents?", { by: "month", order: "least" }],
    ["how many people were injured in accidents on GST road this month", { measure: "injured", place: "GST road" }],
    ["which police cases are waiting the longest", { depts: ["POL-GCP"], status: "open", sort: "oldest", list: true }],
    ["how many cases did the police close yesterday", { depts: ["POL-GCP"], status: "resolved" }],
    ["Which department other than the police has the most cases this week?", { by: "dept", not: ["POL-GCP"], depts: [] }],
    ["Which area had the most closed roads in the last two days", { of: "traffic", by: "zone", level: "closed", take: 1 }]
  ] as const)("%s", (t, want) => expect(codePlan(t, W)?.queries[0]).toMatchObject(want));
});

describe("the live check of 25 Nov, 10 PM", () => {
  it("the fire service is no department of these records: fire incidents, and said so", () => {
    const p = checkPlan(P({ depts: ["GCC-FWD"], cats: ["FIRE_EXPLOSION"], status: "resolved" }, { understood: "How many cases did the fire department close yesterday?" }), W, "how many cases did the fire department close yesterday");
    expect(p.queries[0]).toMatchObject({ depts: [], cats: ["FIRE_EXPLOSION"], status: "resolved" });
    expect(p.gap).toMatch(/fire service/);
    expect(checkPlan(p, W, "").gap).toMatch(/fire service/);
    expect(checkPlan(P({ cats: ["FIRE_EXPLOSION"] }, { understood: "u", gap: "nothing" }), W, "how many fires this week").gap).toBeNull();
  });
});
