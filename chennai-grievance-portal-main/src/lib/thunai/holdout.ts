/**
 * Scoring the held-out sets in code (eval/holdout). Pure: the sets are frozen by hash before tuning and never read by the
 * rules. The Wilson interval is what the report quotes, so a score on 20 items is not read as more than it is.
 */
export interface HoldoutItem { id: string; text: string; lang: "en" | "ta" | "tanglish"; intent: string; places?: string[]; after?: string; expect?: string | { intent?: string } }

/** The intent a follow-up really asks for (its own field) or the item's. */
export function goldIntent(x: HoldoutItem): string {
  if (x.intent === "followup" && x.expect) return typeof x.expect === "string" ? x.expect : x.expect.intent ?? "followup";
  return x.intent;
}

/** Wilson 95 % interval for k of n, in percent. */
export function wilson(k: number, n: number): { p: number; lo: number; hi: number } {
  if (!n) return { p: 0, lo: 0, hi: 0 };
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const r = (x: number) => Math.round(x * 1000) / 10;
  return { p: r(p), lo: r((c - s) / d), hi: r((c + s) / d) };
}

export interface Scored { id: string; lang: string; gold: string; got: string; ok: boolean; deferred: boolean; capacity?: boolean }
export interface Tally { n: number; right: number; deferred: number; wrong: number; capacity: number; pct: ReturnType<typeof wilson> }

export function tally(rows: Scored[]): Tally {
  // a capacity failure (no model answered) says nothing about understanding: it is reported apart and left out of the share
  const measured = rows.filter((r) => !r.capacity);
  const right = measured.filter((r) => r.ok).length, deferred = measured.filter((r) => r.deferred && !r.ok).length;
  return { n: rows.length, right, deferred, wrong: measured.length - right - deferred, capacity: rows.length - measured.length, pct: wilson(right, measured.length) };
}

export function byLang(rows: Scored[]): Record<string, Tally> {
  const out: Record<string, Tally> = { all: tally(rows) };
  for (const l of ["en", "ta", "tanglish"]) out[l] = tally(rows.filter((r) => r.lang === l));
  return out;
}
