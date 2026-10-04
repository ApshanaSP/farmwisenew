import { describe, expect, it } from "vitest";
import { planFromDecision, type Decision, type RouteLike } from "@/lib/assistant/decide";
import { contextForRouter, type ConversationContext } from "@/lib/assistant/context";

const scope = { period: "daily", zone: null, dept: null, cat: null, taluk: null } as RouteLike["scope"];
const decision = (d: Partial<Decision>): Decision => ({ answer: "other", incidentId: null, storyId: null, find: null, count: null, focus: "all",
  openOnly: false, severity: null, options: [], ...d });
const route = (d: Partial<Decision>, extra: Partial<RouteLike> = {}): RouteLike =>
  ({ intent: "tool_question", scope, scopeRaw: {}, tools: [], clarify: null, decision: decision(d), ...extra });

const afterList: ConversationContext = {
  lastIntent: "INCIDENT_LIST", lastResponseType: "incident_list", activeFilters: { period: "daily", zone: 8 },
  resultIds: ["INC-A1", "INC-B2", "INC-C3"], resultTitles: ["Canal overflow – Anna Nagar Macro Drain", "Mosquito menace – N Block", "Theft – Chetpet"]
};
const selected: ConversationContext = { ...afterList, lastResponseType: "incident_detail", selectedIncidentId: "INC-B2", selectedTitle: "Mosquito menace – N Block" };

describe("“Explain about the Anna Nagar issue”", () => {
  it("without context, read as an area overview: the zone's snapshot, not a list", () => {
    const p = planFromDecision(route({ answer: "area_summary" }), "explain about the anna nagar issue", null, 8);
    expect(p?.tools?.[0].name).toBe("zone_profile");
    expect(p?.tools?.[0].args.zone).toBe(8);
    expect(p?.fast).toBeUndefined();
  });
  it("with a selected incident, explains that incident", () => {
    const p = planFromDecision(route({ answer: "incident_explain", incidentId: "INC-B2" }), "explain that issue", selected, 8);
    expect(p?.tools?.[0]).toMatchObject({ name: "incident_story", args: { text: "INC-B2" } });
  });
  it("with several plausible incidents, asks one question with the choices", () => {
    const p = planFromDecision(route({ answer: "clarify", options: ["Explain the canal overflow", "Summarise Anna Nagar today"] },
      { clarify: "Which Anna Nagar issue do you mean?" }), "the anna nagar issue", afterList, 8);
    expect(p?.clarify).toEqual({ question: "Which Anna Nagar issue do you mean?", options: ["Explain the canal overflow", "Summarise Anna Nagar today"] });
  });
  it("described in words, finds it by meaning", () => {
    const p = planFromDecision(route({ answer: "incident_explain", find: "canal overflow in Anna Nagar" }), "the anna nagar canal issue", null, 8);
    expect(p?.tools?.[0]).toMatchObject({ name: "incident_story", args: { text: "canal overflow in Anna Nagar" } });
  });
});

describe("ids come from the conversation, never from the model", () => {
  it("an id the Collector was never shown is not used", () => {
    const p = planFromDecision(route({ answer: "incident_explain", incidentId: "INC-MADEUP", focus: "status" }), "is it resolved?", afterList, null);
    expect(p).toBeNull();
  });
  it("“the second one” resolves to item 2 of the list shown", () => {
    const p = planFromDecision(route({ answer: "incident_explain", incidentId: "INC-B2", focus: "status" }), "is the second one resolved?", afterList, null);
    expect(p?.fast).toMatchObject({ intent: "INCIDENT_DETAIL", incidentId: "INC-B2", focus: "status" });
  });
  it("an id the Collector typed is used", () => {
    const p = planFromDecision(route({ answer: "incident_explain", incidentId: "INC-20261004-983F0B", focus: "who" }), "who handles INC-20261004-983F0B?", null, null);
    expect(p?.fast).toMatchObject({ incidentId: "INC-20261004-983F0B", focus: "who" });
  });
  it("a story id outside the last news list is dropped; a description still finds the story", () => {
    const p = planFromDecision(route({ answer: "news_story", storyId: "S-INVENTED", find: "Odisha worker stabbed" }), "about that odisha worker news", null, null);
    expect(p?.fast).toMatchObject({ intent: "NEWS_DETAIL", storyId: null, find: "Odisha worker stabbed" });
  });
});

describe("follow-ups keep the conversation", () => {
  it("“what about last week?” after a list repeats that list with the change", () => {
    const p = planFromDecision(route({ answer: "other" }, { intent: "plan_edit", scopeRaw: { period: "weekly" } }), "what about last week?", afterList, null);
    expect(p?.fast).toMatchObject({ intent: "INCIDENT_LIST", refinement: true, period: "weekly" });
  });
  it("the router is told the numbered list and the selection", () => {
    const s = contextForRouter(selected);
    expect(s).toContain("Selected incident: INC-B2 (Mosquito menace – N Block)");
    expect(s).toContain("2. INC-B2: Mosquito menace – N Block");
  });
});
