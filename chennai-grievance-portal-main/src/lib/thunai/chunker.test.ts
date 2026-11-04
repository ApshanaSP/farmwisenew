import { describe, expect, it } from "vitest";
import { chunks, spokenPart } from "./chunker";
import { allowedSet, figuresIn, fillTemplate, gateChunk } from "./numbergate";

describe("the chunker", () => {
  it("splits on . ! ? and newline, keeping the terminator", () => {
    expect(chunks("The rain has eased in Adyar today. Is that all? No! Keep watching\nthe drains.")).toEqual(["The rain has eased in Adyar today.", "Is that all?", "No!", "Keep watching", "the drains."]);
  });
  it("splits Tamil on the danda and full stop without touching its letters", () => {
    const t = "அடையாறில் இன்று கடுமையான சம்பவங்கள் உள்ளன। மழை குறைந்துள்ளது॥ நிலவரம் திரையில் உள்ளது.";
    const c = chunks(t);
    expect(c).toEqual(["அடையாறில் இன்று கடுமையான சம்பவங்கள் உள்ளன।", "மழை குறைந்துள்ளது॥", "நிலவரம் திரையில் உள்ளது."]);
    expect(c.join(" ").normalize("NFC")).toBe(t.normalize("NFC"));
  });
  it("the first chunk is at least 20 characters", () => {
    const c = chunks("Done. Adyar is on the map now. Anna Nagar next.");
    expect(c[0]).toBe("Done. Adyar is on the map now.");
    expect(c[0].length).toBeGreaterThanOrEqual(20);
    expect(c[1]).toBe("Anna Nagar next.");
  });
  it("a decimal, an initial and a title do not end a sentence", () => {
    expect(chunks("Rainfall reached 12.5 mm in Adyar today. Next.")).toEqual(["Rainfall reached 12.5 mm in Adyar today.", "Next."]);
    expect(chunks("The drain at T. Nagar is blocked and needs a crew.")).toEqual(["The drain at T. Nagar is blocked and needs a crew."]);
    expect(chunks("St. Thomas Mount has the most complaints this week.")).toHaveLength(1);
  });
  it("splits on commas only above 120 characters", () => {
    const short = "Adyar has the most, Perungudi is second, and Royapuram is third on the list this week.";
    expect(chunks(short)).toEqual([short]);
    const long = "Adyar has the most severe cases this week, most of them waterlogging on the main roads near the bridge, Perungudi is second with drains blocked, and Royapuram is third on the list with garbage piling up near the market.";
    const c = chunks(long);
    expect(c.length).toBeGreaterThan(1);
    expect(c.join(" ")).toBe(long);
    for (const x of c) expect(x.length).toBeLessThanOrEqual(160);
  });
  it("nothing to say is no chunks; stray punctuation is no chunk", () => {
    expect(chunks("   ")).toEqual([]);
    expect(chunks("... !")).toEqual([]);
  });
});

