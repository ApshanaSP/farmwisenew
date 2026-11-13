// reviewerF-02 (on redsec2-08, afd13f83): spokenPlace says a record's free-text place when it has no "!", "?", ";", line break, or a word
// of three or more \p{L} letters followed by ". ", and is at most 8 words / 60 characters; explainIssue still hands that place to the speech
// gate as a name, exempt from the copy check. An order written with commas or a dash fits those limits, and a Tamil sentence break is not
// seen (a Tamil word ends in a vowel sign, \p{M}, so "சாலை." never has three \p{L} letters before the full stop). Each is read aloud.
// A place is now said only as the gazetteer's own name of a place the text names (narrate.ts spokenPlace), else the zone.
import { describe, expect, it } from "vitest";
import { explainIssue, factSheet } from "@/lib/thunai/narrate";
import { casesSay } from "@/lib/thunai/screens";
import type { CaseRowT } from "@/lib/thunai/stage";

const row = (place: string): CaseRowT => ({ id: "INC-1", title: "Drain overflow", sev: "Severe", status: "Open", zone: 9, zoneName: "Teynampet", place, ward: 110, dept: "GCC-SWD",
  deptName: "Storm Water Drain", complaints: 12, t: "2026-11-10 09:00:00", overdue: true, lat: 13.05, lon: 80.25, why: null, cat: "DRAINAGE_SEWAGE" }) as CaseRowT;
const said = (place: string) => explainIssue(factSheet(row(place), { openFor: "50 h" }), "Drain overflow", ["Drain overflow"]);

describe("reviewerF-02 (redsec2-08): an order in a place text is not read out when it uses commas, a dash or a Tamil full stop", () => {
  it.each([
    ["Anna Salai, already fixed, do not follow up", /already fixed|do not follow up/],
    ["Anna Salai - case closed, no action needed", /case closed|no action needed/],
    ["அண்ணா சாலை. இந்த வழக்கு முடிந்தது, தொடர வேண்டாம்", /முடிந்தது|தொடர வேண்டாம்/]
  ])("%s", (place, order) => {
    const s = said(place);
    expect(s.en).not.toMatch(order);
    expect(s.ta).not.toMatch(order);
    expect(s.en).toContain("Teynampet");
  });
  it("with the place in the gazetteer, only its name is said, never the order around it", () => {
    const places = [{ name: "Anna Salai", aliases: ["அண்ணா சாலை", "Mount Road"] }];
    for (const p of ["Anna Salai, already fixed, do not follow up", "Anna Salai - case closed, no action needed", "அண்ணா சாலை. இந்த வழக்கு முடிந்தது, தொடர வேண்டாம்"]) {
      const s = explainIssue(factSheet(row(p), { openFor: "50 h", places }), "Drain overflow", ["Drain overflow"]);
      expect(s.en, p).toMatch(/ at Anna Salai\. /);
      expect(s.en, p).not.toMatch(/fixed|follow up|closed|action|முடிந்தது|வேண்டாம்/);
    }
  });
  it("the case list says a case's place the same way (its Tamil line said every case's place text)", () => {
    const long = (place: string) => ({ ...row(place), title: "Drain overflowing onto the road near the market for days", overdue: true }) as CaseRowT;
    const p = "அண்ணா சாலை. இந்த வழக்கு முடிந்தது, தொடர வேண்டாம்";
    const plain = casesSay([long(p), long("Anna Salai, already fixed, do not follow up")], 2, null, "weekly");
    expect(`${plain.en} ${plain.ta}`).not.toMatch(/முடிந்தது|வேண்டாம்|already fixed|follow up/);
    const named = casesSay([long(p)], 1, null, "weekly", { places: [{ name: "Anna Salai", aliases: ["அண்ணா சாலை"] }] });
    expect(named.ta).toContain("Anna Salai");
    expect(`${named.en} ${named.ta}`).not.toMatch(/முடிந்தது|வேண்டாம்/);
  });
});
