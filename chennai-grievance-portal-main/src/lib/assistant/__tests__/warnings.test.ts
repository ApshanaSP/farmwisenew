import { describe, expect, it } from "vitest";
import { lane, type FeedState, type NewsAlert } from "@/lib/collector/alerts";
import { isWarningQuestion, warningAnswer } from "@/lib/assistant/warnings";

// LT-15: "is there a cyclone warning?" was refused as out of scope. Golden questions in English, Tamil and Tanglish.
describe("warning questions are recognised before the router", () => {
  it.each([
    "Is there a cyclone warning?", "Any weather warning for Chennai today?", "Is there a red alert?", "orange alert for chennai?",
    "Cyclone Arnab update", "Any IMD alerts?", "Is there a flood warning?", "rain alert today",
    "புயல் எச்சரிக்கை உள்ளதா?", "சென்னைக்கு கனமழை எச்சரிக்கை இருக்கா?", "ரெட் அலர்ட் உள்ளதா?",
    "cyclone warning irukka?", "puyal varudha chennai ku?", "mazhai alert irukka", "alert irukka chennai la?"
  ])("%s", (q) => expect(isWarningQuestion(q)).toBe(true));

  it.each([
    "How many flooding complaints in Adyar this week?", "Show waterlogging incidents today", "How many severe incidents today?",
    "Which department has the most complaints?", "tomato price today", "How is the Storm Water Drain department doing?", "stormwater drain complaints"
  ])("not a warning question: %s", (q) => expect(isWarningQuestion(q)).toBe(false));
});

const NOW = "2026-10-26 23:30:00";
const NEWS: NewsAlert[] = [
  ["BBC", "'Arnab' develops into a severe cyclone - Will heavy rain lash Tamil Nadu including Chennai?"],
  ["Oneindia Tamil", "Cyclone Arnab forming in the Bay of Bengal: Orange alert for 3 districts.. Is there any impact on Chennai?"],
  ["Top Tamil News", "#BREAKING Cyclone warning for Chennai!"],
  ["Dinamani", "Where and when will Cyclone Arnab cross the coast? Will it hit Chennai?"]
].map(([publisher, title], k) => ({ id: `d${k}`, publisher, title, titleEn: title, t: "2026-10-26 10:00:00" }));
const FEEDS: FeedState[] = [{ source: "cfm", label: "CFM-DSS flood gauges", metric: "gauge_level_m", newest: "2026-10-20 06:30:00", maxHours: 6 }];

describe("the answer comes from the alerts lane", () => {
  const l = lane({ now: NOW, imd: [{ day: "2026-10-26", level: 0, text: "No Warning" }], sachet: [], news: NEWS, feeds: FEEDS,
    fallback: { rain24hMm: 12.4, rainAt: "2026-10-26 08:30:00", lakes: [{ name: "Puzhal", pct: 71 }], lakesAt: "2026-10-26 06:00:00" } });
  it("English: names the event, says no official warning, lists every source, the stale feed and the playbook", () => {
    const a = warningAnswer(l, "en");
    expect(a.headline).toBe("Cyclone Arnab is in the news; no official warning for Chennai");
    expect(a.markdown).toMatch(/\*\*IMD \(Chennai district\):\*\* today: no warning/);
    expect(a.markdown).toMatch(/\*\*NDMA SACHET:\*\* no alert naming Chennai in force/);
    expect(a.markdown).toMatch(/Cyclone Arnab in 4 outlets/);
    expect(a.markdown).toMatch(/CFM-DSS flood gauges, last reported 20 Oct, 06:30 \(161 hours ago\).*IMD rain 12.4 mm/);
    expect(a.playbook).toContain("Pre-position pumps and crews");
    expect(a.facts.find((f) => f.id === "warn.news_outlets")?.value).toBe(4);
    expect(a.facts.find((f) => f.id === "warn.news_chennai")?.value).toBe(1);
  });
  it("Tamil and Tanglish headlines", () => {
    expect(warningAnswer(l, "ta").headline).toBe("Cyclone Arnab: செய்திகளில் உள்ளது; சென்னைக்கு அதிகாரப்பூர்வ எச்சரிக்கை இல்லை");
    expect(warningAnswer(l, "tanglish").headline).toBe("Cyclone Arnab news-la irukku; Chennai-ku official warning illa");
  });
  it("an official orange warning is said as one", () => {
    const o = lane({ now: NOW, imd: [{ day: "2026-10-26", level: 2, text: "Heavy Rain" }], sachet: [], news: [], feeds: [], fallback: null });
    expect(warningAnswer(o, "en").headline).toBe("Orange warning for Chennai");
  });
});

// R-10 (27 Oct 2026): "What should we prepare?" got only the generic playbook, naming no ward, drain or bund
describe("what to prepare comes from the data (R-10)", () => {
  it("lists the open flood problems to clear first, and where most are", async () => {
    const { prepLines } = await import("@/lib/assistant/warnings");
    const lines = prepLines([
      { title: "Bund cut in Cooum River Bund, water entering VOC St", loc: "Arumbakkam", zone: "Anna Nagar", sev: "Severe", overdue: true },
      { title: "Muthamizh Nagar 1st Road flooded", loc: "Thiruvottiyur", zone: "Thiruvottiyur", sev: "High", overdue: false }
    ], [{ name: "Royapuram", n: 12 }, { name: "Anna Nagar", n: 9 }]).join("\n");
    expect(lines).toContain("1. Bund cut in Cooum River Bund, water entering VOC St (Arumbakkam, Anna Nagar): severe, past its deadline");
    expect(lines).toContain("2. Muthamizh Nagar 1st Road flooded (Thiruvottiyur): high");
    expect(lines).toContain("**Most open flood problems:** Royapuram 12, Anna Nagar 9.");
  });
  it("nothing when nothing is open", async () => {
    const { prepLines } = await import("@/lib/assistant/warnings");
    expect(prepLines([], [])).toEqual([]);
  });
});

// R-09 (27 Oct 2026): "What are newspapers saying about Cyclone Arnab?" got the alerts summary only
describe("what the papers report (R-09)", () => {
  it("a news question gets the headlines with their outlets, newest first, no repeats", async () => {
    const { NEWS_ASKED, newsLines } = await import("@/lib/assistant/warnings");
    expect(NEWS_ASKED.test("What are newspapers saying about Cyclone Arnab?")).toBe(true);
    expect(NEWS_ASKED.test("Is there a cyclone warning for Chennai today?")).toBe(false);
    const l = lane({ now: NOW, imd: [{ day: "2026-10-26", level: 0, text: "No Warning" }], sachet: [], news: NEWS, feeds: FEEDS, fallback: null });
    const lines = newsLines(l);
    expect(lines[1]).toBe("**What the papers report:**");
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[2]).toMatch(/^- .+ \(.+, \d{1,2} Oct, \d\d:\d\d\)$/);
    expect(new Set(lines).size).toBe(lines.length);
  });
});
