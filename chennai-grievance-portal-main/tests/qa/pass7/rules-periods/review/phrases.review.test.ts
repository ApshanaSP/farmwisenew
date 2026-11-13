// Review of the shared period reader (src/lib/period/read.ts readPeriod), pass 7 rules-periods.
// Every "BREAK" test asserts what the owner's spec requires; it FAILS while the break is there. Every "holds" test passed when written.
import { describe, expect, it } from "vitest";
import { readPeriod, type PeriodSpec } from "@/lib/period/read";

const r = (q: string) => readPeriod(q);
const TODAY: PeriodSpec = { kind: "day", back: 0 };
const UNHELD: PeriodSpec = { kind: "unheld" };
const LAST_MONTH: PeriodSpec = { kind: "last", unit: "month" };
const LAST_WEEK: PeriodSpec = { kind: "last", unit: "week" };

describe("BREAK: 'now' wins over today and the console windows", () => {
  it.each([
    ["how many complaints came in today till now", TODAY],
    ["how many complaints came in today until now", TODAY],
    ["innaiku ippo varaikkum evlo complaints vandhuchu", TODAY],
    ["how many complaints this month as of now", { kind: "window", key: "monthly" }],
    ["complaints this week till now", { kind: "window", key: "weekly" }],
    ["indha vaaram ippo varaikkum evlo complaints", { kind: "window", key: "weekly" }]
  ] as [string, PeriodSpec][])("BREAK: %s", (q, want) => expect(r(q)).toEqual(want));
  it("BREAK: Tanglish 'innaiku ippo varaikkum' and Tamil 'இன்று இதுவரை' (today so far) read the same", () =>
    expect(r("innaiku ippo varaikkum evlo complaints vandhuchu")).toEqual(r("இன்று இதுவரை எத்தனை புகார்கள் வந்தன")));
});

describe("BREAK: 'now' as a sequence word in the middle of a sentence is read as the current state", () => {
  it.each(["ok now show me the severe cases in Adyar", "and now the fires in Adyar", "Adyar done, now Teynampet severe cases"])("BREAK: %s", (q) =>
    expect(r(q).kind).not.toBe("now"));
});

describe("BREAK: Tamil 'current month' is the current state, English 'current month' the month window", () => {
  it("BREAK: தற்போதைய மாதத்தில் = current month", () => expect(r("தற்போதைய மாதத்தில் எத்தனை புகார்கள்")).toEqual(r("current month complaints")));
});

describe("BREAK: natural Tamil and Tanglish 'N weeks/months/days ago' are not unheld (answered with the current window)", () => {
  it.each([
    "இரண்டு வாரங்களுக்கு முன்பு கடுமையான புகார்கள்",
    "ஒரு மாதத்திற்கு முன்பு கடுமையான புகார்கள்",
    "ஒரு மாதத்துக்கு முன்பு கடுமையான புகார்கள்",
    "மூன்று நாட்களுக்கு முன்பு புகார்கள்",
    "rendu vaarathukku munnaadi severe cases",
    "oru maasathukku munnaadi severe cases",
    "moonu naalukku munnaadi complaints"
  ])("BREAK: %s", (q) => expect(r(q)).toEqual(UNHELD));
});

describe("BREAK: Tamil 'in the last N days/weeks/months' with the locative ending", () => {
  it.each([
    ["கடந்த 10 நாட்களில் எத்தனை புகார்கள்", "in the last 10 days how many complaints"],
    ["கடந்த 7 நாட்களில் எத்தனை புகார்கள்", "how many complaints in the last 7 days"],
    ["கடந்த 30 நாட்களில் எத்தனை புகார்கள்", "how many complaints in the last 30 days"],
    ["கடந்த 3 வாரங்களில் புகார்கள்", "complaints in the past 3 weeks"],
    ["கடந்த 2 மாதங்களில் புகார்கள்", "complaints in the last 2 months"]
  ])("BREAK: %s reads as %s", (ta, en) => expect(r(ta)).toEqual(r(en)));
});

// Decided (an owner question, in the hand-over note): the Tanglish locative ("pona maasathula", in last month) is read as the Tamil locative is (கடந்த மாதத்தில்,
// pass 4's SK-E tests: the rolling window), so the same question gets the same window in both; the bare "pona maasam" is the calendar month.
describe("Tanglish locatives ('-la', '-thula') name a period, the one the Tamil locative names", () => {
  it.each([
    ["indha maasathula evlo complaints", { kind: "window", key: "monthly" }],
    ["indha vaarathula evlo complaints", { kind: "window", key: "weekly" }],
    ["pona vaarathula evlo complaints", { kind: "window", key: "weekly" }],
    ["pona maasathula evlo complaints", { kind: "window", key: "monthly" }],
    ["kadandha maasathula severe cases", { kind: "window", key: "monthly" }]
  ] as [string, PeriodSpec][])("%s", (q, want) => expect(r(q)).toEqual(want));
  it("as the Tamil locative", () => { expect(r("கடந்த மாதத்தில் புகார்கள்")).toEqual({ kind: "window", key: "monthly" }); expect(r("கடந்த வாரத்தில் புகார்")).toEqual({ kind: "window", key: "weekly" }); });
});

