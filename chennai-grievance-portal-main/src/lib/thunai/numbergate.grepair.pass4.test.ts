// g-repair (SKG1-08..13): the number gate reads Tamil and Tanglish numbers by family, not by one spelling. Every spelling of a number is a figure; ordinary words are not.
import { describe, expect, it } from "vitest";
import { allowedSet, figuresIn, gateChunk } from "./numbergate";

const refused = (t: string) => !gateChunk(t, allowedSet([])).ok;
const value = (t: string) => figuresIn(t).map((f) => f.value);

describe("Tanglish numbers in every spelling are figures", () => {
  // each ten with the -thu and -dhu spellings, and b for p (irubadhu, irupathu, irupadhu, irubathu)
  const TENS: [number, string][] = [[20, "iru"], [30, "mup"], [40, "naar"], [50, "aim"], [60, "aru"], [70, "ezhu"], [80, "en"]];
  it("tens: the stem with pathu, padhu, bathu, badhu", () => {
    const bad: string[] = [];
    for (const [, stem] of TENS) for (const end of ["pathu", "padhu", "bathu", "badhu"]) { const w = stem + end; if (!refused(`${w} pugar`)) bad.push(w); }
    expect(bad).toEqual([]);
  });
  it("the units, hundreds and thousands in the spellings people use", () => {
    const words = ["randu", "rendu", "irandu", "anchu", "anju", "aindhu", "ainthu", "moonru", "munru", "moonu", "naalu", "ezhu", "ettu", "onbathu", "pathu",
      "nooru", "irunooru", "moonooru", "naanooru", "ainooru", "aayiram", "irandaayiram", "moonaayiram", "naalaayiram", "ainthaayiram", "thombadhu", "thombathu"];
    expect(words.filter((w) => !refused(`${w} pugar`))).toEqual([]);
  });
  it("is not set off by ordinary Tanglish", () => {
    for (const t of ["inga pugar illa", "adhu romba mosam", "naan sollren", "seri paarkalaam", "mandalam kaattu", "thurai pathil sollum"]) expect(refused(t), t).toBe(false);
  });
});

describe("Tamil: people counted in one word, number signs, fractions, joined forms", () => {
  it("people words with their endings", () => {
    for (const t of ["இருவர் உயிரிழந்தனர்", "மூவர் காயம்", "நால்வர் மீட்பு", "ஐவர் பாதிப்பு", "அறுவர் மீட்பு", "எழுவர் காயம்", "இருவரும் வந்தனர்", "மூவரை மீட்டனர்"]) expect(refused(t), t).toBe(true);
  });
  it("6, 7 and 8 with the joining ப் or a glued noun", () => {
    for (const t of ["எட்டுப் புகார்கள்", "ஆறுப் புகார்கள்", "ஏழுப் புகார்கள்", "ஆறுபேர் காயம்", "ஏழுபேர்", "எட்டுபேர் காயம்"]) expect(refused(t), t).toBe(true);
    for (const t of ["ஆறுதல் சொன்னார்", "அடையாறு பகுதி"]) expect(refused(t), t).toBe(false); // consolation, the river
  });
  it("இரு is two only beside a thing counted (it is also the verb 'stay')", () => {
    expect(refused("இரு புகார்கள் தாமதம்")).toBe(true);
    expect(refused("இங்கே இரு")).toBe(false);
    expect(value("ஈராயிரம்")).toEqual([2000]);
  });
  it("the number signs for 10, 100 and 1000", () => {
    expect(value("௰ புகார்கள்")).toEqual([10]);
    expect(value("௱ புகார்கள்")).toEqual([100]);
    expect(value("௲ புகார்கள்")).toEqual([1000]);
  });
  it("a fraction before a unit of time", () => {
    for (const t of ["அரை மணி நேரம்", "ஒன்றரை மணி நேரம்", "கால் மணி நேரம்", "arai manineram", "kaal mani neram"]) expect(refused(t), t).toBe(true);
    expect(refused("கால் வலி")).toBe(false); // a leg
  });
});

describe("English multiples are figures", () => {
  it("threefold, tenfold, trebled, quadrupled, doubled", () => {
    for (const t of ["complaints rose threefold", "a tenfold rise", "cases trebled", "cases quadrupled", "cases doubled", "cases tripled", "a hundredfold increase"]) expect(refused(t), t).toBe(true);
    expect(value("a tenfold rise")).toEqual([10]);
  });
});
