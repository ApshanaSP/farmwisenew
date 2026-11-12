// g-repair (SKG1-20..27, SKG1-31, SKG1-32, g-review 3): one reader for "last N units" in three languages. A property test over count x unit x language x ending
// (the skeptic's note: one such test would have found every case at once), and the same sentences through the lanes that read a window.
import { describe, expect, it } from "vitest";
import { englishMonths, heldPeriod, unheldPhrase, windowIn } from "./windowspan";
import { calendarWindowIn, periodIn, unheldWindowIn } from "./thunai/quick";
import { periodNamed } from "./assistant/fastpath";
import { periodFromWords } from "./assistant/pipeline";

type U = "hour" | "day" | "week" | "month";
const HOURS: Record<U, number> = { hour: 1, day: 24, week: 168, month: 720 };
// the way each language says a unit, with the endings a sentence puts on it
const UNITS: Record<U, { en: string[]; ta: string[]; tg: string[] }> = {
  hour: { en: ["hours", "hrs", "hours"], ta: ["மணி நேரம்", "மணி நேரத்தில்", "மணிநேரத்தில்"], tg: ["manineram", "mani neram", "manineram-la"] },
  day: { en: ["days"], ta: ["நாட்கள்", "நாட்களில்", "நாளில்"], tg: ["naal", "naatkal", "naal la"] },
  week: { en: ["weeks"], ta: ["வாரங்கள்", "வாரங்களில்", "வாரம்"], tg: ["vaaram", "vaarangal", "vaarathula"] },
  month: { en: ["months"], ta: ["மாதங்கள்", "மாதங்களில்", "மாதம்"], tg: ["maasam", "maatham", "maasathula"] }
};
const LEADS = { en: ["last", "past", "previous"], ta: ["கடந்த", "சென்ற", "போன"], tg: ["pona", "kadantha", "kadandha"] };
// number words: digits of any script, and the words of each language
const NUMBERS: [number, string[]][] = [
  [2, ["2", "௨", "٢", "two", "இரண்டு", "rendu"]], [3, ["3", "௩", "three", "மூன்று", "moonu"]], [4, ["4", "four", "நான்கு"]], [5, ["5", "five", "ஐந்து"]],
  [7, ["7", "seven", "ஏழு"]], [10, ["10", "ten", "பத்து"]], [14, ["14", "fourteen"]], [24, ["24", "twenty four", "twenty-four"]], [30, ["30", "thirty"]], [45, ["45"]], [90, ["90", "ninety"]]
];

describe("windowIn reads the same window in every language, ending and script", () => {
  it("count x unit x lead x ending", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const [n, forms] of NUMBERS) for (const u of Object.keys(HOURS) as U[]) for (const lang of ["en", "ta", "tg"] as const) for (const form of forms) for (const unit of UNITS[u][lang]) for (const lead of LEADS[lang]) {
      const hours = n * HOURS[u];
      // a word of another language than the lead's is code-switching and is read too ("pona two vaaram"); a Tamil word with a Latin lead is the same
      const text = `${lead} ${form} ${unit}`;
      const r = windowIn(text);
      checked++;
      if (hours > 180 * 24) { if (!(r && r.kind === "bad" && r.why === "large")) bad.push(`${text} -> ${JSON.stringify(r)} (want large)`); continue; }
      if (!(r && r.kind === "span" && r.hours === hours)) bad.push(`${text} -> ${JSON.stringify(r)} (want ${hours} hours)`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(checked).toBeGreaterThan(1500);
  });
  it("short forms: 7d, 30d, 24h, 2w", () => {
    for (const [t, h] of [["last 7d", 168], ["last 30d", 720], ["past 24h", 24], ["last 2w", 336], ["in the last 1 day", 24]] as const) expect(windowIn(t), t).toMatchObject({ kind: "span", hours: h });
  });
  it("a count that cannot be applied is bad, never a window and never the default", () => {
    const want: [string, string][] = [["last 0 days", "zero"], ["last -5 days", "negative"], ["last 3.5 days", "fraction"], ["last 1000 days", "large"], ["last 1 year", "large"], ["pona 0 naal", "zero"],
      ["கடந்த 0 நாட்களில்", "zero"], ["கடந்த 500 நாட்களில்", "large"], ["last pathinaidhu naal", "unread"], ["last few days", "unread"], ["கடந்த பதினைந்து நாட்களில்", "unread"]];
    for (const [t, why] of want) expect(windowIn(t), t).toMatchObject({ kind: "bad", why });
  });
  it("names no count, so no count of time: last week, pona maasam, the last 5 complaints, last night", () => {
    for (const t of ["last week", "pona maasam", "கடந்த வாரம்", "the last 5 complaints", "show the last one", "last night", "pona oru vaaram", "last month resolved cases"]) expect(windowIn(t), t).toBeNull();
  });
  it("a lead word with other words before a unit is not a window: past the deadline this week, the last time this month", () => {
    for (const t of ["cases past the deadline this week", "severe cases past deadline this week", "high priority cases past the deadline this week", "the last complaint this month", "previous status this week"]) expect(windowIn(t), t).toBeNull();
  });
  it("the console's own windows are the periods; any other count is not", () => {
    expect(heldPeriod(24)).toBe("daily"); expect(heldPeriod(168)).toBe("weekly"); expect(heldPeriod(720)).toBe("monthly"); expect(heldPeriod(2160)).toBe("quarterly");
    for (const h of [1, 72, 336, 1440]) expect(heldPeriod(h)).toBeNull();
  });
});

