/**
 * Watch: Thunai speaks first only when a signal clears a ranked bar, and most checks end in silence. Importance =
 * impact × urgency × confidence × novelty × actionability (each 0–1). Bands: digest (below 0.25), a silent chip
 * (0.25–0.55), a chime and one line (0.55 and above), and for life safety above 0.8 a banner until acknowledged.
 * A budget keeps it polite: 4 spoken alerts a day, 1 per 20 minutes, no repeat for 2 hours unless it worsens, silence
 * within 30 s of the Collector speaking, in Quiet mode, and from 22:00 to 06:00 (except life safety).
 */
// types only: signals.ts reads the store on the server, and this file runs in the browser too
import type { WatchSignal } from "./signals";

export interface Signal {
  key: string;
  kind: "severe" | "overdue" | "gap" | "studio" | "reminder" | "greeting" | "rise" | "rain" | "reservoir" | "warning" | "followed";
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
  const h = new Date(now + 330 * 60_000).getUTCHours(); // the Collector's night is Chennai's night, in any browser zone
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

// ------------------------------------------------------------------ v4: the server watch's interjection policy --
/*
 * Jarvis speaks unprompted only for a high-severity signal, only when the Collector is not speaking and no turn is in flight (and
 * Jarvis itself is not mid-sentence or mid-brief), after a short chime, at most three an hour and ten minutes apart, never in quiet
 * mode or quiet hours (22:00 to 06:00 Chennai time; life safety excepted). Everything else waits in the queue shown as a badge.
 * "Tell me", "later" and "not about this" are the Collector's own choices, kept in the memory file through a Level B call (a yes).
 * Pure, and safe in the browser: signals.ts is imported for its types only.
 */

/** What the watch keeps per Collector in the memory file. */
export interface WatchState {
  /** keys raised before, with when they were first raised and at what level (novelty) */
  seen: Record<string, { first: string; level: number }>;
  /** keys Jarvis has said (an interjection, or read in a brief), and at what level */
  told: Record<string, { at: string; level: number }>;
  /** ISO times of interjections, for the hourly budget */
  spoken: string[];
  /** "later": a key is held back until this time */
  later: Record<string, string>;
  /** "not about this": a topic is never interjected or queued until the Collector says otherwise */
  mute: Record<string, string>;
  /** "tell me": a topic is interjected even when it is not high severity */
  tell: Record<string, string>;
}
export const emptyWatch = (): WatchState => ({ seen: {}, told: {}, spoken: [], later: {}, mute: {}, tell: {} });

export const INTERJECT = { perHour: 3, gapMs: 10 * 60_000, afterUserMs: 30_000, repeatMs: 12 * 3_600_000, quietFrom: 22, quietTo: 6, laterMin: 60 } as const;

export interface InterjectState {
  now: number;
  signal: Pick<WatchSignal, "key" | "topic" | "severity" | "level"> & { lifeSafety?: boolean };
  /** the Collector is speaking now (VAD onset seen, end of utterance not yet) */
  collectorSpeaking: boolean;
  /** a turn is being heard, planned, acted or spoken */
  turnInFlight: boolean;
  /** Jarvis is speaking (an answer, or the brief: a brief is always finished first) */
  jarvisSpeaking?: boolean;
  lastUserSpeech: number | null;
  /** the Quiet output mode */
  quiet: boolean;
  watch: WatchState;
}

const chennaiHour = (ms: number) => new Date(ms + 330 * 60_000).getUTCHours();
const iso = (ms: number) => new Date(ms).toISOString();

/** May Jarvis interrupt now with this signal? The first rule that says no is the reason. */
export function mayInterject(s: InterjectState): { ok: boolean; why: string } {
  const { now, signal: sig, watch: w } = s;
  if (s.collectorSpeaking) return { ok: false, why: "the Collector is speaking" };
  if (s.turnInFlight) return { ok: false, why: "a turn is in flight" };
  if (s.jarvisSpeaking) return { ok: false, why: "Jarvis is speaking" };
  if (w.mute[sig.topic]) return { ok: false, why: "not about this (the Collector's choice)" };
  const later = w.later[sig.key];
  if (later && Date.parse(later) > now) return { ok: false, why: "later (the Collector's choice)" };
  const life = !!sig.lifeSafety;
  if (sig.severity !== "high" && !w.tell[sig.topic] && !life) return { ok: false, why: "not urgent: queued" };
  if (s.quiet && !life) return { ok: false, why: "quiet mode" };
  if (s.lastUserSpeech != null && now - s.lastUserSpeech < INTERJECT.afterUserMs && !life) return { ok: false, why: "the Collector spoke a moment ago" };
  const h = chennaiHour(now);
  if ((h >= INTERJECT.quietFrom || h < INTERJECT.quietTo) && !life) return { ok: false, why: "quiet hours" };
  const told = w.told[sig.key];
  if (told && now - Date.parse(told.at) < INTERJECT.repeatMs && sig.level <= told.level) return { ok: false, why: "already told" };
  const recent = w.spoken.map((t) => Date.parse(t)).filter((t) => Number.isFinite(t) && now - t < 3_600_000);
  if (recent.length >= INTERJECT.perHour && !life) return { ok: false, why: "hourly budget spent" };
  if (recent.some((t) => now - t < INTERJECT.gapMs) && !life) return { ok: false, why: "too soon after the last one" };
  return { ok: true, why: "chime, then one line" };
}

export interface WatchPlan {
  /** the one signal to say now (after a chime), or null */
  interject: WatchSignal | null;
  why: string;
  /** everything else worth a look, strongest first: the badge's list */
  queue: WatchSignal[];
  badge: number;
}

/** The interjection (at most one) and the queue, from the ranked signals and the live state. */
export function planWatch(signals: WatchSignal[], s: Omit<InterjectState, "signal">): WatchPlan {
  const live = signals.filter((x) => !s.watch.mute[x.topic] && !(s.watch.later[x.key] && Date.parse(s.watch.later[x.key]) > s.now));
  let interject: WatchSignal | null = null, why = live.length ? "nothing urgent" : "nothing to tell";
  for (const x of live) {
    const r = mayInterject({ ...s, signal: x });
    if (r.ok) { interject = x; why = r.why; break; }
    if (x === live[0]) why = r.why;
  }
  const queue = live.filter((x) => x !== interject && !(s.watch.told[x.key] && x.level <= s.watch.told[x.key].level));
  return { interject, why, queue, badge: queue.length };
}

export type WatchPref = "later" | "mute" | "tell" | "unmute";

/** The Collector's choice, applied (Level B: the caller has the yes). `target` is a key for "later", a topic otherwise. */
export function withPref(w: WatchState, pref: WatchPref, target: string, now: number, minutes: number = INTERJECT.laterMin): WatchState {
  const n: WatchState = { ...w, later: { ...w.later }, mute: { ...w.mute }, tell: { ...w.tell } };
  if (pref === "later") n.later[target] = iso(now + Math.max(5, Math.min(24 * 60, minutes)) * 60_000);
  if (pref === "mute") { n.mute[target] = iso(now); delete n.tell[target]; }
  if (pref === "tell") { n.tell[target] = iso(now); delete n.mute[target]; }
  if (pref === "unmute") { delete n.mute[target]; delete n.tell[target]; }
  return n;
}

const within = <T>(rec: Record<string, T>, at: (v: T) => string, now: number, ms: number): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).filter(([, v]) => now - Date.parse(at(v)) < ms));

