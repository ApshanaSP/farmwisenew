// Fix-all run after QA pass 6: the desk's repeat check ("came before"). Pure: the db is mocked.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));
const { judgeRepeats, sameTopic } = await import("@/lib/manu/repeat");
type E = Parameters<typeof judgeRepeats>[1][number];
const e = (o: Partial<E> = {}): E => ({ code: "2026-111AAA", incidentId: "INC-W-2026-111AAA", filedAt: "2026-09-12 10:00:00", status: "Complaint Filed", problem: "Street light not working", dept: "GCC-ELE",
  mobile: null, name: "R. Kumar", address: "27, 2nd Gandhi Street, Perambur", ward: 70, reporterKind: "petition", ...o });

// reviewer5-07: one writer needed only ONE shared word for "the same problem", so any predicate the filler list does not know ("pending",
// "broken", "varla", "கிடைக்கவில்லை", "வாரங்களாக") made two different problems one. The reviewer's cases (tests/qa/pass6/known-failures/reviewer5/repeat-topic.test.ts)
describe("reviewer5-07: one writer, one department, two DIFFERENT problems sharing only what is wrong with them", () => {
  const different: [string, string, string][] = [
    ["broken", "Street light pole broken near my house", "Water pipe broken, water wasted on road"],
    ["damaged", "Road damaged badly after rain", "Drain cover damaged and open"],
    ["not received (en)", "Old age pension not received for three months", "Ration rice not received this month"],
    ["pending", "Patta transfer pending for long", "Building plan approval pending"],
    ["blocked", "Drain blocked, sewage stagnating", "Footpath blocked by shop encroachment"],
    ["Tanglish varla", "Thanni varla rendu naala", "Current varla rendu naala"],
    ["Tanglish kedaikala", "Pension kedaikala moonu maasama", "Ration arisi kedaikala"],
    ["Tanglish work aagala", "Street light work aagala", "Motor work aagala"],
    ["Tamil இயங்கவில்லை", "தெரு விளக்கு இயங்கவில்லை", "குடிநீர் மோட்டார் இயங்கவில்லை"],
    ["Tamil கிடைக்கவில்லை", "முதியோர் ஓய்வூதியம் கிடைக்கவில்லை", "ரேஷன் அரிசி கிடைக்கவில்லை"],
    ["Tamil சரிசெய்யப்படவில்லை", "தெரு விளக்கு சரிசெய்யப்படவில்லை", "சாலை பள்ளம் சரிசெய்யப்படவில்லை"],
    ["Tamil வாரங்களாக", "குப்பை அள்ளப்படவில்லை மூன்று வாரங்களாக", "கழிவுநீர் தேங்கி உள்ளது மூன்று வாரங்களாக"],
    ["Revenue, pending", "Patta transfer pending for long", "Community certificate application pending"],
    ["Revenue, Tamil நிலுவையில்", "பட்டா மாறுதல் நிலுவையில் உள்ளது", "சாதி சான்றிதழ் விண்ணப்பம் நிலுவையில் உள்ளது"],
    // pass 6's own cases (reviewer 3 on P6-011) stay different
    ["Tamil வரவில்லை", "குடிநீர் வரவில்லை", "மின்சாரம் வரவில்லை"],
    ["English not working", "Street light not working", "Water pump not working"],
    ["English please take action", "Please take action immediately, garbage not cleared", "Please take action immediately, pothole on the road"]
  ];
  for (const [label, a, b] of different) it(`${label}: "${a}" / "${b}"`, () => {
    expect(sameTopic(a, b, true), "sameTopic").toBe(false);
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "REV", problem: b },
      [e({ mobile: "9000011111", dept: "REV", problem: a, address: "4, Nehru Street, Perambur", incidentId: "INC-W-2026-REV001" })]);
    // the desk shows "Add to this case" for an open match with a case id and the same problem (ManuDesk.tsx)
    expect({ sameProblem: r.matches[0]?.sameProblem, attachTo: r.attachTo, headline: /on this problem/.test(r.headline ?? "") }).toEqual({ sameProblem: false, attachTo: null, headline: false });
  });
});

