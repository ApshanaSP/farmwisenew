// QA pass 7, hunt2-ops-12 (P0): the briefing's AI opening is shown as today's only when it is the summary of the console's window and
// says what the live figures beside it say. The texts are the pinned build's own (briefings, as_of 6 Nov 18:08) and the cases the P7
// reviewer used to break the first version of the check (B1-B12: contradictions that passed; R1-R5: true summaries that were rejected).
import { describe, expect, it } from "vitest";
import { checkOpening, claimedChanges, statedFigures, type LiveFacts } from "./opening";

const WEEKLY = "This week recorded more incidents than the previous period. We must focus on the severe flooding and waterlogging reported at Pulianthope in Anna Nagar and Ice House in Teynampet. We must also watch the IMD warning level 2 issued for 06 Nov and 5 unrecorded items appearing in the news.";
const WEEKLY_TA = "இந்த வாரம் முந்தைய காலகட்டத்தை விட அதிகமான சம்பவங்கள் பதிவாகியுள்ளன. மேலும் 06 நவம்பர் தேதிக்கான IMD எச்சரிக்கை நிலை 2 மற்றும் துறையின் பதிவில்லாத 5 செய்திகள்.";
const DAILY = "Today saw about the same number of incidents as the previous period. We must also watch the rising categories of street lights and electrical hazards, garbage and solid waste, and road accidents, along with the IMD warning level 2 for 06 Nov.";
const AS_OF = "2026-11-06 18:08:00";

/** live facts with a given change in all incidents (1,000 reported) and severe ones (60 reported) */
const facts = (change: number, over: Partial<LiveFacts> = {}, sevChange = 8): LiveFacts => ({
  reported: 1000, prev: Math.round(1000 / (1 + change / 100)), severe: 60, prevSevere: Math.round(60 / (1 + sevChange / 100)),
  open: 400, overdue: 12, multi: 46, newsOnly: 5, complaints: 9, ...over });
const week = (change: number, over: Partial<LiveFacts> = {}, now = AS_OF) => ({ now, hours: 168, facts: facts(change, over) });
const shown = (en: string, change: number, over: Partial<LiveFacts> = {}, ta: string | null = null) =>
  checkOpening({ asOf: AS_OF, en, ta }, week(change, over)).opening;

describe("hunt2-ops-12: the stored briefing summary is today's or it is not shown", () => {
  it("a summary of the week to 6 Nov is not shown on 13 Nov, whatever it says", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week(-78, {}, "2026-11-13 09:00:00"));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/window/);
  });
  it("in its own window, 'more incidents' beside a live fall is not shown", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week(-78));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/more incidents/);
  });
  it("in its own window, agreeing with the live change and figures, it is shown in English and Tamil", () => {
    expect(checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA }, week(6, {}, "2026-11-06 20:00:00")).opening).toEqual({ en: WEEKLY, ta: WEEKLY_TA });
  });
  it("a figure that is not the live figure of its noun keeps it off ('5 unrecorded items in the news' beside 73)", () => {
    const r = checkOpening({ asOf: AS_OF, en: WEEKLY, ta: null }, week(6, { newsOnly: 73 }));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/5 is not the live newsOnly/);
  });
  it("'about the same' holds within 5% only, and needs a previous figure", () => {
    const day = (change: number) => checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now: AS_OF, hours: 24, facts: facts(change) }).opening;
    expect(day(2)?.en).toBe(DAILY);
    expect(day(-4)?.en).toBe(DAILY);
    expect(day(40)).toBeNull();
    expect(checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now: AS_OF, hours: 24, facts: { reported: 10, prev: null } }).opening).toBeNull();
  });
  it("the daily summary is today's within 2 hours of its window (hourly builds), not the next morning", () => {
    const at = (now: string) => checkOpening({ asOf: AS_OF, en: DAILY, ta: null }, { now, hours: 24, facts: facts(1) }).opening;
    expect(at("2026-11-06 19:30:00")).not.toBeNull(); // R4: 82 minutes after the build
    expect(at("2026-11-07 09:00:00")).toBeNull();
    expect(checkOpening({ asOf: null, en: DAILY, ta: null }, { now: AS_OF, hours: 24, facts: facts(1) }).opening).toBeNull();
  });
  it("the Tamil is dropped when its figures differ from the English, or it says another way (B10); the English is kept", () => {
    expect(checkOpening({ asOf: AS_OF, en: WEEKLY, ta: WEEKLY_TA.replace("5 செய்திகள்", "7 செய்திகள்") }, week(6)).opening).toEqual({ en: WEEKLY, ta: null });
    const en = "This week saw about the same number of incidents as the previous period.";
    const ta = "இந்த வாரம் முந்தைய காலகட்டத்தை விட அதிகமான சம்பவங்கள் பதிவாகியுள்ளன.";
    expect(shown(en, 2, {}, ta)).toEqual({ en, ta: null });
    expect(shown(en, 2, {}, "இந்த வாரம் முந்தைய காலகட்டத்தைப் போலவே ஏறக்குறைய அதே எண்ணிக்கையிலான சம்பவங்கள்.")?.ta).not.toBeNull();
  });
  it("reads comparisons per clause and figures, not dates, levels, durations or a rising category", () => {
    expect(claimedChanges(DAILY)).toEqual([{ subject: "total", ways: ["same"] }]);
    expect(claimedChanges(WEEKLY)).toEqual([{ subject: "total", ways: ["more"] }]);
    expect(claimedChanges("Incidents fell compared with last week. Garbage complaints in some categories are rising.")).toEqual([{ subject: "total", ways: ["fewer"] }]);
    expect(statedFigures("1,378 incidents in the past 24 hours; IMD warning level 2 for 06 Nov, 2026-11-06 and Nov 6th; twelve severe")).toEqual([1378, 12]);
  });
});

