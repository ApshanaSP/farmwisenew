import { describe, expect, it } from "vitest";
import { complaintSubmitSchema, hasVisibleText, profileUpdateSchema, registerSchema } from "@/lib/validators";

// reviewerA-01 (hunt2-desk-17, fix 84751d9 / 145e1a9). Goes in chennai-grievance-portal-main/src/lib/ next to validators.ts.
//
// The fix's INVISIBLE class is \p{Cf} + a short list + \s. Control characters (category Cc) are in none of them: String.trim() keeps
// U+0001..U+0008, U+000E..U+001F, U+007F and U+0080..U+009F (U+0085 NEL included: it is not JS whitespace), and so does visibleText().
// A field of only "\u0085" or "\u0001" prints nothing, exactly like the "​" the row was about, and a blank complaint is still
// filed and routed. A few default-ignorable marks of category Mn (U+17B4, U+17B5, U+180B-U+180D, U+180F) pass the same way.
const good = {
  firstName: "Kumar", lastName: "", gender: "Male", streetAddress: "12 Gandhi Street", mobileNumber: "9876543210", zoneId: 6,
  wardNumber: 70, manualStreetName: "Gandhi Street", complaintSubtypeId: 1, title: "Streetlight out", description: "Dark since Monday"
};
const CONTROL = ["\u0001", "\u0085", "\u009F", "\u007F", "\u001B\u0085"];

describe("reviewerA-01: control characters are not something a reader can see", () => {
  it.each(CONTROL)("a complaint whose required fields are only %j is refused", (blank) => {
    const body = { ...good, firstName: blank, streetAddress: blank, manualStreetName: blank, title: blank, description: blank };
    expect(complaintSubmitSchema.safeParse(body).success).toBe(false); // today: true, the blank complaint is filed
  });

  it("each required field alone refuses a control character", () => {
    for (const f of ["firstName", "streetAddress", "title", "description", "manualStreetName"]) {
      expect(complaintSubmitSchema.safeParse({ ...good, [f]: "\u0085" }).success, f).toBe(false);
    }
  });

  it("sign-up and profile share the hole", () => {
    const reg = { email: "a@b.in", password: "Abcdef1!", confirmPassword: "Abcdef1!", firstName: "\u0001" };
    expect(registerSchema.safeParse(reg).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ firstName: "\u0085\u0085" }).success).toBe(false);
  });

  it("hasVisibleText: control characters and the default-ignorable Mn marks count as nothing", () => {
    expect(hasVisibleText("\u0085")).toBe(false);
    expect(hasVisibleText("\u0001\u007F")).toBe(false);
    expect(hasVisibleText("឴")).toBe(false);
    expect(hasVisibleText("᠋᠏")).toBe(false);
    expect(hasVisibleText("a\u0085")).toBe(true); // real text around them still counts
  });
});
