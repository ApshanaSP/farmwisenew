// QA pass 5, P5-007 after review: the fresh reviewer's probe (tests/qa/pass5/probes/reviewer/clean.review.test.ts). 16 of its 27 cases failed on 6728c22.
/**
 * Reviewer probes for 814ab59 (P5-007). Each test states what the fix claims; a failing test is a break.
 * Pure functions only: no store, no network.
 */
import { describe, expect, it } from "vitest";
import { cleanReading, maskAadhaar, normalDate, wardNumber, type RawReading } from "./clean";

const raw = (over: Partial<RawReading> = {}): RawReading => ({
  name: "K. Selvi", mobile: "9000012345", door_no: "27", street: "Jawahar Street", area_en: "Perambur", pincode: "600011", ward: "70", date: "12.09.2026", aadhaar_last4: null,
  subject: "Sewage", problem_en: "Sewage overflow", request_en: "Clear the block", language: "en", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false,
  unsure_fields: [], full_text: "text", ...over
});
const clean = (o: Partial<RawReading>) => cleanReading(raw(o), "2026-11-12");
const has12 = (s: string | null) => /2345\D{0,6}6789\D{0,6}0123/.test(String(s ?? "").replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)));

describe("reviewer: no whole Aadhaar is stored (separators the 4-4-4 mask does not know)", () => {
  // full-width digits are claimed; a full-width keyboard types full-width hyphens and stops too
  it.each([
    ["full-width hyphen U+FF0D", "２３４５－６７８９－０１２３"],
    ["full-width full stop U+FF0E", "２３４５．６７８９．０１２３"],
    ["en dash U+2013", "2345–6789–0123"],
    ["non-breaking hyphen U+2011", "2345‑6789‑0123"],
    ["minus sign U+2212", "2345−6789−0123"],
    ["comma", "2345,6789,0123"],
    ["underscore", "2345_6789_0123"],
    ["split across lines with indentation", "Aadhaar: 2345\n     6789\n     0123"],
    ["CRLF with a blank line", "2345\r\n\r\n6789\r\n\r\n0123"]
  ])("%s in the subject and full text is masked", (_label, a) => {
    const r = clean({ subject: `Aadhaar ${a}`, full_text: `My Aadhaar is ${a}`, name: `Selvi ${a}` });
    expect(has12(r.subject)).toBe(false);
    expect(has12(r.full_text)).toBe(false);
    expect(has12(r.name)).toBe(false);
  });
  it("maskAadhaar directly, en dash", () => expect(maskAadhaar("2345–6789–0123")).toContain("XXXX"));
});

describe("reviewer: 'a 12+ digit mobile is dropped and marked'", () => {
  it("a 12-digit Aadhaar that starts 91, written without spaces, is not kept in the mobile box", () => {
    // Aadhaar numbers start 2-9, so 9123 4567 8901 is a real shape; tenDigits() strips '91' and 10 of its 12 digits are kept
    const r = clean({ mobile: "912345678901" });
    expect(r.mobile).toBeNull();
  });
});

describe("reviewer: the ward is one number with clear edges", () => {
  it("'Zone 6, Ward Seven' is not ward 6 (the zone) without a mark", () => {
    const r = clean({ ward: "Zone 6, Ward Seven" });
    expect(r.ward === null || r.unsure_fields.includes("ward")).toBe(true);
  });
  it("wardNumber('Zone 6 / Ward VII') is not 6", () => expect(wardNumber("Zone 6 / Ward VII")).not.toBe(6));
});

describe("reviewer: 'the first real date wins' and a time before it does not change it", () => {
  // Indian writing puts a dot in the time ("9.10 a.m."); the commit fixed only "10:30"
  it("'9.10 am, 20.3.2026' is 20.03.2026, not 09.10.2020", () => expect(normalDate("9.10 am, 20.3.2026")).toBe("20.03.2026"));
  it("cleanReading marks or fixes it", () => {
    const r = clean({ date: "9.10 am, 20.3.2026" });
    expect(r.date === "20.03.2026" || r.unsure_fields.includes("date")).toBe(true);
  });
  it("'10.30 a.m. 15.03.2026' keeps the date", () => expect(normalDate("10.30 a.m. 15.03.2026")).toBe("15.03.2026"));
});

describe("reviewer: control cases the fix must keep (a real mobile and pincode are not masked or dropped)", () => {
  it.each(["+91 98765 43210", "+919876543210", "098765 43210", "91-9876543210", "９８７６５４３２１０", "௯௮௭௬௫௪௩௨௧௦"])("mobile %s is kept", (m) => {
    expect(clean({ mobile: m }).mobile).toBe("9876543210");
  });
  it.each(["600 028", "600028", "௬௦௦௦௨௮", "６０００２８"])("pincode %s is kept", (p) => expect(clean({ pincode: p }).pincode).toBe("600028"));
  it("a mobile in free text is not masked", () => expect(maskAadhaar("Call +91 98765 43210 or 044-2434 5678")).toBe("Call +91 98765 43210 or 044-2434 5678"));
});
