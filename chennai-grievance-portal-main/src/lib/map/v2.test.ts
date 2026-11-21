import { describe, expect, it } from "vitest";
import { scorecardWard, timelineOf } from "./v2";
import type { Hit } from "./execute";

const hit = (id: string, first: string) => ({ inc: { id, first } as Hit["inc"], near: null }) as Hit;

describe("Ask the Map v2", () => {
  it("reads a scorecard question in English and Tamil, and only a scorecard question", () => {
    expect(scorecardWard("ward 178 scorecard")).toBe(178);
    expect(scorecardWard("scorecard for ward no. 9")).toBe(9);
    expect(scorecardWard("report card 45th ward")).toBe(45);
    expect(scorecardWard("வார்டு 120 மதிப்பெண் அட்டை")).toBe(120);
    expect(scorecardWard("what is happening in ward 178")).toBeNull();
    expect(scorecardWard("scorecard")).toBeNull();
  });

  it("lays an answer out day by day, empty days kept, up to today", () => {
    const tl = timelineOf([hit("a", "2026-11-17 09:00:00"), hit("b", "2026-11-17 20:00:00"), hit("c", "2026-11-19 08:00:00")], "2026-11-20 23:00:00")!;
    expect(tl.days.map((d) => [d.day, d.n])).toEqual([["2026-11-17", 2], ["2026-11-18", 0], ["2026-11-19", 1], ["2026-11-20", 0]]);
    expect(tl.days[0].ids).toEqual(["a", "b"]);
    expect(tl.total).toBe(3);
  });

  it("has no timeline for one day, no rows, or more than 120 days", () => {
    expect(timelineOf([hit("a", "2026-11-20 09:00:00")], "2026-11-20 23:00:00")).toBeNull();
    expect(timelineOf([], "2026-11-20 23:00:00")).toBeNull();
    expect(timelineOf([hit("a", "2026-05-01 09:00:00")], "2026-11-20 23:00:00")).toBeNull();
  });
});