describe("BREAK: 'last month's' in Tamil/Tanglish genitive is not the calendar month", () => {
  it.each(["கடந்த மாதத்தின் புகார்கள்", "போன மாசத்து புகார்கள்", "pona maasathu complaints"])("BREAK: %s reads as 'last month's complaints'", (q) =>
    expect(r(q)).toEqual(r("last month's complaints")));
});

describe("p7-rules-periods-03 (open, it.fails until fixed): BREAK: Tamil month names and Tamil 'since' are not read", () => {
  it.fails("BREAK: செப்டம்பர் மாதம் (September) is September, not the last 30 days", () => expect(r("செப்டம்பர் மாதம் புகார்கள்")).toEqual(r("complaints in September")));
  it.fails("BREAK: செப்டம்பரில் (in September)", () => expect(r("செப்டம்பரில் எத்தனை புகார்கள்")).toEqual(r("complaints in September")));
  it.fails("BREAK: தீபாவளியிலிருந்து (since Deepavali)", () => expect(r("தீபாவளியிலிருந்து எத்தனை புகார்கள்")).toEqual(r("since Diwali how many complaints")));
  it.fails("BREAK: அக்டோபர் 1 முதல் (since 1 October)", () => expect(r("அக்டோபர் 1 முதல் புகார்கள்")).toEqual(r("since 1 October complaints")));
  it.fails("BREAK: Tanglish 'October 1 la irundhu' (since 1 October) is read as all of October", () => expect(r("October 1 la irundhu complaints")).toEqual(r("since 1 October complaints")));
  it.fails("BREAK: அக்டோபர் கடைசி வாரம் (the last week of October) is not the rolling 7 days", () => expect(r("அக்டோபர் கடைசி வாரம் புகார்கள்")).toEqual(r("last week of October complaints")));
  it.fails("BREAK: Tanglish 'October kadaisi vaaram' (the last week of October)", () => expect(r("October kadaisi vaaram complaints")).toEqual(r("last week of October complaints")));
});

describe("BREAK: words that only look like a month", () => {
  it.each(["show the protest march cases in Adyar", "Jan Aushadhi store complaints", "anything that came in may need attention"])("BREAK: %s names no month", (q) =>
    expect(r(q)).toEqual({ kind: "none" }));
});

describe("BREAK: நாளை as the accusative of நாள் (day) is read as 'tomorrow'", () => {
  it("BREAK: 'முந்தைய நாளை விட' (than the previous day) is the daily comparison, as in English", () =>
    expect(r("குப்பை புகார்கள் முந்தைய நாளை விட அதிகமா")).toEqual(r("garbage complaints higher than the previous day")));
  it("BREAK: 'ஒரு நாளைக்கு' (per day) is not unheld (English 'per day' names no period)", () =>
    expect(r("ஒரு நாளைக்கு எத்தனை புகார்கள் வருகின்றன")).toEqual(r("how many complaints per day")));
});

describe("BREAK: Tamil comparisons the English form reads", () => {
  it("BREAK: 'கடந்த மாதத்தை காட்டிலும் அதிகமா' (more than last month)", () =>
    expect(r("குப்பை புகார்கள் கடந்த மாதத்தை காட்டிலும் அதிகமா")).toEqual(r("garbage complaints more than last month")));
  it("BREAK: 'அதிகரித்துள்ளதா குறைந்துள்ளதா' (has it increased or decreased)", () =>
    expect(r("குப்பை புகார்கள் அதிகரித்துள்ளதா குறைந்துள்ளதா")).toEqual(r("have garbage complaints increased or decreased")));
});

describe("BREAK: a comparison read in one word order only", () => {
  it.each([
    ["last month vs this month complaints", "this month vs last month complaints"],
    ["pona maasam vs indha maasam complaints", "indha maasam vs pona maasam complaints"],
    ["last week vs this week", "this week vs last week"]
  ])("BREAK: %s reads as %s", (a, b) => { expect(r(b).kind).toBe("compare"); expect(r(a)).toEqual(r(b)); });
});

