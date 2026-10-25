import { describe, expect, it } from "vitest";
import { baseCard, templateCard } from "@/lib/assistant/cards";

const ds = (id: string, rows: Record<string, unknown>[]) => ({ id, title: id, fields: [], rows }) as never;

describe("without a model, a why-question is still answered with the reasons", () => {
  it("says what fell, what went the other way, where, rain, deadlines and what to act on", () => {
    const base = baseCard("en", null, "Last 7 days · Anna Nagar (Zone 8)", "2026-10-13 15:31:00");
    const p = {
      display: "chart", table: "drivers", chart: null,
      kpis: [{ label: "Reported", value: 119, prev: 131 }],
      datasets: [
        ds("drivers", [{ label: "Garbage & solid waste", n: 8, n_prev: 27, delta: -19, rain: 0 }, { label: "Flooding & waterlogging", n: 6, n_prev: 18, delta: -12, rain: 5 },
          { label: "Protests & public nuisance", n: 12, n_prev: 8, delta: 4, rain: 0 }]),
        ds("driver_places", [{ place: "Shenoy Nagar", category: "Flooding & waterlogging", n: 2, n_prev: 7 }]),
        ds("driver_depts", [{ name: "PWD Water Resources", overdue: 9, open: 20 }]),
        ds("driver_top", [{ title: "Waterlogging on Thiruvalluvar 4th Avenue", place: "Madhavaram" }])
      ]
    } as never;
    const c = templateCard(base, p, [], (p as { kpis: never[] }).kpis);
    expect(c.headline).toBe("Incidents fell to 119, mostly garbage & solid waste");
    expect(c.answerMarkdown).toContain("Reported incidents fell to **119** from 131");
    expect(c.answerMarkdown).toContain("- **Mostly from:** Garbage & solid waste (27 → 8), Flooding & waterlogging (18 → 6)");
    expect(c.answerMarkdown).toContain("- **Going the other way:** Protests & public nuisance (8 → 12)");
    expect(c.answerMarkdown).toContain("- **Where:** Shenoy Nagar (flooding & waterlogging, 7 → 2)");
    expect(c.answerMarkdown).toContain("- **Rain:** 5 of the 119 were linked to rain");
    expect(c.answerMarkdown).toContain("- **Past deadline:** PWD Water Resources (9)");
    expect(c.answerMarkdown).toContain("**Act first on:** Waterlogging on Thiruvalluvar 4th Avenue at Madhavaram.");
  });
});
