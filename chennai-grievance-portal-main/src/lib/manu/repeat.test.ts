import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("./repeat");
type E = Parameters<typeof judgeRepeats>[1][number];

const earlier = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Sewage overflowing on the street", dept: "CMWSSB",
  mobile: "9000041873", name: "க. பார்வதி", address: "27, ஜவஹர் தெரு, Perambur", ward: 70, reporterKind: "petition", ...o });
const now = { mobile: "9000041873", name: "க. பார்வதி", street: "ஜவஹர் தெரு", ward: 70, dept: "CMWSSB", problem: "Sewage still overflowing and now in the well" };

describe("the came-before check", () => {
  it("says it is the person's second petition on the problem, and offers the open case", () => {
    const r = judgeRepeats(now, [earlier()]);
    expect(r.headline).toContain("second petition on this problem");
    expect(r.headline).toContain("12.09.2026");
    expect(r.attachTo).toBe("INC-W-2026-111AAA");
  });
  it("counts: the third", () => {
    expect(judgeRepeats(now, [earlier(), earlier({ code: "2026-222BBB", filedAt: "2026-10-01 10:00:00" })]).headline).toContain("third petition");
  });
  it("says when the last one was closed, and does not offer a closed case", () => {
    const r = judgeRepeats(now, [earlier({ status: "Verified by Collector" })]);
    expect(r.headline).toContain('"Verified by Collector"');
    expect(r.attachTo).toBeNull();
  });
  it("finds other people writing about the same thing in the ward", () => {
    const r = judgeRepeats({ ...now, mobile: "9000099999", name: "வேறு நபர்" }, [earlier()]);
    expect(r.headline).toContain("1 other person has written");
    expect(r.matches[0]).toMatchObject({ samePerson: false, sameProblem: true });
  });
  it("does not join a different problem in the same ward", () => {
    expect(judgeRepeats({ ...now, mobile: "9000099999", name: "வேறு நபர்", problem: "Sewage block" }, [earlier({ problem: "Drinking water contaminated", dept: "CMWSSB" })]).matches).toEqual([]);
  });
  it("notes the same person on another problem, without offering to merge", () => {
    const r = judgeRepeats({ ...now, dept: "GCC-ELE", problem: "Street light broken" }, [earlier()]);
    expect(r.headline).toContain("1 earlier petition on other problems");
    expect(r.attachTo).toBeNull();
  });
  it("finds nobody when nothing matches", () => expect(judgeRepeats({ ...now, mobile: "9000011111", name: "புதியவர்", ward: 12 }, [earlier()])).toMatchObject({ headline: null, matches: [], attachTo: null }));
  it("recognises a person with no mobile by name and street", () => {
    expect(judgeRepeats({ ...now, mobile: null }, [earlier({ mobile: null })]).matches[0]?.samePerson).toBe(true);
  });
  it("needs real shared words for one topic", () => {
    expect(sameTopic("Garbage not collected for 10 days", "Garbage not cleared for over a week")).toBe(true);
    expect(sameTopic("Garbage not collected", "Street light not working")).toBe(false);
    expect(sameTopic("", "anything")).toBe(false);
  });
});
