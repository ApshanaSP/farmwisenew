/**
 * The pure parts of the Haiku deploy check (v5 build, item A6 d; the runner is deploy.live.ts, which the owner runs once the Anthropic
 * key works: docs/jarvis/DEPLOY_HAIKU.md). No model call, no file, no clock here: each piece is unit-tested (deploycheck.test.ts).
 *
 *   cost        Haiku 5.5's prices (input $0.10, output $0.50, 5-minute cache write $0.125, cache read $0.01, a million tokens:
 *               platform pricing page, read 15 Nov 2026); the run stops before a call that could take it over US$0.50
 *   key         the one tiny call's verdict (401, 403 or a refusal: "key refused", stop at $0) and the anthropic-ratelimit-* headers
 *   timing      the screens and wide sentences of the tuning set by the rules' route, cycled to 20; an arm's whole-call p50 over warm,
 *               clean calls (the cold first call reported apart)
 *   pairing     b and c on the ids both runs have, clean outcomes only, exact McNemar p (evalstats.ts)
 *   decision    effort medium only if it beats low by b - c >= 3 on the tuning set and its p50 <= 1,200 ms; compact on if not worse than
 *               full (c - b < 3) and it saves >= 200 ms p50 (measured at effort low, so only with low); Haiku leads unless worse than
 *               Groq on the live-60 by c - b >= 3 or its p50 for the chosen arm is over 1,500 ms. It prints env lines; never edits .env
 */
import path from "path";
import { mcnemar } from "./evalstats";

export const HAIKU = "claude-haiku-5-5";

// ---- cost

/** US$ a million tokens, Haiku 5.5 (prompts up to 100K tokens) */
export const PRICE = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 } as const;
/** the deploy check never spends more than this */
export const CAP_USD = 0.5;
/** the price of a call before any has been made: a planner call is about $0.0006 uncached */
const FIRST_GUESS_USD = 0.001;

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

/** One call's cost in US$, from its usage (input_tokens is the uncached part; cache reads and writes are billed apart). */
export function costUsd(u: Usage): number {
  return ((u.input_tokens ?? 0) * PRICE.input + (u.output_tokens ?? 0) * PRICE.output + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6;
}

/** What the run has spent, and whether more calls may start under the cap (each priced at the dearest call so far). */
export class Spend {
  spent = 0;
  calls = 0;
  maxCall = 0;
  constructor(readonly cap = CAP_USD) {}
  add(u: Usage): number {
    const c = costUsd(u);
    this.spent += c; this.calls++; this.maxCall = Math.max(this.maxCall, c);
    return c;
  }
  room(n = 1): boolean { return this.spent + n * (this.maxCall || FIRST_GUESS_USD) <= this.cap; }
}

// ---- Step 1: the key

/** The one tiny call's verdict. A refused key stops the run at once, before anything is spent. */
export function keyVerdict(r: { status?: number; stopReason?: string | null; message?: string }): { go: boolean; line: string } {
  if (r.status === 401 || r.status === 403 || r.stopReason === "refusal") return { go: false, line: "key refused" };
  if (r.status === 400 && /credit balance/i.test(r.message ?? "")) return { go: false, line: "key refused (no credit left)" };
  if (r.status === 429) return { go: false, line: "rate limited: run the check again later" };
  if (typeof r.status === "number" && r.status >= 500) return { go: false, line: `Anthropic busy (HTTP ${r.status}): run the check again later` };
  if (typeof r.status === "number") return { go: false, line: `the key check failed (HTTP ${r.status})` };
  if (!r.stopReason) return { go: false, line: "no answer from the Claude API (connection or time-out)" };
  return { go: true, line: "key works" };
}

/** The anthropic-ratelimit-* response headers, names (lower case) and values: nothing else, never a key, an id or a cookie. */
export function rateLimitHeaders(h: Headers | Record<string, string> | null | undefined): Record<string, string> {
  if (!h) return {};
  const entries: [string, string][] = typeof (h as Headers).forEach === "function" && typeof (h as Headers).get === "function"
    ? (() => { const out: [string, string][] = []; (h as Headers).forEach((v, k) => out.push([k, v])); return out; })()
    : Object.entries(h as Record<string, string>);
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), String(v)]).filter(([k]) => k.startsWith("anthropic-ratelimit-")).sort(([a], [b]) => a.localeCompare(b)));
}

