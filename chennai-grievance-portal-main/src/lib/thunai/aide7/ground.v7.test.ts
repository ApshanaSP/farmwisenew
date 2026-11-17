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

describe("v7 (the live pilot, 17 Nov): what a correct sentence may rest on beyond its cited fact", () => {
  const TA_HEADLINE = "Dinamalar reported this afternoon: மணலி காவல் நிலையத்தில் சட்ட விரோதமாக சிவராமன் என்பவரை அடைத்து வைத்திருப்பதாக திருவொற்றியூர் வழக்கறிஞர்கள் முற்றுகை போராட்டம்";
  const news: Sheet7 = { lang: "en", gaz, shown: [], facts: [{ id: "F1", src: "Dinamalar", text: TA_HEADLINE }] };
  it("a name said in English from a Tamil report: its transliteration (Manali, Sivaraman, Thiruvottiyur)", () => {
    expect(checkSentence("Dinamalar reports that Thiruvottiyur lawyers protested at the Mannali police station over Sivaraman's detention. [F1]", news).problems).toEqual([]);
    expect(checkSentence("Dinamalar reports that Kumaresan was detained at Manali. [F1]", news).problems.map((p) => p.kind)).toContain("name");
  });
  it("the screen's scope (its place and window) holds for every sentence", () => {
    const why: Sheet7 = { lang: "en", gaz, shown: [], scope: { names: ["Adyar"], times: ["this week"] },
      facts: [{ id: "F1", src: "dashboard", text: "Key numbers: Street lights & electrical hazards: 12, against 9 before (up 3)", dir: "up" }] };
    expect(checkSentence("Street light complaints in Adyar went up to 12 this week, from 9. [F1]", why).problems).toEqual([]);
    expect(checkSentence("Street light complaints in Royapuram went up to 12. [F1]", why).problems.map((p) => p.kind)).toContain("name");
  });
  it("a sentence of figures reads the screen out; a times sign is markup", () => {
    const k: Sheet7 = { lang: "en", gaz, shown: [], facts: [{ id: "F1", src: "dashboard", text: "Reported 1196, severe 45, open 1024, open complaints 601; Royapuram 2.7 times the median" }] };
    expect(checkSentence("This week 1196 incidents were reported, 45 severe, 1024 open and 601 open complaints. [F1]", k).problems.map((p) => p.kind)).toContain("list");
    expect(checkSentence("Royapuram is at 2.7× the median. [F1]", k).problems.map((p) => p.kind)).toContain("markup");
  });
});

describe("v7 (the dev run, 17 Nov): what a figure dump is not, and what a name is not", () => {
  const s: Sheet7 = { lang: "ta", gaz, shown: [], facts: [{ id: "F1", src: "dashboard", text: "Violent crime in Adyar: 4 in the last 7 days, 1 the 7 days before", times: ["கடந்த 7 நாட்கள்"] }] };
  it("a window's length (7 days, 24 hours) is no figure of the data in the dump count", () => {
    expect(checkSentence("அடையாறில் கடந்த 7 நாளில் 4 வன்முறைக் குற்றங்கள், அதற்கு முன் 7 நாளில் 1. [F1]", s).problems.map((p) => p.kind)).not.toContain("list");
  });
  it("an ordinal's letters after a digit ('4Th Main Road') are no name", () => {
    const e: Sheet7 = { lang: "en", gaz, shown: [], facts: [{ id: "F1", src: "dashboard", text: "Wall collapse on LIC Nagar 4th Main Road, Madipakkam; 2 citizen complaints" }] };
    expect(checkSentence("A wall collapsed on 4Th Main Road in Madipakkam, and 2 citizens have complained. [F1]", e).problems).toEqual([]);
  });
});

