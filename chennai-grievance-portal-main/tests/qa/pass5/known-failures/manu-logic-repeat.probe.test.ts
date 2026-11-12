/**
 * manu-logic probes: repeat.ts judgeRepeats (pure). Each test states the behaviour the desk needs; a failure is the bug.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];

const earlier = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Sewage overflowing on the street", dept: "CMWSSB",
  mobile: "9000041873", name: "க. பார்வதி", address: "27, ஜவஹர் தெரு, Perambur", ward: 70, reporterKind: "petition", ...o });
const now = { mobile: "9000041873", name: "க. பார்வதி", street: "ஜவஹர் தெரு", ward: 70, dept: "CMWSSB", problem: "Sewage still overflowing and now in the well" };

describe("ML-07 the same person's online complaint on the same problem", () => {
  it("is not called a petition 'on other problems'", () => {
    // findRepeats maps an online complaint with dept: null and reporterKind 'online'
    const r = judgeRepeats(now, [earlier({ code: "2026-500ONL", incidentId: "INC-W-2026-500ONL", dept: null, reporterKind: "online", problem: "Sewage overflowing on the street" })]);
    expect(r.headline ?? "").not.toContain("on other problems");
    expect(r.matches[0]?.sameProblem).toBe(true);
  });
});

describe("ML-08 a stranger with the same name is taken for the same person when the street is blank", () => {
  it("a 'R. Kumar' in another ward, another street, another mobile is not 'this person'", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing near my house" } as never,
      [earlier({ name: "R. Kumar", mobile: "9444400000", address: "5, Anna Salai, Adyar", ward: 176, incidentId: "INC-W-2026-176ADY" })]);
    expect(r.headline ?? "").not.toContain("this person's second petition");
    expect(r.attachTo).not.toBe("INC-W-2026-176ADY");
  });
});

describe("ML-09 'other people' counts petitions, not people", () => {
  it("one neighbour who wrote three times is one person", () => {
    const other = { mobile: "9000099999", name: "வேறு நபர்" };
    const r = judgeRepeats({ ...now, mobile: "9000011111", name: "புதியவர்" }, [
      earlier({ ...other, code: "2026-1A" }), earlier({ ...other, code: "2026-1B", filedAt: "2026-09-20 10:00:00" }), earlier({ ...other, code: "2026-1C", filedAt: "2026-10-01 10:00:00" })]);
    expect(r.headline).toContain("1 other person");
  });
});

describe("ML-10 the fuzzy street match compares the street with the end of the address (the area)", () => {
  it("a one-letter street misspelling still matches when the address has an area", () => {
    const base = { mobile: null, name: "R. Kumar", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" };
    const noArea = judgeRepeats({ ...base, street: "Jawahar Steet" } as never, [earlier({ name: "R. Kumar", mobile: null, address: "27, Jawahar Street" })]);
    const withArea = judgeRepeats({ ...base, street: "Jawahar Steet" } as never, [earlier({ name: "R. Kumar", mobile: null, address: "27, Jawahar Street, Perambur" })]);
    expect({ noArea: noArea.matches[0]?.samePerson ?? false, withArea: withArea.matches[0]?.samePerson ?? false }).toEqual({ noArea: true, withArea: true });
  });
});

describe("ML-11 a problem written in Tamil never shares a topic", () => {
  it("the same Tamil line twice is the same topic", () => expect(sameTopic("சாக்கடை நீர் தெருவில் ஓடுகிறது", "சாக்கடை நீர் தெருவில் ஓடுகிறது", true)).toBe(true));
  it("Tanglish works, Tamil script does not", () => {
    expect(sameTopic("saakadai thanni theruvil", "saakadai thanni overflow", true)).toBe(true);
    expect(sameTopic("சாக்கடை தண்ணீர்", "சாக்கடை அடைப்பு", true)).toBe(true);
  });
});
