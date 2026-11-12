// RC-42: the Stage's own commands read a position fully (every ordinal form, a list, a range, "last"), never one word inside
// a longer phrase, and never lose the open case. A property over every ordinal word in English, Tamil script and Tanglish.
import { describe, expect, it } from "vitest";
import { localStageCommand, pushScreen, stageEmpty, stageReducer, type LocalCmd } from "./stagelocal";
import { readPositions, tokensOf, LAST } from "./ordinal";
import type { StageDocT } from "./stage";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveFrame } from "./frame";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";

const EN = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const EN_CARD = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const TA = ["முதலாவது", "இரண்டாவது", "மூன்றாவது", "நான்காவது", "ஐந்தாவது", "ஆறாவது", "ஏழாவது", "எட்டாவது", "ஒன்பதாவது", "பத்தாவது"];
const TA_SPOKEN = ["முதல்", "ரெண்டாவது", "மூணாவது", "நாலாவது", "அஞ்சாவது", "ஆறாவது", "ஏழாவது", "எட்டாவது", "ஒன்பதாவது", "பத்தாவது"];
const TG = ["mudhal", "rendavathu", "moonavathu", "naalavathu", "anjavathu", "aaravathu", "ezhavathu", "ettavathu", "onbadhavathu", "pathavathu"];
const TG_CARD = ["onnu", "rendu", "moonu", "naalu", "anju", "aaru", "ezhu", "ettu", "onbadhu", "pathu"];
const FULLWIDTH = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
const ARABIC = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
const DEVANAGARI = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0x0966 + Number(d)));
const TAMILD = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0x0be6 + Number(d)));

const row = (i: number, place: string) => ({ id: `INC-${i}`, title: `Case ${i} at ${place}`, sev: "Severe", status: "Open", zone: i, zoneName: place, place, ward: null, dept: "GCC", deptName: "Roads", complaints: 3, t: null, overdue: false, lat: null, lon: null, why: null, cat: null });
const places = ["Adyar", "Pallikaranai", "Teynampet", "Adyar", "Ambattur", "Velachery", "Perungudi", "Tondiarpet"];
const list = (n = 8): StageDocT => ({ id: "s1", recipe: "severe", title: "Severe", focus: null, slots: {}, scope: {}, say: { en: "", ta: "" }, blocks: [{ kind: "CaseList", id: "c", title: "", source: "list", sev: null, total: n, rows: Array.from({ length: n }, (_, i) => row(i + 1, places[i % places.length])) }] } as unknown as StageDocT);
const run = (doc: StageDocT, cmd: LocalCmd | null) => stageReducer(pushScreen(stageEmpty, doc), cmd as LocalCmd).fx;
const said = (fx: ReturnType<typeof run>) => JSON.stringify(fx.filter((f) => f.fx === "say"));

