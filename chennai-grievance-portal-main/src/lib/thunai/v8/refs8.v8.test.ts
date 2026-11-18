import { describe, expect, it } from "vitest";
import { newsOrdinal8, ordinalOf, stageRef8 } from "./refs8";

const ROWS = [
  { id: "c1", title: "Waterlogging on the main road", place: "Perambur", zoneName: "Thiru-Vi-Ka Nagar", deptName: "Storm Water Drain" },
  { id: "c2", title: "Road accident near the bus stand", place: "Royapettah", zoneName: "Teynampet", deptName: "Greater Chennai Police" },
  { id: "c3", title: "Garbage not cleared for a week", place: "Kasimedu", zoneName: "Royapuram", deptName: "Solid Waste Management" },
  { id: "c4", title: "Tree fell on a car", place: "Besant Nagar", zoneName: "Adyar", deptName: "Parks" }
];

describe("v8 references: ordinals in three languages", () => {
  const cases: [string, number][] = [["open the second one", 2], ["the 3rd", 3], ["rendavadhu news ah padinga", 2], ["ரெண்டாவது சம்பவத்தைத் திறங்க", 2], ["moonavadhu case open pannunga", 3],
    ["open the last one", -1], ["kadaisi news sollunga", -1], ["mudhal news kaattu", 1], ["முதல் செய்தியைப் படியுங்கள்", 1], ["Open the third news.", 3]];
  for (const [t, n] of cases) it(`${t} -> ${n}`, () => expect(ordinalOf(t)).toBe(n));
  it("a count is not a position ('rendu news', 'two cases')", () => { expect(ordinalOf("rendu news sollu")).toBeNull(); expect(ordinalOf("show two cases")).toBeNull(); });
  it("'second line beach' is a street, not the second item", () => expect(ordinalOf("complaints on Second Line Beach")).toBeNull());
});

describe("v8 references: a case on the list, by its place", () => {
  it("'Open the Teynampet one' opens the Teynampet case", () => expect(stageRef8("Open the Teynampet one.", ROWS)).toEqual({ op: "open", n: 2 }));
  it("'Tell me about the Royapuram one' explains the Royapuram case", () => expect(stageRef8("Tell me about the Royapuram one.", ROWS)).toEqual({ op: "explain", n: 3 }));
  it("by its place or its words, in Tanglish", () => {
    expect(stageRef8("andha Kasimedu case open pannunga", ROWS)).toEqual({ op: "open", n: 3 });
    expect(stageRef8("open the one about the tree", ROWS)).toEqual({ op: "open", n: 4 });
  });
  it("Tamil ordinals with an open verb", () => expect(stageRef8("ரெண்டாவது சம்பவத்தைத் திறங்க.", ROWS)).toEqual({ op: "open", n: 2 }));
  it("not a reference: a new request, or a place none of them is in", () => {
    expect(stageRef8("show me the cases in Teynampet this month", ROWS)).toBeNull();
    expect(stageRef8("Open the Velachery one.", ROWS)).toBeNull();
  });
});

describe("v8 references: a story on screen by its position", () => {
  const items = [{ id: "n1" }, { id: "n2" }, { id: "n3" }];
  it("'Open the third news', 'rendavadhu news ah padinga', 'read the last story'", () => {
    expect(newsOrdinal8("Open the third news.", items)).toBe("n3");
    expect(newsOrdinal8("rendavadhu news ah padinga", items)).toBe("n2");
    expect(newsOrdinal8("read the last story", items)).toBe("n3");
  });
  it("no news word and no verb: not a story", () => { expect(newsOrdinal8("the second", items)).toBeNull(); expect(newsOrdinal8("open the fifth news", items)).toBeNull(); });
});
