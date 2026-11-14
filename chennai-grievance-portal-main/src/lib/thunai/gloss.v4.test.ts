import { describe, expect, it } from "vitest";
import { gloss, tanglishHints, tanglishIn } from "./gloss";
import { fuzzyNames, TG_END } from "./xlit";
import { ZONE_NAMES } from "./lexicon";

const ZN: [number, string][] = ZONE_NAMES.map((n, i) => [i + 1, n]);

describe("Tanglish spellings of the console's verbs and topics", () => {
  it.each([
    ["Adyar la kuppai complaints kaattunga", "[show]"], ["Velachery case-a thira pannunga", "[open]"], ["andha panel-a moodu", "[close]"], ["konjam Perungudi report-a podunga", "[put up/show]"],
    ["rendavadhu-a vilakkunga", "[explain]"], ["idhu enga irundhu vandhuchu", "[came]"], ["saakkadai overflow evlo complaints", "[sewage/drain]"], ["vadikaal problem enna aachu", "[drain]"],
    ["rodu-la pallam irukku", "[pothole/pit]"], ["naai thollai complaints kaattu", "[dog]"], ["kaaichal cases inniki evlo", "[fever]"], ["karent illa nu complaints kaattu", "[electricity]"],
    ["samibathula flood complaints kaattu", "[recently]"], ["pona vaaram dengue epdi", "[last/past]"], ["adha marandhudu", "[forget]"], ["idha nyabagam vechukko", "[remember]"],
    ["kadaisi case-a open pannu", "[last]"], ["moonavadhu case enna", "[third]"]
  ])("%s", (s, want) => expect(gloss(s) ?? "").toContain(want));
  it("Tamil script by stem", () => {
    expect(gloss("சாக்கடை புகார் எவ்வளவு இருக்கு")).toContain("[sewage/drain]");
    expect(gloss("இதை விளக்கமா சொல்லுங்க")).toContain("[explain]");
  });
  it("plain English stays alone, and so does the street light", () => {
    expect(gloss("show me the severe cases in Adyar")).toBeNull();
    expect(gloss("what changed since yesterday in Royapuram")).toBeNull();
    expect(gloss("um show the latest")).toBeNull();
  });
});

describe("tanglishIn and tanglishHints: what the planner reads with a Tanglish sentence", () => {
  it.each(["Adyar la kuppai complaints kaattu", "Velacheryla enna aachu", "epdi theriyum", "pona maasam dengue epdi", "police complaints mattum podu", "Royapuram ku draft pannu"])("%s is Tanglish", (s) => expect(tanglishIn(s)).toBe(true));
  it.each(["show the severe cases in Adyar", "compare Manali and Madhavaram for the last month", "how do you know", "அடையாறு புகார்கள் காட்டு", "formula for the table", ""])("%s is not", (s) => expect(tanglishIn(s)).toBe(false));
  it("hints: the grammar, the gloss when there is one, and Tanglish examples; none for English", () => {
    const h = tanglishHints("Adyar la kuppai complaints kaattu") ?? "";
    expect(h).toMatch(/^Tanglish \(Tamil in Latin letters\)/);
    expect(h).toMatch(/Gloss: Adyar \[in\] \[garbage\] complaints \[show\]/);
    expect(h).toMatch(/Tanglish examples: "Perungudi la kuppai complaints kaattunga" -> cases zones \[14\], cat SOLID_WASTE/);
    expect(h.length).toBeLessThan(1400);
    expect(tanglishHints("show the severe cases in Adyar")).toBeNull();
  });
});

describe("place names with the endings Tanglish and spoken Tamil put on them", () => {
  it.each([["Adyarukku", 13], ["Velacheryoda", null], ["Perungudilerndhu", 14], ["Manalikitta", 2], ["Royapuramla", 5], ["Ambatturoda", 7], ["Teynampetulla", 9], ["மணலில", 2], ["பெருங்குடில", 14], ["மணலிக்கு", 2], ["பெருங்குடிலேர்ந்து", 14]])("%s", (s, n) => {
    const got = fuzzyNames(`${s} complaints`, ZN);
    expect(got).toEqual(n == null ? [] : [n]);
  });
  it("the ending is the longest that fits", () => {
    expect("adyarukku".replace(TG_END, "")).toBe("adyar");
    expect("perungudilerndhu".replace(TG_END, "")).toBe("perungudi");
  });
  it("still finds no name inside other words", () => {
    expect(fuzzyNames("the manager called about the market", ZN)).toEqual([]);
    expect(fuzzyNames("show me the alarm on the road", ZN)).toEqual([]);
  });
});
