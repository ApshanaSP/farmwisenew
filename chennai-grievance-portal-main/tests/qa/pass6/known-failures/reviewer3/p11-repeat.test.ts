/**
 * reviewer3 on P6-011 (af2022e): the Manu Desk repeat check. Pure: the db is mocked. A failing `it` is a way the fix still misjudges.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Sewage overflowing on the street", dept: "GCC-SWM",
  mobile: "9000011111", name: "R. Kumar", address: "12, Gandhi Street, Perambur", ward: 70, reporterKind: "petition", ...o });
const me = (problem: string) => ({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "GCC-SWM", problem });

describe("reviewer3 P6-011: one person, two different problems, sharing only filler (same department, open case)", () => {
  const pairs: [string, string, string][] = [
    ["Tamil 'not coming' (வரவில்லை)", "குடிநீர் வரவில்லை", "மின்சாரம் வரவில்லை"],
    ["Tamil number word 'two' (இரண்டு)", "இரண்டு நாட்களாக குப்பை அள்ளவில்லை", "இரண்டு நாட்களாக தெருவிளக்கு எரியவில்லை"],
    ["Tamil 'our' in its formal form (எங்களுடைய)", "எங்களுடைய தெருவில் குப்பை குவிந்துள்ளது", "எங்களுடைய தெருவில் கழிவுநீர் தேங்கியுள்ளது"],
    ["Tamil 'in our ward' (வார்டில்)", "எங்கள் வார்டில் குப்பை அள்ளப்படவில்லை", "எங்கள் வார்டில் சாலையில் பள்ளம்"],
    ["Tanglish 'two days, not coming' (rendu naala ... varala)", "rendu naala thanni varala", "rendu naala current varala"],
    ["Tanglish 'garbage' vs 'light', 'please' (please pannunga)", "please kuppai edunga", "please light podunga"],
    ["English 'not working'", "Street light not working", "Water pump not working"],
    ["English 'please take action immediately'", "Please take action immediately, garbage not cleared", "Please take action immediately, pothole on the road"]
  ];
  for (const [what, a, b] of pairs) {
    it(`${what}: '${a}' vs '${b}' is not "this person's second petition on this problem"`, () => {
      const r = judgeRepeats(me(a), [e({ problem: b })]);
      expect(sameTopic(a, b, true), "sameTopic(samePerson)").toBe(false);
      expect(r.headline ?? "").not.toMatch(/on this problem/);
      expect(r.attachTo).toBeNull();
    });
  }
});

describe("reviewer3 P6-011: two different people in one ward, one shared filler word", () => {
  it("'குடிநீர் வரவில்லை' (no drinking water) vs 'கழிவுநீர் லாரி வரவில்லை' (sewage lorry not coming) is not the same problem", () => {
    const r = judgeRepeats({ mobile: "9000022222", name: "S. Devi", street: null, ward: 70, dept: "CMWSSB", problem: "குடிநீர் வரவில்லை" },
      [e({ mobile: "9000033333", name: "A. Rani", dept: "CMWSSB", problem: "கழிவுநீர் லாரி வரவில்லை" })]);
    expect(r.headline ?? "").not.toMatch(/written about this/);
  });
});

describe("reviewer3 P6-011: numbered streets", () => {
  it("'First Cross Street' (number as a word) is not 'Fifth Cross Street'", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "First Cross Street", ward: 70, dept: "GCC-SWM", problem: "Garbage" },
      [e({ mobile: null, address: "9, Fifth Cross Street, Anna Nagar" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
  it("a typo in the street ('Gandhi Stret') still finds the person when the door number shares the address part ('12 Gandhi Street, Perambur')", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "Gandhi Stret", ward: 70, dept: "GCC-SWM", problem: "Garbage not cleared" },
      [e({ mobile: null, address: "12 Gandhi Street, Perambur", problem: "Garbage not cleared for a week" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(true);
  });
});
