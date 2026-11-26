import { describe, expect, it } from "vitest";
import { newsCounts } from "@/lib/collector/intel";

// filter issue 23 (26 Nov): "Needs action" and "For information" counted the 250 stories loaded while "All" counted the period's
describe("the news tabs count the same stories", () => {
  it("all = needs action + for information, and each area of work has both", () => {
    const stories = [
      { desk: { v: "act", area: "Water" } }, { desk: { v: "know", area: "Water" } }, { desk: { v: "know", area: "Health" } }, { desk: null }, {}
    ];
    const n = newsCounts(stories);
    expect(n).toEqual({ act: 1, know: 4, areas: { Water: { act: 1, know: 1 }, Health: { act: 0, know: 1 } } });
    expect(n.act + n.know).toBe(stories.length);
  });
});
