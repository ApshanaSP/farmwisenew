/** QA pass 4: property-based tests (fast-check, fixed seed) for redaction and the number gate. Bugs: it.fails with the finding id. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { redactText } from "./privacy";
import { figuresIn, gateChunk } from "./numbergate";

const P = { seed: 4242, numRuns: 300 };
const digit = fc.integer({ min: 0, max: 9 }).map(String);
const digits = (n: number) => fc.array(digit, { minLength: n, maxLength: n }).map((a) => a.join(""));
const TA = "௦௧௨௩௪௫௬௭௮௯";
const toTa = (s: string) => s.replace(/\d/g, (d) => TA[Number(d)]);
const SEPS = [" ", "-", ".", " ", "‐", "‑", "‒", "–", "—", "−", " "];
const sep = fc.constantFrom(...SEPS);
const ctxA = fc.constantFrom("call ", "my number is ", "", "contact: ", "எண் ");
const ctxB = fc.constantFrom(" please", "", " thanks.", " அவசரம்");
const mobile = fc.tuple(fc.integer({ min: 6, max: 9 }), digits(9)).map(([a, r]) => `${a}${r}`);
// split a digit string into groups of the given sizes joined by (possibly different) separators
const grouped = (d: string, sizes: readonly number[], seps: string[]) => {
  let i = 0, out = "";
  sizes.forEach((s, k) => { out += (k ? seps[k - 1] : "") + d.slice(i, i + s); i += s; });
  return out;
};
const hidden = (s: string) => /^\D*$/.test(s) && s.includes("[hidden]");

describe("redaction (property)", () => {
  it("a mobile number in any grouping and Unicode separator is hidden", () => {
    fc.assert(fc.property(ctxA, mobile, fc.constantFrom([5, 5], [3, 3, 4], [4, 3, 3], [10]), fc.array(sep, { minLength: 3, maxLength: 3 }), fc.constantFrom("", "+91", "91"), fc.constantFrom("", " ", "-"), ctxB,
      (a, d, sizes, seps, cc, ccsep, b) => {
        const s = `${a}${cc}${cc ? ccsep : ""}${grouped(d, sizes, seps)}${b}`;
        expect(hidden(redactText(s)), JSON.stringify(s) + " -> " + redactText(s)).toBe(true);
      }), P);
  });
  const ASCII_SEPS = fc.constantFrom(" ", "-", ".");
  it("a mobile number in Tamil digits with ordinary separators is hidden", () => {
    fc.assert(fc.property(mobile, fc.constantFrom([5, 5], [3, 3, 4], [10]), fc.array(ASCII_SEPS, { minLength: 3, maxLength: 3 }), (d, sizes, seps) => {
      const s = `எண் ${toTa(grouped(d, sizes, seps))} தாருங்கள்`;
      const o = redactText(s);
      expect(/[0-9௦-௯]/.test(o), JSON.stringify(s) + " -> " + o).toBe(false);
    }), P);
  });
  it("property-2: a mobile number in Tamil digits with a Unicode dash or no-break space is hidden", () => {
    fc.assert(fc.property(mobile, fc.constantFrom([5, 5], [3, 3, 4]), fc.constantFrom(" ", "–", "—", "−", "‐"), (d, sizes, sp) => {
      const o = redactText(`எண் ${toTa(grouped(d, sizes, [sp, sp, sp]))} தாருங்கள்`);
      expect(/[0-9௦-௯]/.test(o), o).toBe(false);
    }), { ...P, numRuns: 50 });
  });
  it("property-2b: an Aadhaar number in Tamil digits with a Unicode dash or no-break space is hidden", () => {
    fc.assert(fc.property(digits(12), fc.constantFrom(" ", "–", "—", "−"), (d, sp) => {
      const o = redactText(`aadhaar ${toTa(grouped(d, [4, 4, 4], [sp, sp]))} end`);
      expect(/[0-9௦-௯]/.test(o), o).toBe(false);
    }), { ...P, numRuns: 50 });
  });
  it("property-3: a mobile number with a 0, 91 or +91 prefix and a 2-4-4 grouping ('0-60.0000 0000') is hidden", () => {
    fc.assert(fc.property(mobile, fc.array(fc.constantFrom(" ", "-", "."), { minLength: 3, maxLength: 3 }), fc.constantFrom("0", "91", "+91"), (d, seps, cc) => {
      const s = `call ${cc}${seps[0]}${grouped(d, [2, 4, 4], seps.slice(1))} please`;
      expect(hidden(redactText(s)), s).toBe(true);
    }), { ...P, numRuns: 60 });
  });
  it("property-7: a zero-width or direction mark inside a mobile number does not stop it being hidden", () => {
    fc.assert(fc.property(mobile, fc.constantFrom("​", "‌", "‍", "⁠", "﻿", "­", "‎", "‏"), fc.integer({ min: 1, max: 9 }), (d, mark, k) => {
      const o = redactText(`number ${d.slice(0, k)}${mark}${d.slice(k)} ok`);
      expect(/[0-9]/.test(o), JSON.stringify(o)).toBe(false);
    }), { ...P, numRuns: 60 });
  });
  it("property-4: a mobile number with every digit spaced ('9 8 4 0 1 2 3 4 5 6') is hidden", () => {
    fc.assert(fc.property(mobile, fc.constantFrom(" ", " "), (d, sp) => {
      const o = redactText(`number ${d.split("").join(sp)} ok`);
      expect(/\d/.test(o), o).toBe(false);
    }), { ...P, numRuns: 60 });
  });
  it("an Aadhaar number (12 digits, 4-4-4 or run together, any separator) is hidden", () => {
    fc.assert(fc.property(digits(12), fc.array(sep, { minLength: 2, maxLength: 2 }), fc.boolean(), fc.boolean(), (d, seps0, spaced, ta) => {
      const seps = ta ? seps0.map((x) => (/[ ‐-− ]/.test(x) ? " " : x)) : seps0;
      const g = spaced ? grouped(d, [4, 4, 4], seps) : d;
      const s = `aadhaar ${ta ? toTa(g) : g} end`;
      const o = redactText(s);
      expect(/[0-9௦-௯]/.test(o), JSON.stringify(s) + " -> " + o).toBe(false);
    }), P);
  });
  const word = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);
  it("an email address is hidden", () => {
    fc.assert(fc.property(word, word, fc.constantFrom("com", "in", "co.in", "org", "gov.in"), fc.constantFrom(".", "_", "+", "-", ""), word, (u, h, tld, js, u2) => {
      const addr = `${u}${js}${u2}@${h}.${tld}`;
      const o = redactText(`write to ${addr} now`);
      expect(o.includes("@"), o).toBe(false);
    }), P);
  });
  it("an email written as 'name at host dot com' or [at]/[dot] is hidden", () => {
    fc.assert(fc.property(word, word, fc.constantFrom([" at ", " dot "], [" [at] ", " [dot] "], ["(at)", "(dot)"]), (u, h, [at, dot]) => {
      const o = redactText(`mail ${u}${at}${h}${dot}com today`);
      expect(o, o).not.toContain(`${u}${at}${h}`);
    }), P);
  });
  it("ordinary text (words, small numbers, INC ids, dates) is left unchanged", () => {
    const w = fc.constantFrom("the", "drain", "in", "Adyar", "zone", "has", "cases", "open", "சென்னை", "மழை", "வெள்ளம்", "road", "complaints", "since", "today");
    const small = fc.integer({ min: 0, max: 999 }).map(String);
    const inc = fc.tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 9999 })).map(([y, n]) => `INC-${y}-${String(n).padStart(4, "0")}`);
    const date = fc.tuple(fc.integer({ min: 1, max: 28 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 2020, max: 2030 })).map(([d, m, y]) => `${d}/${m}/${y}`);
    fc.assert(fc.property(fc.array(fc.oneof(w, small, inc, date), { minLength: 1, maxLength: 12 }), (parts) => {
      const s = parts.join(" ");
      expect(redactText(s)).toBe(s);
    }), P);
  });
  it("never throws and is idempotent on any string", () => {
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 300 }), (s) => { const o = redactText(s); expect(redactText(o)).toBe(o); }), { ...P, numRuns: 500 });
  });
});

describe("number gate (property)", () => {
  const allowedOf = (vals: number[]) => { const s = new Set<string>(); vals.forEach((v) => s.add(String(v))); return s; };
  it("a figure in digits that is not in the data never passes", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 9_999_999 }), fc.array(fc.integer({ min: 0, max: 9_999_999 }), { maxLength: 8 }), fc.constantFrom("There are %s open cases", "%s cases are open in Adyar", "அடையாறில் %s சம்பவங்கள்"), fc.constantFrom("plain", "tamil", "comma"), (n, vals, tpl, form) => {
      fc.pre(!vals.includes(n));
      const txt = form === "tamil" ? toTa(String(n)) : form === "comma" ? n.toLocaleString("en-IN") : String(n);
      const r = gateChunk(tpl.replace("%s", txt), allowedOf(vals));
      expect(r.ok, `${txt} vs ${vals}`).toBe(false);
    }), P);
  });
  it("a figure in the data passes in digits and Tamil digits", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 9_999_999 }), (n) => {
      expect(gateChunk(`there are ${n} cases`, allowedOf([n])).ok).toBe(true);
      expect(gateChunk(`${toTa(String(n))} சம்பவங்கள்`, allowedOf([n])).ok).toBe(true);
    }), P);
  });
  const EN = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty", "ninety", "hundred", "thousand", "lakh", "crore", "dozen", "half"];
  it("a figure in English words that is not in the data never passes", () => {
    fc.assert(fc.property(fc.constantFrom(...EN), fc.constantFrom("%s cases are open", "about %s complaints today", "nearly %s zones"), fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 6 }), (w, tpl, vals) => {
      const v = figuresIn(w)[0]?.value;
      fc.pre(v != null && !vals.includes(v));
      expect(gateChunk(tpl.replace("%s", w), allowedOf(vals)).ok, w).toBe(false);
    }), P);
  });
  it("English words in capitals or mixed case never pass either", () => {
    fc.assert(fc.property(fc.constantFrom(...EN), fc.constantFrom("up", "cap", "mix"), (w, m) => {
      const t = m === "up" ? w.toUpperCase() : m === "cap" ? w[0].toUpperCase() + w.slice(1) : w.split("").map((c, i) => (i % 2 ? c : c.toUpperCase())).join("");
      expect(gateChunk(`${t} cases open`, new Set()).ok, t).toBe(false);
    }), P);
  });
  const TAW = ["இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு", "இருபது", "இருபத்தைந்து", "முப்பது", "ஐம்பது", "நூறு", "ஆயிரம்", "இரண்டாயிரம்", "லட்சம்", "கோடி", "ஐநூறு"];
  it("a figure in Tamil words that is not in the data never passes", () => {
    fc.assert(fc.property(fc.constantFrom(...TAW), fc.constantFrom("%s சம்பவங்கள் திறந்துள்ளன", "அடையாறில் %s புகார்கள்"), (w, tpl) => {
      expect(gateChunk(tpl.replace("%s", w), new Set()).ok, w).toBe(false);
    }), P);
  });
  it("a figure in Tamil words passes only when its value is allowed", () => {
    fc.assert(fc.property(fc.constantFrom(...TAW), (w) => {
      const v = figuresIn(w)[0]?.value;
      fc.pre(v != null);
      expect(gateChunk(`${w} சம்பவங்கள்`, allowedOf([v!])).ok, w).toBe(true);
    }), P);
  });
  // figuresIn matches ASCII digits and Tamil digits only; fullwidth, Arabic-Indic and Devanagari digits are invisible to the gate
  const NATIVE = { fw: (d: string) => String.fromCharCode(0xff10 + Number(d)), ar: (d: string) => String.fromCharCode(0x0660 + Number(d)), dev: (d: string) => String.fromCharCode(0x0966 + Number(d)) };
  it.fails("property-1: a figure written in fullwidth, Arabic-Indic or Devanagari digits never passes the gate", () => {
    fc.assert(fc.property(fc.integer({ min: 20, max: 99999 }), fc.constantFrom("fw", "ar", "dev"), (n, k) => {
      const t = String(n).replace(/\d/g, NATIVE[k as keyof typeof NATIVE]);
      expect(gateChunk(`there are ${t} open cases`, new Set()).ok, t).toBe(false);
    }), { ...P, numRuns: 30 });
  });
});
