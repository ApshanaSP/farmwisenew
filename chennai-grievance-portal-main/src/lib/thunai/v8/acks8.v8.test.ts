import { afterEach, describe, expect, it } from "vitest";
import { ackFor } from "../stagelocal";
import { ackToSay, newsOpener, stillLine } from "@/components/collector/app/thunai/turnstate";

// the owner's example 3: "On it" on every turn. A sentence with no topic of its own gets no spoken filler; a topic line is said only when it is
// not the one said last; the long wait's line changes each time.
describe("v8 acknowledgements: never the same filler on every turn", () => {
  afterEach(() => { delete process.env.JARVIS_UNDERSTAND; });
  it("no 'On it' (nor its Tamil) for a sentence with no topic", () => {
    for (const t of ["what about the other thing", "and then?", "tell me more", "who has it", "since when"]) {
      expect(ackFor(t, "en")).toBe("");
      expect(ackFor(t, "ta")).toBe("");
    }
  });
  it("a topic still gets its own line", () => {
    expect(ackFor("show me the 6 severe cases", "en")).toBe("Checking the severe cases.");
    expect(ackFor("compare Adyar and Anna Nagar", "en")).toMatch(/side by side/);
  });
  it("the same line twice in a row is not said again; an empty one never", () => {
    expect(ackToSay("Checking the severe cases.", null)).toBe("Checking the severe cases.");
    expect(ackToSay("Checking the severe cases.", "Checking the severe cases.")).toBeNull();
    expect(ackToSay("", null)).toBeNull();
  });
  it("the long wait's line is never the same twice running, and says nothing it cannot know", () => {
    const a = stillLine("en", null), b = stillLine("en", a), c = stillLine("ta", null);
    expect(a).not.toBe(b);
    expect(`${a} ${b}`).not.toMatch(/on it/i);
    expect(c).toMatch(/[஀-௿]/u);
  });
  it("JARVIS_UNDERSTAND=v7 brings v7's 'On it.' back", () => {
    process.env.JARVIS_UNDERSTAND = "v7";
    expect(ackFor("tell me more", "en")).toBe("On it.");
  });
});

describe("the final real run (o8final, 19 Nov): a news turn's opener is not said on every news turn", () => {
  const hindu = { en: "Reading The Hindu's report...", ta: "தி இந்து செய்தியைப் படிக்கிறேன்..." };
  it("said on the first news turn", () => expect(newsOpener(hindu, "en", null)).toBe(hindu.en));
  it("not said again when it was the line said last (shown on screen only)", () => expect(newsOpener(hindu, "en", hindu.en)).toBeNull());
  it("Tamil the same", () => { expect(newsOpener(hindu, "ta", null)).toBe(hindu.ta); expect(newsOpener(hindu, "ta", hindu.ta)).toBeNull(); });
  it("another outlet's opener, or the same after another line, is said", () => {
    expect(newsOpener({ en: "Reading The Times of India's report...", ta: "" }, "en", hindu.en)).toBe("Reading The Times of India's report...");
    expect(newsOpener(hindu, "en", "Looking at Royapuram.")).toBe(hindu.en);
  });
  it("an empty opener is never said", () => expect(newsOpener({ en: " ", ta: "" }, "en", null)).toBeNull());
});
