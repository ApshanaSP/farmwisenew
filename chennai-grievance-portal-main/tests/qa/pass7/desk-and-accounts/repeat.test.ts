/**
 * QA pass 7 (desk-and-accounts): the desk's "came before" check.
 *   redteam-gate-02  an online complaint's title reached the desk with its whole Aadhaar number
 *   reviewer5-07     one writer's two different problems sharing only a predicate were "the same problem", with "Add to this case"
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/repeat.test.ts
 */
import { describe, expect, it, vi } from "vitest";

const ONLINE = { code: "2026-467UPC", filed_at: "2026-11-12 16:00:00", status: "Complaint Filed", problem: "Garbage not cleared, my Aadhaar 2345 6789 1234",
  mobile_number: "9000000001", first_name: "Test", street_address: "1 Test Street", ward_number: 170, dept_name: "Solid Waste Management Department" };
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ connectionSettings: () => ({}), default: { query: async (sql: string) => (/FROM complaints c LEFT JOIN departments/.test(sql) ? [[ONLINE], []] : [[], []]) } }));
const { findRepeats, judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
const AADHAAR_RUN = /(?:\d[\s-]?){12}/;

describe("redteam-gate-02: what the desk is shown of an earlier filing is masked", () => {
  it("an online complaint's title with an Aadhaar number comes back masked", async () => {
    const r = await findRepeats({ mobile: "9000000001", name: null, street: null, ward: 170, dept: null, problem: "Garbage again" });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches[0].problem).not.toMatch(AADHAAR_RUN);
    expect(r.matches[0].problem).toContain("XXXX XXXX 1234");
  });
  it("and an earlier petition stored before P5-007 masked its fields", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: null, street: null, ward: 70, dept: "GCC-ELE", problem: "Street light" },
      [{ code: "2026-111AAA", incidentId: null, filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Street light dead, Aadhaar 9999-4512-7731", dept: "GCC-ELE",
        mobile: "9000011111", name: null, address: null, ward: 70, reporterKind: "petition" }]);
    expect(r.matches[0].problem).not.toMatch(AADHAAR_RUN);
  });
});

// one writer, one department, two DIFFERENT problems that share only a predicate, a duration or a place (reviewer5's list, and more)
const different: [string, string, string][] = [
  ["broken", "Street light pole broken near my house", "Water pipe broken, water wasted on road"],
  ["damaged", "Road damaged badly after rain", "Drain cover damaged and open"],
  ["not received (en)", "Old age pension not received for three months", "Ration rice not received this month"],
  ["pending", "Patta transfer pending for long", "Building plan approval pending"],
  ["blocked", "Drain blocked, sewage stagnating", "Footpath blocked by shop encroachment"],
  ["leaking", "Roof leaking in the school", "Water pipe leaking"],
  ["Tanglish varla", "Thanni varla rendu naala", "Current varla rendu naala"],
  ["Tanglish varala", "Thanni varala", "Bus varala"],
  ["Tanglish kedaikala", "Pension kedaikala moonu maasama", "Ration arisi kedaikala"],
  ["Tanglish aagala", "Street light work aagala", "Motor work aagala"],
  ["Tanglish seyyala", "Kuppai clean seyyala", "Pallam fix seyyala"],
  ["Tamil இயங்கவில்லை", "தெரு விளக்கு இயங்கவில்லை", "குடிநீர் மோட்டார் இயங்கவில்லை"],
  ["Tamil கிடைக்கவில்லை", "முதியோர் ஓய்வூதியம் கிடைக்கவில்லை", "ரேஷன் அரிசி கிடைக்கவில்லை"],
  ["Tamil சரிசெய்யப்படவில்லை", "தெரு விளக்கு சரிசெய்யப்படவில்லை", "சாலை பள்ளம் சரிசெய்யப்படவில்லை"],
  ["Tamil வாரங்களாக", "குப்பை அள்ளப்படவில்லை மூன்று வாரங்களாக", "கழிவுநீர் தேங்கி உள்ளது மூன்று வாரங்களாக"],
  ["Tamil நிலுவையில்", "பட்டா மாறுதல் நிலுவையில் உள்ளது", "சாதி சான்றிதழ் விண்ணப்பம் நிலுவையில் உள்ளது"],
  ["Tamil place சாலையில்", "சாலையில் பள்ளம்", "சாலையில் குப்பை"]
];
// one writer, one department, the SAME problem said twice in other words: still joined
const same: [string, string, string][] = [
  ["work is the topic", "Road work not completed", "Road work left half done"],
  ["Tamil water", "குடிநீர் வரவில்லை", "குடிநீர் வருவதில்லை இரண்டு நாட்களாக"],
  ["Tanglish sewage", "Drainage overflow aagudhu", "Drainage overflow romba naala"],
  ["Tamil plural", "தெரு விளக்கு எரியவில்லை", "தெரு விளக்குகள் எரியவில்லை"],
  ["English plural", "Street lights not working", "Street light broken"],
  ["English verb", "Garbage not collected", "Garbage collection not done"],
  ["a line with only a predicate", "Flooding again", "Flooding near the school"],
  ["the same pension", "Old age pension not received", "Pension pending for months"],
  ["Tanglish water", "Thanni varla", "Thanni varala rendu naala"]
];

describe("reviewer5-07: one writer, two different problems sharing a predicate, are not the same problem", () => {
  for (const [label, a, b] of different) it(label, () => {
    expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(false);
    expect(sameTopic(b, a, true), `"${b}" vs "${a}"`).toBe(false);
  });
});
describe("reviewer5-07: one writer, the same problem in other words, still is", () => {
  for (const [label, a, b] of same) it(label, () => {
    expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(true);
  });
});
describe("reviewer5-07: different people in one ward sharing only a predicate are not 'others written about this'", () => {
  for (const [label, a, b] of different) it(label, () => expect(sameTopic(a, b, false), `"${a}" vs "${b}"`).toBe(false));
  it("but two people about one road's damage still are", () => expect(sameTopic("Road damaged badly after rain", "Road damaged near the bus stop", false)).toBe(true));
});

type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-REV001", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "", dept: "REV",
  mobile: "9000011111", name: "R. Kumar", address: "4, Nehru Street, Perambur", ward: 70, reporterKind: "petition", ...o });

describe("reviewer5-07: what the desk shows (the headline and 'Add to this case' when open && incidentId && sameProblem)", () => {
  for (const [label, before, now] of [
    ["English: patta vs community certificate, both 'pending'", "Patta transfer pending for long", "Community certificate application pending"],
    ["Tamil: பட்டா vs சாதி சான்றிதழ், both நிலுவையில்", "பட்டா மாறுதல் நிலுவையில் உள்ளது", "சாதி சான்றிதழ் விண்ணப்பம் நிலுவையில் உள்ளது"],
    ["Tanglish: thanni vs current, both 'varla'", "Thanni varla rendu naala", "Current varla rendu naala"]
  ]) it(`${label}: 'earlier petitions on other problems', no attach`, () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "REV", problem: now }, [e({ problem: before })]);
    expect(r.matches[0]?.samePerson).toBe(true);
    expect(r.matches[0]?.sameProblem).toBe(false);
    expect(r.attachTo).toBeNull();
    expect(r.headline).toMatch(/earlier petition on other problems/);
  });
  it("the same pension, written twice: 'second petition on this problem', with the case offered", () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "REV", problem: "Pension pending for months" }, [e({ problem: "Old age pension not received" })]);
    expect(r.headline).toMatch(/second petition on this problem/);
    expect(r.attachTo).toBe("INC-W-2026-REV001");
  });
});
