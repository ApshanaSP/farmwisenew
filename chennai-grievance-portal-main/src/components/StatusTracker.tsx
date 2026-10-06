"use client";

import { Timeline, type TimelineItem } from "@/components/ui";
import { ComplaintStatus } from "@/types";

interface HistoryRow { status: string; stage?: string | null; remarks?: string | null; created_at: string }
interface StatusTrackerProps {
  status: ComplaintStatus;
  rejectedStage: "Department Officer" | "Collector" | null;
  remarks: string | null;
  /** complaint_status_history rows (oldest first), for each step's date and remarks */
  history?: HistoryRow[];
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
  "Completed - Pending Collector Verification": "Completed – pending Collector verification"
};

const when = (s: string) =>
  new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * The complaint's journey as a vertical timeline: completed stages filled, the current one pulses once, later ones
 * hollow; each shows its date and remarks. A rejection ends the chain with a red node giving the stage and reason.
 */
export default function StatusTracker({ status, rejectedStage, remarks, history = [] }: StatusTrackerProps) {
  const last = (s: string) => [...history].reverse().find((h) => h.status === s);
  const rejected = status === "Rejected";
  // a rejection stops the chain after the stage that rejected it
  const stopAt = rejected ? (rejectedStage === "Collector" ? 4 : 1) : STATUS_CHAIN.indexOf(status);
  const cur = stopAt < 0 ? 0 : stopAt;
  const done = status === "Verified by Collector";

  const items: TimelineItem[] = STATUS_CHAIN.slice(0, rejected ? cur + 1 : undefined).map((s, i) => {
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
    "Completed - Pending Collector Verification": 2, "Verified by Collector": 3, Rejected: -1
  };
  const at = idx[status] ?? 0;
  const steps = ["Filed", "Approved", "In progress", "Verified"];
  return (
    <div className="flex items-center gap-1" aria-label={`Progress: ${at < 0 ? "rejected" : steps[at]}`} role="img">
      {steps.map((s, i) => (
        <span key={s} title={s} className="h-1 flex-1 rounded-full transition-colors duration-500"
          style={{ background: at < 0 ? (i === 0 ? "var(--critical)" : "var(--line)") : i <= at ? (at === 3 ? "var(--ok)" : "var(--accent)") : "var(--line)" }} />
      ))}
    </div>
  );
}
