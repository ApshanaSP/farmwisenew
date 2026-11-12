/**
 * Adversarial review 1 of db27d55 (reviewer5-07, redteam-gate-02): the "came before" check's topic rule and its mask.
 * Each test states what the desk SHOULD do; a failing test is a finding.
 *   npx vitest run --config vitest.p7.config.ts --maxWorkers=1 tests/qa/pass7/desk-and-accounts/review1
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ online: [] as Record<string, unknown>[] }));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[], []] }, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/db", () => ({ connectionSettings: () => ({}), default: { query: async (sql: string) => (/FROM complaints c LEFT JOIN departments/.test(sql) ? [h.online, []] : [[], []]) } }));
const { findRepeats, judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
const { asciiDigits } = await import("@/lib/manu/clean");

type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "", dept: "CMWSSB",
  mobile: "9000011111", name: "R. Kumar", address: "4, Nehru Street, Perambur", ward: 70, reporterKind: "petition", ...o });

// ------------------------------------------------------------------------------------------------ reviewer5-07: false joins --
// one writer, one department, two DIFFERENT problems; the only words they share are predicates, durations or fillers the
// endings-based rule does not recognise
const different: [string, string, string, string][] = [
  ["en 'not yet' (yet)", "DIST-REV", "Old age pension not yet received", "Patta not yet issued"],
  ["en 'for the last one week' (last)", "CMWSSB", "Drinking water not coming for the last one week", "Sewage overflowing on the road for the last one week"],
  ["en 'for the past two weeks' (past)", "CMWSSB", "Drinking water not coming for the past two weeks", "Sewage overflowing for the past two weeks"],
  ["en 'menace'", "GCC-HLT", "Stray dog menace in our street", "Mosquito menace in our street"],
  ["en 'illegal'", "GCC-ENG", "Illegal construction next to my house", "Illegal road cutting by cable company"],
  ["en 'complained many times' (times -> time)", "GCC-SWM", "Garbage not cleared, complained many times", "Street not swept, complained many times"],
  ["en 'properly'", "GCC-SWM", "Garbage not cleared properly", "Roads not swept properly"],
  ["en 'irregular'", "GCC-SWM", "Irregular garbage collection", "Irregular street sweeping"],
  ["en 'defective'", "CMWSSB", "Water meter defective", "Sewage pump defective"],
  ["en 'no response from office'", "DIST-REV", "Old age pension, no response from office", "Patta transfer, no response from office"],
  ["Tamil உடைந்து (broken, verbal participle)", "CMWSSB", "குடிநீர் குழாய் உடைந்து உள்ளது", "கழிவுநீர் தொட்டி மூடி உடைந்து உள்ளது"],
  ["Tamil பழுதடைந்து (damaged, verbal participle)", "CMWSSB", "குடிநீர் குழாய் பழுதடைந்து உள்ளது", "கழிவுநீர் மூடி பழுதடைந்து உள்ளது"],
  ["Tamil பழுது (faulty)", "CMWSSB", "குடிநீர் மோட்டார் பழுது", "கழிவுநீர் பம்ப் பழுது"],
  ["Tamil நீண்ட நாட்களாக (for a long time)", "CMWSSB", "நீண்ட நாட்களாக குடிநீர் வரவில்லை", "நீண்ட நாட்களாக கழிவுநீர் தேங்கி நிற்கிறது"],
  ["Tanglish sariya (properly)", "CMWSSB", "Thanni sariya varala", "Drainage sariya clean pannala"],
  ["Tanglish romba kashtama irukku", "CMWSSB", "Thanni varala romba kashtama irukku", "Drainage overflow aagudhu romba kashtama irukku"],
  ["Tanglish rendu vaarama (for two weeks)", "CMWSSB", "Rendu vaarama thanni varala", "Rendu vaarama drainage block"],
  ["Tanglish odanju pochu (broken)", "CMWSSB", "Thanni pipe odanju pochu", "Drainage moodi odanju pochu"]
];

describe("review1 reviewer5-07: one writer, two different problems sharing only a predicate/duration word, are NOT the same problem", () => {
  for (const [label, , a, b] of different) it(label, () => {
    expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(false);
  });
});

describe("review1 reviewer5-07: what the desk shows for those: no 'second petition on this problem', no 'Add to this case'", () => {
  for (const [label, dept, before, now] of different) it(label, () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept, problem: now }, [e({ dept, problem: before })]);
    const m = r.matches[0];
    // the desk renders "Add to this case" when m.open && m.incidentId && m.sameProblem
    expect(!!(m?.open && m.incidentId && m.sameProblem), `"${before}" then "${now}": headline ${r.headline}`).toBe(false);
    expect(r.attachTo).toBeNull();
  });
});

describe("review1 reviewer5-07: different people in one ward and department, different problems, sharing only 'for a long time'", () => {
  const a = "Drinking water not coming for a long time", b = "Sewage overflowing on the road for a long time";
  it("sameTopic(…, false) is false", () => expect(sameTopic(a, b, false)).toBe(false));
  it("the desk does not say 'other people have written about this' nor offer their case", () => {
    const r = judgeRepeats({ mobile: "9000022222", name: "S. Meena", street: null, ward: 70, dept: "CMWSSB", problem: b },
      [e({ mobile: "9000011111", name: "R. Kumar", problem: a })]);
    expect(r.headline ?? "").not.toMatch(/other (person has|people have) written about this/);
    expect(r.attachTo).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------- reviewer5-07: missed repeats --
// one writer, one department, the SAME problem written twice in other words. Pass 6's rule joined the first three (they share a
// predicate or an -ing noun); the fix stopped recognising them.
const same: [string, string, string, string][] = [
  ["en 'Streetlight' vs 'Street light' (pass 6 joined)", "GCC-ELE", "Streetlight not burning", "Street light not burning"],
  ["Tamil தெருவிளக்கு vs தெரு விளக்கு (pass 6 joined)", "GCC-ELE", "தெருவிளக்கு எரியவில்லை", "தெரு விளக்கு எரியவில்லை"],
  ["en -ing noun 'building' (pass 6 joined)", "GCC-ENG", "Old building near my house about to collapse", "Dangerous building, wall cracks, please demolish"],
  ["Tamil -ம் plural பள்ளம் / பள்ளங்கள் (stem gives பள்ளங்)", "GCC-ENG", "தெருவில் பள்ளம்", "தெருவில் பள்ளங்கள்"],
  ["en -oes plural mosquito / mosquitoes (stem gives mosquitoe)", "GCC-HLT", "Mosquito menace in our area", "Mosquitoes breeding in stagnant water"]
];
describe("review1 reviewer5-07: one writer, the same problem in other words, is still the same problem", () => {
  for (const [label, , a, b] of same) it(label, () => expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(true));
  for (const [label, dept, before, now] of same) it(`${label}: the desk offers 'Add to this case'`, () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept, problem: now }, [e({ dept, problem: before })]);
    expect(r.attachTo, r.headline ?? "").toBe("INC-W-2026-111AAA");
  });
});

// ------------------------------------------------------------------------------------------------ redteam-gate-02: holds? --
// the first 8 digits of the Aadhaar used below (2345 6789 1234), in any script, anywhere in what the desk is sent
const leaks = (r: unknown) => asciiDigits(JSON.stringify(r)).replace(/\D/g, "").includes("23456789");
describe("review1 redteam-gate-02: an earlier filing's Aadhaar never reaches the desk (4-4-4 shapes only; other shapes are redteam-gate-03)", () => {
  const titles = [
    "Garbage not cleared, Aadhaar ௨௩௪௫ ௬௭௮௯ ௧௨௩௪",          // Tamil digits
    "Garbage not cleared, Aadhaar ２３４５ ６７８９ １２３４",      // fullwidth digits
    "Garbage not cleared, Aadhaar 2345–6789–1234",  // en dashes
    "Garbage not cleared, Aadhaar 2345 6789 1234",  // no-break spaces
    "Garbage not cleared, Aadhaar:234567891234",            // run together
    "Garbage, mobile +91 98400 12345, Aadhaar 2345 6789 1234"
  ];
  for (const title of titles) it(JSON.stringify(title), async () => {
    h.online = [{ code: "2026-467UPC", filed_at: "2026-11-12 16:00:00", status: "Complaint Filed", problem: title, mobile_number: "9000000001",
      first_name: "Kumar 2345 6789 1234", street_address: "Aadhaar 2345 6789 1234, 1 Test Street", ward_number: 170, dept_name: "Solid Waste Management Department" }];
    const r = await findRepeats({ mobile: "9000000001", name: null, street: null, ward: 170, dept: null, problem: "Garbage again" });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(leaks(r), JSON.stringify(r.matches[0])).toBe(false);
  });
});
