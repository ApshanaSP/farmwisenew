import { describe, expect, it } from "vitest";
import { addressed, ENGAGED_MS, isImperative, levelAllowed, looksSide, namedIn, overlap, selfHeard, type GateInput } from "./addressed";

const NOW = 1_000_000;
const gate = (text: string, o: Partial<GateInput> = {}) => addressed({ text, lastTurnAt: null, now: NOW, rulesSure: false, districtNoun: false, ...o });

describe("the address gate", () => {
  it("tier 1: the name, in English or Tamil, acts at any level, and the name is taken out", () => {
    expect(gate("Jarvis, show the severe cases")).toMatchObject({ tier: 1, act: true, maxLevel: "C", text: "show the severe cases" });
    expect(gate("ஜார்விஸ், அடையாறு நிலவரம் சொல்லு")).toMatchObject({ tier: 1, act: true });
    expect(gate("hey jarvis")).toMatchObject({ tier: 1, act: true });
    expect(namedIn("no name here")).toBeNull();
  });
  it("tier 2: within 20 s of Jarvis's last turn, a request or follow-up acts; side talk does not", () => {
    const near = { lastTurnAt: NOW - 5000 };
    expect(gate("and in Adyar?", near)).toMatchObject({ tier: 2, act: true, maxLevel: "C" });
    expect(gate("why?", near)).toMatchObject({ tier: 2, act: true });
    expect(gate("the second one", near)).toMatchObject({ tier: 2, act: true });
    expect(gate("did he send the file", near)).toMatchObject({ tier: 0, act: false });
    // already in the conversation, "my" and "I" are the Collector's own words
    expect(gate("put together something useful for my morning", near)).toMatchObject({ tier: 2, act: true });
    expect(gate("what should I do about flooding", near)).toMatchObject({ tier: 2, act: true });
    expect(gate("the file is on the table", near)).toMatchObject({ tier: 0, act: false });
    expect(gate("and in Adyar?", { lastTurnAt: NOW - ENGAGED_MS - 1 })).toMatchObject({ tier: 0, act: false });
  });
  it("tier 3: a sure rule or imperative plus a district noun acts, level A only", () => {
    expect(gate("show Adyar's cases", { districtNoun: true })).toMatchObject({ tier: 3, act: true, maxLevel: "A" });
    expect(gate("அடையாறு புகார்கள் காட்டு", { districtNoun: true })).toMatchObject({ tier: 3, act: true });
    expect(gate("Adyar la complaints kaattu", { districtNoun: true })).toMatchObject({ tier: 3, act: true });
    expect(gate("severe cases in Adyar this week", { rulesSure: true, districtNoun: true })).toMatchObject({ tier: 3, act: true, maxLevel: "A" });
  });
  it("tier 0: everything else is ignored", () => {
    expect(gate("the Adyar file is on your table", { districtNoun: true, rulesSure: true })).toMatchObject({ tier: 0, act: false });
    expect(gate("did you see the rain in Velachery yesterday", { districtNoun: true, rulesSure: true })).toMatchObject({ tier: 0, act: false });
    expect(gate("show him the Ambattur figures later", { districtNoun: true })).toMatchObject({ tier: 0, act: false });
    expect(gate("we should compare notes after lunch")).toMatchObject({ tier: 0, act: false });
    expect(gate("the Collector wants the report by five", { districtNoun: true })).toMatchObject({ tier: 0, act: false });
    expect(gate("நேத்து மழை ரொம்ப அதிகம்", { districtNoun: true, rulesSure: true })).toMatchObject({ tier: 0, act: false });
    expect(gate("avaru meeting la irukaar", {})).toMatchObject({ tier: 0, act: false });
  });
  it("an imperative with no district noun is not enough", () => {
    expect(gate("open the door")).toMatchObject({ tier: 0, act: false });
    expect(isImperative("open the door")).toBe(true);
  });
  it("'show me' is an imperative, not side talk", () => {
    expect(looksSide("show me the severe cases")).toBe(false);
    expect(looksSide("show me what he said")).toBe(true);
  });
  it("levels B and C need tier 1 or 2", () => {
    const three = gate("show Adyar's cases", { districtNoun: true });
    expect(levelAllowed(three, "A")).toBe(true);
    expect(levelAllowed(three, "B")).toBe(false);
    expect(levelAllowed(three, "C")).toBe(false);
    const one = gate("Jarvis, save this workspace");
    expect(levelAllowed(one, "B")).toBe(true);
    expect(levelAllowed(gate("hello there"), "A")).toBe(false);
  });
});

