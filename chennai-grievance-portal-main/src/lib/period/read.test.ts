// QA pass 7 (rules-periods): the one period reader both rules lanes use. Each meaning, in English, Tamil and Tanglish, and the edge days.
import { describe, expect, it } from "vitest";
import { checkSpec, compareOf, heldBy, readPeriod, spanOf, type PeriodSpec } from "./read";

const kind = (q: string) => readPeriod(q);
const NOW = "2026-11-06 18:08:00"; // the pinned snapshot's as-of (a Friday)

describe("one meaning per phrase, in three languages", () => {
  it.each([
    // today: the calendar day
    ["How many new complaints came in today?", { kind: "day", back: 0 }],
    ["இன்று எத்தனை புகார்கள் வந்தன", { kind: "day", back: 0 }],
    ["innaiku evlo complaints vandhuchu", { kind: "day", back: 0 }],
    ["inniki evlo complaints open irukku", { kind: "day", back: 0 }],
    ["what came in this morning", { kind: "day", back: 0 }],
    // right now: the current state
    ["How many severe incidents are open right now?", { kind: "now" }],
    ["how many cases are currently open", { kind: "now" }],
    ["இப்போது எத்தனை கடுமையான சம்பவங்கள் நிலுவையில் உள்ளன", { kind: "now" }],
    ["ippo evlo severe cases open-la irukku", { kind: "now" }],
    ["தற்போது திறந்த புகார்கள்", { kind: "now" }],
    // yesterday and the day before
    ["how many incidents yesterday", { kind: "day", back: 1 }],
    ["நேற்று எத்தனை புகார்கள்", { kind: "day", back: 1 }],
    ["nethu evlo complaints", { kind: "day", back: 1 }],
    ["complaints the day before yesterday", { kind: "day", back: 2 }],
    ["Let me see the fire incidents from yesterday", { kind: "day", back: 1 }],
    ["complaints from yesterday onwards", { kind: "window", key: "daily" }],
    // the previous calendar unit
    ["Tondiarpet report. Last month.", { kind: "last", unit: "month" }],
    ["தண்டையார்பேட்டை அறிக்கை. கடந்த மாதம்.", { kind: "last", unit: "month" }],
    ["போன மாசம் கடுமையான புகார்கள் காட்டு", { kind: "last", unit: "month" }],
    ["Tondiarpet report pona maasam", { kind: "last", unit: "month" }],
    ["kadantha maasam severe cases kaattu", { kind: "last", unit: "month" }],
    ["show overdue cases last week", { kind: "last", unit: "week" }],
    ["கடந்த வாரம் காலக்கெடு தாண்டிய புகார்கள்", { kind: "last", unit: "week" }],
    ["pona vaaram deadline thaandiya cases kaattu", { kind: "last", unit: "week" }],
    ["complaints from last month", { kind: "last", unit: "month" }],
    ["severe cases last quarter", { kind: "last", unit: "quarter" }],
    // rolling, as said
    ["complaints in the last week", { kind: "window", key: "weekly" }],
    ["complaints since last week", { kind: "window", key: "weekly" }],
    ["கடந்த வாரத்தில் புகார்", { kind: "window", key: "weekly" }],
    ["severe complaints this week", { kind: "window", key: "weekly" }],
    ["இந்த வாரம் தீவிர புகார்கள்", { kind: "window", key: "weekly" }],
    ["indha vaaram severe complaints", { kind: "window", key: "weekly" }],
    ["incidents in the last 7 days", { kind: "window", key: "weekly" }],
    ["complaints in the last 30 days", { kind: "window", key: "monthly" }],
    ["complaints this month", { kind: "window", key: "monthly" }],
    ["how much rain in the last 24 hours", { kind: "window", key: "daily" }],
    ["கடந்த 24 மணி நேரத்தில் எவ்வளவு மழை", { kind: "window", key: "daily" }],
    ["last 90 days", { kind: "window", key: "quarterly" }],
    ["what changed since yesterday", { kind: "window", key: "daily" }],
    ["last 10 days", { kind: "hours", hours: 240, n: 10, unit: "day" }],
    ["past 3 weeks", { kind: "hours", hours: 504, n: 3, unit: "week" }],
    ["கடந்த 10 நாட்கள் கொலை", { kind: "hours", hours: 240, n: 10, unit: "day" }],
    // comparisons of two periods
    ["Garbage complaints, up or down from last month?", { kind: "compare", key: "monthly" }],
    ["garbage complaints this month vs last month", { kind: "compare", key: "monthly" }],
    ["are accidents higher than last week", { kind: "compare", key: "weekly" }],
    ["more fires today than yesterday?", { kind: "compare", key: "daily" }],
    ["குப்பை புகார்கள் கடந்த மாதத்தை விட கூடியதா குறைந்ததா", { kind: "compare", key: "monthly" }],
    ["குப்பை புகார்கள் நேற்றை விட அதிகமா", { kind: "compare", key: "daily" }],
    ["kuppai complaints pona maasatha vida kooduchaa korainjaa", { kind: "compare", key: "monthly" }],
    ["garbage complaints month on month", { kind: "compare", key: "monthly" }],
    // a time the records cannot answer
    ["show severe cases two weeks ago", { kind: "unheld" }],
    ["cases next week", { kind: "unheld" }],
    ["severe cases last year", { kind: "unheld" }],
    ["இரண்டு வாரம் முன்பு கடுமையான புகார்கள்", { kind: "unheld" }],
    ["rendu vaaram munnaadi severe cases kaattu", { kind: "unheld" }],
    // nothing named
    ["garbage complaints in Anna Nagar", { kind: "none" }],
    ["severe incidents open for more than 7 days", { kind: "none" }]
  ] as [string, PeriodSpec][])("%s", (q, want) => expect(kind(q)).toEqual(want));
});

