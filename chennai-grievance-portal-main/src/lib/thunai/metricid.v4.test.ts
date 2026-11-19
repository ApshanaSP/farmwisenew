/**
 * Review (Phase 7, Numbers 5): a model's metricId of letters and underscores could spell figures ("three_hundred_deaths"); an unknown one
 * was echoed on the changed screen's note (metrics.ts computeMetric), and metricId was not one of the model's text slots, so the number
 * words in it joined what Jarvis may say (speakable.ts). Now the id is never echoed, it is a model text slot, and the checker strips it.
 */
import { describe, expect, it } from "vitest";
import { checkScreen } from "./agent";
import { WORLD } from "./fixture";
import { METRIC_DEFS, computeMetric } from "./metrics";
import { figuresIn } from "./numbergate";
import { buildScreen, emptySlots } from "./screens";
import { MODEL_TEXT_SLOTS, modelFigures, speakableFigures } from "./speakable";
import { fakeHands } from "./stagefake";
import type { StageDocT } from "./stage";

const BASE = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const SPELLED = "three_hundred_and_forty_seven_deaths";
const words = (id: string) => id.replace(/_+/g, " ");

describe("a model's metricId is a code, never a source of figures", () => {
  it("every registry id is free of figures (so stripping one never touches a real id)", () => {
    for (const d of METRIC_DEFS) expect(figuresIn(words(d.id)), d.id).toEqual([]);
  });
  it("an unknown id is not echoed: computeMetric's message names none of it", async () => {
    const r = await computeMetric(SPELLED, BASE as never, fakeHands());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toMatch(/three|hundred|forty|seven/i);
  });
  it("the changed screen for an unknown id shows nothing of it, and lends no figure from it", async () => {
    const doc = (await buildScreen("changed", { ...emptySlots(), metricId: SPELLED } as never, BASE, WORLD, fakeHands(), "what changed", "st-m")).doc as StageDocT;
    const shown = JSON.stringify([doc.title, doc.say, doc.notes, doc.blocks]);
    expect(shown).not.toMatch(/three|hundred|forty|seven/i);
    const allowed = speakableFigures(doc, "en");
    for (const v of ["3", "100", "40", "7", "347"]) expect(allowed.has(v), v).toBe(false);
  });
  it("metricId is one of the model's text slots: a figure in it is the model's", () => {
    expect(MODEL_TEXT_SLOTS as readonly string[]).toContain("metricId");
    const m = modelFigures({ slots: { metricId: "nine_thousand_forty_seven_cases" } } as never);
    for (const v of ["9", "1000", "47"]) expect(m.has(v), v).toBe(true);
  });
  it("the checker strips the figures out of a model's metricId and keeps a real one", () => {
    const sc = checkScreen({ recipe: "changed", metricId: SPELLED, period: "daily", zones: [] }, WORLD, null);
    expect(figuresIn(words(String(sc?.slots.metricId ?? "")))).toEqual([]);
    const real = METRIC_DEFS[0].id;
    expect(checkScreen({ recipe: "changed", metricId: real, period: "daily", zones: [] }, WORLD, null)?.slots.metricId).toBe(real);
  });
});
