// QA pass 4, fixer G2: the pure parts of RC-43 (an input that cannot be applied is named) and RC-44 (what chat does not do is said). No database, no model.
import { describe, expect, it } from "vitest";
import { unresolvedInput, type UnresolvedWorld } from "@/lib/assistant/unresolved";
import { notDone, shareAsked } from "@/lib/assistant/cannot";
import { directTool } from "@/lib/assistant/direct";
import { sevWord } from "@/lib/assistant/fastpath";
import { filterProblem } from "@/lib/collector/filters";

const W: UnresolvedWorld = { zones: Array.from({ length: 15 }, (_, k) => k + 1), now: "2026-11-06 18:08:00", placeFound: false, wardFound: false, rulesOnly: true,
  known: (w) => ["adyar", "metrowater", "drainage"].includes(w.toLowerCase()) };
const bad = (t: string, o: Partial<UnresolvedWorld> = {}) => unresolvedInput(t, { ...W, ...o });
const TAMIL = /[஀-௿]/;

describe("RC-43 unresolvedInput", () => {
  it.each([
    ["zone 99 complaints", "zone"], ["zone 0", "zone"], ["zone -1 incidents", "zone"], ["zone-99", "zone"], ["zone no. 16", "zone"], ["மண்டலம் 99", "zone"], ["mandalam 40 complaints", "zone"],
    ["ward 0 complaints", "ward"], ["ward 999", "ward"], ["வார்டு 500", "ward"],
    ["complaints in Atlantis", "place"], ["incidents near Narnia Heights", "place"], ["at Gotham today", "place"], ["Mordor la complaints", "place"],
    ["the last 0 days", "period"], ["last 00 weeks", "period"], ["கடந்த 0 நாட்கள்", "period"], ["last 0 naal", "period"],
    ["31 February", "date"], ["Feb 30 incidents", "date"], ["32 March", "date"], ["0 April", "date"], ["31st of June", "date"],
    ["complaints from 2030", "year"], ["in 2019", "year"], ["how many in 2026", "year"], ["2030 la complaints", "year"], ["2031 ஆம் ஆண்டு", "year"]
  ])("%s -> %s", (text, kind) => {
    const r = bad(text as string);
    expect(r?.kind, JSON.stringify(r)).toBe(kind);
  });
  it.each([
    "zone 5 complaints", "zone-5", "zone 15", "ward 106", "complaints in Adyar", "complaints in Chennai", "in Tamil Nadu", "reported in October 2026", "28 February",
    "since 1 October", "last 10 days", "last week", "INC-2026-1234", "2026-11-05", "5 complaints in 2026-11", "in the news", "in Metrowater", "for Drainage", "in English", "in Ward 5",
    "complaints in zone 5 and Adyar", "on Monday", "in March", "at 5 pm", "In August 2026", "cases in GCC"
  ])("a real input is let through: %s", (text) => {
    expect(bad(text, { wardFound: /ward \d/i.test(text) })).toBeNull();
  });
  // QA pass 7 (pass4-open-08): a day still to come is named; 29 February 2028 stays a real day (a leap year), so it is named as to come, never as "not a date"
  it("29 February 2028 is a real day, still to come", () => {
    const r = bad("29 February 2028");
    expect(r?.kind).toBe("date");
    expect(r?.say.en).toMatch(/has not come yet/);
    expect(r?.say.en).not.toMatch(/is not a date/);
  });
  it("a place is checked only when no model reads the question, and only when no place was found", () => {
    expect(bad("complaints in Atlantis", { rulesOnly: false })).toBeNull();
    expect(bad("complaints in Atlantis", { placeFound: true })).toBeNull();
  });
  it("every line is in its language, names what was asked and offers a way on", () => {
    const rs = ["zone 99", "மண்டலம் 99", "ward 999", "complaints in Atlantis", "last 0 days", "31 February", "from 2030", "in 2019"].map((t) => bad(t)!);
    for (const r of rs) {
      expect(r).not.toBeNull();
      expect(r.say.en).not.toMatch(TAMIL);
      expect(r.say.tanglish).not.toMatch(TAMIL);
      expect(r.say.ta).toMatch(TAMIL);
      // no English sentence inside the Tamil line (a quoted name or a number may be)
      expect(r.say.ta.replace(/"[^"]*"/g, "").replace(/\b(Excel|CSV)\b/g, "")).not.toMatch(/\b[A-Za-z]{4,}\s+[A-Za-z]{3,}\b/);
      for (const l of ["en", "ta", "tanglish"] as const) expect(r.say[l].length).toBeGreaterThan(40);
    }
  });
});

describe("RC-44 notDone and shareAsked", () => {
  it.each([
    ["Save this workspace as Daily and reopen last week's version", "workspace"], ["save this view", "workspace"], ["store this layout please", "workspace"], ["இந்தப் பணியிடத்தை சேமி", "workspace"],
    ["Show every source and application record used to create this briefing", "sources"], ["list all the records behind this report", "sources"], ["இந்த அறிக்கைக்கு எல்லா ஆதாரப் பதிவுகளையும் காட்டு", "sources"],
    ["predict how many complaints Adyar will get next week", "forecast"], ["how many complaints will be resolved by Friday", "forecast"], ["forecast incidents for tomorrow", "forecast"], ["அடுத்த வாரம் புகார்கள்", "forecast"],
    ["draft a polite letter to the Commissioner", "letter"], ["write an email to the PWD head about flooding", "letter"], ["ஆணையருக்கு கடிதம் எழுது", "letter"]
  ])("%s -> %s", (text, kind) => expect(notDone(text as string, true)?.kind).toBe(kind));
  it.each([
    "how many complaints were resolved yesterday", "will it rain tomorrow", "what is the weather forecast for next week", "severe incidents in Adyar this week", "the saved views on my console",
    "show me the briefing", "which sources feed the map", "list the sources", "who will attend the meeting", "keep the briefing short"
  ])("not caught: %s", (text) => expect(notDone(text, true)).toBeNull());
  it("a forecast or a letter is said only when no model reads the question; saving and the full source list always", () => {
    expect(notDone("predict how many complaints will come next week", false)).toBeNull();
    expect(notDone("draft a letter to the Commissioner", false)).toBeNull();
    expect(notDone("save this workspace as x", false)?.kind).toBe("workspace");
    expect(notDone("show every source used to create this briefing", false)?.kind).toBe("sources");
  });
  it("each line is words only and in its language", () => {
    for (const t of ["save this workspace as x", "show all the records used for this briefing", "predict complaints next week", "draft a letter to the Commissioner"]) {
      const r = notDone(t, true)!;
      for (const l of ["en", "ta", "tanglish"] as const) expect(r.say[l]).not.toMatch(/\d/);
      expect(r.say.ta).toMatch(TAMIL);
      expect(r.say.en).not.toMatch(TAMIL);
    }
  });
  it.each([
    ["percentage of resolved complaints", "resolved"], ["what percentage of incidents are still open", "open"], ["share of incidents that are severe", "severe"],
    ["what proportion of cases are overdue", "overdue"], ["resolved complaints sathaveedham evlo", "resolved"], ["தீர்க்கப்பட்ட புகார்களின் சதவீதம்", "resolved"]
  ])("%s -> %s", (text, of) => expect(shareAsked(text as string)).toBe(of));
  it.each(["hospital beds above 90 percent", "above 85 % occupancy", "share the open complaints with the team", "percentage", "how many resolved"])("not a share: %s", (text) => expect(shareAsked(text)).toBeNull());
});

describe("RC-44 directTool: a ranking asked as an order", () => {
  it.each([
    ["List the taluks with the highest number of unresolved incidents last month", "taluks"], ["rank the zones with the most complaints", "zones"], ["show me the top 5 departments by open incidents", "departments"],
    ["list the wards with the most garbage complaints", "place_breakdown"], ["give the taluks having the highest severe incidents", "taluks"]
  ])("%s -> %s", (text, name) => expect(directTool(text as string, { ranking: true })?.name).toBe(name));
  it("a plain list of incidents is not a ranking", () => {
    expect(directTool("list the incidents in Adyar with the highest priority", { ranking: true })?.name).not.toBe("zones");
    expect(directTool("show the taluk map", { ranking: true })).toBeNull();
    // a model reads the sentence itself: the existing router test (direct.test.ts) keeps it
    expect(directTool("List the taluks with the highest number of unresolved incidents last month")).toBeNull();
  });
});

describe("RC-43/44 the level is never dropped from a headline", () => {
  it.each([["Severe", "severe "], ["High", "high-severity "], ["Medium", "medium-severity "], ["Low", "low-severity "], [null, ""], [undefined, ""]])("%s", (s, w) => expect(sevWord(s as string | null)).toBe(w));
});

describe("RC-43 console filters", () => {
  const p = (q: string) => new URLSearchParams(q);
  it.each(["zone=99", "zone=0", "zone=-1", "zone=abc", "zone=1.5", "zone=16", "period=yearly", "dept=x", "dept=abc", "cat=a", "taluk=TLK-1", "taluk=XYZ"])("%s is refused with a sentence", (q) => {
    expect(filterProblem(p(q))).toMatch(/not (one of|a)/);
  });
  it.each(["", "zone=", "zone=1", "zone=15", "period=weekly", "dept=GCC-SWM", "cat=ROAD_POTHOLE", "taluk=TLK-ADY", "zone=5&period=monthly&dept=CMWSSB", "q=anything&page=3"])("%s is let through", (q) => {
    expect(filterProblem(p(q))).toBeNull();
  });
  it("the sentence does not echo markup or control characters", () => {
    const s = filterProblem(p("zone=%3Cscript%3Ealert(1)%3C%2Fscript%3E%00"))!;
    expect(s).not.toMatch(/[<>\x00]/);
    expect(s.length).toBeLessThan(120);
  });
});