describe("BREAK: a change word in another sense turns 'from last month' into a comparison", () => {
  it.each([
    ["Show tree fall complaints from last month", LAST_MONTH],
    ["Break down complaints from last month by zone", LAST_MONTH],
    ["complaints against the police from last month", LAST_MONTH],
    ["Pull up severe cases from last week", LAST_WEEK],
    ["show 5 more cases from last week", LAST_WEEK],
    ["Pull up the fire incidents from yesterday", { kind: "day", back: 1 }]
  ] as [string, PeriodSpec][])("BREAK: %s", (q, want) => expect(r(q)).toEqual(want));
});

describe("BREAK: a word that starts like வாரம்/மாதம் sets the unit of a comparison", () => {
  it("BREAK: 'இந்த மாதம் மின் வாரிய புகார்கள் அதிகமா குறைவா' (this month, electricity BOARD) compares months, as English does", () =>
    expect(r("இந்த மாதம் மின் வாரிய புகார்கள் அதிகமா குறைவா")).toEqual(r("electricity board complaints this month more or less")));
  it("BREAK: 'மாதா கோவில் தெரு' (Matha Kovil Street) is no month", () =>
    expect(r("மாதா கோவில் தெரு புகார்கள் அதிகமா குறைவா")).toEqual(r("Matha Kovil street complaints up or down")));
});

describe("outside the spec's list, the same class (a stretch no window holds), noted", () => {
  it.each(["show garbage complaints in Adyar this year", "complaints in the last 2 years"])("GAP: %s is not unheld (answered with a console window)", (q) => expect(r(q)).toEqual(UNHELD));
  it.each(["complaints pending for a week", "complaints open for 7 days"])("GAP: %s is an age, not the weekly window", (q) => expect(r(q)).toEqual({ kind: "none" }));
});

describe("holds", () => {
  it.each([
    ["show me the fire incidents from yesterday", { kind: "day", back: 1 }],
    ["Let me see the fire incidents from yesterday", { kind: "day", back: 1 }],
    ["yesterdays complaints", { kind: "day", back: 1 }],
    ["நேற்று எத்தனை புகார்கள்", { kind: "day", back: 1 }],
    ["nethu evlo complaints", { kind: "day", back: 1 }],
    ["complaints from last month", LAST_MONTH],
    ["may I see complaints last month", LAST_MONTH],
    ["septic tank complaints last month", LAST_MONTH],
    ["how many complaints last week", LAST_WEEK],
    ["கடந்த வாரம் புகார்கள்", LAST_WEEK],
    ["pona vaaram complaints", LAST_WEEK],
    ["how many complaints in the past week", { kind: "window", key: "weekly" }],
    ["current month complaints", { kind: "window", key: "monthly" }],
    ["this month how many complaints", { kind: "window", key: "monthly" }],
    ["severe complaints this week", { kind: "window", key: "weekly" }],
    ["complaints in the last 30 days", { kind: "window", key: "monthly" }],
    ["what came in this morning", TODAY],
    ["இன்று இதுவரை எத்தனை புகார்கள் வந்தன", TODAY],
    ["show severe cases tomorrow", UNHELD],
    ["show severe cases two weeks ago", UNHELD],
    ["cases next week", UNHELD],
    ["severe cases last year", UNHELD],
    ["கடந்த ஆண்டு புகார்கள்", UNHELD],
    ["pona varusham complaints", UNHELD],
    ["How many severe incidents are open right now?", { kind: "now" }],
    ["இப்போது திறந்த புகார்கள்", { kind: "now" }],
    ["ippo evlo severe cases open-la irukku", { kind: "now" }],
    ["now show me Adyar", { kind: "none" }],
    ["do you know the severe cases", { kind: "none" }],
    ["nowhere to go complaints", { kind: "none" }],
    ["the latest complaints", { kind: "none" }],
    ["the last complaint in Adyar", { kind: "none" }],
    ["last mile connectivity complaints", { kind: "none" }],
    ["Garbage complaints, up or down from last month?", { kind: "compare", key: "monthly" }],
    ["garbage complaints compared with last week", { kind: "compare", key: "weekly" }],
    ["more fires today than yesterday?", { kind: "compare", key: "daily" }],
    ["garbage complaints higher than the previous day", { kind: "compare", key: "daily" }],
    ["kuppai complaints pona maasatha vida kooduchaa korainjaa", { kind: "compare", key: "monthly" }],
    ["குப்பை புகார்கள் கடந்த மாதத்தைவிட அதிகமா", { kind: "compare", key: "monthly" }],
    ["மாதவரத்தில் தீ புகார்கள்", { kind: "none" }],
    ["குடிநீர் வாரியம் புகார்கள்", { kind: "none" }],
    ["last week of October complaints", { kind: "lastWeekOf", month: 9, year: null }],
    ["complaints for march 2026", { kind: "month", month: 2, year: 2026 }]
  ] as [string, PeriodSpec][])("holds: %s", (q, want) => expect(r(q)).toEqual(want));
});