describe("P7 review: contradictions in the summary's own window are not shown", () => {
  it.each([
    ["B1 a rise with no comparison word", "Incidents rose 6% this week.", -6],
    ["B2 two ways in one sentence", "There were fewer incidents than the previous week, with more severe cases among them.", 20],
    ["B3 'follow up' is not a rise", "Fewer incidents were reported than last week; departments must follow up on the 12 overdue ones.", 20],
    ["B4 doubled", "Incidents doubled compared with last week.", -50],
    ["B4 climbed", "Incidents climbed compared with the previous week.", -30],
    ["B4 soared", "Reports soared compared with the previous week.", -30],
    ["B4 twice as many", "There were twice as many incidents as last week.", -50],
    ["B4 a sharp fall", "Incidents saw a sharp fall compared with the previous week.", 30],
    ["B4 halved", "Incidents halved compared with last week.", 100],
    ["B4 plunged", "Incidents plunged compared with the previous week.", 40],
    ["B5 'rose sharply' beside +3%", "Incidents rose sharply compared with last week while severe cases held steady.", 3],
    ["B6 a percentage that is another figure", "Incidents were 65% higher than the previous week.", 6],
    ["B7 the sign of a stated percentage", "Incidents climbed 6% over the previous week.", -6],
    ["B8 a number in words", "Twelve severe incidents were reported this week.", 6],
    ["B9 the overdue count as the severe count", "12 severe incidents were reported this week.", 6],
    ["doubled beside a small rise", "Incidents doubled compared with last week.", 20]
  ] as [string, string, number][])("%s", (_name, en, change) => {
    expect(shown(en, change)).toBeNull();
  });
  it("B11 the previous day's severe count as today's; B12 a severe rise checked against severe, not all incidents", () => {
    const day = { now: AS_OF, hours: 24, facts: { reported: 239, prev: 232, severe: 9, prevSevere: 22, open: 236, overdue: 22, multi: 3, newsOnly: 10, complaints: 147 } };
    const DAY = "Today saw about the same number of incidents as the previous period.";
    expect(checkOpening({ asOf: AS_OF, en: `${DAY} There were 22 severe incidents.`, ta: null }, day).opening).toBeNull();
    expect(checkOpening({ asOf: AS_OF, en: `${DAY} Severe incidents rose compared with the previous day.`, ta: null }, day).opening).toBeNull();
    // R5: the true one is shown, and "22 severe the previous day" is the previous figure
    expect(checkOpening({ asOf: AS_OF, en: `${DAY} Severe incidents fell compared with the previous day.`, ta: null }, day).opening).not.toBeNull();
    expect(checkOpening({ asOf: AS_OF, en: `${DAY} There were 9 severe incidents, against 22 severe the previous day.`, ta: null }, day).opening).not.toBeNull();
  });
});

describe("P7 review: true summaries in their own window are shown", () => {
  it("R1 a percentage with a decimal (the live change is rounded)", () => expect(shown("Incidents were 5.9% higher than the previous week.", 6)).not.toBeNull());
  it("R2 'more' in another clause about the news", () => expect(shown("Incidents fell compared with last week, though more of them came from the news.", -10)).not.toBeNull());
  it("R3 a negation", () => expect(shown("Incidents did not rise compared with last week.", -10)).not.toBeNull());
  it("the briefing book's situation note: deaths and the day as a whole", () => {
    const en = "The past 24 hours remained about the same as the previous day across the city. Critical incidents included flooding in Egmore resulting in 1 death.";
    const f = (deaths: number, change: number) => ({ now: AS_OF, hours: 24, facts: { ...facts(change), deaths } });
    expect(checkOpening({ asOf: AS_OF, en, ta: null }, f(1, 2)).opening).not.toBeNull();
    expect(checkOpening({ asOf: AS_OF, en, ta: null }, f(0, 2)).opening).toBeNull();
    expect(checkOpening({ asOf: AS_OF, en, ta: null }, f(1, 30)).opening).toBeNull();
  });
});