describe("a time with no count that the console does not hold", () => {
  it("since monday, this year, last year, this fortnight, and the Tamil and Tanglish words", () => {
    for (const t of ["since monday", "from last monday", "this year", "last year", "this fortnight", "year to date", "இந்த வருடம்", "கடந்த ஆண்டு", "indha varusham", "pona varusham", "திங்கட்கிழமை முதல்"]) expect(unheldPhrase(t), t).not.toBeNull();
  });
  it("is not set off by an ordinary sentence", () => {
    for (const t of ["how many complaints today", "show the open cases in Adyar", "last week", "pona maasam", "zone five brief", "last 30 days", "monday review of the sun"]) expect(unheldPhrase(t), t).toBeNull();
  });
  it("a time to come is a forecast, not a window (cannot.ts says so)", () => {
    for (const t of ["next year", "next fortnight", "coming days", "அடுத்த வருடம்"]) expect(unheldPhrase(t), t).toBeNull();
  });
});

describe("a Tamil month is the month", () => {
  it("names go to English", () => {
    expect(englishMonths("அக்டோபர் மாதம்")).toMatch(/october/);
    expect(englishMonths("அக்டோபர் 15 அன்று")).toMatch(/october 15/);
    expect(englishMonths("நவம்பரில்")).toMatch(/november/);
  });
});

describe("every lane that reads a window agrees with the reader (RC-06)", () => {
  const sentences: [string, "daily" | "weekly" | "monthly" | "quarterly" | null][] = [
    ["show complaints in the last 7 days", "weekly"], ["pona 3 maasam complaints", "quarterly"], ["கடந்த 3 மாதங்களில் புகார்கள்", "quarterly"], ["pona moonu maasam complaints", "quarterly"],
    ["complaints last 90 days", "quarterly"], ["complaints in the last 24 hours", "daily"], ["கடந்த 30 நாட்களில் புகார்கள்", "monthly"], ["pona 30 naal la complaints", "monthly"],
    ["pona 2 vaaram complaints", null], ["கடந்த 2 வாரங்களில் புகார்கள்", null], ["complaints in the last 3 days", null], ["last 14 days complaints", null]
  ];
  it("the fast lane's period and the Ask readers say the same period", () => {
    for (const [t, p] of sentences) {
      expect(periodIn(` ${t.toLowerCase()} `), `quick: ${t}`).toBe(p);
      expect(periodNamed(t), `ask: ${t}`).toBe(p);
      expect(periodFromWords(t), `pipeline: ${t}`).toBe(p);
    }
  });
  it("a count the console does not hold is handed on (calendarWindowIn, the rules lane asks which window)", () => {
    for (const [t, p] of sentences) {
      const held = p !== null;
      expect(unheldWindowIn(` ${t.toLowerCase()} `, t), t).toBe(!held);
      if (!held) expect(calendarWindowIn(` ${t.toLowerCase()} `), t).toBe(true);
    }
  });
});
