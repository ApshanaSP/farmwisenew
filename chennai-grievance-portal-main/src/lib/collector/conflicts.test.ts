import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: vi.fn() }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/ai/gateway", () => ({ generateJson: vi.fn() }));

import { claimHolds, claimsOf, distinct, numbersOf, ruleDifferences, sameIncident, type Report } from "./conflicts";

const rep = (id: string, t: string, publisher: string, head: string, more: Partial<Report> = {}): Report =>
  ({ id, t, publisher, head, original: null, summary: "", lead: "", lang: "en", ...more });

describe("counts a report states", () => {
  it("reads deaths, injured, arrests and age in words or digits", () => {
    expect(claimsOf(rep("a", "", "x", "Two workers die of asphyxiation while cleaning sump in Chennai")).get("Deaths")?.v).toBe(2);
    expect(claimsOf(rep("a", "", "x", "Four schoolchildren found dead in Chennai lake after going missing")).get("Deaths")?.v).toBe(4);
    expect(claimsOf(rep("a", "", "x", "Midnight bike race: youth dies after falling from flyover — 7 arrested!")).get("Arrests")?.v).toBe(7);
    expect(claimsOf(rep("a", "", "x", "Veteran filmmaker Singeetham Srinivasa Rao passes away at 94 in a Chennai hospital")).get("Age")?.v).toBe(94);
  });
  it("reads Tamil counts", () => {
    const r = rep("a", "", "x", "Ice House murder", { original: "சென்னை ஐஸ் ஹவுஸ் இளைஞர் கொலை.. 4 பேர் கைது", lang: "ta" });
    expect(claimsOf(r).get("Arrests")?.v).toBe(4);
  });
  it("does not count 'more' arrests or years as a toll", () => {
    expect(claimsOf(rep("a", "", "x", "Traffic police nab 5 more for bike stunts along Anna Salai")).get("Arrests")).toBeUndefined();
    expect(claimsOf(rep("a", "", "x", "Kalki Bhagavan Dies At 77: Spiritual Leader Passes Away")).get("Deaths")).toBeUndefined();
  });
});

describe("differences between outlets", () => {
  it("flags two outlets giving different ages at the same time", () => {
    const d = ruleDifferences([
      rep("a", "2026-10-09 10:00:00", "Pinkvilla", "Veteran filmmaker Singeetham Srinivasa Rao passes away at 94 in a Chennai hospital"),
      rep("b", "2026-10-09 11:00:00", "ET Now", "Singeetham Srinivasa Rao dies at 95: Legendary filmmaker passes away")
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: "Age", kind: "conflict" });
    expect(d[0].claims.map((c) => c.publisher)).toEqual(["Pinkvilla", "ET Now"]);
  });
  it("leaves out a count that rises over a day, and finds no difference in the same count", () => {
    expect(ruleDifferences([
      rep("a", "2026-10-06 08:00:00", "DT Next", "Two killed as wall collapses in Chennai"),
      rep("b", "2026-10-07 09:00:00", "The Hindu", "Three dead in wall collapse in Chennai")
    ])).toEqual([]);
    expect(ruleDifferences([
      rep("a", "2026-10-06 08:00:00", "DT Next", "Two workers die in sump"),
      rep("b", "2026-10-06 09:00:00", "The Hindu", "2 workers died while cleaning sump")
    ])).toEqual([]);
  });
  it("says what differs in one sentence", () => {
    const d = ruleDifferences([
      rep("a", "2026-10-06 08:00:00", "DT Next", "Three killed as wall collapses in Chennai"),
      rep("b", "2026-10-06 09:00:00", "The Hindu", "Two killed as wall collapses in Chennai")
    ]);
    expect(d[0].what).toBe("The outlets give different death tolls: 3 (DT Next), 2 (The Hindu).");
  });
  it("ignores an outlet that gives no count", () => {
    expect(ruleDifferences([
      rep("a", "2026-10-06 08:00:00", "DT Next", "Car plunges into sinkhole on OMR"),
      rep("b", "2026-10-06 09:00:00", "The Hindu", "Two injured as car plunges into sinkhole on OMR")
    ])).toEqual([]);
  });
});

describe("an AI claim must be in its report", () => {
  const r = rep("a", "", "The Hindu", "Migrant worker electrocuted in Nanganallur", { summary: "Two others were injured." });
  it("keeps a figure the report has, in digits or words", () => {
    expect(claimHolds("2 injured", r)).toBe(true);
    expect(numbersOf("two others").has(2)).toBe(true);
  });
  it("drops a figure the report does not have, or words it never used", () => {
    expect(claimHolds("3 injured", r)).toBe(false);
    expect(claimHolds("happened in Tambaram", r)).toBe(false);
    expect(claimHolds("happened in Nanganallur", r)).toBe(true);
  });
});

