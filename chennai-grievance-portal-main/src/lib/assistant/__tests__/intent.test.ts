import { describe, expect, it } from "vitest";
import { countAsked, detectIntent, hasPhrase, tokens } from "@/lib/assistant/intent";
import type { ConversationContext } from "@/lib/assistant/context";
import EVAL from "./eval/intents.json";

const afterList: ConversationContext = {
  lastIntent: "PRIORITY_INCIDENT_LIST", lastResponseType: "incident_list", activeFilters: { period: "daily", topic: "crime" },
  resultIds: ["INC-A", "INC-B", "INC-C"], selectedIncidentId: null
};
const afterDetail: ConversationContext = { ...afterList, lastIntent: "INCIDENT_DETAIL", lastResponseType: "incident_detail", selectedIncidentId: "INC-B" };
const afterNews: ConversationContext = { lastIntent: "NEWS_TOP", lastResponseType: "news_list", activeFilters: { period: "daily" }, storyIds: ["S1", "S2", "S3"] };

describe("the 12 golden questions", () => {
  it("1. top 3 priority crimes -> the incidents themselves", () => {
    const d = detectIntent("Tell me top 3 priority crimes");
    expect(d.intent).toBe("PRIORITY_INCIDENT_LIST");
    expect(d.n).toBe(3);
    expect(d.topic?.key).toBe("crime");
  });
  it("2. top 3 crime types -> a ranking of kinds", () => {
    const d = detectIntent("Tell me top 3 crime types");
    expect(d.intent).toBe("CATEGORY_RANKING");
    expect(d.n).toBe(3);
  });
  it("3. how many crimes in the last 24 hours -> a count", () => expect(detectIntent("How many crimes happened in the last 24 hours?").intent).toBe("INCIDENT_COUNT"));
  it("4. explain the second one -> the second incident of the last list", () => {
    const d = detectIntent("Explain the second one", afterList);
    expect(d.intent).toBe("INCIDENT_DETAIL");
    expect(d.incidentId).toBe("INC-B");
  });
  it("5. where did it happen -> the selected incident, where", () => {
    const d = detectIntent("Where did it happen?", afterDetail);
    expect(d.intent).toBe("INCIDENT_DETAIL");
    expect(d.incidentId).toBe("INC-B");
    expect(d.focus).toBe("where");
  });
  it("6. similar incidents nearby -> related to the selected incident", () => {
    const d = detectIntent("Show similar incidents nearby.", afterDetail);
    expect(d.intent).toBe("INCIDENT_RELATED");
    expect(d.incidentId).toBe("INC-B");
  });
  it("7. top news today -> news stories", () => expect(detectIntent("Top news today").intent).toBe("NEWS_TOP"));
  it("8. news about flooding -> news stories, not counts", () => {
    const d = detectIntent("Show news about flooding");
    expect(d.intent).toBe("NEWS_TOP");
    expect(d.topic?.key).toBe("flood");
  });
  it("9. a Tamil suicide headline is not murder", () => {
    const d = detectIntent("சென்னையில் மருத்துவ மாணவர் தற்கொலை");
    expect(d.topic?.key).toBe("suicide");
    expect(d.topic?.cats).not.toContain("CRIME_VIOLENT");
  });
  it("10. make that a map -> the previous list, drawn", () => {
    const d = detectIntent("make that a map", afterList);
    expect(d.intent).toBe("MAP");
    expect(d.refinement).toBe(true);
  });
  it("11. only Adyar -> narrows the previous answer", () => {
    const d = detectIntent("only Adyar", afterList);
    expect(d.refinement).toBe(true);
    expect(d.intent).toBe("PRIORITY_INCIDENT_LIST");
  });
  it("12. what should we do about this -> an action request", () => {
    const d = detectIntent("What should we do about this?", afterDetail);
    expect(d.intent).toBe("ACTION_REQUEST");
    expect(d.incidentId).toBe("INC-B");
  });
});