describe("RC-42: one reader of positions", () => {
  it("every ordinal and number word, in every language, alone, opens that case", () => {
    for (let n = 1; n <= 10; n++) {
      for (const w of [EN[n - 1], EN_CARD[n - 1], TG[n - 1], TG_CARD[n - 1], TA[n - 1], TA_SPOKEN[n - 1]]) {
        for (const phrase of [`open the ${w} one`, `${w} one open pannu`, `${w} திற`, `open ${w}`, `${w} thira`]) {
          expect(localStageCommand(phrase), phrase).toEqual({ op: "open", n });
        }
      }
    }
  });
  it("digits of any script, and 3rd, 3-வது, number 3 forms", () => {
    for (const f of [String, FULLWIDTH, ARABIC, DEVANAGARI, TAMILD]) {
      expect(localStageCommand(`open ${f(3)}`), f(3)).toEqual({ op: "open", n: 3 });
      expect(localStageCommand(`draft ${f(1)} and ${f(3)}`), f(1)).toMatchObject({ op: "draft", ns: [1, 3] });
    }
    for (const p of ["open the 3rd one", "3-வதைத் திற", "open number 3", "open no. 3"]) expect(localStageCommand(p), p).toEqual({ op: "open", n: 3 });
    expect(localStageCommand("open the 22nd one")).toEqual({ op: "open", n: 22 });
  });
  it("compound words past ten: sixteenth, twenty-first, twenty one", () => {
    expect(localStageCommand("open the sixteenth one")).toEqual({ op: "open", n: 16 });
    expect(localStageCommand("open the twenty-first one")).toEqual({ op: "open", n: 21 });
    expect(localStageCommand("open twenty one")).toEqual({ op: "open", n: 21 });
    expect(readPositions(tokensOf("six"))).toEqual([6]);
    expect(readPositions(tokensOf("sixteenth"))).toEqual([16]);
  });
  it("a list and a range read every position, in any language", () => {
    expect(readPositions(tokensOf("the second and third"))).toEqual([2, 3]);
    expect(readPositions(tokensOf("1, 3 and 5"))).toEqual([1, 3, 5]);
    expect(readPositions(tokensOf("2 to 4"))).toEqual([2, 3, 4]);
    expect(readPositions(tokensOf("1-3"))).toEqual([1, 2, 3]);
    expect(readPositions(tokensOf("இரண்டாவது மற்றும் மூன்றாவது"))).toEqual([2, 3]);
    expect(readPositions(tokensOf("rendavathu um moonavathu"))).toEqual([2, 3]);
    expect(localStageCommand("draft 1 and 3")).toMatchObject({ op: "draft", ns: [1, 3] });
    expect(localStageCommand("draft the second and third")).toMatchObject({ op: "draft", ns: [2, 3] });
    expect(localStageCommand("draft the first three")).toEqual({ op: "draft", n: 3, first: true });
    expect(localStageCommand("draft 2 to 4")).toMatchObject({ op: "draft", ns: [2, 3, 4] });
  });
  it("last, in three languages", () => {
    for (const p of ["open the last one", "கடைசியாக உள்ளதை திற", "last one open pannu", "kadaisi thira"]) expect(localStageCommand(p), p).toEqual({ op: "open", n: LAST });
    expect(localStageCommand("draft the last one")).toEqual({ op: "draft", n: LAST, first: false });
  });
  it("a phrase it cannot read fully is not read from one word in it (the sentence goes on to the agent)", () => {
    for (const w of [...EN, ...EN_CARD, ...TA, ...TG, ...TG_CARD]) {
      for (const p of [`open the ${w} one in Adyar`, `open the ${w} dashboard`, `open the ${w} one about water`, `${w} one in Adyar open pannu`]) {
        const c = localStageCommand(p);
        expect(c && c.op === "open" && !c.where ? p : null, p).toBeNull();
      }
    }
    expect(localStageCommand("open the news panel")).toBeNull();
    expect(localStageCommand("open the whole thing")).toBeNull();
    expect(localStageCommand("draft the lot")).toBeNull();
  });
  it("a place beside 'one' names the row by its place, and asks when it is not one row", () => {
    expect(localStageCommand("open the one in Pallikaranai")).toEqual({ op: "open", n: 0, where: "pallikaranai" });
    const fx = run(list(), localStageCommand("open the one in Pallikaranai"));
    expect(fx).toEqual([expect.objectContaining({ fx: "rebuild", recipe: "case", slots: { id: "INC-2" } })]);
    expect(said(run(list(), localStageCommand("open the one in Adyar")))).toMatch(/2 of these cases mention adyar/);
    expect(said(run(list(), localStageCommand("open the one in Nowhere")))).toMatch(/None of these cases mention nowhere/);
  });
  it("a position past the end is said plainly, and last is the last", () => {
    const m = list(8);
    for (const p of ["open the 20th one", "open the sixteenth one", "open 9", "draft 9", "draft 1 and 20"]) expect(said(run(m, localStageCommand(p))), p).toMatch(/only 8 items/);
    expect(run(m, localStageCommand("open the 20th one")).some((f) => f.fx === "rebuild")).toBe(false);
    expect(run(m, localStageCommand("open the last one"))).toEqual([expect.objectContaining({ recipe: "case", slots: { id: "INC-8" } })]);
    expect(run(m, localStageCommand("draft the last one"))).toEqual([{ fx: "draft", ids: ["INC-8"] }]);
    expect(said(run(list(0), localStageCommand("open 1")))).toMatch(/nothing here/);
  });
  it("a list of positions drafts every one of them, once", () => {
    expect(run(list(), localStageCommand("draft 1 and 3"))).toEqual([{ fx: "draft", ids: ["INC-1", "INC-3"] }]);
    expect(run(list(), localStageCommand("draft the second and third"))).toEqual([{ fx: "draft", ids: ["INC-2", "INC-3"] }]);
    expect(run(list(), localStageCommand("draft 2, 2 and 2"))).toEqual([{ fx: "draft", ids: ["INC-2"] }]);
    expect(said(run(list(), localStageCommand("open 1 and 3")))).toMatch(/one case at a time/);
  });
  it("draft it drafts the open case, and asks which on a list", () => {
    const one = { ...list(1), recipe: "case", blocks: [{ kind: "CaseDetail", id: "d", incident: { id: "INC-7" } }] } as unknown as StageDocT;
    expect(run(one, localStageCommand("draft it"))).toEqual([{ fx: "draft", ids: ["INC-7"] }]);
    expect(said(run(list(), localStageCommand("draft it")))).toMatch(/Which case/);
  });
  it("the reader has no hole for the words of Object.prototype", () => {
    for (const w of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) { expect(readPositions([w])).toBeNull(); expect(localStageCommand(`open ${w}`)).toBeNull(); }
  });
  it("frame.ts reads a position from the whole sentence too: a place beside the number is not 'open the Nth'", () => {
    const stage = { recipe: "severe", title: "Severe", blocks: [{ kind: "CaseList", ids: ["a", "b", "c"] }] };
    const f = (text: string) => resolveFrame({ text, stage: stage as never, turns: [], lastPlace: null, lastText: "", world: { ...WORLD, ...referenceWorld() } as never }).kind;
    expect(f("the second one")).toBe("stageOp");
    expect(f("இரண்டாவது கேஸ்")).toBe("stageOp");
    expect(f("the second one in Adyar")).not.toBe("stageOp");
  });
  it("class guard: no second table of ordinal words in the files that pick a case on the Stage (one reader, ordinal.ts)", () => {
    for (const f of readdirSync(__dirname).filter((x) => x === "stagelocal.ts" || x === "frame.ts")) {
      expect(readFileSync(join(__dirname, f), "utf8"), f).not.toMatch(/\bsecond: *2\b|"second", *"third"/);
    }
  });
});
