/**
 * The capacity ledger: what Jarvis has spent, keyed by ORGANISATION and model, not by key. The three Groq keys are one
 * organisation, so they add no quota; a per-key view is what made earlier evaluation runs collapse.
 *
 * Server only. The store sits behind an interface: on this laptop it is node:sqlite (data/thunai/ledger.sqlite, THUNAI_DIR
 * moves it), loaded through process.getBuiltinModule because Next's bundler breaks a plain import (src/lib/aws/store.ts has
 * the same pattern), opened lazily and never at import time. A hosted deployment needs a different store; a memory store
 * takes over when sqlite cannot open (read-only disk, an old Node), and tests use it directly.
 *
 * The limits are defaults. Groq's are from its rate-limit page and live response headers; Gemini's free-tier numbers are
 * not published outside AI Studio, so they are starting values that observed 429s override (cool()).
 */
import fs from "fs";
import path from "path";
import type { DatabaseSync as DB } from "node:sqlite";

export type Org = "groq" | "gemini" | "bedrock" | "azure" | "anthropic";
export type Lane = "named" | "engaged" | "ambient" | "planner" | "router" | "hedge" | "tts" | "eval" | "other";

export interface Limits { rpm?: number; rpd?: number; tpm?: number; tpd?: number; ash?: number; asd?: number; minAudioS?: number }

/** Claude is paid by the token: this is Jarvis's own ceiling on a day, not Anthropic's limit. On Opus 5.5 it comes to about US$8 at the very most */
const CLAUDE_DAY: Limits = { rpm: 50, rpd: 500, tpm: 50_000, tpd: 1_500_000 };

export const LIMITS: Record<string, Limits> = {
  "anthropic/claude-opus-5-5": CLAUDE_DAY,
  "anthropic/claude-sonnet-5-5": CLAUDE_DAY,
  "anthropic/claude-haiku-5-5": CLAUDE_DAY,
  // Groq, one organisation across all keys; x-ratelimit-limit-tokens said 8000 on the Phase 0 probe (see BUILD_LOG)
  "groq/qwen/qwen3.8-27b": { rpm: 60, rpd: 1000, tpm: 8000, tpd: 200_000 },
  "groq/openai/gpt-oss-20b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000 },
  "groq/openai/gpt-oss-120b": { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000 },
  // Whisper bills a 10 s minimum per request: 7,200 audio-s an hour is about 12 requests a minute
  "groq/whisper-large-v3": { rpm: 20, rpd: 2000, ash: 7200, asd: 28800, minAudioS: 10 },
  "groq/whisper-large-v3-turbo": { rpm: 20, rpd: 2000, ash: 7200, asd: 28800, minAudioS: 10 },
  // Gemini: unverified starting values (AI Studio shows the real ones); a 429 cools the model whatever these say
  "gemini/gemini-3.5-flash-lite": { rpm: 10, rpd: 500, tpm: 250_000 },
  "gemini/gemini-flash-lite-latest": { rpm: 10, rpd: 500, tpm: 250_000 },
  "gemini/gemini-3.6-flash": { rpm: 5, rpd: 20, tpm: 250_000 },
  "gemini/gemini-3.8-flash": { rpm: 5, rpd: 20, tpm: 250_000 },
  "gemini/gemini-3.5-flash": { rpm: 5, rpd: 20, tpm: 250_000 },
  "gemini/gemini-3.5-transcribe": { rpm: 5, rpd: 20 }, // observed: about 28 calls in a day, then 429 on all 96 that followed (Phase 0)
  "gemini/gemini-3.8-flash-lite-tts": { rpm: 3, rpd: 100 },
  "gemini/gemini-3.8-flash-tts": { rpm: 3, rpd: 100 }
};

export interface Entry { at: number; org: Org; model: string; requests: number; tokens: number; audioS: number; lane: Lane }
export interface Spent { requests: number; tokens: number; audioS: number }

export interface LedgerStore {
  add(e: Entry): void;
  sum(org: Org, model: string, since: number, lane?: Lane): Spent;
  /** every org/model/lane line since a time (for reports) */
  lines(since: number): (Entry & { n: number })[];
  setCool(org: Org, model: string, until: number): void;
  cool(org: Org, model: string): number;
}

