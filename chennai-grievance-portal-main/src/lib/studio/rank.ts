/**
 * Which insights deserve the Collector's attention. Generating insights is easy; ranking them by usefulness is the
 * hard part (Tang et al.), and significance alone favours niche facts. So usefulness is a product of five parts, each
 * defined here and tested:
 *
 *   impact         how much of the whole it concerns, and how strongly (the rules' score, 0..1)
 *   significance   how much evidence stands behind it: the sample size (n), log-scaled; under 10 it hardly counts
 *   actionability  whether someone can act on it: a backlog, a delay, a unit behind target or outside its peers can
 *                  be acted on; a count of things (8 metro stations, 152 incidents in hotspot zones) or a pattern can
 *                  only be known
 *   novelty        new since the last brief (1) or said before (0.5)
 *   freshness      how recent the data is (1 within a week, falling to 0.4 after three months)
 *
 * Bands: "act" (Needs action) only when usefulness ≥ ACT and the insight is actionable; "watch" (Worth knowing) above
 * KNOW; the rest "hidden" (kept, not shown in the brief).
 */
import type { Insight, InsightLabel } from "@/lib/studio/types";
import { daysBetween, todayIST } from "@/lib/studio/values";

export const RANK = { act: 0.35, know: 0.12 } as const;
export type Band = "act" | "watch" | "hidden";

/** How far someone can act on an insight of this kind (1: a decision; 0.4: worth knowing only). */
export const ACTIONABLE: Record<InsightLabel, number> = {
  Backlog: 1, Delay: 1, Turnaround: 0.9, "Service gap": 1, "Target gap": 1, "Outlier peer": 1, Rising: 0.9, "Unusual change": 0.9, Freshness: 0.8, Anomaly: 0.8, Drivers: 0.8,
  Hotspot: 0.6, "Local pattern": 0.6, Capacity: 0.8, Change: 0.6, "Data gap": 0.5, Falling: 0.5, "Change point": 0.5, "Bright spot": 0.4,
  Concentration: 0.4, Magnitude: 0.4, Ranking: 0.4, Linked: 0.4, Growth: 0.4, Pattern: 0.3, Seasonality: 0.4, Correlation: 0.3, "Steady share": 0.3
};

export interface Rank { usefulness: number; impact: number; significance: number; actionability: number; novelty: number; freshness: number; band: Band }

/** Evidence weight from the sample size: 0 at n=1, 0.5 at n=10, 1 at n=100 and above. */
export const significanceOf = (n: number) => Math.max(0, Math.min(1, Math.log10(Math.max(1, n)) / 2));
/** Data age to a weight: within 7 days 1, 30 days 0.8, 90 days 0.6, older 0.4. */
export const freshnessOf = (age: number | null) => (age == null ? 0.7 : age <= 7 ? 1 : age <= 30 ? 0.8 : age <= 90 ? 0.6 : 0.4);

export function rankOne(x: Insight & { n?: number }, ctx: { rows: number; to: string | null; today?: string; seen?: Set<string>; things?: boolean; boost?: (l: InsightLabel) => number }): Rank {
  // the family's own questions count more (family.ts familyBoost)
  const impact = Math.max(0, Math.min(1, (x.score / 80) * (ctx.boost?.(x.label) ?? 1)));
  const significance = significanceOf(x.n ?? ctx.rows);
  // a zone count of things (no status, nothing waiting) is a note, never an action (R-19)
  let actionability = ACTIONABLE[x.label] ?? 0.4;
  if (ctx.things && (x.label === "Hotspot" || x.label === "Concentration" || x.label === "Ranking" || x.label === "Magnitude" || x.label === "Linked")) actionability = Math.min(actionability, 0.3);
  const novelty = ctx.seen?.has(`${x.label}|${x.title}`) ? 0.5 : 1;
  const age = ctx.to ? daysBetween(ctx.to.slice(0, 10), ctx.today ?? todayIST()) : null;
  const freshness = x.label === "Freshness" ? 1 : freshnessOf(age);
  const usefulness = Math.round(impact * significance * actionability * novelty * freshness * 1000) / 1000;
  const band: Band = usefulness >= RANK.act && actionability >= 0.8 ? "act" : usefulness >= RANK.know ? "watch" : "hidden";
  return { usefulness, impact, significance, actionability, novelty, freshness, band };
}

/** Every insight ranked, the most useful first. */
export function rankInsights<T extends Insight & { n?: number }>(xs: T[], ctx: { rows: number; to: string | null; today?: string; seen?: Set<string>; things?: boolean; boost?: (l: InsightLabel) => number }): (T & { rank: Rank })[] {
  return xs.map((x) => ({ ...x, rank: rankOne(x, ctx) })).sort((a, b) => b.rank.usefulness - a.rank.usefulness);
}
