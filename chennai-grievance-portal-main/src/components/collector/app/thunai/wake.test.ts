import { describe, expect, it } from "vitest";
import { talkedAbout, wakeIn } from "./wake";

describe("the wake word", () => {
  it.each([
    ["hi jarvis", ""],
    ["Hello Jarvis", ""],
    ["hey jarvis", ""],
    ["Jarvis", ""],
    ["ok jarvis.", ""],
    ["hey jarvis show me the severe cases", "show me the severe cases"],
    ["Hi Jarvis, compare Adyar and Ambattur this week", "compare adyar and ambattur this week"],
    ["hello jervis open trends", "open trends"],
    ["so I said hi javis go to environment", "go to environment"],
    ["ஹாய் ஜார்விஸ்", ""],
    ["ஹலோ ஜார்விஸ் மழை நிலவரம் சொல்லு", "மழை நிலவரம் சொல்லு"]
  ])("hears %j", (said, rest) => {
    expect(wakeIn(said)).toBe(rest);
  });

  it.each(["the service is slow", "open the jar", "travis road complaints", "jarvisx", "hi there"])("does not wake on %j", (said) => {
    expect(wakeIn(said)).toBeNull();
  });

  it.each([
    ["Show me the severe cases, Jarvis", "show me the severe cases"],
    ["show me the severe cases jarvis please", "show me the severe cases"],
    ["அடையார் புகார்களைக் காட்டு ஜார்விஸ்", "அடையார் புகார்களைக் காட்டு"],
    ["tell me the worst zone, Jarvis", "tell me the worst zone"],
    ["did it rise, Jarvis?", "did it rise"],
    ["show me, Jarvis, the severe cases", "show me the severe cases"],
    ["அடையார் புகார்களை ஜார்விஸ் காட்டு", "அடையார் புகார்களை காட்டு"],
    ["Adyar complaints jarvis kaattu", "adyar complaints kaattu"],
    ["good morning jarvis", ""],
    ["so jarvis", ""]
  ])("keeps the words before the name in %j", (said, rest) => {
    expect(wakeIn(said)).toBe(rest);
  });

  it.each([
    "Don't let Jarvis draft for the first three", "I told Jarvis to forget everything", "tell Jarvis to show the map", "did you ask Jarvis about it",
    "don't draft these, Jarvis", "why don't we let Jarvis do it", "he said Jarvis is slow", "ஜார்விஸ் கிட்ட சொன்னேன்", "jarvis kitta kelu", "அனுப்ப வேண்டாம் ஜார்விஸ்"
  ])("the name talked about is not a call in %j", (said) => {
    expect(wakeIn(said)).toBeNull();
    expect(talkedAbout(said)).toBe(true);
  });
});
