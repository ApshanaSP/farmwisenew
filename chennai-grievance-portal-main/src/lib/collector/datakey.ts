/**
 * v12 (21 Nov): what the console's slow reads (insights, the overview behind Jarvis's tools) are kept by: the data's own version and the
 * data epoch, plus a bucket of the clock (one minute in v12, five since v13), instead of the console's "now" (asOf), which moves every 30 s.
 *
 * Why: every cache keyed on asOf missed after any 30 s pause, so the warm-up never helped and each cold insights() held the thread for
 * about 3.5 s (the report, first-question-latency RC2). The version is the hourly build's id (exportMeta build_id, else exported_at); the
 * epoch moves on every write that changes a figure (a decision, an officer step, a case filed, a live reading, a new build: epoch.ts and
 * store.ts), so a change made through this server is never answered from an older copy. The bucket bounds how far the time windows
 * (the week back from now, what is past its deadline) may lag the clock; the desk's day (lib/period/day.ts) is in the key, so a copy of
 * yesterday's Daily is never served after the day rolls over at 6 AM.
 *
 * keptRead also answers at once from the last minute or two's settled copy while the current minute's is worked out (stale while
 * revalidate), only for the same version and epoch: a question never waits for a recompute that only the clock asked for. Server only.
 * Kept on globalThis: the server's start-up code (instrumentation, Jarvis's keep-warm) and the routes load their own copies of a module.
 */
import { dataEpoch } from "@/lib/collector/epoch";
import { dayKey, istClock } from "@/lib/period/day";
import { inBackground } from "@/lib/util/background";

/**
 * the clock's bucket, ms: a kept read is recomputed at most once a bucket while it is asked for. v13 (review finding 0-1): 5 minutes, not
 * one. The keep-warm ticks every 75 s, so with one-minute buckets every tick missed and worked out the district's daily and weekly insights
 * again (about 34 queries plus two overviews) for as long as a console stayed open. A change of the data never waits for the bucket: a
 * write through this server, a new build and (v13) the durable reload all move the epoch, which is in the key.
 */
export const BUCKET_MS = 5 * 60_000;
/** how many earlier buckets a settled copy may answer from while the current one is worked out (v13: one, so at most 10 minutes behind the clock) */
export const BACK_BUCKETS = 1;
/** the data's version is read again at most this often within one epoch (a store without a swap event, MySQL, still moves on) */
export const VERSION_MS = 60_000;

export const bucketOf = (at: number = Date.now()): number => Math.floor(at / BUCKET_MS);

declare global {
  // eslint-disable-next-line no-var
  var __diqDataVersion: { epoch: number; at: number; v: Promise<string> } | undefined;
}

/**
 * The data's version: the build's id (or its export time), read once per epoch and at most once a minute otherwise (a store without a
 * swap event, MySQL, still moves on). "" when it cannot be read: the epoch and the bucket still key the copy.
 */
export function dataVersion(read?: () => Promise<Record<string, string>>): Promise<string> {
  const e = dataEpoch(), held = globalThis.__diqDataVersion;
  if (held && held.epoch === e && Date.now() - held.at < VERSION_MS) return held.v;
  const meta = read ?? (() => import("@/lib/collector/intel").then((m) => m.exportMeta()));
  const v = meta().then((m) => String(m.build_id ?? m.exported_at ?? ""), () => "");
  globalThis.__diqDataVersion = { epoch: e, at: Date.now(), v };
  return v;
}

/** The version, the epoch and the desk's day, as one key part ("build-2026-11-21T06|42|2026-11-21"). */
export async function dataKey(read?: () => Promise<Record<string, string>>): Promise<string> {
  return `${await dataVersion(read)}|${dataEpoch()}|${dayKey(istClock())}`;
}

export interface Kept<T> { at: number; bucket: number; p: Promise<T>; done: boolean }

/**
 * One read kept by `base` (its scope and dataKey) and the clock's bucket. The current bucket's copy when it is settled; else, while it is
 * worked out, a settled copy of the same base from the last BACK_BUCKETS buckets, at once; else the current one, waited for. A failed
 * read is not kept. `cache` holds at most `max` entries; older buckets are let go.
 */
export function keptRead<T>(cache: Map<string, Kept<T>>, base: string, run: () => Promise<T>, o: { max?: number; now?: number; /** the current bucket's copy, waited for (a warm-up that must finish before its next step) */ fresh?: boolean } = {}): Promise<T> {
  const now = o.now ?? Date.now();
  const b = bucketOf(now);
  const key = `${base}|${b}`;
  let hit = cache.get(key);
  if (!hit) {
    // v13 (review finding 0-0): when a settled earlier copy will answer this caller, nobody waits for the new one, so it is worked out as
    // background work: its store statements queue behind every request's own (aws/store.ts queryTurn)
    const swr = !o.fresh && settledBefore(cache, base, b) !== null;
    const entry: Kept<T> = { at: now, bucket: b, p: swr ? inBackground(run) : run(), done: false };
    hit = entry;
    cache.set(key, entry);
    entry.p.then(() => { entry.done = true; }, () => { if (cache.get(key) === entry) cache.delete(key); });
    for (const [k, v] of cache) if (v.bucket < b - BACK_BUCKETS) cache.delete(k);
    const max = o.max ?? 60;
    if (cache.size > max) for (const k of [...cache.keys()].slice(0, cache.size - max)) if (k !== key) cache.delete(k);
  }
  if (hit.done || o.fresh) return hit.p;
  return settledBefore(cache, base, b)?.p ?? hit.p;
}

/** the newest settled copy of `base` from the BACK_BUCKETS buckets before `b`, or null */
function settledBefore<T>(cache: Map<string, Kept<T>>, base: string, b: number): Kept<T> | null {
  for (let k = 1; k <= BACK_BUCKETS; k++) {
    const old = cache.get(`${base}|${b - k}`);
    if (old?.done) return old;
  }
  return null;
}
