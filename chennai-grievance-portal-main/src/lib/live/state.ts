/**
 * The live lane's shared state: a version that goes up whenever a live reading changed what the console shows (a new
 * IMD warning or nowcast, new news reports), with a one-line note for the console's toast. The consoles read it in
 * their 20-second check (/api/collector/overview?meta=1, /api/officer/overview?meta=1) and refresh when it moves.
 *
 * Hybrid design: the hourly build (GitHub dataload -> AWS) still does the heavy work (linking, AI labels, trends);
 * only the IMD warning (lib/live/imd.ts) and the news feeds (lib/live/news.ts) are read every 10 minutes here.
 */
import { bumpDataEpoch } from "@/lib/collector/epoch";

export interface LiveState {
  /** any live change */ v: number;
  /** a change to the IMD warning or nowcast only (the officer consoles follow this one) */ imdV: number;
  at: string | null;
  note: string | null;
  /** the change is a warning: shown as an alert */ alert: boolean;
  imdNote: string | null;
  imd: { checkedAt: string | null; ok: boolean; error: string | null; issued: string | null; level: number | null; text: string | null };
  news: { checkedAt: string | null; added: number };
}

declare global {
  // eslint-disable-next-line no-var
  var __liveLane: LiveState | undefined;
}

export const istNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

export function live(): LiveState {
  return (global.__liveLane ??= {
    v: 0, imdV: 0, at: null, note: null, alert: false, imdNote: null,
    imd: { checkedAt: null, ok: false, error: null, issued: null, level: null, text: null },
    news: { checkedAt: null, added: 0 }
  });
}

/** Records a live change: the consoles refresh at their next check, and every read cache keyed on the data epoch empties. */
export function markLive(kind: "imd" | "news", note: string, alert = false): void {
  const s = live();
  s.v += 1;
  s.at = istNow();
  s.note = note;
  s.alert = alert;
  if (kind === "imd") {
    s.imdV += 1;
    s.imdNote = note;
  }
  bumpDataEpoch();
}

/** What the consoles' 20-second check returns about the live lane. */
export function liveMeta() {
  const s = live();
  return { v: s.v, imdV: s.imdV, at: s.at, note: s.note, alert: s.alert, imdNote: s.imdNote };
}
