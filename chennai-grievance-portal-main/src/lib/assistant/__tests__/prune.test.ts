import { describe, expect, it } from "vitest";
import { pruneUnverified } from "@/lib/assistant/verify";

// a stand-in check: any sentence with the number 54 or 17 in it is "unverified"
const ok = (t: string) => !/\b(54|17)\b/.test(t);

describe("a draft keeps its verified sentences", () => {
  it("drops only the sentence with an unverified number", () => {
    const r = pruneUnverified({
      headline: "Police lead severe incidents this week",
      answerMarkdown: "Greater Chennai Police had **26** severe incidents, the most. Together that is 54 of the district's severe cases. PWD Water Resources followed with 20.",
      voiceSummary: "Police had 26 severe incidents."
    }, ok)!;
    expect(r.answerMarkdown).toBe("Greater Chennai Police had **26** severe incidents, the most. PWD Water Resources followed with 20.");
    expect(r).toMatchObject({ headline: "Police lead severe incidents this week", dropped: 1 });
  });
  it("keeps list markers and drops a whole list line when nothing in it is verified", () => {
    const r = pruneUnverified({ headline: "17 departments", answerMarkdown: "Top three:\n- Police: 26\n- 17 works pending\n- PWD: 20", voiceSummary: "x 54" }, ok)!;
    expect(r.answerMarkdown).toBe("Top three:\n- Police: 26\n- PWD: 20");
    expect(r.headline).toBeNull();
    expect(r.voiceSummary).toBeNull();
  });
  it("gives up when no sentence survives", () => {
    expect(pruneUnverified({ headline: "h", answerMarkdown: "Total 54. Open 17.", voiceSummary: "v" }, ok)).toBeNull();
  });
});
