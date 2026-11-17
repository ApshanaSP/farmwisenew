import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import { gazetteer, namesIn } from "./gazetteer";
import { checkSentence, parseLine, timeAtoms, type Sheet7 } from "./ground";

const gaz = gazetteer(WORLD);
const sheet = (lang: "en" | "ta" = "en"): Sheet7 => ({
  lang, gaz,
  shown: ["Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated"],
  facts: [
    { id: "F1", src: "dashboard", text: "Incident: a low-lying street inundated at Guindy Industrial Estate, Adyar zone; rated severe; in progress", names: ["அடையாறு"] },
    { id: "F2", src: "dashboard", text: "Reported since yesterday afternoon", times: ["since yesterday afternoon", "நேற்று மதியத்திலிருந்து"] },
    { id: "F3", src: "dashboard", text: "Held by PWD Water Resources; no officer is named on it" },
    { id: "F4", src: "dashboard", text: "Its deadline passed yesterday", times: ["passed yesterday", "நேற்றே முடிந்துவிட்டது"] },
    { id: "F5", src: "dashboard", text: "Flooding & waterlogging reports in Adyar: 8 in the last 7 days, 26 the 7 days before (down 18)", dir: "down", ratios: [8 / 26] },
    { id: "F6", src: "dashboard", text: "Open complaints: Adyar 59, Anna Nagar 44", ratios: [59 / 44] },
    { id: "F7", src: "dashboard", text: "Teynampet: 38 open incidents this week, the highest of 15 zones", rank: true },
    { id: "F8", src: "The Hindu", text: "The Hindu reported this morning that the bund breached due to heavy rain", cause: true }
  ]
});
const ok = (line: string, lang: "en" | "ta" = "en") => { const r = checkSentence(line, sheet(lang)); expect(r.problems, line).toEqual([]); };
const fails = (line: string, kind: string, lang: "en" | "ta" = "en") => {
  const r = checkSentence(line, sheet(lang));
  expect(r.ok, line).toBe(false);
  expect(r.problems.map((p) => p.kind), line).toContain(kind);
};

describe("v7 grounding checker: what may be said", () => {
  it("reads the writer's line format and never keeps the citation marks", () => {
    expect(parseLine("S: Standing water at Guindy since yesterday. [F1, F2]")).toEqual({ text: "Standing water at Guindy since yesterday.", cites: ["F1", "F2"] });
    expect(parseLine("PWD has it [F3].")).toEqual({ text: "PWD has it.", cites: ["F3"] });
  });
  it("finds the district's names in English and in Tamil, longest first", () => {
    expect(namesIn("Anna Nagar and Adyar", gaz).map((h) => h.key)).toEqual(["zone:8", "zone:13"]);
    expect(namesIn("அடையாறில் தண்ணீர்", gaz).map((h) => h.key)).toContain("zone:13");
  });
  it("passes sentences whose every figure, name and time is in the facts they cite", () => {
    ok("S: Standing water at Guindy Industrial Estate in Adyar since yesterday afternoon, rated severe. [F1,F2]");
    ok("PWD Water Resources has it, but no officer is named and the deadline passed yesterday. [F3,F4]");
    ok("Flooding reports in Adyar fell to eight this week, from twenty-six. [F5]");
    ok("The Hindu reported this morning that the bund breached due to heavy rain. [F8]");
    ok("Adyar has nearly sixty open complaints, against Anna Nagar's 44. [F6]");
    ok("Adyar has over fifty open complaints. [F6]");
    ok("Teynampet has the most open incidents this week. [F7]");
    ok("Want the details?");
    // a sentence may start with a short plain word (the live smoke test, 17 Nov: "A quarrel has ended ..." was rejected as a name)
    ok("A low-lying street at Guindy Industrial Estate in Adyar is under water, rated severe. [F1]");
    ok("It is past its deadline. [F4]");
    ok("அடையாறில் நேற்று மதியத்திலிருந்து தண்ணீர் தேங்கியிருக்கிறது. [F1,F2]", "ta");
  });
});

