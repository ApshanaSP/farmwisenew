/**
 * How many online complaints one account, and one address, may file (QA pass 6, hunt2-sec-12). Each filing is a classifier call (paid, when
 * a model key is set), a dataset append and a case on a department's list, and nothing limited them. A citizen files one complaint, a few
 * on a bad day: 10 in an hour or 30 in a day is far past that, and stops a script. The address's limit is for many accounts from one place.
 * Each try counts, before the body is read.
 *
 * A try counts in all three limits or in none (reviewerE-01): counted in each limit still under its own, the tries an account's limit
 * refused filled the address everyone behind it shares, and the tries a busy address refused used up each citizen's own hour.
 *
 * With no trusted proxy (TRUST_PROXY_HOPS unset) every client is the one address "direct", so a limit on it is a limit on the whole
 * district: one script with a few dozen accounts, or a monsoon day's normal filings, would stop every citizen from filing. There the
 * address limit is not applied. In its place, in that mode only, the district has an hourly ceiling far above real volume, so cheap
 * accounts (register allows about 400 an hour from "direct", email verification off) cannot multiply the per-account limit without end
 * (reviewerG-06: about 4,000 paid classifier calls an hour). Its refusal says the site is busy, not that the account filed too many.
 */
import { checkRateLimits, getClientIp, giveBackTry, type LimitCheck, type RateLimitResult } from "@/lib/rate-limit";

export const COMPLAINTS_PER_HOUR = 10;
export const COMPLAINTS_PER_DAY = 30;
export const COMPLAINTS_PER_IP_HOUR = 30;
/**
 * The district-wide ceiling with no trusted proxy: complaints filed online in any one hour, all accounts together. The busiest hour in the
 * grievance dataset (data/datasets/grievances.csv, "Filed On", 16,287 filings, Mar-Nov 2026) holds 19 filings (2026-09-21 18:00; the
 * busiest day 163); 5 times that is 95, so the floor of 1,000 decides: about 50 times the busiest hour on record, reached only by a script.
 */
export const COMPLAINTS_DISTRICT_PER_HOUR = 1000;

/** Which limit refused a try: the citizen's own account's, the address's they share with others, or the district's hourly ceiling. */
export type ComplaintLimitHit = "account" | "address" | "district";
export type ComplaintTry = RateLimitResult & { by?: ComplaintLimitHit };

const ACCOUNT_CHECKS = 2;
function checks(userId: number, ip: string): LimitCheck[] {
  const all: LimitCheck[] = [
    { key: `complaint-file:${userId}`, limit: COMPLAINTS_PER_HOUR, windowSeconds: 3600 },
    { key: `complaint-file-day:${userId}`, limit: COMPLAINTS_PER_DAY, windowSeconds: 86_400 }
  ];
  if (ip !== "direct") all.push({ key: `complaint-file-ip:${ip}`, limit: COMPLAINTS_PER_IP_HOUR, windowSeconds: 3600 });
  else all.push({ key: "complaint-file-district", limit: COMPLAINTS_DISTRICT_PER_HOUR, windowSeconds: 3600 });
  return all;
}

/** Counts one try to file for this account and address; `allowed` false (with the wait, and which limit) once any limit is met. */
export function complaintTry(userId: number, headers: Headers): ComplaintTry {
  const ip = getClientIp(headers);
  const r = checkRateLimits(checks(userId, ip));
  if (r.allowed) return { allowed: true };
  return { allowed: false, retryAfterSeconds: r.retryAfterSeconds,
    by: (r.refusedBy ?? 0) < ACCOUNT_CHECKS ? "account" : ip === "direct" ? "district" : "address" };
}

/** The refusal in words: a citizen refused by a limit others share (their address, the district) is not told their own account filed too many. */
export function complaintLimitMessage(by: ComplaintLimitHit | undefined): string {
  return by === "district"
    ? "The site is very busy just now, with many complaints being filed across the district. Please try again in a little while."
    : by === "address"
      ? "Many complaints have been filed from your network just now. Please try again in a little while."
      : "Too many complaints from this account just now. Please try again later.";
}

/** A try that filed nothing new (the same complaint sent twice by a double click) is given back to every limit it counted in. */
export function giveBackComplaintTry(userId: number, headers: Headers): void {
  for (const c of checks(userId, getClientIp(headers))) giveBackTry(c.key);
}
