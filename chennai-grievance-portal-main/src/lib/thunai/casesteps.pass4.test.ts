import { describe, expect, it } from "vitest";
import { actionForOne, caseRow } from "./screens";
import { plainWho } from "./narrate";

// RC-12 (PB-051, PB-113, PB-159, PB-175, PB-225): a case row's flags and next step come from the case's own record (status, department field,
// category code), never from the pipeline flag alone or from words in the title.
const CATS = ["FLOOD_WATERLOGGING", "SOLID_WASTE", "SANITATION_TOILETS", "VECTOR_DISEASE", "WATER_SUPPLY", "DRAINAGE_SEWAGE", "ROAD_DAMAGE"];
const HOLDERS = ["GCC-SWD", "GCC-SWM", "CMWSSB", "HLT-DMS", "TANGEDCO", "PWD-WR", "POL-GCP", "GCC-BRIDGES"];
describe("the next step names the body that holds the case", () => {
  for (const cat of CATS) for (const dept of HOLDERS)
    it(`${cat} held by ${dept}`, () => {
      const a = actionForOne(cat, dept, "Some Department");
      const who = plainWho(dept, "Some Department")!;
      expect(a!.en).toBe(`ask ${who.en} ${a!.en.slice(`ask ${who.en} `.length)}`);
      expect(a!.en.startsWith(`ask ${who.en} `)).toBe(true);
      expect(a!.ta).toMatch(/[஀-௿]/);
      expect(a!.ta).not.toMatch(/[A-Za-z]{4,}/);
    });
  it("a title with another kind's words changes nothing: only the category code and the holder are read", () => {
    expect(actionForOne("DRAINAGE_SEWAGE", "GCC-SWD", null)!.en).toMatch(/drains team/);
    expect(actionForOne("DRAINAGE_SEWAGE", "GCC-SWD", null)!.en).not.toMatch(/Metrowater/);
  });
  it("no step without a known category or holder; a prototype word is not a category", () => {
    expect(actionForOne("LAKE_BUND", "CMWSSB", null)).toBeNull();
    expect(actionForOne("constructor", "CMWSSB", null)).toBeNull();
    expect(actionForOne("SOLID_WASTE", null, null)).toBeNull();
  });
});
describe("a closed case is not past its deadline", () => {
  const w = { zones: [] } as never;
  it.each(["Resolved", "Closed", "Rejected", "Lapsed"])("%s with the pipeline's breach flag", (status) => {
    expect(caseRow({ id: "X", title: "t", status, breached: 1, open: 0 }, w).overdue).toBe(false);
  });
  it("an open case with the flag is", () => expect(caseRow({ id: "X", title: "t", status: "Open", breached: 1, open: 1 }, w).overdue).toBe(true));
  it("a reopened case (open again) with the flag is", () => expect(caseRow({ id: "X", title: "t", status: "Reopened", breached: 1, open: 1 }, w).overdue).toBe(true));
});
