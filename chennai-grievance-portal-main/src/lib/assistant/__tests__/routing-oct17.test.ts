import { describe, expect, it } from "vitest";
import { directTool } from "@/lib/assistant/direct";
import { detectIntent } from "@/lib/assistant/intent";
import { topNFromText } from "@/lib/assistant/edits";
import { sidesOf } from "@/lib/assistant/compare";
import { periodNamed, roadNamed } from "@/lib/assistant/fastpath";
import { aliasRowIds, misboundFacts, mismeasuredFacts } from "@/lib/assistant/verify";

// Questions a 17 Oct stress test answered wrongly without a model: each is routed to the tool that answers it.
describe("rankings, pace, briefings and the weather ahead", () => {
  it.each([
    ["which ward has the most garbage complaints this month", "place_breakdown"],
    ["which taluk has highest severe incidents", "taluks"],
    ["which zone has the most road accidents this week", "zones"],
    ["what is the average resolution time for storm water drain department", "resolution_times"],
    ["which department resolves complaints fastest this month", "resolution_times"],
    ["how quickly does metrowater resolve complaints", "resolution_times"],
    ["brief me", "briefing"],
    ["give me a summary for today's meeting with commissioner", "briefing"],
    ["rain forecast for chennai this week", "environment"],
    ["will it rain tomorrow", "environment"]
  ])("%s -> %s", (q, tool) => expect(directTool(q)?.name).toBe(tool));

  it("asks IMD's warnings for the weather ahead", () => expect(directTool("will it rain tomorrow")?.args).toEqual({ metric: "imd_warning_level" }));

  it.each(["Which department is slowest?", "why did flooding rise in Adyar?"])("keeps %s on its own tool", (q) =>
    expect(directTool(q)?.name).not.toBe("resolution_times"));
});

describe("topics and filters", () => {
  it("reads a fire accident as a fire, not a road accident", () => expect(detectIntent("any fire accidents yesterday").topic?.key).toBe("fire"));
  it("reads people killed in a fire as a fire, not a murder", () => expect(detectIntent("two people killed in a house fire").topic?.key).toBe("fire"));
  it("still reads killed on the road as a road accident", () => expect(detectIntent("pedestrian killed by a lorry").topic?.key).toBe("accident"));
  it("reads mosquito complaints as disease", () => expect(detectIntent("mosquito complaints in perungudi").topic?.key).toBe("disease"));
  it("ranks kinds for the Tanglish 'enna prachanai adhigama'", () =>
    expect(detectIntent("chennai la ippo enna prachanai adhigama irukku").intent).toBe("CATEGORY_RANKING"));

  it.each([
    ["show me severe incidents that are still open for more than 7 days", 7],
    ["how many complaints are pending for more than 30 days", 30],
    ["cases unresolved longer than 2 weeks", 14]
  ])("%s: open, at least %i days old", (q, days) => {
    const d = detectIntent(q);
    expect(d.minOpenDays).toBe(days);
    expect(d.openOnly).toBe(true);
  });
  it("does not read 'open for more than 7 days' as the last 7 days", () => expect(periodNamed("severe incidents open for more than 7 days")).toBeNull());
  it("still reads 'in the last 7 days' as the week", () => expect(periodNamed("incidents in the last 7 days")).toBe("weekly"));
  it("has no age filter without one", () => expect(detectIntent("open incidents in the last 7 days").minOpenDays).toBeNull());
});

describe("follow-ups", () => {
  it.each([["only top 3", 3], ["just the top five", 5], ["top 3 only", 3], ["show first 10", 10]])("%s -> %i", (q, n) => expect(topNFromText(q)).toBe(n));
  it.each(["top 3 priority incidents in Adyar", "only Adyar", "make it a pie"])("%s is not a top-N edit", (q) => expect(topNFromText(q)).toBeNull());
  it("splits three zones after request words", () =>
    expect(sidesOf("give me numbers for zone 9 vs zone 10 vs zone 13")).toEqual(["zone 9", "zone 10", "zone 13"]));
});

describe("a figure belongs to the place its sentence names", () => {
  const names = { zone: new Map([["5", "Royapuram"], ["8", "Anna Nagar"]]), dept: new Map([["GCC-SWD", "Storm Water Drain"], ["CMWSSB", "Chennai Metrowater"]]) };
  it("flags another zone's figure in a sentence about Royapuram", () =>
    expect(misboundFacts("Royapuram has a large open load ({{zone.8.open}} open incidents).", names)).toHaveLength(1));
  it("accepts a sentence naming both zones", () =>
    expect(misboundFacts("Royapuram has {{zone.5.severe}} severe, against {{zone.8.severe}} in Anna Nagar.", names)).toEqual([]));
  it("does not judge a sentence that names no zone", () => expect(misboundFacts("It has {{zone.8.open}} open incidents.", names)).toEqual([]));
  it("checks departments too", () =>
    expect(misboundFacts("Chennai Metrowater took {{resolution.GCC-SWD.days}} days on average.", names)).toHaveLength(1));
  it("ignores facts that belong to no place", () => expect(misboundFacts("Royapuram: {{kpi.open}} open.", names)).toEqual([]));
});

