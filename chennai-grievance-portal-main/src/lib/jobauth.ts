/**
 * Authorisation for scheduled jobs (POST /api/collector/jobs/*): the caller sends the team's REFRESH_API_KEY in the
 * `x-job-key` header. Compared in constant time over SHA-256 digests, so neither the key's length nor its content
 * leaks through timing. With no key configured on the server, every request is refused.
 */
import { createHash, timingSafeEqual } from "crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function jobKeyOk(supplied: string | null | undefined, expected: string | null | undefined = process.env.REFRESH_API_KEY): boolean {
  const want = (expected ?? "").trim();
  const got = (supplied ?? "").trim();
  if (!want || !got) return false;
  return timingSafeEqual(digest(got), digest(want));
}
