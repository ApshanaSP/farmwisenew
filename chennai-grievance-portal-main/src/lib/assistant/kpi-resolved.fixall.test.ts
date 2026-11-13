// reviewerE-04 (on hunt2-ops-10, a204408b): the Resolved tile and the PDF read PERIODS[period].resolved ("Resolved, last 7 days"), as the
// count is closings since now minus the window, not this calendar week. Ask District IQ's overview_kpis tool, "the console's four tiles",
// still named the same count "Resolved this week" ("Resolved this day" for Daily), so its facts read "Resolved this week, last 7 days".
import { describe, expect, it, vi } from "vitest";

const NOW = "2026-11-13 12:00:00";
vi.mock("@/lib/collector/intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/collector/intel")>()),
  asOf: async () => NOW,
  overview: async () => ({ now: NOW, kpi: { cur: { severe: 1, complaints: 2, ongoing: 3, resolved: 4 }, prev: { severe: 0, complaints: 1, ongoing: 2, resolved: 5 }, series: {} } })
}));
vi.mock("@/lib/assistant/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/assistant/queries")>()),
  syntheticShare: async () => ({ n: 10, syn: 0 })
}));

const { TOOLS } = await import("@/lib/assistant/tools");
const { ScopeSchema } = await import("@/lib/assistant/scope");
const { PERIODS } = await import("@/lib/collector/intel");

describe("reviewerE-04: Ask's overview_kpis names the Resolved count as the tile does", () => {
  for (const period of ["daily", "weekly", "monthly", "quarterly"] as const) {
    it(`${period}: the rolling window's words, never a calendar "this ${PERIODS[period].unit.toLowerCase()}"`, async () => {
      const t = TOOLS.find((x) => x.name === "overview_kpis")!;
      const r = await t.run({ scope: ScopeSchema.parse({ period }) } as never);
      const resolved = r.facts.find((f) => f.id === "kpi.resolved")!;
      expect(resolved.label).toBe(PERIODS[period].resolved);
      expect(resolved.value).toBe(4);
      expect((r.data as { labels: Record<string, string> }).labels.resolved).toBe(PERIODS[period].resolved);
      expect(r.facts.map((f) => f.label).join(" | ")).not.toMatch(/this (day|week|month|quarter)/i);
      expect(r.facts.find((f) => f.id === "kpi.ongoing")!.label).toBe(`Ongoing incidents, ${PERIODS[period].label.toLowerCase()}`);
    });
  }
});
