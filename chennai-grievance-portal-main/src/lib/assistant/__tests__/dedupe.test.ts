import { describe, expect, it } from "vitest";
import { dedupeCaveats } from "@/lib/assistant/verify";

describe("caveats said twice in other words", () => {
  it("keeps the first and drops the composer's paraphrase", () => {
    const code = "Incidents are matched to Velachery by the place name in their records, within Adyar zone; an incident recorded under a street name alone is not counted.";
    const model = "Incidents matched by place name within Adyar zone; street-name-only records excluded.";
    expect(dedupeCaveats([code, model])).toEqual([code]);
  });

  it("keeps caveats about different things", () => {
    const rain = "A rain link means the incident was reported during or after a rain event; it does not by itself establish the cause.";
    const stale = "Air quality (CPCB) last collected 12 hours ago; this answer may be incomplete.";
    const taluk = "Kolathur is also a revenue taluk; ask for \"Kolathur taluk\" to see it.";
    expect(dedupeCaveats([rain, stale, taluk])).toEqual([rain, stale, taluk]);
  });
});
