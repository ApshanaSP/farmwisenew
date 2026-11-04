import { describe, expect, it } from "vitest";
import { statusOf } from "./hudstore";

// The bar tells the Collector what Jarvis is doing and whether to say its name first.
const base = { mode: "on" as const, core: "listening" as const, firstUse: false, doing: "", engagedUntil: 0 };

describe("the bar's words", () => {
  it("right after an answer, no name is needed; once the 20 s pass, it asks for \"Hi Jarvis\"", () => {
    expect(statusOf({ ...base, engagedUntil: 10_000 }, false, 5_000).hint).toMatch(/no need to say my name/);
    expect(statusOf({ ...base, engagedUntil: 10_000 }, false, 15_000).hint).toMatch(/Hi Jarvis/);
  });
  it("says what it is working on, and how to stop it while it talks", () => {
    expect(statusOf({ ...base, core: "thinking", doing: "Putting them side by side" }, false, 0)).toEqual({ word: "Working on it", hint: "Putting them side by side" });
    expect(statusOf({ ...base, core: "speaking" }, false, 0).hint).toMatch(/stop me/);
  });
  it("muted, or with the microphone blocked, it says so", () => {
    expect(statusOf({ ...base, mode: "muted" }, false, 0).word).toBe("Muted");
    expect(statusOf({ ...base, mode: "muted", denied: true }, false, 0).word).toBe("Microphone blocked");
  });
  it("in Tamil too", () => {
    expect(statusOf({ ...base, engagedUntil: 0 }, true, 0).hint).toMatch(/ஹாய் ஜார்விஸ்/);
  });
});
