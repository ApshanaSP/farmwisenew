// Fix-all round 2, reviewerC-06 (reviewer C's probe on hunt2-desk-10 / fix 3db0dc41).
//
// The people count now joins two mobiles of one name only when squash(address) is byte-equal (repeat.ts judgeRepeats). The desk types the
// address afresh for each petition (door, street, area), so one person with a new mobile is almost never "the same address": "No. 1" for
// "1", "Kamarajar Salai" for "Kamaraj Salai", the street in Tamil script, all count as a second person. The candidate-side rule in the same
// function uses streetIn() (street words, number, a 0.7 spelling match) for exactly this; the others-side rule does not, so the headline
// over-counts the people where it used to under-count. Pure: the db is mocked.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];
const dog = (o: Partial<E>): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", dept: "GCC-HLT", ward: 64,
  problem: "Stray dogs biting children near the school gate", mobile: null, name: "R. Kumar", address: null, reporterKind: "petition", ...o });
const now = { mobile: "9000011111", name: "Meenakshi", street: "Gandhi Street", ward: 64, dept: "GCC-HLT", problem: "Stray dogs biting children near school" };

describe("reviewerC-06: one person with a new mobile, the address typed a little differently, is still one person", () => {
  it.each([
    ["the door written 'No. 1'", "1, Kamaraj Salai, Kolathur", "No. 1, Kamaraj Salai, Kolathur"],
    ["the street spelt Kamarajar", "1, Kamaraj Salai, Kolathur", "1, Kamarajar Salai, Kolathur"],
    ["no door and no area on one", "1, Kamaraj Salai, Kolathur", "Kamaraj Salai"],
    ["the door in the street's part", "1, Kamaraj Salai, Kolathur", "No 1 Kamaraj Salai, Kolathur"]
  ])("%s", (_k, a, b) => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222", address: a }), dog({ code: "2026-1B", name: "R Kumar", mobile: "9000033333", address: b })]);
    expect(r.headline).toBe("1 other person has written about this in the same ward.");
  });
});

describe("reviewerC-06: two people of one name on two streets of one area are still two", () => {
  it.each([
    ["two streets, one area", "1, Kamaraj Salai, Kolathur", "1, Nehru Street, Kolathur"],
    ["two doors written 'No.', two streets", "No. 1, Kamaraj Salai, Kolathur", "No. 7, Gandhi Street, Kolathur"],
    ["2nd Street and 3rd Street", "4, 2nd Main Road, Kolathur", "4, 3rd Main Road, Kolathur"],
    ["one with an address, one without", "1, Kamaraj Salai, Kolathur", ""]
  ])("%s", (_k, a, b) => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222", address: a }), dog({ code: "2026-1B", name: "R Kumar", mobile: "9000033333", address: b || null })]);
    expect(r.headline).toBe("2 other people have written about this in the same ward.");
  });
});
