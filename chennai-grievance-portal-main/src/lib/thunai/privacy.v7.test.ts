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