describe("Tamil words that only start like a period word are not one", () => {
  it("மாதவரம் (Madhavaram zone) is not a month, வார்டு (a ward) is not a week", () => {
    expect(kind("மாதவரத்தில் தீ புகார்கள்")).toEqual({ kind: "none" });
    expect(kind("வார்டு 172 இல் தீவிர புகார்கள்")).toEqual({ kind: "none" });
    expect(kind("இந்த மாதவரம் புகார்கள்")).toEqual({ kind: "none" });
  });
  it("'now' as the first word of a command is not the current state", () => expect(kind("now show me Adyar")).toEqual({ kind: "none" }));
});

describe("dates, from the store's now", () => {
  it("today is midnight IST to now, inside the last 24 hours", () => {
    const s = spanOf({ kind: "day", back: 0 }, NOW)!;
    expect(s.range).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-06 18:08:01" });
    expect(s.label.en).toBe("today (6 Nov, since midnight)");
    expect(heldBy(s, NOW)).toBe("daily");
  });
  it("just after midnight IST (the UTC date is still yesterday), today is the new IST day", () => {
    const s = spanOf({ kind: "day", back: 0 }, "2026-11-07 00:20:00")!;
    expect(s.range?.from).toBe("2026-11-07 00:00:00");
    expect(spanOf({ kind: "day", back: 1 }, "2026-11-07 00:20:00")!.range).toEqual({ from: "2026-11-06 00:00:00", to: "2026-11-07 00:00:00" });
  });
  it("last month on the 1st is the whole month before, not a day of this one", () => {
    expect(spanOf({ kind: "last", unit: "month" }, "2026-11-01 00:05:00")!.range).toEqual({ from: "2026-10-01 00:00:00", to: "2026-11-01 00:00:00" });
    expect(spanOf({ kind: "last", unit: "month" }, NOW)!.label.en).toBe("last month (October)");
  });
  it("last month in January is December of the year before, and says the year", () => {
    const s = spanOf({ kind: "last", unit: "month" }, "2027-01-03 09:00:00")!;
    expect(s.range).toEqual({ from: "2026-12-01 00:00:00", to: "2027-01-01 00:00:00" });
    expect(s.label.en).toBe("last month (December 2026)");
  });
  it("last week is Monday to Sunday before this week, on a Monday and on a Sunday", () => {
    expect(spanOf({ kind: "last", unit: "week" }, "2026-11-02 08:00:00")!.range).toEqual({ from: "2026-10-26 00:00:00", to: "2026-11-02 00:00:00" });
    expect(spanOf({ kind: "last", unit: "week" }, "2026-11-08 23:59:00")!.range).toEqual({ from: "2026-10-26 00:00:00", to: "2026-11-02 00:00:00" });
  });
  it("last month is not held by the last 30 days", () => expect(heldBy(spanOf({ kind: "last", unit: "month" }, NOW)!, NOW)).toBeNull());
  it("right now has no reporting window and is never held by a console window", () => {
    const s = spanOf({ kind: "now" }, NOW)!;
    expect(s.now).toBe(true);
    expect(s.range?.from).toBe("2000-01-01 00:00:00");
    expect(heldBy(s, NOW)).toBeNull();
  });
  it("a comparison is the window back from now against the one of the same length just before it", () => {
    const c = compareOf("monthly", NOW)!;
    expect(c.cur.range).toEqual({ from: "2026-10-07 18:08:01", to: "2026-11-06 18:08:01" });
    expect(c.prev.range).toEqual({ from: "2026-09-07 18:08:01", to: "2026-10-07 18:08:01" });
    expect(c.label.en).toBe("the last 30 days against the month before (7 Sept to 7 Oct)");
  });
  it("a spec survives a trip through slots (JSON), and junk does not", () => {
    for (const s of [{ kind: "now" }, { kind: "day", back: 0 }, { kind: "last", unit: "month" }, { kind: "compare", key: "monthly" }] as PeriodSpec[])
      expect(checkSpec(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(checkSpec({ kind: "day", back: 9 })).toBeNull();
    expect(checkSpec({ kind: "window", key: "yearly" })).toBeNull();
    expect(checkSpec("now")).toBeNull();
  });
});
