// Simple in-memory rate limiter (per server process). Good enough for a
// single-instance deployment / local development. For a multi-instance
// production deployment, back this with Redis instead.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
// expired buckets are dropped once the map grows, so one-off keys (an IP per request) cannot fill the memory
const SWEEP_AT = 10_000;

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * @param key unique key, e.g. `login:{email}` or `login:{ip}`
 * @param limit max attempts allowed within the window
 * @param windowSeconds window size in seconds
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size >= SWEEP_AT) sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true };
}

export interface LimitCheck {
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * One try against several limits, all or nothing: every limit is looked at first, and the try counts in all of them only when all
 * allow it. Counting it in each limit still under its own (checkRateLimit on each in turn) let tries one limit refused fill the
 * others: one account's refused tries filled the address everyone shares (QA fix-all, reviewerE-01). `refusedBy` is the index of
 * the first limit that refused; the wait is the longest of the limits that refused.
 */
export function checkRateLimits(checks: LimitCheck[]): RateLimitResult & { refusedBy?: number } {
  const now = Date.now();
  if (buckets.size >= SWEEP_AT) sweep(now);
  let refusedBy: number | undefined;
  let wait = 0;
  checks.forEach((c, i) => {
    const b = buckets.get(c.key);
    if (!b || b.resetAt < now || b.count < c.limit) return;
    refusedBy ??= i;
    wait = Math.max(wait, Math.ceil((b.resetAt - now) / 1000));
  });
  if (refusedBy !== undefined) return { allowed: false, retryAfterSeconds: wait, refusedBy };
  for (const c of checks) checkRateLimit(c.key, c.limit, c.windowSeconds);
  return { allowed: true };
}

/**
 * Counting failures only (wrong second-step codes): `failuresOver` says whether `key` already has `limit` failures in
 * its window, without adding one; `addFailure` adds one; `clearFailures` forgets them after a success.
 */
export function failuresOver(key: string, limit: number): RateLimitResult {
  const b = buckets.get(key);
  if (!b || b.resetAt < Date.now()) return { allowed: true };
  return b.count >= limit ? { allowed: false, retryAfterSeconds: Math.ceil((b.resetAt - Date.now()) / 1000) } : { allowed: true };
}
export function addFailure(key: string, windowSeconds: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
  else b.count += 1;
}
/** Gives back one try counted by checkRateLimit, when the try turned out not to be one that should count (a right answer). */
export function giveBackTry(key: string): void {
  const b = buckets.get(key);
  if (b && b.resetAt >= Date.now() && b.count > 0) b.count -= 1;
}
export function clearFailures(key: string): void {
  buckets.delete(key);
}

/**
 * The client's address for per-IP limits. X-Forwarded-For is written by the client too, so it is read only behind
 * proxies the server trusts: TRUST_PROXY_HOPS=n (n proxies in front, each appending the address it saw) takes the n-th
 * entry from the right, the first one a trusted proxy wrote. Without it the headers are ignored (a client used to send a
 * fresh fake address each time and never meet the sign-in limit) and all direct clients share one bucket.
 */
export function getClientIp(headers: Headers): string {
  const hops = Math.max(0, Math.floor(Number(process.env.TRUST_PROXY_HOPS) || 0));
  if (!hops) return "direct";
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (chain.length >= hops) return chain[chain.length - hops];
  // fewer entries than proxies: the nearest proxy's own header, else the left-most entry it passed on
  return headers.get("x-real-ip")?.trim() || chain[0] || "direct";
}

/**
 * A per-IP limit for `ip`: the shared "direct" bucket (no trusted proxy configured) holds every client at once, so it gets
 * ten times the allowance; it still stops a burst from one script without locking out everyone else.
 */
export function ipLimit(ip: string, limit: number): number {
  return ip === "direct" ? limit * 10 : limit;
}
