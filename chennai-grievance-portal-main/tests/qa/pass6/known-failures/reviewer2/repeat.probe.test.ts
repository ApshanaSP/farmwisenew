// reviewer2, QA pass 6: trying to break ebe5810 (P5-030/P5-037) in judgeRepeats / sameTopic. Each `it` states the behaviour that SHOULD hold;
// a failing test is a finding. Pure: the db is mocked.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Sewage overflowing on the street", dept: "CMWSSB",
  mobile: null, name: "R. Kumar", address: "12, Gandhi Street, Perambur", ward: 70, reporterKind: "petition", ...o });

describe("street typed: the contradiction is not checked", () => {
  it("same name + same common street name, ANOTHER ward and ANOTHER mobile on both sides is not this person", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: "Gandhi Street", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing near my house" },
      [e({ mobile: "9444400000", address: "5, Gandhi Street, Adyar", ward: 176, incidentId: "INC-W-2026-176ADY" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
  it("'3rd Street' is not '2nd Street' (same name, same ward, no mobiles)", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "3rd Street", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing" },
      [e({ address: "27, 2nd Street, Perambur", problem: "Street light not working", dept: "GCC-ELE" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
  it("'4th Cross Street' is not '5th Cross Street'", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "4th Cross Street", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing" },
      [e({ address: "9, 5th Cross Street, Anna Nagar" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
});

describe("Tamil topics: no Tamil stop words", () => {
  it("same person, two different problems in Tamil sharing only 'எங்கள் தெருவில்' (in our street) are not the same problem", () => {
    expect(sameTopic("எங்கள் தெருவில் தெரு விளக்கு எரியவில்லை", "எங்கள் தெருவில் சாக்கடை அடைப்பு", true)).toBe(false);
  });
  it("…and the desk is not told 'second petition on this problem' with an attach", () => {
    const r = judgeRepeats({ mobile: "9000041873", name: "க. பார்வதி", street: null, ward: 70, dept: "CMWSSB", problem: "எங்கள் பகுதியில் குடிநீர் வரவில்லை" },
      [e({ mobile: "9000041873", name: "க. பார்வதி", problem: "எங்கள் பகுதியில் சாக்கடை அடைப்பு", dept: "CMWSSB" })]);
    expect({ headline: r.headline, attach: r.attachTo }).toEqual({ headline: expect.not.stringContaining("on this problem"), attach: null });
  });
  it("a zero-width non-joiner inside a Tamil word is the same word (squash() drops it; words() splits on it)", () => {
    expect(sameTopic("சாக்‌கடை அடைப்பு", "சாக்கடை தண்ணீர்", true)).toBe(true);
  });
});

describe("online complaint of the same person under another department", () => {
  it("'Water stagnation on the road' (Storm Water Drains) is not the same problem as 'Drinking water not supplied' (Metrowater)", () => {
    const r = judgeRepeats({ mobile: "9000041873", name: "Parvathi", street: null, ward: 70, dept: "CMWSSB", problem: "Drinking water not supplied for 5 days" },
      [e({ mobile: "9000041873", name: "Parvathi", reporterKind: "online", dept: "GCC-SWD", problem: "Water stagnation on the road", incidentId: "INC-W-2026-SWD1" })]);
    expect(r.headline ?? "").not.toContain("on this problem");
  });
  it("and a cross-department match is never sameProblem+open with an incidentId (the desk shows 'Add to this case' for exactly those)", () => {
    const r = judgeRepeats({ mobile: "9000041873", name: "Parvathi", street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" },
      [e({ mobile: "9000041873", name: "Parvathi", reporterKind: "online", dept: "GCC-SWD", problem: "Sewage overflowing on the street", incidentId: "INC-W-2026-SWD2" })]);
    const offered = r.matches.filter((m) => m.open && m.incidentId && m.sameProblem).map((m) => m.incidentId);
    expect({ attachTo: r.attachTo, deskButtons: offered }).toEqual({ attachTo: null, deskButtons: [] });
  });
});

describe("people, not petitions", () => {
  it("one neighbour who wrote twice, once with a mobile and once without, is one person", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "புதியவர்", street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" }, [
      e({ code: "2026-1A", mobile: "9000099999", name: "வேறு நபர்" }), e({ code: "2026-1B", mobile: null, name: "வேறு நபர்", filedAt: "2026-09-20 10:00:00" })]);
    expect(r.headline).toContain("1 other person");
  });
});

describe("what holds", () => {
  it("Tamil digits in the mobile are the same mobile", () => {
    const r = judgeRepeats({ mobile: "௯௦௦௦௦௪௧௮௭௩", name: null, street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing" }, [e({ mobile: "+91 90000 41873" })]);
    expect(r.matches[0]?.samePerson).toBe(true);
  });
  it("NFD Tamil name is the same name", () => {
    const r = judgeRepeats({ mobile: null, name: "க. பார்வதி".normalize("NFD"), street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing" }, [e({ name: "க. பார்வதி" })]);
    expect(r.matches[0]?.samePerson).toBe(true);
  });
  it("the petition the headline names ('the last one was filed on …') is in the rows the desk shows (first 4)", () => {
    const other = Array.from({ length: 5 }, (_, k) => e({ code: `2026-O${k}`, mobile: "9000041873", problem: `Street light ${k} broken`, dept: "GCC-ELE", filedAt: `2026-10-0${k + 1} 10:00:00` }));
    const r = judgeRepeats({ mobile: "9000041873", name: null, street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" }, [e({ mobile: "9000041873", code: "2026-SEW", filedAt: "2026-09-01 10:00:00" }), ...other]);
    expect(r.headline).toContain("01.09.2026");
    expect(r.matches.slice(0, 4).map((m) => m.code)).toContain("2026-SEW");
  });
});