describe("a difference must really differ", () => {
  const c = (publisher: string, says: string) => ({ docId: publisher, publisher, t: "2026-10-12 08:00:00", says });
  it("keeps different figures, ignoring a claim with no figure", () => {
    expect(distinct([c("NIE", "Ten people sustained injuries"), c("The Hindu", "leaving nine people injured")])?.length).toBe(2);
    expect(distinct([c("TOI", "more than 100 protesters detained"), c("Dinakaran", "members arrested for black flag protest")])).toBeNull();
  });
  it("drops the same figure or the same name in other words", () => {
    expect(distinct([c("DT Next", "S Goutham (28) of Kasimedu"), c("The Hindu", "S. Gautham, 28, of Jeevarathinam Nagar")])).toBeNull();
    expect(distinct([c("The Hindu", "his friend Sathyabharathi"), c("DT Next", "and his friend Sathyabharathi")])).toBeNull();
    expect(distinct([c("The Hindu", "the victim Ramesh"), c("DT Next", "the victim Suresh")])?.length).toBe(2);
  });
});

describe("a count must be a count of its field", () => {
  const c = (publisher: string, says: string) => ({ docId: publisher, publisher, t: "2026-10-13 08:00:00", says });
  it("does not compare protesters with arrests", () => {
    expect(distinct([c("Dinakaran", "300க்கும் மேற்பட்டோர் கைது"), c("NIE", "Nearly 500 hospital workers staged a protest")], "Arrests")).toBeNull();
    // two estimates ("more than 300", "nearly 500") never disagree; two exact figures do
    expect(distinct([c("Dinakaran", "300க்கும் மேற்பட்டோர் கைது"), c("NIE", "Nearly 500 workers were detained")], "Arrests")).toBeNull();
    expect(distinct([c("Dinakaran", "300 பேர் கைது"), c("NIE", "500 workers were detained")], "Arrests")?.length).toBe(2);
  });
});

describe("precision: different incidents and non-counts are not disagreements", () => {
  it("never reads a date as a count ('May 17 Movement')", () => {
    expect(claimsOf(rep("a", "", "x", "May 17 Movement members arrested for holding black flag protest")).get("Arrests")).toBeUndefined();
  });
  it("never compares an estimate ('over 100') with a figure", () => {
    expect(ruleDifferences([
      rep("a", "2026-10-10 16:00:00", "NDTV", "Over 100 Detained During Protest In Chennai"),
      rep("b", "2026-10-10 20:00:00", "Deccan Herald", "40 detained in Chennai during protests")
    ])).toEqual([]);
  });
  it("does not compare reports of two places (Kodungaiyur and Pallikaranai)", () => {
    const a = rep("a", "2026-10-13 10:55:00", "Dinakaran", "Two people die of toxic gas inhalation in Kodungaiyur", { places: ["Kodungaiyur"] });
    const b = rep("b", "2026-10-14 07:26:00", "DT Next", "One man dies after inhaling toxic gas", { places: ["Pallikaranai"] });
    expect(sameIncident(a, b)).toBe(false);
    expect(ruleDifferences([a, b])).toEqual([]);
  });
  it("does not compare reports days apart, or a follow-up ('fresh spell')", () => {
    expect(ruleDifferences([
      rep("a", "2026-10-08 12:58:00", "The Hindu", "Two arrested for robbing food delivery worker"),
      rep("b", "2026-10-10 21:15:00", "Daily Thanthi", "Delivery worker stabbed - 6 arrested")
    ])).toEqual([]);
    expect(ruleDifferences([
      rep("a", "2026-10-11 00:20:00", "The Times of India", "40 protesters were detained"),
      rep("b", "2026-10-11 08:58:00", "The New Indian Express", "Fresh spell of youth protests in Chennai, 150 detained")
    ])).toEqual([]);
  });
  it("keeps a real disagreement in the same place on the same day", () => {
    const d = ruleDifferences([
      rep("a", "2026-10-13 09:00:00", "Dinakaran", "Two die of toxic gas in Kodungaiyur", { places: ["Kodungaiyur"] }),
      rep("b", "2026-10-13 11:00:00", "DT Next", "Three die of toxic gas in Kodungaiyur", { places: ["Kodungaiyur", "Tondiarpet"] })
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].field).toBe("Deaths");
  });
});

describe("estimates in AI claims", () => {
  const c = (publisher: string, says: string) => ({ docId: publisher, publisher, t: "2026-10-10 16:00:00", says });
  it("does not set an estimate against another estimate or a figure", () => {
    expect(distinct([c("NDTV", "Over 100 Detained"), c("Deccan Herald", "Over 40 detained")], "Arrests")).toBeNull();
    expect(distinct([c("NDTV", "more than 100 detained"), c("TOI", "102 detained")], "Arrests")).toBeNull();
    expect(distinct([c("TOI", "40 detained"), c("NIE", "150 detained")], "Arrests")?.length).toBe(2);
  });
});
