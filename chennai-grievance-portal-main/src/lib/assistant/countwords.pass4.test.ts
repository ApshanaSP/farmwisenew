import { describe, expect, it } from "vitest";
import { countInLanguage, countLabel, customWindow, periodNamed } from "./fastpath";
import { YESTERDAY } from "./when";

// RC-10 class guard (PB-007, PB-081, PB-143, PB-003): a count said in any language carries the filter it used, and every lane
// reads every written form of "yesterday" the same way.
const base = { n: 12, prev: 9, severe: 2, open: 12, dead: 0, kind: "incidents", period: "last 7 days", where: "" };
describe("a filtered count is never said as 'reported'", () => {
  const filters = [{ overdue: true }, { openOnly: true }, { minOpenDays: 30 }];
  it.each(filters)("%j: Tanglish and Tamil lines name the state", (f) => {
    const tg = countInLanguage("tanglish", { ...base, ...f })!, ta = countInLanguage("ta", { ...base, ...f })!;
    expect(tg.text).not.toMatch(/report aagirukku/);
    expect(ta.text).not.toMatch(/பதிவாகியுள்ளன/);
    expect(tg.text).toMatch(/deadline|open/);
    expect(ta.text).toMatch(/காலக்கெடு|நிலுவை/);
    expect(ta.text).toMatch(/12/);
  });
  it.each(filters)("%j: the tile is not called Reported", (f) => expect(countLabel(f)).not.toBe("Reported"));
  it("an unfiltered count is still Reported", () => expect(countLabel({})).toBe("Reported"));
});
describe("one reading of yesterday in every lane", () => {
  const forms = ["yesterday", "nethu", "netru", "neththu", "நேற்று", "நேற்றைய", "நேத்து", "நேத்தைய"];
  it.each(forms)("%s: the pattern, the period and the window agree", (w) => {
    expect(YESTERDAY.test(w)).toBe(true);
    expect(periodNamed(`how many ${w}`)).toBe("daily");
    expect(customWindow(`how many ${w}`, "2026-11-06 18:08:00")?.range?.from).toBe("2026-11-05 00:00:00");
  });
  it("a range is not shifted a second time: the previous day's window and the day before it differ by exactly one day", () => {
    const w = customWindow("how many yesterday", "2026-11-06 18:08:00")!;
    expect(w.range!.to.slice(0, 10)).toBe("2026-11-06");
    expect(w.offset).toBe(1); // for the tools that only know periods; the lists ignore it when a range is given (incidents.ts where())
  });
});
