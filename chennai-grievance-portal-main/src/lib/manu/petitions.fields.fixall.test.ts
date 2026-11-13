// Fix-all run after QA pass 6: what the desk's approve form accepts (fileSchema). Pure: the stores are mocked.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {}, withTransaction: async () => undefined }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
const { fileSchema } = await import("./petitions");

const fields = (o: Record<string, unknown> = {}) => ({ name: "க. பார்வதி", mobile: "9000041873", door: "27", street: "ஜவஹர் தெரு", area: "Perambur", pincode: "600011", ward: 70,
  date: "12.09.2026", subject: "கழிவுநீர் தொடர்பாக", problem: "Sewage overflowing on the street", request: "Clear the block", dept: "CMWSSB", urgent: false, fullText: "அனுப்புநர்", ...o });
const errorsOf = (o: Record<string, unknown>) => {
  const r = fileSchema.safeParse(fields(o));
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

// hunt2-desk-02: trim() keeps U+200B, U+200C, U+200D, U+2060 and U+FEFF, so a name or problem of only those passed min(2) / min(5)
describe("hunt2-desk-02: a name or problem made only of invisible characters is refused", () => {
  it.each([["zero-width spaces", "​​​"], ["joiners", "‌‍‌"], ["word joiner and BOM", "⁠﻿⁠"], ["one letter and joiners", "R​​"]])(
    "name of %s", (_k, name) => expect(errorsOf({ name })).toContain("name"));
  it.each([["zero-width spaces", "​".repeat(6)], ["joiners and spaces", "‌ ‍ ⁠ ﻿ ​"], ["four letters and joiners", "abcd​​​"]])(
    "problem of %s", (_k, problem) => expect(errorsOf({ problem })).toContain("problem"));
  it("a real name and problem pass, kept as typed (a joiner inside a Tamil word is part of the word)", () => {
    const r = fileSchema.parse(fields({ name: "R. Kumar", problem: "க்‍ஷ No water" }));
    expect(r.name).toBe("R. Kumar");
    expect(r.problem).toBe("க்‍ஷ No water");
    expect(errorsOf({ name: "Ra", problem: "Water" })).toEqual([]);
  });
});
