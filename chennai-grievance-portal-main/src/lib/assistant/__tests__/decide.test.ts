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

describe("“why” questions get the evidence pack", () => {
  it("“why is Adyar high?” runs change_drivers for the zone", () => {
    const p = planFromDecision(route({ answer: "explain_why" }), "why is Adyar so high", null, 13);
    expect(p?.tools?.[0].name).toBe("change_drivers");
    expect((p?.tools?.[0].args.scope as { zone: number }).zone).toBe(13);
  });
  it("“what changed?” without a place stays district-wide", () => {
    const p = planFromDecision(route({ answer: "explain_why" }), "what changed since last week", null, null);
    expect((p?.tools?.[0].args.scope as { zone: number | null }).zone).toBeNull();
  });
});

describe("a window in the question's own words", () => {
  it("“last 10 days” is 240 hours, inside the 30-day period", async () => {
    const { customWindow } = await import("@/lib/assistant/fastpath");
    expect(customWindow("how many crimes in Velachery in the last 10 days")).toEqual({ hours: 240, label: "last 10 days", period: "monthly" });
    expect(customWindow("past 3 weeks")).toMatchObject({ hours: 504, label: "last 3 weeks" });
    expect(customWindow("கடந்த 10 நாட்கள் கொலை")).toMatchObject({ hours: 240 });
  });
  it("the console's own periods and no window give null", async () => {
    const { customWindow } = await import("@/lib/assistant/fastpath");
    expect(customWindow("last 7 days")).toBeNull();
    expect(customWindow("last 30 days")).toBeNull();
    expect(customWindow("how many crimes in Velachery")).toBeNull();
  });
});

describe("contact questions go to the officials' directory", () => {
  it("recognises contact phrasing, not counts or officer checks", async () => {
    const { CONTACT } = await import("@/lib/assistant/pipeline");
    for (const q of ["contact of health department", "who is the officer for PWD in Adyar", "health department officer", "helpline for flooding", "who handles drainage in Zone 9"])
      expect(CONTACT.test(q), q).toBe(true);
    for (const q of ["number of road accidents this week", "incidents not confirmed by an officer", "how many health incidents", "what is the Black Flag March"])
      expect(CONTACT.test(q), q).toBe(false);
  });
});

describe("“recent” is the last day, not the chat's default 90 days", () => {
  it("the router's copied period is dropped when the words name none", () => {
    const p = planFromDecision(route({ answer: "news_list" }, { scopeRaw: { period: "quarterly" } }), "tell me about recent news", null, null);
    expect(p?.fast?.period).toBeNull();
  });
  it("a period the words name is kept", () => {
    const p = planFromDecision(route({ answer: "news_list" }, { scopeRaw: { period: "monthly" } }), "top news this month", null, null);
    expect(p?.fast?.period).toBe("monthly");
  });
});
