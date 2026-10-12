import { describe, expect, it } from "vitest";
import { fillFacts, verifyNumbers } from "@/lib/assistant/verify";
import type { Fact } from "@/lib/assistant/types";

const F = (id: string, value: number, unit?: string): Fact => ({ id, label: id, value, unit } as Fact);
const facts = [F("env.rain", 0, "mm"), F("env.aqi", 85, "AQI"), F("env.lakes", 34.1, "% full"), F("reported.now", 179), F("share", 12.5, "%"), F("backlog.x.days", 9, "days")];

describe("figures keep their units", () => {
  it("prints measurement units the sentence leaves out", () => {
    expect(fillFacts("Rainfall averaged {{env.rain}}, air quality is {{env.aqi}} and storage stands at {{env.lakes}}.", facts).text)
      .toBe("Rainfall averaged 0 mm, air quality is 85 AQI and storage stands at 34.1% full.");
  });
  it("does not double a unit the sentence already writes", () => {
    expect(fillFacts("{{env.rain}} mm of rain; {{env.lakes}}% full; {{env.lakes}} full; {{backlog.x.days}} days open", facts).text)
      .toBe("0 mm of rain; 34.1% full; 34.1% full; 9 days open");
  });
  it("sees a unit written after bold markers", () => {
    expect(fillFacts("an average of **{{backlog.x.days}}** days open", facts).text).toBe("an average of **9** days open");
  });
  it("leaves counts and percentages as before", () => {
    expect(fillFacts("{{reported.now}} incidents, {{share}} of them", facts).text).toBe("179 incidents, 12.5% of them");
  });
  it("the filled text still passes the number check", () => {
    const t = fillFacts("Rainfall {{env.rain}}, storage {{env.lakes}}, {{reported.now}} incidents", facts).text;
    expect(verifyNumbers([t], facts).ok).toBe(true);
  });
});