describe("v7 (the dev run, 17 Nov): one report is one source", () => {
  const art: Sheet7 = { lang: "ta", gaz, shown: [], facts: [
    { id: "F1", src: "The Hindu", text: "The Hindu reported this afternoon: Charges in one POCSO Act case against Veeramani to be framed on November 20" },
    { id: "F2", src: "The Hindu", text: "The Hindu wrote: The Special Court furnished copies of a 720-page charge sheet to Gem Granites owner R. Veeramani" },
    { id: "F3", src: "dashboard", text: "Severe cases in Adyar: 31" }] };
  it("a figure of the same report, cited by another of its sentences, is the report's", () => {
    expect(checkSentence("தி இந்து செய்தியின்படி Veeramaniக்கு எதிரான POCSO வழக்கில் 720 பக்கக் குற்றப்பத்திரிகை வழங்கப்பட்டது. [F1]", art).problems).toEqual([]);
  });
  it("never a figure of the dashboard's by citing a report", () => {
    expect(checkSentence("தி இந்து செய்தியின்படி அடையாறில் 31 கடுமையான வழக்குகள் உள்ளன. [F1]", art).problems.map((p) => p.kind)).toEqual(expect.arrayContaining(["misbound"]));
  });
});

describe("v7 (the Haiku dev run, 17 Nov): a rise said from a bigger figure to a smaller one", () => {
  it("'rose from 21 to 8' contradicts itself, whatever the cited facts' directions", () => {
    const s = { facts: [{ id: "F1", src: "dashboard", text: "Flooding in Adyar: 21 the week before, 8 this week", dir: "up" as const }, { id: "F2", src: "dashboard", text: "Open: 8", dir: "down" as const }], lang: "en" as const, gaz: gazetteer(WORLD), shown: [] };
    expect(checkSentence("Flooding in Adyar rose from 21 to 8 this week. [F1,F2]", s).problems.map((p) => p.kind)).toContain("direction");
    expect(checkSentence("Flooding in Adyar fell from 8 to 21 this week. [F1,F2]", s).problems.map((p) => p.kind)).toContain("direction");
  });
});

describe("v7 (the Haiku dev run, 17 Nov): an article, a pronoun and a comparison's two pairs are no figures read out", () => {
  it("Tamil 'ஒரு' before a thing that is not counted ('ஒரு தாழ்வான தெரு', a low street) is 'a', not 1; before a complaint it is still a count", () => {
    ok("அடையாறு மண்டலத்தில் ஒரு தாழ்வான சாலையில் தண்ணீர் தேங்கியுள்ளது. [F1]", "ta");
    fails("அடையாறு மண்டலத்தில் ஒரு புகார் மட்டுமே வந்திருக்கிறது. [F1]", "number", "ta");
  });
  it("'ask them for one' and 'the two are close' count nothing", () => {
    ok("PWD Water Resources has no officer named on it yet, so ask them for one. [F3]");
    ok("The two are close on open complaints, 59 against 44. [F6]");
  });
  it("two measures side by side (two pairs) are a comparison, not the screen read out; five figures still are", () => {
    ok("Adyar has more open complaints than Anna Nagar, 59 against 44, and fewer flooding reports, 8 against 26. [F5,F6]");
    fails("Adyar has 59 and Anna Nagar 44 open complaints, with 8 and 26 flooding reports and 38 open. [F5,F6,F7]", "list");
  });
});