/** model ids carry "#2" when they came from a pooled key: the same organisation's allowance all the same */
export const bareModel = (model: string) => model.split("#")[0];

export class MemoryStore implements LedgerStore {
  private rows: Entry[] = [];
  private cools = new Map<string, number>();
  add(e: Entry) { this.rows.push(e); if (this.rows.length > 20_000) this.rows.splice(0, 5_000); }
  sum(org: Org, model: string, since: number, lane?: Lane): Spent {
    const out = { requests: 0, tokens: 0, audioS: 0 };
    for (const r of this.rows) if (r.org === org && r.model === model && r.at >= since && (!lane || r.lane === lane)) { out.requests += r.requests; out.tokens += r.tokens; out.audioS += r.audioS; }
    return out;
  }
  lines(since: number) {
    const m = new Map<string, Entry & { n: number }>();
    for (const r of this.rows) {
      if (r.at < since) continue;
      const k = `${r.org}|${r.model}|${r.lane}`, x = m.get(k);
      if (x) { x.requests += r.requests; x.tokens += r.tokens; x.audioS += r.audioS; x.n++; } else m.set(k, { ...r, n: 1 });
    }
    return [...m.values()];
  }
  setCool(org: Org, model: string, until: number) { this.cools.set(`${org}/${model}`, until); }
  cool(org: Org, model: string) { return this.cools.get(`${org}/${model}`) ?? 0; }
}

const DAY = 86_400_000;

class SqliteStore implements LedgerStore {
  constructor(private db: DB) {
    db.exec(`CREATE TABLE IF NOT EXISTS spend (at INTEGER, org TEXT, model TEXT, requests INTEGER, tokens INTEGER, audio_s REAL, lane TEXT);
      CREATE INDEX IF NOT EXISTS spend_key ON spend (org, model, at);
      CREATE TABLE IF NOT EXISTS cool (org TEXT, model TEXT, until INTEGER, PRIMARY KEY (org, model));`);
    db.prepare("DELETE FROM spend WHERE at < ?").run(Date.now() - 3 * DAY);
  }
  add(e: Entry) { this.db.prepare("INSERT INTO spend VALUES (?,?,?,?,?,?,?)").run(e.at, e.org, e.model, e.requests, e.tokens, e.audioS, e.lane); }
  sum(org: Org, model: string, since: number, lane?: Lane): Spent {
    const q = lane
      ? this.db.prepare("SELECT COALESCE(SUM(requests),0) r, COALESCE(SUM(tokens),0) t, COALESCE(SUM(audio_s),0) a FROM spend WHERE org=? AND model=? AND at>=? AND lane=?").get(org, model, since, lane)
      : this.db.prepare("SELECT COALESCE(SUM(requests),0) r, COALESCE(SUM(tokens),0) t, COALESCE(SUM(audio_s),0) a FROM spend WHERE org=? AND model=? AND at>=?").get(org, model, since);
    const x = q as { r: number; t: number; a: number };
    return { requests: x.r, tokens: x.t, audioS: x.a };
  }
  lines(since: number) {
    const rows = this.db.prepare("SELECT org, model, lane, COALESCE(SUM(requests),0) requests, COALESCE(SUM(tokens),0) tokens, COALESCE(SUM(audio_s),0) audioS, COUNT(*) n FROM spend WHERE at>=? GROUP BY org, model, lane").all(since);
    return (rows as unknown as (Omit<Entry, "at"> & { n: number })[]).map((r) => ({ ...r, at: since }));
  }
  setCool(org: Org, model: string, until: number) { this.db.prepare("INSERT OR REPLACE INTO cool VALUES (?,?,?)").run(org, model, until); }
  cool(org: Org, model: string) {
    const r = this.db.prepare("SELECT until FROM cool WHERE org=? AND model=?").get(org, model) as { until: number } | undefined;
    return r?.until ?? 0;
  }
}

