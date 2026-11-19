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
    // the screen's scope first (its title's places, its window), then the facts in the blocks' order
    expect(s.facts.map((f) => f.id)).toEqual(["F1", "F2", "F3", "F4", "F5"]);
    expect(s.facts[0].text).toBe("This screen covers Adyar, Anna Nagar, this week");
    expect(s.scope).toEqual({ names: ["Adyar", "Anna Nagar"], times: ["this week", "the last 7 days"] });
    expect(s.facts[2].text).toBe("Open complaints: Adyar 59, Anna Nagar 44");
    expect(s.facts[2].ratios?.[0]).toBeCloseTo(59 / 44);
    expect(s.facts[3].text).toMatch(/biggest gap is in open complaints: Adyar is 15 higher than Anna Nagar \(1\.3 times\)/);
    expect(s.facts[1].names).toEqual(expect.arrayContaining(["அடையாறு"]));
    expect(checkSentence("Adyar has 15 more open complaints than Anna Nagar this week. [F4]", s).ok).toBe(true);
  });
  it("tiles: the value, the one before, the change and its direction", () => {
    const s = buildSheet(doc([{ kind: "Kpis", id: "k", title: "The situation", items: [{ key: "now", label: "Reported, the last 24 hours", value: 12, unit: null, prev: 15, delta: -3, tone: "good", spark: [] }] }]), "en", gaz, NOW);
    const f = s.facts.find((x) => /^The situation/.test(x.text));
    expect(f).toMatchObject({ text: "The situation: Reported, the last 24 hours: 12, against 15 before (down 3)", dir: "down" });
    expect(checkSentence(`12 incidents came in over the last 24 hours, down from 15. [${f?.id}]`, s).ok).toBe(true);
    expect(checkSentence(`Incidents rose to 12 over the last 24 hours. [${f?.id}]`, s).problems.map((p) => p.kind)).toContain("direction");
  });
  it("a ranking: the top three with their rank, the last, and the first against the second", () => {
    const s = buildSheet(doc([{ kind: "Ranking", id: "r", title: "Open incidents", unit: "incidents", method: "m", order: "top",
      items: ["Greater Chennai Police:373", "Storm Water Drains:137", "GCC Bus Route Roads:107", "GCC Parks:9"].map((x, i) => { const [label, v] = x.split(":"); return { key: label, label, value: Number(v), rank: i + 1, sub: null, zone: null, lat: null, lon: null, action: "dept" as const }; }) }]), "en", gaz, NOW);
    const top = s.facts.find((f) => /rank 1 of 4/.test(f.text));
    expect(top?.text).toBe("Open incidents (incidents), highest first: rank 1 of 4: Greater Chennai Police, 373");
    expect(s.facts.some((f) => /the last of 4: GCC Parks, 9/.test(f.text))).toBe(true);
    expect(checkSentence(`Greater Chennai Police has the most open incidents, 373. [${top?.id}]`, s).ok).toBe(true);
  });
  it("a heat table: each measure's highest and lowest row", () => {
    const s = buildSheet(doc([{ kind: "Heat", id: "h", title: "Zone × measure", rows: ["Adyar", "Royapuram", "Manali"], cols: ["Open", "Severe"], cells: [[86, 3], [109, 11], [12, 0]] }]), "en", gaz, NOW);
    expect(s.facts.map((f) => f.text)).toEqual(expect.arrayContaining(["Open: highest Royapuram 109, lowest Manali 12, of the 3 compared", "Severe: highest Royapuram 11, lowest Manali 0, of the 3 compared"]));
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
  it("privacy: a citizen's complaint in the case's timeline never becomes a fact (a model would read it); a news report does; identifiers are masked", () => {
    const s = buildSheet(doc([{ kind: "CaseDetail", id: "c", incident: { id: "INC-1", title: "Water stagnation on 4th Street", sev: "High", status: "Open", zone: 13, zoneName: "Adyar",
      place: "Kotturpuram", ward: 170, dept: "CMWSSB", deptName: "Metro Water", complaints: 2, t: "2026-11-16 15:15:25", overdue: false, lat: null, lon: null, why: null, cat: "Drainage & sewage",
      what: ["Call 9876543210 for the site visit"], next: null, deadline: null, officials: [] },
      timeline: [{ t: "2026-11-16 15:20:00", source: "complaint", text: "Ravi Kumar of 12 4th Street says water entered his house" }, { t: "2026-11-16 18:00:00", source: "The Hindu", text: "Kotturpuram streets waterlogged" }] }], { recipe: "case" }), "en", gaz, NOW);
    const all = s.facts.map((f) => f.text).join(" | ");
    expect(all).not.toMatch(/Ravi Kumar|entered his house/);
    expect(all).toMatch(/The Hindu \(yesterday evening\): Kotturpuram streets waterlogged/);
    expect(all).not.toMatch(/9876543210/);
  });
  it("an article's own sentences, as the outlet's", () => {
    expect(sentencesOf("By Staff Reporter. Residents said water stood on three streets for two days after the canal overflowed. Read more at the site. Officials said desilting would begin this week."))
      .toEqual(["Residents said water stood on three streets for two days after the canal overflowed.", "Officials said desilting would begin this week."]);
  });
});

