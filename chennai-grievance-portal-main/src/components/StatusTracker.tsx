"use client";

import { Timeline, type TimelineItem } from "@/components/ui";
import { ComplaintStatus } from "@/types";
import { istDateTime } from "@/lib/ist-dates";

interface HistoryRow { status: string; stage?: string | null; remarks?: string | null; created_at: string }
interface StatusTrackerProps {
  status: ComplaintStatus;
  rejectedStage: "Department Officer" | "Collector" | null;
  remarks: string | null;
  /** complaint_status_history rows (oldest first), for each step's date and remarks */
  history?: HistoryRow[];
  /** who will check the finished work: the Collector for a severe case, else the department itself (officer-day-06) */
  checker?: "collector" | "department" | null;
}

/** Every stage a complaint passes, in order. */
export const STATUS_CHAIN: ComplaintStatus[] = [
  "Complaint Filed",
  "Pending Approval",
  "Approved by Department Officer",
  "In Progress",
  "Completed - Pending Collector Verification",
  "Verified by Collector"
];
const LABEL: Record<string, string> = {
  "Completed - Pending Collector Verification": "Completed – pending Collector verification",
  "Resolved by Department": "Resolved – checked by the department"
};

/**
 * The stages of this complaint: work the department closes itself (not severe) ends there, without the Collector's
 * check; severe work goes on to the Collector. Who checks is known before the work ends: only a severe case is sent to the
 * Collector (officer/data.ts), so a non-severe one was promised "Completed – pending Collector verification" and "Verified by
 * Collector" as its next steps until the department closed it (officer-day-06). Unless told it is the Collector's, the chain is the
 * department's; a complaint the Collector is already checking or has verified (the Collector may act at any stage) keeps the
 * Collector's steps.
 */
export function chainFor(status: ComplaintStatus, checker: "collector" | "department" | null = null): ComplaintStatus[] {
  const collectorsStep = status === "Completed - Pending Collector Verification" || status === "Verified by Collector";
  if (status === "Resolved by Department" || (checker !== "collector" && !collectorsStep)) return [...STATUS_CHAIN.slice(0, 4), "Resolved by Department"];
  return STATUS_CHAIN;
}

const when = (s: string) =>
  istDateTime(s);

/**
 * Where a rejected complaint stood when it was rejected: the chain index of the last stage its own history shows before the
 * rejection (officer-day-20). The Collector may reject at any stage, so the rejecting stage says nothing about the work done;
 * with no history to read, only the filing is known.
 */
export function stoodAt(chain: ComplaintStatus[], history: HistoryRow[]): number {
  const k = history.map((h) => h.status).lastIndexOf("Rejected");
  let at = 0;
  for (const h of k < 0 ? history : history.slice(0, k)) { const i = chain.indexOf(h.status as ComplaintStatus); if (i >= 0) at = i; }
  return at;
}

/**
 * The complaint's journey as a vertical timeline: completed stages filled, the current one pulses once, later ones
 * hollow; each shows its date and remarks. A rejection ends the chain with a red node giving the stage and reason.
 */
export default function StatusTracker({ status, rejectedStage, remarks, history = [], checker = null }: StatusTrackerProps) {
  const last = (s: string) => [...history].reverse().find((h) => h.status === s);
  const rejected = status === "Rejected";
  // a rejection stops the chain where the complaint stood, by its history, not at the stage that rejected it (officer-day-20)
  // a rejected complaint's history may show the Collector's steps, whoever was to check it
  const chain = rejected && history.some((h) => h.status === "Completed - Pending Collector Verification" || h.status === "Verified by Collector") ? STATUS_CHAIN : chainFor(status, checker);
  const stopAt = rejected ? stoodAt(chain, history) : chain.indexOf(status);
  const cur = stopAt < 0 ? 0 : stopAt;
  const done = status === "Verified by Collector" || status === "Resolved by Department";

  const items: TimelineItem[] = chain.slice(0, rejected ? cur + 1 : undefined).map((s, i) => {
    const h = last(s);
    const state: TimelineItem["state"] = rejected ? "done" : i < cur || (done && i === cur) ? "done" : i === cur ? "now" : "todo";
    return { state, title: LABEL[s] ?? s, time: h ? when(h.created_at) : undefined, body: h?.remarks || undefined };
  });
  if (rejected) {
    const h = last("Rejected");
    items.push({
      state: "bad",
      title: `Rejected${rejectedStage ? ` at the ${rejectedStage} stage` : ""}`,
      time: h ? when(h.created_at) : undefined,
      body: remarks ? `Reason: ${remarks}` : h?.remarks || undefined
    });
  }
  return <Timeline items={items} />;
}

/** Filed -> Approved -> In progress -> Verified, as four short segments (the list's mini progress bar). */
export function MiniProgress({ status }: { status: ComplaintStatus }) {
  const idx: Record<string, number> = {
    "Complaint Filed": 0, "Pending Approval": 0, "Approved by Department Officer": 1, "In Progress": 2,
    "Completed - Pending Collector Verification": 2, "Verified by Collector": 3, "Resolved by Department": 3, Rejected: -1
  };
  const at = idx[status] ?? 0;
  const steps = ["Filed", "Approved", "In progress", status === "Resolved by Department" ? "Resolved" : "Verified"];
  return (
    <div className="flex items-center gap-1" aria-label={`Progress: ${at < 0 ? "rejected" : steps[at]}`} role="img">
      {steps.map((s, i) => (
        <span key={s} title={s} className="h-1 flex-1 rounded-full transition-colors duration-500"
          style={{ background: at < 0 ? (i === 0 ? "var(--critical)" : "var(--line)") : i <= at ? (at === 3 ? "var(--ok)" : "var(--accent)") : "var(--line)" }} />
      ))}
    </div>
  );
}
