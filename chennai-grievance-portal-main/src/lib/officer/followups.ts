/**
 * The follow-ups the Collector's instructions set (district_intel_ops.followups: Take action, Ask the Map's "Send to department" and the
 * traffic view each write one per case, due in 24 hours, lib/collector/actionmail.ts). Nothing read them back, so every follow-up stayed
 * 'pending' for ever and the department pop-up listed work the department had long since sent (the integration review, 27 Nov).
 *
 * A background job (lib/scheduler.ts) closes them here:
 *   done    the department answered after the follow-up was set: a completion report, a send to the Collector or its own close
 *   closed  the Collector closed the case meanwhile (verify, resolve, reject): nothing is owed on it any more
 * What is still pending past its due date is what the Collector's department pop-up lists as late (lib/collector/deptsummary.ts reads
 * every pending follow-up and marks the late ones), and what the officer's drawer shows as overdue under the instruction.
 *
 * The rain rehearsal's jobs are follow-ups too ("[RR] " summaries, lib/rehearsal/tasks.ts): they are marked done by their own flow and are
 * left alone here. So are the fixes after a rain (the Rain view's action tracker, "[RR] " rows with a "fix:" key): the officer's update and
 * done and the Collector's verify or send-back move them (tasks.ts stepFix), and the next rain's data says whether the place held. The job reads first and writes only the rows that changed, so a run with nothing to close writes nothing (and empties
 * no cache: a write naming the decisions table bumps the data epoch, lib/aws/store.ts).
 */
import intelPool, { ops } from "@/lib/collector/db";
import { bumpDataEpoch } from "@/lib/collector/epoch";

type Row = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __followupsAt: number | undefined;
}

/** how often the job runs at most (the scheduler ticks every minute) */
export const FOLLOWUPS_EVERY_MS = 5 * 60_000;

const istNow = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
const since = "COALESCE(f.created_at, '1970-01-01 00:00:00')";

/** What the department or the Collector did on each pending follow-up's case since it was set, or nothing. */
export const ANSWERED_SQL = () => `SELECT f.followup_id AS id,
    CASE WHEN EXISTS (SELECT 1 FROM ${ops("officer_steps")} s WHERE s.incident_id = f.incident_id AND s.step IN ('send', 'close') AND s.at >= ${since})
           OR EXISTS (SELECT 1 FROM ${ops("officer_reports")} r WHERE r.incident_id = f.incident_id AND r.sent_at >= ${since}) THEN 'done'
         WHEN EXISTS (SELECT 1 FROM ${ops("collector_decisions")} d WHERE d.incident_id = f.incident_id AND d.decision IN ('verify', 'resolve', 'reject')
           AND d.decided_at >= ${since}) THEN 'closed'
         ELSE NULL END AS outcome
  FROM ${ops("followups")} f
  WHERE f.status = 'pending' AND f.incident_id IS NOT NULL AND f.summary NOT LIKE '[RR] %'`;

/**
 * Closes the follow-ups that were answered. Returns how many became done and closed. Safe to run on any copy: running it twice changes
 * nothing the second time, and a copy that does not save keeps its changes locally until the saving copy does the same.
 */
export async function closeAnsweredFollowups(now: string = istNow()): Promise<{ done: number; closed: number }> {
  const [rows] = (await intelPool.query(ANSWERED_SQL())) as unknown as [Row[]];
  const by = { done: [] as number[], closed: [] as number[] };
  for (const r of rows ?? []) if (r.outcome === "done" || r.outcome === "closed") by[r.outcome].push(Number(r.id));
  for (const status of ["done", "closed"] as const) {
    const ids = by[status];
    if (!ids.length) continue;
    try {
      await intelPool.query(`UPDATE ${ops("followups")} SET status = ?, last_checked_at = ? WHERE followup_id IN (?) AND status = 'pending'`, [status, now, ids]);
    } catch {
      // a store from before last_checked_at
      await intelPool.query(`UPDATE ${ops("followups")} SET status = ? WHERE followup_id IN (?) AND status = 'pending'`, [status, ids]);
    }
  }
  // the department pop-up's list of what is owed changed: the caches that hold it start again (only when something did change)
  if (by.done.length || by.closed.length) bumpDataEpoch();
  return { done: by.done.length, closed: by.closed.length };
}

/** The scheduler's call: at most every FOLLOWUPS_EVERY_MS; a store without the tables (a fresh MySQL) is skipped quietly. */
export async function followupsTick(): Promise<void> {
  if (process.env.FOLLOWUPS_JOB === "off") return;
  if (Date.now() - (global.__followupsAt ?? 0) < FOLLOWUPS_EVERY_MS) return;
  global.__followupsAt = Date.now();
  try {
    const r = await closeAnsweredFollowups();
    if (r.done || r.closed) console.log(`[followups] ${r.done} answered by the department, ${r.closed} closed by the Collector`);
  } catch (e) {
    if (!/doesn't exist|no such table|ER_NO_SUCH_TABLE/i.test(String((e as Error).message))) console.warn(`[followups] check skipped: ${(e as Error).message}`);
  }
}
