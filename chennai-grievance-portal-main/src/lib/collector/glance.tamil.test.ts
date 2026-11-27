/**
 * "Today at a glance", the news point in Tamil (27 Nov 2026): a story with a Tamil report is named by its Tamil headline as published, as a
 * piece the site's translator leaves alone (`raw`), not by its English headline sent to the translator and turned back into Tamil.
 */
import { describe, expect, it } from "vitest";
import { composeGlance, plain, raw, type GlanceIn } from "./glance";

const NOW = "2026-11-26 14:00:00";
const TA = "மாதவரத்தில் சோகம் - கார்த்திகை தீப விளக்கால் ஏற்பட்ட தீ விபத்தில் தந்தை, மகள் உயிரிழப்பு";
const input = (news: GlanceIn["news"]): GlanceIn => ({
  scope: { zone: null, taluk: null, dept: null, cat: null, words: "District-wide" }, period: "daily", now: NOW,
  cur: { reported: 10, ongoing: 8, urgent: 2, severe: 1, severe_open: 1, resolved: 2 }, prev: { reported: 9, ongoing: 8, severe: 1, resolved: 3 },
  overdue: 0, deaths: 0, injured: 0, awaiting: 0, unchecked: null, kinds: [], zones: [], depts: [], cases: [], fatal: null,
  news, story: null, differ: null, newsOnly: null, rise: null, warning: null, env: null
});
const newsPoint = (g: ReturnType<typeof composeGlance>) => g.happening.find((p) => p.key === "news")!;

describe("the glance's news point in Tamil", () => {
  it("names a story with a Tamil report by its Tamil headline, kept from the translator; the English point is unchanged", () => {
    const p = newsPoint(composeGlance(input({ title: "Father and daughter die in a lamp fire", ta: TA, outlets: 2, act: true, key: "D1", incident: null })));
    expect(p.ta).toContainEqual(raw(TA));
    expect(plain(p.ta)).toBe(`செய்தியில் (நடவடிக்கை தேவை): ${TA} (2 ஊடகங்கள்).`);
    expect(plain(p.en)).toBe("In the news (needs action): Father and daughter die in a lamp fire (2 outlets).");
    expect(p.en.some((x) => typeof x !== "string" && x.raw)).toBe(false);
  });
  it("an English story keeps its English headline as a name for the translator", () => {
    const p = newsPoint(composeGlance(input({ title: "Toddler dies after diesel catches fire", ta: null, outlets: 1, act: false, key: "D2", incident: null })));
    expect(p.ta).toContainEqual({ nm: "Toddler dies after diesel catches fire" });
    expect(p.ta.some((x) => typeof x !== "string" && x.raw)).toBe(false);
  });
  it("a long Tamil headline is cut at a word", () => {
    const long = `${TA} ${TA}`;
    const p = newsPoint(composeGlance(input({ title: "x", ta: long, outlets: 1, act: false, key: "D3", incident: null })));
    const seg = p.ta.find((x) => typeof x !== "string" && x.raw) as { nm: string };
    expect(seg.nm.length).toBeLessThanOrEqual(97);
    expect(seg.nm.endsWith("…")).toBe(true);
  });
});