describe("v7 (the Haiku dev run, 17 Nov): a level is no change, and a window's length is no count", () => {
  const find = (title: string, value: number) => ({ title, value, unit: null, method: "m", n: 2, caveat: "A count of reports, not of the problem on the ground", tone: "warn" as const });
  const sheet = () => buildSheet(doc([{ kind: "Findings", id: "f", title: "What stands out", items: [find("Flooding & waterlogging in Teynampet: 8 in the last 7 days, 21 the 7 days before", 8), find("Puzhal (Red Hills): 71% full", 71)] }], { recipe: "explain", title: "Teynampet" }), "en", gaz, NOW);
  it("'8 in the last 7 days, 21 the 7 days before' fell, by 8 against 21 (never 7 against 21); a reservoir's level neither rose nor fell", () => {
    const s = sheet();
    const flood = s.facts.find((f) => /^Flooding/.test(f.text));
    expect(flood?.dir).toBe("down");
    expect(flood?.ratios?.[0]).toBeCloseTo(8 / 21);
    expect(s.facts.find((f) => /^Puzhal/.test(f.text))?.dir ?? null).toBeNull();
  });
  it("'rose from 21 to 8' is refused, and a rise the facts do not state is refused even where no cited fact has a direction", () => {
    const s = sheet();
    const flood = s.facts.find((f) => /^Flooding/.test(f.text))!.id, lake = s.facts.find((f) => /^Puzhal/.test(f.text))!.id;
    expect(checkSentence(`Flooding reports in Teynampet rose from 21 to 8 in the last 7 days. [${flood}]`, s).problems.map((p) => p.kind)).toContain("direction");
    expect(checkSentence(`Flooding reports in Teynampet fell to 8 in the last 7 days, from 21 the 7 days before. [${flood}]`, s).ok).toBe(true);
    expect(checkSentence(`Puzhal has risen to 71% full. [${lake}]`, s).problems.map((p) => p.kind)).toContain("direction");
  });
  it("a heat table's highest row is a rank, not a rise", () => {
    const s = buildSheet(doc([{ kind: "Heat", id: "h", title: "Zone × measure", rows: ["Adyar", "Royapuram", "Manali"], cols: ["Open", "Severe"], cells: [[86, 3], [109, 11], [12, 0]] }]), "en", gaz, NOW);
    expect(s.facts.filter((f) => /highest|lowest/.test(f.text)).map((f) => f.dir ?? null)).toEqual([null, null]);
  });
});

describe("v7 (the tuned Haiku dev run, 17 Nov): a period pair says its direction in words", () => {
  it("'8 in the last 7 days, 21 the 7 days before' carries 'down 13' (Haiku read it as a rise twice)", () => {
    const s = buildSheet(doc([{ kind: "Findings", id: "f", title: "What stands out", items: [{ title: "Flooding & waterlogging in Teynampet: 8 in the last 7 days, 21 the 7 days before", value: 8, unit: null, method: "m", n: 2, caveat: "A count of reports", tone: "warn" }] }], { recipe: "explain", title: "Teynampet" }), "en", gaz, NOW);
    expect(s.facts.find((f) => /^Flooding/.test(f.text))?.text).toBe("Flooding & waterlogging in Teynampet: 8 in the last 7 days, 21 the 7 days before; down 13 (A count of reports)");
  });
});

describe("v7 (the round-2 Haiku dev run, 17 Nov): a side's commonest kinds, most first", () => {
  it("'Traffic 3, Flooding 10' is said 'Flooding 10, Traffic 3' (the model read the first as the commonest)", () => {
    const s = buildSheet(doc([{ kind: "Compare", id: "c", title: "Adyar vs Anna Nagar", metrics: [{ key: "open", label: "Open" }],
      sides: [{ key: "8", label: "Anna Nagar", zone: 8, values: { open: 90 }, cats: [{ code: "TRAFFIC", label: "Traffic obstruction & parking", n: 3 }, { code: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n: 10 }], series: [] },
        { key: "13", label: "Adyar", zone: 13, values: { open: 88 }, cats: [], series: [] }], seriesLabels: [], diffs: [] }]), "en", gaz, NOW);
    expect(s.facts.find((f) => /commonest/.test(f.text))?.text).toBe("Anna Nagar's commonest kinds: Flooding & waterlogging 10, Traffic obstruction & parking 3");
  });
});

describe("v7 (the independent review, 18 Nov): a flat tile, and each report its own source", () => {
  it("a change of 0% is no change ('up 0%' licensed 'rose' and 'none')", () => {
    const s = buildSheet(doc([{ kind: "Kpis", id: "k", title: "The situation", items: [{ key: "now", label: "Reported, the last 24 hours", value: 12, unit: null, prev: 12, delta: 0, pct: 0, tone: "good", spark: [] }] }]), "en", gaz, NOW);
    const f = s.facts.find((x) => x.text.startsWith("The situation"));
    expect(f?.text).not.toContain("up 0");
    expect(f?.dir ?? null).toBeNull();
  });
  it("a news list's stories are each their own report", () => {
    const s = buildSheet(doc([{ kind: "NewsReader", id: "n", title: "News", total: 2, items: [{ id: "a1", title: "Bund breached at Kotturpuram", source: "The Hindu", t: null, place: null, incidentId: null, url: null }, { id: "a2", title: "3 injured in a bus fire", source: "The Hindu", t: null, place: null, incidentId: null, url: null }] }], { recipe: "news" }), "en", gaz, NOW);
    const docs = s.facts.filter((f) => f.src === "The Hindu").map((f) => f.doc);
    expect(new Set(docs).size).toBe(2);
  });
});
