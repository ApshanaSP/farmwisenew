/**
 * QA pass 6, P5-030 and P5-037: the desk's "came before" check (judgeRepeats, pure) on messy input. Cases from the pass 5 manu-logic hunter
 * (tests/qa/pass5/known-failures/manu-logic-repeat.probe.test.ts) and the second reviewer (reviewer2-p5-019-sewage.test.ts), plus the
 * behaviour that must not change.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];

const earlier = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Sewage overflowing on the street", dept: "CMWSSB",
  mobile: "9000041873", name: "க. பார்வதி", address: "27, ஜவஹர் தெரு, Perambur", ward: 70, reporterKind: "petition", ...o });
const now = { mobile: "9000041873", name: "க. பார்வதி", street: "ஜவஹர் தெரு", ward: 70, dept: "CMWSSB", problem: "Sewage still overflowing and now in the well" };

describe("QA pass 6, P5-037: the same person's online complaint on the same problem, filed under a portal department the desk's does not map to", () => {
  it("an online complaint with no desk department (dept null) is the same problem, not 'other problems'", () => {
    const r = judgeRepeats(now, [earlier({ code: "2026-500ONL", incidentId: "INC-W-2026-500ONL", dept: null, reporterKind: "online", problem: "Sewage overflowing on the street" })]);
    expect(r.headline ?? "").not.toContain("on other problems");
    expect(r.headline ?? "").toContain("second petition on this problem");
    expect(r.matches[0]?.sameProblem).toBe(true);
  });
  it("an online sewage complaint the portal sent to Storm Water Drains matches a Metrowater sewage petition from the same person", () => {
    const r = judgeRepeats({ ...now, problem: "Sewage overflowing on the street" }, [earlier({ code: "2026-403SEW", incidentId: "INC-W-2026-403SEW", dept: "GCC-SWD", reporterKind: "online", name: "Parvathi", address: "27 Jawahar St" })]);
    expect(r.matches[0]).toMatchObject({ samePerson: true, sameProblem: true });
  });
  it("but the desk is not told to add it to another department's case (that stays the owner's decision, P5-021)", () => {
    const r = judgeRepeats({ ...now, problem: "Sewage overflowing on the street" }, [earlier({ code: "2026-403SEW", incidentId: "INC-W-2026-403SEW", dept: "GCC-SWD", reporterKind: "online" })]);
    expect(r.attachTo).toBeNull();
  });
  it("another person's online complaint in another department is still not the same problem", () => {
    const r = judgeRepeats({ ...now, mobile: "9000011111", name: "புதியவர்", problem: "Sewage overflowing on the street" }, [earlier({ dept: "GCC-SWD", reporterKind: "online" })]);
    expect(r.matches).toHaveLength(0);
  });
});

describe("QA pass 6, P5-030: the repeat check's matching and wording", () => {
  it("a stranger with the same name in another ward, with another mobile, is not 'this person' when no street is given (ML-08)", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing near my house" },
      [earlier({ name: "R. Kumar", mobile: "9444400000", address: "5, Anna Salai, Adyar", ward: 176, incidentId: "INC-W-2026-176ADY" })]);
    expect(r.headline ?? "").not.toContain("this person's second petition");
    expect(r.attachTo).not.toBe("INC-W-2026-176ADY");
  });
  it("two different mobiles mean two people, whatever the name (no street given)", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "CMWSSB", problem: "Sewage overflowing near my house" },
      [earlier({ name: "R. Kumar", mobile: "9444400000", ward: 70 })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
  it("'other people' counts people: one neighbour who wrote three times is one person (ML-09)", () => {
    const other = { mobile: "9000099999", name: "வேறு நபர்" };
    const r = judgeRepeats({ ...now, mobile: "9000011111", name: "புதியவர்" }, [
      earlier({ ...other, code: "2026-1A" }), earlier({ ...other, code: "2026-1B", filedAt: "2026-09-20 10:00:00" }), earlier({ ...other, code: "2026-1C", filedAt: "2026-10-01 10:00:00" })]);
    expect(r.headline).toContain("1 other person");
  });
  it("two neighbours are two people", () => {
    const r = judgeRepeats({ ...now, mobile: "9000011111", name: "புதியவர்" }, [
      earlier({ mobile: "9000099999", name: "வேறு நபர்", code: "2026-1A" }), earlier({ mobile: "9000088888", name: "மற்றொருவர்", code: "2026-1B" })]);
    expect(r.headline).toContain("2 other people");
  });
  it("a one-letter street misspelling matches the street part of the address, with or without an area after it (ML-10)", () => {
    const base = { mobile: null, name: "R. Kumar", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing on the street" };
    const noArea = judgeRepeats({ ...base, street: "Jawahar Steet" }, [earlier({ name: "R. Kumar", mobile: null, address: "27, Jawahar Street" })]);
    const withArea = judgeRepeats({ ...base, street: "Jawahar Steet" }, [earlier({ name: "R. Kumar", mobile: null, address: "27, Jawahar Street, Perambur" })]);
    expect({ noArea: noArea.matches[0]?.samePerson ?? false, withArea: withArea.matches[0]?.samePerson ?? false }).toEqual({ noArea: true, withArea: true });
  });
  it("a problem written in Tamil shares a topic with the same Tamil words (ML-11)", () => {
    expect(sameTopic("சாக்கடை நீர் தெருவில் ஓடுகிறது", "சாக்கடை நீர் தெருவில் ஓடுகிறது", true)).toBe(true);
    expect(sameTopic("சாக்கடை தண்ணீர்", "சாக்கடை அடைப்பு", true)).toBe(true);
    expect(sameTopic("saakadai thanni theruvil", "saakadai thanni overflow", true)).toBe(true);
    // NFD Tamil is the same word
    expect(sameTopic("சாக்கடை அடைப்பு".normalize("NFD"), "சாக்கடை தண்ணீர்", true)).toBe(true);
  });
  it("unrelated Tamil lines from different people do not share a topic", () => {
    expect(sameTopic("தெரு விளக்கு எரியவில்லை", "சாக்கடை நீர் ஓடுகிறது", false)).toBe(false);
  });
});

describe("QA pass 6: what must not change", () => {
  it("the same mobile is the same person, and the same problem in the same department is offered to attach", () => {
    const r = judgeRepeats(now, [earlier()]);
    expect(r.matches[0]).toMatchObject({ samePerson: true, sameProblem: true });
    expect(r.attachTo).toBe("INC-W-2026-111AAA");
    expect(r.headline).toContain("second petition on this problem");
  });
  it("the same name and street is the same person even with a new mobile", () => {
    const r = judgeRepeats({ ...now, mobile: "9000011111" }, [earlier()]);
    expect(r.matches[0]?.samePerson).toBe(true);
  });
  it("the same name with no mobile and no ward on either side is still the same person (P5-018)", () => {
    const r = judgeRepeats({ mobile: null, name: "க. பார்வதி", street: null, ward: null, dept: "CMWSSB", problem: "Sewage still overflowing" }, [earlier({ mobile: null, ward: null })]);
    expect(r.matches[0]?.samePerson).toBe(true);
  });
});