describe("reviewer5-07: one writer, the SAME problem in other words, is still joined", () => {
  const same: [string, string, string][] = [
    ["work is the topic", "Road work not completed", "Road work left half done"],
    ["Tamil water", "குடிநீர் வரவில்லை", "குடிநீர் வருவதில்லை இரண்டு நாட்களாக"],
    ["Tanglish sewage", "Drainage overflow aagudhu", "Drainage overflow romba naala"],
    ["Tamil plural", "தெரு விளக்கு எரியவில்லை", "தெரு விளக்குகள் எரியவில்லை"],
    ["English plural/verb", "Garbage not collected", "Garbage collection not done"],
    ["the topic second in one line", "Kindly repair the broken street light", "Street light not working for a week"],
    ["the topic in a later sentence", "Our street is very dark at night. Street lights not working.", "Street light not working"],
    ["Tamil case ending", "சாலை பள்ளம் சரிசெய்யப்படவில்லை", "சாலையில் பள்ளம் உள்ளது"],
    // pass 6's own cases stay the same
    ["Tamil sewage", "சாக்கடை தண்ணீர்", "சாக்கடை அடைப்பு"],
    ["Tanglish sewage water", "saakadai thanni theruvil", "saakadai thanni overflow"],
    ["English sewage", "Sewage still overflowing and now in the well", "Sewage overflowing on the street"]
  ];
  for (const [label, a, b] of same) it(`${label}: "${a}" / "${b}"`, () => {
    expect(sameTopic(a, b, true), "sameTopic").toBe(true);
    const r = judgeRepeats({ mobile: "9000011111", name: "R. Kumar", street: null, ward: 70, dept: "GCC-ELE", problem: b }, [e({ mobile: "9000011111", problem: a })]);
    expect(r.matches[0]?.sameProblem).toBe(true);
    expect(r.attachTo).toBe("INC-W-2026-111AAA");
  });
});

// reviewer5-08: the street a petitioner types, against the address of an earlier petition by the same name (no mobiles to compare)
describe("reviewer5-08: streets", () => {
  const cases: [string, string, string, boolean][] = [
    ["a typed 'Gandhi Street' is not '2nd Gandhi Street' (a street's number is not a door number)", "Gandhi Street", "27, 2nd Gandhi Street, Perambur", false],
    ["'Gandhi Street' is not '2nd Gandhi Street' with no comma before the area", "Gandhi Street", "27 2nd Gandhi Street Perambur", false],
    ["'Eleventh Cross Street' is '11th Cross Street'", "Eleventh Cross Street", "4, 11th Cross Street, Perambur", true],
    ["'Twelfth Cross Street' is not '11th Cross Street'", "Twelfth Cross Street", "4, 11th Cross Street, Perambur", false],
    ["Tamil 'இரண்டாவது தெரு' is '2வது தெரு'", "இரண்டாவது தெரு", "4, 2வது தெரு, பெரம்பூர்", true],
    ["Tamil 'மூன்றாவது தெரு' is not '2வது தெரு'", "மூன்றாவது தெரு", "4, 2வது தெரு, பெரம்பூர்", false],
    ["Tamil digits '௨-வது தெரு' is '2வது தெரு'", "௨-வது தெரு", "4, 2வது தெரு, பெரம்பூர்", true],
    // what pass 6 settled still holds
    ["'3rd Street' is not '2nd Street'", "3rd Street", "27, 2nd Street, Perambur", false],
    ["'First Cross Street' is not 'Fifth Cross Street'", "First Cross Street", "9, Fifth Cross Street, Anna Nagar", false],
    ["'First Cross Street' is '1st Cross Street'", "First Cross Street", "9, 1st Cross Street, Anna Nagar", true],
    ["a typo with the door number in the part: 'Gandhi Stret' / '12 Gandhi Street'", "Gandhi Stret", "12 Gandhi Street, Perambur", true],
    ["the street inside a part with no comma: 'Gandhi Street' / '12 Gandhi Street Perambur'", "Gandhi Street", "12 Gandhi Street Perambur", true],
    ["'Gandhi Street' / '2nd Gandhi Street' typed with its number", "2nd Gandhi Street", "27, 2nd Gandhi Street, Perambur", true]
  ];
  for (const [label, street, address, same] of cases) it(label, () => {
    const r = judgeRepeats({ mobile: null, name: "R. Kumar", street, ward: 70, dept: "GCC-ELE", problem: "Street light not working" }, [e({ address })]);
    expect(r.matches[0]?.samePerson ?? false).toBe(same);
  });
});
