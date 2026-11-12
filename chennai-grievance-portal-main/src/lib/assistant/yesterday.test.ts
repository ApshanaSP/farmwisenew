import { expect, it } from "vitest";
import { customWindow } from "./fastpath";

// Hunter B, B5 (BUG-018): "yesterday" at 09:00 IST on 4 Nov was 2 Nov 09:00 to 3 Nov 09:00, not the calendar day 3 Nov
it("yesterday is the India calendar day before today", () => {
  for (const now of ["2026-11-04 09:00:00", "2026-11-04 00:30:00", "2026-11-04 23:50:00"]) {
    expect(customWindow("how many incidents yesterday", now)?.range).toEqual({ from: "2026-11-03 00:00:00", to: "2026-11-04 00:00:00" });
  }
  expect(customWindow("nethu evlo complaints", "2026-11-01 08:00:00")?.range).toEqual({ from: "2026-10-31 00:00:00", to: "2026-11-01 00:00:00" });
});

// RC-10 (PB-221, PB-081): one window table. "last week" and "last month" are calendar windows, not this week's and this month's rolling ones;
// every written form of yesterday (English, Tanglish, Tamil) gives the same calendar day, with no second offset on top of a range.
const NOW = "2026-11-06 18:08:00"; // a Friday
it("last week is the Monday to Sunday week before this one; this week stays the console's rolling window", () => {
  expect(customWindow("how many incidents last week", NOW)?.range).toEqual({ from: "2026-10-26 00:00:00", to: "2026-11-02 00:00:00" });
  expect(customWindow("how many incidents this week", NOW)).toBeNull();
  expect(customWindow("how many incidents in the last week", NOW)).toBeNull();
});
it("last month is the calendar month before this one", () => {
  expect(customWindow("complaints last month", NOW)?.range).toEqual({ from: "2026-10-01 00:00:00", to: "2026-11-01 00:00:00" });
  expect(customWindow("complaints this month", NOW)).toBeNull();
});
it.each(["yesterday", "nethu", "netru", "நேற்று", "நேற்றைய புகார்கள்", "நேத்து எவ்வளவு"])("%s is the same calendar day", (w) => {
  expect(customWindow(`how many ${w}`, NOW)?.range).toEqual({ from: "2026-11-05 00:00:00", to: "2026-11-06 00:00:00" });
});
it("since yesterday is not yesterday", () => expect(customWindow("what changed since yesterday", NOW)?.range).toBeUndefined());
