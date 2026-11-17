import { describe, expect, it } from "vitest";
import { asks7, whoHas } from "./asks7";
import { WORLD } from "./fixture";

const r = (s: string) => { const a = asks7(s, WORLD); return a ? { recipe: a.recipe, ...a.slots } : null; };

describe("v7: the owner's question shapes reach the right facts in code", () => {
  it("compare everything: every zone side by side", () => {
    for (const s of ["compare everything", "Jarvis, compare all the zones", "how do the zones compare", "zone-wise comparison", "compare all zones this month", "எல்லா மண்டலங்களையும் ஒப்பிடு", "ella zone um compare pannu"])
      expect(r(s), s).toMatchObject({ recipe: "performance", by: "zone" });
    expect(r("compare all zones this month")).toMatchObject({ period: "monthly" });
  });
  it("compare the departments", () => {
    for (const s of ["compare all departments", "how do the departments compare", "department-wise comparison", "துறைகளை ஒப்பிடு"]) expect(r(s), s).toMatchObject({ recipe: "performance", by: "dept" });
  });
  it("this period against the last: what changed, and where", () => {
    expect(r("compare this week with last week")).toMatchObject({ recipe: "changed", period: "weekly" });
    expect(r("today vs yesterday")).toMatchObject({ recipe: "changed", period: "daily" });
    expect(r("compare this month with last month in Adyar")).toMatchObject({ recipe: "changed", period: "monthly", zones: [13] });
  });
  it("why one place is worse than another: the two side by side", () => {
    expect(r("why is Adyar worse than Anna Nagar")).toMatchObject({ recipe: "compare", zones: [13, 8] });
    expect(r("அடையாறு ஏன் அண்ணா நகரை விட மோசமா இருக்கு")).toMatchObject({ recipe: "compare" });
  });
  it("the X issue: the case that matters most there, explained", () => {
    for (const s of ["what's the Adyar issue", "what is the issue in Adyar", "tell me about the Adyar problem", "Adyar issue enna", "அடையாறு பிரச்சினை என்ன"])
      expect(r(s), s).toMatchObject({ recipe: "explain", zones: [13] });
  });
  it("leaves everything else to the lanes that already read it", () => {
    for (const s of ["show the severe cases in Adyar", "compare Adyar and Anna Nagar", "what changed since yesterday", "go to trends", "compare", "what's happening in Adyar", "the Adyar issues list"])
      expect(r(s), s).toBeNull();
  });
});

describe("v7: a question about people or events outside the dashboard never reaches a model's memory", () => {
  it("goes to the place's situation (or the news) with the outside part named for the gap search", () => {
    const a = asks7("CM Vijay is visiting Adyar, what should I know", WORLD);
    expect(a).toMatchObject({ recipe: "situation", slots: { zones: [13] }, why: "outside" });
    expect(a?.gap).toEqual(["cm", "vijay", "visiting"]);
    expect(asks7("what did the Governor say about the floods", WORLD)).toMatchObject({ recipe: "news", why: "outside" });
    expect(asks7("முதல்வர் அடையாறுக்கு வருகிறாரா", WORLD)).toMatchObject({ recipe: "situation", why: "outside" });
    expect(asks7("is the minister inaugurating the flyover today", WORLD)).toMatchObject({ recipe: "news", why: "outside" });
  });
  it("not for the console's own people and records", () => {
    for (const s of ["which officer has the Adyar case", "show the severe cases in Adyar", "who complained about the drain"]) expect(asks7(s, WORLD), s).toBeNull();
  });
});

describe("v7: current events with no district word go to the news, never to a model's memory", () => {
  it("events, deaths, results and 'today's' happenings", () => {
    for (const s of ["how many people died in the Kerala landslide", "who won the by-election yesterday", "what happened in Bengaluru today", "கேரளா நிலச்சரிவில் எத்தனை பேர் இறந்தார்கள்"])
      expect(asks7(s, WORLD), s).toMatchObject({ recipe: "news", why: "outside" });
  });
  it("timeless general questions stay the general lane's", () => {
    for (const s of ["what is a cyclone", "what is machine learning", "explain deep learning", "what is the capital of France"]) expect(asks7(s, WORLD), s).toBeNull();
  });
});

describe("v7 (the Haiku dev run, 17 Nov): 'who has it?' with a case on the screen", () => {
  const caseStage = { recipe: "explain" as const, title: "Adyar", focus: null, slots: {}, blocks: [{ kind: "CaseDetail" as const, ids: ["INC-20261117-ABC123"] }, { kind: "Kpis" as const, ids: [] }] };
  it("asks for the case's holder: the case's own screen, its facts say who holds it", () => {
    for (const s of ["who has it?", "who is handling it", "which department has this", "who's on it", "யார் கையில் இருக்கு?", "இது எந்த துறையிடம் இருக்கு", "yaar kitta irukku"])
      expect(whoHas(s, caseStage), s).toEqual({ recipe: "case", slots: { id: "INC-20261117-ABC123" }, why: "who-has" });
  });
  it("never without a case on the screen, and never for a different question", () => {
    expect(whoHas("who has it?", { ...caseStage, blocks: [{ kind: "Kpis" as const, ids: [] }] })).toBeNull();
    expect(whoHas("who has it?", null)).toBeNull();
    expect(whoHas("who has the most open cases", caseStage)).toBeNull();
  });
});