describe("v7 (the Haiku dev run, 17 Nov): what a gap sentence, a fact sentence and a street name may say", () => {
  it("a sentence saying there is nothing on it may use the Collector's own words (a title, a place, a day)", () => {
    const s = { ...sheet(), question: "did the Governor visit Guindy yesterday about the floods" };
    expect(checkSentence("I have nothing on the Governor visiting Guindy yesterday. [F1]", s).problems).toEqual([]);
    // never in a claim
    expect(checkSentence("The Governor visited Guindy yesterday. [F1]", s).ok).toBe(false);
  });
  it("a fact's own short phrase that the screen also shows is no reading out; a headline's words still are", () => {
    const s: Sheet7 = { ...sheet(), shown: ["97 incidents were rain-linked over 2 rain days", "Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated"],
      facts: [...sheet().facts, { id: "F9", src: "dashboard", text: "Rain-linked: 97 incidents over 2 rain days" }] };
    expect(checkSentence("So far, 97 incidents were rain-linked over 2 rain days. [F9]", s).problems).toEqual([]);
    expect(checkSentence("Low lying area Pillaiyar Koil St Guindy Industrial Estate is inundated. [F1]", s).problems.map((p) => p.kind)).toContain("copy");
  });
  it("'South Street' for the record's 'South St', and 'R.A. Puram' as the record writes it, are the record's names", () => {
    const s: Sheet7 = { ...sheet(), facts: [...sheet().facts, { id: "F9", src: "dashboard", text: "The incident: R.A. Puram: South St fully flooded near Amma Unavagam, knee-deep, Teynampet zone" }] };
    expect(checkSentence("Water stands knee-deep on South Street at R.A. Puram, near Amma Unavagam. [F9]", s).problems).toEqual([]);
  });
  it("the Adyar River is a river, not a third place in the sentence", () => {
    const s: Sheet7 = { ...sheet(), facts: [...sheet().facts, { id: "F9", src: "dashboard", text: "The incident: overflow from the Adyar River at Guindy, Teynampet zone" }] };
    expect(checkSentence("In Teynampet, the Adyar River is overflowing at Guindy. [F9]", s).problems).toEqual([]);
  });
  it("a rise a cited fact states in its words ('rose by 3') may be said, though the total fell", () => {
    const s: Sheet7 = { ...sheet(), facts: [{ id: "F1", src: "dashboard", text: "What drives it: 100 incidents this week against 105 before (down 5%). Main reasons: street lights rose by 3, protests rose by 3", dir: "down" },
      { id: "F2", src: "dashboard", text: "Street lights & electrical hazards: now vs before: 12 (was 9)" }] };
    expect(checkSentence("Reports are down overall, but a few kinds have risen. [F1]", s).problems).toEqual([]);
    expect(checkSentence("Street light complaints have risen to 12 from 9. [F2]", s).problems).toEqual([]);
  });
});

describe("v7 (the tuned Haiku dev run, 17 Nov): two measures side by side however they are said; a group's size is no figure read out", () => {
  it("'59 open complaints to Anna Nagar's 44, and ... 8 against 26'; Tamil '26-லிருந்து 8', '59 மற்றும் 44'", () => {
    ok("Adyar has 59 open complaints to Anna Nagar's 44, and fewer flooding reports, 8 against 26. [F5,F6]");
    ok("வெள்ளப் புகார்கள் 26-லிருந்து 8 ஆகவும், திறந்த புகார்கள் 59 மற்றும் 44 ஆகவும் உள்ளன. [F5,F6]", "ta");
  });
  it("'the highest of the 10 zones compared': 10 is how many were compared", () => {
    const s: Sheet7 = { ...sheet(), facts: [...sheet().facts, { id: "F9", src: "dashboard", text: "Reported: Teynampet 141, the highest of the 10 compared; severe 11; open 108", rank: true }] };
    expect(checkSentence("Teynampet reported 141, the highest of the 10 zones compared, with 11 severe and 108 open. [F9]", s).problems).toEqual([]);
  });
});

describe("v7 (the round-2 Haiku dev run's grounding judge, 17 Nov): 'almost twice' is no word for 1.7", () => {
  const s = (r: number): Sheet7 => ({ ...sheet(), facts: [{ id: "F1", src: "dashboard", text: "Teynampet against Adyar: 53 against 31", ratios: [r] }] });
  it("a multiple within a tenth of the ratio code computed; 1.7 is not 'nearly twice', 1.9 is", () => {
    fails2(s(53 / 31), "Teynampet's score is almost twice Adyar's. [F1]", "multiplier");
    fails2(s(53 / 31), "தேனாம்பேட்டையின் மதிப்பெண் அடையாறைவிட கிட்டத்தட்ட இரு மடங்கு அதிகம். [F1]", "multiplier");
    expect(checkSentence("Teynampet's score is nearly twice Adyar's. [F1]", s(1.9)).problems.map((p) => p.kind)).not.toContain("multiplier");
  });
});
function fails2(sh: Sheet7, line: string, kind: string) { expect(checkSentence(line, sh).problems.map((p) => p.kind), line).toContain(kind); }

describe("v7 (the unit suite's regex guard, 18 Nov): a district name is a whole word", () => {
  it("'Adyar' inside another word is no name; with an ending in Tamil it is", () => {
    expect(namesIn("The Tadyar road and Adyars are not Adyar.", gaz).map((h) => h.form)).toEqual(["Adyar"]);
    expect(namesIn("xஅடையாறு", gaz).length + namesIn("அஅடையாறு", gaz).length).toBe(0);
    expect(namesIn("அடையாறுக்கு", gaz).length).toBe(1);
  });
});
