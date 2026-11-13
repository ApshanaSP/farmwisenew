// g-repair (SKG1-01..07): the Stage's ordinal reader names the cases that were meant. One count rule for the words of every language.
import { describe, expect, it } from "vitest";
import { LAST, readPicks, readPositions, tokensOf } from "./ordinal";
import { localStageCommand } from "./stagelocal";

const pick = (s: string, count = true) => readPicks(tokensOf(s), { count });

describe("counts and lists of cases, in three languages", () => {
  it("first N and last N are counts, in English, Tamil letters and Tanglish, with digits or words", () => {
    for (const s of ["first three", "first 3", "top 3", "முதல் மூன்று", "முதல் 3", "mudhal moonu", "mudhal 3"]) expect(pick(s), s).toEqual({ kind: "first", n: 3 });
    for (const s of ["last two", "last 2", "கடைசி இரண்டு", "கடைசி 2", "kadaisi rendu", "kadaisi 2", "the last two cases"]) expect(pick(s), s).toEqual({ kind: "last", n: 2 });
  });
  it("'the last one' is the last case, a position, and 'first one' the first", () => {
    expect(pick("the last one")).toEqual({ kind: "list", ns: [LAST] });
    expect(pick("last")).toEqual({ kind: "list", ns: [LAST] });
  });
  it("first and third is cases 1 and 3, not the first three", () => {
    expect(pick("first and third")).toEqual({ kind: "list", ns: [1, 3] });
    expect(pick("the first and the third")).toEqual({ kind: "list", ns: [1, 3] });
    expect(readPositions(tokensOf("first and last"))).toEqual([1, LAST]);
  });
  it("second last is the one before the last", () => {
    expect(readPositions(tokensOf("second last"))).toEqual([-2]);
    expect(readPositions(tokensOf("2nd last"))).toEqual([-2]);
    expect(readPositions(tokensOf("third last"))).toEqual([-3]);
  });
  it("'from 3 to 5' in Tamil and Tanglish is a range, never case 1", () => {
    for (const s of ["3 முதல் 5", "3 முதல் 5 வரை", "3 mudhal 5", "3 mudhal 5 varai", "from 3 to 5", "3 to 5"]) expect(readPositions(tokensOf(s)), s).toEqual([3, 4, 5]);
  });
  it("a decimal is not two positions", () => {
    for (const s of ["3.5", "2.5", "3,5"]) expect(readPositions(tokensOf(s)), s).toBeNull();
    expect(localStageCommand("draft 3.5")).toBeNull();
  });
  it("a count with another number or an unknown word beside it is refused, not read from one word", () => {
    for (const s of ["first 3 and 5", "last two and four", "first banana"]) expect(pick(s), s).not.toMatchObject({ kind: "first" });
    expect(pick("last banana")).toBeNull();
  });
});

describe("the Stage's commands carry the counts", () => {
  it("draft with a count of the last cases", () => {
    expect(localStageCommand("draft the last two")).toEqual({ op: "draft", n: 2, first: false, last: true });
    expect(localStageCommand("கடைசி இரண்டு வரைவு செய்")).toEqual({ op: "draft", n: 2, first: false, last: true });
    expect(localStageCommand("முதல் மூன்று வரைவு செய்")).toEqual({ op: "draft", n: 3, first: true });
    expect(localStageCommand("draft the second last")).toEqual({ op: "draft", n: -2, first: false });
  });
});