describe("v7 grounding checker: planted errors are all caught", () => {
  it("a figure no fact holds", () => fails("Flooding reports in Adyar fell to 12 this week. [F5]", "number"));
  it("a figure that belongs to another place (the binding check)", () => fails("Adyar has 38 open incidents this week. [F6,F7]", "misbound"));
  it("a figure cited from the wrong fact", () => fails("Adyar has 59 open complaints. [F5]", "misbound"));
  it("a place the cited facts do not hold", () => fails("Anna Nagar has the standing water at Guindy. [F1]", "name"));
  it("a person nobody mentioned", () => fails("Minister Ravi visited Adyar this morning. [F1]", "name"));
  it("a time the record does not give", () => fails("Standing water at Guindy since yesterday morning. [F1,F2]", "time"));
  it("a cause no fact states", () => fails("Flooding in Adyar fell because the drains were desilted. [F5]", "cause"));
  it("the wrong direction", () => fails("Flooding reports in Adyar rose this week. [F5]", "direction"));
  it("a multiple code did not compute", () => fails("Adyar has twice Anna Nagar's open complaints. [F6]", "multiplier"));
  it("an extreme no fact ranks", () => fails("Adyar is the worst zone for flooding. [F1]", "superlative"));
  it("a guess", () => fails("The bund probably failed. [F8]", "speculation"));
  it("a list of places", () => fails("Adyar, Teynampet and Anna Nagar all need attention. [F6,F7]", "list"));
  it("the screen read out", () => fails("Low lying area Pillaiyar Koil St Guindy Industrial Estate inundated, rated severe. [F1]", "copy"));
  it("an id", () => fails("Incident INC-20261116-A7D5A9 is open in Adyar. [F1]", "label"));
  it("a claim with no fact cited", () => fails("Adyar has 59 open complaints.", "uncited"));
  it("an unknown fact id", () => fails("Adyar has 59 open complaints. [F42]", "cite"));
  it("a Tamil figure no fact holds", () => fails("அடையாறில் இருபது புகார்கள் உள்ளன. [F6]", "number", "ta"));
  it("a Tamil time the record does not give", () => fails("அடையாறில் இன்று காலை முதல் தண்ணீர் தேங்கியுள்ளது. [F1,F2]", "time", "ta"));
  it("an English sentence in a Tamil answer", () => fails("Standing water at Guindy since yesterday afternoon. [F1,F2]", "language", "ta"));
  it("markdown", () => fails("**Adyar** has 59 open complaints. [F6]", "markup"));
});

describe("v7 time atoms", () => {
  it("reads English and Tamil time words as the same atoms", () => {
    expect([...timeAtoms("since yesterday evening")].sort()).toEqual(["evening", "yesterday"]);
    expect([...timeAtoms("நேற்று மாலையிலிருந்து")].sort()).toEqual(["evening", "yesterday"]);
    expect(timeAtoms("last week").has("last-week")).toBe(true);
    expect(timeAtoms("போன வாரம்").has("last-week")).toBe(true);
    expect(timeAtoms("the last 7 days").has("this-week")).toBe(true);
  });
});

describe("v7: Tamil names by their inflected forms, never by a bare stem", () => {
  it("a place with its case endings is found; an ordinary word that shares its start is not", () => {
    const keys = (s: string) => namesIn(s, gaz).map((h) => h.key);
    expect(keys("அடையாளம் தெரியவில்லை")).toEqual([]);
    expect(keys("அடையாறில் வெள்ளம்")).toEqual(["zone:13"]);
    expect(keys("அடையாற்றில் வெள்ளம்")).toEqual(["zone:13"]);
    expect(keys("அடையாறுக்கு அமைச்சர்")).toEqual(["zone:13"]);
    expect(keys("மாதவரத்தில் புகார்கள்")).toEqual(["zone:3"]);
    expect(keys("ராயபுரத்துல கழிவுநீர்")).toEqual(["zone:5"]);
    expect(keys("தேனாம்பேட்டையில்")).toEqual(["zone:9"]);
    expect(keys("ஆலந்தூரில் சாலை")).toEqual(["zone:12"]);
    expect(keys("அண்ணா நகரில் சாலை")).toEqual(["zone:8"]);
    expect(keys("மணல் லாரிகள்")).toEqual([]);
  });
});
