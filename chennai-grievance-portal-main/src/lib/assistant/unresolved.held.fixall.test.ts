import { describe, expect, it } from "vitest";
import { customWindow } from "@/lib/assistant/fastpath";
import { unresolvedInput } from "@/lib/assistant/unresolved";

// pass4-open-09 (pass 4's RC-43 class): "how many complaints in the last 500 days" was counted and labelled "last 500 days" though the
// console holds about 180 days. The shared count-of-time reader (lib/windowspan.ts) now reads a window past the records as one that
// cannot be applied, and the rules lane says so before any count.
const W = { now: "2026-11-12 12:00:00", zones: [1, 2, 13], wardFound: true, names: { zones: new Map(), depts: new Map(), cats: new Map(), taluks: new Map() } } as never;

describe("pass4-open-09: a window longer than the records is said, not counted as asked", () => {
  it.each(["how many complaints in the last 500 days", "complaints in the last 2 years", "kadandha 400 naal complaints"])("%s", (q) => {
    const u = unresolvedInput(q, W);
    expect(u?.kind).toBe("period");
    expect((u as { say: { en: string } }).say.en).toMatch(/reaches back further than the records, which hold about 180 days/);
    expect(customWindow(q, "2026-11-12 12:00:00")).toBeNull();
  });
  it("a window inside the records is counted", () => {
    expect(unresolvedInput("how many complaints in the last 100 days", W)).toBeNull();
    expect(customWindow("how many complaints in the last 100 days", "2026-11-12 12:00:00")?.label).toMatch(/100 days/);
  });
});
