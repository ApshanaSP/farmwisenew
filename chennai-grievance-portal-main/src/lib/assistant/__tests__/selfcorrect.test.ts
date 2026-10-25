import { describe, expect, it } from "vitest";
import { selfCorrections, withoutSelfCorrections } from "@/lib/assistant/verify";

describe("drafts that correct themselves", () => {
  it("finds the model arguing with its own figures", () => {
    const live = "Royapuram ranks 1st. While Teynampet reported a higher total volume (453 vs 487 is incorrect, Royapuram is 487, Teynampet is 453) and more complaints.";
    expect(selfCorrections(live)).toHaveLength(1);
    for (const t of ["Sorry, the figure is 12.", "Correction: it was Zone 9.", "Wait, that was last week.", "Actually, no: Adyar leads.",
      "The earlier count was wrong; it is 40.", "I mean Zone 13, not Zone 9.", "Let me correct that: 41 incidents."]) expect(selfCorrections(t)).toHaveLength(1);
  });

  it("leaves ordinary answers alone", () => {
    for (const t of ["Royapuram had 487 incidents, more than Teynampet's 453.", "Flooding rose to 33 from 28; 7 are still open.",
      "Act first on the open canal at Saidapet.", "A rain link does not by itself establish the cause.", "அடையாறில் 41 புகார்கள் உள்ளன.",
      "Adyar la 41 complaints iruku, idhula 7 open."]) expect(selfCorrections(t)).toEqual([]);
  });

  it("drops only the self-correcting sentences and keeps the lines around them", () => {
    const md = "Flooding rose to 33 from 28. Saying 28 is incorrect, it is 33.\n\n- Velachery: 4\n- Guindy: 5";
    const r = withoutSelfCorrections(md);
    expect(r.dropped).toBe(1);
    expect(r.text).toBe("Flooding rose to 33 from 28.\n\n- Velachery: 4\n- Guindy: 5");
    expect(withoutSelfCorrections("Sorry, wrong figure.").text).toBe("");
  });
});
