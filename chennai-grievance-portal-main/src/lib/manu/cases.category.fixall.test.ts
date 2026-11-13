// Fix-all run after QA pass 6, officer-day-18 (not reproduced): an online complaint's category was its department's single default, so a
// "dustbins in public toilets" complaint reached the Health officer as "Vector- & water-borne disease" and every Engineering complaint as
// "Roads". The case now takes its kind from the complaint type and sub-type as the pipeline reads them (grade.ts grievanceCategory, pass 7's
// desk-and-accounts lane, 4069de10); the department's default is only for a type that says "Other".
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, ops: (t: string) => t, TITLE: "i.title" }));
const { onlineCase } = await import("./cases");

const row = { complaint_code: "2026-1AAAAA", created_at: "2026-11-12 16:00:00", title: "t", description: "d", ward_number: 120, specific_location: null, street_address: "x",
  mobile_number: "9000000001", user_id: 5 };
const kindOf = (dept: string, type: string, subtype: string) => onlineCase(row, dept, { type, subtype }).category;

describe("officer-day-18: an online complaint's kind comes from what it is about, not its department", () => {
  it.each([
    ["Health Department", "Public Toilet", "Availability or cleanliness of dustbins in public toilets"],
    ["Health Department", "Public Toilet", "Broken sinks, toilets or urinals and doors"]
  ])("%s, %s / %s: public toilets, not vector-borne disease", (dept, type, sub) => expect(kindOf(dept, type, sub)).toBe("SANITATION_TOILETS"));
  it("Engineering complaints are not all roads (a Revenue complaint is about tax and licences, so its kind stays that)", () => {
    const eng = ["Unauthorized / Illegal Construction", "Illegal Parking on foot path", "Formation of New Road"].map((s) =>
      kindOf("Engineering Department (Town Planning & Building Permissions)", s === "Unauthorized / Illegal Construction" ? "Building Plan Permission" : "Road and Footpath", s));
    expect(new Set(eng).size).toBeGreaterThan(1);
    expect(kindOf("Engineering Department (Town Planning & Building Permissions)", "Building Plan Permission", "Unauthorized / Illegal Construction")).not.toBe("ROAD_DAMAGE");
  });
});
