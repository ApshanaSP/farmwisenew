import { describe, expect, it } from "vitest";
import { WORLD } from "../fixture";
import type { StageDocT } from "../stage";
import { buildSheet, sentencesOf } from "./facts";
import { gazetteer } from "./gazetteer";
import { checkSentence } from "./ground";

const gaz = gazetteer(WORLD);
const NOW = Date.parse("2026-11-17T10:00:00+05:30");
const doc = (blocks: StageDocT["blocks"], o: Partial<StageDocT> = {}): StageDocT => ({ v: 1, id: "t", recipe: "compare", title: "Adyar vs Anna Nagar · this week", takeaway: null, say: { en: "", ta: "" }, blocks,
  scope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], ...o });

describe("v7 fact sheet: the screen as numbered facts, every derived value code's", () => {
  it("a comparison: each measure side by side, the biggest gap and its ratio, the Tamil names", () => {
    const s = buildSheet(doc([{ kind: "Compare", id: "c", title: "Adyar vs Anna Nagar", metrics: [{ key: "open", label: "Open" }, { key: "complaints", label: "Open complaints" }],
      sides: [{ key: "13", label: "Adyar", zone: 13, values: { open: 86, complaints: 59 }, cats: [{ code: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 20 }], series: [] },
        { key: "8", label: "Anna Nagar", zone: 8, values: { open: 92, complaints: 44 }, cats: [], series: [] }], seriesLabels: [],
      diffs: [{ metric: "complaints", label: "Open complaints", hi: "Adyar", lo: "Anna Nagar", ratio: 1.34, gap: 15 }] }]), "en", gaz, NOW);
    expect(s.facts.map((f) => f.id)).toEqual(["F1", "F2", "F3", "F4"]);
    expect(s.facts[1].text).toBe("Open complaints: Adyar 59, Anna Nagar 44");
    expect(s.facts[1].ratios?.[0]).toBeCloseTo(59 / 44);
    expect(s.facts[2].text).toMatch(/biggest gap is in open complaints: Adyar is 15 higher than Anna Nagar \(1\.3 times\)/);
    expect(s.facts[0].names).toEqual(expect.arrayContaining(["அடையாறு"]));
    expect(checkSentence("Adyar has 15 more open complaints than Anna Nagar. [F3]", s).ok).toBe(true);
  });
  it("tiles: the value, the one before, the change and its direction", () => {
    const s = buildSheet(doc([{ kind: "Kpis", id: "k", title: "The situation", items: [{ key: "now", label: "Reported, the last 24 hours", value: 12, unit: null, prev: 15, delta: -3, tone: "good", spark: [] }] }]), "en", gaz, NOW);
    expect(s.facts[0]).toMatchObject({ text: "The situation: Reported, the last 24 hours: 12, against 15 before (down 3)", dir: "down" });
    expect(checkSentence("12 incidents came in over the last 24 hours, down from 15. [F1]", s).ok).toBe(true);
    expect(checkSentence("Incidents rose to 12 over the last 24 hours. [F1]", s).problems.map((p) => p.kind)).toContain("direction");
  });
  it("a ranking: the top three with their rank, the last, and the first against the second", () => {
    const s = buildSheet(doc([{ kind: "Ranking", id: "r", title: "Open incidents", unit: "incidents", method: "m", order: "top",
      items: ["Greater Chennai Police:373", "Storm Water Drains:137", "GCC Bus Route Roads:107", "GCC Parks:9"].map((x, i) => { const [label, v] = x.split(":"); return { key: label, label, value: Number(v), rank: i + 1, sub: null, zone: null, lat: null, lon: null, action: "dept" as const }; }) }]), "en", gaz, NOW);
    expect(s.facts[0].text).toBe("Open incidents (incidents), highest first: rank 1 of 4: Greater Chennai Police, 373");
    expect(s.facts.some((f) => /the last of 4: GCC Parks, 9/.test(f.text))).toBe(true);
    expect(checkSentence("Greater Chennai Police has the most open incidents, 373. [F1]", s).ok).toBe(true);
  });
  it("a heat table: each measure's highest and lowest row", () => {
    const s = buildSheet(doc([{ kind: "Heat", id: "h", title: "Zone × measure", rows: ["Adyar", "Royapuram", "Manali"], cols: ["Open", "Severe"], cells: [[86, 3], [109, 11], [12, 0]] }]), "en", gaz, NOW);
    expect(s.facts[0].text).toBe("Open, across the 3 rows of the table: highest Royapuram 109, lowest Manali 12");
    expect(s.facts[1].text).toBe("Severe, across the 3 rows of the table: highest Royapuram 11, lowest Manali 0");
  });
  it("a case: when, said as a person says it, in English and Tamil; the record's own words kept for the copy check", () => {
    const s = buildSheet(doc([{ kind: "CaseDetail", id: "c", incident: { id: "INC-1", title: "Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated", sev: "Severe", status: "In progress", zone: 13, zoneName: "Adyar",
      place: "Guindy Industrial Estate", ward: 170, dept: "PWD-WRD", deptName: "PWD Water Resources", complaints: 0, t: "2026-11-16 15:15:25", overdue: true, lat: null, lon: null, why: null, cat: "Flooding & waterlogging",
      what: [], next: null, deadline: "17 Nov 2026, 3:15 AM", officials: [] }, timeline: [] }], { recipe: "case", title: "Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated" }), "en", gaz, NOW);
    const open = s.facts.find((f) => /^Open /.test(f.text));
    expect(open?.text).toBe("Open since yesterday afternoon");
    expect(open?.times).toEqual(["since yesterday afternoon", "நேற்று மதியத்திலிருந்து"]);
    expect(s.facts.find((f) => /^Its deadline/.test(f.text))?.text).toBe("Its deadline passed early this morning");
    expect(s.shown).toContain("Low lying area Pillaiyar Koil St, Guindy Industrial Estate inundated");
    expect(s.note).toMatch(/^The screen shows "Low lying area/);
  });
  it("an article's own sentences, as the outlet's", () => {
    expect(sentencesOf("By Staff Reporter. Residents said water stood on three streets for two days after the canal overflowed. Read more at the site. Officials said desilting would begin this week."))
      .toEqual(["Residents said water stood on three streets for two days after the canal overflowed.", "Officials said desilting would begin this week."]);
  });
});
