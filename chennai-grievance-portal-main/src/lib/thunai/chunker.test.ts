import { describe, expect, it } from "vitest";
import { chunks } from "./chunker";
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
