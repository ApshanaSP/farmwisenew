import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn() }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/ai/gateway", () => ({ generateJson: vi.fn() }));

import { fold, routine } from "./storyai";
import type { Thread, ThreadStep } from "./threads";

const step = (t: string, title: string, publisher = "The Hindu", stage = "Update"): ThreadStep =>
  ({ t, title, original: null, publisher, url: null, lang: "en", stage, incident: null, itemId: null, added: false, also: [] });
const thread = (title: string, steps: ThreadStep[]) =>
  ({ id: "THR-1", title, days: [{ day: steps[0].t.slice(0, 10), steps }] } as unknown as Thread);

describe("routine repeats", () => {
  it("drops daily prices and forecasts", () => {
    expect(routine(thread("Chennai gold price rises by Rs 760; check today's gold, silver rate", [step("2026-10-02 08:00:00", "Gold rate today")]))).toBe(true);
    expect(routine(thread("Chennai Weather Forecast & Update for Today", [step("2026-10-08 00:10:00", "Weather update")]))).toBe(true);
  });
  it("keeps events", () => {
    expect(routine(thread("Car plunges into sinkhole on OMR", [step("2026-10-08 05:10:00", "Car plunges into sinkhole on OMR")]))).toBe(false);
  });
});

describe("folding repeated headlines", () => {
  it("folds the same headline from other outlets and keeps real changes", () => {
    const r = fold([
      step("2026-10-06 05:57:00", "Chennai Metro Phase II stretch set for October 11 inauguration", "Urban Acres", "First report"),
      step("2026-10-06 09:00:00", "Chennai Metro Phase II stretch set for October 11 inauguration", "DT Next", "First report"),
      step("2026-10-06 10:00:00", "Chennai Metro Phase II stretch set for 11 October inauguration", "News Today", "First report"),
      step("2026-10-11 13:51:00", "PM Modi launches first operational stretch of Chennai Metro Phase II", "The Times of India", "Update")
    ]);
    expect(r.steps.map((s) => s.publisher)).toEqual(["Urban Acres", "The Times of India"]);
    expect(r.steps[0].also).toEqual(["DT Next", "News Today"]);
    expect(r.steps[0].similar).toBe(2);
    expect(r.folded).toBe(2);
  });
});
