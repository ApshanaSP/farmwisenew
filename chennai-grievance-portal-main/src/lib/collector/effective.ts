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

/**
 * What the Collector is asked to confirm, in words that say what the decision does (DECISION_EFFECT): a reject closes the case as
 * Rejected for good (the officer's queue drops it, the citizen is told Rejected), so it is never worded as a return to the department
 * (hunt2-ops-02: "Return to the department 1 case" closed it). Only a reopen sends work back.
 */
export const DECISION_WORDS = {
  verify: "Verify and close",
  resolve: "Mark resolved and close",
  reject: "Reject and close (the department can no longer act on it)",
  escalate: "Escalate",
  reopen: "Send back to the department",
  note: "Add a note"
} as const;

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

/**
 * What a department officer's step says about a case that is still open, in the Collector's statuses (hunt2-ops-09): an approve was
 * recorded only in officer_steps, so the Collector's status chip, list filter and case page kept "Under review" while the officer showed
 * In action and the citizen was told it was approved. The close is not here: it is stored as a resolve decision too, which closes the case.
 */
export const STEP_STATUS = { approve: "Assigned", action: "In progress", send: "Awaiting verification" } as const;

/**
 * Effective open flag and status for one row, from its pipeline values, its latest decision with an effect, and `laterStep`: the
 * department's latest officer step when it came after that decision (in the same second the decision wins, as the officer's stage reads
 * it: officer/data.ts DECIDED_AFTER). A step moves the status of an open case only; it never opens or closes one.
 */
export function effectiveStatus(isOpen: unknown, status: unknown, latestDecision: unknown, laterStep: unknown = null): { open: number; status: string } {
  const e = decisionEffect(latestDecision);
  const base = e ? { open: e.open as number, status: e.status as string } : { open: Number(isOpen) === 1 ? 1 : 0, status: String(status ?? "") };
  const s = typeof laterStep === "string" && Object.prototype.hasOwnProperty.call(STEP_STATUS, laterStep) ? STEP_STATUS[laterStep as keyof typeof STEP_STATUS] : null;
  return s && base.open === 1 ? { open: 1, status: s } : base;
}

declare global {
  // eslint-disable-next-line no-var
  var __diqOfficerSteps: boolean | undefined;
  /** set by the server (instrumentation-node.ts): looks again whether the table is there, at most once a minute */
  // eslint-disable-next-line no-var
  var __diqOfficerStepsRecheck: (() => void) | undefined;
}
/**
 * Whether the officer console's step table (district_intel_ops.officer_steps) is there to read: on MySQL it comes from
 * `npm run setup:officer`, and an AWS store has it only when the MySQL it was migrated from did. The server checks information_schema
 * (instrumentation-node.ts) before the first request and again at most every 60 s while the status is read (as intel.ts officerOpsReady()
 * does), so a check that failed at start (MySQL still starting) or a setup:officer run later is picked up without a restart (reviewerG-02),
 * and an AWS store without the table reads the status as before, never "no such table" (reviewerG-03). Off until a check says it is there:
 * the Collector's status then reads no officer step, exactly as before hunt2-ops-09. A script or a test store leaves it off unless set.
 */
export function officerStepsOn(): boolean {
  globalThis.__diqOfficerStepsRecheck?.();
  return globalThis.__diqOfficerSteps ?? false;
}
export function setOfficerSteps(on: boolean): void {
  globalThis.__diqOfficerSteps = on;
}

/**
 * SQL over `incidents <alias>` (default i), given the decisions table's qualified name: the latest decision (not a note), the effective
 * open flag (0/1) and the effective status, built from DECISION_EFFECT so the SQL and effectiveStatus cannot drift. `stepsTable`: the
 * officer steps table, null for none; left out, it is the decisions table's neighbour in the ops database whenever it is there
 * (officerStepsOn), decided each time `status` or `laterStep` is read, never once when a module builds its SQL at load (reviewerG-02).
 */
