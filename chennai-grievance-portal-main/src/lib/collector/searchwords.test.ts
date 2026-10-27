import { describe, expect, it } from "vitest";
import { matchesAll, searchGroups, stem } from "./searchwords";

// LT-36: "velachery flooding" and "garbage adyar" found 0 incidents (the whole query had to appear as one phrase).
describe("search: every word, any order", () => {
  const recs = [
    "Waterlogging on 100 Feet Road | Velachery | Adyar | Flooding & waterlogging",
    "Garbage not cleared for 8 days | Gandhi Nagar | Adyar | Garbage & solid waste",
    "Pothole on Velachery Main Road | Velachery | Adyar | Road damage"
  ];
  it.each([
    ["velachery flooding", 1], ["flooding velachery", 1], ["garbage adyar", 1], ["adyar garbage", 1], ["velachery", 2],
    ["velachery potholes", 1], ["waste adyar", 1], ["velachery garbage", 0]
  ])("%s → %i", (q, n) => expect(recs.filter((r) => matchesAll(r, searchGroups(q))).length).toBe(n));
  it("stems and stop words", () => {
    expect(stem("flooding")).toBe("flood");
    expect(stem("complaints")).toBe("complaint");
    expect(searchGroups("show me garbage in adyar").map((g) => g[0])).toEqual(["garbage", "adyar"]);
  });
});
