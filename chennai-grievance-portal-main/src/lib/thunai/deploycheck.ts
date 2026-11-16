/**
 * The pure parts of the Haiku deploy check (v5 build, item A6 d; the runner is deploy.live.ts, which the owner runs once the Anthropic
 * key works: docs/jarvis/DEPLOY_HAIKU.md). No model call and no clock here, and no file but ownLedger's temporary folder: each piece
 * is unit-tested (deploycheck.test.ts).
 *
 *   cost        Haiku 5.5's prices (input $0.10, output $0.50, 5-minute cache write $0.125, cache read $0.01, a million tokens:
 *               platform pricing page, read 15 Nov 2026); the run stops before a call that could take it over US$0.50
 *   key         the one tiny call's verdict (401, 403 or a refusal: "key refused", stop at $0) and the anthropic-ratelimit-* headers
 *   timing      the screens and wide sentences of the tuning set by the rules' route, cycled to 20; an arm's whole-call p50 over warm,
 *               clean calls (the cold first call reported apart)
 *   pairing     b and c on the ids both runs have, clean outcomes only, exact McNemar p (evalstats.ts)
 *   decision    effort medium only if it beats low by b - c >= 3 on the tuning set and its p50 <= 1,200 ms; compact on if not worse than
 *               full (c - b < 3) and it saves >= 200 ms p50 (measured at effort low, so only with low); Haiku leads unless worse than
 *               Groq on the live-60 by c - b >= 3 or its p50 for the chosen arm is over 1,500 ms; with no live-60 pairing the lead is
 *               undecided unless the p50 says Groq. It prints env lines; never edits .env
 */
import fs from "fs";
import os from "os";
import path from "path";
import { mcnemar } from "./evalstats";
import { resetLedger } from "./ledger";

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

export type Lead = "haiku" | "groq" | "undecided";

/**
 * Haiku first unless Groq beats it on the live-60 by c - b >= 3 (b = right only with Haiku) or its p50 is over 1,500 ms. With no
 * live-60 pairing (Step 4 did not run, or had nothing to pair with) only the p50 rule can decide: else the lead is "undecided", never
 * Haiku by default (review planner-quota-5).
 */
export function pickLead(armP50Ms: number | null, live60: { b: number; c: number } | null): { lead: Lead; why: string[] } {
  const why: string[] = [];
  const worse = live60 ? live60.c - live60.b : null;
  const slow = armP50Ms != null && armP50Ms > LEAD_P50_MAX_MS;
  const lead: Lead = (worse != null && worse >= LEAD_WORSE) || slow ? "groq" : live60 ? "haiku" : "undecided";
  why.push(`lead ${lead}: live-60 Groq vs Haiku c - b = ${worse ?? "not run"} (Groq leads at >= ${LEAD_WORSE}), chosen arm p50 ${armP50Ms ?? "none"} ms (Groq leads over ${LEAD_P50_MAX_MS})`);
  if (lead === "undecided") why.push("lead undecided: the live-60 comparison did not run, so the check does not choose; set JARVIS_PLANNER_LEAD by hand");
  return { lead, why };
}

/** The lines to set in the portal's .env (printed only). Undecided: comment lines only for the lead (unset, Jarvis puts Haiku first). */
export function envLines(arm: Arm, lead: Lead): string[] {
  const e = armEnv(arm);
  const leadLines = lead === "undecided"
    ? ["# JARVIS_PLANNER_LEAD is undecided: Step 4 (the live-60 against Groq) did not run. Set one of these two by hand (left unset, Jarvis puts Haiku first):",
      "#   JARVIS_PLANNER_LEAD=groq    the Groq ladder first, as this build measured it; Haiku after it",
      "#   JARVIS_PLANNER_LEAD=haiku   Haiku first: not measured on the live-60"]
    : [...(lead === "groq" ? ["set JARVIS_PLANNER_LEAD=groq"] : []), `JARVIS_PLANNER_LEAD=${lead}`];
  return [...leadLines, `JARVIS_HAIKU_EFFORT=${e.JARVIS_HAIKU_EFFORT}`, `JARVIS_PLAN_COMPACT=${e.JARVIS_PLAN_COMPACT}`];
}

// ---- Step 4

/**
 * Requests one live-60 sentence may take on Claude (router, up to three planner rounds), and the fewest tokens a call is counted at
 * (the ledger's way: input, cache reads and writes in full, and output), for the ledger check
 */
export const STEP4_REQUESTS_PER_SENTENCE = 4, STEP4_TOKENS_PER_CALL = 3_000, STEP4_TOKENS_PER_SENTENCE = STEP4_REQUESTS_PER_SENTENCE * STEP4_TOKENS_PER_CALL;

/** The mean tokens a Claude call took (the ledger's way), over the calls the model answered; null for none. Step 2's rows size Step 4. */
export function callTokens(rows: Pick<TimingRow, "outcome" | "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens">[]): number | null {
  const t = rows.filter((r) => cleanOutcome(r.outcome)).map((r) => r.input_tokens + r.output_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens);
  return t.length ? Math.ceil(t.reduce((a, x) => a + x, 0) / t.length) : null;
}