export function effectiveSql(decisionsTable: string, alias = "i", stepsTable?: string | null) {
  const steps = () => (stepsTable !== undefined ? stepsTable : officerStepsOn() ? decisionsTable.replace(/collector_decisions/, "officer_steps") : null);
  const i = alias; // the incidents table's alias in the caller's query
  const latest = `(SELECT d.decision FROM ${decisionsTable} d WHERE d.incident_id = ${i}.incident_id AND d.decision IN (${EFFECT_KEYS})
    ORDER BY d.decision_id DESC LIMIT 1)`;
  const closing = Object.entries(DECISION_EFFECT).filter(([, e]) => e.open === 0).map(([k]) => `'${k}'`).join(", ");
  // hunt2-ops-07: the time a case closed is when it went from open to closed, never the latest closing decision. A resolve or a verify
  // on a case that is already closed (by the pipeline, or by an earlier decision) is still recorded but leaves its closed time alone;
  // only a reopen starts a new closing. So "resolved in the window" counts a case's first closing after it was last opened.
  const reopenedAt = `(SELECT MAX(r.decision_id) FROM ${decisionsTable} r WHERE r.incident_id = ${i}.incident_id AND r.decision = 'reopen')`;
  const firstClosingAfter = (id: string) => `(SELECT c.decided_at FROM ${decisionsTable} c WHERE c.incident_id = ${i}.incident_id
    AND c.decision IN (${closing}) AND c.decision_id > ${id} ORDER BY c.decision_id ASC LIMIT 1)`;
  // A case the pipeline closed with no time (Lapsed: a news-only item about 14 days old) keeps the first closing decision's time: it was
  // never counted as resolved, so this counts it once, and a resolve made while it was open is not erased when it lapses later (P7 review X1).
  const closedByDecisions = `(CASE WHEN ${reopenedAt} IS NOT NULL THEN ${firstClosingAfter(reopenedAt)}
    WHEN ${i}.is_open = 1 THEN ${firstClosingAfter("0")}
    ELSE COALESCE(LEAST(${i}.closed_at, ${firstClosingAfter("0")}), ${firstClosingAfter("0")}) END)`;
  const cases = (pick: (e: Effect) => string) =>
    Object.entries(DECISION_EFFECT).map(([k, e]) => `WHEN '${k}' THEN ${pick(e)}`).join(" ");
  const open = `(CASE ${latest} ${cases((e) => String(e.open))} ELSE ${i}.is_open END)`;
  const status = `(CASE ${latest} ${cases((e) => `'${e.status}'`)} ELSE ${i}.status_std END)`;
  // the department's latest step (its lead department's, as the officer's queue reads them), when no decision with an effect was made at
  // or after it: in the same second the decision comes after the step (officer/data.ts DECIDED_AFTER), so the decision decides
  const laterStepIn = (t: string | null) => t ? `(SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ${decisionsTable} sd WHERE sd.incident_id = s.incident_id
      AND sd.decision IN (${EFFECT_KEYS}) AND sd.decided_at >= s.at) THEN s.step END
    FROM ${t} s WHERE s.incident_id = ${i}.incident_id AND s.dept_code = ${i}.lead_dept ORDER BY s.step_id DESC LIMIT 1)` : "NULL";
  const stepCases = Object.entries(STEP_STATUS).map(([k, v]) => `WHEN '${k}' THEN '${v}'`).join(" ");
  return {
    latest,
    /** the pipeline's own flag, named: only for the arithmetic of a delta (a hotspot's count moved by what decisions changed) */
    pipelineOpen: `${i}.is_open`,
    open,
    /** the status: the latest decision with an effect on the pipeline's, then, on an open case, a later officer step's (STEP_STATUS) */
    get status(): string {
      const t = steps();
      return t ? `(CASE WHEN ${open} = 1 THEN (CASE ${laterStepIn(t)} ${stepCases} ELSE ${status} END) ELSE ${status} END)` : status;
    },
    /** the department's latest officer step when it came after the latest decision with an effect (NULL without one, or without the table) */
    get laterStep(): string { return laterStepIn(steps()); },
    /**
     * when it closed: the first closing decision since it was last open (after the latest reopen; or, never reopened, the first one while
     * the pipeline has it open, else the earlier of the pipeline's closed_at and that decision, or that decision when the pipeline has
     * no closed time); nothing once reopened; else the
     * pipeline's closed_at. A closing decision on a closed case is a no-op for this time (hunt2-ops-07).
     */
    closedAt: `(CASE WHEN ${latest} IN (${closing}) THEN ${closedByDecisions} WHEN ${latest} = 'reopen' THEN NULL ELSE ${i}.closed_at END)`,
    /** the effective verified flag (0/1): a resolve and a verify leave it checked */
    verified: `(CASE WHEN ${latest} IN (${VERIFYING.map((k) => `'${k}'`).join(", ")}) THEN 1 ELSE ${i}.verified END)`
  };
}
