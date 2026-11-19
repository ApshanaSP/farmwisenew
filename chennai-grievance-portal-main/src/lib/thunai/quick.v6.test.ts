/**
 * v6: a place's state asked loosely goes to the situation screen, built by code with no planner (the fast path): English, Tanglish and
 * Tamil, "right now" included. A kind or a severity named with it keeps its own screen; no place, or two, is not this. Sentences invented.
 */
import { describe, expect, it } from "vitest";
import { placeStatus, quickScreen } from "./quick";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";
import { ZONE_TA_NAME } from "./lexicon";

const w = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts } as never;
const q = (t: string) => quickScreen(t, w, { analysis: true });

describe("v6: a place's state, asked loosely", () => {
  it.each([
    ["What's happening in Royapuram right now?", 5, "daily"], ["How is Teynampet doing this week?", 9, "weekly"], ["What's worst in Adyar today?", 13, "daily"],
    ["Kodambakkam la enna nadakkudhu", 10, "daily"], ["ராயபுரத்துல இப்போ என்ன நடக்குது?", 5, "daily"], ["தேனாம்பேட்டை இந்த வாரம் எப்படி இருக்கு?", 9, "weekly"],
    ["Teynampet இந்த week எப்படி இருக்கு?", 9, "weekly"], ["how are things in Adyar", 13, "daily"]
  ])("%s -> the situation of zone %i, %s", (text, zone, period) => {
    expect(q(text)).toMatchObject({ recipe: "situation", slots: { zones: [zone], period } });
  });
  it("a kind or a severity named with it keeps its own screen; no place or two places is not this lane", () => {
    expect(q("What's happening with the flooding in Adyar?")?.recipe).not.toBe("situation");
    expect(q("Is anything serious going on in Kodambakkam today?")?.recipe).toBe("cases");
    expect(q("What's happening today?")?.recipe).not.toBe("situation");
    expect(q("How is Adyar doing against Royapuram?")?.recipe).not.toBe("situation");
  });
  it("placeStatus reads the normalised text only", () => {
    expect(placeStatus(" whats happening in royapuram ")).toBe(true);
    expect(placeStatus(" how is the trend ")).toBe(false);
    expect(placeStatus(" show the severe cases ")).toBe(false);
  });
});

describe("v6: a place's state in Tamil and Tanglish", () => {
  // (not covered: "அடையாறுல ... எது ரொம்ப மோசமா இருக்கு?", "which is the worst": its "ரொம்ப"/"மோசமான" are the ranking words, and a ranking
  // inside one zone is left to the planner as before)
  it("Royapuram-ல இப்போ என்ன situation? -> Royapuram's situation now (today)", () => {
    expect(q("Royapuram-ல இப்போ என்ன situation?")).toMatchObject({ recipe: "situation", slots: { zones: [5], period: "daily" } });
  });
});

describe("v6: the place lane takes only a place's state (the independent check, 17 Nov)", () => {
  it("a question about something else in a place is not the place's situation screen", () => {
    for (const t of ["whats happening with incident 4521 in Adyar", "how is the Adyar river looking", "How is the weather looking in Adyar", "how is the AE doing in Royapuram",
      "how is the commissioner doing in Royapuram"]) {
      expect(quickScreen(t, w, { analysis: true })?.recipe, t).not.toBe("situation");
    }
  });
  it("the place's own state still is", () => {
    for (const t of ["What's happening in Royapuram right now?", "How is Teynampet doing this week?", "Kodambakkam la enna nadakkudhu"]) {
      expect(quickScreen(t, w, { analysis: true })?.recipe, t).toBe("situation");
    }
  });
});