describe("v7 review (18 Nov): asks7 leaves ordinary commands and questions to their own lanes", () => {
  it("A: 'cm' and 'pm' after a number or as a unit are no Chief Minister or Prime Minister; the offices still count", () => {
    for (const s of ["Which zones got more than 10 cm of rain today?", "How many complaints came in after 6 pm today", "Adyar got 12 cm of rain, how many complaints", "how many cm of rain fell today", "how many cases between 2 pm and 4 pm today"])
      expect(asks7(s, WORLD), s).toBeNull();
    for (const s of ["CM Vijay is visiting Adyar", "is the CM coming to Royapuram", "CM Royapuram ku eppo varaaru"]) expect(asks7(s, WORLD), s).toMatchObject({ recipe: "situation", why: "outside" });
    expect(asks7("PM visit", WORLD)).toMatchObject({ recipe: "news", why: "outside" });
  });
  it("B: a command that acts is never taken from the planner (draft, send, write, call, open, close, assign, escalate, mark, remind...)", () => {
    for (const s of ["Draft a letter to the zonal officer about the issue in Adyar", "send the Adyar issue to the commissioner", "can you email the zonal officer about the problem in Adyar",
      "write to the AE about the issue in Adyar", "escalate the Adyar issue", "remind me about the Adyar issue tomorrow", "call the zonal officer about the issue in Adyar",
      "open the Adyar issue", "close the issue in Adyar", "mark the Adyar issue as resolved", "assign the Adyar issue to the AE", "schedule a meeting on the issue in Adyar",
      "notify the commissioner about the Adyar issue", "forward the Adyar issue to the commissioner", "message the AE about the issue at Adyar", "delete the Adyar issue",
      "please mail the officer about the issue in Adyar", "compare all zones and send it to the commissioner", "compare this week with last week and draft a note",
      "Adyar issue pathi officer ku mail anuppu", "Adyar issue draft pannu", "அடையாறு பிரச்சினை பற்றி அதிகாரிக்கு கடிதம் எழுது", "அடையாறு பிரச்சினை என்ன, அதிகாரிக்கு அனுப்பு"])
      expect(asks7(s, WORLD), s).toBeNull();
    // the same words said of the past, or as a noun, are still questions
    expect(r("tell me about the issue in Adyar the residents called about")).toMatchObject({ recipe: "explain", zones: [13] });
  });
  it("C: two windows joined by 'and' are a list; only a comparison is the what-changed screen", () => {
    for (const s of ["show me complaints from today and yesterday", "list severe cases this week and last week"]) expect(r(s), s).toBeNull();
    for (const s of ["compare this week with last week", "this week vs last week", "today versus yesterday", "how does this week compare with last week", "week on week", "compare today and yesterday", "this month compared with last month"])
      expect(r(s), s).toMatchObject({ recipe: "changed" });
  });
  it("D: one department compared, or a department that compares worst, is not every department side by side", () => {
    for (const s of ["how does the electricity department compare with last month", "which department compares worst"]) expect(r(s), s).toBeNull();
    for (const s of ["compare all departments", "compare every department", "department wise comparison", "ella department um compare pannu", "ella departments um oppidu"])
      expect(r(s), s).toMatchObject({ recipe: "performance", by: "dept" });
  });
  it("F: the place and the kind the sentence names are kept", () => {
    expect(r("explain the drainage problem in Adyar")).toMatchObject({ recipe: "explain", zones: [13], cat: "DRAINAGE_SEWAGE" });
    expect(r("what's the flooding issue in Adyar")).toMatchObject({ recipe: "explain", zones: [13], cat: "FLOOD_WATERLOGGING" });
    expect(r("what's the Adyar issue")).toMatchObject({ recipe: "explain", zones: [13], cat: null });
    expect(r("compare all departments in Adyar")).toMatchObject({ recipe: "performance", by: "dept", zones: [13] });
    expect(r("compare this week with last week for garbage")).toMatchObject({ recipe: "changed", cat: "SOLID_WASTE" });
    expect(r("compare this week with last week")).toMatchObject({ recipe: "changed", cat: null });
  });
});

describe("v7 review (18 Nov): 'who has it?' in Tamil and Tanglish is about the case on screen, not a ranking", () => {
  const caseStage = { recipe: "explain" as const, title: "Adyar", focus: null, slots: {}, blocks: [{ kind: "CaseDetail" as const, ids: ["INC-20261117-ABC123"] }] };
  it("E: a ranking of holders is not the case on screen", () => {
    for (const s of ["எந்த துறையிடம் அதிக புகார்கள் நிலுவையில் உள்ளன?", "entha department la adhigam complaints pending", "yaar kitta adhigam pending complaints irukku"])
      expect(whoHas(s, caseStage), s).toBeNull();
  });
  it("E: asked about it, this or that, or bare, it is still the case's holder", () => {
    for (const s of ["இந்த சம்பவம் யார் கையில் இருக்கு", "அது யார் கிட்ட இருக்கு", "எந்த துறையிடம் இருக்கு", "idhu entha department kitta irukku", "indha case yaar kitta irukku", "yaar kaila irukku"])
      expect(whoHas(s, caseStage), s).toEqual({ recipe: "case", slots: { id: "INC-20261117-ABC123" }, why: "who-has" });
  });
});
