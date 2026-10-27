import { describe, expect, it } from "vitest";
import { capLevel, chennaiUnder, lane, parseCap, parseSachetRss, readHeadline, type FeedState, type NewsAlert } from "./alerts";

// Cyclone Arnab, 25-26 Oct 2026: what the store held at 23:32 on 26 Oct (LT-01). Eleven outlets carried warnings;
// IMD's Chennai district level was "No Warning" today and yellow (thunderstorms) tomorrow; the CFM-DSS gauges had not
// reported since 20 Oct (LT-02).
const NOW = "2026-10-26 23:30:00";
const ARNAB: NewsAlert[] = [
  ["BBC", "2026-10-26 18:00:39", "'Arnab' develops into a severe cyclone - Will heavy rain lash Tamil Nadu including Chennai?"],
  ["sathiyam.tv", "2026-10-26 11:07:36", "Will Chennai be affected by Cyclone Arnab? How will the rain be in Tamil Nadu? Important info here..."],
  ["Thanthi TV", "2026-10-26 10:38:44", "Chennai Rains| Arnab Cyclone| Immediate change in Chennai as soon as it turns into a cyclone"],
  ["Dinamani", "2026-10-26 10:12:00", "Where and when will Cyclone Arnab cross the coast? Will it hit Chennai?"],
  ["NewsBytes Tamil", "2026-10-26 10:02:50", "'Arnab' cyclone formed in the Bay of Bengal: How are the rain chances for Chennai?"],
  ["ABP Nadu", "2026-10-26 08:45:24", "Tamilnadu Rain: Will Chennai be affected by Cyclone Arnab? How will the rain be in Tamil Nadu?"],
  ["Asianet Newsable", "2026-10-26 08:07:11", "Chennai Weather LATEST Update: Cyclone Arnab to Form Today; Red, Orange Alerts Issued"],
  ["Oneindia Tamil", "2026-10-26 07:17:40", "Cyclone Arnab forming in the Bay of Bengal: Orange alert for 3 districts.. Is there any impact on Chennai?"],
  ["Dinamalar", "2026-10-25 19:38:00", "Delay in movement of depression; Weather department update on 'Arnab' cyclone!"],
  ["Top Tamil News", "2026-10-25 09:28:12", "#BREAKING Cyclone warning for Chennai!"],
  ["Maalaimalar", "2026-10-25 11:03:37", "Arnab Cyclone warning: No direct impact on Chennai - Meteorological Department information!"]
].map(([publisher, t, title], k) => ({ id: `doc-${k}`, publisher, t, title, titleEn: title }));
const IMD_NONE = [
  { day: "2026-10-26", level: 0, text: "No Warning" },
  { day: "2026-10-27", level: 1, text: "Thunderstorms & Lightning, Squall etc" }
];
const FRESH: FeedState[] = [
  { source: "cfm", label: "CFM-DSS flood gauges", metric: "gauge_level_m", newest: "2026-10-26 22:00:00", maxHours: 6 },
  { source: "imd", label: "IMD rain gauges", metric: "rainfall_24h_mm", newest: "2026-10-26 08:30:00", maxHours: 30 }
];
const CFM_STALE: FeedState[] = [{ ...FRESH[0], newest: "2026-10-20 06:30:00" }, FRESH[1]];
const FALLBACK = { rain24hMm: 12.4, rainAt: "2026-10-26 08:30:00", lakes: [{ name: "Puzhal", pct: 71 }, { name: "Chembarambakkam", pct: 64 }], lakesAt: "2026-10-26 06:00:00" };

describe("reading a warning headline", () => {
  it("finds the storm's name, the colour and the districts the alert is for", () => {
    const r = readHeadline("Cyclone Arnab forming in the Bay of Bengal: Orange alert for 3 districts.. Is there any impact on Chennai?");
    expect(r).toMatchObject({ hazard: "cyclone", name: "Arnab", level: 2, districtCount: 3, chennaiNamed: true });
    expect(chennaiUnder(r)).toBe(false); // Chennai is only asked about
  });
  it("a warning FOR Chennai puts Chennai under it", () => {
    expect(chennaiUnder(readHeadline("#BREAKING Cyclone warning for Chennai!"))).toBe(true);
    expect(chennaiUnder(readHeadline("'Yellow' alert for Chennai today"))).toBe(true);
    expect(readHeadline("'Yellow' alert for Chennai today").level).toBe(1);
  });
  it("a question about Chennai does not", () => {
    expect(chennaiUnder(readHeadline("Will Chennai be affected by Cyclone Arnab? How will the rain be in Tamil Nadu?"))).toBe(false);
    expect(chennaiUnder(readHeadline("Cyclone Arnab forming tomorrow; Red alert for Madurai, Dindigul, Theni"))).toBe(false);
    expect(readHeadline("Cyclone Arnab forming tomorrow; Red alert for Madurai, Dindigul, Theni").districts).toEqual(["Madurai", "Dindigul", "Theni"]);
  });
});

