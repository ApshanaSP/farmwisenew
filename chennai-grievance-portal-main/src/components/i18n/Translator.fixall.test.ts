import { describe, expect, it } from "vitest";
import { TA } from "@/lib/i18n/ta";
import { translate } from "./Translator";

// console-sync-13: hand-checked Tamil whose English key carries a number ("last 24 hours", "Today (since 12 AM)") never
// matched, because the Translator looks a text up by its template, every number turned into "#". The dictionary is now read the same way.
const withDigits = Object.keys(TA).filter((k) => /\d/.test(k));

describe("console-sync-13: Tamil keys written with a number are found", () => {
  it("the Daily window's words and the snapshot tile get their hand-checked Tamil, by day and in the small hours, whatever the case", () => {
    for (const k of ["Today (since 12 AM)", "Since 12 AM yesterday", "Past deadline, still open · today", "Resolved today", "Resolved since 12 AM yesterday", "than yesterday by this time", "than the day before by this time"]) {
      expect(translate(k), k).toBe(TA[k]);
      expect(TA[k], k).toMatch(/[஀-௿]/);
    }
    expect(translate("today (since 12 AM)")).toBe(TA["Today (since 12 AM)"]);
    expect(translate("Daily · today (since 12 am)")).toBe(TA["Daily · today (since 12 AM)"]);
  });

  it("every key with a number is reachable, and gives its own Tamil", () => {
    expect(withDigits.length).toBeGreaterThan(5);
    for (const k of withDigits) expect(translate(k), k).toBe(TA[k]);
  });

  it("another number in the same text is put back in the Tamil, in order", () => {
    expect(translate("what each received · last 14 days")).toBe("ஒவ்வொன்றும் பெற்றவை · கடந்த 14 நாட்கள்");
    expect(translate("last 6 weeks compared with the 6 weeks before")).toBe("கடந்த 6 வாரங்கள், அதற்கு முந்தைய 6 வாரங்களுடன் ஒப்பிட்டு");
  });

  it("a key already written with '#' still wins, and a count keeps its number", () => {
    expect(translate("All 12 zones")).toBe("அனைத்து 12 மண்டலங்கள்");
    expect(translate("1,166 more")).toBe("1,166 அதிகம்");
  });

  it("each key with numbers has the same numbers, in the same order, in its Tamil (so the template is safe)", () => {
    const nums = (s: string) => s.match(/\d+(?:[.,]\d+)*/g) ?? [];
    for (const k of withDigits) expect(nums(TA[k]), k).toEqual(nums(k));
  });
});
