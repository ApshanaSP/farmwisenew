/**
 * Paired comparison of two result files on the same frozen sentences (v5 build, 6.3 and 11.1): only n, b, c and the exact p
 * (and mid-p) leave this module. Never ids, gold, got or text: the sets stay frozen and unread.
 *
 * A result file is what the live runners write: { summary?: { all?: { right } }, rows: [{ id, ok, capacity?, model? }] }.
 */
import fs from "fs";
import { majority3, mcnemar, pairs, passK } from "./evalstats";

export interface ResultRow { id: string; ok: boolean; capacity?: boolean; model?: string | null }

/** The rows of a result file (only the fields the pairing needs). */
export function resultRows(file: string): ResultRow[] {
  const j = JSON.parse(fs.readFileSync(file, "utf8")) as { rows?: { id: string; ok: boolean; capacity?: boolean; model?: string | null }[] };
  if (!Array.isArray(j.rows)) throw new Error("not a result file: no rows");
  return j.rows.map((r) => ({ id: String(r.id), ok: !!r.ok, capacity: !!r.capacity, model: r.model ?? null }));
}

/** The total right in a file: its summary when it has one, else counted from its rows. */
export function resultTotal(file: string): number {
  const j = JSON.parse(fs.readFileSync(file, "utf8")) as { summary?: { all?: { right?: number } }; rows?: { ok: boolean }[] };
  return j.summary?.all?.right ?? (j.rows ?? []).filter((r) => r.ok).length;
}

export interface PairOut { n: number; b: number; c: number; p: number; midP: number; capacityX: number; capacityY: number }

/** b = right only in X, c = right only in Y, on the same sentences; capacity failures counted as wrong and reported as counts. */
export function pairRows(x: ResultRow[], y: ResultRow[]): PairOut {
  const pr = pairs(x, y);
  const m = mcnemar(pr.b, pr.c);
  return { n: pr.n, b: pr.b, c: pr.c, p: m.p, midP: m.midP, capacityX: x.filter((r) => r.capacity).length, capacityY: y.filter((r) => r.capacity).length };
}

/** How many rows each model answered (counts only). Rows with no model are "none". */
export function modelCounts(rows: ResultRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = r.model ?? "none"; out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/** A seeded subset of ids (mulberry32 shuffle, first n): the 11.3 fallback repeats take 20 of the live-60 this way. Ids are never printed. */
export function seededIds(ids: string[], n: number, seed: number): string[] {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const x = [...ids];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x.slice(0, n);
}

export interface RepeatStats { n: number; pass1: number; pass3: number; majority: number; rightAll: number; rightOnce: number; capacityRows: number }

/** pass^1, pass^3 and the majority of three runs of the same sentences (rows matched by id; a capacity failure counts as wrong). */
export function repeatStats(runs: ResultRow[][]): RepeatStats {
  if (runs.length !== 3) throw new Error("repeatStats: three runs");
  const ids = runs[0].map((r) => r.id);
  for (const run of runs) if (run.length !== ids.length || run.some((r) => !ids.includes(r.id))) throw new Error("repeatStats: the runs are not on the same sentences");
  const okOf = (run: ResultRow[], id: string) => { const r = run.find((x) => x.id === id)!; return r.ok && !r.capacity; };
  const counts = ids.map((id) => runs.filter((run) => okOf(run, id)).length);
  const maj = majority3(runs.map((run) => ids.map((id) => okOf(run, id))));
  return { n: ids.length, pass1: passK(counts, 3, 1), pass3: passK(counts, 3, 3), majority: maj.right, rightAll: counts.filter((c) => c === 3).length, rightOnce: counts.filter((c) => c >= 1).length,
    capacityRows: runs.reduce((a, run) => a + run.filter((r) => r.capacity).length, 0) };
}
