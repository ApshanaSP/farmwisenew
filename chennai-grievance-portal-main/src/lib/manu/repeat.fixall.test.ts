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

// hunt2-desk-10: "who" was the squashed name before the mobile, so two people of one name (different mobiles, different streets) were one
// root of the union, and "1 other person has written" undercounted a ward's common names (Kumar, Lakshmi, Murugan)
describe("hunt2-desk-10: two people of one name are two people", () => {
  const now = { mobile: "9000011111", name: "Meenakshi", street: "Gandhi Street", ward: 64, dept: "GCC-HLT", problem: "Stray dogs biting children near school" };
  const dog = (o: Partial<E>) => e({ dept: "GCC-HLT", ward: 64, problem: "Stray dogs biting children near the school gate", ...o });
  it("R. Kumar of Kamaraj Salai and R Kumar of Nehru Street, two mobiles: 2 other people", () => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222", address: "1, Kamaraj Salai, Kolathur" }),
      dog({ code: "2026-1B", name: "R Kumar", mobile: "9000033333", address: "5, Nehru Street, Kolathur" })]);
    expect(r.headline).toBe("2 other people have written about this in the same ward.");
  });
  it("one name, one address, a new mobile: 1 person", () => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222", address: "1, Kamaraj Salai, Kolathur" }),
      dog({ code: "2026-1B", name: "R Kumar", mobile: "9000033333", address: "1, Kamaraj Salai, Kolathur" })]);
    expect(r.headline).toBe("1 other person has written about this in the same ward.");
  });
  it("one mobile under two spellings of the name: 1 person", () => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222" }), dog({ code: "2026-1B", name: "Kumar R", mobile: "9000022222" })]);
    expect(r.headline).toBe("1 other person has written about this in the same ward.");
  });
  it("two named people with mobiles and the first once more without one: 2 people", () => {
    const r = judgeRepeats(now, [dog({ code: "2026-1A", name: "R. Kumar", mobile: "9000022222", address: "1, Kamaraj Salai" }),
      dog({ code: "2026-1B", name: "Lakshmi", mobile: "9000033333", address: "5, Nehru Street" }), dog({ code: "2026-1C", name: "R. Kumar", mobile: null, address: "1, Kamaraj Salai" })]);
    expect(r.headline).toBe("2 other people have written about this in the same ward.");
  });
});

// hunt2-desk-03: the same person writing about the same sewage problem once in Tamil script and once in Tanglish was told "written 1 earlier
// petition on other problems": no word of one script meets the other, and the headline said "other problems" confidently
describe("hunt2-desk-03: one person, the other script: 'could not tell', not 'other problems'", () => {
  const me = { mobile: "9000041873", name: "க. பார்வதி", street: null, ward: 70, dept: "CMWSSB" };
  it("Tamil petition, Tanglish check (the probe's case): could not tell, and the case is offered", () => {
    const r = judgeRepeats({ ...me, problem: "kazhivu neer theruvil odudhu, smell romba" },
      [e({ mobile: "9000041873", name: "க. பார்வதி", dept: "CMWSSB", problem: "கழிவுநீர் தெருவில் ஓடுகிறது, துர்நாற்றம்" })]);
    expect(r.headline).toBe("This person has written 1 earlier petition. It is written in the other script (Tamil or English), so it could not be told whether it is about the same problem: read it before approving.");
    expect(r.matches[0]).toMatchObject({ samePerson: true, sameProblem: false, cannotTell: true, incidentId: "INC-W-2026-111AAA" });
  });
  it("a Tamil petition against the person's English online complaint (p10.mjs): could not tell", () => {
    const r = judgeRepeats({ ...me, dept: "GCC-SWM", problem: "கோவில் அருகே குப்பை அள்ளப்படவில்லை" },
      [e({ mobile: "9000041873", name: "Rani", dept: "GCC-SWM", reporterKind: "online", problem: "Garbage not cleared near the temple" })]);
    expect(r.headline).toMatch(/could not be told whether it is about the same problem/);
  });
  it("two of three in the other script", () => {
    const r = judgeRepeats({ ...me, problem: "Sewage overflowing on the street" }, [
      e({ code: "2026-1A", mobile: "9000041873", dept: "CMWSSB", problem: "கழிவுநீர் தெருவில் ஓடுகிறது" }),
      e({ code: "2026-1B", mobile: "9000041873", dept: "CMWSSB", problem: "குடிநீர் வரவில்லை" }),
      e({ code: "2026-1C", mobile: "9000041873", dept: "CMWSSB", problem: "Water meter broken" })]);
    expect(r.headline).toBe("This person has written 3 earlier petitions. 2 are written in the other script (Tamil or English), so it could not be told whether they are about the same problem: read them before approving.");
  });
  it("the same script and different problems: still 'on other problems'; another department: not offered", () => {
    expect(judgeRepeats({ ...me, problem: "Sewage overflowing on the street" }, [e({ mobile: "9000041873", dept: "CMWSSB", problem: "Water meter broken" })]).headline)
      .toBe("This person has written 1 earlier petition on other problems.");
    const r = judgeRepeats({ ...me, problem: "Sewage overflowing on the street" }, [e({ mobile: "9000041873", dept: "GCC-ELE", problem: "தெரு விளக்கு எரியவில்லை" })]);
    expect(r.headline).toBe("This person has written 1 earlier petition on other problems.");
    expect(r.matches[0].cannotTell).toBeUndefined();
  });
});
