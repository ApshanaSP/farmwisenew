/**
 * An incident's effective status: the pipeline's status with the Collector's latest decision laid on top. One rule for
 * the row lists (overlay in intel.ts) and the SQL behind the KPI tiles and list filters, so a resolved incident leaves
 * "Ongoing" on the tile at the same moment it shows Resolved in the list. Pure (no database), so it is unit-tested.
 *
 * The latest decision with an effect decides: resolve, verify ("Verify and close") and reject close the incident, reopen
 * opens it. A note and an escalate have no effect and are skipped, so an escalate after a resolve leaves it closed, as
 * the officer's stage and the citizen's tracker already show (RC-26).
 */

/** The decisions that move the status; every reader asks for the latest of these, never the latest of all. */
export const DECISION_EFFECT = {
  resolve: { open: 0, status: "Resolved" },
  verify: { open: 0, status: "Resolved" },
  reject: { open: 0, status: "Rejected" },
  reopen: { open: 1, status: "Open" }
} as const;
type Effect = (typeof DECISION_EFFECT)[keyof typeof DECISION_EFFECT];

/** The decisions with an effect, as a quoted SQL list. */
export const EFFECT_KEYS = Object.keys(DECISION_EFFECT).map((k) => `'${k}'`).join(", ");

/** What the latest decision does to an incident's status, or null when it leaves it alone. */
export function decisionEffect(decision: unknown): Effect | null {
  return typeof decision === "string" && Object.prototype.hasOwnProperty.call(DECISION_EFFECT, decision)
    ? DECISION_EFFECT[decision as keyof typeof DECISION_EFFECT]
    : null;
}

/** Does this decision leave the incident checked (verified = 1)? A resolve and a verify do. */
export const VERIFYING = ["resolve", "verify"] as const;
export function decisionVerifies(decision: unknown): boolean {
  return typeof decision === "string" && (VERIFYING as readonly string[]).includes(decision);
}

/** Effective open flag and status for one row, from its pipeline values and its latest decision. */
export function effectiveStatus(isOpen: unknown, status: unknown, latestDecision: unknown): { open: number; status: string } {
  const e = decisionEffect(latestDecision);
  return e ? { open: e.open, status: e.status } : { open: Number(isOpen) === 1 ? 1 : 0, status: String(status ?? "") };
}

/**
 * SQL over `incidents <alias>` (default i), given the decisions table's qualified name: the latest decision (not a note), the effective
 * open flag (0/1) and the effective status, built from DECISION_EFFECT so the SQL and effectiveStatus cannot drift.
 */
export function effectiveSql(decisionsTable: string, alias = "i") {
  const i = alias; // the incidents table's alias in the caller's query
  const latest = `(SELECT d.decision FROM ${decisionsTable} d WHERE d.incident_id = ${i}.incident_id AND d.decision IN (${EFFECT_KEYS})
    ORDER BY d.decision_id DESC LIMIT 1)`;
  const latestAt = latest.replace("SELECT d.decision FROM", "SELECT d.decided_at FROM");
  const closing = Object.entries(DECISION_EFFECT).filter(([, e]) => e.open === 0).map(([k]) => `'${k}'`).join(", ");
  const cases = (pick: (e: Effect) => string) =>
    Object.entries(DECISION_EFFECT).map(([k, e]) => `WHEN '${k}' THEN ${pick(e)}`).join(" ");
  return {
    latest,
    /** the pipeline's own flag, named: only for the arithmetic of a delta (a hotspot's count moved by what decisions changed) */
    pipelineOpen: `${i}.is_open`,
    open: `(CASE ${latest} ${cases((e) => String(e.open))} ELSE ${i}.is_open END)`,
    status: `(CASE ${latest} ${cases((e) => `'${e.status}'`)} ELSE ${i}.status_std END)`,
    /** when it closed: the Collector's closing decision's time (nothing once reopened), else the pipeline's closed_at */
    closedAt: `(CASE WHEN ${latest} IN (${closing}) THEN ${latestAt} WHEN ${latest} = 'reopen' THEN NULL ELSE ${i}.closed_at END)`,
    /** the effective verified flag (0/1): a resolve and a verify leave it checked */
    verified: `(CASE WHEN ${latest} IN (${VERIFYING.map((k) => `'${k}'`).join(", ")}) THEN 1 ELSE ${i}.verified END)`
  };
}
