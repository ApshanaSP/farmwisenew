/**
 * Watch: Thunai speaks first only when a signal clears a ranked bar, and most checks end in silence. Importance =
 * impact × urgency × confidence × novelty × actionability (each 0–1). Bands: digest (below 0.25), a silent chip
 * (0.25–0.55), a chime and one line (0.55 and above), and for life safety above 0.8 a banner until acknowledged.
 * A budget keeps it polite: 4 spoken alerts a day, 1 per 20 minutes, no repeat for 2 hours unless it worsens, silence
 * within 30 s of the Collector speaking, in Quiet mode, and from 22:00 to 06:00 (except life safety).
 */

export interface Signal {
  key: string;
  kind: "severe" | "overdue" | "gap" | "studio" | "reminder" | "greeting";
  lifeSafety: boolean;
  impact: number; urgency: number; confidence: number; novelty: number; actionability: number;
  /** a worse version of the same signal (more reports, higher severity) may speak again inside the cooldown */
  level: number;
  text: { en: string; ta: string };
}

export type Band = "digest" | "chip" | "speak" | "interrupt";

export function score(s: Signal): number {
  const v = s.impact * s.urgency * s.confidence * s.novelty * s.actionability;
  return Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
}

export function band(s: Signal): Band {
  const v = score(s);
  if (s.lifeSafety && v >= 0.8) return "interrupt";
  if (v >= 0.55) return "speak";
  if (v >= 0.25) return "chip";
  return "digest";
}

export interface WatchMemory {
  /** times (ms) of spoken alerts */
  spoken: number[];
  /** last time and level each signal key spoke */
  last: Record<string, { at: number; level: number }>;
}

export function canSpeak(s: Signal, mem: WatchMemory, now: number, ctx: { quiet: boolean; lastUserSpeech: number | null }): boolean {
  const b = band(s);
  if (b === "digest" || b === "chip") return false;
  const life = b === "interrupt";
  if (ctx.quiet && !life) return false;
  if (ctx.lastUserSpeech != null && now - ctx.lastUserSpeech < 30_000 && !life) return false;
  const h = new Date(now).getHours();
  if ((h >= 22 || h < 6) && !life) return false;
  const prev = mem.last[s.key];
  if (prev && now - prev.at < 2 * 3_600_000 && s.level <= prev.level) return false;
  const day = mem.spoken.filter((t) => now - t < 24 * 3_600_000);
  if (!life && day.length >= 4) return false;
  if (!life && day.some((t) => now - t < 20 * 60_000)) return false;
  return true;
}

export function remember(s: Signal, mem: WatchMemory, now: number): WatchMemory {
  return { spoken: [...mem.spoken.filter((t) => now - t < 24 * 3_600_000), now], last: { ...mem.last, [s.key]: { at: now, level: s.level } } };
}