describe("the number gate on spoken chunks", () => {
  const A = allowedSet([6, 1204, 12.5, 300_000, 25_000_000, 40]);
  it("passes figures code supplied, in digits, Indian grouping, lakh and crore", () => {
    expect(gateChunk("Six severe cases are open.", A).ok).toBe(true);
    expect(gateChunk("1,204 cases read, rainfall 12.5 mm.", A).ok).toBe(true);
    expect(gateChunk("About 3 lakh people.", A).ok).toBe(true);
    expect(gateChunk("2.5 crore budget", A).ok).toBe(true);
    expect(gateChunk("40% full", A).ok).toBe(true);
  });
  it("refuses figures code did not supply, in every form", () => {
    expect(gateChunk("Seven severe cases are open.", A).bad).toEqual(["Seven"]);
    expect(gateChunk("1,205 cases.", A).ok).toBe(false);
    expect(gateChunk("4 lakh people", A).ok).toBe(false);
    expect(gateChunk("மூன்று சம்பவங்கள்", A).ok).toBe(false);
    expect(gateChunk("௭ சம்பவங்கள்", A).ok).toBe(false);
    expect(gateChunk("41 % full", A).ok).toBe(false);
    expect(gateChunk("இரண்டு கோடி", A).ok).toBe(false);
    expect(gateChunk("moonu cases", A).ok).toBe(false);
  });
  it("Tamil digits read as their values", () => {
    expect(figuresIn("௬ சம்பவங்கள்")[0].value).toBe(6);
    expect(gateChunk("௬ சம்பவங்கள்", A).ok).toBe(true);
  });
  it("words that are not numbers are not figures: Adyar's river is not six", () => {
    expect(figuresIn("அடையாறு நிலவரம்").length).toBe(0);
    expect(figuresIn("Zone Seventeenth Street").length).toBe(0);
    expect(figuresIn("Someone stone").length).toBe(0);
    expect(figuresIn("Covid-19 and A4 and INC-204").filter((f) => !f.words).length).toBe(0);
  });
  it("digits glued to letters and both ends of a range are figures; codes are not", () => {
    for (const [line, v] of [["The web spread in the 1990s", 1990], ["the 20th century", 20], ["5km away", 5], ["10k people", 10_000], ["500க்கும் மேற்பட்ட புகார்கள்", 500]] as const) expect(figuresIn(line).map((f) => f.value), line).toEqual([v]);
    expect(figuresIn("10-20 people").map((f) => f.value)).toEqual([10, 20]);
    expect(figuresIn("INC-20261004-983F0B, GCC-SWD, Covid-19, A4").length).toBe(0);
  });
  it("number words in every form a model writes them", () => {
    const cases: [string, number][] = [["பதினைந்து", 15], ["இருபத்தைந்து", 25], ["ஐந்நூறு", 500], ["இரண்டாயிரம்", 2000], ["மூன்றில்", 3], ["பத்துக்கும்", 10], ["நூற்றுக்கணக்கான", 100], ["ஆயிரக்கணக்கான", 1000],
      ["பன்னிரண்டு", 12], ["பத்தொன்பது", 19], ["தொண்ணூற்றாறு", 96], ["மூவாயிரம்", 3000], ["லட்சக்கணக்கான", 100_000], ["மூணு", 3], ["ரெண்டு", 2], ["இருபது", 20],
      ["Thousands of complaints", 1000], ["hundreds of them", 100], ["millions", 1_000_000], ["half the wards", 0.5], ["twice as many", 2], ["double the cases", 2], ["a third of them", 1 / 3], ["rendu", 2]];
    for (const [line, v] of cases) expect(figuresIn(line).map((f) => f.value), line).toEqual([v]);
  });
  it("ordinary words are not figures: a false figure here silences real speech", () => {
    for (const line of ["One moment.", "The first one.", "The second one, then the third.", "Let me double-check that.", "Showing both of them.", "This quarter", "On behalf of the Collector", "Someone is on it.",
      "ஒரு நிமிடம்.", "முதலாவது சம்பவத்தைத் திறக்கிறேன்.", "இரண்டாவது சம்பவம்", "மூன்றாம் கட்டம்", "இரண்டையும் காட்டுகிறேன்.", "நான் பார்க்கிறேன்.", "நான்கூட பார்க்கிறேன்", "அது இருக்கிறது.", "எண்ணிக்கை கூடியது.", "பத்திரிகை செய்தி",
      "நூலகம் அருகே", "நூற்றாண்டு", "எழுதுகிறேன்", "எட்டப்பட்டது", "ஏழை மக்கள்", "ஆறுதல்", "லட்சியம்", "முப்படை", "முன்னூட்டம்", "அஞ்சல் நிலையம்", "கோடை மழை", "மூணாறு"]) expect(figuresIn(line).map((f) => f.raw), line).toEqual([]);
  });
  it("templates: a code-filled percent, a zone the turn named, never a prototype key", () => {
    expect(fillTemplate("{n:f1} percent of complaints are resolved", { f1: 12 })).toBe("12 percent of complaints are resolved");
    expect(fillTemplate("{n:f1} சதவீதம் தீர்க்கப்பட்டது", { f1: 12 })).toBe("12 சதவீதம் தீர்க்கப்பட்டது");
    expect(fillTemplate("Fifty percent resolved, {n:f1} open", { f1: 12 })).toBeNull();
    expect(fillTemplate("Zone 13 has {n:f1} open", { f1: 9 }, [13])).toBe("Zone 13 has 9 open");
    expect(fillTemplate("Zone 13 has {n:f1} open", { f1: 9 }, [7])).toBeNull();
    expect(fillTemplate("It says {n:constructor}", { f1: 9 })).toBeNull();
    expect(fillTemplate("It says {n:toString}", Object.create(null))).toBeNull();
  });
  it("speech templates: the model writes {n:key}, code fills", () => {
    expect(fillTemplate("Adyar has {n:severe} severe cases, Perungudi {n:p}.", { severe: 9, p: 4 })).toBe("Adyar has 9 severe cases, Perungudi 4.");
    expect(fillTemplate("Adyar has 9 severe cases.", {})).toBeNull();
    expect(fillTemplate("Adyar has {n:nope} cases.", { severe: 9 })).toBeNull();
    expect(fillTemplate("அடையாறில் {n:s} கடுமையான சம்பவங்கள்.", { s: 9 })).toBe("அடையாறில் 9 கடுமையான சம்பவங்கள்.");
    expect(fillTemplate("three times {n:s}", { s: 9 })).toBeNull();
  });
  it("property: 1,000 generated unsupported numbers are all rejected", () => {
    // a small seeded generator, so a failure repeats
    let seed = 20261104;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed % n; };
    const allowed = allowedSet([3, 17, 250]);
    const forms = (n: number) => [`${n}`, `${n.toLocaleString("en-IN")}`, `${n} cases`, `${n}%`, `${n} lakh`, `${n} crore`, `about ${n}.5`, [...String(n)].map((d) => "௦௧௨௩௪௫௬௭௮௯"[Number(d)]).join("")];
    let rejected = 0, tried = 0;
    while (tried < 1000) {
      const n = 1000 + rnd(9_000_000);
      const f = forms(n)[rnd(8)];
      const line = rnd(2) ? `Adyar has ${f} open today.` : `அடையாறில் ${f} இன்று.`;
      tried++;
      if (!gateChunk(line, allowed).ok) rejected++;
    }
    expect(rejected).toBe(1000);
  });
  it("property: 1,000 model templates with a literal figure are refused, and clean ones always fill", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 2 ** 32; return seed % n; };
    for (let i = 0; i < 1000; i++) {
      const v = 1 + rnd(99_999);
      const lit = `Adyar has ${v} and {n:a} cases.`;
      expect(fillTemplate(lit, { a: 1 })).toBeNull();
      const f = fillTemplate("Adyar has {n:a} and {n:b} cases.", { a: v, b: v + 1 });
      expect(f).toBe(`Adyar has ${v} and ${v + 1} cases.`);
      expect(gateChunk(f!, allowedSet([v, v + 1])).ok).toBe(true);
    }
  });
});

describe("spokenPart", () => {
  it("keeps the whole of a decimal", () => {
    expect(spokenPart("Highest: Meenambakkam at 33.4 °C, as of 28 Oct, 7:41 AM.")).toBe("Highest: Meenambakkam at 33.4 °C, as of 28 Oct, 7:41 AM.");
    expect(spokenPart("Rain 12.5 mm. Then 3.4 mm. Then more.")).toBe("Rain 12.5 mm. Then 3.4 mm.");
  });
  it("keeps a dotted word, and stops at two sentences or about 240 characters", () => {
    expect(spokenPart("See tn.gov.in for it. Two. Three.")).toBe("See tn.gov.in for it. Two.");
    expect(spokenPart(`${"a".repeat(200)}. ${"b".repeat(100)}.`)).toBe(`${"a".repeat(200)}.`);
    expect(spokenPart("அடையாறு 12.5. இரண்டாவது. மூன்றாவது।")).toBe("அடையாறு 12.5. இரண்டாவது.");
  });
});