describe("follow-up references", () => {
  it.each([["the first one", "INC-A"], ["tell me more about the third one", "INC-C"], ["the last one", "INC-C"], ["number 2", "INC-B"]])("%s -> %s", (q, id) =>
    expect(detectIntent(q, afterList).incidentId).toBe(id));
  it("a story in the last news list", () => {
    const d = detectIntent("tell me more about the second story", afterNews);
    expect(d.intent).toBe("NEWS_DETAIL");
    expect(d.storyId).toBe("S2");
  });
  it("an incident id named outright", () => expect(detectIntent("what happened in INC-20261003-47BC9C").incidentId).toBe("INC-20261003-47BC9C"));
  it("no context: 'the second one' does not invent an incident", () => expect(detectIntent("explain the second one").incidentId).toBeNull());
  it("'the last 24 hours' is a period, not 'the last one'", () => {
    const d = detectIntent("How many crimes happened in the last 24 hours?", afterDetail);
    expect(d.intent).toBe("INCIDENT_COUNT");
    expect(d.incidentId).toBeNull();
  });
  it("'first information report' style words do not point at a list when no ordinal is meant", () =>
    expect(detectIntent("show crimes in the last week", afterList).intent).toBe("INCIDENT_LIST"));
});

describe("whole-word matching (Tamil and English)", () => {
  it("தற்கொலை does not contain the word கொலை", () => {
    expect(hasPhrase(tokens("ஆட்டோ டிரைவர் தற்கொலை"), "கொலை")).toBe(false);
    expect(hasPhrase(tokens("இளைஞர் கொலைக்கு காரணம்"), "கொலை")).toBe(true); // a case ending still matches
  });
  it("English words, not substrings", () => {
    expect(hasPhrase(tokens("flooding in Velachery"), "flood")).toBe(true);
    expect(hasPhrase(tokens("firearm seized"), "fire")).toBe(false);
  });
  it.each([["top 3 zones", 3], ["top three crimes", 3], ["5 most serious incidents", 5], ["incidents in the last 3 days", null]])("count in %s", (q, n) =>
    expect(countAsked(q)).toBe(n));
});

describe("intent evaluation set", () => {
  const rows = EVAL as { q: string; intent: string; ctx?: "list" | "detail" | "news" }[];
  const ctxOf = { list: afterList, detail: afterDetail, news: afterNews } as const;
  const wrong = rows.filter((r) => detectIntent(r.q, r.ctx ? ctxOf[r.ctx] : null).intent !== r.intent)
    .map((r) => `${r.q} -> ${detectIntent(r.q, r.ctx ? ctxOf[r.ctx] : null).intent} (expected ${r.intent})`);
  it(`intent accuracy on ${rows.length} held-out questions is at least 90%`, () => {
    const acc = 1 - wrong.length / rows.length;
    if (wrong.length) console.info(`intent accuracy ${(acc * 100).toFixed(1)}%; misses:\n  ${wrong.join("\n  ")}`);
    expect(acc).toBeGreaterThanOrEqual(0.9);
  });
});

describe("explanations go to the model", () => {
  it("explain about the anna nagar issue -> not a list", () => {
    expect(detectIntent("explain about the anna nagar issue").intent).toBe("GENERAL_DISTRICT_QUERY");
  });
  it("why is flooding up in Adyar -> not a list", () => {
    expect(detectIntent("why are flooding complaints high in Adyar").intent).toBe("GENERAL_DISTRICT_QUERY");
  });
  it("a list word still lists", () => {
    expect(detectIntent("show the anna nagar issues").intent).toBe("INCIDENT_LIST");
  });
  it("explain the second one -> that incident", () => {
    expect(detectIntent("explain the second one", afterList).intent).toBe("INCIDENT_DETAIL");
  });
});

describe("tell me about = an explanation", () => {
  it("tell me about anna nagar incident / tell about theft -> the model", () => {
    expect(detectIntent("tell me about anna nagar incident").intent).toBe("GENERAL_DISTRICT_QUERY");
    expect(detectIntent("tell about theft").intent).toBe("GENERAL_DISTRICT_QUERY");
  });
  it("news and follow-ups keep their own paths", () => {
    expect(detectIntent("tell me about any news on anna nagar").intent).toBe("NEWS_TOP");
    expect(detectIntent("what about last week", afterList).refinement).toBe(true);
  });
});