/** the ledger's own minute: Step 4 waits for it sentence by sentence (deploy.live.ts), so it never stops the run from starting */
const MINUTE = new Set(["rpm", "tpm"]);

/**
 * Does the ledger's Claude day hold the whole live-60 run? A run that cannot finish is not started. Sized from `perCall`, the
 * tokens a call took in Step 2 (callTokens), never under STEP4_TOKENS_PER_CALL. The minute alone never refuses it (review
 * planner-quota-5: right after Step 3's 72 calls back to back it was always full); cooling does.
 */
export function ledgerCheck(room: { ok: boolean; why?: string | null; left: { rpd: number; tpd: number } }, n: number, perCall?: number | null): { ok: boolean; line: string } {
  const each = Math.max(STEP4_TOKENS_PER_CALL, Math.ceil(perCall ?? 0));
  const needR = n * STEP4_REQUESTS_PER_SENTENCE, needT = needR * each;
  const blocked = !room.ok && !MINUTE.has(room.why ?? "");
  const ok = !blocked && room.left.rpd >= needR && room.left.tpd >= needT;
  const sized = `${n} sentences x ${STEP4_REQUESTS_PER_SENTENCE} calls x ${each} tokens`;
  return { ok, line: ok ? `the ledger holds the run (${needR} requests and ${needT} tokens: ${sized})`
    : blocked && room.why ? `not started: the ledger has Claude ${room.why === "cooling" ? "resting after a refusal or a 429 (cooling)" : `out of room (${room.why})`}`
    : `not started: the ledger's Claude day has ${room.left.rpd} requests and ${room.left.tpd} tokens left; the run needs ${needR} and ${needT} (${sized})` };
}

/**
 * Points the shared ledger at a fresh temporary folder of the check's own (THUNAI_DIR, returned) and reopens it there, so the check's
 * calls never count against Jarvis's Claude day in data/thunai/ledger.sqlite, and Step 4, given one of its own, starts on a whole
 * day that Steps 1-3 did not take (review planner-quota-5). The check's spend has its own cap (Spend, US$0.50). The one file here.
 */
export function ownLedger(step: string, root: string = os.tmpdir()): string {
  const dir = fs.mkdtempSync(path.join(root, `jv-deploy-${step}-`));
  process.env.THUNAI_DIR = dir;
  resetLedger();
  return dir;
}

/** the command the brief gives for this build's final Groq live-60 (JARVIS_V5_BUILD_2.md 11.3, day 2) */
export const V5_FINAL_COMMAND = "HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=v5final";
/**
 * The Groq live-60 files Step 4 may pair against, in order. holdout.live.ts writes `${HOLDOUT_TAG}-planner-${HOLDOUT_SET}.json`, so
 * the brief's command writes v5final-planner-live60.json (review planner-quota-4, evaluation-honesty-1); the name this check looked
 * for at first (tag v5final-groq) and the brief's name for the first of its three repeats (v5final-r1) are this build's run too.
 * v4's run (v4 code, 15 Nov) comes last.
 */
export const LIVE_BASELINES: readonly { name: string; which: "v5final" | "v4final" }[] = [
  { name: "v5final-planner-live60.json", which: "v5final" },
  { name: "v5final-groq-planner-live60.json", which: "v5final" },
  { name: "v5final-r1-planner-live60.json", which: "v5final" },
  { name: "v4final-groq-planner-live60.json", which: "v4final" }
];

/** A live runner's result file that is a finished run: rows, and neither cut off (`partial`) nor refused by its ledger check. */
export function finishedRun(j: unknown): boolean {
  if (!j || typeof j !== "object") return false;
  const x = j as { rows?: unknown; partial?: unknown; refused?: unknown };
  return Array.isArray(x.rows) && x.rows.length > 0 && !x.partial && !x.refused;
}

/**
 * This build's final Groq live-60 file if there is a finished one, else v4's: the file, its name and which run it is. `note` says
 * why, whenever it is not this build's run (the v5 file is missing, or there but not a finished run). null: none.
 */
export function liveBaseline(dir: string, exists: (file: string) => boolean, finished: (file: string) => boolean = () => true):
  { file: string; name: string; which: "v5final" | "v4final"; note: string | null } | null {
  const passedOver: string[] = [];
  for (const { name, which } of LIVE_BASELINES) {
    const file = path.join(dir, name);
    if (!exists(file)) continue;
    if (!finished(file)) { passedOver.push(name); continue; }
    const v5 = LIVE_BASELINES[0].name;
    const why = passedOver.length ? `${passedOver.join(" and ")} ${passedOver.length > 1 ? "are" : "is"} there but not a finished run (cut off, or refused)` : `${v5} is not in ${dir}`;
    const note = which === "v5final" && !passedOver.length ? null
      : which === "v5final" ? `${why}: paired against ${name}, this build's run all the same`
      : `${why}: Haiku is paired against v4's Groq run (${name}, v4 code), not this build's. For the comparison A6 asks for, run this build's final Groq live-60 first (${V5_FINAL_COMMAND}, which writes ${v5}), then this check again`;
    return { file, name, which, note };
  }
  return null;
}
