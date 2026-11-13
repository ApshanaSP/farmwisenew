// Fix-all run after QA pass 6, redteam-gate-03: a 12-digit Aadhaar number written in groups other than 4-4-4 passed maskAadhaar whole, on the
// console case (onlineCase) and at the desk. maskAadhaar is the one masking function every desk and console surface uses.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
const { maskAadhaar } = await import("./clean");
const { onlineCase } = await import("./cases");

const RUN = /(?:\d[\s-]?){12}/;

describe("redteam-gate-03: every way of grouping the 12 digits is masked", () => {
  const shapes: [string, string][] = [
    ["5-7", "Aadhaar 23456 7891234"],
    ["6-6", "Aadhaar 234567 891234"],
    ["2-4-6 with hyphens", "Aadhaar 23-4567-891234"],
    ["2-4-6 with spaces", "Aadhaar 23 4567 891234"],
    ["one digit at a time", "Aadhaar 2 3 4 5 6 7 8 9 1 2 3 4"],
    ["3-3-3-3", "Aadhaar 234 567 891 234"],
    ["6-6 with an en dash and spaces", "Aadhaar 234567 – 891234"],
    ["4-4-4 (unchanged)", "Aadhaar 2345 6789 1234"]
  ];
  it.each(shapes)("%s", (_shape, t) => {
    expect(maskAadhaar(t)).toBe("Aadhaar XXXX XXXX 1234");
  });
  it("Tamil digits written 6-6", () => expect(maskAadhaar("ஆதார் ௨௩௪௫௬௭ ௮௯௧௨௩௪.")).toBe("ஆதார் XXXX XXXX 1234."));
  it.each(shapes)("on the console case: %s", (_shape, t) => {
    const c = onlineCase({ complaint_code: "2026-1AAAAA", created_at: "2026-11-12 16:00:00", title: t, description: t, ward_number: 170, specific_location: t,
      street_address: "x", mobile_number: "9000000001", user_id: 5 }, null);
    expect(c.title).not.toMatch(RUN);
    expect(c.text).not.toMatch(RUN);
    expect(c.place).not.toMatch(RUN);
  });
});

describe("redteam-gate-03: what is not an Aadhaar number is left alone", () => {
  it.each([
    "Mobile +91 98400 12345",
    "Mobile +91-98400-12345",
    "Mobile +91 9840012345",
    "Mobile + 91 98400 12345",
    "Mobile ＋91 98400 12345",
    "Mobile 91 98400 12345",
    "Mobile 9840012345",
    "Mobile 98400 12345",
    "Phone +91 44 2345 6789",
    "Filed 15.03.2026 10:30 am",
    "Door 12, Ward 70, 600011",
    "Two numbers: 98400 12345 / 98400 12346",
    "A 13-digit reference 2345 6789 12345",
    "Pincode 600011 600012 34"
  ])("%s", (t) => expect(maskAadhaar(t)).toBe(t));
});