// ---- Step 2: timing

export type ArmId = "low" | "medium" | "compact";
export interface Arm { id: ArmId; effort: "low" | "medium"; compact: boolean }
/** thinking off in every arm (always so for a Jarvis call on Haiku: claude.ts) */
export const ARMS: Arm[] = [
  { id: "low", effort: "low", compact: false },
  { id: "medium", effort: "medium", compact: false },
  { id: "compact", effort: "low", compact: true }
];
/** the server env an arm runs under */
export const armEnv = (a: Arm) => ({ JARVIS_HAIKU_EFFORT: a.effort, JARVIS_PLAN_COMPACT: a.compact ? "1" : "0" });

/** `n` items, going round the list again as often as needed (none from an empty list) */
export function cycleTo<T>(xs: T[], n: number): T[] {
  return xs.length ? Array.from({ length: n }, (_, i) => xs[i % xs.length]) : [];
}

/** The timing sentences: those the rules route to screens and to wide, each list cycled to `n`. */
export function timingSets(items: { text: string }[], bundleOf: (text: string) => string, n = 20): { screens: string[]; wide: string[] } {
  const of = (b: string) => cycleTo(items.filter((x) => bundleOf(x.text) === b).map((x) => x.text), n);
  return { screens: of("screens"), wide: of("wide") };
}

/** a call's outcome the model is answerable for (a 429, a 5xx, a time-out, a refused key or any other error is not) */
const NOT_CLEAN = new Set(["rate_limited", "busy", "timeout", "error", "key_refused", "no_credit"]);
export const cleanOutcome = (o: string) => !NOT_CLEAN.has(o);

export interface TimingRow {
  arm: ArmId; bundle: string; cold: boolean; ms: number; outcome: string;
  output_tokens: number; input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; stop_reason: string | null; path: string | null;
}

/** the q-quantile of a list (the value at floor(n q) once sorted), null for none */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

/** An arm's whole-call p50: warm calls (not the cold first one) the model answered, both bundles. */
export function armP50(rows: TimingRow[], arm: ArmId): number | null {
  return quantile(rows.filter((r) => r.arm === arm && !r.cold && cleanOutcome(r.outcome)).map((r) => r.ms), 0.5);
}

// ---- Step 3: pairing

export interface TuneRow { id: string; ok: boolean; outcome: string }

/** b = right only in x, c = right only in y, on the ids both have with a clean outcome in both; exact two-sided McNemar. */
export function pairTuning(x: TuneRow[], y: TuneRow[]): { n: number; b: number; c: number; p: number; midP: number } {
  const ym = new Map(y.filter((r) => cleanOutcome(r.outcome)).map((r) => [r.id, r.ok]));
  const both = x.filter((r) => cleanOutcome(r.outcome) && ym.has(r.id));
  const b = both.filter((r) => r.ok && !ym.get(r.id)).length, c = both.filter((r) => !r.ok && ym.get(r.id)).length;
  const m = mcnemar(b, c);
  return { n: both.length, b, c, p: m.p, midP: m.midP };
}

/** A grid result file's rows (grid.live.ts): id, ok and outcome only. */
export function gridRows(j: { rows?: { id: string; ok: boolean; outcome?: string }[] }): TuneRow[] {
  return (j.rows ?? []).map((r) => ({ id: String(r.id), ok: !!r.ok, outcome: String(r.outcome ?? "error") }));
}

// ---- the decision

export const EFFORT_BEATS = 3, MEDIUM_P50_MAX_MS = 1200, COMPACT_WORSE = 3, COMPACT_SAVES_MS = 200, LEAD_WORSE = 3, LEAD_P50_MAX_MS = 1500;

export interface ArmInput {
  /** each arm's whole-call p50 (Step 2) */
  p50: Record<ArmId, number | null>;
  /** Step 3: b = right only with medium, c = right only with low */
  mediumVsLow: { b: number; c: number };
  /** Step 3: b = right only with compact, c = right only with full (low) */
  compactVsLow: { b: number; c: number };
}

