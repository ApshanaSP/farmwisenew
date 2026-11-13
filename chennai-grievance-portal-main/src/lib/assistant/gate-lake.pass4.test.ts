// QA4 final gate, FB-3: "Why did the Chembarambakkam lake level rise this week?" was answered with incident counts. The data holds each reservoir's
// latest level and 28-day average, not the reason it moved: the answer says so, in words only.
import { describe, expect, it } from "vitest";
import { notDone } from "./cannot";

const TAMIL = /[஀-௿]/;
describe("a question for the reason a lake level moved", () => {
  it.each([
    "Why did the Chembarambakkam lake level rise this week?",
    "why is the Poondi reservoir level falling",
    "what caused the water level in Puzhal lake to go up",
    "செம்பரம்பாக்கம் ஏரி மட்டம் ஏன் உயர்ந்தது",
    "Chembarambakkam lake level yen yerichu"
  ])("FB-3: %s -> lakeCause (rules only)", (text) => {
    const no = notDone(text, true);
    expect(no?.kind).toBe("lakeCause");
  });
  it("the line says it has no reason, has no figure, and is in its language", () => {
    const r = notDone("Why did the Chembarambakkam lake level rise this week?", true)!;
    expect(r.say.en).toMatch(/do not have the reason/);
    for (const l of ["en", "ta", "tanglish"] as const) expect(r.say[l]).not.toMatch(/\d{2}|\d%/);
    expect(r.say.ta).toMatch(TAMIL);
    expect(r.say.en).not.toMatch(TAMIL);
  });
  it("not caught: the level itself, a why about incidents, and any question when a model answers", () => {
    expect(notDone("what is the Chembarambakkam lake level", true)).toBeNull();
    expect(notDone("which reservoirs are above 80 percent full", true)).toBeNull();
    expect(notDone("why did incidents rise in Adyar this week", true)).toBeNull();
    expect(notDone("Why did the Chembarambakkam lake level rise this week?", false)).toBeNull();
  });
});
