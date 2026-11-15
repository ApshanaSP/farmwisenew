import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { quickScreen } from "./quick";
import { referenceWorld } from "./world";

// A4 (v5): metric names matched in code before the planner, on a "what changed" sentence. Invented sentences, none from any eval set.
const world = { ...WORLD, ...referenceWorld() };
const q = (t: string) => quickScreen(t, world, { analysis: true });

describe("A4: a metric named on a what-changed sentence", () => {
  it("one name: the changed recipe with metricId set", () => {
    const a = q("what changed in severe cases since yesterday");
    expect(a?.recipe).toBe("changed");
    expect(a?.slots.metricId).toBe("severe_reported");
    const b = q("what has changed in overdue cases this week");
    expect(b?.slots.metricId).toBe("overdue_open");
    const c = q("நேத்துலேர்ந்து மரணங்கள் என்ன மாறியிருக்கு");
    expect(c?.recipe).toBe("changed");
    expect(c?.slots.metricId).toBe("deaths");
  });

  it("a longer name wins over a shorter one inside it (severe incidents is one metric, not incidents too)", () => {
    expect(q("what changed in severe incidents since yesterday")?.slots.metricId).toBe("severe_reported");
  });

  it("two metrics named: the planner decides (no screen from the rules)", () => {
    expect(q("what changed in deaths and overdue cases since yesterday")).toBeNull();
  });

  it("no metric named: as before (the incidents change, no metricId)", () => {
    const a = q("what changed since yesterday");
    expect(a?.recipe).toBe("changed");
    expect(a?.slots.metricId ?? null).toBeNull();
  });
});
