/**
 * v6: the owner's ceiling on Claude API spend (17 Nov 2026: "use the Claude key in .env, but no more than $5; if it crosses that, change to
 * Groq"). Every billed Claude response, from any caller (Jarvis's planner, the warm-up, a console step), adds its cost to one small record
 * shared by every process on this machine: JARVIS_CLAUDE_BUDGET_FILE, default data/thunai/claude-budget.sqlite (node:sqlite, loaded as
 * ledger.ts does; a memory record where sqlite cannot open). The ceiling is JARVIS_CLAUDE_BUDGET_USD (default 5; 0 or a negative value means
 * no Claude call at all). A call is allowed only while the total is below the ceiling minus one call's worst case (CALL_MARGIN_USD), so no
 * call can carry the total past it; past that, claudeConfigured() says no and every caller goes on to Groq, as with no key.
 * Prices: US$ a million tokens, from the platform pricing table (claude-api skill, cached 3 Nov 2026): Haiku 5.5 0.10 in / 0.50 out, cache
 * write 0.125, cache read 0.01 (as deploycheck.ts); Sonnet 5.5 2 / 10; Opus 5.5 4 / 20; an unknown model is priced as Opus 5.5.
 * Counts and dollars only: never a prompt, a reply or a key.
 */
import fs from "fs";
import path from "path";
import type { DatabaseSync as DB } from "node:sqlite";

export interface ClaudeUsage { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICES: [RegExp, Price][] = [
  [/haiku-5-5/, { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 }],
  [/sonnet-5-5/, { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 }],
  [/opus-5-5/, { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }]
];
const OPUS: Price = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
export const priceOf = (model: string): Price => PRICES.find(([re]) => re.test(model))?.[1] ?? OPUS;
/** One response's cost, US$ (input_tokens is the uncached part; cache reads and writes are billed apart). */
export function costOf(model: string, u: ClaudeUsage): number {
  const p = priceOf(model);
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead) / 1e6;
}
/** the most one call may cost, kept below the ceiling (a large console step on Opus 5.5 is well under it) */
export const CALL_MARGIN_USD = 0.25;
export function budgetUsd(v: string | undefined = process.env.JARVIS_CLAUDE_BUDGET_USD): number {
  if (v == null || v.trim() === "") return 5;
  const n = Number(v);
  return Number.isFinite(n) ? n : 5;
}

interface Store { add(at: number, model: string, usd: number): void; total(): number; shared: boolean }
/** no shared record could be opened: it counts, but the ceiling treats it as closed (a restart would start it again at $0) */
class MemoryStore implements Store {
  private sum = 0;
  readonly shared = false;
  add(_at: number, _model: string, usd: number) { this.sum += usd; }
  total() { return this.sum; }
}
class SqliteStore implements Store {
  readonly shared = true;
  constructor(private db: DB) { db.exec("CREATE TABLE IF NOT EXISTS spend (at INTEGER, model TEXT, usd REAL)"); }
  add(at: number, model: string, usd: number) { this.db.prepare("INSERT INTO spend VALUES (?,?,?)").run(at, model, usd); }
  total() { return Number((this.db.prepare("SELECT COALESCE(SUM(usd),0) s FROM spend").get() as { s: number }).s) || 0; }
}
declare global {
  // eslint-disable-next-line no-var
  var __claudeBudget: { file: string; store: Store } | undefined;
}
const fileOf = () => process.env.JARVIS_CLAUDE_BUDGET_FILE || path.join(process.cwd(), "data", "thunai", "claude-budget.sqlite");
function store(): Store {
  const file = fileOf();
  if (global.__claudeBudget?.file === file) return global.__claudeBudget.store;
  let s: Store;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
    if (!sqlite) throw new Error("no node:sqlite");
    const db = new sqlite.DatabaseSync(file);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000;");
    s = new SqliteStore(db);
  } catch (e) {
    console.warn(`[claude budget] sqlite not available: no Claude call (the spend could not be kept): ${(e as Error).message.slice(0, 120)}`);
    s = new MemoryStore();
  }
  global.__claudeBudget = { file, store: s };
  return s;
}

/** What has been spent so far, US$ (every process's calls). */
export const spentUsd = (): number => store().total();
/** calls sent from this process and not yet answered: each holds one call's margin until its cost is known */
let inFlight = 0;
export const beginClaude = () => { inFlight++; };
export const endClaude = () => { inFlight = Math.max(0, inFlight - 1); };
/**
 * May another Claude call go out? Only with a shared record (one that a restart keeps: the independent check, 17 Nov, found a memory
 * record would start again at $0), and while the total, with a margin for each call in flight, stays below the ceiling minus one more.
 */
export const budgetLeft = (): boolean => store().shared && spentUsd() + inFlight * CALL_MARGIN_USD < budgetUsd() - CALL_MARGIN_USD;
/** A call's worst case when no usage came back (aborted, timed out after it was sent): its prompt in (about 3 characters a token), its whole max_tokens out. */
export function estimateUsd(model: string, promptChars: number, maxTokens: number): number {
  const p = priceOf(model);
  return (Math.ceil(Math.max(0, promptChars) / 3) * p.input + Math.max(0, maxTokens) * p.output) / 1e6;
}
/** Record a sent call that came back with no usage, at its worst case. */
export function recordEstimate(model: string, promptChars: number, maxTokens: number, at: number = Date.now()): number {
  const usd = estimateUsd(model, promptChars, maxTokens);
  if (usd > 0) store().add(at, model, usd);
  return usd;
}
/** Record one billed response; returns its cost. */
export function recordClaude(model: string, u: ClaudeUsage | null | undefined, at: number = Date.now()): number {
  if (!u) return 0;
  const usd = costOf(model, u);
  if (usd > 0) store().add(at, model, usd);
  return usd;
}
/** test hook: forget the store this process opened */
export function resetClaudeBudget() { global.__claudeBudget = undefined; inFlight = 0; }
