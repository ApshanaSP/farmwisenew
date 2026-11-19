import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { metricNamedIn } from "./metrics";
import { quickScreen } from "./quick";
import { referenceWorld } from "./world";

// A4 (v5): metric names matched in code before the planner, on a "what changed" sentence. Invented sentences, none from any eval set.
const world = { ...WORLD, ...referenceWorld() };
const q = (t: string) => quickScreen(t, world, { analysis: true });

describe("A4: a metric named on a what-changed sentence", () => {
  it("one name of a metric that can show a change: the changed recipe with metricId set", () => {
    const a = q("what changed in severe cases since yesterday");
    expect(a?.recipe).toBe("changed");
    expect(a?.slots.metricId).toBe("severe_reported");
    const c = q("நேத்துலேர்ந்து கடுமையான சம்பவங்கள் என்ன மாறியிருக்கு");
    expect(c?.recipe).toBe("changed");
    expect(c?.slots.metricId).toBe("severe_reported");
  });

  it("a longer name wins over a shorter one inside it (severe incidents is one metric, not incidents too)", () => {
    expect(q("what changed in severe incidents since yesterday")?.slots.metricId).toBe("severe_reported");
  });

  it("two metrics named: the planner decides; the rules give no screen at all, in the fast lane and after a planner miss alike", () => {
    expect(q("what changed in severe cases and rain days since yesterday")).toBeNull();
    expect(quickScreen("what changed in severe cases and rain days since yesterday", world, { noBail: true })).toBeNull();
  });

  it("no metric named: as before (the incidents change, no metricId)", () => {
    const a = q("what changed since yesterday");
    expect(a?.recipe).toBe("changed");
    expect(a?.slots.metricId ?? null).toBeNull();
  });

  // review planner-quota-2: a metric with no figure before (comparison none) is never named: v4's incidents change answers
  it("a metric that cannot show a change is not named (overdue, deaths, the warning level): the v4 path", () => {
    for (const t of ["what has changed in overdue cases this week", "what changed in deaths since yesterday", "what changed in the warning level since yesterday"]) expect(metricNamedIn(t), t).toBeNull();
    expect(q("what has changed in overdue cases this week")?.slots.metricId ?? null).toBeNull();
  });

  // review planner-quota-3: "complaints" means incidents on every other screen; only "citizen complaints" names the open-complaints figure
  it("bare complaints is not the open-citizen-complaints figure", () => {
    expect(metricNamedIn("what changed in Adyar complaints this week")).toBeNull();
    expect(metricNamedIn("அடையாறு புகார்கள் நேத்துலேர்ந்து என்ன மாறியிருக்கு")).toBeNull();
    expect(metricNamedIn("what changed in citizen complaints this week")).toBe("complaints_open");
  });
});
