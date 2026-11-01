import { describe, expect, it } from "vitest";
import { wakeIn } from "./wake";

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
});
