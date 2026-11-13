/**
 * Adversarial review 3 of reviewer5-07 (the Manu desk's "came before" check: sameTopic, predicateWord, wordsOf, joinCompounds, judgeRepeats).
 * Each test states what the desk SHOULD show; a failing test is a finding. The pairs are of the kind the reader writes as problem_en (plain
 * English, at most 12 words) and citizens type as an online complaint's title, with the kind of problem (category) the reader or the
 * complaint type would give: both the SAME kind, so the category veto cannot help.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review3
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ connectionSettings: () => ({}), default: { query: async () => [[], []] } }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");

type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "", dept: "DIST-REV",
  mobile: "9000011111", name: "R. Kumar", address: "4, Nehru Street, Perambur", ward: 70, reporterKind: "petition", category: null, ...o });
const desk = (dept: string, cat: string | null, before: string, now: string, who: Partial<E> = {}, me = { mobile: "9000011111", name: "R. Kumar" }) =>
  judgeRepeats({ ...me, street: null, ward: 70, dept, problem: now, category: cat }, [e({ dept, problem: before, category: cat, ...who })]);

// ------------------------------------------------------------------------------- false joins: one writer, two problems --
// [label, dept, category (both), earlier, now]
const different: [string, string, string, string, string][] = [
  // DIST-REV is one department and one category (ADMIN_SERVICES: "pensions, certificates, land records, ration cards") for everything it does
  ["en 'application' (patta vs community certificate)", "DIST-REV", "ADMIN_SERVICES", "Patta transfer application pending for six months", "Community certificate application pending"],
  ["Tamil விண்ணப்பம் (the fix's own pair, with 'application' on both)", "DIST-REV", "ADMIN_SERVICES", "பட்டா மாறுதல் விண்ணப்பம் நிலுவையில் உள்ளது", "சாதி சான்றிதழ் விண்ணப்பம் நிலுவையில் உள்ளது"],
  ["en 'taluk office' (where, not what)", "DIST-REV", "ADMIN_SERVICES", "Patta transfer pending, no response from taluk office", "Income certificate not issued, no response from taluk office"],
  ["en 'VAO' (who, not what)", "DIST-REV", "ADMIN_SERVICES", "Patta transfer pending with VAO", "Income certificate pending with VAO"],
  ["en 'officials' (who, not what)", "DIST-REV", "ADMIN_SERVICES", "Old age pension stopped, officials not responding", "Ration card not issued, officials not responding"],
  // 'my house' is not a topic: its Tamil (வீடு, வீட்டு, வீட்டில்) is in TA_STOP, the English is in no list
  ["en 'near my house' (street light vs exposed wires)", "GCC-ELE", "STREETLIGHT_ELECTRICAL", "Street light not burning near my house", "Junction box open with exposed wires near my house"],
  ["en 'in front of my house' (garbage vs dead animal)", "GCC-SWM", "SOLID_WASTE", "Garbage dumped in front of my house", "Dead cow carcass lying in front of my house"],
  // Tanglish 'veetu munnadi' (in front of the house): pakkathula is listed, veetu / munnadi / kitta are not
  ["Tanglish 'veetu munnadi' (light vs open box)", "GCC-ELE", "STREETLIGHT_ELECTRICAL", "Street light eriyala veetu munnadi", "EB box thirandhu irukku, wire veliya theriyudhu, veetu munnadi"]
];

describe("review3 reviewer5-07: one writer, one department, one kind, two DIFFERENT problems sharing only where/who/'application'", () => {
  for (const [label, dept, cat, before, now] of different) it(label, () => {
    expect(sameTopic(before, now, true, { a: cat, b: cat }), `"${before}" vs "${now}"`).toBe(false);
    const r = desk(dept, cat, before, now);
    expect({ sameProblem: r.matches[0]?.sameProblem, attachTo: r.attachTo, headline: /on this problem/.test(r.headline ?? "") }, r.headline ?? "").toEqual({ sameProblem: false, attachTo: null, headline: false });
  });
});

// ------------------------------------------------------------------------- false joins: different people, one ward --
describe("review3 reviewer5-07: different people in one ward and department, different problems, sharing 'near my house due to rain'", () => {
  const a = "Transformer sparking near my house due to rain", b = "Low voltage at my house due to rain";
  it("sameTopic(…, false) is false", () => expect(sameTopic(a, b, false, { a: "STREETLIGHT_ELECTRICAL", b: "STREETLIGHT_ELECTRICAL" })).toBe(false));
  it("the desk does not say 'other people have written about this' nor offer their case", () => {
    const r = desk("TANGEDCO", "STREETLIGHT_ELECTRICAL", a, b, { mobile: "9000022222", name: "S. Meena" }, { mobile: "9000011111", name: "R. Kumar" });
    expect({ headline: r.headline, attachTo: r.attachTo }).toEqual({ headline: null, attachTo: null });
  });
});

// ------------------------------------------------------------------------------ missed repeats: one writer, one problem --
const same: [string, string, string, string, string][] = [
  // a noun read as a predicate: -ing (only 'flooding' and a few others are excepted)
  ["en 'waterlogging' (an -ing noun)", "GCC-SWD", "FLOOD_WATERLOGGING", "Waterlogging in our street", "Severe waterlogging after every rain"],
  ["en 'water logging' / 'waterlogging'", "GCC-SWD", "FLOOD_WATERLOGGING", "Water logging in front of our house", "Waterlogging in our street"],
  // one word's other forms: no stem for -age / -ing
  ["en drain / drainage", "CMWSSB", "DRAINAGE_SEWAGE", "Drainage blocked in our street", "Drain overflowing, please clear it"],
  ["en light / lighting", "GCC-ELE", "STREETLIGHT_ELECTRICAL", "Street lights not burning", "Poor street lighting in our lane"],
  // Tamil case endings on the thing itself (the accusative -ஐ): only plurals are taken off
  ["Tamil குப்பை / குப்பையை", "GCC-SWM", "SOLID_WASTE", "குப்பை அள்ளப்படவில்லை", "குப்பையை உடனே அகற்ற வேண்டும்"],
  ["Tamil விளக்கு / விளக்கை", "GCC-ELE", "STREETLIGHT_ELECTRICAL", "தெரு விளக்கு எரியவில்லை", "தெரு விளக்கை சரிசெய்து தர வேண்டும்"]
];
describe("review3 reviewer5-07: one writer, the same problem in other words, is still the same problem", () => {
  for (const [label, dept, cat, before, now] of same) it(label, () => {
    expect(sameTopic(before, now, true, { a: cat, b: cat }), `"${before}" vs "${now}"`).toBe(true);
    expect(desk(dept, cat, before, now).attachTo).toBe("INC-W-2026-111AAA");
  });
});

// ---------------------------------------------------------- missed repeat across languages: online title vs the reader's line --
describe("review3 reviewer5-07: the citizen's own Tamil online complaint, then a paper petition on the same thing", () => {
  // the reader always gives problem_en in English (read.ts); the online complaint's title is what the citizen typed. Same mobile, same
  // department, same kind (Street Light -> STREETLIGHT_ELECTRICAL)
  // p7-desk-and-accounts-16, not reproduced in fixall: hunt2-desk-03 (f74a4ca0) says "could not be told" for the other script (was it.skip)
  it("the desk does not tell the staff it is a petition 'on other problems'", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "GCC-ELE", problem: "Street light not burning for two weeks", category: "STREETLIGHT_ELECTRICAL" },
      [e({ reporterKind: "online", dept: "GCC-ELE", problem: "தெரு விளக்கு எரியவில்லை", category: "STREETLIGHT_ELECTRICAL", incidentId: "INC-W-2026-111AAA" })]);
    expect(r.headline ?? "").not.toMatch(/on other problems/);
  });
});