/** Signals raised (novelty) and, when `told`, said; entries older than two days fall away so the file stays small. */
export function withSeen(w: WatchState, items: { key: string; level: number }[], now: number, told = false): WatchState {
  const seen = within(w.seen, (v) => v.first, now, 48 * 3_600_000), toldMap = within(w.told, (v) => v.at, now, 48 * 3_600_000);
  for (const it of items.slice(0, 50)) {
    const had = seen[it.key];
    if (!had || it.level > had.level) seen[it.key] = { first: had?.first ?? iso(now), level: it.level };
    if (told) toldMap[it.key] = { at: iso(now), level: it.level };
  }
  const later = Object.fromEntries(Object.entries(w.later).filter(([, v]) => Date.parse(v) > now));
  return { ...w, seen, told: toldMap, later };
}

/** An interjection was said: it counts against the hourly budget, and its key is told. */
export function withSpoken(w: WatchState, key: string, level: number, now: number): WatchState {
  const next = withSeen(w, [{ key, level }], now, true);
  return { ...next, spoken: [...w.spoken.filter((t) => now - Date.parse(t) < 24 * 3_600_000), iso(now)].slice(-50) };
}

/** A server signal as the client's older Watch scores it (band, canSpeak): high speaks, medium is a chip, low is the digest. */
export function toSignal(x: WatchSignal): Signal {
  const urgency = x.severity === "high" ? 1 : x.severity === "medium" ? 0.6 : 0.3;
  return { key: x.key, kind: x.kind, lifeSafety: x.lifeSafety, impact: 1, urgency, confidence: 0.9, novelty: 1, actionability: 0.8, level: x.level, text: x.text };
}
