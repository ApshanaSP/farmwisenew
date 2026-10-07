import { describe, expect, it } from "vitest";
import { clusterNews, elsewhere, relevantNews } from "./newsrel";

const doc = (title: string, extra: Record<string, unknown> = {}) => ({ title, lang: "en", report_type: "announcement", ...extra });

describe("which news the Collector sees", () => {
  it("leaves out business, real estate, courses and far-away news", () => {
    for (const t of ["Casagrand launches new project in Chennai", "Efectis launches India subsidiary, opens fire testing facility in Chennai",
      "Capacit'e Infraprojects secures ₹368.98 crore project with Chennai Metro Rail", "Mettur storage down, delta has barely 10 days of irrigation water",
      "Tamil Nadu police find a dedicated 'school' for ATM burglars in Haryana"])
      expect(relevantNews(doc(t), t), t).toBe(false);
  });
  it("keeps civic news and events, even with an off-topic word", () => {
    for (const t of ["PM Modi to inaugurate Metro rail project in Chennai on October 11", "Actor's car crash in Chennai: two injured",
      "Chennai Corporation starts imposing fine on owners of abandoned dogs", "DRI seizes Chinese-origin fireworks worth over Rs 12 crore at Chennai Port"])
      expect(relevantNews(doc(t), t), t).toBe(true);
  });
  it("a report from another district stays out even when linked to an incident", () => {
    expect(elsewhere("Chennai-Madurai bus overturns near Ulundurpet, 20 injured")).toBe(true);
    expect(relevantNews(doc("Tiruttani man hacked to death outside home", { linked_incident_id: "INC-1" }), "Tiruttani man hacked to death outside home")).toBe(false);
    expect(elsewhere("Hyderabad DRI seizes fireworks at Chennai Port")).toBe(false);
  });
});

describe("grouping the same news", () => {
  const g = (key: string, titles: string[], incident: string | null = null) =>
    ({ key, docs: titles.map((title) => ({ title, lang: "en" })), english: titles[0], ms: Date.parse("2026-10-05T10:00:00+05:30"), incident });
  it("groups one event's reports from different outlets and incidents, and keeps different events apart", () => {
    const out = clusterNews([
      g("a", ["Nurses jump into protest in Chennai demanding job regularisation"], "INC-1"),
      g("b", ["Nurses' protest in Chennai: hunger strike for job regularisation at Egmore"], "INC-2"),
      g("c", ["Chennai Corporation starts imposing fine on owners of abandoned dogs"]),
      g("d", ["Power outage in various areas of Chennai tomorrow"]),
      g("e", ["Chennai Power Cut On October 6: Over 100 Locations To Be Hit"])
    ]);
    const keys = out.map((c) => c.map((x) => x.key).sort().join("")).sort();
    expect(keys).toEqual(["ab", "c", "de"]);
  });
});

describe("news whose headline names no place", () => {
  it("stays out when the article places it in another district", () => {
    const d = { title: "Rithanya suicide case: HC orders return of dowry to her father", ai_orgs: "Madras High Court|Tirupur Police", ai_place: null };
    expect(relevantNews(d, d.title)).toBe(false);
    expect(relevantNews({ ...d, ai_orgs: "Greater Chennai Police" }, d.title)).toBe(true);
  });
});
