/**
 * The department a follow-up asks to act. A follow-up (district_intel_ops.followups) links one case to the email that asks for it; an
 * email about several cases (Ask the Map's "Send to department", a rain rehearsal's jobs) is addressed to one department and lists that
 * department's cases. Its follow-ups say which department in their own words: the writers below and the officer's drawer share this
 * module, so a case that later moved to another department (derive.ts re-categorises) does not show that email, and the other
 * department's cases it lists, in the new department's drawer (reviewer4-03). Pure: no database.
 */

/** Ask the Map's batch: the follow-up of each case it lists (lib/collector/actionmail.ts sendBatchAction). */
export const batchFollowupSummary = (dept: string) => `Completion report with photos (map send to ${dept})`;

/** The rain rehearsal's header (lib/rehearsal/tasks.ts encodeSummary): `[RR] {"r":..,"d":dept,...} ` then the job. */
const RR = "[RR] ";

/** The department a follow-up's summary names, or null when it names none (a Take action email about the one case). */
export function followupDept(summary: unknown): string | null {
  const s = typeof summary === "string" ? summary : "";
  if (s.startsWith(RR)) {
    const end = s.indexOf("} ", RR.length);
    try {
      const d = end > 0 ? (JSON.parse(s.slice(RR.length, end + 1)) as { d?: unknown }).d : null;
      return typeof d === "string" && d ? d : null;
    } catch {
      return null;
    }
  }
  const m = /\(map send to ([A-Za-z0-9-]{2,20})\)$/.exec(s);
  return m ? m[1] : null;
}
