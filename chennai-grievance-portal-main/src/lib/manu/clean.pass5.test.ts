/**
 * QA pass 5, P5-007: the reader's numbers, read as one number each, in ASCII, Tamil and full-width digits, and no whole Aadhaar number
 * anywhere. Written by the manu-logic hunter as probes (tests/qa/pass5/probes/manu-logic/clean.probe.test.ts); 20 of its 22 cases failed on 77ae11a.
 */
import { describe, expect, it } from "vitest";
import { cleanReading, maskAadhaar, normalDate, tenDigits, type RawReading } from "./clean";

const raw = (over: Partial<RawReading> = {}): RawReading => ({
  name: "க. செல்வி", mobile: "9000012345", door_no: "27", street: "ஜவஹர் தெரு", area_en: "Perambur", pincode: "600011", ward: "70", date: "12.09.2026", aadhaar_last4: null, subject: "கழிவுநீர்",
  problem_en: "Sewage overflow", request_en: "Clear the block", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: [], full_text: "text", ...over
});
const clean = (o: Partial<RawReading>) => cleanReading(raw(o), "2026-11-12");

describe("ML-01 dates: an ISO date becomes a different, valid-looking date", () => {
  it("2026-03-15 is 15.03.2026, or at least marked", () => {
    const r = clean({ date: "2026-03-15" });
    expect(r.date === "15.03.2026" || r.unsure_fields.includes("date")).toBe(true);
  });
  it("normalDate('2026-03-15')", () => expect(normalDate("2026-03-15")).not.toBe("26.03.2015"));
  it("a 3-digit year (a dropped digit) is not quietly 2020", () => {
    const r = clean({ date: "15.03.202" });
    expect(r.date === null || r.unsure_fields.includes("date")).toBe(true);
  });
  it("a time before the date does not lose the date", () => expect(normalDate("10:30, 15.03.2026")).toBe("15.03.2026"));
});

describe("ML-02 wards: the digits of two numbers are joined into one ward", () => {
  it.each([["Ward 12, Zone 3", 12], ["12/3", 12], ["Ward 7 (Zone 6)", 7], ["வார்டு 45 மண்டலம் 4", 45]])("%s", (w, want) => {
    const r = clean({ ward: w });
    expect(r.ward === want || r.unsure_fields.includes("ward")).toBe(true);
  });
});

describe("ML-03 Tamil and full-width digits vanish without a mark", () => {
  it("a mobile in Tamil digits is kept or marked", () => {
    const r = clean({ mobile: "௯௦௦௦௦௧௨௩௪௫" });
    expect(r.mobile === "9000012345" || r.unsure_fields.includes("mobile")).toBe(true);
  });
  it("a mobile in full-width digits is kept or marked", () => {
    const r = clean({ mobile: "９０００１２３４５" });
    expect(r.mobile === "9000012345" || r.unsure_fields.includes("mobile")).toBe(true);
  });
  it("a pincode in Tamil digits is kept or marked", () => {
    const r = clean({ pincode: "௬௦௦௦௧௧" });
    expect(r.pincode === "600011" || r.unsure_fields.includes("pincode")).toBe(true);
  });
  it("a ward in Tamil digits is kept or marked", () => {
    const r = clean({ ward: "வார்டு ௭௦" });
    expect(r.ward === 70 || r.unsure_fields.includes("ward")).toBe(true);
  });
});

describe("ML-04 a whole Aadhaar number gets through", () => {
  it.each([
    ["two spaced separators", "9999 - 4512 - 7731"],
    ["slashes", "9999/4512/7731"],
    ["double spaces", "9999  4512  7731"],
    ["zero-width space", "9999​4512​7731"],
    ["Tamil digits", "௯௯௯௯ ௪௫௧௨ ௭௭௩௧"],
    ["full-width digits", "９９９９ ４５１２ ７７３１"]
  ])("in full_text with %s", (_k, n) => {
    const r = clean({ full_text: `ஆதார் எண்: ${n}` });
    expect(r.full_text.replace(/[^\d௦-௯０-９]/g, "")).not.toMatch(/^(9999|௯௯௯௯|９９９９)/);
  });
  it("when the reader puts it in the mobile field", () => {
    const r = clean({ mobile: "2345 6789 0123" });
    expect(JSON.stringify(r)).not.toContain("234567890123");
  });
  it("when it starts with 91 and is read as +91 and a mobile", () => {
    const r = clean({ mobile: "9123 4567 8901" });
    expect(JSON.stringify(r)).not.toContain("2345678901");
  });
});

describe("ML-05 false Aadhaar: a +91 mobile written in one piece is hidden in the text", () => {
  it("+919000012345 in the petition text stays readable", () => expect(maskAadhaar("Cell: +919000012345")).toContain("9000012345"));
  it("tenDigits still reads it", () => expect(tenDigits("+919000012345")).toBe("9000012345"));
});
