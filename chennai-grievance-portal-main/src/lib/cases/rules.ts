/**
 * The case lifecycle's rules, in one place for the server and the screens (pure: no database).
 *
 * The owner's rules (28 Nov 2026):
 *   - A severe case is never closed by the department itself. It must be sent to the Collector for approval, and that submission
 *     carries the officer's remarks AND at least one photo of the finished work.
 *   - Any other case: the officer closes it directly (remarks required, photos optional) or, when the officer wants the Collector's
 *     approval, sends it to the Collector (remarks and at least one photo, so the Collector has something to approve).
 *   - The Collector can reopen a closed case, with remarks saying what is still wrong; it goes back to the same department's officer as
 *     "Reopened". The Collector can also ask the department about a closed case (the case stays closed; the officer answers).
 *
 * "Severe" is the product's one definition: the incident's severity_level is "Severe" (the Severe tile, sev-label.ts, intel.ts
 * FOR_COLLECTOR).
 */

/** The product's severe rule: severity_level "Severe" (sev-label.ts reads the same word). */
export function isSevere(severity: unknown): boolean {
  return typeof severity === "string" && /^severe$/i.test(severity.trim());
}

/** The smallest remark the officer's report accepts (OFFICER.minRemarks in departments.ts is the same). */
export const MIN_REMARKS = 5;
/** The Collector's reopen remark and question: a sentence, not a word. */
export const MIN_COLLECTOR_REMARK = 10;
/** The longest remark, question or answer kept (the decision note's own limit in the decisions route). */
export const MAX_NOTE = 2000;

export type ReportStep = "send" | "close";

/** The refusal of a department's own close of a severe case (stages.ts stepRefusal says the same). */
export const SEVERE_CLOSE =
  "A severe grievance is verified by the Collector: send it to the Collector with your remarks and at least one photo of the completed work.";

/** Why the officer's completion report cannot be taken as it is, or null when it can (checked on the server before anything is saved). */
export function reportRefusal(step: ReportStep, severity: unknown, remarks: string, photoCount: number): string | null {
  const severe = isSevere(severity);
  if (step === "close" && severe) return SEVERE_CLOSE;
  if (remarks.trim().length < MIN_REMARKS) return "Write remarks describing the work done.";
  if (step === "send" && photoCount < 1) {
    return severe
      ? "A severe case goes to the Collector with your remarks and at least one photo of the completed work. Attach a photo."
      : "Attach at least one photo of the completed work: the Collector approves the work from your photos.";
  }
  return null;
}

/** What the officer may do with a case in action, by severity: the choices the drawer shows, in this order. */
export function reportChoices(severity: unknown): ReportStep[] {
  return isSevere(severity) ? ["send"] : ["close", "send"];
}

// ---------------------------------------------------------------- inquiries --

/**
 * An inquiry is the Collector's question about a closed case; the officer's answer goes back to it. Both are kept as 'note' rows of
 * collector_decisions (a note changes no status anywhere: effective.ts skips it), told apart by escalate_to, which a note never uses
 * otherwise: 'inquiry' on the question, 'answer:<the question's decision_id>' on the answer (decided_role 'department_officer').
 */
export const INQUIRY_TAG = "inquiry";
export const answerTag = (inquiryId: number) => `answer:${inquiryId}`;
export function answeredInquiry(tag: unknown): number | null {
  const m = typeof tag === "string" ? /^answer:(\d{1,12})$/.exec(tag) : null;
  return m ? Number(m[1]) : null;
}

/** Why the Collector's reopen remark or question cannot be taken, or null. */
export function collectorRemarkRefusal(kind: "reopen" | "ask", text: unknown): string | null {
  const t = typeof text === "string" ? text.trim() : "";
  if (t.length < MIN_COLLECTOR_REMARK) {
    return kind === "reopen"
      ? "Write what is still wrong, or what the department should check, before reopening the case."
      : "Write the question for the department.";
  }
  if (t.length > MAX_NOTE) return `Keep it under ${MAX_NOTE} characters.`;
  return null;
}

/** Why the officer's answer cannot be taken, or null. */
export function answerRefusal(text: unknown): string | null {
  const t = typeof text === "string" ? text.trim() : "";
  if (t.length < MIN_REMARKS) return "Write your answer to the Collector's question.";
  if (t.length > MAX_NOTE) return `Keep the answer under ${MAX_NOTE} characters.`;
  return null;
}

/** The decisions that close a case (effective.ts DECISION_EFFECT with open 0). */
export const CLOSING = ["verify", "resolve", "reject"] as const;
export const isClosing = (d: unknown) => typeof d === "string" && (CLOSING as readonly string[]).includes(d);

/**
 * A reopen is a "Reopened" case when the case was closed at that moment: the decision with an effect just before it closed the case,
 * or there was none and the pipeline has the case closed. A reopen of work waiting for the Collector (My Tasks' send-back) is a return
 * for rework, as before.
 */
export function wasReopened(latest: unknown, previous: unknown, pipelineOpen: unknown): boolean {
  if (latest !== "reopen") return false;
  if (previous == null) return Number(pipelineOpen) !== 1;
  return isClosing(previous);
}