/** The arm Step 4 runs and the server keeps: effort, then compact (measured at low only). */
export function pickArm(i: ArmInput): { arm: Arm; why: string[] } {
  const why: string[] = [];
  const by = (id: ArmId) => ARMS.find((a) => a.id === id)!;
  const mDiff = i.mediumVsLow.b - i.mediumVsLow.c;
  const medium = mDiff >= EFFORT_BEATS && i.p50.medium != null && i.p50.medium <= MEDIUM_P50_MAX_MS;
  why.push(`effort ${medium ? "medium" : "low"}: medium vs low b - c = ${mDiff} (needs >= ${EFFORT_BEATS}), medium p50 ${i.p50.medium ?? "none"} ms (needs <= ${MEDIUM_P50_MAX_MS})`);
  if (medium) {
    why.push("compact off: it was measured at effort low only");
    return { arm: by("medium"), why };
  }
  const worse = i.compactVsLow.c - i.compactVsLow.b;
  const saves = i.p50.low != null && i.p50.compact != null ? i.p50.low - i.p50.compact : null;
  const compact = worse < COMPACT_WORSE && saves != null && saves >= COMPACT_SAVES_MS;
  why.push(`compact ${compact ? "on" : "off"}: full vs compact c - b = ${worse} (needs < ${COMPACT_WORSE}), saves ${saves ?? "unknown"} ms p50 (needs >= ${COMPACT_SAVES_MS})`);
  return { arm: by(compact ? "compact" : "low"), why };
}

/** Haiku first unless Groq beats it on the live-60 by c - b >= 3 (b = right only with Haiku) or its p50 is over 1,500 ms. */
export function pickLead(armP50Ms: number | null, live60: { b: number; c: number } | null): { lead: "haiku" | "groq"; why: string[] } {
  const why: string[] = [];
  const worse = live60 ? live60.c - live60.b : null;
  const slow = armP50Ms != null && armP50Ms > LEAD_P50_MAX_MS;
  const lead = (worse != null && worse >= LEAD_WORSE) || slow ? "groq" : "haiku";
  why.push(`lead ${lead}: live-60 Groq vs Haiku c - b = ${worse ?? "not run"} (Groq leads at >= ${LEAD_WORSE}), chosen arm p50 ${armP50Ms ?? "none"} ms (Groq leads over ${LEAD_P50_MAX_MS})`);
  return { lead, why };
}

/** The lines to set in the portal's .env (printed only). */
export function envLines(arm: Arm, lead: "haiku" | "groq"): string[] {
  const e = armEnv(arm);
  return [...(lead === "groq" ? ["set JARVIS_PLANNER_LEAD=groq"] : []), `JARVIS_PLANNER_LEAD=${lead}`, `JARVIS_HAIKU_EFFORT=${e.JARVIS_HAIKU_EFFORT}`, `JARVIS_PLAN_COMPACT=${e.JARVIS_PLAN_COMPACT}`];
}

// ---- Step 4

/** Requests and tokens one live-60 sentence may take on Claude (router, up to three planner rounds), for the ledger check */
export const STEP4_REQUESTS_PER_SENTENCE = 4, STEP4_TOKENS_PER_SENTENCE = 12_000;

/** Does the ledger's Claude day hold the whole live-60 run? A run that cannot finish is not started. */
export function ledgerCheck(room: { ok: boolean; left: { rpd: number; tpd: number } }, n: number): { ok: boolean; line: string } {
  const needR = n * STEP4_REQUESTS_PER_SENTENCE, needT = n * STEP4_TOKENS_PER_SENTENCE;
  const ok = room.ok && room.left.rpd >= needR && room.left.tpd >= needT;
  return { ok, line: ok ? "the ledger holds the run" : `not started: the ledger's Claude day has ${room.left.rpd} requests and ${room.left.tpd} tokens left; the run needs ${needR} and ${needT}` };
}

/** This build's final Groq live-60 file if it exists, else v4's (and which one it is). */
export function liveBaseline(dir: string, exists: (file: string) => boolean): { file: string; which: "v5final" | "v4final" } | null {
  for (const which of ["v5final", "v4final"] as const) {
    const file = path.join(dir, `${which}-groq-planner-live60.json`);
    if (exists(file)) return { file, which };
  }
  return null;
}