function openSqlite(): LedgerStore | null {
  try {
    const dir = process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");
    fs.mkdirSync(dir, { recursive: true });
    const sqlite = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
    if (!sqlite) return null;
    const db = new sqlite.DatabaseSync(path.join(dir, "ledger.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000;");
    return new SqliteStore(db);
  } catch (e) {
    console.warn(`[ledger] sqlite not available, keeping the ledger in memory: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

export interface Room { ok: boolean; why: string | null; left: { rpm: number; rpd: number; tpm: number; tpd: number; ash: number; asd: number }; frac: number }

export class Ledger {
  private store: LedgerStore | null;
  constructor(store?: LedgerStore, private clock: () => number = Date.now, private limits: Record<string, Limits> = LIMITS) { this.store = store ?? null; }
  private s(): LedgerStore {
    if (!this.store) this.store = openSqlite() ?? new MemoryStore();
    return this.store;
  }
  limit(org: Org, model: string): Limits { return this.limits[`${org}/${bareModel(model)}`] ?? {}; }

  /** One call's spend. A Whisper request is billed at least its minimum (10 s), whatever the clip's length. */
  record(org: Org, model: string, u: { tokens?: number; audioS?: number; lane?: Lane; requests?: number } = {}) {
    const m = bareModel(model), min = this.limit(org, m).minAudioS ?? 0;
    const audioS = u.audioS != null ? Math.max(min, u.audioS) : 0;
    try { this.s().add({ at: this.clock(), org, model: m, requests: u.requests ?? 1, tokens: u.tokens ?? 0, audioS, lane: u.lane ?? "other" }); }
    catch (e) { console.warn(`[ledger] not recorded: ${(e as Error).message.slice(0, 120)}`); }
  }

  /** A 429 (or an observed limit): this model is not asked until the time given, whatever the table says. */
  cool(org: Org, model: string, ms: number) { try { this.s().setCool(org, bareModel(model), this.clock() + ms); } catch { /* not kept */ } }
  coolingUntil(org: Org, model: string): number { try { return this.s().cool(org, bareModel(model)); } catch { return 0; } }

  spent(org: Org, model: string, windowMs: number, lane?: Lane): Spent {
    try { return this.s().sum(org, bareModel(model), this.clock() - windowMs, lane); } catch { return { requests: 0, tokens: 0, audioS: 0 }; }
  }

  /**
   * Can this call go? `need` is its estimate. `frac` is how much of the tightest minute budget would be left after it
   * (a hedge goes only when frac >= 0.4). Unknown models are not limited here.
   */
  room(org: Org, model: string, need: { tokens?: number; audioS?: number } = {}): Room {
    const l = this.limit(org, model), now = this.clock();
    const left = { rpm: Infinity, rpd: Infinity, tpm: Infinity, tpd: Infinity, ash: Infinity, asd: Infinity };
    const min = this.spent(org, model, 60_000), hour = this.spent(org, model, 3_600_000), day = this.spent(org, model, DAY);
    const tok = need.tokens ?? 0, audio = need.audioS != null ? Math.max(l.minAudioS ?? 0, need.audioS) : 0;
    if (l.rpm != null) left.rpm = l.rpm - min.requests;
    if (l.rpd != null) left.rpd = l.rpd - day.requests;
    if (l.tpm != null) left.tpm = l.tpm - min.tokens;
    if (l.tpd != null) left.tpd = l.tpd - day.tokens;
    if (l.ash != null) left.ash = l.ash - hour.audioS;
    if (l.asd != null) left.asd = l.asd - day.audioS;
    const fracOf = (rest: number, cap?: number) => (cap ? Math.max(0, rest) / cap : 1);
    const frac = Math.min(fracOf(left.rpm - 1, l.rpm), fracOf(left.tpm - tok, l.tpm), fracOf(left.ash - audio, l.ash));
    let why: string | null = null;
    if (this.coolingUntil(org, model) > now) why = "cooling";
    else if (left.rpm < 1) why = "rpm";
    else if (left.rpd < 1) why = "rpd";
    else if (tok > left.tpm) why = "tpm";
    else if (tok > left.tpd) why = "tpd";
    else if (audio > left.ash) why = "ash";
    else if (audio > left.asd) why = "asd";
    return { ok: !why, why, left, frac };
  }

  report(windowMs = DAY) { try { return this.s().lines(this.clock() - windowMs); } catch { return []; } }
}

let shared: Ledger | null = null;
/** The one ledger on this server (lazy: nothing opens until the first call). */
export const ledger = () => (shared ??= new Ledger());