describe("27 Nov: the hosted log's rejections of true openings", () => {
  const PREV_ONE = "This period saw more incidents than the previous one.";
  it("'the previous one' is no figure: the opening holds when the live change is a rise, and not when it is a fall", () => {
    expect(statedFigures(PREV_ONE)).toEqual([]);
    expect(shown(PREV_ONE, 4)).not.toBeNull();
    const r = checkOpening({ asOf: AS_OF, en: PREV_ONE, ta: null }, week(-3));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/beside a live change of -3%/);
  });
  it("27 Nov review: 'the one' before what it counts is still a figure ('the one man killed' beside 2 deaths stays off)", () => {
    for (const en of ["The one man killed was in Adyar.", "Police said the one worker who died was from Perambur.", "The previous one recorded 2 deaths."]) {
      expect(statedFigures(en)).toContain(1);
    }
    // "no one was hurt" is no injured: held to the live figure as 0
    expect(checkOpening({ asOf: AS_OF, en: "No one was hurt.", ta: null }, week(4, { injured: 0 })).opening).not.toBeNull();
    expect(checkOpening({ asOf: AS_OF, en: "No one was hurt.", ta: null }, week(4, { injured: 5 })).why).toMatch(/0 is not the live injured figure \(5\)/);
    const r = checkOpening({ asOf: AS_OF, en: "This week saw more incidents than the previous one. The one man killed was in Adyar.", ta: null }, week(4, { deaths: 2 }));
    expect(r.opening).toBeNull();
    expect(r.why).toMatch(/1 is not the live deaths figure \(2\)/);
    // the pronoun itself still is none, wherever the sentence goes on
    expect(statedFigures("more incidents than the previous one in Adyar")).toEqual([]);
    expect(statedFigures("more incidents than the last one, with 2 deaths")).toEqual([2]);
  });
  it("'one' as a number still counts ('one more death', 'one of the 12 zones' keeps its 12)", () => {
    expect(statedFigures("There was one more death than yesterday.")).toEqual([1]);
    // (27 Nov review: "no one was hurt" states 0 injured, which the checker holds to the live figure)
    expect(statedFigures("One of the 12 zones saw no case at all; no one was hurt; a one-off closure.")).toEqual([12, 0]);
    expect(statedFigures("One of the 12 zones saw no case at all; no one expected it; a one-off closure.")).toEqual([12]);
    expect(statedFigures("twenty-one incidents")).toEqual([21]);
  });
  it("an incident's own deaths said with its place hold (1 death in Kellys beside the district's 3); a wrong one or no such place does not", () => {
    const en = "Critical incidents include violent crimes resulting in 1 death in Kellys.";
    const live = (incidents: { places: string[]; dead: number }[]) => checkOpening({ asOf: AS_OF, en, ta: null }, { now: AS_OF, hours: 24, facts: { ...facts(2), deaths: 3 }, incidents });
    expect(live([{ places: ["Kellys", "Kilpauk"], dead: 1 }, { places: ["Perambur"], dead: 2 }]).opening).not.toBeNull();
    expect(live([{ places: ["Kellys"], dead: 2 }, { places: ["Perambur"], dead: 1 }]).why).toMatch(/1 is not the live deaths figure \(3\)/);
    expect(live([]).why).toMatch(/1 is not the live deaths figure/);
    // a street's generic word is not the place ("Main Road" in another incident's place)
    const road = checkOpening({ asOf: AS_OF, en: "1 death on the main road.", ta: null }, { now: AS_OF, hours: 24, facts: { ...facts(2), deaths: 3 }, incidents: [{ places: ["Kellys Main Road"], dead: 1 }] });
    expect(road.opening).toBeNull();
  });
  it("the count of items awaiting verification is still held to the console's (106 beside My Tasks' 0 stays off)", () => {
    const r = checkOpening({ asOf: AS_OF, en: "There are 106 items awaiting your verification.", ta: null }, { now: AS_OF, hours: 24, facts: { ...facts(2), awaiting: 0 } });
    expect(r.why).toMatch(/106 is not the live awaiting figure \(0\)/);
  });
  it("firstTimeWhy: a reason is logged once, then again after six hours", async () => {
    const { firstTimeWhy, LOG_AGAIN_MS } = await import("./opening");
    const t = 1_000_000;
    expect(firstTimeWhy("test", "counts the 24 hours", t)).toBe(true);
    expect(firstTimeWhy("test", "counts the 24 hours", t + 60_000)).toBe(false);
    expect(firstTimeWhy("test", "another reason", t + 60_000)).toBe(true);
    expect(firstTimeWhy("test", "counts the 24 hours", t + LOG_AGAIN_MS + 1)).toBe(true);
  });
});
