// QA pass 7, hunt2-ops-12 (P0): the briefing's AI opening is shown as today's only when it is the summary of the console's window and
// says what the live figures beside it say. The texts are the pinned build's own (briefings, as_of 6 Nov 18:08).
import { describe, expect, it } from "vitest";
import { checkOpening, claimedChanges, statedFigures } from "./opening";

const WEEKLY = "This week recorded more incidents than the previous period. We must focus on the severe flooding and waterlogging reported at Pulianthope in Anna Nagar and Ice House in Teynampet. We must also watch the IMD warning level 2 issued for 06 Nov and 5 unrecorded items appearing in the news.";
const WEEKLY_TA = "இந்த வாரம் முந்தைய காலகட்டத்தை விட அதிகமான சம்பவங்கள் பதிவாகியுள்ளன. மேலும் 06 நவம்பர் தேதிக்கான IMD எச்சரிக்கை நிலை 2 மற்றும் துறையின் பதிவில்லாத 5 செய்திகள்.";
const DAILY = "Today saw about the same number of incidents as the previous period. We must also watch the rising categories of street lights and electrical hazards, garbage and solid waste, and road accidents, along with the IMD warning level 2 for 06 Nov.";
const AS_OF = "2026-11-06 18:08:00";
const week = (now: string, change: number | null, figures: number[] = [1378, 1304, 65, 5]) => ({ now, hours: 168, change, figures });

describe("hunt2-ops-12: the stored briefing summary is today's or it is not shown", () => {
  it("a summary of the week to 6 Nov is not shown on 13 Nov, whatever it says", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week("2026-11-13 09:00:00", -78, [286, 1300]));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/window/);
  });

  it("in its own window, 'more incidents' beside a live fall is not shown", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week("2026-11-06 18:08:00", -78));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/more/);
  });

  it("in its own window, agreeing with the live change and figures, it is shown in English and Tamil", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week("2026-11-06 20:00:00", 6));
    expect(r.opening).toEqual({ en: WEEKLY, ta: WEEKLY_TA });
  });

  it("a figure in it that is not a live figure keeps it off", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: null }, week("2026-11-06 18:08:00", 6, [1378, 1304, 65, 4]));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/figures 5/);
  });

  it("'about the same' holds within 5% only", () => {
    const day = (change: number) => checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now: AS_OF, hours: 24, change, figures: [] });
    expect(day(2).opening?.en).toBe(DAILY);
    expect(day(-4).opening?.en).toBe(DAILY);
    expect(day(40).opening).toBeNull();
    expect(checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now: AS_OF, hours: 24, change: null, figures: [] }).opening).toBeNull();
  });

  it("the daily summary is only today's within a little over an hour of its window", () => {
    const at = (now: string) => checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now, hours: 24, change: 1, figures: [] }).opening;
    expect(at("2026-11-06 19:00:00")).not.toBeNull();
    expect(at("2026-11-07 09:00:00")).toBeNull();
    expect(checkOpening({ asOf: null, en: DAILY, ta: null }, { now: AS_OF, hours: 24, change: 1, figures: [] }).opening).toBeNull();
  });

  it("a Tamil text with a figure the English does not have is dropped, the English kept", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA.replace("5 செய்திகள்", "7 செய்திகள்") }, week(AS_OF, 6));
    expect(r.opening).toEqual({ en: WEEKLY, ta: null });
  });

  it("reads comparisons and figures, not dates, levels or a rising category", () => {
    expect(claimedChanges(DAILY)).toEqual(["same"]);
    expect(claimedChanges(WEEKLY)).toEqual(["more"]);
    expect(claimedChanges("Incidents fell compared with last week. Garbage complaints are rising.")).toEqual(["fewer"]);
    expect(statedFigures("1,378 incidents; IMD warning level 2 for 06 Nov, 2026-11-06 and Nov 6th")).toEqual([1378]);
  });
});
