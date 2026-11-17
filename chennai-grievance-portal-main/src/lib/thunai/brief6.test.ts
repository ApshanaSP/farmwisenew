/**
 * v6, Phase 3: the incident briefing (brief6.ts). Relative times as people say them, the deadline, a role never a name, two to four
 * sentences and an offer, every figure the record's own, and v5's retelling back with JARVIS_BRIEF=v5. Records here are invented.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { briefIssue, deadlineWords, roleWords, sinceWords, timeOf, type BriefFacts } from "./brief6";
import { labelIn } from "./speechcheck";

afterEach(() => vi.unstubAllEnvs());
// "now": Tuesday 17 Nov 2026, 11:00 IST
const NOW = Date.UTC(2026, 10, 17, 5, 30);
const at = (iso: string) => timeOf(iso)!;

describe("relative times", () => {
  it("since when: this morning, yesterday evening, last night, a weekday, then a span", () => {
    expect(sinceWords(at("2026-11-17 07:40"), NOW)?.en).toBe("since this morning");
    expect(sinceWords(at("2026-11-17 03:10"), NOW)?.en).toBe("since early this morning");
    expect(sinceWords(at("2026-11-17 10:15"), NOW)?.en).toBe("for the last hour or two");
    expect(sinceWords(at("2026-11-16 18:40"), NOW)?.en).toBe("since yesterday evening");
    expect(sinceWords(at("2026-11-16 22:30"), NOW)?.en).toBe("since last night");
    expect(sinceWords(at("2026-11-13 09:00"), NOW)?.en).toBe("since Friday");
    expect(sinceWords(at("2026-11-02 09:00"), NOW)?.en).toBe("for a couple of weeks");
    expect(sinceWords(at("2026-11-16 18:40"), NOW)?.ta).toBe("நேற்று மாலையிலிருந்து");
    // never a time in the future, never a clock or a date
    expect(sinceWords(at("2026-11-18 09:00"), NOW)).toBeNull();
    for (const t of ["2026-11-17 07:40", "2026-11-16 18:40", "2026-11-13 09:00", "2026-10-01 09:00"]) expect(sinceWords(at(t), NOW)?.en).not.toMatch(/\d/);
  });
  it("the deadline: passed this morning / yesterday / on a weekday, or due this evening / tomorrow", () => {
    expect(deadlineWords(at("2026-11-17 09:00"), NOW)).toMatchObject({ passed: true, en: "passed this morning" });
    expect(deadlineWords(at("2026-11-16 15:00"), NOW)).toMatchObject({ passed: true, en: "passed yesterday" });
    expect(deadlineWords(at("2026-11-14 15:00"), NOW)).toMatchObject({ passed: true, en: "passed on Saturday" });
    expect(deadlineWords(at("2026-11-17 18:00"), NOW)).toMatchObject({ passed: false, en: "is due this evening" });
    expect(deadlineWords(at("2026-11-18 18:00"), NOW)).toMatchObject({ passed: false, en: "is due tomorrow" });
  });
  it("a deadline in the small hours is early this morning, a late one tonight: never 'this night' (the v6 briefing set, 17 Nov)", () => {
    expect(deadlineWords(at("2026-11-17 03:00"), NOW)).toMatchObject({ passed: true, en: "passed early this morning" });
    expect(deadlineWords(at("2026-11-17 22:30"), NOW)).toMatchObject({ passed: false, en: "is due tonight" });
    for (const t of ["2026-11-17 00:30", "2026-11-17 04:59", "2026-11-17 21:30", "2026-11-17 23:59"]) expect(deadlineWords(at(t), NOW)?.en).not.toMatch(/this night/);
  });
  it("a store time with no zone is IST; an ISO time keeps its own", () => {
    expect(timeOf("2026-11-17 11:00")).toBe(NOW);
    expect(timeOf("2026-11-17T05:30:00Z")).toBe(NOW);
    expect(timeOf("yesterday")).toBeNull();
  });
});

describe("a role, never a name", () => {
  it("a short designation is said as a role; anything with a figure, a long text or symbols is not said", () => {
    expect(roleWords("Assistant Engineer")).toBe("the assistant engineer");
    expect(roleWords("AE Ward 173")).toBeNull();
    expect(roleWords("call 9840012345")).toBeNull();
    expect(roleWords("a".repeat(50))).toBeNull();
  });
});

const base: BriefFacts = {
  what: { en: "standing water", ta: "தண்ணீர் தேக்கம்" }, place: "Velachery", placeTa: "வேளச்சேரி", hours: 16, overdue: true, serious: true, complaints: 12,
  who: { en: "the corporation's drains team", ta: "மாநகராட்சியின் மழைநீர் வடிகால் பிரிவு" }, next: null, closed: null,
  since: at("2026-11-16 18:40"), due: at("2026-11-17 09:00"), role: null, officials: 0, news: { outlet: "The Hindu", at: at("2026-11-17 06:30") }, lastAt: at("2026-11-17 06:30"), now: NOW
};

describe("the briefing", () => {
  it("headline, why serious, who has it and what is stuck, what to do, then an offer: two to four sentences and the question", () => {
    const b = briefIssue(base, "Waterlogging, Velachery Main Road", ["Waterlogging, Velachery Main Road"]);
    // the deadline is said once, with when it passed (the v6 briefing set, 17 Nov: "past its deadline" and "the deadline passed" both)
    expect(b.en).toBe("Standing water at Velachery since yesterday evening. It's one of the serious ones: 12 people have complained and The Hindu reported it this morning. The corporation's drains team has it, but no officer is named and the deadline passed this morning. I'd ask the corporation's drains team for an update today. Want the details?");
    expect(b.ta.match(/கெடு/g)?.length).toBe(1);
    expect(labelIn(b.en)).toBeNull();
    const sentences = b.en.replace(/ Want the details\?$/, "").split(/(?<=\.)\s/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
    // every figure is the record's own (12 complaints); no clock, no date, no id
    expect((b.en.match(/\d+/g) ?? [])).toEqual(["12"]);
    expect(b.ta).toMatch(/^வேளச்சேரி பகுதியில் நேற்று மாலையிலிருந்து தண்ணீர் தேக்கம் இருக்கிறது\./);
    expect(b.ta).toMatch(/மேலும் விவரம் வேண்டுமா\?$/);
  });
  it("an officer on it is said by role, and a deadline still ahead is said as due", () => {
    const b = briefIssue({ ...base, role: "the assistant engineer", officials: 1, overdue: false, due: at("2026-11-17 18:00"), news: null, complaints: 1, serious: false }, "x", []);
    expect(b.en).toMatch(/has it, with the assistant engineer on it; it is due this evening\./);
    expect(b.en).not.toMatch(/past its deadline|no officer/);
  });
  it("the police have it (a plural body), and an event is 'reported', not 'since' (the v6 briefing set, 17 Nov)", () => {
    const b = briefIssue({ ...base, what: { en: "a road accident", ta: "சாலை விபத்து" }, place: null, placeTa: null, since: at("2026-11-17 04:10"), complaints: 1,
      who: { en: "the police", ta: "காவல்துறை" } }, "Road accident", []);
    expect(b.en).toMatch(/^A road accident reported early this morning\. /);
    expect(b.en).toMatch(/ The police have it, but no officer is named and the deadline passed this morning\. /);
    expect(b.en).not.toMatch(/police has|since early/);
    // a lasting problem keeps "since": the standing water above
    expect(briefIssue(base, "x", []).en).toMatch(/^Standing water at Velachery since yesterday evening\./);
  });
  it("past its deadline with no deadline time known is still said as a reason", () => {
    const b = briefIssue({ ...base, due: null }, "x", []);
    expect(b.en).toMatch(/12 people have complained, The Hindu reported it this morning and it's past its deadline\./);
  });
  it("a closed case is told as closed (nothing to chase), as before", () => {
    const b = briefIssue({ ...base, closed: "resolved" }, "x", []);
    expect(b.en).toMatch(/^There was standing water at Velachery\. It's marked resolved/);
  });
  it("JARVIS_BRIEF=v5 restores v5's retelling", () => {
    vi.stubEnv("JARVIS_BRIEF", "v5");
    expect(briefIssue(base, "x", []).en).toMatch(/^There's standing water at Velachery\./);
  });
  it("a line that would read the record out falls back to the plain retelling", () => {
    const b = briefIssue({ ...base, place: "Velachery Main Road near the bridge" }, "x", ["Standing water at Velachery Main Road near the bridge since yesterday evening, residents say it is waist deep"]);
    expect(b.en).not.toMatch(/Want the details/);
  });
});
