import { describe, expect, it } from "vitest";
import { dayWords, deadlineSource, deadlineWords, parseReasons, pointsText, scoreWhy, scoreWhyFacts } from "./scorewhy";
import { SEV_BANDS_TEXT, SEV_CUTS, sevOfScore } from "@/lib/sev-label";

// one incidents row as the pipeline writes it (district_intel/dintel/scorewhy.py)
const stored = {
  incident_id: "INC-1", severity_score: 70, severity_level: "Severe", priority_score: 95,
  severity_reasons: "Public Nuisance (+20); 1 fatality (+50)",
  priority_reasons: "Severe street lights & electrical hazards (70); resolution over twice the 2 h target",
  sla_hours: 2, sla_basis: "resolution", sla_source: "TNERC Distribution Standards of Performance Regulations, 2004, regulation 12(II)",
  score_why: JSON.stringify({
    v: 1,
    sev: [["Public Nuisance", 20, "BNS 292: public nuisance, fine up to Rs 1,000"], ["1 fatality", 50, "Loss of life: any death makes the event Severe (District IQ rule)"]],
    pri: [["severity", "Severity (Severe)", 70], ["sla_over_2x", "Open more than twice past its 2 h deadline", 20], ["rain", "Linked to a rain event", 5]],
    sla: { h: 2, basis: "resolution", official: true, source: "TNERC Distribution Standards of Performance Regulations, 2004", clause: "regulation 12(II)",
      rule: "Fault in transformer structure, LT line or pillar box, Corporation area: supply restored within 2 hours", url: "https://indiankanoon.org/doc/39155682/",
      checked: "2026-11-28", fit: "Set for electricity supply faults; District IQ uses it for every Severe case in this category, street lights included", related: [{ source: "TNERC Distribution Standards of Performance Regulations, 2004", clause: "regulation 12(II)", rule: "Essential services attended immediately", url: null, official: true }] }
  })
};

describe("scoreWhy: a build with the breakdown", () => {
  const w = scoreWhy(stored);
  it("reads every severity point with its basis", () => {
    expect(w.stored).toBe(true);
    expect(w.severity.items.map((x) => [x.what, x.points])).toEqual([["Public Nuisance", 20], ["1 fatality", 50]]);
    expect(w.severity.items[0].basis).toMatch(/^BNS 292/);
    expect(w.severity.capped).toBeNull();
    expect(w.severity.level).toBe("Severe");
  });
  it("reads the priority terms, which add up to the priority", () => {
    expect(w.priority.withPoints).toBe(true);
    expect(w.priority.terms.reduce((a, t) => a + (t.points ?? 0), 0)).toBe(95);
    expect(w.priority.setLater).toBe(false);
  });
  it("names the deadline's source and clause", () => {
    expect(w.deadline).toMatchObject({ hours: 2, basis: "resolution", official: true, clause: "regulation 12(II)", checked: "2026-11-28" });
    expect(w.deadline.fit).toMatch(/^Set for electricity supply faults/);
    expect(deadlineWords(w.deadline)).toBe("2 h to resolve");
    expect(deadlineSource(w.deadline)).toBe("TNERC Distribution Standards of Performance Regulations, 2004, regulation 12(II)");
    expect(w.deadline.related).toHaveLength(1);
  });
  it("says when a later step set the priority (an urgent Manu petition is 90)", () => {
    expect(scoreWhy({ ...stored, priority_score: 90 }).priority.setLater).toBe(true);
  });
  it("notes a capped score", () => {
    const capped = scoreWhy({ ...stored, severity_score: 69, score_why: JSON.stringify({ v: 1, sev: [["Fire & explosion", 55, null], ["2 fatalities", 30, null],
      ["Capped at High until a department or officer confirms it", null, null]], pri: [], sla: {} }) });
    expect(capped.severity.capped).toBe("Capped at High until a department or officer confirms it");
    expect(scoreWhy({ ...stored, severity_score: 100, score_why: JSON.stringify({ v: 1, sev: [["bund breach", 60, null], ["Full service disruption", 15, null],
      ["About 1000 people affected", 15, null], ["Affects worship, elderly", 16, null]] }) }).severity.capped).toMatch(/^Capped at 100/);
  });
});

