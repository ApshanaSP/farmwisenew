import { describe, expect, it } from "vitest";
import { endsOpen, eouFor } from "./eou";
import { EnergyVad, ProbVad, TUNING } from "./vad";

describe("adaptive end of utterance", () => {
  it("a sentence that ends on a connective, a filler or a preposition waits longer, in English, Tanglish and Tamil", () => {
    for (const t of ["show Adyar and", "show Adyar and also", "compare Adyar matrum", "Adyar apram", "Adyar aprom", "Adyar um", "show the floods then",
      "அடையாறு மற்றும்", "அடையாறு அப்புறம்", "show complaints in", "show me the", "um", "Adyar, and"]) {
      expect(eouFor(t, { sure: true, endsInNoun: true }), t).toEqual({ ms: TUNING.eouOpenMs, why: "open" });
    }
  });
  it("a whole command ends fast: the rules are sure of it, or it ends on a place or a department", () => {
    expect(eouFor("show the severe cases", { sure: true, endsInNoun: false })).toEqual({ ms: TUNING.eouCompleteMs, why: "complete" });
    expect(eouFor("what is happening in Velachery", { sure: false, endsInNoun: true })).toEqual({ ms: TUNING.eouCompleteMs, why: "complete" });
  });
  it("anything else keeps the fixed value, as does a turn with no captions", () => {
    expect(eouFor("how are things", { sure: false, endsInNoun: false })).toEqual({ ms: TUNING.endOfUtteranceMs, why: "neutral" });
    expect(eouFor(null, { sure: false, endsInNoun: false })).toEqual({ ms: TUNING.endOfUtteranceMs, why: "none" });
    expect(eouFor("  ", { sure: true, endsInNoun: true })).toEqual({ ms: TUNING.endOfUtteranceMs, why: "none" });
  });
  it("words that only look like connectives do not hold the turn open", () => {
    for (const t of ["show the trend", "Anna Nagar", "show me this", "explain that", "go to the band", "Adyarum", "show Thandaiyarpet"]) expect(endsOpen(t), t).toBe(false);
  });
  it("the owner's numbers: 300 ms for a whole command, 600 to 700 ms for an open one", () => {
    expect(TUNING.eouCompleteMs).toBe(300);
    expect(TUNING.eouOpenMs).toBeGreaterThanOrEqual(600);
    expect(TUNING.eouOpenMs).toBeLessThanOrEqual(700);
  });
});

describe("the detectors wait as long as the words say", () => {
  const feed = (v: EnergyVad, from: number, to: number, db: number) => { let e = null; for (let t = from; t < to; t += 20) e = v.push(db, t) ?? e; return e; };
  it("the energy gate: endAfter(650) holds a 400 ms pause in the sentence, and the next sentence is back to the fixed value", () => {
    const v = new EnergyVad();
    feed(v, 0, 1500, -70);
    expect(feed(v, 1500, 2500, -20)?.type).toBe("start");
    v.endAfter(TUNING.eouOpenMs);
    expect(feed(v, 2500, 2900, -70)).toBeNull();
    expect(feed(v, 2900, 3600, -70)?.type).toBe("end");
    // the override was for that sentence only
    expect(feed(v, 3600, 4400, -20)?.type).toBe("start");
    expect(feed(v, 4400, 4800, -70)?.type).toBe("end");
  });
  it("Silero's thresholds: the same override, and null puts the fixed value back", () => {
    const p = new ProbVad();
    let at = 0;
    const run = (prob: number, ms: number) => { let e = null; for (const end = at + ms; at < end;) { at += 32; e = p.push(prob, at) ?? e; } return e; };
    expect(run(0.9, 320)?.type).toBe("start");
    p.endAfter(TUNING.eouOpenMs);
    expect(run(0.1, 448)).toBeNull();
    p.endAfter(null);
    expect(run(0.9, 64)).toBeNull();
    expect(run(0.1, 352)?.type).toBe("end");
  });
});
