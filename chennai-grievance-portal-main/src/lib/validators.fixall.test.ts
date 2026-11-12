import { describe, expect, it } from "vitest";
import { complaintSubmitSchema, hasVisibleText, profileUpdateSchema, registerSchema } from "@/lib/validators";

// hunt2-desk-17: a complaint whose name, address, street, title and description are only zero-width characters was filed and
// routed. trim() keeps U+200B/U+200D, so min(1) counted them. The rule now lives in one shared helper the forms all use.
const ZW = "\u200B";
const ZWJ = "\u200D";

const good = {
  firstName: "Kumar", lastName: "", gender: "Male", streetAddress: "12 Gandhi Street", mobileNumber: "9876543210", zoneId: 6,
  wardNumber: 70, manualStreetName: "Gandhi Street", complaintSubtypeId: 1, title: "Streetlight out", description: "Dark since Monday"
};

describe("hunt2-desk-17: required text must have something a reader can see", () => {
  it("refuses the probe's complaint: every required field only zero-width characters", () => {
    const body = { ...good, firstName: ZW, streetAddress: ZW, manualStreetName: ZW, title: ZW, description: ZWJ };
    const r = complaintSubmitSchema.safeParse(body);
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    for (const f of ["firstName", "streetAddress", "title", "description"]) expect(paths).toContain(f);
  });

  it("refuses each field alone, and other invisible padding (word joiner, BOM, direction marks, soft hyphen, Hangul filler)", () => {
    for (const blank of [ZW, ZWJ, "\u2060", "\uFEFF", "\u200E\u200F", "\u00AD", "\u3164", ` ${ZW} \u200C `]) {
      for (const f of ["firstName", "streetAddress", "title", "description"]) {
        expect(complaintSubmitSchema.safeParse({ ...good, [f]: blank }).success, `${f}=${JSON.stringify(blank)}`).toBe(false);
      }
      expect(complaintSubmitSchema.safeParse({ ...good, manualStreetName: blank }).success).toBe(false);
    }
  });

  it("keeps real text, including a Tamil word with a joiner inside it, as typed", () => {
    const tamil = "க்\u200Dஷ";
    const r = complaintSubmitSchema.safeParse({ ...good, firstName: tamil, title: `தெரு விளக்கு ${ZW}` });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.firstName).toBe(tamil);
    expect(complaintSubmitSchema.safeParse(good).success).toBe(true);
  });

  it("the sign-up and profile forms share the same rule", () => {
    const reg = { email: "a@b.in", password: "Abcdef1!", confirmPassword: "Abcdef1!", firstName: ZW };
    expect(registerSchema.safeParse(reg).success).toBe(false);
    expect(registerSchema.safeParse({ ...reg, firstName: "Asha" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ firstName: `${ZW}${ZWJ}` }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ firstName: "Asha" }).success).toBe(true);
  });

  it("hasVisibleText counts visible characters only", () => {
    expect(hasVisibleText(null)).toBe(false);
    expect(hasVisibleText(`${ZW}a${ZW}`)).toBe(true);
    expect(hasVisibleText(`a${ZW}${ZW}b`, 3)).toBe(false);
  });
});
