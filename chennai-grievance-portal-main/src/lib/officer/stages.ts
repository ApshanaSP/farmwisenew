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

/** The one step an officer can take from each stage. */
export const NEXT_STEP: Partial<Record<Stage, "approve" | "send">> = { new: "approve", approved: "send", action: "send" };

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(STAGE_LABEL, v);
}
export function parseTab(v: unknown): Tab {
  return typeof v === "string" && (TABS as string[]).includes(v) ? (v as Tab) : "new";
}
