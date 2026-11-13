// Fix-all round 2, reviewerC-02 and reviewerC-03 (reviewer C's probe on redteam-gate-03 / fix 1c8f8b92, reworked with Aadhaar's own rules).
//
// maskAadhaar's second pattern took any 12 digits joined by spaces or dashes as Aadhaar:
//  - reviewerC-02 (over-mask): a TANGEDCO service connection number (region 2 - section 3 - distribution 3 - service 4: "09-213-004-1234"),
//    the reference a TANGEDCO petition is acted on by, and a date with a 24-hour time ("12-11-2026 1030 hrs") became "XXXX XXXX 1234";
//  - reviewerC-03 (under-mask): the "91 98400 12345 is a mobile" exception keyed on the first group alone, so "91-2345-678901" passed whole,
//    and a zero-width, thin or ideographic space between two groups ended the run.
// The mask now asks what an Aadhaar number is: it never starts with 0 or 1, and its last digit is a Verhoeff check digit. The numbers in odd
// groupings below get their check digit from this file's own Verhoeff code, written apart from clean.ts's.
import { describe, expect, it } from "vitest";
import { maskAadhaar, verhoeffValid } from "@/lib/manu/clean";

// Verhoeff (1969), from its definition: the multiplication table of the dihedral group D5, the permutation (1 5 8 9 4 2 7 0)(3 6) applied i
// times to the i-th digit from the right, and the inverse table.
const MUL: number[][] = [];
for (let a = 0; a < 10; a++) {
  MUL.push([]);
  for (let b = 0; b < 10; b++) {
    // D5 as rotations r^k (0..4) and reflections s r^k (5..9)
    const [ra, sa] = [a % 5, a >= 5], [rb, sb] = [b % 5, b >= 5];
    const r = sa ? (ra - rb + 5) % 5 : (ra + rb) % 5;
    MUL[a].push((sa !== sb ? 5 : 0) + r);
  }
}
const PERM = [1, 5, 7, 6, 2, 8, 3, 0, 9, 4];
const perm = (i: number, d: number) => { let x = d; for (let k = 0; k < i % 8; k++) x = PERM[x]; return x; };
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
/** The 11 digits and their Verhoeff check digit. */
const withCheck = (body: string) => {
  let c = 0;
  [...body].reverse().forEach((ch, i) => { c = MUL[c][perm(i + 1, Number(ch))]; });
  return body + INV[c];
};
const passes = (n: string) => { let c = 0; [...n].reverse().forEach((ch, i) => { c = MUL[c][perm(i, Number(ch))]; }); return c === 0; };
const TA = (s: string) => s.replace(/\d/g, (d) => "௦௧௨௩௪௫௬௭௮௯"[Number(d)]);

describe("reviewerC-03: this file's Verhoeff agrees with UIDAI's example and with clean.ts", () => {
  it("499118665246 (UIDAI's published sample) passes; one digit changed fails", () => {
    expect(passes("499118665246")).toBe(true);
    expect(passes("499118665247")).toBe(false);
    expect(verhoeffValid("499118665246")).toBe(true);
  });
  it("clean.ts's check agrees on many numbers", () => {
    for (let i = 0; i < 500; i++) {
      const n = String(20_000_000_000 + i * 15_485_863).padStart(11, "0").slice(0, 11);
      const good = withCheck(n);
      expect(verhoeffValid(good)).toBe(true);
      expect(verhoeffValid(good.slice(0, 11) + ((Number(good[11]) + 1) % 10))).toBe(false);
    }
  });
});

