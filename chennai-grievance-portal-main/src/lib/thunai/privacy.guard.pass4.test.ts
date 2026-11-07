/** QA pass 4, RC-18 class guard: privacy is judged on normalised text, so every digit script, space, dash and invisible mark is covered by rule, not by a list of known forms. */
import { describe, expect, it } from "vitest";
import { asksForbidden, asksPrivate, redactText } from "./privacy";

const nd = (cp: number) => /\p{Nd}/u.test(String.fromCodePoint(cp));
// every block of ten decimal digits Unicode has (first code point of each)
const BLOCKS: number[] = [];
for (let cp = 0x30; cp < 0x1f000; cp++) if (nd(cp) && !nd(cp - 1)) { let n = 0; while (nd(cp + n)) n++; for (let k = 0; k + 10 <= n; k += 10) BLOCKS.push(cp + k); }
const inScript = (s: string, zero: number) => s.replace(/\d/g, (d) => String.fromCodePoint(zero + Number(d)));
const SPACES_AND_DASHES: string[] = [];
for (let cp = 0x80; cp < 0x3100; cp++) { const c = String.fromCodePoint(cp); if (/[\p{Z}\p{Pd}−]/u.test(c)) SPACES_AND_DASHES.push(c); }
const MARKS = ["​", "‌", "‍", "‎", "‏", "‪", "‬", "⁠", "﻿", "­", "᠎", "⁦", "⁩"];

describe("RC-18: any digit script, any separator and any invisible mark is read as the same number", () => {
  it("finds the digit blocks (guard on the guard)", () => expect(BLOCKS.length).toBeGreaterThan(30));
  it.each(BLOCKS.map((z) => [z.toString(16), z]))("a mobile number in the digit block at U+%s is hidden", (_h, zero) => {
    for (const shape of ["9841234567", "98412 34567", "+91 98412-34567", "98 4123 4567"]) {
      const out = redactText(`call ${inScript(shape, zero as number)} now`);
      expect(/\p{Nd}/u.test(out), out).toBe(false);
    }
  });
  it("every Unicode space and dash between the groups of a number is hidden", () => {
    for (const sep of SPACES_AND_DASHES) expect(redactText(`call 98412${sep}34567 now`), JSON.stringify(sep)).toBe("call [hidden] now");
  });
  it("an invisible mark anywhere in a number, or in a refused sentence, changes nothing", () => {
    for (const m of MARKS) {
      for (let k = 1; k < 10; k++) expect(redactText(`call ${"9841234567".slice(0, k)}${m}${"9841234567".slice(k)} now`), JSON.stringify([m, k])).toBe("call [hidden] now");
      for (const q of ["who complained about the drain in Adyar", "delete all the old complaints"]) for (const k of [1, 4, 9]) {
        const t = q.slice(0, k) + m + q.slice(k);
        expect(asksPrivate(t) || asksForbidden(t), JSON.stringify(t)).toBe(true);
      }
    }
  });
  it("a head-count or a date is not mistaken for a number", () => {
    for (const t of ["zones 6 7 8 9 10 11 12", "06-11-2026 09:30", "1,204,567,890", "2026-11-06"]) expect(redactText(t), t).toBe(t);
  });
});
