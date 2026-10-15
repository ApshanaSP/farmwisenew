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