describe("more routing", () => {
  it("sends the most overdue department to the backlog card", () => expect(directTool("which department has the most overdue cases")?.name).toBe("dept_backlog"));
  it("reads emergencies as the most serious incidents", () => expect(detectIntent("any emergencies right now?").intent).toBe("PRIORITY_INCIDENT_LIST"));
});

describe("live-run fixes (round 1 with the models)", () => {
  const facts = [{ id: "zone.9.open", label: "Open incidents in Teynampet", value: 199 }, { id: "zone.9.complaints", label: "Open citizen complaints in Teynampet", value: 112 }];
  it("flags open incidents written as complaints", () =>
    expect(mismeasuredFacts("Teynampet has the most open citizen complaints at {{zone.9.open}}.", facts)).toHaveLength(1));
  it("accepts complaints written as complaints", () =>
    expect(mismeasuredFacts("Teynampet leads with {{zone.9.complaints}} open citizen complaints.", facts)).toEqual([]));
  it("maps a dataset row cited as a fact to the fact", () =>
    expect(aliasRowIds("{{driver_places.0.n}} at Guindy", new Set(["place1.now"]))).toBe("{{place1.now}} at Guindy"));
  it("leaves an unknown row id alone", () => expect(aliasRowIds("{{driver_top.0.id}}", new Set(["top1.deaths"]))).toBe("{{driver_top.0.id}}"));

  it.each(["indha week enna nadandhuchu", "what happened this week", "இந்த வாரம் என்ன நடந்தது?"])("%s -> briefing", (q) => expect(directTool(q)?.name).toBe("briefing"));
  it("leaves one incident's story to the router", () => expect(directTool("what happened at velachery lake yesterday")).toBeNull());
  it("lists the oldest, not the top by priority", () => {
    const d = detectIntent("list the 10 oldest open complaints");
    expect(d.intent).toBe("INCIDENT_LIST");
    expect(d.n).toBe(10);
  });
  it("reads 'older than a week' as 7 days open", () => expect(detectIntent("show the open drainage complaints in Adyar older than a week").minOpenDays).toBe(7));
  it("counts dengue deaths", () => expect(detectIntent("any dengue deaths").intent).toBe("INCIDENT_COUNT"));
  it("knows OMR by its other names", () => expect(roadNamed("accidents on Rajiv Gandhi Salai")?.label).toBe("OMR (Rajiv Gandhi Salai)"));
  it("reads 'which one is most serious' after a list as the top of that list", () => {
    const d = detectIntent("which one is most serious", { lastIntent: "INCIDENT_LIST", resultIds: ["INC-1", "INC-2"], lastResponseType: "incident_list" } as never);
    expect([d.intent, d.n, d.refinement]).toEqual(["PRIORITY_INCIDENT_LIST", 1, true]);
  });
});

describe("live-run fixes (round 2 with the models)", () => {
  it.each([["top 3 departments by open incidents", "departments"], ["worst 5 zones", "zones"], ["is the garbage situation in Tondiarpet getting better?", "change_drivers"],
    ["What is the air quality today and is it getting worse?", "environment"]])("%s -> %s", (q, tool) => expect(directTool(q)?.name).toBe(tool));
  it("leaves a bare 'is it getting worse?' to the previous answer", () => expect(directTool("is it getting worse")).toBeNull());
  it("reads 'this month and last month' as the period against the one before", () =>
    expect(detectIntent("compare this month and last month for street light complaints").vsPrevious).toBe(true));
  it("counts the injured", () => expect(detectIntent("how many people were injured in road accidents last week").measure).toBe("injured"));
});

describe("live-run fixes (round 3 with the models)", () => {
  it("splits 'X compared to Y' into two places", () =>
    expect(sidesOf("how many open complaints does Anna Nagar have compared to Teynampet")).toEqual(["Anna Nagar", "Teynampet"]));
  it("leaves 'compared to last month' to the period comparison", () => expect(sidesOf("garbage complaints compared to last month")).toBeNull());
  it("sends 'fastest at closing complaints' to resolution times", () => expect(directTool("which department is fastest at closing complaints")?.name).toBe("resolution_times"));
});
