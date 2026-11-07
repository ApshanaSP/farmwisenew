// RC-13: the number gate sees a figure in every digit script and every number word. A model line has no allowed figure, so
// every line below must be held. Property tests run with seed 4242 like props.pass4.test.ts.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { figuresIn, gateChunk } from "./numbergate";
import { digitValue } from "./digits";
import { spellsNumber } from "./agent";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { figuresOk } from "./stage";

const P = { seed: 4242, numRuns: 200 };
const NONE = new Set<string>();
const held = (line: string) => !gateChunk(line, NONE).ok;

/** every decimal digit of every script Unicode has, as [zero code point] runs: the property is over all of them, not a list of scripts */
const NDS: string[] = [];
for (let cp = 0; cp < 0x1f000; cp++) { const ch = String.fromCodePoint(cp); if (/\p{Nd}/u.test(ch)) NDS.push(ch); }
const scriptsOf = (): string[][] => { const runs: string[][] = []; for (const ch of NDS) { const last = runs[runs.length - 1]; if (last && last.length < 10 && ch.codePointAt(0) === last[last.length - 1].codePointAt(0)! + 1) last.push(ch); else runs.push([ch]); } return runs.filter((r) => r.length === 10); };
const RUNS = scriptsOf();
const inScript = (run: string[], n: number) => String(n).replace(/\d/g, (d) => run[Number(d)]);

describe("RC-13: digits of every script", () => {
  it("the digit table covers many scripts (the property is not over a short list)", () => { expect(RUNS.length).toBeGreaterThan(40); });
  it("digitValue reads every Unicode decimal digit as its value", () => { for (const run of RUNS) run.forEach((ch, v) => expect(digitValue(ch), ch).toBe(v)); });
  it("property-1: a figure in the digits of any script never passes the gate", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: RUNS.length - 1 }), fc.integer({ min: 20, max: 99999 }), (k, n) => {
      const t = inScript(RUNS[k], n);
      expect(held(`there are ${t} open cases`), t).toBe(true);
      expect(figuresIn(`there are ${t} open cases`)[0]?.value, t).toBe(n);
    }), P);
  });
  it("the same figure passes when the data holds it, in any script", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: RUNS.length - 1 }), fc.integer({ min: 20, max: 99999 }), (k, n) => {
      expect(gateChunk(`there are ${inScript(RUNS[k], n)} open cases`, new Set([String(n)])).ok).toBe(true);
    }), P);
  });
  it("superscript, circled and fullwidth-letter forms (NFKC) are figures too", () => {
    for (const s of ["there are ²⁵ open cases", "there are ⑫ open cases", "there are ㉕ open cases", "ｔｗｏ cases are open", "ＴＷＥＮＴＹ cases are open"]) expect(held(s), s).toBe(true);
  });
  it("Arabic and fullwidth separators group digits like the ASCII ones", () => {
    expect(figuresIn("there are ١٢٬٣٤٥ open cases")[0]?.value).toBe(12345);
    expect(figuresIn("there are ３．５ lakh open cases")[0]?.value).toBe(350000);
    expect(figuresIn("there are １２，３４５ open cases")[0]?.value).toBe(12345);
  });
  it("a zero-width mark inside a number word or a figure does not hide it", () => {
    for (const m of ["​", "‌", "‍", "⁠", "﻿", "­"]) {
      expect(held(`tw${m}o cases are open`), "word").toBe(true);
      expect(held(`there are 2${m}5 open cases`), "digits").toBe(true);
    }
  });
  it("the Stage's own figure check (figuresOk) reads every script too", () => {
    for (const run of RUNS) {
      expect(figuresOk(`about ${inScript(run, 47)} cases`, new Set(["5"])), run[0]).toBe(false);
      expect(figuresOk(`about ${inScript(run, 47)} cases`, new Set(["47"])), run[0]).toBe(true);
    }
  });
  it("spellsNumber (the agent's check) sees a digit of any script", () => {
    for (const run of RUNS.filter((r) => r[0] !== "0")) expect(spellsNumber(`about ${inScript(run, 25)} cases`), run[0]).toBe(true);
    expect(spellsNumber("about 25 cases")).toBe(false); // ASCII digits are the figures the data may supply
  });
});

