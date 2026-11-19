/**
 * Review (Phase 7, proactive LOW): the mission planner's system prompt lacked Jarvis's persona line, and a model-written step label or title
 * was spoken without the causal-word check ("Floods caused by blocked drains"). The persona line is in it now, and a label or title with a
 * causal word gives way to the code's own label.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { ZONE_TA_NAME } from "./lexicon";
import { PERSONA_LINE } from "./persona";
import { referenceWorld } from "./world";
import { checkModelPlan, missionSystem, type ModelPlanT } from "./missions";
// after missions (which loads screens.ts first): recipes/common.ts and screens.ts import each other
import { causalIn } from "./recipes/common";
import type { World } from "./types";

const world: World = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const step = (label: string | null, over: Record<string, unknown> = {}) => ({ kind: "screen", label, screen: { recipe: "cases", cat: "FLOOD_WATERLOGGING", zones: [13] }, moves: [], place: null, draftOf: null, only: null, ...over });

describe("a mission's words follow Jarvis's voice", () => {
  it("the mission planner is told the persona line", () => {
    expect(missionSystem(world)).toContain(PERSONA_LINE);
  });
  it("a label or title said as a cause gives way to the code's label; a plain one stays", () => {
    const r = checkModelPlan({ kind: "plan", title: "Floods caused by blocked drains", steps: [
      step("Waterlogging due to the rain"),
      step("Adyar flood cases", { screen: { recipe: "trend", cat: "FLOOD_WATERLOGGING", zones: [13], period: "monthly" } }),
      step("மழை காரணமாக வெள்ளம்", { kind: "focus", screen: null, place: "Adyar" }),
      step("Drains linked with the flooding", { kind: "focus", screen: null, place: "Velachery" })
    ] } as unknown as ModelPlanT, world, "en", "make me a flood board for Adyar");
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;
    for (const s of r.plan.steps) for (const l of [s.label.en, s.label.ta]) expect(causalIn(l), l).toBeNull();
    expect(causalIn(r.plan.title.en)).toBeNull();
    expect(r.plan.steps.map((s) => s.label.en)).toContain("Adyar flood cases");
    expect(r.plan.steps.map((s) => s.label.en)).toContain("Drains linked with the flooding");
  });
  it("a Tamil plan's causal label gives way too", () => {
    const r = checkModelPlan({ kind: "plan", title: "மழை காரணமாக வெள்ளம்", steps: [step("மழை காரணமாக தேங்கிய நீர்"), step("அடையாறு வெள்ளப் புகார்கள்", { screen: { recipe: "trend", cat: "FLOOD_WATERLOGGING", zones: [13], period: "monthly" } }), step(null, { kind: "focus", screen: null, place: "Adyar" })] } as unknown as ModelPlanT,
      world, "ta", "அடையாறுக்கு வெள்ளப் பலகை");
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;
    for (const s of r.plan.steps) expect(causalIn(s.label.ta), s.label.ta).toBeNull();
    expect(causalIn(r.plan.title.ta)).toBeNull();
    expect(r.plan.steps.map((s) => s.label.ta)).toContain("அடையாறு வெள்ளப் புகார்கள்");
  });
});