describe("reviewerC-03: Aadhaar numbers that passed whole are masked", () => {
  const A91 = withCheck("91234567890"); // 91 and then 2345...: not a mobile
  const A = withCheck("23456789123");
  const cases: [string, string, string][] = [
    ["2-4-6 starting 91 (the rest starts with 2: not a mobile)", `Aadhaar ${A91.slice(0, 2)}-${A91.slice(2, 6)}-${A91.slice(6)}`, A91],
    ["pairs starting 91", `Aadhaar ${A91.match(/../g)!.join(" ")}`, A91],
    ["Tamil digits, 2-4-6 starting 91", `ஆதார் ${TA(`${A91.slice(0, 2)} ${A91.slice(2, 6)} ${A91.slice(6)}`)}`, A91],
    ["6-6 joined by a zero-width space", `Aadhaar ${A.slice(0, 6)}​${A.slice(6)}`, A],
    ["4-4-4 joined by zero-width spaces", `Aadhaar ${A.slice(0, 4)}​${A.slice(4, 8)}​${A.slice(8)}`, A],
    ["6-6 joined by a thin space", `Aadhaar ${A.slice(0, 6)} ${A.slice(6)}`, A],
    ["5-7 joined by an ideographic space", `Aadhaar ${A.slice(0, 5)}　${A.slice(5)}`, A],
    ["3-3-3-3 joined by a word joiner and spaces", `Aadhaar ${A.slice(0, 3)}⁠${A.slice(3, 6)} ${A.slice(6, 9)} ${A.slice(9)}`, A]
  ];
  it.each(cases)("%s", (_k, text, n) => {
    expect(passes(n)).toBe(true);
    const out = maskAadhaar(text);
    expect(out.replace(/\D/g, "")).not.toContain(n.slice(0, 8));
    expect(out).toContain(`XXXX XXXX ${n.slice(-4)}`);
  });
  it("the literal 91-2345-678901 of the report, written the old way (4-4-4 or unbroken), is masked without the check", () => {
    expect(maskAadhaar("Aadhaar 9123 4567 8901")).toBe("Aadhaar XXXX XXXX 8901");
    expect(maskAadhaar("Aadhaar 912345678901")).toBe("Aadhaar XXXX XXXX 8901");
  });
  it("a real +91 mobile written without the plus is still left alone", () => {
    for (const t of ["Mobile 91 98400 12345", "Mobile 91-98400-12345", "Mobile 91 9840012345", "Mobile ௯௧ ௯௮௪௦௦ ௧௨௩௪௫"]) expect(maskAadhaar(t)).toBe(t);
    // even when its digits happen to pass the check: 91 and a mobile is a phone number
    const m = withCheck("91984001234");
    expect(maskAadhaar(`Mobile 91 ${m.slice(2, 7)} ${m.slice(7)}`)).toBe(`Mobile 91 ${m.slice(2, 7)} ${m.slice(7)}`);
  });
});

describe("reviewerC-02: 12-digit references that are not Aadhaar stay whole", () => {
  it.each([
    "TANGEDCO service connection no. 09-213-004-1234: no supply for three days",
    "EB service number 01 202 003 1045, meter burnt",
    "Inspected on 12-11-2026 1030 hrs, nothing done",
    "TANGEDCO SC No. 092130041234 (written unbroken)"
  ])("%s", (t) => expect(maskAadhaar(t)).toBe(t));
  it("a TANGEDCO number stays whole even when its digits pass the check: it starts with 0", () => {
    const sc = withCheck("09213004123");
    const t = `Service no. ${sc.slice(0, 2)}-${sc.slice(2, 5)}-${sc.slice(5, 8)}-${sc.slice(8)}`;
    expect(maskAadhaar(t)).toBe(t);
  });
  it("a date and time starting 2-9 in an odd grouping stays whole when its digits fail the check (nine in ten do)", () => {
    const t = "Inspected on 22-11-2026 1030 hrs";
    expect(passes("221120261030")).toBe(false);
    expect(maskAadhaar(t)).toBe(t);
  });
  it("an Aadhaar number with a misread digit, written 4-4-4, is still masked (the old way needs no check)", () => {
    expect(passes("234567891234")).toBe(false);
    expect(maskAadhaar("Aadhaar 2345 6789 1234")).toBe("Aadhaar XXXX XXXX 1234");
  });
});
