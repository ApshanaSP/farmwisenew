/**
 * Adversarial review 2 of 4069de1 / 0d7ac3e. Pure checks:
 *   officer-day-02  grade.ts against the pipeline's regex engine (Python `re`, str patterns: Unicode \b and \d). Expected values were
 *                   computed by running district_intel/dintel/severity.grievance() on the same rows; quoted next to each test.
 *   officer-day-07  the citizen's complaint form still promises an officer review of the department.
 *   hunt2-desk-04   a +91 number two digits short, written with a full-width plus, becomes ten digits of another number.
 * Each test states what SHOULD happen; a failing test is a finding.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review2
 */
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: { query: async () => [[], []] }, withTransaction: async () => undefined }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => null }));

const { gradeGrievance } = await import("@/lib/manu/grade");
const { fileSchema } = await import("@/lib/manu/petitions");
const { typedMobile, cleanReading } = await import("@/lib/manu/clean");

describe("review2 officer-day-02: grade.ts and the pipeline agree on Tamil text", () => {
  // Python's \b is Unicode: a Tamil case ending written onto an acronym ("UPHCக்கு", to the UPHC) is part of the word, so \buphc\b does not
  // match. JavaScript's \b (no u flag) sees an ASCII word end and matches. Pipeline: 25.0 Low ("Street Dogs (+25)"), no hospital.
  it("'near UPHCக்கு அருகில்' on a Street Dogs complaint is Low (25), as the pipeline grades it", () => {
    const g = gradeGrievance({ type: "Public Health", subtype: "Street Dogs", title: "Dogs biting", text: "Dogs biting people near UPHCக்கு அருகில்" });
    expect({ score: g.score, level: g.level }).toEqual({ score: 25, level: "Low" });
  });

  // Python's \d matches every script's digits; "complained ௩ times" is a repeat claim (+10). Pipeline: 35.0 Medium.
  it("'complained ௩ times' (a Tamil digit) counts as complaining before: Medium (35), as the pipeline grades it", () => {
    const g = gradeGrievance({ type: "Garbage", subtype: "Removal of Garbage", title: "Garbage not cleared", text: "Garbage not cleared, complained ௩ times" });
    expect({ score: g.score, level: g.level }).toEqual({ score: 35, level: "Medium" });
  });
});

describe("review2 officer-day-07: the complaint form does not promise a review nobody does", () => {
  it("ComplaintTypeSelector.tsx says nothing of an officer confirming the routing", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/ComplaintTypeSelector.tsx"), "utf8");
    const promises = src.split("\n").map((l, k) => [k + 1, l.trim()] as const).filter(([, l]) => /officer (confirms|will confirm)|confirmed by an officer/i.test(l));
    expect(promises.map(([n, l]) => `${n}: ${l.slice(0, 140)}`)).toEqual([]);
  });
});

describe("review2 hunt2-desk-04: a +91 number written with a full-width plus and two digits short is never another person's number", () => {
  const raw = (mobile: string) => ({ name: "R. Kumar", mobile, door: "27", street: "Jawahar Street", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", subject: "Street light",
    problem: "Street light not working near the school", request: "Repair it", dept: "GCC-ELE", urgent: false, fullText: "From R. Kumar" });
  const stored = (box: string): string | undefined => { const r = fileSchema.safeParse(raw(box)); return r.success ? r.data.mobile : undefined; };

  // review1 accepts "＋９１ ９８４００ １２３４５" (full-width) as +91 98400 12345; the same number two digits short must be refused as "+91 98400 123" is
  it("typed or pasted into the desk's box: '＋91 98400 123' is refused, not stored as 9198400123", () => {
    expect(stored(typedMobile("＋91 98400 123"))).toBeUndefined();
  });

  it("returned by the reader: '＋91 98400 123' is not offered to the desk as an unflagged 9198400123", () => {
    const r = cleanReading({ mobile: "＋91 98400 123", pincode: null, ward: null, date: null, unsure_fields: [], aadhaar_last4: null, name: null, door_no: null, street: null, area_en: null,
      subject: null, problem_en: "", request_en: "", language: "en", department: "GCC-ELE", category: "OTHER", urgent: false, full_text: "" } as never, "2026-11-13");
    expect(r.mobile === null || r.unsure_fields.includes("mobile"), `mobile ${r.mobile}, unsure ${r.unsure_fields.join(",")}`).toBe(true);
  });
});
