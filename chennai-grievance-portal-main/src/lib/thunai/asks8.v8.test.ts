import { describe, expect, it } from "vitest";
import { whoHas } from "./asks7";
import { briefTurn } from "./entities";
import { WORLD } from "./fixture";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld() };
const caseOpen = { blocks: [{ kind: "CaseDetail", ids: ["INC-1"] }] };

describe("v8: follow-ups on the case on screen", () => {
  for (const t of ["Since when?", "since when", "How long has it been open?", "When did this start?", "eppo irundhu?", "எப்போதிலிருந்து?", "எவ்வளவு நாளா இருக்கு?"]) {
    it(`${t} -> the case's own facts`, () => expect(whoHas(t, caseOpen)?.recipe).toBe("case"));
  }
  it("not without a case open", () => expect(whoHas("Since when?", { blocks: [] })).toBeNull());
});

describe("v8: 'which department' in Tamil is a question, not a body's name", () => {
  for (const t of ["எந்தத் துறை மெதுவாக இருக்கு?", "எந்த துறை மோசமா இருக்கு?", "endha department slow ah irukku?"]) {
    it(t, () => { const r = briefTurn(t, world); expect(r?.kind === "reply" && /தரவு இல்லை|no data/.test(r.text.ta + r.text.en)).toBe(false); });
  }
});
