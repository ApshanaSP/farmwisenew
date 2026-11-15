/**
 * Paired comparison of two result files on the same frozen sentences (v5 build, 6.3 and 11.1): only n, b, c and the exact p
 * (and mid-p) leave this module. Never ids, gold, got or text: the sets stay frozen and unread.
 *
 * A result file is what the live runners write: { summary?: { all?: { right } }, rows: [{ id, ok, capacity?, model? }] }.
 */
import fs from "fs";
import { mcnemar, pairs } from "./evalstats";

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