describe("RC-13: every number word", () => {
  const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  it("English, 2 to 99, hyphenated, spaced or run together, in any case, is held", () => {
    const all: string[] = [];
    for (let n = 2; n < 100; n++) {
      if (n < 10) all.push(UNITS[n - 1]);
      else if (n < 20) all.push(TEENS[n - 10]);
      else { const t = TENS[Math.floor(n / 10) - 2], u = n % 10; if (!u) all.push(t); else for (const j of ["-", " ", ""]) all.push(`${t}${j}${UNITS[u - 1]}`); }
    }
    for (const w of all) for (const f of [(s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s[0].toUpperCase() + s.slice(1)]) expect(held(`${f(w)} cases are open in Adyar`), w).toBe(true);
  });
  it("English multiples: hundred, thousand, lakh, crore, dozen, and 'one hundred and five'", () => {
    for (const s of ["a hundred cases", "one hundred and five cases", "two thousand complaints", "three lakh people", "five crore rupees", "a dozen cases", "half the cases", "twice as many", "one thousand cases", "one lakh cases"]) expect(held(s), s).toBe(true);
  });
  it("English words for one before a thing counted, in every frame", () => {
    for (const n of ["case", "complaint", "incident", "zone", "ward", "department", "officer", "report", "alert", "death", "person", "issue"]) {
      for (const f of [`only one ${n} is open`, `there is a single ${n} open`, `just one ${n} today`, `exactly one ${n}`, `the sole ${n} open`, `one ${n} remains`, `a lone ${n} remains`, `one more ${n} came in`, `a solitary ${n}`, `only a ${n} is open`.replace("only a ", "only one ")]) expect(held(f), f).toBe(true);
    }
  });
  const TA_ONE_FRAMES = ["அடையாறில் ஒரு %s மட்டும் உள்ளது", "ஒரே ஒரு %s திறந்துள்ளது", "ஒன்றே ஒன்று %s இருக்கிறது", "%s ஒன்று மட்டுமே உள்ளது", "ஒரேயொரு %s வந்துள்ளது", "ஒரு %s வந்தது"];
  it("Tamil: one before a thing counted, in every frame", () => { for (const n of ["புகார்", "சம்பவம்", "மண்டலம்", "துறை", "கேஸ்", "வார்டு", "எச்சரிக்கை"]) for (const f of TA_ONE_FRAMES) expect(held(f.replace("%s", n)), f).toBe(true); });
  const TG_ONE_FRAMES = ["Adyar la oru %s dhaan irukku", "Adyar la onnu dhaan %s irukku", "oru %s mattum open", "orey oru %s irukku", "%s onnu thaan irukku", "oru %s vandhuchu", "ore oru %s"];
  it("Tanglish: one before a thing counted, in every frame", () => { for (const n of ["complaint", "case", "incident", "zone", "ward", "pugar", "sambavam"]) for (const f of TG_ONE_FRAMES) expect(held(f.replace("%s", n)), f).toBe(true); });
  /** the Tamil numerals, written out in full: the closed set 2 to 30, the tens, 100, 1000 (source: standard Tamil numeral names, Tamil Lexicon) */
  const TA_NUM = ["இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து", "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து", "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது", "இருபது", "இருபத்தொன்று", "இருபத்திரண்டு", "இருபத்து மூன்று", "இருபத்து நான்கு", "இருபத்தைந்து", "இருபத்தாறு", "இருபத்தேழு", "இருபத்தெட்டு", "இருபத்தொன்பது", "முப்பது", "நாற்பது", "ஐம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு", "நூறு", "ஆயிரம்", "இரண்டாயிரம்", "ஐநூறு", "இருநூறு", "ஒரு லட்சம்", "பத்து லட்சம்", "ஒரு கோடி"];
  it("Tamil numerals 2 to 30, the tens, hundreds and thousands are held, with a case ending too", () => {
    for (const w of TA_NUM) for (const end of ["", "க்கு"]) if (!/ம்$/.test(w) || !end) expect(held(`அடையாறில் ${w}${end} சம்பவங்கள் உள்ளன`), w + end).toBe(true);
  });
  /** Tanglish numerals, with the common spellings (a closed set: the Tamil numerals in Latin letters) */
  const TG_NUM = ["rendu", "irandu", "moonu", "munu", "moondru", "naalu", "naangu", "anju", "ainthu", "aaru", "ezhu", "yezhu", "ettu", "onbadhu", "ombadhu", "onbathu", "pathu", "pathinonnu", "pannirendu", "pannendu", "pathimoonu", "pathinaalu", "pathinaangu", "pathinanju", "pathinaaru", "pathinezhu", "pathinettu", "pathonbadhu", "irubadhu", "irupadhu", "muppadhu", "nalpadhu", "naarpadhu", "aimbadhu", "arubadhu", "ezhubadhu", "enbadhu", "thonnooru", "nooru", "irunooru", "aayiram", "laksham", "latcham", "kodi"];
  it("Tanglish numerals are held", () => { for (const w of TG_NUM) expect(held(`Adyar la ${w} complaints irukku`), w).toBe(true); });
  it("a word that is not a number is not held (the gate does not eat ordinary speech)", () => {
    for (const s of ["The contractor has not finished the drain.", "constructor and toString are words", "Adyar river overflowed near the bridge", "one moment please", "the second one is open", "the first case is the worst", "அடையாறு ஆறு கரை", "நான் பார்க்கிறேன்", "தீவிர புகார்", "Adyar la case irukku", "ore maadhiri", "oru nimisham", "double check it", "a single click"]) expect(held(s), s).toBe(false);
  });
});

describe("RC-13 class guard: no code reads digits of one script only", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []; });
  it("no source file has a Tamil-only digit class (use digits.ts: asciiDigits, digitValue, or the Nd property)", () => {
    const hits = files(join(__dirname, "..", "..")).filter((p) => readFileSync(p, "utf8").includes("௦-௯") || readFileSync(p, "utf8").includes("௦-௯")).map((p) => p.slice(-40));
    expect(hits).toEqual([]);
  });
});
