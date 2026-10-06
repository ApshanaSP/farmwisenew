/**
 * The Collector's brief over a dataset's insights (insights.ts): a verdict, the situation in three lines, the insights
 * that matter (each labelled, with why it matters and the step to take) and questions to put to the department.
 * The AI writes it (ai.ts briefAI); this is the rules' version, used when no model answers or its numbers do not check.
 */
import { openPhrase, type Brief, type BriefItem, type Insight, type InsightLabel, type Priority, type Spec } from "@/lib/studio/types";
import { shortlist } from "@/lib/studio/insights";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function priorityOf(x: Insight): Priority {
  return x.tone === "sev" ? "act" : x.tone === "high" ? "watch" : "note";
}

const WHY: Record<InsightLabel, (s: Spec) => string> = {
  Backlog: (s) => `Every open ${s.entity} is a citizen or a service still waiting; the share open is the clearest measure of delivery.`,
  Delay: () => "Long waits are where complaints escalate, to the press, to the courts, to the Collector's grievance day.",
  Turnaround: () => "Time to close is the service citizens feel; a slow unit sets the district's reputation.",
  "Service gap": () => "One unit far behind the rest points to a capacity or supervision problem, not to demand alone.",
  "Bright spot": () => "What works here can be copied: the method, the staffing or the contractor.",
  Hotspot: () => "Resources follow averages; a zone carrying far more than its share needs targeted staff and review.",
  Rising: () => "A rise caught early can be met before it becomes a backlog.",
  Falling: () => "A fall is either real progress or under-reporting; worth confirming which.",
  "Local pattern": () => "A problem concentrated in one place usually has a local cause that a site visit can find.",
  Concentration: () => "Fixing the few largest categories moves most of the total.",
  Magnitude: () => "Where most of the measure sits is where scrutiny pays off most.",
  Anomaly: () => "One wrong entry can distort every total built on it.",
  Linked: () => "Two independent sources pointing at the same zones make the signal much harder to dismiss.",
  Growth: () => "The latest period sets the baseline for planning and budgets.",
  Pattern: () => "Staff rosters and inspections can follow the rhythm of demand.",
  "Data gap": () => "What the data leaves out cannot be monitored; fixing entry at source improves every figure."
};

const ACTION: Record<InsightLabel, (x: Insight, s: Spec) => string | null> = {
  Backlog: (x, s) => `Ask ${x.owner ?? "the department"} for a dated plan to clear the ${s.entityPlural} ${openPhrase(s).adj}, oldest first.`,
  Delay: (x) => `Ask ${x.owner ?? "the department"} to review every item waiting over 30 days and report a closing date for each.`,
  Turnaround: (x) => `Ask ${x.owner ?? "the department"} why closing takes longest here and what would bring it to the district median.`,
  "Service gap": (x) => `Review this unit with ${x.owner ?? "the officer in charge"}: staffing, pending items and the reasons given.`,
  "Bright spot": (x) => `Ask ${x.owner ?? "the department"} what this unit does differently, and share it with the others.`,
  Hotspot: () => "Hold a focused review with the zonal officer and set a weekly target for this zone.",
  Rising: (x) => `Ask ${x.owner ?? "the department"} what is driving the rise and whether more crews are needed now.`,
  Falling: () => "Confirm the fall is real (not missing entries) before easing attention.",
  "Local pattern": () => "Order a site inspection in this zone to find the local cause.",
  Concentration: (x) => `Ask ${x.owner ?? "the department"} for a plan aimed at the largest categories first.`,
  Magnitude: () => "Scrutinise the largest unit's figures and the work behind them.",
  Anomaly: () => "Have the department verify these entries before the totals are used.",
  Linked: () => "Treat the shared hotspot zones as priority areas in the next review.",
  Growth: () => "Use the latest period, not the long-run average, for planning.",
  Pattern: () => null,
  "Data gap": () => "Ask the department to record the location and date on every entry."
};

/** A brief from the insights alone (the strongest first, at most two of a kind). */
export function rulesBrief(insights: Insight[], spec: Spec): Brief {
  const strong = insights.filter((x) => x.score >= 30);
  const picked = shortlist(strong.length >= 3 ? strong : insights, 6);
  const items: BriefItem[] = picked.map((x) => ({ ...x, headline: x.title, why: WHY[x.label](spec), action: ACTION[x.label](x, spec), priority: priorityOf(x), by: "rules" }));
  const top = picked[0];
  const qs: string[] = [];
  const has = (l: InsightLabel) => picked.find((x) => x.label === l);
  if (has("Backlog") || has("Delay")) qs.push(`What is the plan, with dates, to clear the ${spec.entityPlural} ${openPhrase(spec).adj}?`);
  const gap = has("Service gap") ?? has("Hotspot");
  if (gap) qs.push(`Why is ${gap.title.split(/ (lags|carries)/)[0]} behind the rest, and what extra support is needed?`);
  if (has("Rising")) qs.push("What is behind the recent rise, and is it expected to continue?");
  if (has("Data gap") || has("Anomaly")) qs.push("Can the entries without a place or date, and the unusual values, be corrected at source?");
  if (qs.length < 3) qs.push(`Which ${spec.entityPlural} need the Collector's direct intervention this week?`);
  return {
    verdict: top ? cap(top.title) : `${cap(spec.entityPlural)} at a glance`,
    summary: picked.slice(0, 3).map((x) => x.text),
    items, questions: qs.slice(0, 3), considered: insights.length, by: "rules", model: null, dropped: 0, at: new Date().toISOString()
  };
}
