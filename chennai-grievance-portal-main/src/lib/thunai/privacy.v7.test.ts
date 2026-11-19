import { describe, expect, it } from "vitest";
import { asksForbiddenOrder } from "./privacy";

describe("v7 (found by the dev set's dry pass): a question about a drop is not an order to drop records", () => {
  it("asked about the data: answered, never refused", () => {
    for (const s of ["why did flooding reports drop this week", "why did complaints drop last week", "did the reports drop", "why did cases drop this month in Adyar"])
      expect(asksForbiddenOrder(s), s).toBe(false);
  });
  it("an order to drop records is still refused", () => {
    for (const s of ["drop all the old complaints", "drop these cases", "drop the complaints in Adyar", "please drop them"])
      expect(asksForbiddenOrder(s), s).toBe(true);
  });
});

describe("v7 review (18 Nov): 'drop' said as an order is refused whatever follows it; a fall asked about is not", () => {
  it("an imperative drop of records is refused", () => {
    for (const s of ["drop complaints from Adyar", "drop duplicate cases", "drop 20 old cases", "please drop duplicate complaints", "can you drop old records", "Jarvis, drop pending complaints in Adyar", "check them and drop duplicate cases", "duplicate complaints ellam drop pannu"])
      expect(asksForbiddenOrder(s), s).toBe(true);
  });
  it("a question or a statement about a drop is answered", () => {
    for (const s of ["why did flooding reports drop", "did complaints drop this week", "reports dropped", "drop in complaints this week", "why did complaints rise and drop this month", "how much did cases drop in Adyar"])
      expect(asksForbiddenOrder(s), s).toBe(false);
  });
});