describe("scoreWhy: an older build or a website-made incident (no score_why)", () => {
  const old = { incident_id: "INC-2", severity_score: 63, severity_level: "High", priority_score: 81, sla_hours: 6, sla_basis: "response",
    severity_reasons: "Assault (+45); 1 injured (+8); Weapon involved (+10)",
    priority_reasons: "High violent crime (63); response past the 6 h target; linked to a rain event" };
  const w = scoreWhy(old);
  it("reads the points back from the reasons text", () => {
    expect(w.stored).toBe(false);
    expect(w.severity.items.map((x) => x.points)).toEqual([45, 8, 10]);
    expect(w.severity.items.every((x) => x.basis === null)).toBe(true);
  });
  it("lists the priority reasons without points", () => {
    expect(w.priority.withPoints).toBe(false);
    expect(w.priority.terms.map((t) => t.words)).toEqual(["Severity (High)", "Response past the 6 h target", "Linked to a rain event"]);
    expect(w.priority.terms[0].points).toBe(63);
    expect(w.priority.setLater).toBe(false);
  });
  it("says the deadline source is not recorded", () => {
    expect(w.deadline).toMatchObject({ hours: 6, basis: "response", official: false, source: null, fit: null });
    expect(deadlineWords(w.deadline)).toBe("6 h to first response");
    expect(deadlineSource(w.deadline)).toBe("Source not recorded in this build");
  });
  it("uses the sla_source column when the build has it", () => {
    expect(deadlineSource(scoreWhy({ ...old, sla_source: "District IQ default" }).deadline)).toBe("District IQ default");
  });
  it("survives a broken or empty breakdown", () => {
    expect(scoreWhy({ ...old, score_why: "{not json" }).stored).toBe(false);
    expect(scoreWhy({}).severity.items).toEqual([]);
    expect(scoreWhy({ severity_score: 35 }).severity.level).toBe("Medium");
  });
});

describe("scoreWhyFacts: the sentences the assistants read", () => {
  it("names every point, term and the deadline's source", () => {
    const f = scoreWhyFacts(scoreWhy(stored));
    expect(f).toHaveLength(3);
    expect(f[0]).toBe("Severity 70 (Severe) is the sum of: Public Nuisance +20 [BNS 292: public nuisance, fine up to Rs 1,000]; "
      + "1 fatality +50 [Loss of life: any death makes the event Severe (District IQ rule)].");
    expect(f[1]).toBe("Priority 95 is the sum of: Severity (Severe) 70; Open more than twice past its 2 h deadline +20; Linked to a rain event +5.");
    expect(f[2]).toMatch(/^Deadline 2 h to resolve: TNERC Distribution Standards of Performance Regulations, 2004, regulation 12\(II\) \("Fault in transformer/);
    expect(f[2]).toContain("street lights included");
  });
  it("adds nothing when the build stored no breakdown", () => {
    expect(scoreWhyFacts(scoreWhy({ severity_score: 40, severity_reasons: "Assault (+20)" }))).toEqual([]);
  });
});

describe("helpers", () => {
  it("parses new and old reason items", () => {
    expect(parseReasons("Murder (+70); 1 fatality (Severe); AQI 210")).toEqual([
      { what: "Murder", points: 70 }, { what: "1 fatality", points: null }, { what: "AQI 210", points: null }]);
    expect(parseReasons(null)).toEqual([]);
  });
  it("writes points, days and deadlines", () => {
    expect([pointsText(15), pointsText(-5), pointsText(null), pointsText(4.75)]).toEqual(["+15", "−5", "", "+4.8"]);
    expect(dayWords("2026-11-28")).toBe("28 Nov 2026");
    expect(deadlineWords({ hours: 120, basis: "resolution", official: false, source: null, clause: null, rule: null, url: null, checked: null, fit: null, related: [] })).toBe("5 days to resolve");
    expect(deadlineWords({ hours: null, basis: "resolution", official: false, source: null, clause: null, rule: null, url: null, checked: null, fit: null, related: [] })).toBe("Not set");
  });
  it("level cut-offs are the pipeline's", () => {
    expect([sevOfScore(70), sevOfScore(69.9), sevOfScore(50), sevOfScore(49), sevOfScore(30), sevOfScore(29), sevOfScore(null)]).toEqual(
      ["Severe", "High", "High", "Medium", "Medium", "Low", ""]);
    expect(SEV_CUTS).toEqual({ Severe: 70, High: 50, Medium: 30 });
    expect(SEV_BANDS_TEXT).toBe("Severe 70 or more · High 50 to 69 · Medium 30 to 49 · Low under 30");
  });
});
