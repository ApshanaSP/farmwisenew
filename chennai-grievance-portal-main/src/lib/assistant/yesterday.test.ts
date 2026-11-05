import { expect, it } from "vitest";
import { customWindow } from "./fastpath";

// Hunter B, B5 (BUG-018): "yesterday" at 09:00 IST on 4 Nov was 2 Nov 09:00 to 3 Nov 09:00, not the calendar day 3 Nov
it("yesterday is the India calendar day before today", () => {
  for (const now of ["2026-11-04 09:00:00", "2026-11-04 00:30:00", "2026-11-04 23:50:00"]) {
    expect(customWindow("how many incidents yesterday", now)?.range).toEqual({ from: "2026-11-03 00:00:00", to: "2026-11-04 00:00:00" });
  }
  expect(customWindow("nethu evlo complaints", "2026-11-01 08:00:00")?.range).toEqual({ from: "2026-10-31 00:00:00", to: "2026-11-01 00:00:00" });
});