describe("the alerts lane: Cyclone Arnab (LT-01)", () => {
  const l = lane({ now: NOW, imd: IMD_NONE, sachet: [], news: ARNAB, feeds: FRESH, fallback: FALLBACK });
  it("shows a banner naming the event and that no official source has a warning for Chennai", () => {
    expect(l.banner).not.toBeNull();
    expect(l.banner!.tone).toBe("watch");
    expect(l.banner!.title).toContain("Cyclone Arnab");
    expect(l.agreement).toBe("news_only");
    expect(l.newsOutlets).toBe(11);
    expect(l.agreementText).toMatch(/11 news outlets/);
    expect(l.agreementText).toMatch(/neither IMD nor NDMA has a warning for Chennai/);
  });
  it("lists what each source says", () => {
    expect(l.sources.map((s) => s.key)).toEqual(["imd", "sachet", "news"]);
    expect(l.sources[0].says).toMatch(/today: no warning/);
    expect(l.sources[0].says).toMatch(/yellow \(Thunderstorms/);
    expect(l.sources[2].says).toMatch(/Cyclone Arnab in 11 outlets/);
  });
  it("gives the Briefing a watchful status with the reason, not 'no IMD warning'", () => {
    expect(l.status.level).toBe("watchful");
    expect(l.status.reasons.join(" ")).toMatch(/Cyclone Arnab in 11 news outlets.*no official warning for Chennai/);
  });
  it("an official orange warning for Chennai makes it an alert, and the sources then agree", () => {
    const o = lane({ now: NOW, imd: [{ day: "2026-10-26", level: 2, text: "Heavy Rain" }], sachet: [], news: ARNAB, feeds: FRESH, fallback: FALLBACK });
    expect(o.status.level).toBe("alert");
    expect(o.banner!.tone).toBe("orange");
    expect(o.agreement).toBe("agree");
  });
  it("a SACHET alert naming Chennai counts as official", () => {
    const s = lane({ now: NOW, imd: IMD_NONE, news: [], feeds: FRESH, fallback: FALLBACK, sachet: [{ id: "1", title: "Heavy rain likely over Chennai, Tiruvallur", author: "IMD Chennai",
      link: "", t: "2026-10-26 21:00:00", chennai: true, severity: "Severe", event: "Heavy Rain", expires: "2026-10-27 06:00:00", area: "Chennai" }] });
    expect(s.officialLevel).toBe(2);
    expect(s.sources[1].says).toMatch(/1 alert naming Chennai: Heavy Rain \(severe\), until 06:00/);
  });
  it("nothing in the news and no warning: no banner, no status", () => {
    const n = lane({ now: NOW, imd: IMD_NONE.slice(0, 1), sachet: [], news: [], feeds: FRESH, fallback: FALLBACK });
    expect(n.banner).toBeNull();
    expect(n.status.level).toBeNull();
  });
});

describe("a stale flood feed during an alert (LT-02)", () => {
  const l = lane({ now: NOW, imd: IMD_NONE, sachet: [], news: ARNAB, feeds: CFM_STALE, fallback: FALLBACK });
  it("turns the banner red and says how old the feed is", () => {
    expect(l.banner!.tone).toBe("red");
    expect(l.banner!.title).toMatch(/CFM-DSS flood gauges not reporting/);
    expect(l.banner!.line).toMatch(/last reported 20 Oct, 161 hours ago/);
    expect(l.stale.map((s) => s.source)).toEqual(["cfm"]);
  });
  it("falls back to IMD rain and lake levels", () => {
    expect(l.fallback).toEqual(FALLBACK);
    expect(l.status.reasons.join(" ")).toMatch(/CFM-DSS flood gauges not reporting/);
  });
  it("with no alert, a quiet feed is not a banner", () => {
    const q = lane({ now: NOW, imd: IMD_NONE.slice(0, 1), sachet: [], news: [], feeds: CFM_STALE, fallback: FALLBACK });
    expect(q.banner).toBeNull();
    expect(q.fallback).toBeNull();
  });
});

describe("the SACHET CAP feed", () => {
  it("reads the RSS items and keeps whether Chennai is named", () => {
    const xml = `<rss><channel><item><title>Light to Moderate Rain with TS likely over Ariyalur, Chengalpattu, Chennai, Coimbatore</title>
      <link>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=1</link><author>controlroom@ndma.gov.in (IMD Chennai)</author>
      <guid isPermaLink="false">1</guid><pubDate>Sun, 25 Oct 2026 19:48:50 GMT</pubDate></item>
      <item><title>Moderate Rain over Tenkasi, Virudhunagar in next 3 hours.</title><link>x</link><author>a</author><guid>2</guid>
      <pubDate>Mon, 26 Oct 2026 17:08:35 GMT</pubDate></item></channel></rss>`;
    const items = parseSachetRss(xml);
    expect(items.map((i) => [i.id, i.chennai, i.t])).toEqual([["1", true, "2026-10-26 01:18:50"], ["2", false, "2026-10-26 22:38:35"]]);
  });
  it("reads a CAP file's severity and expiry", () => {
    const cap = parseCap(`<cap:alert><cap:info><cap:event>Moderate Rain</cap:event><cap:severity>Moderate</cap:severity>
      <cap:expires>2026-10-27T01:00:00+05:30</cap:expires><cap:area><cap:areaDesc>Tenkasi, Virudhunagar districts</cap:areaDesc></cap:area></cap:info></cap:alert>`);
    expect(cap).toEqual({ severity: "Moderate", event: "Moderate Rain", expires: "2026-10-27 01:00:00", area: "Tenkasi, Virudhunagar districts" });
    expect([capLevel("Minor"), capLevel("Moderate"), capLevel("Severe"), capLevel("Extreme")]).toEqual([0, 1, 2, 3]);
  });
});

describe("IMD readings", () => {
  it("one per day: the day's highest level with its own text", async () => {
    const { imdDays } = await import("./alerts");
    expect(imdDays([
      { day: "2026-10-26", level: 0, text: "No Warning" },
      { day: "2026-10-26", level: 1, text: "Light Thunderstorms with maximum surface wind speed less than 40 kmph" },
      { day: "2026-10-26", level: 0, text: "No Warning" },
      { day: "2026-10-27", level: 1, text: "Thunderstorms & Lightning, Squall etc" }
    ])).toEqual([
      { day: "2026-10-26", level: 1, text: "Light Thunderstorms with maximum surface wind speed less than 40 kmph" },
      { day: "2026-10-27", level: 1, text: "Thunderstorms & Lightning" }
    ]);
  });
});

describe("the AI does not decide whether an alert is for Chennai", () => {
  it("an AI reading that puts Chennai in the list is not used for that", () => {
    const doc = { id: "x", publisher: "Asianet Newsable", t: "2026-10-26 08:07:11", title: "Chennai Weather LATEST Update: Cyclone Arnab to Form Today; Red, Orange Alerts Issued", titleEn: null };
    const reads = new Map([["x", { hazard: "cyclone" as const, name: "Arnab", level: 3 as const, districts: ["Chennai"], districtCount: 1, chennaiNamed: true, when: "today" }]]);
    const l = lane({ now: NOW, imd: IMD_NONE, sachet: [], news: [doc], feeds: FRESH, fallback: FALLBACK, reads });
    expect(l.news[0].chennaiUnder).toBe(false);
    expect(l.news[0].level).toBe(3);
  });
});

describe("a question about Chennai after an alert for other districts (seen live, 27 Oct)", () => {
  it.each([
    ["Cyclone forming in the Bay of Bengal: Red alert for 3 districts today - How will the rain be in Chennai?", false],
    ["'Arnab' cyclone formed in the Bay of Bengal: How are the rain chances for Chennai? Meteorological center's important warning for southern district people\nவங்கக்கடலில் உருவானது 'அர்னாப்' புயல்: சென்னைக்கு மழை வாய்ப்பு எப்படி? தென் மாவட்ட மக்களுக்கு வானிலை மையம் முக்கிய எச்சரிக்கை", false],
    ["#BREAKING Cyclone warning for Chennai!\n#BREAKING சென்னைக்கு புயல் எச்சரிக்கை!", true],
    ["#BREAKING சென்னைக்கு புயல் எச்சரிக்கை!", true],
    ["Heavy rain: Orange alert for Chennai, Tiruvallur and Kancheepuram tomorrow", true],
    ["Chennai on orange alert as cyclone nears", true]
  ])("%s", (text, want) => expect(chennaiUnder(readHeadline(text))).toBe(want));
});
