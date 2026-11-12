// reviewer5 probe on P6-020 (2d54ab6): the desk's repeat check. Pure (db mocked). A failing test is a finding.
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/reviewer5/repeat-topic.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");

// one writer, one department, two DIFFERENT problems that share only a predicate the FILLER list does not know
const different: [string, string, string][] = [
  ["broken", "Street light pole broken near my house", "Water pipe broken, water wasted on road"],
  ["damaged", "Road damaged badly after rain", "Drain cover damaged and open"],
  ["not received (en)", "Old age pension not received for three months", "Ration rice not received this month"],
  ["pending", "Patta transfer pending for long", "Building plan approval pending"],
  ["blocked", "Drain blocked, sewage stagnating", "Footpath blocked by shop encroachment"],
  ["Tanglish varla (spelling of varala)", "Thanni varla rendu naala", "Current varla rendu naala"],
  ["Tanglish kedaikala", "Pension kedaikala moonu maasama", "Ration arisi kedaikala"],
  ["Tanglish work aagala", "Street light work aagala", "Motor work aagala"],
  ["Tamil இயங்கவில்லை (not functioning)", "தெரு விளக்கு இயங்கவில்லை", "குடிநீர் மோட்டார் இயங்கவில்லை"],
  ["Tamil கிடைக்கவில்லை (not received)", "முதியோர் ஓய்வூதியம் கிடைக்கவில்லை", "ரேஷன் அரிசி கிடைக்கவில்லை"],
  ["Tamil எரியவில்லை vs சரிசெய்யப்படவில்லை", "தெரு விளக்கு சரிசெய்யப்படவில்லை", "சாலை பள்ளம் சரிசெய்யப்படவில்லை"],
  ["Tamil நாட்களாக-like duration: வாரங்களாக", "குப்பை அள்ளப்படவில்லை மூன்று வாரங்களாக", "கழிவுநீர் தேங்கி உள்ளது மூன்று வாரங்களாக"]
];
// one writer, one department, the SAME problem said twice in different words: must still be joined
const same: [string, string, string][] = [
  ["work is the topic", "Road work not completed", "Road work left half done"],
  ["Tamil water", "குடிநீர் வரவில்லை", "குடிநீர் வருவதில்லை இரண்டு நாட்களாக"],
  ["Tanglish sewage", "Drainage overflow aagudhu", "Drainage overflow romba naala"],
  ["Tamil plural", "தெரு விளக்கு எரியவில்லை", "தெரு விளக்குகள் எரியவில்லை"],
  ["English plural/verb", "Garbage not collected", "Garbage collection not done"]
];

describe("reviewer5 on P6-020: one writer, two different problems", () => {
  for (const [label, a, b] of different) it(`not the same problem: ${label}`, () => {
    expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(false);
  });
});
describe("reviewer5 on P6-020: one writer, the same problem in other words", () => {
  for (const [label, a, b] of same) it(`the same problem: ${label}`, () => {
    expect(sameTopic(a, b, true), `"${a}" vs "${b}"`).toBe(true);
  });
});

type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Street light not working", dept: "GCC-ELE",
  mobile: null, name: "R. Kumar", address: "27, 2nd Gandhi Street, Perambur", ward: 70, reporterKind: "petition", ...o });

describe("reviewer5 on P6-020: streets", () => {
  it("a typed 'Gandhi Street' is not '2nd Gandhi Street' (a street number is not a door number): same name, same ward, no mobiles", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "Gandhi Street", ward: 70, dept: "CMWSSB", problem: "Sewage overflowing" }, [e()]);
    console.log("Gandhi St vs 2nd Gandhi St:", JSON.stringify(r.headline), r.matches[0]?.samePerson);
    expect(r.matches[0]?.samePerson ?? false).toBe(false);
  });
  it("'Eleventh Cross Street' is '11th Cross Street' (the same person)", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "Eleventh Cross Street", ward: 70, dept: "GCC-ELE", problem: "Street light not working" }, [e({ address: "4, 11th Cross Street, Perambur" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(true);
  });
  it("a Tamil ordinal street 'இரண்டாவது தெரு' typed against '2வது தெரு' (the same person)", () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street: "இரண்டாவது தெரு", ward: 70, dept: "GCC-ELE", problem: "Street light not working" }, [e({ address: "4, 2வது தெரு, பெரம்பூர்" })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(true);
  });
});

describe("reviewer5 on P6-020: what the desk shows (ManuDesk.tsx:205-212 shows the headline and 'Add to this case' when open && incidentId && sameProblem)", () => {
  for (const [label, before, now] of [
    ["English, Revenue: patta vs community certificate, both 'pending'", "Patta transfer pending for long", "Community certificate application pending"],
    ["Tamil, Revenue: பட்டா vs சாதி சான்றிதழ், both நிலுவையில்", "பட்டா மாறுதல் நிலுவையில் உள்ளது", "சாதி சான்றிதழ் விண்ணப்பம் நிலுவையில் உள்ளது"]
  ]) it(`${label}: not 'this person's second petition on this problem', no attach`, () => {
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "REV", problem: now },
      [e({ mobile: "9000011111", dept: "REV", problem: before, address: "4, Nehru Street, Perambur", incidentId: "INC-W-2026-REV001" })]);
    const m = r.matches[0];
    console.log(label, "->", JSON.stringify(r.headline), "| desk button:", !!(m?.open && m?.incidentId && m?.sameProblem), "| attachTo:", r.attachTo);
    expect(m?.sameProblem ?? false).toBe(false);
  });
});
