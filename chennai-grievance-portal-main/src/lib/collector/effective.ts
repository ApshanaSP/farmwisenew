/**
 * An incident's effective status: the pipeline's status with the Collector's latest decision laid on top. One rule for
 * the row lists (overlay in intel.ts) and the SQL behind the KPI tiles and list filters, so a resolved incident leaves
 * "Ongoing" on the tile at the same moment it shows Resolved in the list. Pure (no database), so it is unit-tested.
 *
 * The latest decision other than a note decides: resolve and reject close the incident, reopen opens it; verify and
 * escalate leave the status as it is (a verify after a resolve therefore shows the pipeline's status, as the list does).
 */

export const DECISION_EFFECT = {
  resolve: { open: 0, status: "Resolved" },
  reject: { open: 0, status: "Rejected" },
  reopen: { open: 1, status: "Open" }
} as const;
type Effect = (typeof DECISION_EFFECT)[keyof typeof DECISION_EFFECT];

/** What the latest decision does to an incident's status, or null when it leaves it alone. */
export function decisionEffect(decision: unknown): Effect | null {
  return typeof decision === "string" && Object.prototype.hasOwnProperty.call(DECISION_EFFECT, decision)
    ? DECISION_EFFECT[decision as keyof typeof DECISION_EFFECT]
    : null;
}

/** Effective open flag and status for one row, from its pipeline values and its latest decision. */
export function effectiveStatus(isOpen: unknown, status: unknown, latestDecision: unknown): { open: number; status: string } {
  const e = decisionEffect(latestDecision);
  return e ? { open: e.open, status: e.status } : { open: Number(isOpen) === 1 ? 1 : 0, status: String(status ?? "") };
}

/**
 * SQL over `incidents i`, given the decisions table's qualified name: the latest decision (not a note), the effective
 * open flag (0/1) and the effective status, built from DECISION_EFFECT so the SQL and effectiveStatus cannot drift.
 */
export function effectiveSql(decisionsTable: string) {
  const latest = `(SELECT d.decision FROM ${decisionsTable} d WHERE d.incident_id = i.incident_id AND d.decision <> 'note'
    ORDER BY d.decision_id DESC LIMIT 1)`;
  const cases = (pick: (e: Effect) => string) =>
    Object.entries(DECISION_EFFECT).map(([k, e]) => `WHEN '${k}' THEN ${pick(e)}`).join(" ");
  return {
    latest,
    open: `(CASE ${latest} ${cases((e) => String(e.open))} ELSE i.is_open END)`,
    status: `(CASE ${latest} ${cases((e) => `'${e.status}'`)} ELSE i.status_std END)`
  };
}
