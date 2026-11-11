import { describe, expect, it } from "vitest";
import { addHours, bestArea, cleanReading, maskAadhaar, normalDate, phonetic, similarity, squash, tenDigits, type RawReading } from "./clean";

const raw = (over: Partial<RawReading> = {}): RawReading => ({
  name: "க. செல்வி", mobile: "9000012345", door_no: "27", street: "ஜவஹர் தெரு", area_en: "Perambur", pincode: "600011", ward: "70", date: "12.09.2026", aadhaar_last4: null, subject: "கழிவுநீர்",
  problem_en: "Sewage overflow", request_en: "Clear the block", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false, unsure_fields: [], full_text: "text", ...over
});
const clean = (o: Partial<RawReading>) => cleanReading(raw(o), "2026-11-09");

describe("a whole Aadhaar number never gets through", () => {
  it.each(["9999 4512 7731", "999945127731", "9999-4512-7731"])("masks %s", (n) => expect(maskAadhaar(`ஆதார் எண்: ${n}.`)).toBe("ஆதார் எண்: XXXX XXXX 7731."));
  it("leaves a 10-digit mobile alone", () => expect(maskAadhaar("Mobile 9000012345")).toBe("Mobile 9000012345"));
  it("is masked in every field the reader returns", () => {
    const r = clean({ full_text: "No 9999 4512 7731", problem_en: "Aadhaar 999945127731 lost", subject: "9999 4512 7731", name: "9999-4512-7731" });
    expect(JSON.stringify(r)).not.toMatch(/9999\s?-?4512/);
  });
});

describe("mobile numbers", () => {
  it.each([["+91 90000 12345", "9000012345"], ["09000012345", "9000012345"], ["90000-12345", "9000012345"]])("%s is %s", (a, b) => expect(tenDigits(a)).toBe(b));
  it("marks one with the wrong length for checking, and still shows it", () => {
    const r = clean({ mobile: "900001234" });
    expect(r.mobile).toBe("900001234");
    expect(r.unsure_fields).toContain("mobile");
  });
  it("leaves a number that fits unmarked", () => expect(clean({}).unsure_fields).toEqual([]));
  it("keeps a missing number missing", () => expect(clean({ mobile: null }).mobile).toBeNull());
});

describe("dates, wards, pincodes", () => {
  it.each([["5/9/26", "05.09.2026"], ["28-9-2026", "28.09.2026"], ["14.10.2026", "14.10.2026"]])("%s is %s", (a, b) => expect(normalDate(a)).toBe(b));
  it("refuses a date that cannot exist", () => { expect(normalDate("31.02.2026")).toBeNull(); expect(clean({ date: "31.02.2026" }).unsure_fields).toContain("date"); });
  it("marks a date in the future: a digit was misread", () => expect(clean({ date: "22.12.2026" }).unsure_fields).toContain("date"));
  it("drops a ward that does not exist and marks it", () => { const r = clean({ ward: "978" }); expect(r.ward).toBeNull(); expect(r.unsure_fields).toContain("ward"); });
  it("takes the ward number out of the words", () => expect(clean({ ward: "வார்டு 70" }).ward).toBe(70));
  it("drops a short pincode and marks it", () => { const r = clean({ pincode: "6000" }); expect(r.pincode).toBeNull(); expect(r.unsure_fields).toContain("pincode"); });
  it("treats written-out nothing as nothing", () => expect(clean({ name: "null", street: "N/A" })).toMatchObject({ name: null, street: null }));
  it("sends an unknown department to the general office", () => expect(clean({ department: "NOPE" }).department).toBe("GCC-GAD"));
  it("drops an unsure field it does not know", () => expect(clean({ unsure_fields: ["mobile", "shoe_size"] }).unsure_fields).toEqual(["mobile"]));
});

describe("finding the ward from an area's name", () => {
  const areas = [{ name: "TONDIARPET", ward: 38 }, { name: "THIRUVANMIYUR", ward: 181 }, { name: "VELACHERY", ward: 179 }, { name: "VELACHERY EAST", ward: 178 }, { name: "ADYAR", ward: 176 }];
  it("meets a different English spelling of a Tamil name", () => expect(phonetic("Thandaiyarpettai")).toBe(phonetic("Tondiarpet")));
  it.each([["Thandaiyarpettai", 38], ["Tiruvanmiyur", 181], ["velachery", 179], ["Adayar", 176]])("%s is ward %d", (a, w) => expect(bestArea(a, areas)?.ward).toBe(w));
  it("gives nothing rather than a bad guess", () => { expect(bestArea("Kodungaiyur", areas)).toBeNull(); expect(bestArea(null, areas)).toBeNull(); expect(bestArea("xy", areas)).toBeNull(); });
});

describe("text helpers", () => {
  it("adds hours on the IST wall clock", () => expect(addHours("2026-11-09 18:00:00", 24)).toBe("2026-11-10 18:00:00"));
  it("compares Tamil by its letters", () => { expect(squash("க. செல்வி,")).toBe(squash("க செல்வி")); expect(similarity("abc", "abc")).toBe(1); });
});