describe("the name anywhere in the sentence", () => {
  it("a name at the end keeps the command, and acts", () => {
    expect(namedIn("Show me the severe cases, Jarvis")).toBe("show me the severe cases");
    expect(gate("Show me the severe cases, Jarvis")).toMatchObject({ tier: 1, act: true, text: "show me the severe cases" });
    expect(gate("அடையார் புகார்களைக் காட்டு ஜார்விஸ்")).toMatchObject({ tier: 1, act: true, text: "அடையார் புகார்களைக் காட்டு" });
  });
  it("the name alone stays the name alone", () => {
    for (const t of ["Jarvis", "hey jarvis", "ஹாய் ஜார்விஸ்", "good morning Jarvis"]) expect(namedIn(t), t).toBe("");
  });
  it("the name talked about is no order, even when engaged", () => {
    const near = { lastTurnAt: NOW - 5000 };
    for (const t of ["Don't let Jarvis draft for the first three", "I told Jarvis to forget everything", "tell Jarvis to draft the first three", "ஜார்விஸ் கிட்ட சொன்னேன்"]) {
      expect(namedIn(t), t).toBeNull();
      expect(gate(t), t).toMatchObject({ tier: 0, act: false });
      expect(gate(t, near), t).toMatchObject({ tier: 0, act: false });
    }
  });
});

describe("side talk that used to act", () => {
  it("tier 3: Tamil verbs are whole words, chores and statements are not orders", () => {
    for (const t of ["அடையார் ரோடு ஏன் இப்படி", "மழை வந்தா", "தண்ணீர் கொடு", "Give me some water", "Take me to the hospital", "Close the door, the rain is coming", "There are too many complaints in Adyar", "மழை வருது"]) {
      expect(gate(t, { districtNoun: true }), t).toMatchObject({ tier: 0, act: false });
      expect(gate(t, { districtNoun: true, rulesSure: true }), t).toMatchObject({ tier: 0, act: false });
    }
  });
  it("tier 3: the same words as work still act", () => {
    for (const t of ["give me a summary of the Adyar cases", "show water complaints in Adyar", "தண்ணீர் புகார்கள் கொடு", "take me to the trends page", "show cases that are open in Adyar"]) {
      expect(gate(t, { districtNoun: true }), t).toMatchObject({ tier: 3, act: true });
    }
  });
  it("tier 2: first person and questions about the room do not act", () => {
    const near = { lastTurnAt: NOW - 5000 };
    for (const t of ["I am going home", "where is my phone", "can you pass the salt", "நேத்து மழை ரொம்ப அதிகம்", "it was late"]) expect(gate(t, near), t).toMatchObject({ tier: 0, act: false });
    for (const t of ["I want Adyar", "can you show Adyar", "where is the worst flooding", "இல்லை", "show complaints after 8 am in Adyar"]) expect(gate(t, near), t).toMatchObject({ tier: 2, act: true });
    // அடையார் holds யார் but asks nothing
    expect(gate("அடையார் ரோடு ரொம்ப ரொம்ப மோசம் தான் போல", near)).toMatchObject({ tier: 0, act: false });
  });
});

describe("real commands that used to be ignored when engaged", () => {
  const near = { lastTurnAt: NOW - 5000 };
  it.each(["Show Anna Salai complaints", "What was the rainfall in Adyar", "did it rise?", "which zones had the most?", "show yesterday", "Show us Adyar", "நாளைக்கு மழை எவ்வளவு", "வரைபடம் பார்"])("%s", (t) => {
    expect(gate(t, near)).toMatchObject({ tier: 2, act: true });
  });
  it("traffic and tea are topics once a district noun is there, chatter before", () => {
    expect(gate("Show traffic complaints in Adyar", { ...near, districtNoun: true })).toMatchObject({ tier: 2, act: true });
    expect(gate("Show traffic complaints in Adyar", { districtNoun: true })).toMatchObject({ tier: 3, act: true });
    expect(gate("how is the traffic", near)).toMatchObject({ tier: 0, act: false });
    expect(gate("anna is coming later", near)).toMatchObject({ tier: 0, act: false });
    // the past stays side talk with nobody engaged, and with no request shape
    expect(gate("What was the rainfall in Adyar", { districtNoun: true, rulesSure: true })).toMatchObject({ tier: 0, act: false });
  });
});

describe("the self-hearing guard", () => {
  const said = "Comparing Adyar with Anna Nagar, the severe cases are on the screen";
  it("ignores a transcript that is mostly what Jarvis is saying", () => {
    expect(selfHeard("the severe cases are on the screen", said)).toBe(true);
    expect(selfHeard("comparing adyar with anna nagar", said)).toBe(true);
    expect(selfHeard("Comparing Adyar, with Anna Nagar!", said)).toBe(true);
  });
  it("hears a real interruption, and Tamil is compared without touching its letters", () => {
    expect(selfHeard("no show me Royapuram instead", said)).toBe(false);
    expect(selfHeard("anything", null)).toBe(false);
    expect(overlap("அடையாறு கடுமையான சம்பவங்கள்", "அடையாறு கடுமையான சம்பவங்கள் திரையில் உள்ளன")).toBe(1);
  });
});
