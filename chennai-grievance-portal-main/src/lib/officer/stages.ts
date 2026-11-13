/**
 * The officer workflow: Received -> In action -> Sent to Collector -> Verified for a severe grievance; any other is
 * closed by the department itself: Received -> In action -> Verified (the `close` step).
 * "In action" covers a grievance the officer approved and one where work has started (the
 * pipeline's Assigned and In progress, and the `action` step recorded before the two were merged).
 * Shared by the API (which enforces the transitions) and the console (labels, chips, buttons).
 */

export type Stage = "new" | "approved" | "action" | "sent" | "verified" | "closed";
export type Tab = "new" | "action" | "sent" | "verified";
/** `action` is no longer offered but stays readable in officer_steps written before */
export type OfficerStep = "approve" | "action" | "send" | "close";

export const TABS: Tab[] = ["new", "action", "sent", "verified"];
export const TAB_STAGES: Record<Tab, Stage[]> = { new: ["new"], action: ["approved", "action"], sent: ["sent"], verified: ["verified"] };
export const TAB_LABEL: Record<Tab, string> = { new: "New", action: "In action", sent: "Sent to Collector", verified: "Verified" };

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New", approved: "In action", action: "In action", sent: "Sent to Collector", verified: "Verified", closed: "Closed"
};
/** shorter labels for the grievances table, where the tab already says "Sent to Collector" */
export const STAGE_SHORT: Record<Stage, string> = { ...STAGE_LABEL, sent: "Sent" };
/** status chip classes from the Collector console's stylesheet (st-await is added by the officer stylesheet) */
export const STAGE_CLASS: Record<Stage, string> = {
  new: "st-open", approved: "st-progress", action: "st-progress", sent: "st-await", verified: "st-resolved", closed: "st-resolved"
};

export const STEP_LABELS = ["Received", "In action", "Sent to Collector", "Verified"] as const;
export const STAGE_INDEX: Record<Stage, number> = { new: 0, approved: 1, action: 1, sent: 2, verified: 3, closed: 3 };

/**
 * The step bar for one grievance: the path it is on and how far along it is (officer-day-26). A severe grievance, or one that was
 * sent, goes Received -> In action -> Sent to Collector -> Verified. Any other is closed by the department itself and never passes
 * "Sent to Collector": Received -> In action -> Closed by your department (or, when the Collector decided it first, what the
 * Collector did). `closedByDept`: the last officer step was the department's own close.
 */
export function stepsOf(stage: Stage, severe: boolean, closedByDept = false, hist?: StepHistory): { labels: readonly string[]; at: number } {
  // The stage alone cannot say whether the case was sent, or whether the department acted on it at all: a severe case the Collector
  // rejected ('closed') was drawn with "Verified" ticked, one rejected straight from New with "In action" ticked, and a non-severe one
  // sent before the rule lost its "Sent to Collector" step (reviewerB-05). The drawer passes the case's history; without it, both are
  // read from the stage as before.
  const decided = stage === "verified" || stage === "closed"; // the Collector (or the pipeline) closed it
  const sent = hist?.sent ?? (stage === "sent" || (severe && stage === "verified"));
  const acted = hist?.acted ?? stage !== "new";
  if (closedByDept) return { labels: ["Received", "In action", "Closed by your department"], at: 2 };
  if (sent || (severe && !decided)) {
    return { labels: [...STEP_LABELS.slice(0, 3), stage === "closed" ? "Closed" : "Verified"], at: STAGE_INDEX[stage] ?? 0 };
  }
  if (!decided) return { labels: ["Received", "In action", "Closed by your department"], at: stage === "new" ? 0 : 1 };
  // closed before the department sent it: what the department did, then how it was closed
  const end = stage === "verified" ? "Verified by Collector" : "Closed";
  const labels = acted ? ["Received", "In action", end] : ["Received", end];
  return { labels, at: labels.length - 1 };
}

/** What a case's history says that its stage cannot: it was sent to the Collector; the department acted on it at all. */
export type StepHistory = { sent: boolean; acted: boolean };

/** The department's own steps, as grievanceDetail (lib/officer/data.ts) labels them in its timeline. */
export const DEPT_STEP_LABELS = { approve: "Approved by department", action: "Work started", send: "Sent to Collector", close: "Closed by department" } as const;

/** The history stepsOf needs, read from a grievance detail's timeline. */
export function historyOf(timeline: readonly { label: string }[]): StepHistory {
  const seen = new Set(timeline.map((t) => t.label));
  return { sent: seen.has(DEPT_STEP_LABELS.send), acted: Object.values(DEPT_STEP_LABELS).some((l) => seen.has(l)) };
}

/** The stages each recorded step starts from (the same table as recordStep's in lib/officer/data.ts, which checks again under its lock). */
export const STEP_FROM: Record<"approve" | "send" | "close", Stage[]> = { approve: ["new"], send: ["approved", "action"], close: ["approved", "action", "sent"] };

/**
 * Why this step cannot be taken on a grievance at this stage and severity, or null if it can. The report route asks this before it asks
 * for the password, so nobody types a password for a step that would be refused anyway (officer-day-16). Same words as recordStep's.
 */
export function stepRefusal(step: "approve" | "send" | "close", stage: string, severity: string | null | undefined): string | null {
  if (!(STEP_FROM[step] as string[]).includes(stage)) {
    return `This grievance is already at “${STAGE_LABEL[stage as Stage] ?? stage}”. Refresh to see its latest stage.`;
  }
  const severe = severity === "Severe";
  if (step === "send" && !severe) return "Only severe grievances go to the Collector. Close this one as done yourself.";
  if (step === "close" && severe) return "A severe grievance is verified by the Collector: send it with your completion report.";
  return null;
}

/** The one step an officer can take from each stage, for a severe grievance. Use nextStep() for any grievance. */
export const NEXT_STEP: Partial<Record<Stage, "approve" | "send">> = { new: "approve", approved: "send", action: "send" };

/**
 * The one step an officer can take on this grievance: approve a new one; then send a severe one to the Collector, and close any
 * other (officer-day-26: the API said "send" for every case in action). A non-severe grievance at "sent" (sent before the rule)
 * is closed by the department too, as the drawer offers. Null when there is nothing left for the officer to do.
 */
export function nextStep(stage: string, severity: string | null | undefined): "approve" | "send" | "close" | null {
  if (stage === "new") return "approve";
  const severe = severity === "Severe";
  if (stage === "approved" || stage === "action") return severe ? "send" : "close";
  if (stage === "sent" && !severe) return "close";
  return null;
}

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(STAGE_LABEL, v);
}
export function parseTab(v: unknown): Tab {
  return typeof v === "string" && (TABS as string[]).includes(v) ? (v as Tab) : "new";
}
