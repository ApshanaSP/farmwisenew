/**
 * How many online complaints one account, and one address, may file (QA pass 6, hunt2-sec-12). Each filing is a classifier call (paid, when
 * a model key is set), a dataset append and a case on a department's list, and nothing limited them. A citizen files one complaint, a few
 * on a bad day: 10 in an hour or 30 in a day is far past that, and stops a script. The address's limit is for many accounts from one place
 * (the shared "direct" bucket, with no trusted proxy, gets ten times it: rate-limit.ts ipLimit). Each try counts, before the body is read.
 */
import { checkRateLimit, getClientIp, giveBackTry, ipLimit, type RateLimitResult } from "@/lib/rate-limit";

export const COMPLAINTS_PER_HOUR = 10;
export const COMPLAINTS_PER_DAY = 30;
export const COMPLAINTS_PER_IP_HOUR = 30;

const keys = (userId: number) => [`complaint-file:${userId}`, `complaint-file-day:${userId}`];

/** Counts one try to file for this account and address; `allowed` false (with the wait) once any of the three limits is met. */
export function complaintTry(userId: number, headers: Headers): RateLimitResult {
  const ip = getClientIp(headers);
  const [hour, day] = keys(userId);
  for (const r of [checkRateLimit(hour, COMPLAINTS_PER_HOUR, 3600), checkRateLimit(day, COMPLAINTS_PER_DAY, 86_400),
    checkRateLimit(`complaint-file-ip:${ip}`, ipLimit(ip, COMPLAINTS_PER_IP_HOUR), 3600)]) {
    if (!r.allowed) return r;
  }
  return { allowed: true };
}

/** A try that filed nothing new (the same complaint sent twice by a double click) is given back to the account. */
export function giveBackComplaintTry(userId: number): void {
  for (const k of keys(userId)) giveBackTry(k);
}
